-- Migration: theo dõi tác giả, dạng toggle (giống chapter_votes). Composite
-- PK (follower_id, author_id) thay vì id + unique constraint riêng — giống
-- book_progress, không có bảng nào khác cần FK trỏ vào 1 dòng follow.
-- CHECK follower_id <> author_id là defense-in-depth ở tầng DB — UI ẨN nút
-- Theo dõi trên sách của chính tác giả, route API cũng tự chặn tay, nhưng
-- vẫn cần chặn ở DB phòng trường hợp gọi thẳng API/service-role sai.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE TABLE IF NOT EXISTS public.author_follows (
  follower_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, author_id),
  CONSTRAINT author_follows_no_self_follow CHECK (follower_id <> author_id)
);

CREATE INDEX IF NOT EXISTS author_follows_author_id_idx ON public.author_follows (author_id);

ALTER TABLE public.author_follows ENABLE ROW LEVEL SECURITY;

-- Chỉ chủ dòng (người follow) đọc/ghi/xoá dòng của mình — giống
-- reading_history/chapter_votes/book_progress. KHÔNG có policy cho tác
-- giả xem "ai đang follow mình" — chưa cần trong phạm vi lần này (đã xác
-- nhận: không hiển thị follower count/list ở đâu cả).
DROP POLICY IF EXISTS "followers manage their own follow rows" ON public.author_follows;
CREATE POLICY "followers manage their own follow rows"
  ON public.author_follows FOR ALL
  USING (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id AND follower_id <> author_id);

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn.
-- 2. Cập nhật docs/supabase/schema.sql (thêm ngay sau bảng "profiles",
--    phần 1 — đây là quan hệ profile-to-profile, không thuộc phần 3
--    books/chapters) + src/lib/supabase/types.ts (Tables.author_follows).
-- 3. Route API toggle (POST /api/authors/[authorId]/follow) dùng
--    service-role client + userId đã resolve qua getAuthedUserId(), NÊN
--    RLS ở trên chỉ là defense-in-depth, không phải cơ chế chặn chính.
