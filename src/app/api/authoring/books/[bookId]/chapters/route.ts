import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { MAX_DETECTED_CHAPTERS } from "@/lib/authoring/split-chapters";
import { MAX_CHAPTER_CONTENT_LENGTH as MAX_CONTENT_LENGTH } from "@/lib/authoring/chapter-limits";
import { hasAcceptedExclusivityPolicy, EXCLUSIVITY_AGREEMENT_ERROR, EXCLUSIVITY_AGREEMENT_ID } from "@/lib/authoring/exclusivity-agreement";
import { contestLockResponse } from "@/lib/contests/trigger-errors";
import { revalidatePublicBooks } from "@/lib/cache/public-data";
import { RewardEngine } from "@/lib/quests/reward-engine";

// ~4.5MB là giới hạn body thật của Vercel Route Handler (không cấu hình
// được lớn hơn) — chặn sớm ở đây bằng content-length để trả lỗi tiếng Việt
// gọn, thay vì để lộ lỗi 413 thô của platform.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

type ChapterInput = { title: string; content: string };

function isChapterInput(value: unknown): value is ChapterInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title !== "undefined" &&
    typeof (value as { content?: unknown }).content === "string" &&
    (value as { content: string }).content.length <= MAX_CONTENT_LENGTH
  );
}

