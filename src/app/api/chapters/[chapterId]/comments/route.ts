import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const BODY_MAX = 2000;
// Không mang ý nghĩa thật — app chưa có cơ chế chọn văn bản (bôi đen)
// nào, chỉ paragraph_index là cột mang ý nghĩa thật cho tính năng "bình
// luận theo đoạn". Giữ 2 cột này vì chapters.check char_end>char_start
// và cả 2 NOT NULL (bảng dùng chung shape neo với highlights, xem
// migrations/20260827_add_anchored_comments.sql).
const NOMINAL_CHAR_START = 0;
const NOMINAL_CHAR_END = 1;

/**
 * GET /api/chapters/:chapterId/comments — TOÀN BỘ bình luận của 1 chương
 * (mọi đoạn văn), 1 lần fetch khi mở trang đọc — client tự nhóm theo
 * paragraph_index (xem src/lib/reading/paragraph-comments.ts), tránh gọi
 * 1 API/đoạn. Đọc công khai (RLS "anchored comments are publicly
 * readable" — không cần đăng nhập), nhưng vẫn cần biết viewer hiện tại
 * để gắn `isOwn` cho từng bình luận (chỉ chủ mới thấy nút Xoá ở UI).
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
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);

  const { data: rows, error } = await supabase
    .from("anchored_comments")
    .select("id, user_id, paragraph_index, content, parent_comment_id, created_at")
    .eq("chapter_id", chapterId)
    .is("quest_id", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[chapter-comments] list failed:", error);
    return NextResponse.json({ error: "Không tải được bình luận." }, { status: 500 });
  }

  const authorIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  const { data: profiles } = authorIds.length
    ? await supabase.from("author_public_profiles").select("id, nickname, avatar_url").in("id", authorIds)
    : { data: [] as { id: string; nickname: string; avatar_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const comments = (rows ?? []).map((r) => {
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
    };
  });

  return NextResponse.json({ comments });
}

/**
 * POST /api/chapters/:chapterId/comments — tạo 1 bình luận theo đoạn,
 * hoặc 1 reply (kèm parentCommentId). Reply lồng CHỈ 1 CẤP — không cho
 * reply-vào-reply (kiểm ở đây, không phải CHECK DB — xem migration).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để bình luận." }, { status: 401 });
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

  if (parentCommentId) {
    const { data: parent, error: parentError } = await supabase
      .from("anchored_comments")
      .select("id, chapter_id, paragraph_index, parent_comment_id")
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

  return NextResponse.json({
    comment: {
      id: comment.id,
      paragraphIndex,
      content,
      parentCommentId,
      createdAt: comment.created_at,
      authorId: userId,
      isOwn: true,
    },
  });
}
