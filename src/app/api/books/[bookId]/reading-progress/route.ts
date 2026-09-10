import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

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
  if (!chapterId || !Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return NextResponse.json({ error: "Thiếu chapterId/paragraphIndex hợp lệ." }, { status: 400 });
  }

  const { error } = await supabase.from("book_progress").upsert(
    {
      user_id: userId,
      book_id: bookId,
      chapter_id: chapterId,
      last_paragraph_index: paragraphIndex,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" }
  );
  if (error) {
    console.error("[reading-progress] upsert failed:", error);
    return NextResponse.json({ error: "Không lưu được tiến độ đọc." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
