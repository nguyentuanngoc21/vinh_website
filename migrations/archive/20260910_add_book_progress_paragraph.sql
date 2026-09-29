-- Migration: nhớ ĐOẠN VĂN cụ thể người đọc dừng lại trong 1 chương, để tự
-- cuộn tới đúng chỗ khi quay lại đọc tiếp — book_progress trước đây chỉ
-- nhớ tới CHƯƠNG (chapter_id), không đủ chi tiết để tự cuộn trong 1
-- chương dài. Xem src/app/api/books/[bookId]/reading-progress/route.ts +
-- src/components/reading/reader.tsx.
--
-- last_paragraph_index NULL = chưa có dữ liệu (hàng cũ trước migration
-- này, hoặc chưa từng cuộn qua đoạn nào) — reader.tsx coi null như "bắt
-- đầu từ đầu chương", không cố cuộn tới đâu cả. Chỉ có ý nghĩa khi
-- chapter_id ở CÙNG hàng khớp đúng chương đang mở — nếu người đọc mở 1
-- chương KHÁC (kể cả cùng sách), giá trị cũ không áp dụng, route
-- reading-progress ghi đè luôn cả 2 cột cùng lúc để chúng không bao giờ
-- lệch nhau.
--
-- Run in the Supabase SQL editor (or via psql). Idempotent.

BEGIN;

ALTER TABLE public.book_progress
  ADD COLUMN IF NOT EXISTS last_paragraph_index integer CHECK (last_paragraph_index IS NULL OR last_paragraph_index >= 0);

COMMIT;

-- Notes:
-- 1. Sau khi chạy, cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm cột vào bảng book_progress.
--      - src/lib/supabase/types.ts — book_progress Row/Insert/Update.
-- 2. Không đổi RLS/GRANT — book_progress đã có policy "users manage
--    their own book progress" (FOR ALL, auth.uid()=user_id), cột mới ghi
--    được qua policy đó, không cần gì thêm. Route dùng service-role như
--    các route khác trong repo (tự resolve viewerId qua getAuthedUserId()).
