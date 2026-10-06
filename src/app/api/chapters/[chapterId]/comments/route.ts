import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { checkChapterAccess } from "@/lib/reading/chapter-access";
import { RewardEngine } from "@/lib/quests/reward-engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { recordContestActivity } from "@/lib/contests/activity-service";
import type { ParagraphComment, ParagraphCommentThread } from "@/lib/reading/paragraph-comments";

const BODY_MAX = 2000;
// Không mang ý nghĩa thật — app chưa có cơ chế chọn văn bản (bôi đen)
// nào, chỉ paragraph_index là cột mang ý nghĩa thật cho tính năng "bình
// luận theo đoạn". Giữ 2 cột này vì chapters.check char_end>char_start
// và cả 2 NOT NULL (bảng dùng chung shape neo với highlights, xem
// migrations/archive/20260827_add_anchored_comments.sql).
const NOMINAL_CHAR_START = 0;
const NOMINAL_CHAR_END = 1;

/** Số bình luận GỐC mỗi trang — dùng chung cho section "Bình luận chương"
 * cuối trang đọc và panel "Chú thích đoạn văn" (reply đi kèm cha, không
 * tính vào số này). Khớp với chiều cao tối đa của khung danh sách ở
 * chapter-comments-section.tsx. */
const COMMENTS_PAGE_SIZE = 8;

const COMMENT_COLUMNS = "id, user_id, paragraph_index, content, parent_comment_id, pinned_at, created_at";

type CommentRow = {
  id: string;
  user_id: string;
  paragraph_index: number | null;
  content: string;
  parent_comment_id: string | null;
  pinned_at: string | null;
  created_at: string;
};

async function toParagraphComments(
  supabase: SupabaseClient<Database>,
  rows: CommentRow[],
  viewerId: string | null
): Promise<ParagraphComment[]> {
  const authorIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = authorIds.length
    ? await supabase.from("author_public_profiles").select("id, nickname, avatar_url").in("id", authorIds)
    : { data: [] as { id: string; nickname: string; avatar_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => {
    const profile = profileById.get(r.user_id);
    return {
      id: r.id,
      paragraphIndex: r.paragraph_index,
      content: r.content,
      parentCommentId: r.parent_comment_id,
      createdAt: r.created_at,
      authorId: r.user_id,
      // Người bình luận đã xoá tài khoản là trường hợp lý thuyết (FK on
      // delete cascade lẽ ra đã xoá luôn hàng này) — fallback tên rỗng
      // thay vì crash, cùng tinh thần xử lý ở api/messages/route.ts.
      authorName: profile?.nickname ?? "Người dùng ẩn danh",
      authorAvatarUrl: profile?.avatar_url ?? null,
      isOwn: viewerId !== null && r.user_id === viewerId,
      isPinned: r.pinned_at !== null,
    };
  });
}

/** Gắn reply (cũ → mới) vào từng bình luận gốc, giữ thứ tự của `tops`. */
async function buildThreads(
  supabase: SupabaseClient<Database>,
  tops: CommentRow[],
  viewerId: string | null
): Promise<ParagraphCommentThread[] | null> {
  let replies: CommentRow[] = [];
  if (tops.length) {
    const { data, error } = await supabase
      .from("anchored_comments")
      .select(COMMENT_COLUMNS)
      .in("parent_comment_id", tops.map((t) => t.id))
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[chapter-comments] replies failed:", error);
      return null;
    }
    replies = data ?? [];
  }
  const comments = await toParagraphComments(supabase, [...tops, ...replies], viewerId);
  return comments
    .filter((c) => c.parentCommentId === null)
    .map((top) => ({ top, replies: comments.filter((c) => c.parentCommentId === top.id) }));
}

/** Viewer có phải tác giả của truyện chứa chương này (quyền ghim)? */
async function isChapterAuthor(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  viewerId: string | null
): Promise<boolean> {
  if (!viewerId) return false;
  const { data: chapter } = await supabase.from("chapters").select("book_id").eq("id", chapterId).maybeSingle();
  if (!chapter) return false;
  const { data: book } = await supabase.from("books").select("author_id").eq("id", chapter.book_id).maybeSingle();
  return book?.author_id === viewerId;
}

const listFailed = () => NextResponse.json({ error: "Không tải được bình luận." }, { status: 500 });

