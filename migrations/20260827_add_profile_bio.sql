-- Migration: bio + nickname_updated_at trên profiles — cần để nối tab
-- "Thông tin cá nhân" (edit-profile-tab.tsx) vào DB thật thay vì state
-- mock (DEFAULT_NICKNAME/DEFAULT_BIO ở src/lib/profile.ts). nickname đã
-- có cột sẵn từ đầu, chỉ thiếu bio + cách theo dõi lần đổi nickname gần
-- nhất để enforce đúng hint UI "Có thể đổi 1 lần mỗi 30 ngày" (trước giờ
-- chỉ là text trang trí, không có gì chặn thật).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname_updated_at timestamptz;

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn.
-- 2. Cập nhật docs/supabase/schema.sql (2 cột thêm ngay sau khối
--    cccd_last4/bank_* ở phần 6, đúng vị trí các cột bổ sung sau này của
--    profiles) + src/lib/supabase/types.ts (Tables.profiles.Row/Insert).
-- 3. Không cần trigger bảo vệ như cccd_verified — bio/nickname không phải
--    cột nhạy cảm về quyền hạn, policy "update own profile" hiện có
--    (auth.uid() = id) là đủ. Cooldown 30 ngày cho nickname enforce ở
--    tầng ứng dụng (src/app/api/profile/me/route.ts), không phải DB
--    constraint — không có gì sai nếu 1 admin/service-role cần sửa tay.
