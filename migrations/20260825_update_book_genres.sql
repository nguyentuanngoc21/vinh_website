-- Migration: thay danh sách genre bằng taxonomy chính thức của nền tảng
-- (10 thể loại) — thay thế hoàn toàn 8 giá trị tạm lấy từ mock data ở
-- migrations/20260819_add_book_genre.sql (không phải thêm/bớt, mà đổi
-- toàn bộ danh sách).
--
-- Vẫn text + CHECK, không phải enum — đúng lý do đã nêu ở migration
-- trước: đổi/thêm giá trị chỉ cần DROP/ADD lại constraint, không phải mổ
-- lại type. Đang chứng minh đúng ngay lúc này.
--
-- Run in the Supabase SQL editor (or via psql), same as
-- 20260819_add_book_genre.sql. Test in staging first.

BEGIN;

-- Sách cũ (nếu có) đang mang 1 trong 8 giá trị cũ, không nằm trong danh
-- sách mới — set về NULL trước khi đổi constraint, để ADD CONSTRAINT
-- không lỗi vì dữ liệu hiện có không hợp lệ với constraint mới. Code sinh
-- bìa (src/lib/covers/genre-styles.ts) có fallback riêng cho genre NULL,
-- không coi đây là mất dữ liệu nghiêm trọng — chỉ là tác giả cần chọn lại
-- thể loại theo danh sách mới.
UPDATE public.books
  SET genre = NULL
  WHERE genre IS NOT NULL
    AND genre NOT IN (
      'Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám',
      'Tâm lý - tội phạm', 'Tình cảm', 'Đời sống - Xã hội',
      'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'
    );

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_genre_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_genre_check
  CHECK (genre IS NULL OR genre IN (
    'Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám',
    'Tâm lý - tội phạm', 'Tình cảm', 'Đời sống - Xã hội',
    'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'
  ));

COMMIT;

-- Notes:
-- 1. Idempotent — ADD CONSTRAINT không IF NOT EXISTS được ở Postgres cho
--    CHECK constraint, nhưng DROP CONSTRAINT IF EXISTS trước đó khiến
--    chạy lại vẫn an toàn (không lỗi "already exists").
-- 2. Sau khi chạy, cập nhật riêng (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thay đoạn CHECK cũ ở phần định nghĩa
--        books bằng constraint mới này.
--      - src/lib/supabase/types.ts — đổi union BookGenre thành đúng 10
--        giá trị mới.
--      - src/components/ui/genre-select.tsx — đổi GENRE_OPTIONS.
--      - src/lib/covers/genre-styles.ts — remap style theo 10 genre mới
--        (palette/font/hiệu ứng/layout).
--      - src/app/api/authoring/books/route.ts và
--        .../books/[bookId]/route.ts — đổi mảng VALID_GENRES validate ở
--        server.
-- 3. Nếu có sách thật đã published với genre thuộc 8 giá trị cũ trước
--    khi chạy migration này, genre của sách đó sẽ về NULL (không tự map
--    sang giá trị mới nào — không có ánh xạ 1-1 rõ ràng, ví dụ "Văn học"
--    cũ có thể hợp với cả "Đời sống - Xã hội" lẫn "Dã sử" tuỳ nội dung
--    thật) — tác giả cần vào sửa lại chọn genre mới cho đúng.
