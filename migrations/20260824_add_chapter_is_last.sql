-- Migration: cờ "chương cuối" — checkbox 1 chiều trong chapter-editor.tsx,
-- dùng để tính trạng thái "Đã hoàn thành" ở trang giới thiệu truyện. Tối đa
-- 1 chương/sách được true, và true KHÔNG được đổi lại false. Chặn ở
-- TRIGGER (áp dụng cho MỌI writer, kể cả service-role key — không như RLS,
-- trigger không bị bypass) VÀ ở API route (defense-in-depth, xem
-- src/app/api/authoring/chapters/[chapterId]/route.ts) để trả lỗi tiếng
-- Việt gọn thay vì để lộ exception thô của Postgres.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS is_last_chapter boolean NOT NULL DEFAULT false;

-- Partial unique index — CHECK thường không so sánh được giữa các hàng
-- khác nhau, nên phải dùng unique index lọc theo điều kiện.
CREATE UNIQUE INDEX IF NOT EXISTS chapters_one_last_chapter_per_book_idx
  ON public.chapters (book_id) WHERE is_last_chapter;

CREATE OR REPLACE FUNCTION public.prevent_unset_last_chapter()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_last_chapter = true AND NEW.is_last_chapter = false THEN
    RAISE EXCEPTION 'is_last_chapter is irreversible once set to true (chapter %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_unset_last_chapter ON public.chapters;
CREATE TRIGGER prevent_unset_last_chapter
  BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unset_last_chapter();

COMMIT;

-- Notes:
-- 1. Không cần RLS mới để đọc — chính sách select hiện tại trên chapters
--    (phần 3, docs/supabase/schema.sql) đã cover cột mới này.
-- 2. Concurrency: nếu 2 chương cùng sách bị set true gần như đồng thời,
--    1 trong 2 lãnh lỗi unique_violation (mã 23505) từ
--    chapters_one_last_chapter_per_book_idx — API route map lỗi này
--    thành 409 với message tiếng Việt thân thiện.
-- 3. Idempotent (IF NOT EXISTS/IF EXISTS/CREATE OR REPLACE/DROP...IF EXISTS)
--    — chạy lại an toàn.
-- 4. Sau khi chạy, cập nhật docs/supabase/schema.sql + src/lib/supabase/types.ts
--    (thêm `is_last_chapter` vào chapters.Row/Insert).
