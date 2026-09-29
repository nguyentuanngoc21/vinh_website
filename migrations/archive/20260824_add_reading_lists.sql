-- Migration: "danh sách đọc" kiểu playlist YouTube — mỗi danh sách chứa
-- nguyên SÁCH (không phải chương lẻ), 1 người dùng có nhiều danh sách.
-- 2 bảng: reading_lists (metadata danh sách) + reading_list_items (sách
-- nào nằm trong danh sách nào), giống quan hệ books/chapters — 1 bảng cha
-- + 1 bảng con FK vào cha.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reading_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reading_lists_user_id_idx ON public.reading_lists (user_id);

ALTER TABLE public.reading_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own reading lists" ON public.reading_lists;
CREATE POLICY "users manage their own reading lists"
  ON public.reading_lists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.reading_list_items (
  list_id uuid NOT NULL REFERENCES public.reading_lists (id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, book_id)
);

CREATE INDEX IF NOT EXISTS reading_list_items_book_id_idx ON public.reading_list_items (book_id);

ALTER TABLE public.reading_list_items ENABLE ROW LEVEL SECURITY;

-- Không có user_id trực tiếp trên bảng này — ownership đi qua
-- list_id -> reading_lists.user_id, giống pattern "chapters" join tới
-- "books.author_id" (docs/supabase/schema.sql phần 3, policy "published
-- chapters follow their book's visibility"). Đây là defense-in-depth:
-- route API thật (add/remove item) dùng service-role client, tự kiểm tra
-- reading_lists.user_id = userId đã resolve qua getAuthedUserId() trước
-- khi ghi — không dựa vào auth.uid() ở policy này.
DROP POLICY IF EXISTS "users manage items in their own reading lists" ON public.reading_list_items;
CREATE POLICY "users manage items in their own reading lists"
  ON public.reading_list_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.reading_lists rl WHERE rl.id = list_id AND rl.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reading_lists rl WHERE rl.id = list_id AND rl.user_id = auth.uid()));

COMMIT;

-- Notes:
-- 1. Idempotent — chạy lại an toàn.
-- 2. Cập nhật docs/supabase/schema.sql (thêm ngay sau bảng book_progress,
--    phần 8 — cùng nhóm "quan hệ user-sách") + src/lib/supabase/types.ts
--    (Tables.reading_lists, Tables.reading_list_items).
-- 3. KHÔNG lọc sách unpublished khỏi reading_list_items ở tầng DB — nếu
--    một sách trong danh sách sau này bị gỡ publish, dòng item vẫn còn;
--    xử lý (ẩn/đánh dấu) để ở tầng UI của 1 trang "danh sách đọc của tôi"
--    trong tương lai, chưa cần trong phạm vi lần này (chỉ có luồng
--    thêm/bớt từ trang đọc).
