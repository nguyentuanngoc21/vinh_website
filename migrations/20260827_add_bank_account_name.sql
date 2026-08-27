-- Migration: tên chủ tài khoản ngân hàng — tách riêng khỏi real_name.
--
-- Thiết kế ban đầu (migrations/20260826_add_profile_bank_info.sql) ép tên
-- chủ tài khoản luôn = profiles.real_name (đã xác minh CCCD), không có
-- cột riêng. Đổi lại vì 3 lý do:
--   1. Không thể assume chủ tài khoản ngân hàng luôn là chính người lập
--      tài khoản — có thể họ mượn tài khoản người thân lúc chưa có thẻ.
--   2. Đây là thông tin do người dùng tự khai — sai thì trách nhiệm
--      thuộc về người dùng, không cần hệ thống ép khớp 1-1 với real_name.
--   3. Nhiều ngân hàng in tên KHÔNG DẤU trên sao kê/chuyển khoản — so
--      khớp cứng với real_name có dấu (từ CCCD) sẽ sai dù đúng người.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_name text;

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn.
-- 2. Cập nhật docs/supabase/schema.sql (thêm ngay sau bank_account_number
--    ở phần 6) + src/lib/supabase/types.ts (Tables.profiles.Row/Insert).
-- 3. WithdrawalService.requestWithdrawal() giờ dùng
--    profiles.bank_account_name (người dùng tự nhập, không còn ép =
--    real_name) khi gọi create_withdrawal_request — real_name vẫn giữ
--    nguyên vai trò cũ (gắn với xác minh CCCD), chỉ không còn dùng làm
--    tên tài khoản ngân hàng nữa.
