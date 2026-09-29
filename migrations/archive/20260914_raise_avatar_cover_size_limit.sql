-- Avatar/ảnh bìa giờ upload thẳng lên Storage qua signed upload URL (xem
-- src/app/api/profile/avatar/route.ts, src/app/api/profile/cover/route.ts)
-- thay vì qua Next.js Function — bỏ được giới hạn cứng ~4.5MB body request
-- của Vercel Serverless Functions. Chốt chặn kích thước file giờ chuyển
-- xuống bucket Storage: 15MB/file, chỉ nhận jpg/png/webp.
--
-- Idempotent — chạy lại không lỗi.
update storage.buckets
set
  file_size_limit = 15728640, -- 15MB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
