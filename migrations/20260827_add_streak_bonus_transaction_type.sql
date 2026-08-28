-- Migration: thêm transaction_type = 'streak_bonus' — tách riêng khỏi
-- 'quest_reward' (migrations/20260827_add_quest_reward_transaction_type.sql).
--
-- Streak bonus (đọc liên tục N ngày, kiểu Duolingo) là 1 khoản thưởng
-- KHÁC bản chất với thưởng hoàn thành 1 quest cụ thể — không gắn với
-- task_templates/hidden_quests nào, chỉ gắn với chuỗi ngày liên tục của
-- user. Tách type riêng để báo cáo/đối soát không lẫn 2 khoản này, giống
-- cách purchase_chapter/purchase_credit được tách bạch (xem schema.sql
-- phần 6). reference_type = 'streak_milestone', reference_id =
-- streak_milestones.id — xem migrations/20260827_add_streak_milestones.sql.
--
-- Chạy riêng migration này — không gộp transaction với câu lệnh dùng giá
-- trị enum mới (xem lý do trong 20260827_add_quest_reward_transaction_type.sql).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'streak_bonus';

-- Notes:
-- 1. Không cần BEGIN/COMMIT — xem lý do trong migration 'quest_reward' cùng cặp.
-- 2. Cập nhật src/lib/supabase/types.ts: thêm 'streak_bonus' vào union
--    TransactionType, và src/lib/profile.ts (TRANSACTION_TYPE_LABELS —
--    Record<TransactionType, string> là exhaustive, thiếu key này sẽ lỗi
--    type-check).
