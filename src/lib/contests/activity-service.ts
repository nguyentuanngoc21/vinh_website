/**
 * Hoạt động của người đọc trên bài dự thi (Phase 3) — ghi tiến độ nhiệm vụ sự
 * kiện cuộc thi (Slice 3.1) qua record_contest_activity(). SQL tự kiểm: bài
 * thuộc đúng cuộc thi trong ô sự kiện hôm nay, người làm không phải tác giả,
 * "đọc" phải đạt ngưỡng đọc thật (K7). Passport (Slice 3.2) dùng lại cùng sự kiện.
 *
 * Best-effort như các điểm ghi tiến độ nhiệm vụ khác: lỗi chỉ ghi log, không
 * làm hỏng hành động chính (đọc, bình luận, lưu, bình chọn).
 */
import type { ContestActivityEvent } from "@/lib/supabase/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function recordContestActivity(input: {
  userId: string;
  event: ContestActivityEvent;
  bookId: string;
  chapterId?: string | null;
}): Promise<void> {
  try {
    const { error } = await createServiceRoleClient().rpc("record_contest_activity", {
      p_user_id: input.userId,
      p_event: input.event,
      p_book_id: input.bookId,
      p_chapter_id: input.chapterId ?? null,
    });
    if (error) console.error(`[contests] record_contest_activity(${input.event}) failed:`, error);
  } catch (error) {
    console.error(`[contests] record_contest_activity(${input.event}) failed:`, error);
  }
}
