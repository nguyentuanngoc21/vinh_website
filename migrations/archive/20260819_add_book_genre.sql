-- Migration: thêm genre cho books — dùng bởi hệ thống sinh bìa tự động
-- (src/lib/covers/*). Không có genre nào tồn tại trong schema trước migration
-- này; danh sách 8 giá trị lấy đúng từ field `tag` đang dùng ở mock data
-- (src/lib/books.ts) — không phát sinh taxonomy mới.
--
-- text + CHECK constraint, KHÔNG dùng enum: Postgres enum không rename/drop
-- value được mà không tái tạo type — sửa 1 giá trị sai hay thêm thể loại
-- thứ 9 sau này chỉ cần DROP/ADD lại constraint trong 1 migration nhỏ, so
-- với việc phải mổ lại type nếu là enum.
--
-- Run in the Supabase SQL editor (or via psql), same as
-- 20260807_wallet_ledger_extension.sql. Test in staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cột genre trên books
-- ---------------------------------------------------------------------
-- Nullable có chủ đích: sách hiện có chưa có genre, và code sinh bìa
-- (src/lib/covers/genre-styles.ts) có nhánh fallback riêng cho genre = null
-- thay vì database phải nói dối bằng 1 giá trị default giả.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS genre text;

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_genre_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_genre_check
  CHECK (genre IS NULL OR genre IN (
    'Ngôn tình', 'Trinh thám', 'Tản văn', 'Văn học',
    'Lịch sử', 'Kỳ ảo', 'Kinh dị', 'Phiêu lưu'
  ));

-- Cho các query lọc/thống kê theo genre sau này (không có ngay bây giờ,
-- nhưng rẻ để thêm cùng lúc và tránh 1 migration index riêng sau).
CREATE INDEX IF NOT EXISTS books_genre_idx
  ON public.books (genre) WHERE genre IS NOT NULL;

COMMIT;

-- Notes:
-- 1. Không cần RLS mới — genre là cột thường trên books, đã được các
--    policy "published books are public" / "authors update their own
--    books" (docs/supabase/schema.sql phần 3) cover sẵn. Không như
--    cover_design_item_id, genre không cần trigger chặn update trực tiếp
--    vì nó không phải link chéo bảng cần xác thực share_token.
-- 2. Idempotent toàn bộ (IF EXISTS/IF NOT EXISTS) — chạy lại an toàn.
-- 3. Sau khi chạy, cập nhật riêng (không nằm trong file SQL này, theo
--    đúng convention của 20260807_wallet_ledger_extension.sql):
--      - docs/supabase/schema.sql — thêm đoạn ALTER TABLE này gần định
--        nghĩa bảng books.
--      - src/lib/supabase/types.ts — thêm `export type BookGenre = ...`
--        và field `genre` trên books.Row/Insert/Update.
-- 4. Chưa có UI nào cho tác giả tự chọn genre (chưa có form tạo/sửa sách
--    kết nối Supabase thật) — genre chỉ set được qua SQL/script tay cho
--    tới khi luồng đó được xây (việc khác, ngoài phạm vi migration này).
