-- Migration: trạng thái "nhận comm" cho từng gói dịch vụ
-- (service_listings) — độc lập với is_accepting_orders (trạng thái
-- xuất bản/nhận đơn hiện có, gate bởi 11 mục bắt buộc — xem
-- src/lib/orders/service-listing-service.ts computeMissingFields()).
--
-- monthly_commission_limit — mục 12 trong form chỉnh sửa gói dịch vụ
-- (services-tab.tsx), KHÔNG bắt buộc để bật is_accepting_orders (quyết
-- định đã chốt với admin — mục 12 chỉ phục vụ riêng tính năng nhận-comm).
-- is_accepting_commissions — toggle riêng, mặc định tắt. Route PATCH
-- (api/profile/services/[listingId]/route.ts) sẽ chặn bật cột này nếu
-- monthly_commission_limit đang null.
--
-- Đếm "đang nhận bao nhiêu comm" theo TỪNG gói dịch vụ riêng (không cộng
-- dồn theo người) — count(*) from orders where listing_id=:x and
-- status='in_progress', tính trực tiếp lúc đọc (không cache cột riêng),
-- xem src/lib/orders/service-listing-service.ts getActiveCommissionCount().
--
-- Run in the Supabase SQL editor (or via psql). Idempotent.

BEGIN;

ALTER TABLE public.service_listings
  ADD COLUMN IF NOT EXISTS monthly_commission_limit integer,
  ADD COLUMN IF NOT EXISTS is_accepting_commissions boolean NOT NULL DEFAULT false;

ALTER TABLE public.service_listings
  ADD CONSTRAINT service_listings_monthly_commission_limit_check
  CHECK (monthly_commission_limit IS NULL OR monthly_commission_limit > 0);

COMMIT;

-- Notes:
-- 1. Sau khi chạy, cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm 2 cột + check vào bảng service_listings.
--      - src/lib/supabase/types.ts — service_listings Row/Insert/Update.
--      - api/profile/services/[listingId]/route.ts — cho phép PATCH
--        monthlyCommissionLimit/isAcceptingCommissions, chặn bật
--        is_accepting_commissions khi limit null.
-- 2. Idempotent — IF NOT EXISTS trên ADD COLUMN; ADD CONSTRAINT lỗi nếu
--    chạy lại lần 2 (không tự chống trùng, giống các migration ADD
--    CONSTRAINT khác trong thư mục này).
-- 3. Không đổi GRANT/RLS của service_listings — đã xác nhận bảng này
--    không có GRANT cột riêng (chỉ RLS hàng chuẩn "sellers manage their
--    own listings"/"public can view listings accepting orders"), 2 cột
--    mới ghi được qua route hiện có không cần GRANT thêm.
