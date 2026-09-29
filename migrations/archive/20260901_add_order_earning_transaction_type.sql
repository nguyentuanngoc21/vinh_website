-- Migration: thêm transaction_type = 'order_earning'.
--
-- Vế CỘNG (pending, có hold period — dùng lại chính cơ chế của
-- 'purchase_credit', xem schema.sql phần 6e) cho người cung cấp dịch vụ
-- (seller) trong hệ thống giao dịch commission (schema.sql phần 12), ghi
-- nhận TẠI THỜI ĐIỂM buyer_confirmed/auto_confirmed — KHÔNG ghi lúc đặt
-- cọc. Trước thời điểm đó tiền cọc của buyer coi như đang "trong tay Nền
-- tảng", chưa từng thuộc về seller (kể cả ở dạng pending) — xem
-- 'order_payment' (migration cùng lúc) và ghi chú trong
-- migrations/20260901_add_order_system_core.sql phần record_order_payment/
-- confirm_order_received.
--
-- Chạy riêng migration này — không gộp transaction với câu lệnh dùng giá
-- trị enum mới (xem lý do trong migrations/20260827_add_quest_reward_transaction_type.sql).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'order_earning';

-- Notes:
-- 1. Không cần BEGIN/COMMIT.
-- 2. Cập nhật docs/supabase/schema.sql phần 6 (danh sách enum
--    transaction_type) + src/lib/supabase/types.ts (union TransactionType)
--    + src/lib/profile.ts (TRANSACTION_TYPE_LABELS — Record exhaustive,
--    thiếu key này sẽ lỗi type-check).
