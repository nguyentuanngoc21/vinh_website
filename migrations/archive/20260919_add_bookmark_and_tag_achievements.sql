-- Migration: Phase 7 — 5 thành tựu còn lại nhóm "cần backend riêng"
-- (nhiem-vu-thanh-tuu-hoan-thanh.xlsx), tiếp tục Phase 6 (cùng khung
-- metric-based, không cơ chế mới). Khác Phase 6 — 3/5 mã ở đây phát hiện
-- ra tính năng NỀN ĐÃ CÓ SẴN mà lần khảo sát đầu (trước Phase 1) báo
-- nhầm là "chưa có":
--   - reading_lists/reading_list_items (tủ sách) — ĐÃ tồn tại, dùng cho
--     reader_first_bookmark_collection/reader_genre_bookmark_collector
--     (file ghi "cần bookmark thật", hoá ra có sẵn từ trước).
--   - highlights (lưu đoạn bôi đen — src/app/api/chapters/[chapterId]/highlights/route.ts)
--     — ĐÃ có API + UI đầy đủ trong reader.tsx, dùng thẳng cho
--     reader_save_10_quotes (file ghi "giả định nền tảng có tính năng lưu
--     đoạn trích", hoá ra đã có).
--   - books.tags (text[], tự do, author tự gắn qua PATCH
--     /api/authoring/books/[bookId] — migrations/20260824_add_book_tags_and_view_count.sql)
--     — dùng cho reader_tragedy_hunter ("kết buồn") THAY VÌ thêm cột
--     books.has_sad_ending mới — so khớp KHÔNG phân biệt hoa/thường, trim
--     khoảng trắng (lower(trim(tag)) = 'kết buồn'), vì tags là text tự do
--     do tác giả gõ tay, không có danh mục cố định.
--
-- 5 metric mới:
--   sad_ending_finished_count       — reader_tragedy_hunter (≥10) — hoàn
--                                      thành (đọc is_last_chapter) 1 sách
--                                      CÓ tag 'kết buồn' (không phân biệt
--                                      hoa/thường).
--   underrated_finished_count       — reader_underdog_reader (≥1) — hoàn
--                                      thành 1 sách view_count < 50, cùng
--                                      ngưỡng với nhiệm vụ reader_read_underrated
--                                      (migrations/20260917_seed_phase1_quests_achievements.sql).
--   bookmarked_books_count          — reader_first_bookmark_collection (≥5)
--                                      — tổng số sách KHÁC NHAU trong MỌI
--                                      tủ sách của user (không giới hạn 1
--                                      danh sách).
--   max_bookmarked_books_same_genre — reader_genre_bookmark_collector (≥5)
--   saved_highlights_count          — reader_save_10_quotes (≥10) — đếm
--                                      thẳng bảng highlights, không cần gì
--                                      thêm.
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
    'max_books_read_same_genre', 'max_genres_within_15_days', 'topup_count',
    'sad_ending_finished_count', 'underrated_finished_count',
    'bookmarked_books_count', 'max_bookmarked_books_same_genre',
    'saved_highlights_count'
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
      WHEN 'sad_ending_finished_count' THEN
        (SELECT count(DISTINCT rh.book_id) FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND c.is_last_chapter = true
             AND EXISTS (SELECT 1 FROM unnest(b.tags) tg WHERE lower(trim(tg)) = 'kết buồn'))
      WHEN 'underrated_finished_count' THEN
        (SELECT count(DISTINCT rh.book_id) FROM public.reading_history rh
           JOIN public.chapters c ON c.id = rh.chapter_id
           JOIN public.books b ON b.id = rh.book_id
           WHERE rh.user_id = p_user_id AND c.is_last_chapter = true AND b.view_count < 50)
      WHEN 'bookmarked_books_count' THEN
        (SELECT count(DISTINCT rli.book_id) FROM public.reading_list_items rli
           JOIN public.reading_lists rl ON rl.id = rli.list_id
           WHERE rl.user_id = p_user_id)
      WHEN 'max_bookmarked_books_same_genre' THEN
        (SELECT coalesce(max(cnt), 0) FROM (
           SELECT b.genre, count(DISTINCT rli.book_id) AS cnt
           FROM public.reading_list_items rli
           JOIN public.reading_lists rl ON rl.id = rli.list_id
           JOIN public.books b ON b.id = rli.book_id
           WHERE rl.user_id = p_user_id AND b.genre IS NOT NULL
           GROUP BY b.genre
         ) t)
      WHEN 'saved_highlights_count' THEN
        (SELECT count(*) FROM public.highlights WHERE user_id = p_user_id)
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
  ('reader_tragedy_hunter', NULL, 'Người săn bi kịch', 'Hoàn thành 10 truyện có kết buồn.', 'trophy', 'reader', 'sad_ending_finished_count', 10, 50, true),
  ('reader_underdog_reader', NULL, 'Đi ngược số đông', 'Đọc hết 1 bộ truyện dưới 50 view.', 'trophy', 'reader', 'underrated_finished_count', 1, 20, true),
  ('reader_first_bookmark_collection', NULL, 'Bộ sưu tập đầu tiên', 'Bookmark 5 truyện.', 'trophy', 'reader', 'bookmarked_books_count', 5, 15, true),
  ('reader_genre_bookmark_collector', NULL, 'Nhà sưu tầm thể loại', 'Bookmark 5 truyện cùng genre.', 'trophy', 'reader', 'max_bookmarked_books_same_genre', 5, 20, true),
  ('reader_save_10_quotes', NULL, 'Người giữ ký ức', 'Lưu 10 đoạn yêu thích.', 'book', 'reader', 'saved_highlights_count', 10, 20, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Notes:
-- 1. docs/supabase/schema.sql — mirror constraint mới + CREATE OR REPLACE
--    sync_user_achievements() (phần 10).
-- 2. src/lib/supabase/types.ts — mở rộng AchievementMetric thêm 5 giá trị.
-- 3. src/lib/quests/achievement-service.ts — getMetricCounts() thêm 5
--    công thức tương ứng (JS, progress bar) — reuse finishedStories Set
--    đã có sẵn từ Phase 6 cho 2 metric *_finished_count.
-- 4. reader_tragedy_hunter chỉ hoạt động cho sách tác giả ĐÃ tự gắn tag
--    'kết buồn' (books.tags, tự do — không có UI ép buộc/gợi ý tag này
--    riêng). Muốn nhiều sách đủ điều kiện hơn, cần chủ động nhắc tác giả
--    gắn tag khi xuất bản — KHÔNG nằm trong phạm vi migration này.