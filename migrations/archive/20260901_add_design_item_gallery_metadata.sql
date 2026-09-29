-- Migration: real category/description/like/share data for the "Thiết kế"
-- gallery page (/thiet-ke, src/components/design/design-gallery.tsx) —
-- design_items only had title/image_url/source before this, nothing to
-- filter by category or rank by likes/shares with (see the note at
-- src/lib/design-gallery.ts's DesignPin.artistId about /thiet-ke still
-- being mock). This also backs a new independent-upload page
-- (/thiet-ke/new) — until now design_items only ever got a row from the
-- book-cover flow (source='story_upload',
-- src/app/api/authoring/books/[bookId]/cover/route.ts); illustrators had
-- no way to post standalone work despite /thiet-ke's "Đăng thiết kế" CTA.
--
-- Likes: own table (design_item_likes), toggle, base table owner-only RLS
-- — same "aggregate through its own view, base table stays owner-only"
-- pattern as chapter_votes/chapter_vote_counts
-- (migrations/20260824_add_chapter_votes.sql). Shares: a single counter
-- column bumped through a SECURITY DEFINER function — same pattern as
-- books.view_count/increment_book_view_count()
-- (migrations/20260824_add_book_tags_and_view_count.sql) — sharing isn't
-- tied to "1 action per user" the way a like is (same person can share
-- more than once, no login needed to share at all), so a per-user table
-- would be the wrong shape here.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.design_items
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.design_items
    ADD CONSTRAINT design_items_share_count_check CHECK (share_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nullable: ảnh bìa tạo tự động qua luồng story_upload (không hỏi họa sĩ
-- điền gì) không có category — chỉ nội dung đăng độc lập ở /thiet-ke/new
-- mới bắt buộc chọn (xem CHECK bên dưới). UI lọc theo category coi null
-- như "không thuộc nhóm nào" trong 4 nhóm, không hiện ở filter nào cả
-- ngoài "Tất cả".
DO $$ BEGIN
  ALTER TABLE public.design_items
    ADD CONSTRAINT design_items_category_check
    CHECK (category IS NULL OR category IN ('bia_truyen', 'minh_hoa', 'fan_art', 'poster_audio'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.design_item_likes (
  design_item_id uuid NOT NULL REFERENCES public.design_items (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (design_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS design_item_likes_design_item_id_idx ON public.design_item_likes (design_item_id);

ALTER TABLE public.design_item_likes ENABLE ROW LEVEL SECURITY;

-- Giống chapter_votes: 1 policy FOR ALL, chỉ chủ dòng đọc/ghi/xóa dòng của
-- mình. "Bấm lại để bỏ thích" = xóa dòng của chính mình, không cần policy
-- riêng cho DELETE. Không có policy "public select" trên bảng gốc.
DROP POLICY IF EXISTS "users manage their own design item likes" ON public.design_item_likes;
CREATE POLICY "users manage their own design item likes"
  ON public.design_item_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- View công khai — chỉ số đếm, không lộ ai đã thích.
CREATE OR REPLACE VIEW public.design_item_like_counts AS
  SELECT design_item_id, count(*)::integer AS like_count
  FROM public.design_item_likes
  GROUP BY design_item_id;

-- View công khai cho trang duyệt kho Thiết kế — thêm category/description/
-- share_count, CỐ Ý vẫn không có share_token (giữ nguyên lý do gốc ở
-- schema.sql phần 9: đây là view app dùng để hiện danh sách công khai).
-- Cột mới PHẢI xếp sau cùng, giữ đúng thứ tự/tên các cột cũ — CREATE OR
-- REPLACE VIEW chỉ cho phép nối thêm cột ở cuối, đổi thứ tự/tên cột cũ sẽ
-- lỗi "cannot change name of view column" (Postgres coi đó là đổi tên
-- cột, không phải thêm cột mới).
CREATE OR REPLACE VIEW public.public_design_items AS
  SELECT id, illustrator_id, title, image_url, source, created_at, category, description, share_count
  FROM public.design_items;

-- security definer: tăng share_count an toàn dưới race condition, và
-- không cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 tác phẩm/lần
-- gọi. Không yêu cầu đăng nhập (chia sẻ không cần tài khoản), giống
-- increment_book_view_count.
CREATE OR REPLACE FUNCTION public.increment_design_item_share_count(p_design_item_id uuid)
RETURNS void AS $$
  UPDATE public.design_items SET share_count = share_count + 1 WHERE id = p_design_item_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.increment_design_item_share_count(uuid) TO anon, authenticated;

COMMIT;

-- Notes:
-- 1. Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS
--    / DO $$ .. EXCEPTION WHEN duplicate_object) — chạy lại an toàn.
-- 2. Sau khi chạy, cập nhật docs/supabase/schema.sql (phần 9, ngay dưới
--    design_items/public_design_items) + src/lib/supabase/types.ts (cả
--    hai đã cập nhật sẵn trong cùng commit với migration này).
-- 3. Không cần GRANT riêng cho design_item_like_counts/public_design_items
--    — giống mọi view public khác trong schema.sql: default privileges
--    của project đã cho anon/authenticated SELECT trên view mới trong
--    schema public.
