-- Migration: Phase 6 — 10 thành tựu suy ra từ hành vi đọc
-- (nhiem-vu-thanh-tuu-hoan-thanh.xlsx) — tất cả để metric/threshold TRỐNG
-- trong file gốc ("cần backend tính riêng"), giờ nối vào đúng cơ chế
-- metric-based đã có (achievement_templates.metric + sync_user_achievements(),
-- xem migrations/20260908_add_achievements.sql,
-- migrations/20260917_add_reading_event_log.sql) thay vì xây cơ chế mới —
-- mỗi mã dưới đây chỉ là 1 công thức SQL riêng, không đổi khung.
--
-- 9 metric mới (10 thành tựu — 2 hàng dùng chung 1 metric, khác threshold,
-- xem ghi chú max_gap_days_same_book bên dưới):
--   finished_stories_count       — reader_finish_story (≥1)
--   longest_consecutive_chapters — reader_read_series (≥5)
--   distinct_reading_days_count  — reader_return_next_day (≥2)
--   max_reading_sessions_per_day — reader_read_multiple_sessions (≥3)
--   max_gap_days_same_book       — reader_continue_after_pause (≥7) VÀ
--                                   reader_comeback_15d (≥15) — file có ghi
--                                   chú "cân nhắc gộp 2 badge" nhưng chưa
--                                   chốt, nên vẫn giữ 2 hàng riêng như file
--                                   gốc, chỉ dùng CHUNG 1 metric.
--   weekend_both_days_read       — reader_weekend_reader (=1, đã đọc ít
--                                   nhất 1 lần vào thứ Bảy VÀ 1 lần vào
--                                   Chủ Nhật — không bắt buộc CÙNG 1 cuối
--                                   tuần, đơn giản hoá vì không ảnh hưởng
--                                   nhiều tới ý nghĩa thành tựu)
--   max_books_read_same_genre    — reader_genre_loyalist (≥5)
--   max_genres_within_15_days    — reader_genre_switcher (≥5) — dùng mốc
--                                   "lần đầu đọc mỗi thể loại" làm điểm
--                                   neo cửa sổ 15 ngày, không phải mọi
--                                   lượt đọc.
--   topup_count                  — reader_first_topup (≥1, reward=0 —
--                                   chỉ huy hiệu, đúng theo file)
--
-- "Phiên đọc" (max_reading_sessions_per_day) là ƯỚC LƯỢNG từ khoảng cách
-- giữa các dòng reading_history (>30 phút = phiên mới) — reading_sessions
-- (bảng có start_time/end_time thật) vẫn chưa được ghi bởi bất kỳ code
-- nào (xem migrations/20260917_add_reading_event_log.sql), không dùng ở
-- đây để tránh phụ thuộc 1 bảng luôn rỗng.
--
-- Giờ/ngày dùng server/UTC thống nhất — quyết định đã chốt từ
-- migrations/20260917_add_reading_event_log.sql.
--
-- Idempotent — DROP CONSTRAINT IF EXISTS rồi tạo lại, CREATE OR REPLACE
-- FUNCTION, ON CONFLICT DO NOTHING.

BEGIN;

ALTER TABLE public.achievement_templates DROP CONSTRAINT IF EXISTS achievement_templates_metric_check;
ALTER TABLE public.achievement_templates
  ADD CONSTRAINT achievement_templates_metric_check
  CHECK (metric IS NULL OR metric IN (
    'books_published', 'audio_published', 'design_published',
    'chapters_read', 'genres_read_count', 'night_reads_count',
    'finished_stories_count', 'longest_consecutive_chapters',
    'distinct_reading_days_count', 'max_reading_sessions_per_day',
    'max_gap_days_same_book', 'weekend_both_days_read',
    'max_books_read_same_genre', 'max_genres_within_15_days', 'topup_count'
  ));

CREATE OR REPLACE FUNCTION public.sync_user_achievements(p_user_id uuid)
RETURNS SETOF public.user_achievements AS $$
DECLARE
  v_template public.achievement_templates;
  v_count integer;
  v_txn public.transactions;
  v_row public.user_achievements;
