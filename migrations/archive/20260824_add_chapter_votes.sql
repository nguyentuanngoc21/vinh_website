-- Migration: vote theo-chương, dạng toggle (bấm lại = bỏ vote). Bảng gốc
-- CHỈ chủ vote xem được dòng của mình (giống hệt pattern reading_history)
-- — KHÔNG ai xem được "ai đã vote gì" qua bảng gốc. Aggregate công khai đi
-- qua 1 VIEW riêng — đúng convention design_items/public_design_items đã
-- có trong schema.sql (view chạy với quyền OWNER, không bị RLS bảng gốc
-- chặn).
--
-- UI bấm vote thật (nút "Bình chọn" trên trang đọc) CHƯA nằm trong phạm vi
-- lần này — count sẽ luôn là 0 cho tới khi việc đó được xây; schema này
-- chỉ chuẩn bị trước cho đúng, để trang giới thiệu truyện có sẵn cột số để
-- hiển thị.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE TABLE IF NOT EXISTS public.chapter_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, user_id)
);

CREATE INDEX IF NOT EXISTS chapter_votes_chapter_id_idx ON public.chapter_votes (chapter_id);

ALTER TABLE public.chapter_votes ENABLE ROW LEVEL SECURITY;

-- Giống reading_history: 1 policy FOR ALL, chỉ chủ dòng đọc/ghi/xoá dòng
-- của mình. "Vote lại để hủy" = xoá dòng của chính mình, không cần policy
-- riêng cho DELETE. Không có policy "public select" trên bảng gốc.
DROP POLICY IF EXISTS "users manage their own chapter votes" ON public.chapter_votes;
CREATE POLICY "users manage their own chapter votes"
  ON public.chapter_votes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- View công khai — chỉ số đếm, không lộ user_id nào đã vote. PostgREST
-- không GROUP BY được qua .select() thường, nên aggregate ở đây (DB-side),
-- không fetch hết rows rồi tally ở JS (không scale khi vote nhiều).
CREATE OR REPLACE VIEW public.chapter_vote_counts AS
  SELECT chapter_id, count(*)::integer AS vote_count
  FROM public.chapter_votes
  GROUP BY chapter_id;

COMMIT;

-- Notes:
-- 1. Idempotent (IF NOT EXISTS/CREATE OR REPLACE/DROP POLICY IF EXISTS)
--    — chạy lại an toàn.
-- 2. Sau khi chạy, cập nhật docs/supabase/schema.sql (thêm bảng + view
--    này gần định nghĩa reading_history) + src/lib/supabase/types.ts
--    (bảng Tables.chapter_votes, view Views.chapter_vote_counts).
-- 3. Tổng vote của 1 SÁCH = SUM(vote_count) của mọi chương thuộc sách đó
--    — tính ở tầng app (query chapter_vote_counts theo danh sách
--    chapter_id rồi cộng lại), không cần 1 view/cột riêng ở cấp books.
