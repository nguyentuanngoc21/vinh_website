import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { StreakService } from "@/lib/quests/streak-service";
import { RewardEngine } from "@/lib/quests/reward-engine";

type Client = SupabaseClient<Database>;

/** task_templates.code các nhiệm vụ "hoàn thành 1 chương" đã biết trước —
 * tăng tiến trình cho TẤT CẢ, không chỉ nhiệm vụ đang có trong pool hôm nay
 * của user (increment_task_progress() tự bỏ qua nếu code không active/không
 * tồn tại — xem catch bên dưới). Thêm code mới vào đây khi Phase 1 import
 * thêm nhiệm vụ "hoàn thành chương" khác. */
const CHAPTER_COMPLETION_TASK_CODES = ["reader_complete_chapter", "reader_complete_3_chapters"] as const;

/**
 * Gọi khi user thật sự đọc hết 1 chương (cuộn tới đoạn cuối cùng — xem
 * src/app/api/books/[bookId]/reading-progress/route.ts). Đây là nguồn duy
 * nhất nạp dữ liệu cho reading_history kể từ
 * migrations/20260917_add_reading_event_log.sql — mọi thứ phụ thuộc "đã đọc
 * lúc nào" (streak, achievement metric mới, điều kiện book_completed của
 * hidden quest) đều bắt nguồn từ đây.
 *
 * `supabase` phải là service-role client — record_chapter_read() có EXECUTE
 * đã revoke khỏi anon/authenticated.
 */
export const ReadingEventService = {
  async recordChapterCompletion(
    supabase: Client,
    params: { userId: string; bookId: string; chapterId: string }
  ): Promise<void> {
    const { data: row, error } = await supabase.rpc("record_chapter_read", {
      p_user_id: params.userId,
      p_book_id: params.bookId,
      p_chapter_id: params.chapterId,
    });
    if (error) {
      console.error("[reading-event] record_chapter_read failed:", error);
      return;
    }
    // NULL = đã ghi nhận chương này hôm nay rồi (dedupe trong hàm SQL) —
    // KHÔNG lặp lại streak/tiến trình nhiệm vụ cho cùng 1 lần hoàn thành.
    if (!row) return;

    // Streak + auto-claim milestone — không throw ra ngoài, 1 lỗi ở đây
    // không nên làm hỏng cả request ghi tiến độ đọc.
    try {
      await StreakService.recordReadingActivity(supabase, { userId: params.userId });
    } catch (err) {
      console.error("[reading-event] recordReadingActivity failed:", err);
    }

    // Tiến trình nhiệm vụ "hoàn thành chương" — best-effort từng cái, 1 mã
    // chưa tồn tại/chưa active (vd trước khi Phase 1 import xong) không
    // được làm hỏng các mã còn lại hoặc cả request.
    for (const taskCode of CHAPTER_COMPLETION_TASK_CODES) {
      const result = await RewardEngine.incrementTaskProgress(supabase, { userId: params.userId, taskCode });
      if (!result.ok) {
        console.error(`[reading-event] incrementTaskProgress(${taskCode}) failed:`, result.error);
      }
    }
  },
};
