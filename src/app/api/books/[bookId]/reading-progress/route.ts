import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { recordReadingProgress } from "@/lib/reading/record-progress";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/books/:bookId/reading-progress — ghi lại ĐOẠN VĂN cụ thể
 * người đọc đang dừng ở, để reader.tsx tự cuộn tới đúng chỗ khi mở lại
 * đúng chương này. Gọi debounce từ client (reader.tsx, mỗi khi ngừng
 * cuộn ~3s) — không chặn UI, lỗi im lặng (best-effort, mất 1 lần ghi
 * không sao, không phải dữ liệu quan trọng).
 *
 * Ghi ĐÈ CẢ 2 cột (chapter_id + last_paragraph_index) trong 1 upsert —
 * không bao giờ để lệch nhau (paragraph_index của chương A còn sót lại
 * trong lúc chapter_id đã trỏ sang chương B). Cùng onConflict với
 * book_progress upsert ở page.tsx (after() — chỉ ghi chapter_id, không
 * biết đoạn nào; route này tinh chỉnh thêm sau khi trang đã render).
 *
 * isLastParagraph (tuỳ chọn, reader.tsx gửi khi đoạn đang xem là đoạn cuối
 * chương) — kích hoạt ReadingEventService.recordChapterCompletion(), nguồn
 * duy nhất ghi reading_history/streak/tiến trình nhiệm vụ "hoàn thành
 * chương". Xem migrations/20260917_add_reading_event_log.sql.
 *
 * Mọi kiểm tra (chương đã xuất bản + thuộc đúng truyện, quyền đọc chương
 * trả phí, chỉ số đoạn hợp lệ) nằm trong recordReadingProgress() — dùng
 * chung với route mobile. Trước đây route tin chapterId/isLastParagraph từ
 * client, nên có thể tự gửi request để nhận thưởng cho chương chưa mua.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const chapterId = typeof body?.chapterId === "string" ? body.chapterId : "";
  const paragraphIndex = Number(body?.paragraphIndex);
  const isLastParagraph = body?.isLastParagraph === true;
  if (!UUID.test(bookId) || !UUID.test(chapterId) || !Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return NextResponse.json({ error: "Thiếu chapterId/paragraphIndex hợp lệ." }, { status: 400 });
  }

  const result = await recordReadingProgress(supabase, userId, {
    bookId,
    chapterId,
    paragraphIndex,
    completed: isLastParagraph,
  });
  if (!result.ok) {
    if (result.status === 502) console.error("[reading-progress] failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
