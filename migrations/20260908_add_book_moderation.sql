-- Migration: mở rộng kiểm duyệt CẤP TRUYỆN (book-level) để dùng chung
-- kiến trúc với kiểm duyệt cấp chương đã có
-- (20260908_add_chapter_moderation_and_notifications.sql) — bắt buộc chọn
-- lý do khi admin "Xoá" 1 truyện ở admin/noi-dung (content-table.tsx), ghi
-- audit trail, và gửi thông báo + tin nhắn hệ thống cho tác giả giống hệt
-- luồng gỡ chương. Trước migration này, PATCH /api/admin/books/[bookId]
-- chỉ set deleted_at, KHÔNG có lý do, KHÔNG audit, KHÔNG thông báo gì cả.
--
-- books.deleted_at đã có sẵn từ 20260826_add_book_soft_delete.sql — dùng
-- lại, KHÔNG thêm removed_at riêng (tránh 2 cột cùng ý nghĩa). Chỉ thêm 3
-- cột lý do, đúng mẫu của chapters.removed_reason_*/removed_by.
--
-- Run in the Supabase SQL editor (or via psql). Idempotent — an toàn
-- chạy lại (IF NOT EXISTS / DROP POLICY IF EXISTS trước CREATE POLICY).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cột lý do trên books — song song removed_by/removed_reason_group/
--    removed_reason_detail của chapters.
-- ---------------------------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users (id),
  ADD COLUMN IF NOT EXISTS removed_reason_group text,
  ADD COLUMN IF NOT EXISTS removed_reason_detail text;

-- Tác giả không tự set được 3 cột này (chỉ admin, qua service-role bỏ
-- qua GRANT) — route tác giả (api/authoring/books/[bookId]/route.ts,
-- DELETE) chỉ set deleted_at, không đụng removed_*. Không thêm vào GRANT
-- UPDATE hiện có của authenticated.

-- ---------------------------------------------------------------------
-- 2. Audit trail — song song chapter_moderation_actions, không tái dùng
--    bảng đó vì chapter_id ở đó NOT NULL (hành động cấp chương, không
--    phải cấp truyện).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.book_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id),
  admin_id uuid NOT NULL REFERENCES auth.users (id),
  action text NOT NULL CHECK (action IN ('removed', 'restored')),
  reason_group text,
  reason_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_moderation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view book moderation actions" ON public.book_moderation_actions;
CREATE POLICY "admins view book moderation actions"
  ON public.book_moderation_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  ));

CREATE INDEX IF NOT EXISTS book_moderation_actions_book_idx
  ON public.book_moderation_actions (book_id, created_at);

COMMIT;

-- Notes:
-- 1. Sau khi chạy, cập nhật (không nằm trong file SQL này):
--      - docs/supabase/schema.sql — thêm 3 cột + bảng mới vào phần Books.
--      - src/lib/supabase/types.ts — books.Row/Insert/Update thêm
--        removed_by/removed_reason_group/removed_reason_detail;
--        book_moderation_actions table type mới.
--      - src/app/api/admin/books/[bookId]/route.ts — nhánh
--        `deleted: true` bắt buộc reasonGroup (giống
--        api/admin/chapters/[chapterId]/route.ts), ghi
--        book_moderation_actions, gửi notifications + direct_messages.
-- 2. Không có DELETE thật, không policy FOR DELETE — vẫn giữ nguyên
--    quyết định soft-delete-only của 20260826_add_book_soft_delete.sql.
