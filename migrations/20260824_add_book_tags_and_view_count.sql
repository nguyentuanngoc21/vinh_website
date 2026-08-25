-- Migration: tags tự do (KHÁC genre — genre vẫn 1 giá trị/sách, không đổi)
-- + đếm lượt xem cho books. Phục vụ trang giới thiệu truyện /truyen/[slug].
--
-- Run in the Supabase SQL editor (or via psql), same as
-- 20260819_add_book_genre.sql / 20260820_add_chapter_price.sql. Test in
-- staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tags tự do trên books
-- ---------------------------------------------------------------------
-- Khác genre (1 giá trị, danh sách cố định 8 thể loại) — tags là nhiều
-- giá trị, do TÁC GIẢ tự định nghĩa (free text, không có bảng tags dùng
-- chung/chuẩn hoá). Đơn giản hơn 1 bảng many-to-many vì không có nhu cầu
-- lọc/tìm kiếm theo tag ở phạm vi lần này — nếu sau này cần trang "duyệt
-- theo tag", tách ra bảng riêng lúc đó.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_tags_length_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_tags_length_check CHECK (cardinality(tags) <= 20);

-- ---------------------------------------------------------------------
-- 2. Lượt xem
-- ---------------------------------------------------------------------
-- Đặt trên `books` (tổng), không phải per-chapter rồi SUM lúc đọc — trang
-- chi tiết truyện chỉ cần 1 số duy nhất, và +1 trên 1 cột books là rẻ hơn
-- ghi/SUM qua N chapters mỗi request. Tăng mỗi lần tải trang chương,
-- KHÔNG khử trùng lặp (đơn giản nhất, theo đúng quyết định sản phẩm).
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_view_count_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_view_count_check CHECK (view_count >= 0);

-- security definer: increment an toàn dưới race condition (nhiều người
-- đọc cùng lúc), và không cho client tự set view_count bằng bất kỳ số
-- nào — chỉ +1 đúng 1 sách published/lần gọi. Đây là escape hatch DUY
-- NHẤT để đổi cột này — không có policy update nào trên books cho phép
-- ai tăng cột này trực tiếp qua .update().
CREATE OR REPLACE FUNCTION public.increment_book_view_count(p_book_id uuid)
RETURNS void AS $$
  UPDATE public.books SET view_count = view_count + 1
  WHERE id = p_book_id AND published;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.increment_book_view_count(uuid) TO anon, authenticated;

COMMIT;

-- Notes:
-- 1. Không cần RLS mới để ĐỌC 2 cột này — "published books are public"
--    (schema.sql phần 3) đã cover mọi cột trên books, kể cả cột mới.
-- 2. Idempotent (IF NOT EXISTS/IF EXISTS/CREATE OR REPLACE) — chạy lại an toàn.
-- 3. Sau khi chạy, cập nhật riêng (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm đoạn ALTER TABLE + hàm này gần
--        định nghĩa bảng books.
--      - src/lib/supabase/types.ts — thêm `tags`/`view_count` trên
--        books.Row (view_count KHÔNG thêm vào Insert/Update — client
--        không tự set được, chỉ tăng qua RPC).
