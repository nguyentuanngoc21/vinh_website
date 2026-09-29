-- Migration: cover_image_url trên profiles — ảnh bìa hiển thị trên trang
-- cá nhân/tác giả (ProfileHeader), tương tự avatar_url. Tái dùng bucket
-- "avatars" hiện có (public, RLS theo folder-per-user) thay vì tạo bucket
-- riêng — RLS đó chỉ khoá theo (storage.foldername(name))[1] = auth.uid(),
-- không khoá theo tên file, nên path "${userId}/cover-*.jpg" nằm cùng
-- folder với avatar vẫn qua được policy sẵn có mà không cần sửa gì ở
-- storage.objects. Xem src/app/api/profile/cover/route.ts.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn.
-- 2. Cập nhật docs/supabase/schema.sql (cột mới ngay sau avatar_url) +
--    src/lib/supabase/types.ts (Tables.profiles.Row/Insert +
--    Views.author_public_profiles.Row) + view author_public_profiles
--    (thêm cover_image_url vào select list, cùng cách avatar_url đã công
--    khai).
-- 3. Không cần trigger bảo vệ như cccd_verified/role — cover_image_url
--    không mang quyền hạn gì, policy "update own profile" (auth.uid() =
--    id) là đủ về mặt RLS; ghi thật vẫn qua route service-role
--    (api/profile/cover/route.ts) như mọi write khác vào profiles.
