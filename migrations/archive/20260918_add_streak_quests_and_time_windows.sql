-- Migration: Phase 3 — quest "giờ vàng" + streak-ngày, từ
-- nhiem-vu-thanh-tuu-hoan-thanh.xlsx (loại ra khỏi Phase 1 vì cần cơ chế
-- SET progress trực tiếp, khác mô hình increment tích luỹ thường — xem
-- migrations/20260917_seed_phase1_quests_achievements.sql).
--
-- reader_3day_reading_streak là nhiệm vụ NGÀY (task_date reset mỗi ngày)
-- nhưng ý nghĩa thật là "streak hiện tại (profiles.current_quest_streak)
-- đạt >= 3" — không thể dùng increment_task_progress() bình thường vì
-- progress reset về 0 mỗi ngày mới trong khi streak thì KHÔNG. Cần
-- set_task_progress() mới — GHI ĐÈ progress bằng đúng min(streak, 3) mỗi
-- lần đọc, thay vì cộng dồn. An toàn overwrite trong cùng 1 ngày vì
-- sync_reading_streak() idempotent trong ngày (streak không giảm giữa
-- ngày) — xem src/lib/quests/reading-event-service.ts.
--
-- reader_streak_7d/30d/100d (thành tựu) đi đúng đường kiến trúc đã có sẵn
-- (migrations/20260908_add_achievements.sql): achievement_templates.metric
-- = NULL (chỉ cấp metadata hiển thị: title/icon/color_token), unlock THẬT
-- qua streak_milestones.badge_id + claim_streak_milestone() — KHÔNG qua
-- sync_user_achievements(). reward_tokens = 0 ở achievement_templates cho
-- 3 hàng này (tránh hiểu nhầm có thưởng ở đây) — thưởng THẬT nằm ở
-- streak_milestones.reward_token (30/150/300, đúng số trong file).
--
-- Giờ-trong-ngày dùng server/UTC thống nhất — quyết định đã chốt ở
-- migrations/20260917_add_reading_event_log.sql, áp dụng tiếp ở đây cho
-- reader_night_owl_read/reader_morning_fly/reader_tea_time/reader_peak_hour_session.
--
-- Idempotent — CREATE OR REPLACE FUNCTION, ON CONFLICT DO NOTHING/DO
-- UPDATE, an toàn chạy lại nhiều lần.

BEGIN;

-- --- set_task_progress() — GHI ĐÈ progress (không cộng dồn) — dùng cho
-- nhiệm vụ mà "tiến trình" thật ra là 1 trạng thái ngoài (streak), không
-- phải số lần hành động trong ngày. Cùng khung với increment_task_progress()
-- (lazy-create dòng hôm nay nếu chưa có), chỉ khác phép UPDATE. ---
CREATE OR REPLACE FUNCTION public.set_task_progress(p_user_id uuid, p_task_code text, p_progress integer)
RETURNS public.user_daily_tasks AS $$
DECLARE
  v_template public.task_templates;
  v_row public.user_daily_tasks;
BEGIN
  SELECT * INTO v_template FROM public.task_templates WHERE code = p_task_code AND active;
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive task code: %', p_task_code;
  END IF;

  INSERT INTO public.user_daily_tasks (user_id, template_id, task_date)
  VALUES (p_user_id, v_template.id, current_date)
  ON CONFLICT (user_id, template_id, task_date) DO NOTHING;

  UPDATE public.user_daily_tasks
    SET progress = least(greatest(p_progress, 0), v_template.target_count),
        completed = p_progress >= v_template.target_count
    WHERE user_id = p_user_id AND template_id = v_template.id AND task_date = current_date
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.set_task_progress FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_progress TO service_role;

INSERT INTO public.task_templates (code, title, description, for_role, quest_type, genre, target_count, reward_tokens, active)
VALUES
  ('reader_night_owl_read', 'Cú đêm mê đọc', 'Đọc ít nhất 1 chương sách trong khoảng từ 22:00 - 02:00 sáng.', NULL, 'discovery', NULL, 1, 12, true),
  ('reader_morning_fly', 'Đón ngày mới cùng sách', 'Đọc 1 chương sách trong khoảng từ 06:00 - 09:00 sáng.', NULL, 'discovery', NULL, 1, 10, true),
  ('reader_tea_time', 'Độc giả giờ nghỉ', 'Đọc 1 chương sách trong khoảng từ 11:00 - 14:00.', NULL, 'discovery', NULL, 1, 10, true),
  ('reader_peak_hour_session', 'Giờ vàng của bạn', 'Mở ứng dụng/web và đọc trong khung giờ cố định (Sáng 7-9h hoặc Đêm 22-1h).', NULL, 'engagement', NULL, 1, 10, true),
  ('reader_3day_reading_streak', '3 ngày liên tiếp', 'Đọc ít nhất 1 chương mỗi ngày, 3 ngày liên tiếp.', NULL, 'engagement', NULL, 3, 20, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.achievement_templates (code, for_role, title, description, icon, color_token, metric, threshold, reward_tokens, active)
VALUES
  ('reader_streak_7d', NULL, 'Bền bỉ 7 ngày', 'Đọc sách liên tục 7 ngày không ngắt quãng.', 'flame', 'reader', NULL, NULL, 0, true),
  ('reader_streak_30d', NULL, 'Đam mê bất tận', 'Đọc sách liên tục 30 ngày không ngắt quãng.', 'flame', 'reader', NULL, NULL, 0, true),
  ('reader_streak_100d', NULL, 'Huyền thoại kiên trì', 'Đọc sách liên tục 100 ngày không ngắt quãng.', 'flame', 'reader', NULL, NULL, 0, true)
ON CONFLICT (code) DO NOTHING;

-- Nối badge_id — reward_token CHỈ set khi INSERT lần đầu (ON CONFLICT chỉ
-- cập nhật badge_id), không ghi đè nếu bạn đã tự sửa reward_token thủ công
-- sau này.
INSERT INTO public.streak_milestones (streak_days, reward_token, badge_id)
VALUES
  (7, 30, (SELECT id FROM public.achievement_templates WHERE code = 'reader_streak_7d')),
  (30, 150, (SELECT id FROM public.achievement_templates WHERE code = 'reader_streak_30d')),
  (100, 300, (SELECT id FROM public.achievement_templates WHERE code = 'reader_streak_100d'))
ON CONFLICT (streak_days) DO UPDATE SET badge_id = excluded.badge_id;

COMMIT;

-- Notes:
-- 1. docs/supabase/schema.sql — thêm set_task_progress() ngay sau
--    increment_task_progress() (phần 7).
-- 2. src/lib/supabase/types.ts — thêm Functions.set_task_progress.
-- 3. src/lib/quests/reward-engine.ts — thêm RewardEngine.setTaskProgress()
--    wrap RPC trên.
-- 4. src/lib/quests/reading-event-service.ts — thêm ctx.hourUtc + 4 rule
--    giờ-trong-ngày vào CHAPTER_COMPLETION_RULES, và gọi setTaskProgress()
--    cho reader_3day_reading_streak bằng min(streak hiện tại, 3) ngay sau
--    StreakService.recordReadingActivity().
-- 5. KHÔNG cần đổi UI thành tựu (achievements-page.tsx) — 3 hàng streak
--    mới dùng đúng cơ chế streak-linked (metric NULL) đã render sẵn từ
--    migrations/20260908_add_achievements.sql, chỉ cần badge_id nối đúng
--    (đã làm ở migration này) để không còn "chưa gắn badge_id" nữa.