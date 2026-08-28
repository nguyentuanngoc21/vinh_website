-- Migration: thêm transaction_type = 'streak_rescue' — khoản TRỪ token khi
-- user trả token để cứu streak sau khi lỡ 1 ngày và hết thẻ nghỉ miễn phí
-- (rescue_streak_with_tokens(), xem
-- migrations/20260827_add_streak_sync_functions.sql). Tách khỏi
-- 'streak_bonus' (cộng token khi đạt mốc) — 1 khoản trừ, 1 khoản cộng,
-- không nên chung 1 type vì dấu amount khác nhau đã đủ phân biệt về mặt
-- kỹ thuật, nhưng tách type riêng để báo cáo/đối soát đọc trực quan hơn,
-- giống cách purchase_chapter (trừ) và purchase_credit (cộng) đã tách.
--
-- Chạy riêng migration này — không gộp transaction với câu lệnh dùng giá
-- trị enum mới.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'streak_rescue';

-- Notes:
-- 1. Không cần BEGIN/COMMIT — xem lý do trong 20260827_add_quest_reward_transaction_type.sql.
-- 2. Cập nhật src/lib/supabase/types.ts (union TransactionType) và
--    src/lib/profile.ts (TRANSACTION_TYPE_LABELS — exhaustive Record).
