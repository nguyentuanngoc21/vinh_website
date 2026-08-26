-- Migration: exclusivity chuyển từ chapter-level lên book-level, và mốc
-- thời gian publish để tính rule "khoá exclusivity sau 3 ngày". Cột cũ
-- chapters.is_exclusive GIỮ NGUYÊN (không drop) — tránh migration phá
-- huỷ; app sẽ dừng đọc/viết cột đó, việc này là quyết định tầng ứng
-- dụng, không nằm trong migration.
--
-- published_at: set đúng 1 lần, tự động, lúc published false -> true,
-- và KHÔNG BAO GIỜ grant cho authenticated — cột này là mốc để tính "3
-- ngày kể từ khi publish", tác giả không được phép tự set/backdate.
-- Trigger BEFORE UPDATE vẫn cần dù không grant, vì trigger là lớp chặn
-- áp dụng cho MỌI role (kể cả nếu sau này ai đó lỡ tay GRANT UPDATE
-- (published_at) — xem prevent_unset_last_chapter cùng logic, schema.sql
-- phần chapters), RLS/GRANT không tự bảo vệ được việc này.
--
-- Rule "is_exclusive true -> false chỉ được phép nếu published_at còn
-- trong 3 ngày" KHÔNG nằm ở DB (không CHECK/trigger) — CHECK constraint
-- không dùng được cho rule phụ thuộc now() một cách có ý nghĩa (CHECK chỉ
-- chạy lúc ghi, không tự re-evaluate khi thời gian trôi qua), và admin
-- override qua service-role client phải bypass được rule này hoàn toàn —
-- service-role bypass RLS nhưng KHÔNG bypass trigger/constraint, nên nếu
-- rule nằm ở trigger, admin override sẽ bị chặn luôn cùng với author.
-- Rule này chỉ nằm ở API route (đọc published_at/is_exclusive, so với
-- now() - interval '3 days').
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cột is_exclusive + published_at trên books
-- ---------------------------------------------------------------------
-- DEFAULT true NOT NULL trong 1 câu ADD COLUMN backfill toàn bộ hàng cũ
-- về true ngay lúc chạy (Postgres 11+ chỉ ghi default vào catalog cho
-- ADD COLUMN có default + not null, không rewrite toàn bảng) — không cần
-- UPDATE backfill riêng, không cần giá trị nào khác true cho hàng cũ
-- (khớp is_exclusive mặc định true đang có trên chapters).
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT true;

-- Nullable, không default — hàng cũ giữ published_at = null (kể cả sách
-- đã published từ trước migration này). Không backdate published_at cho
-- sách cũ trong migration này — nếu cần mốc cho sách cũ, xử lý riêng
-- bằng script tay sau.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Trigger set published_at đúng 1 lần lúc publish
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_book_published_at()
RETURNS trigger AS $$
BEGIN
  IF OLD.published = false AND NEW.published = true AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_book_published_at ON public.books;
CREATE TRIGGER set_book_published_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.set_book_published_at();

-- ---------------------------------------------------------------------
-- 3. Grant — is_exclusive được tác giả tự sửa qua route (rule 3-ngày
--    enforce ở route). published_at KHÔNG có trong danh sách này, có
--    chủ đích — xem lý do ở đầu file. Danh sách này là NGUỒN THẬT hiện
--    tại, thay hẳn danh sách ở 20260825_restrict_books_column_grants.sql
--    và 20260826_add_book_soft_delete.sql.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.books FROM authenticated, anon;
GRANT UPDATE (title, genre, tags, published, deleted_at, is_exclusive) ON public.books TO authenticated;

COMMIT;

-- Notes:
-- 1. Idempotent — ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--    DROP TRIGGER IF EXISTS trước CREATE TRIGGER, REVOKE/GRANT đều an
--    toàn chạy lại.
-- 2. Trigger set_book_published_at áp dụng cho MỌI role kể cả
--    service-role — không có cách nào (kể cả admin override) set/backdate
--    published_at trực tiếp qua UPDATE; nếu cần sửa tay published_at
--    (ví dụ dữ liệu di trú), chạy UPDATE riêng không kèm published trong
--    cùng câu lệnh đó (published false->true cùng lúc sẽ bị trigger ghi
--    đè lại now()).
-- 3. Sau khi chạy, cập nhật riêng (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm 2 cột, function, trigger, và
--        GRANT mới này (thay đoạn GRANT UPDATE cũ).
--      - src/lib/supabase/types.ts — thêm `is_exclusive: boolean` và
--        `published_at: string | null` vào books.Row; is_exclusive có
--        trong Insert/Update, published_at KHÔNG có trong Insert/Update
--        (client không tự set).
--      - src/app/api/authoring/books/[bookId]/route.ts — nhận is_exclusive
--        trong PATCH, enforce rule 3-ngày (so published_at với
--        now() - interval '3 days') trước khi cho true -> false.
--      - chapters.is_exclusive không đọc/viết nữa ở code mới — rà
--        src/app/api/authoring/chapters/[chapterId]/route.ts và
--        src/components/author/{author-workspace,publish-panel}.tsx để
--        gỡ field đó khỏi UI/payload (cột DB giữ nguyên, không drop).
