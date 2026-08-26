-- Migration: soft-delete cho books. KHÔNG có DELETE thật, không policy
-- delete, không GRANT delete ở đâu cả — chỉ set deleted_at, giữ nguyên
-- hàng. Điều kiện được phép xoá (chưa published, hoặc published nhưng
-- không exclusive; và không có purchase_transactions nào của chương
-- thuộc sách này) được kiểm ở API route (session-bound client), KHÔNG ở
-- RLS/constraint DB — purchase_transactions.chapter_id là uuid trần,
-- không FK tới chapters (xem docs/supabase/schema.sql phần
-- purchase_transactions), nên không có cách join sạch ở DB để
-- CHECK/trigger enforce việc này; và ngay cả nếu có FK, rule này phụ
-- thuộc business logic (exclusive hay không) chứ không phải bất biến dữ
-- liệu — hợp lý hơn khi nằm ở route.
--
-- Run in the Supabase SQL editor (or via psql), same as
-- 20260825_update_book_genres.sql. Test in staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cột deleted_at trên books
-- ---------------------------------------------------------------------
-- NULL = chưa xoá (mặc định, không backfill gì cho hàng cũ). Không dùng
-- boolean is_deleted riêng — deleted_at vừa là cờ vừa là mốc thời gian,
-- đỡ phải thêm 1 cột nữa nếu sau này cần hiển thị "đã xoá lúc nào".
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Ẩn sách đã xoá khỏi visibility công khai
-- ---------------------------------------------------------------------
-- auth.uid() = author_id KHÔNG bị thêm điều kiện deleted_at is null —
-- tác giả (và admin qua service-role) vẫn phải thấy được sách đã xoá để
-- khôi phục. Chỉ điều kiện "published" (khách công khai) mới bị chặn.
DROP POLICY IF EXISTS "published books are public" ON public.books;
CREATE POLICY "published books are public"
  ON public.books FOR SELECT
  USING ((published AND deleted_at IS NULL) OR auth.uid() = author_id);

DROP POLICY IF EXISTS "published chapters follow their book's visibility" ON public.chapters;
CREATE POLICY "published chapters follow their book's visibility"
  ON public.chapters FOR SELECT
  USING (
    published AND EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_id AND b.published AND b.deleted_at IS NULL
    )
    OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.author_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 3. Grant cột — tác giả được tự set/unset deleted_at qua route, cùng cơ
--    chế với title/genre/tags/published (xem
--    20260825_restrict_books_column_grants.sql). RLS ("authors update
--    their own books") vẫn là lớp chặn hàng; route giữ business rule
--    (không published/exclusive nào bị xoá, không có purchase nào).
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.books FROM authenticated, anon;
GRANT UPDATE (title, genre, tags, published, deleted_at) ON public.books TO authenticated;

COMMIT;

-- Notes:
-- 1. Idempotent — ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS trước
--    CREATE POLICY, REVOKE/GRANT chạy lại không lỗi. An toàn chạy lại.
-- 2. Không có DELETE thật, không policy FOR DELETE, không GRANT DELETE —
--    đúng quyết định soft-delete-only. Route xoá dùng
--    .update({ deleted_at: new Date().toISOString() }), không .delete().
-- 3. Sau khi chạy, cập nhật riêng (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm cột deleted_at + 2 policy mới
--        (thay bản cũ) vào phần Books & chapters.
--      - src/lib/supabase/types.ts — thêm `deleted_at: string | null` vào
--        books.Row/Insert/Update.
--      - API route xoá sách (src/app/api/authoring/books/[bookId]/route.ts,
--        DELETE) — enforce điều kiện: not published OR (published AND
--        not is_exclusive), VÀ không có purchase_transactions.chapter_id
--        nào khớp chapter của sách này (query riêng, không FK, kiểm ở JS).
--      - src/app/author/layout.tsx, src/app/author/page.tsx,
--        src/app/author/[bookId]/page.tsx: lọc/chặn deleted_at is not
--        null ở phía author (không chỉ dựa RLS ẩn khách công khai).
