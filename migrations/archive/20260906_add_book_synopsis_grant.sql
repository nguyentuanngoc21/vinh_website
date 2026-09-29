-- Migration: mở GRANT UPDATE trên `books` cho cột `synopsis` — tác giả giờ
-- sửa được tóm tắt truyện ở mục "Chỉnh sửa truyện" (PATCH
-- /api/authoring/books/[bookId], xem publish-panel.tsx). Cột `synopsis`
-- vốn đã tồn tại từ đầu (docs/supabase/schema.sql phần 3) nhưng chưa từng
-- có đường update nào từ client — migrations/20260825_restrict_books_column_grants.sql
-- đã liệt kê đúng nó vào nhóm "chưa có route sửa, nếu thêm phải GRANT lại".
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

GRANT UPDATE (synopsis) ON public.books TO authenticated;

COMMIT;

-- Notes:
-- 1. Idempotent — GRANT chạy lại không lỗi. An toàn chạy lại nhiều lần.
-- 2. Không REVOKE trước — REVOKE UPDATE ON public.books lại từ đầu sẽ xoá
--    mất các cột đã GRANT bởi các migration trước (title, genre, tags,
--    published, deleted_at, is_exclusive, finalized_at — xem
--    docs/supabase/schema.sql phần 3 + các migration liên quan). GRANT
--    UPDATE (cột) chỉ CỘNG THÊM cột vào danh sách hiện có, không thay thế.
-- 3. RLS ("authors update their own books") vẫn là lớp chặn CHÍNH — ai
--    được sửa hàng nào. GRANT cấp cột này là lớp bổ sung — sửa được CỘT
--    nào trong hàng mình được phép sửa. Cả 2 phải cùng đúng request mới
--    được phép.
-- 4. Sau khi chạy, đã cập nhật docs/supabase/schema.sql — thêm `synopsis`
--    vào dòng `grant update (...)` ở phần 3 (không cần đổi
--    src/lib/supabase/types.ts — không có cột mới, chỉ đổi quyền).
