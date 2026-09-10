-- Migration: reply lồng 1 cấp cho anchored_comments — nền tảng cho tính
-- năng "bình luận theo đoạn" khi đọc chương (tham khảo Wattpad: mỗi đoạn
-- văn có 1 danh sách bình luận riêng, mỗi bình luận gốc có thể có reply,
-- KHÔNG cho reply-vào-reply — giới hạn 1 cấp, enforce ở API route, không
-- phải CHECK constraint DB (cần subquery để biết cha-của-cha, CHECK
-- thường không làm được việc này gọn gàng — cùng lý do các rule nghiệp vụ
-- khác trong repo nằm ở route thay vì DB, xem vd
-- api/authoring/books/[bookId]/route.ts DELETE).
--
-- parent_comment_id NULL = bình luận gốc (neo trực tiếp vào đoạn văn qua
-- paragraph_index có sẵn). NOT NULL = reply — route sẽ COPY
-- chapter_id/paragraph_index/char_start/char_end từ hàng cha khi ghi,
-- không tin giá trị client gửi cho reply (tránh anchor lệch khỏi cha).
--
-- on delete cascade — xoá 1 bình luận gốc tự xoá hết reply của nó, không
-- cần code dọn thêm. RLS 5 policy hiện có (đọc công khai, chủ sở hữu tự
-- insert/update/delete, admin for all) áp dụng nguyên vẹn cho cột mới,
-- không cần policy riêng.
--
-- Run in the Supabase SQL editor (or via psql). Idempotent.

BEGIN;

ALTER TABLE public.anchored_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.anchored_comments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS anchored_comments_parent_idx
  ON public.anchored_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

COMMIT;

-- Notes:
-- 1. Sau khi chạy, cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm cột + index vào phần 10f.
--      - src/lib/supabase/types.ts — anchored_comments Row/Insert/Update
--        thêm parent_comment_id.
-- 2. quest_id/quest_source KHÔNG đụng tới — route bình luận thường
--    (api/chapters/[chapterId]/comments) luôn ghi 2 cột đó = null, để
--    dành riêng cho tính năng "trả lời nhiệm vụ đọc-hiểu" sau này.
