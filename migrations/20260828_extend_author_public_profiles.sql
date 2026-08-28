-- Migration: mở rộng view author_public_profiles thêm bio + created_at —
-- cần để trang "Kết nối" (/ket-noi) hiện đúng tiểu sử + ngày tham gia
-- THẬT của người dùng thay vì dữ liệu mock. Cả 2 cột đều đã công khai ở
-- những nơi khác (bio hiện trên /ca-nhan chính chủ, created_at là ngày
-- tham gia — không nhạy cảm), an toàn để thêm vào view công khai này.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

DROP VIEW IF EXISTS public.author_public_profiles;

CREATE VIEW public.author_public_profiles AS
  SELECT id, username, nickname, avatar_url, cover_image_url, bio, created_at, creator_tags
  FROM public.profiles;

COMMIT;

-- Notes:
-- 1. DROP + CREATE (không ALTER VIEW ... thêm cột) vì Postgres không cho
--    ALTER VIEW đổi thứ tự/thêm cột giữa danh sách select — cách an toàn
--    nhất với 1 view đơn giản không có gì phụ thuộc ngược (không có view
--    nào khác SELECT * FROM author_public_profiles).
-- 2. Cập nhật docs/supabase/schema.sql (định nghĩa view) +
--    src/lib/supabase/types.ts (Views.author_public_profiles.Row).
-- 3. Không cần đổi RLS/GRANT gì thêm — view này vẫn chỉ lộ đúng các cột
--    đã coi là công khai, không đụng tới real_name/phone/token_balance/...
