-- Migration: Hệ thống Thành tựu (Achievements) — 1 khung chung cho mọi
-- role (tác giả/người thu âm/thiết kế/đọc giả), lọc + tô màu theo
-- for_role ở tầng UI, cùng convention for_role NULL = chung/đọc giả đã
-- dùng cho task_templates (migrations/20260908_add_task_template_role_gating.sql).
--
-- PHẢI chạy sau migrations/20260908_add_achievement_bonus_transaction_type.sql
-- (hàm sync_user_achievements() dưới đây dùng giá trị enum 'achievement_bonus').
--
-- Ghép nối với streak_milestones — bảng đó đã để sẵn cột `badge_id uuid`
-- từ trước (migrations/20260827_add_streak_milestones.sql) đúng với ý
-- "cần bảng badges riêng, ALTER FK sau khi bảng đó tồn tại". achievement_templates
-- CHÍNH LÀ bảng đó — mốc streak dùng badge_id trỏ tới 1 hàng ở đây (metric
-- NULL — hàng đó chỉ cấp metadata hiển thị: title/icon/color_token/for_role,
-- KHÔNG lặp lại cơ chế unlock/claim; unlock/claim mốc streak vẫn do
-- claim_streak_milestone()/user_streak_milestone_claims quyết định, không
-- đổi). Chỉ 3 role sản phẩm (author/narrator/designer) mới dùng
-- metric+threshold+sync_user_achievements() ở migration này, vì đó là
-- loại thành tựu MỚI, chưa có cơ chế tính/claim nào trước đó.
--
-- Run in the Supabase SQL editor (or via psql). Idempotent trừ phần
-- CREATE TABLE/CREATE FUNCTION (an toàn chạy lại nhờ IF NOT EXISTS/OR
-- REPLACE, xem ghi chú cuối file).

BEGIN;

-- --- 1. achievement_templates — định nghĩa 1 thành tựu. ---
CREATE TABLE public.achievement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  -- NULL = đọc giả/chung (vd hàng cấp cho streak_milestones.badge_id — xem
  -- ghi chú đầu file). Cùng 3 giá trị với task_templates.for_role.
  for_role text,
  title text NOT NULL,
  description text,
  -- Tên icon (khớp bộ icon @phosphor-icons/react FE đang dùng cho quest —
  -- xem QUEST_TYPE_ICONS trong daily-tasks-tab.tsx), tự do, không enum —
  -- đổi icon không cần migration.
  icon text,
  -- Khoá tra bảng màu theo role ở tầng UI (vd 'author'/'narrator'/
  -- 'designer'/'reader') — KHÔNG lưu mã màu hex trực tiếp ở đây.
  color_token text NOT NULL,
  -- Cách TỰ ĐỘNG tính đã đạt hay chưa, dùng bởi sync_user_achievements()
  -- bên dưới. NULL = KHÔNG tự tính (thành tựu gắn qua streak_milestones.badge_id,
  -- unlock ở nơi khác — xem ghi chú đầu file). metric/threshold luôn đi
  -- cùng cặp (constraint dưới).
  metric text,
  threshold integer,
  -- Thưởng token khi unlock — 0 = chỉ huy hiệu, không thưởng gì (mặc định,
  -- vì không phải thành tựu nào cũng cần thưởng token).
  reward_tokens integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_templates_for_role_check
    CHECK (for_role IS NULL OR for_role IN ('author', 'narrator', 'designer')),
  CONSTRAINT achievement_templates_metric_check
    CHECK (metric IS NULL OR metric IN ('books_published', 'audio_published', 'design_published')),
  CONSTRAINT achievement_templates_metric_threshold_check
    CHECK ((metric IS NULL) = (threshold IS NULL)),
  CONSTRAINT achievement_templates_threshold_check CHECK (threshold IS NULL OR threshold > 0),
  CONSTRAINT achievement_templates_reward_tokens_check CHECK (reward_tokens >= 0)
);

ALTER TABLE public.achievement_templates ENABLE ROW LEVEL SECURITY;

