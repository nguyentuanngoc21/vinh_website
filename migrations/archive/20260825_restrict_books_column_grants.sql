-- Migration: giới hạn UPDATE trên `books` xuống đúng các cột client được
-- phép sửa. Phát hiện lúc test RLS cho 20260824_add_book_tags_and_view_count.sql:
-- policy "authors update their own books" (auth.uid() = author_id) chỉ
-- kiểm được AI được sửa hàng, KHÔNG kiểm được CỘT NÀO bị sửa — RLS của
-- Postgres vốn không làm được việc đó ở cấp cột. Route PATCH
-- /api/authoring/books/[bookId] có lọc field (chỉ nhận title/genre/tags),
-- nhưng bất kỳ tác giả đã đăng nhập nào cũng có thể gọi thẳng REST API của
-- Supabase (anon key vốn công khai trong bundle JS + JWT session của
-- chính họ) để PATCH view_count/author_id/... bỏ qua hoàn toàn route đó.
--
-- Cách chặn đúng: REVOKE UPDATE rồi GRANT lại đúng các cột đang thật sự
-- được client sửa (đối chiếu code hiện tại — src/app/api/authoring/books/[bookId]/route.ts
-- và src/app/api/authoring/chapters/[chapterId]/route.ts):
--   - title, genre, tags — qua PATCH /api/authoring/books/[bookId]
--   - published           — tự động flip true khi publish chương đầu tiên
-- Các cột còn lại (view_count, author_id, slug, synopsis,
-- cover_design_item_id, embedding, created_at, id) KHÔNG có đường update
-- trực tiếp nào từ client trong code hiện tại — nếu sau này thêm 1 route
-- sửa cột khác (vd. synopsis), phải thêm cột đó vào GRANT ở đây, nếu
-- không route mới sẽ luôn thất bại với lỗi permission denied.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

REVOKE UPDATE ON public.books FROM authenticated, anon;

GRANT UPDATE (title, genre, tags, published) ON public.books TO authenticated;

COMMIT;

-- Notes:
-- 1. Idempotent — REVOKE không lỗi nếu privilege chưa từng được cấp,
--    GRANT chạy lại không lỗi. An toàn chạy lại nhiều lần.
-- 2. anon không được GRANT lại cột nào — anon vốn không có policy UPDATE
--    nào trên books (chỉ SELECT sách published + không policy update cho
--    anon), REVOKE ở đây chỉ để tường minh/defense-in-depth, không đổi
--    hành vi thực tế của anon.
-- 3. RLS ("authors update their own books") vẫn là lớp chặn CHÍNH — ai
--    được sửa hàng nào. GRANT cấp cột này là lớp bổ sung — sửa được CỘT
--    nào trong hàng mình được phép sửa. Cả 2 phải cùng đúng request mới
--    được phép.
-- 4. Sau khi chạy, cập nhật docs/supabase/schema.sql — thêm đoạn
--    REVOKE/GRANT này ngay sau policy "authors update their own books"
--    (phần 3). Không cần đổi src/lib/supabase/types.ts — không có cột
--    mới, chỉ đổi quyền.