/**
 * POST /api/authoring/books/:bookId/chapters — thêm 1 hoặc nhiều chương
 * vào 1 sách ĐÃ CÓ SẴN, nối tiếp order_index hiện tại. Dùng chung cho 3
 * nơi gọi: nhập bản thảo vào truyện có sẵn (nhiều chương), phần chương
 * 2..N khi nhập bản thảo tạo truyện mới (chương 1 đã tạo/patch riêng qua
 * POST /api/authoring/books + PATCH /api/authoring/chapters/:id), và nút
 * "+ Chương mới" thủ công ở trang tổng quan truyện (1 chương rỗng) — nên
 * không cần route riêng cho việc thêm 1 chương tay.
 *
 * Dùng getUserContext() (RLS thật), KHÔNG service-role — giống mọi route
 * authoring khác. RLS insert trên chapters yêu cầu book_id thuộc 1 sách
 * mà author_id = auth.uid(), nhưng SELECT trên books rộng hơn (cho phép
 * đọc sách đã published của người khác) nên vẫn phải tự kiểm author_id ở
 * đây trước khi tính order_index — không chỉ dựa RLS (giống pattern ở
 * src/app/author/[bookId]/[chapterId]/page.tsx).
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Dữ liệu gửi lên quá lớn." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const chaptersInput = Array.isArray(body?.chapters) ? body.chapters : null;

  if (!chaptersInput || chaptersInput.length === 0) {
    return NextResponse.json({ error: "Không có chương nào để thêm." }, { status: 400 });
  }
  if (chaptersInput.length > MAX_DETECTED_CHAPTERS) {
    return NextResponse.json(
      { error: `Chỉ được thêm tối đa ${MAX_DETECTED_CHAPTERS} chương trong 1 lần.` },
      { status: 400 }
    );
  }
  if (!chaptersInput.every(isChapterInput)) {
    return NextResponse.json({ error: "Dữ liệu chương không hợp lệ." }, { status: 400 });
  }

  let auth;
  try {
    auth = await getUserContext(request);
  } catch (e) {
    return requestError(e);
  }
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== userId) {
    return NextResponse.json({ error: "Không tìm thấy truyện hoặc bạn không có quyền sửa." }, { status: 404 });
  }

  const { data: lastChapter } = await supabase
    .from("chapters")
    .select("order_index")
    .eq("book_id", bookId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startIndex = (lastChapter?.order_index ?? 0) + 1;

  const rows = (chaptersInput as ChapterInput[]).map((c, i) => ({
    book_id: bookId,
    title: (typeof c.title === "string" && c.title.trim()) || `Chương ${startIndex + i}`,
    content: c.content,
    order_index: startIndex + i,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("chapters")
    .insert(rows)
    .select("id");

  if (insertError || !inserted) {
    console.error("[authoring] bulk insert chapters failed:", insertError);
    return NextResponse.json({ error: "Không thêm được chương. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ chapterIds: inserted.map((c) => c.id) });
}

/** Publish the explicitly reviewed chapters in one database UPDATE. */
export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.chapterIds;
  if (body?.price !== undefined && (typeof body.price !== "number" || !Number.isSafeInteger(body.price) || body.price < 0 || body.price > 2147483647)) {
    return NextResponse.json({ error: "Giá chương phải là số nguyên từ 0 đến 2.147.483.647 Xu." }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DETECTED_CHAPTERS ||
      !ids.every((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Danh sách chương không hợp lệ (tối đa 300 chương)." }, { status: 400 });
  }
  let auth;
  try {
    auth = await getUserContext(request);
  } catch (e) {
    return requestError(e);
  }
  const { supabase, userId, admin } = auth;
  if (!userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });

  const { data: book, error: bookReadError } = await supabase.from("books")
    .select("id, author_id, is_exclusive, deleted_at").eq("id", bookId).maybeSingle();
  if (bookReadError) return NextResponse.json({ error: "Không đọc được truyện. Vui lòng thử lại." }, { status: 500 });
  if (!book || book.author_id !== userId || book.deleted_at) {
    return NextResponse.json({ error: "Không tìm thấy truyện hoặc bạn không có quyền sửa." }, { status: 404 });
  }
  if (book.is_exclusive && !(await hasAcceptedExclusivityPolicy(supabase, userId))) {
    return NextResponse.json({ error: EXCLUSIVITY_AGREEMENT_ERROR, missingAgreementIds: [EXCLUSIVITY_AGREEMENT_ID] }, { status: 403 });
  }

  const { data: chapters, error: readError } = await supabase.from("chapters")
    .select("id, removed_at").eq("book_id", bookId).in("id", ids);
  if (readError) return NextResponse.json({ error: "Không đọc được danh sách chương." }, { status: 500 });
  if (!chapters || chapters.length !== ids.length) {
    return NextResponse.json({ error: "Một số chương không còn thuộc truyện này. Vui lòng tải lại trang." }, { status: 409 });
  }
  if (chapters.some((c) => c.removed_at)) {
    return NextResponse.json({ error: "Danh sách có chương bị quản trị viên gỡ. Không thể xuất bản." }, { status: 403 });
  }

  // The UPDATE is atomic across all matched drafts. Rechecking published and
  // removed_at avoids counting retries and restoring moderated chapters.
  const { data: updated, error } = await supabase.from("chapters").update({ published: true, ...(body.price !== undefined ? { price: body.price } : {}) })
    .eq("book_id", bookId).in("id", ids).eq("published", false).is("removed_at", null).select("id");
  if (error || !updated) {
    const locked = error && contestLockResponse(error);
    if (locked) return locked;
    return NextResponse.json({ error: "Không xuất bản được các chương. Vui lòng thử lại." }, { status: 500 });
  }
  // Retry also repairs the book visibility if an earlier request published
  // chapters successfully but failed while updating the parent book.
  const { error: visibilityError } = await supabase.from("books").update({ published: true })
    .eq("id", bookId).eq("author_id", userId).eq("published", false);
  revalidatePublicBooks();
  if (updated.length) {
    try {
      const result = await RewardEngine.incrementTaskProgress(admin(), {
        userId, taskCode: "author_publish_chapter", amount: updated.length,
      });
      if (!result.ok) console.error("[authoring] bulk publication reward failed:", result.error);
    } catch (e) {
      console.error("[authoring] bulk publication reward failed:", e);
    }
  }
  if (visibilityError) {
    return NextResponse.json({ error: "Các chương đã đăng nhưng chưa cập nhật được trang truyện. Bấm xuất bản lại để hoàn tất.", chapterIds: updated.map((c) => c.id) }, { status: 500 });
  }
  return NextResponse.json({ chapterIds: updated.map((c) => c.id), publishedCount: updated.length });
}
