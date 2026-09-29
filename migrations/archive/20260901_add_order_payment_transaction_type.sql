-- Migration: thêm transaction_type = 'order_payment'.
--
-- Vế TRỪ ngay-lập-tức (status='completed', KHÔNG 'pending' — hàm
-- apply_transaction() hiện tại chỉ chấp nhận pending cho khoản CỘNG, xem
-- schema.sql phần 6) của buyer khi đặt cọc/thanh toán phần còn lại cho 1
-- Order (schema.sql phần 12). Tiền rời số dư khả dụng của buyer ngay —
-- coi như đã chuyển vào "ví trung gian" của Nền tảng; nếu đơn bị hủy thì
-- hoàn lại bằng 1 giao dịch 'order_refund' riêng (thêm ở migration tính
-- năng hoàn tiền — Mục 5.1, chưa làm ở migration nền tảng này), KHÔNG
-- phải đảo ngược/sửa dòng 'order_payment' cũ (ledger bất biến).
--
-- Chạy riêng migration này — không gộp transaction với câu lệnh dùng giá
-- trị enum mới.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'order_payment';

-- Notes:
-- 1. Không cần BEGIN/COMMIT.
-- 2. Cập nhật docs/supabase/schema.sql phần 6 + src/lib/supabase/types.ts
--    + src/lib/profile.ts (TRANSACTION_TYPE_LABELS).
