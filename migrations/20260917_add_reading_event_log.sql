-- Migration: Nền tảng "log sự kiện đọc" cho hệ thống Nhiệm vụ/Thành tựu
-- (Phase 0 của kế hoạch triển khai nhiem-vu-thanh-tuu-hoan-thanh.xlsx).
--
-- Vấn đề: reading_history đã tồn tại từ migrations/20260824_add_reading_history.sql
-- (input cho recommend_books() + phân tích) nhưng CHƯA TỪNG được ghi bởi bất
-- kỳ code app nào — bảng chết. Vì vậy mọi thứ phụ thuộc "đã đọc lúc nào" đều
-- chưa hoạt động được: streak (sync_reading_streak() đã có nhưng chưa ai gọi
-- lúc đọc thật), điều kiện book_completed của hidden quest, và các metric
-- thành tựu mới (chapters_read/genres_read_count/night_reads_count) mà file
-- nhiem-vu-thanh-tuu-hoan-thanh.xlsx cần.
--
-- Giờ-trong-ngày (night_reads_count, và sau này các quest giờ vàng) dùng GIỜ
-- SERVER/UTC thống nhất cho mọi user — theo đúng quyết định đã có sẵn cho
-- ranh giới "1 ngày" của quest pool (xem comment todayIsoDate() trong
-- src/lib/quests/quest-pool-service.ts: "Không cố gắng theo timezone của
-- từng user"). Không thêm cột timezone nào.
--
-- reader_streak_7d/30d/100d trong file KHÔNG đi qua migration này — theo
-- đúng kiến trúc đã ghi ở migrations/20260908_add_achievements.sql, thành
-- tựu gắn streak dùng achievement_templates.metric = NULL + streak_milestones.badge_id,
-- KHÔNG phải một giá trị metric mới. Import các hàng đó (Phase 1) sẽ tự
-- hoạt động vì StreakService.recordReadingActivity (đã có sẵn, giờ được gọi
-- thật ở route dưới) tự auto-claim milestone.
--
-- PHẢI chạy sau migrations/20260908_add_achievements.sql (ALTER constraint +
-- CREATE OR REPLACE sync_user_achievements() bên dưới sửa lại đúng những gì
-- migration đó tạo).
--
-- Run in the Supabase SQL editor (or via psql), test trên dev/staging trước
-- theo docs/DEV_WORKFLOW.md. Idempotent — an toàn chạy lại nhiều lần.

BEGIN;

-- --- 1. Thắt lại RLS của reading_history — bảng này giờ NUÔI streak +
-- achievement metric (tiền thưởng thật), không còn là log vô hại thuần phân
-- tích nữa. Policy cũ "FOR ALL" cho phép user tự INSERT thẳng qua Supabase
-- client (spoof read_at, tự cày chapters_read/night_reads_count/streak) —
-- đổi thành SELECT-only cho chủ hàng, ghi DUY NHẤT qua
-- record_chapter_read() (SECURITY DEFINER, service_role) ở dưới. ---
DROP POLICY IF EXISTS "users manage their own reading history" ON public.reading_history;
DROP POLICY IF EXISTS "users view their own reading history" ON public.reading_history;

CREATE POLICY "users view their own reading history"
  ON public.reading_history FOR SELECT
  USING (auth.uid() = user_id);

-- --- 2. record_chapter_read() — gọi khi user thật sự đọc hết 1 chương
-- (cuộn tới đoạn cuối cùng — xem src/components/reading/reader.tsx +
-- src/app/api/books/[bookId]/reading-progress/route.ts). Dedupe theo
-- (user_id, chapter_id, NGÀY server) — trả NULL nếu đã ghi hôm nay, để
-- caller (TS) biết KHÔNG lặp lại side-effect (tăng tiến trình nhiệm vụ) cho
-- cùng 1 lần hoàn thành do client gửi lại. ---
CREATE OR REPLACE FUNCTION public.record_chapter_read(p_user_id uuid, p_book_id uuid, p_chapter_id uuid)
RETURNS public.reading_history AS $$
DECLARE
  v_row public.reading_history;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reading_history
    WHERE user_id = p_user_id AND chapter_id = p_chapter_id AND read_at::date = current_date
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.reading_history (user_id, book_id, chapter_id)
  VALUES (p_user_id, p_book_id, p_chapter_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- p_user_id trần — chỉ service_role gọi được, cùng lý do mọi RPC ghi hộ
-- user khác trong hệ thống quest (xem increment_task_progress ở schema.sql).
REVOKE EXECUTE ON FUNCTION public.record_chapter_read FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_chapter_read TO service_role;

-- --- 3. Mở rộng achievement_templates.metric — thêm 3 metric mới tính
-- được từ reading_history giờ đã có dữ liệu thật. KHÔNG thêm
-- 'reading_streak_days' (xem ghi chú đầu file — streak dùng đường
-- badge_id/streak_milestones sẵn có, không qua metric). ---
ALTER TABLE public.achievement_templates DROP CONSTRAINT IF EXISTS achievement_templates_metric_check;
ALTER TABLE public.achievement_templates
  ADD CONSTRAINT achievement_templates_metric_check
  CHECK (metric IS NULL OR metric IN (
    'books_published', 'audio_published', 'design_published',
    'chapters_read', 'genres_read_count', 'night_reads_count'
  ));

-- --- 4. sync_user_achievements() — thêm 3 nhánh metric mới, không đổi gì
-- khác (transaction/apply_transaction/vòng lặp giữ nguyên). Xem
-- migrations/20260908_add_achievements.sql cho bản gốc. ---
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
        -- Giờ server/UTC thống nhất — xem ghi chú đầu file.
        (SELECT count(*) FROM public.reading_history
           WHERE user_id = p_user_id
             AND (EXTRACT(HOUR FROM timezone('utc', read_at)) >= 22
                  OR EXTRACT(HOUR FROM timezone('utc', read_at)) < 2))
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

COMMIT;

-- Notes — cần cập nhật cùng đợt với migration này (đã làm trong cùng
-- commit, ghi lại ở đây theo quy ước DEV_WORKFLOW.md):
-- 1. docs/supabase/schema.sql — cập nhật đúng 3 chỗ: policy reading_history
--    (phần 6), thêm hàm record_chapter_read() ngay sau nó, constraint +
--    hàm sync_user_achievements() (phần 10).
-- 2. src/lib/supabase/types.ts — mở rộng union type
--    achievement_templates.Row/Insert.metric, thêm
--    Functions.record_chapter_read.
-- 3. src/lib/quests/achievement-service.ts — getMetricCounts() thêm 3 COUNT
--    mới (chapters_read/genres_read_count/night_reads_count), cùng logic
--    với sync_user_achievements() ở trên (2 nơi tính, PHẢI khớp nhau — xem
--    comment gốc trong file đó).
-- 4. src/lib/quests/reading-event-service.ts (MỚI) — orchestrate
--    record_chapter_read() -> (nếu có hàng mới) StreakService.recordReadingActivity()
--    + increment_task_progress() cho các quest "hoàn thành chương" đã biết.
-- 5. src/app/api/books/[bookId]/reading-progress/route.ts — nhận thêm
--    isLastParagraph, gọi ReadingEventService khi true.
-- 6. src/components/reading/reader.tsx — tính isLastParagraph
--    (idx >= paragraphs.length - 1) khi lên lịch ghi tiến độ.
-- 7. CHƯA làm ở migration này (Phase 1 trở đi): seed dữ liệu
--    task_templates/achievement_templates từ nhiem-vu-thanh-tuu-hoan-thanh.xlsx,
--    và INSERT streak_milestones (badge_id trỏ tới 3 hàng
--    reader_streak_7d/30d/100d) khi import Phase 3.