BEGIN
  FOR v_template IN
    SELECT * FROM public.achievement_templates
    WHERE active AND metric IS NOT NULL
      AND id NOT IN (
        SELECT achievement_id FROM public.user_achievements WHERE user_id = p_user_id
      )
  LOOP
    v_count := CASE v_template.metric
      WHEN 'books_published' THEN
        (SELECT count(*) FROM public.books WHERE author_id = p_user_id AND published)
      WHEN 'audio_published' THEN
        (SELECT count(*) FROM public.audio_narrations WHERE narrator_id = p_user_id)
      WHEN 'design_published' THEN
        (SELECT count(*) FROM public.design_items WHERE illustrator_id = p_user_id)
      WHEN 'chapters_read' THEN
        (SELECT count(DISTINCT chapter_id) FROM public.reading_history
           WHERE user_id = p_user_id AND chapter_id IS NOT NULL)
      WHEN 'genres_read_count' THEN
        (SELECT count(DISTINCT b.genre) FROM public.reading_history rh
           JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND b.genre IS NOT NULL)
      WHEN 'night_reads_count' THEN
        (SELECT count(*) FROM public.reading_history
           WHERE user_id = p_user_id
             AND (EXTRACT(HOUR FROM timezone('utc', read_at)) >= 22
                  OR EXTRACT(HOUR FROM timezone('utc', read_at)) < 2))
      WHEN 'finished_stories_count' THEN
        (SELECT count(DISTINCT rh.book_id) FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           WHERE rh.user_id = p_user_id AND c.is_last_chapter = true)
      WHEN 'longest_consecutive_chapters' THEN
        (WITH read_chapters AS (
           SELECT DISTINCT c.book_id, c.order_index
           FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           WHERE rh.user_id = p_user_id
         ), grp AS (
           SELECT book_id, order_index - row_number() OVER (PARTITION BY book_id ORDER BY order_index) AS g
           FROM read_chapters
         )
         SELECT coalesce(max(run_length), 0) FROM (
           SELECT book_id, g, count(*) AS run_length FROM grp GROUP BY book_id, g
         ) runs)
      WHEN 'distinct_reading_days_count' THEN
        (SELECT count(DISTINCT read_at::date) FROM public.reading_history WHERE user_id = p_user_id)
      WHEN 'max_reading_sessions_per_day' THEN
        (WITH events AS (
           SELECT read_at::date AS d, read_at,
                  read_at - lag(read_at) OVER (PARTITION BY read_at::date ORDER BY read_at) AS gap
           FROM public.reading_history WHERE user_id = p_user_id
         )
         SELECT coalesce(max(session_count), 0) FROM (
           SELECT d, count(*) FILTER (WHERE gap IS NULL OR gap > INTERVAL '30 minutes') AS session_count
           FROM events GROUP BY d
         ) s)
      WHEN 'max_gap_days_same_book' THEN
        (WITH book_events AS (
           SELECT book_id, read_at - lag(read_at) OVER (PARTITION BY book_id ORDER BY read_at) AS gap
           FROM public.reading_history WHERE user_id = p_user_id
         )
         SELECT coalesce(max(extract(day FROM gap)::integer), 0) FROM book_events)
      WHEN 'weekend_both_days_read' THEN
        (SELECT CASE WHEN
           EXISTS(SELECT 1 FROM public.reading_history WHERE user_id = p_user_id AND extract(dow FROM read_at) = 6)
           AND EXISTS(SELECT 1 FROM public.reading_history WHERE user_id = p_user_id AND extract(dow FROM read_at) = 0)
         THEN 1 ELSE 0 END)
      WHEN 'max_books_read_same_genre' THEN
        (SELECT coalesce(max(cnt), 0) FROM (
           SELECT b.genre, count(DISTINCT rh.book_id) AS cnt
           FROM public.reading_history rh JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND b.genre IS NOT NULL
           GROUP BY b.genre
         ) t)
      WHEN 'max_genres_within_15_days' THEN
        (WITH first_genre_read AS (
           SELECT b.genre, min(rh.read_at) AS first_read
           FROM public.reading_history rh JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND b.genre IS NOT NULL
           GROUP BY b.genre
         )
         SELECT coalesce(max(cnt), 0) FROM (
           SELECT o1.genre, count(*) AS cnt
           FROM first_genre_read o1
           JOIN first_genre_read o2 ON o2.first_read BETWEEN o1.first_read AND o1.first_read + INTERVAL '15 days'
           GROUP BY o1.genre
         ) t)
      WHEN 'topup_count' THEN
        (SELECT count(*) FROM public.transactions
           WHERE user_id = p_user_id AND type = 'topup' AND status <> 'reversed')
      ELSE 0
    END;

    IF v_count >= v_template.threshold THEN
      v_txn := NULL;
      IF v_template.reward_tokens > 0 THEN
        v_txn := public.apply_transaction(
          p_user_id, 'achievement_bonus', v_template.reward_tokens,
          'achievement', v_template.id
        );
      END IF;

      INSERT INTO public.user_achievements (user_id, achievement_id, transaction_id)
      VALUES (p_user_id, v_template.id, v_txn.id)
      RETURNING * INTO v_row;

      RETURN NEXT v_row;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.sync_user_achievements FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_achievements TO service_role;

INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_finish_story', NULL, 'Hoàn thành một hành trình', 'Đọc hết một truyện hoàn chỉnh.', 'book', 'reader', 'finished_stories_count', 1, 20, true),
  ('reader_read_series', NULL, 'Theo dõi một series', 'Đọc ít nhất 5 chương liên tiếp của cùng một truyện.', 'book', 'reader', 'longest_consecutive_chapters', 5, 15, true),
  ('reader_return_next_day', NULL, 'Quay lại ngày mai', 'Trở lại đọc tiếp sau ngày đầu tiên.', 'trophy', 'reader', 'distinct_reading_days_count', 2, 10, true),
  ('reader_read_multiple_sessions', NULL, 'Đọc nhiều phiên', 'Có ít nhất 3 phiên đọc trong ngày.', 'trophy', 'reader', 'max_reading_sessions_per_day', 3, 10, true),
  ('reader_continue_after_pause', NULL, 'Tiếp tục hành trình', 'Quay lại truyện sau 7 ngày không đọc.', 'trophy', 'reader', 'max_gap_days_same_book', 7, 15, true),
  ('reader_comeback_15d', NULL, 'Không bỏ cuộc', 'Quay lại truyện đã ngưng đọc được 15 ngày.', 'flame', 'reader', 'max_gap_days_same_book', 15, 20, true),
  ('reader_weekend_reader', NULL, 'Cuối tuần cùng truyện', 'Đọc sách trong cả 2 ngày thứ Bảy & Chủ Nhật.', 'flame', 'reader', 'weekend_both_days_read', 1, 15, true),
  ('reader_genre_loyalist', NULL, 'Kẻ săn thể loại', 'Đọc ≥5 truyện cùng thể loại.', 'trophy', 'reader', 'max_books_read_same_genre', 5, 30, true),
  ('reader_genre_switcher', NULL, 'Kẻ đổi vị', 'Đọc 5 thể loại khác nhau trong vòng 15 ngày.', 'trophy', 'reader', 'max_genres_within_15_days', 5, 40, true),
  ('reader_first_topup', NULL, 'Người ủng hộ đầu tiên', 'Thực hiện nạp token lần đầu tiên.', 'trophy', 'reader', 'topup_count', 1, 0, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Notes:
-- 1. docs/supabase/schema.sql — mirror constraint mới + CREATE OR REPLACE
--    sync_user_achievements() (phần 10).
-- 2. src/lib/supabase/types.ts — export AchievementMetric (union metric
--    đầy đủ, dùng chung cho achievement_templates.Row/Insert VÀ
--    getMetricCounts()).
-- 3. src/lib/quests/achievement-service.ts — getMetricCounts() thêm 9
--    công thức tương ứng (JS, chỉ để vẽ progress bar — unlock thật vẫn do
--    sync_user_achievements() ở trên quyết định).