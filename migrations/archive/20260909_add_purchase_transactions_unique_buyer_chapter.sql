-- Migration: unique index chặn mua trùng 1 chương (buyer_id, chapter_id).
--
-- Bối cảnh: create_purchase() (docs/supabase/schema.sql phần 6e) tồn tại từ
-- lâu nhưng chưa route nào trong app từng gọi tới — chapters.price chỉ là
-- giá niêm yết, chưa hề được enforce lúc đọc. Route mới
-- POST /api/chapters/[chapterId]/purchase (nối RPC này vào thật) tự kiểm
-- tra "đã mua chưa" bằng 1 SELECT trước khi INSERT, nhưng đó không atomic —
-- 2 request POST gần như đồng thời (double-click, tab đúp) vẫn có thể cùng
-- lọt qua SELECT đó rồi cùng gọi create_purchase(), trừ token buyer 2 lần
-- cho đúng 1 chương. Index này là chốt chặn CUỐI CÙNG ở DB; route bắt lỗi
-- 23505 (unique_violation) từ request thua và trả về y hệt "đã sở hữu"
-- thay vì báo lỗi cho người dùng.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.
-- An toàn chạy trên bảng đã có dữ liệu — CREATE UNIQUE INDEX tự báo lỗi rõ
-- ràng nếu đã có buyer_id+chapter_id trùng nhau (chưa từng xảy ra tính tới
-- migration này, vì create_purchase() chưa từng được gọi từ ứng dụng).

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_transactions_buyer_chapter_key
  ON public.purchase_transactions (buyer_id, chapter_id);

COMMIT;

-- Notes:
-- 1. Sau khi chạy, cập nhật docs/supabase/schema.sql — thêm dòng
--    CREATE UNIQUE INDEX này ngay dưới định nghĩa bảng purchase_transactions
--    (đã làm sẵn trong cùng commit này).
-- 2. 1 buyer chỉ mua đúng 1 lần cho mỗi chương, vĩnh viễn — không có luồng
--    "mua lại"/"tặng lại quyền đọc" nào cần nhiều dòng cho cùng cặp
--    buyer_id + chapter_id.