/**
 * GET /api/chapters/:chapterId/comments
 *
 * - Mặc định (app mobile): TOÀN BỘ bình luận THEO ĐOẠN của chương, phẳng —
 *   client tự nhóm theo paragraph_index (src/lib/reading/paragraph-comments.ts).
 * - `?scope=counts`: chỉ số bình luận (gốc + reply) mỗi đoạn — trang đọc web
 *   dùng để hiện số trên từng đoạn mà không tải nội dung bình luận.
 * - `?scope=paragraph&paragraphIndex=N&page=P`: bình luận của 1 đoạn, phân
 *   trang theo bình luận gốc (mới nhất trước) — panel "Chú thích đoạn văn".
 * - `?scope=chapter&page=P`: bình luận cho CẢ CHƯƠNG (paragraph_index NULL —
 *   section cuối trang đọc), phân trang như trên; bình luận được tác giả
 *   ghim trả riêng ở `pinned` (không nằm trong `threads`), kèm `canPin`.
 *
 * Đọc công khai (RLS "anchored comments are publicly readable" — không cần
 * đăng nhập), nhưng vẫn cần biết viewer hiện tại để gắn `isOwn` cho từng
 * bình luận (chỉ chủ mới thấy nút Xoá ở UI).
 *
 * quest_id/quest_source KHÔNG trả về/không dùng ở route này — route này
 * CHỈ phục vụ bình luận thường của người đọc, tách biệt hoàn toàn với cơ
 * chế "trả lời nhiệm vụ đọc-hiểu" (nếu sau này build, sẽ có route riêng
 * ghi 2 cột đó, và lọc chúng ra khỏi danh sách hiển thị ở đây).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId: viewerId } = auth;

  const searchParams = new URL(request.url).searchParams;
  const scope = searchParams.get("scope");
  const page = Math.max(1, Math.floor(Number(searchParams.get("page"))) || 1);

  if (scope === "counts") {
    const { data: rows, error } = await supabase
      .from("anchored_comments")
      .select("paragraph_index")
      .eq("chapter_id", chapterId)
      .is("quest_id", null)
      .not("paragraph_index", "is", null);
    if (error) {
      console.error("[chapter-comments] counts failed:", error);
      return listFailed();
    }
    const counts: Record<number, number> = {};
    for (const r of rows ?? []) {
      if (r.paragraph_index !== null) counts[r.paragraph_index] = (counts[r.paragraph_index] ?? 0) + 1;
    }
    return NextResponse.json({ counts });
  }

  if (scope === "chapter") return listChapterComments(supabase, chapterId, viewerId, page);

  if (scope === "paragraph") {
    const paragraphIndex = Number(searchParams.get("paragraphIndex"));
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
      return NextResponse.json({ error: "Thiếu vị trí đoạn văn hợp lệ." }, { status: 400 });
    }
    return listParagraphComments(supabase, chapterId, viewerId, paragraphIndex, page);
  }

  const { data: rows, error } = await supabase
    .from("anchored_comments")
    .select(COMMENT_COLUMNS)
    .eq("chapter_id", chapterId)
    .is("quest_id", null)
    .not("paragraph_index", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[chapter-comments] list failed:", error);
    return listFailed();
  }

  return NextResponse.json({ comments: await toParagraphComments(supabase, rows ?? [], viewerId) });
}

async function listParagraphComments(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  viewerId: string | null,
  paragraphIndex: number,
  page: number
) {
  const from = (page - 1) * COMMENTS_PAGE_SIZE;
  const [topsRes, totalRes] = await Promise.all([
    supabase
      .from("anchored_comments")
      .select(COMMENT_COLUMNS, { count: "exact" })
      .eq("chapter_id", chapterId)
      .is("quest_id", null)
      .eq("paragraph_index", paragraphIndex)
      .is("parent_comment_id", null)
      .order("created_at", { ascending: false })
      .range(from, from + COMMENTS_PAGE_SIZE - 1),
    supabase
      .from("anchored_comments")
      .select("id", { count: "exact", head: true })
      .eq("chapter_id", chapterId)
      .is("quest_id", null)
      .eq("paragraph_index", paragraphIndex),
  ]);
  if (topsRes.error || totalRes.error) {
    console.error("[chapter-comments] paragraph list failed:", topsRes.error ?? totalRes.error);
    return listFailed();
  }

  const threads = await buildThreads(supabase, topsRes.data ?? [], viewerId);
  if (!threads) return listFailed();

  return NextResponse.json({
    threads,
    page,
    pageSize: COMMENTS_PAGE_SIZE,
    totalThreads: topsRes.count ?? 0,
    totalComments: totalRes.count ?? 0,
  });
}

async function listChapterComments(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  viewerId: string | null,
  page: number
) {
  const from = (page - 1) * COMMENTS_PAGE_SIZE;
  const [topsRes, totalRes, pinnedRes, canPin] = await Promise.all([
    supabase
      .from("anchored_comments")
      .select(COMMENT_COLUMNS, { count: "exact" })
      .eq("chapter_id", chapterId)
      .is("quest_id", null)
      .is("paragraph_index", null)
      .is("parent_comment_id", null)
      .is("pinned_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + COMMENTS_PAGE_SIZE - 1),
    supabase
      .from("anchored_comments")
      .select("id", { count: "exact", head: true })
      .eq("chapter_id", chapterId)
      .is("quest_id", null)
      .is("paragraph_index", null),
    supabase
      .from("anchored_comments")
      .select(COMMENT_COLUMNS)
      .eq("chapter_id", chapterId)
      .not("pinned_at", "is", null)
      .maybeSingle(),
    isChapterAuthor(supabase, chapterId, viewerId),
  ]);
  if (topsRes.error || totalRes.error || pinnedRes.error) {
    console.error("[chapter-comments] chapter list failed:", topsRes.error ?? totalRes.error ?? pinnedRes.error);
    return listFailed();
  }

  const tops = topsRes.data ?? [];
  const threads = await buildThreads(supabase, pinnedRes.data ? [pinnedRes.data, ...tops] : tops, viewerId);
  if (!threads) return listFailed();
  const pinned = pinnedRes.data ? threads[0] : null;

  return NextResponse.json({
    pinned,
    threads: pinned ? threads.slice(1) : threads,
    page,
    pageSize: COMMENTS_PAGE_SIZE,
    totalThreads: topsRes.count ?? 0,
    totalComments: totalRes.count ?? 0,
    canPin,
  });
}

/**
 * POST /api/chapters/:chapterId/comments — tạo 1 bình luận theo đoạn,
 * 1 bình luận cho cả chương (`scope: "chapter"` → paragraph_index NULL),
 * hoặc 1 reply (kèm parentCommentId). Reply lồng CHỈ 1 CẤP — không cho
 * reply-vào-reply (kiểm ở đây, không phải CHECK DB — xem migration).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để bình luận." }, { status: 401 });
  }
  // Chỉ người đọc được chương mới tương tác được (trước đây nhận mọi chapterId,
  // kể cả chương khoá chưa mua hoặc chưa xuất bản) — xem src/lib/reading/chapter-access.ts.
  const access = await checkChapterAccess(supabase, userId, chapterId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Bình luận không được để trống." }, { status: 400 });
  }
  if (content.length > BODY_MAX) {
    return NextResponse.json({ error: `Bình luận tối đa ${BODY_MAX} ký tự.` }, { status: 400 });
  }

  const parentCommentId = typeof body?.parentCommentId === "string" ? body.parentCommentId : null;
  let paragraphIndex: number | null = null;
  let parentAuthorId: string | null = null;

  if (parentCommentId) {
    const { data: parent, error: parentError } = await supabase
      .from("anchored_comments")
      .select("id, chapter_id, paragraph_index, parent_comment_id, user_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    if (parentError || !parent || parent.chapter_id !== chapterId) {
      return NextResponse.json({ error: "Không tìm thấy bình luận gốc." }, { status: 404 });
    }
    if (parent.parent_comment_id !== null) {
      return NextResponse.json(
        { error: "Chỉ trả lời được bình luận gốc, không trả lời được 1 reply." },
        { status: 400 }
      );
    }
    // Copy từ cha — KHÔNG tin paragraphIndex client gửi cho reply, tránh
    // anchor lệch khỏi bình luận gốc.
    paragraphIndex = parent.paragraph_index;
    parentAuthorId = parent.user_id;
  } else if (body?.scope === "chapter") {
    paragraphIndex = null;
  } else {
    const rawParagraphIndex = Number(body?.paragraphIndex);
    if (!Number.isInteger(rawParagraphIndex) || rawParagraphIndex < 0) {
      return NextResponse.json({ error: "Thiếu vị trí đoạn văn hợp lệ." }, { status: 400 });
    }
    paragraphIndex = rawParagraphIndex;
  }

  const { data: comment, error } = await supabase
    .from("anchored_comments")
    .insert({
      user_id: userId,
      chapter_id: chapterId,
      paragraph_index: paragraphIndex,
      char_start: NOMINAL_CHAR_START,
      char_end: NOMINAL_CHAR_END,
      content,
      parent_comment_id: parentCommentId,
      // Route này CHỈ phục vụ bình luận thường — không bao giờ ghi
      // quest_id/quest_source (để dành cho tính năng trả lời nhiệm vụ
      // đọc-hiểu sau này).
    })
    .select("id, created_at")
    .single();
  if (error || !comment) {
    console.error("[chapter-comments] insert failed:", error);
    return NextResponse.json({ error: "Gửi bình luận thất bại." }, { status: 500 });
  }

  await trackCommentQuests(supabase, {
    userId,
    chapterId,
    parentCommentId,
    parentAuthorId,
    isParagraphComment: paragraphIndex !== null,
  });
  // Nhiệm vụ sự kiện cuộc thi (Slice 3.1) — chỉ tính khi chương thuộc bài dự thi của cuộc thi hôm nay.
  await recordContestActivity({ userId, event: "comment", bookId: access.chapter.book_id });

  // Trả về đủ shape ParagraphComment (kể cả tên/avatar) — UI render ngay
  // `authorName[0]` từ object này, thiếu là vỡ cả trang đọc.
  const [created] = await toParagraphComments(
    supabase,
    [{
      id: comment.id,
      user_id: userId,
      paragraph_index: paragraphIndex,
      content,
      parent_comment_id: parentCommentId,
      pinned_at: null,
      created_at: comment.created_at,
    }],
    userId
  );
  return NextResponse.json({ comment: created });
}

/**
 * Tiến trình nhiệm vụ ngày liên quan bình luận — best-effort, không ném
 * lỗi ra ngoài (mất 1 lần ghi tiến độ không nên làm hỏng việc đăng bình
 * luận). Bình luận GỐC (không phải reply) tính cho reader_comment_1 +
 * reader_paragraph_comment — 2 mã cùng tính từ 1 hành động là chủ ý (xem
 * comment trong reward-engine.ts); bình luận cả chương chỉ tính
 * reader_comment_1 ("Soi từng câu chữ" yêu cầu bình luận tại 1 đoạn). Reply chỉ tính author_interact_readers
 * khi người trả lời đúng là tác giả sách chứa chương này VÀ không tự trả
 * lời bình luận của chính mình.
 */
