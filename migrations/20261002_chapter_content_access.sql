-- Migration: chặn đọc thẳng nội dung chương qua REST API.
--
-- Lỗ hổng: anon/authenticated có quyền SELECT mặc định trên TOÀN BẢNG
-- public.chapters (không có GRANT/REVOKE nào trước đây). RLS chỉ lọc theo HÀNG
-- (chương đã xuất bản của truyện công khai) chứ không theo cột, nên ai có anon
-- key (công khai trong bundle JS) cũng đọc được chapters.content của mọi
-- chương có giá chưa mua:
--   GET /rest/v1/chapters?select=content&id=eq.<id>
--
-- Sửa: thu hồi SELECT toàn bảng, cấp lại SELECT từng cột TRỪ `content`. Nội
-- dung chương giờ chỉ đọc được qua server (service-role) SAU khi route đã kiểm
-- quyền: trang đọc /read/[bookSlug]/[chapterId], API đọc mobile, trang soạn
-- chương của tác giả, API bản thảo. INSERT/UPDATE `content` vẫn giữ nguyên
-- (tác giả lưu chương qua RLS như cũ) — chỉ không được đọc lại cột đó.
--
-- Danh sách cột lấy từ information_schema lúc chạy (không viết cứng), để không
-- sót cột nếu production có cột khác baseline. Cột THÊM MỚI về sau sẽ KHÔNG tự
-- có quyền SELECT cho anon/authenticated — migration thêm cột chapters phải tự
-- `grant select (<cột>) on public.chapters to anon, authenticated;`.
--
-- Mọi hàm SQL đọc chapters.content đều SECURITY DEFINER (không bị ảnh hưởng).
-- Chạy ở dev/staging trước, test bằng
-- docs/supabase/tests/20261002_chapter_content_access.test.sql, rồi thử trên
-- web: tạo truyện mới, thêm chương, lưu nháp/xuất bản, mở trang soạn chương,
-- đọc chương (cả mobile).

BEGIN;

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name <> 'content';

  EXECUTE 'REVOKE SELECT ON public.chapters FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.chapters TO anon, authenticated', v_cols);
END;
$$;

COMMIT;

-- Notes — cập nhật cùng lúc:
-- - migrations/baseline/15_chapter_content_access.sql (cùng khối DO) rồi
--   `npm run build-schema`.
-- - Code đọc content bằng service-role sau khi kiểm quyền:
--   src/app/author/[bookId]/[chapterId]/page.tsx,
--   src/lib/authoring/workspace.ts (getAuthorChapter),
--   src/app/api/mobile/chapters/[chapterId]/route.ts;
--   src/app/api/authoring/chapters/[chapterId]/route.ts bỏ content khỏi RETURNING.
-- - Không cần đổi src/lib/supabase/types.ts (kiểu cột không đổi).
