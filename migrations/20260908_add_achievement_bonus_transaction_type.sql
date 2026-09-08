-- Migration: thêm transaction_type = 'achievement_bonus' — thưởng thành
-- tựu (author/narrator/designer), tách riêng khỏi 'quest_reward' (nhiệm vụ
-- ngày) và 'streak_bonus' (mốc đọc liên tục), giống cách 3 khoản thưởng
-- đó vốn đã tách bạch nhau (xem migrations/20260827_add_streak_bonus_transaction_type.sql).
-- reference_type = 'achievement', reference_id = achievement_templates.id
-- — xem migrations/20260908_add_achievements.sql.
--
-- KHÔNG mọi thành tựu đều thưởng token (reward_tokens có thể = 0), khoản
-- này chỉ dùng khi reward_tokens > 0.
--
-- Chạy riêng migration này — không gộp transaction với câu lệnh dùng giá
-- trị enum mới (ALTER TYPE ... ADD VALUE không được phép chạy cùng
-- transaction với câu lệnh dùng giá trị đó — xem
-- migrations/20260827_add_quest_reward_transaction_type.sql). Phải chạy
-- TRƯỚC migrations/20260908_add_achievements.sql (hàm sync_user_achievements
-- ở đó dùng giá trị này).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'achievement_bonus';

-- Notes:
-- 1. Không cần BEGIN/COMMIT — xem lý do trong migration 'quest_reward' cùng cặp.
-- 2. Cập nhật src/lib/supabase/types.ts (TransactionType union) +
--    src/lib/profile.ts (TRANSACTION_TYPE_LABELS — Record<TransactionType,
--    string> là exhaustive, thiếu key này sẽ lỗi type-check).