async function trackCommentQuests(
  supabase: SupabaseClient<Database>,
  params: {
    userId: string;
    chapterId: string;
    parentCommentId: string | null;
    parentAuthorId: string | null;
    isParagraphComment: boolean;
  }
): Promise<void> {
  if (!params.parentCommentId) {
    const taskCodes = params.isParagraphComment ? ["reader_comment_1", "reader_paragraph_comment"] : ["reader_comment_1"];
    for (const taskCode of taskCodes) {
      const result = await RewardEngine.incrementTaskProgress(supabase, { userId: params.userId, taskCode });
      if (!result.ok) console.error(`[chapter-comments] incrementTaskProgress(${taskCode}) failed:`, result.error);
    }
    return;
  }

  if (!params.parentAuthorId || params.parentAuthorId === params.userId) return;

  const { data: chapter } = await supabase.from("chapters").select("book_id").eq("id", params.chapterId).maybeSingle();
  if (!chapter) return;
  const { data: book } = await supabase.from("books").select("author_id").eq("id", chapter.book_id).maybeSingle();
  if (!book || book.author_id !== params.userId) return;

  const result = await RewardEngine.incrementTaskProgress(supabase, {
    userId: params.userId,
    taskCode: "author_interact_readers",
  });
  if (!result.ok) console.error("[chapter-comments] incrementTaskProgress(author_interact_readers) failed:", result.error);
}