-- Định nghĩa thành tựu không phải dữ liệu riêng tư — mọi user đăng nhập
-- cần đọc được để hiện "còn thiếu N nữa để đạt X", giống task_templates.
CREATE POLICY "authenticated users can view active achievement templates"
  ON public.achievement_templates FOR SELECT
  TO authenticated
  USING (active);

CREATE POLICY "admins manage achievement templates"
  ON public.achievement_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

-- --- 2. user_achievements — thành tựu đã unlock, ghi bởi
-- sync_user_achievements() (metric-based) hoặc thủ công bởi admin. KHÔNG
-- dùng cho thành tựu streak-linked (metric NULL) — những cái đó vẫn theo
-- dõi qua user_streak_milestone_claims, không lặp lại ở đây. ---
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievement_templates (id) ON DELETE CASCADE,
  -- NULL nếu achievement_templates.reward_tokens = 0 lúc unlock (không có
  -- giao dịch nào để gắn).
  transaction_id uuid REFERENCES public.transactions (id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view their own achievements"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins view all user achievements"
  ON public.user_achievements FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — ghi DUY NHẤT qua
-- sync_user_achievements() (security definer) bên dưới.

CREATE INDEX user_achievements_user_idx ON public.user_achievements (user_id);

-- --- 3. Ghép nối streak_milestones.badge_id — placeholder đã để sẵn từ
-- migrations/20260827_add_streak_milestones.sql, giờ FK thật vào bảng vừa
-- tạo. ---
ALTER TABLE public.streak_milestones
  ADD CONSTRAINT streak_milestones_badge_id_fkey
  FOREIGN KEY (badge_id) REFERENCES public.achievement_templates (id);

-- --- 4. sync_user_achievements() — lazy-pull, gọi mỗi khi user tải trang
-- Thành tựu (cùng cách increment_task_progress() tự tạo dòng nhiệm vụ hôm
-- nay, không cần chờ cron). Chỉ xét achievement_templates có metric (bỏ
-- qua hàng streak-linked, metric NULL — unlock ở claim_streak_milestone()),
-- và CHƯA có trong user_achievements của user này. So threshold với số
-- liệu THẬT (COUNT trực tiếp trên books/audio_narrations/design_items —
-- cùng cách tính EXISTS ở src/lib/quests/creator-roles.ts, chỉ đổi EXISTS
-- thành COUNT vì cần so ngưỡng, không chỉ có/không). Cấp + thưởng (nếu
-- reward_tokens > 0) ATOMIC trong 1 vòng lặp — apply_transaction() đã tự
-- đảm bảo an toàn số dư, không cần thêm gì. ---
CREATE FUNCTION public.sync_user_achievements(p_user_id uuid)
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

-- p_user_id trần, ghi transactions/user_achievements — chỉ service_role
-- gọi được, cùng lý do apply_transaction() (schema.sql phần 6).
REVOKE EXECUTE ON FUNCTION public.sync_user_achievements FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_achievements TO service_role;

COMMIT;

-- Notes:
-- 1. KHÔNG idempotent nếu chạy lại (CREATE TABLE/CREATE POLICY không có
--    IF NOT EXISTS/OR REPLACE ở migration này) — giống hầu hết migration
--    CREATE TABLE khác trong thư mục này, chỉ chạy 1 lần.
-- 2. Chưa seed hàng achievement_templates nào (author/narrator/designer
--    hay streak-linked) — admin tự thêm qua Supabase Studio hoặc 1
--    migration seed riêng sau. streak_milestones.badge_id vẫn NULL cho
--    tới khi admin tạo hàng achievement_templates tương ứng rồi UPDATE
--    từng streak_milestones.badge_id trỏ vào.
-- 3. Cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm 2 bảng + FK + hàm vào phần 10.
--      - src/lib/supabase/types.ts — Tables.achievement_templates,
--        Tables.user_achievements, TransactionType thêm 'achievement_bonus'.
--      - src/lib/profile.ts — TRANSACTION_TYPE_LABELS thêm 'achievement_bonus'.
--      - src/lib/quests/achievement-service.ts (mới) — gọi
--        sync_user_achievements() rồi đọc lại danh sách.
