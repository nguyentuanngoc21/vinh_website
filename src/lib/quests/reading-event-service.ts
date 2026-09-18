import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";
import { StreakService } from "@/lib/quests/streak-service";
import { RewardEngine } from "@/lib/quests/reward-engine";

type Client = SupabaseClient<Database>;

/** Không phải giá trị "Tiên hiệp" đứng riêng — đúng chuỗi BookGenre thật
 * (src/lib/supabase/types.ts) là "Tiên hiệp/ kiếm hiệp" (gộp 2 thể loại).
 * reader_read_3_chapters loại trừ đúng thể loại này. */
const TIEN_HIEP_GENRE = "Tiên hiệp/ kiếm hiệp";

type ChapterContext = {
  /** Đây là lần đầu user hoàn thành ĐÚNG chương này (mọi ngày, không
   * riêng hôm nay) — false nếu đọc lại chương đã hoàn thành từ trước.
   * Chặn farm nhiệm vụ đếm chương bằng cách mở lại chương cũ. */
  isFirstTimeChapter: boolean;
  /** Đây là lần đầu user đọc bất kỳ chương nào thuộc thể loại của SÁCH
   * này (mọi ngày, kể cả hôm nay trước chương này). */
  isFirstTimeGenre: boolean;
  bookGenre: BookGenre | null;
  viewCount: number;
  /** Giờ server/UTC lúc hoàn thành chương (0-23) — quyết định đã chốt ở
   * migrations/20260917_add_reading_event_log.sql, không theo timezone
   * từng user. */
  hourUtc: number;
};

/** task_templates.code các nhiệm vụ tăng tiến trình khi hoàn thành 1
 * chương — mỗi mã có điều kiện `matches` riêng dựa trên ChapterContext.
 * Thêm mã mới vào đây khi import thêm nhiệm vụ "đọc chương" khác (Phase
 * tiếp theo). increment_task_progress() tự bỏ qua mã không active/không
 * tồn tại (xem catch ở dưới) — an toàn thêm mã trước khi task_templates
 * có hàng tương ứng. */
const CHAPTER_COMPLETION_RULES: { code: string; matches: (ctx: ChapterContext) => boolean }[] = [
  { code: "reader_complete_chapter", matches: (ctx) => ctx.isFirstTimeChapter },
  { code: "reader_complete_3_chapters", matches: (ctx) => ctx.isFirstTimeChapter },
  // "Đọc 3 chương bất kỳ... (ngoại trừ tiên hiệp)" — loại trừ đúng 1 thể
  // loại, cùng điều kiện chống farm với 2 mã trên.
  { code: "reader_read_3_chapters", matches: (ctx) => ctx.isFirstTimeChapter && ctx.bookGenre !== TIEN_HIEP_GENRE },
  { code: "reader_read_new_genre", matches: (ctx) => ctx.isFirstTimeGenre },
  // Không chặn đọc-lại — đây là nhiệm vụ NGÀY (reset mỗi ngày), lặp lại 1
  // truyện ít/nhiều view mỗi ngày không phải lỗ hổng, cùng cách 1 chuỗi
  // streak vẫn tính khi quay lại đọc chương cũ.
  { code: "reader_read_underrated", matches: (ctx) => ctx.viewCount < 50 },
  { code: "reader_read_top_rated", matches: (ctx) => ctx.viewCount > 300 },
  // Giờ vàng — không chặn đọc-lại, cùng lý do reader_read_underrated/top_rated
  // ở trên (nhiệm vụ NGÀY, reset mỗi ngày).
  { code: "reader_night_owl_read", matches: (ctx) => ctx.hourUtc >= 22 || ctx.hourUtc < 2 },
  { code: "reader_morning_fly", matches: (ctx) => ctx.hourUtc >= 6 && ctx.hourUtc < 9 },
  { code: "reader_tea_time", matches: (ctx) => ctx.hourUtc >= 11 && ctx.hourUtc < 14 },
  // Trùng lịch với 2 mã trên (7-9h/22-1h) — CHỦ Ý theo đúng nội dung bạn
  // soạn (quest_type engagement, khác discovery của 2 mã kia), không tự
  // gộp/loại bớt.
  { code: "reader_peak_hour_session", matches: (ctx) => (ctx.hourUtc >= 7 && ctx.hourUtc < 9) || ctx.hourUtc >= 22 || ctx.hourUtc < 1 },
];

async function hasReadGenreBefore(supabase: Client, userId: string, genre: BookGenre | null): Promise<boolean> {
  if (!genre) return true; // Không xác định thể loại — không tính là "mới".
  const { data: historyRows } = await supabase.from("reading_history").select("book_id").eq("user_id", userId);
  const bookIds = [...new Set((historyRows ?? []).map((r) => r.book_id))];
  if (bookIds.length === 0) return false;
  const { count } = await supabase.from("books").select("id", { count: "exact", head: true }).in("id", bookIds).eq("genre", genre);
  return (count ?? 0) > 0;
}

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
    const [{ data: book }, { count: priorChapterCount }] = await Promise.all([
      supabase.from("books").select("genre, view_count").eq("id", params.bookId).maybeSingle(),
      supabase
        .from("reading_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", params.userId)
        .eq("chapter_id", params.chapterId)
        .lt("read_at", new Date().toISOString().slice(0, 10)),
    ]);
    const bookGenre = book?.genre ?? null;
    const isFirstTimeGenre = !(await hasReadGenreBefore(supabase, params.userId, bookGenre));

    const ctx: ChapterContext = {
      isFirstTimeChapter: (priorChapterCount ?? 0) === 0,
      isFirstTimeGenre,
      bookGenre,
      viewCount: book?.view_count ?? 0,
      hourUtc: new Date().getUTCHours(),
    };

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

    // Streak + auto-claim milestone — TÍNH CẢ KHI đọc lại chương cũ (quay
    // lại đọc hôm nay vẫn là hoạt động thật). Không throw ra ngoài, 1 lỗi
    // ở đây không nên làm hỏng cả request ghi tiến độ đọc.
    try {
      const { profile } = await StreakService.recordReadingActivity(supabase, { userId: params.userId });

      // reader_3day_reading_streak — GHI ĐÈ progress bằng streak hiện tại
      // (chặn ở 3), KHÔNG cộng dồn như các mã khác — xem
      // migrations/20260918_add_streak_quests_and_time_windows.sql.
      const setResult = await RewardEngine.setTaskProgress(supabase, {
        userId: params.userId,
        taskCode: "reader_3day_reading_streak",
        progress: Math.min(profile.current_quest_streak, 3),
      });
      if (!setResult.ok) {
        console.error("[reading-event] setTaskProgress(reader_3day_reading_streak) failed:", setResult.error);
      }
    } catch (err) {
      console.error("[reading-event] recordReadingActivity failed:", err);
    }

    // Tiến trình từng nhiệm vụ — best-effort từng mã, 1 mã lỗi/chưa active
    // không được làm hỏng các mã còn lại hoặc cả request.
    for (const rule of CHAPTER_COMPLETION_RULES) {
      if (!rule.matches(ctx)) continue;
      const result = await RewardEngine.incrementTaskProgress(supabase, { userId: params.userId, taskCode: rule.code });
      if (!result.ok) {
        console.error(`[reading-event] incrementTaskProgress(${rule.code}) failed:`, result.error);
      }
    }
  },
};
