-- Migration: thêm transaction_type = 'order_refund'.
--
-- Hoàn tiền cho buyer khi 1 Order bị hủy (Mục 5.1 đặc tả) — cộng thẳng
-- vào token_balance NGAY (status='completed', không 'pending' — tiền đã
-- từng là của buyer, hoàn lại thì có ngay, không qua hold period nào).
-- Số tiền = paid * (% theo mốc tiến độ trong refund_policy của seller,
-- nếu cancelled_by=buyer) hoặc 100% paid (nếu cancelled_by=seller) — xem
-- calculate_refund() trong migrations/20260901_add_order_cancel_system.sql.
--
-- Chạy riêng migration này — không gộp transaction với câu lệnh dùng giá
-- trị enum mới.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'order_refund';

-- Notes:
-- 1. Không cần BEGIN/COMMIT.
-- 2. Cập nhật docs/supabase/schema.sql phần 6 + src/lib/supabase/types.ts
--    + src/lib/profile.ts (TRANSACTION_TYPE_LABELS).
