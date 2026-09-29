-- Migration: "chương đọc gần nhất" cho nút "Tiếp tục đọc" ở trang giới
-- thiệu truyện — 1 dòng/cặp (user, sách), tra được ngay (O(1)).
--
-- Cố ý là 1 bảng MỚI, KHÔNG thêm UNIQUE(user_id, book_id) vào
-- `reading_history` — bảng đó là log đầy đủ mọi lượt đọc (dùng cho
-- recommend_books() và phân tích "sách nào đọc nhiều/bỏ dở ở đâu", xem
-- docs/supabase/schema.sql phần 8), thêm UNIQUE vào đó sẽ xoá vĩnh viễn
-- lịch sử chi tiết cũ. `book_progress` chỉ giữ ĐÚNG 1 con số cần cho nút
-- "Tiếp tục đọc": chương đọc gần nhất — không nhân bản mục đích của
-- reading_history.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE TABLE IF NOT EXISTS public.book_progress (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

ALTER TABLE public.book_progress ENABLE ROW LEVEL SECURITY;

-- Giống reading_history/chapter_votes: chỉ chủ dòng đọc/ghi dòng của
-- mình. App upsert bằng onConflict: "user_id,book_id" mỗi lần tải 1 trang
-- chương (xem src/app/read/[bookSlug]/[chapterId]/page.tsx).
DROP POLICY IF EXISTS "users manage their own book progress" ON public.book_progress;
CREATE POLICY "users manage their own book progress"
  ON public.book_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- Notes:
-- 1. Idempotent (IF NOT EXISTS/DROP POLICY IF EXISTS) — chạy lại an toàn.
-- 2. Sau khi chạy, cập nhật docs/supabase/schema.sql (thêm bảng này ngay
--    sau reading_history, phần 8) + src/lib/supabase/types.ts (bảng
--    Tables.book_progress).
