-- Migration: albums + expanded taxonomy + soft-delete for design_items,
-- backing the Pinterest-style multi-image upload rebuild of /thiet-ke/new
-- (src/components/design/design-upload-form.tsx).
--
-- 1. design_albums — NEW table. A "board": name + art_style shared across
--    every design_items row in it. Long-lived (shows up on the public
--    /thiet-ke gallery, not just the upload form) — see design_items.album_id
--    below. No secret columns (unlike design_items.share_token), so RLS can
--    just allow public select outright — no separate public_* view needed.
-- 2. design_items.category — expanded from 4 to 14 values, ADDITIVE ONLY.
--    The mega-menu at src/components/nav-strip-links.tsx:42-59 ("Loại sản
--    phẩm") has always listed 12 product types as decorative-only content
--    (no route ever filtered by them — see that file's own comment). This
--    migration makes that list real: 'bia_truyen' and 'fan_art' are kept
--    (existing rows, just relabelled "Bìa truyện/sách"/"Fanart" in the UI
--    constant, no data change) and 10 new slugs are added for the mega-menu
--    items that had no equivalent. 'minh_hoa' and 'poster_audio' (the other
--    2 of the original 4) are kept too, unlisted in the new menu — no
--    existing row loses its category. Confirmed with product owner: additive
--    only, no remap.
-- 3. design_items.album_id / alt_text / deleted_at — new nullable columns.
--    deleted_at: soft-delete for the upload page's bulk-delete (product
--    decision: keep data, hide from view — same shape as
--    migrations/20260826_add_book_soft_delete.sql, but no separate "public
--    select" policy rewrite needed here since design_items already reads
--    through public_design_items for every public consumer).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. design_albums
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  illustrator_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  -- 10 values lifted from the mega-menu's "Phong cách nghệ thuật" column
  -- (nav-strip-links.tsx:60-73) — see src/lib/design/art-styles.ts.
  art_style text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.design_albums
    ADD CONSTRAINT design_albums_art_style_check
    CHECK (art_style IN (
      'anime_manga', 'ban_ta_thuc', 'ta_thuc', 'chibi', 'flat_vector',
      'co_trang', 'dark_fantasy', 'pixel_art', 'painterly', 'render_3d'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS design_albums_illustrator_id_idx ON public.design_albums (illustrator_id);

ALTER TABLE public.design_albums ENABLE ROW LEVEL SECURITY;

-- No secrets on this table (unlike design_items.share_token) — public
-- select is safe directly on the base table, no public_* view needed.
DROP POLICY IF EXISTS "anyone can view design albums" ON public.design_albums;
CREATE POLICY "anyone can view design albums"
  ON public.design_albums FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "illustrators insert their own design albums" ON public.design_albums;
CREATE POLICY "illustrators insert their own design albums"
  ON public.design_albums FOR INSERT
  WITH CHECK (auth.uid() = illustrator_id);

DROP POLICY IF EXISTS "illustrators update their own design albums" ON public.design_albums;
CREATE POLICY "illustrators update their own design albums"
  ON public.design_albums FOR UPDATE
  USING (auth.uid() = illustrator_id);

DROP POLICY IF EXISTS "illustrators delete their own design albums" ON public.design_albums;
CREATE POLICY "illustrators delete their own design albums"
  ON public.design_albums FOR DELETE
  USING (auth.uid() = illustrator_id);

-- ---------------------------------------------------------------------
-- 2. design_items: album_id, alt_text, deleted_at
-- ---------------------------------------------------------------------
ALTER TABLE public.design_items
  ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES public.design_albums (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alt_text text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS design_items_album_id_idx ON public.design_items (album_id) WHERE album_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Expand category taxonomy (additive — see file header)
-- ---------------------------------------------------------------------
ALTER TABLE public.design_items DROP CONSTRAINT IF EXISTS design_items_category_check;
ALTER TABLE public.design_items
  ADD CONSTRAINT design_items_category_check
  CHECK (category IS NULL OR category IN (
    'bia_truyen', 'nhan_vat_don', 'nhan_vat_nhom', 'vu_khi_trang_bi',
    'boi_canh_phong_canh', 'linh_vat', 'trang_phuc', 'chibi_deform',
    'emote_pack', 'logo_icon', 'fan_art', 'tranh_doi', 'minh_hoa', 'poster_audio'
  ));

-- ---------------------------------------------------------------------
-- 4. Soft-delete visibility — every public consumer (gallery, search,
--    comments, likes) reads public_design_items, never the base table, so
--    filtering here is enough; nothing else needs a deleted_at check added.
--    New columns appended at the end, per this view's existing column-order
--    rule (CREATE OR REPLACE VIEW cannot reorder/rename existing columns).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_design_items AS
  SELECT id, illustrator_id, title, image_url, source, created_at, category, description, share_count,
         album_id, alt_text
  FROM public.design_items
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. Column-level write grant — the base "illustrators update their own
--    design items" RLS policy (schema.sql phần 9) is row-scoped only, so
--    without this a client could PATCH share_token/image_url directly via
--    the Supabase REST API, bypassing regenerate_design_share_token() and
--    the upload route. Mirrors books' pattern
--    (migrations/20260825_restrict_books_column_grants.sql) — only lock
--    down now because album_id/alt_text/deleted_at are the first
--    design_items columns meant to be writable via a plain client update
--    (bulk-delete) rather than exclusively through app-controlled inserts.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.design_items FROM authenticated;
GRANT UPDATE (title, description, category, alt_text, album_id, deleted_at) ON public.design_items TO authenticated;

COMMIT;

-- Notes:
-- 1. Idempotent (ADD COLUMN IF NOT EXISTS / DO $$ .. EXCEPTION WHEN
--    duplicate_object / DROP POLICY IF EXISTS / CREATE OR REPLACE VIEW /
--    DROP CONSTRAINT IF EXISTS before re-ADD) — safe to run again.
-- 2. After running, update (same commit as this migration):
--    - docs/supabase/schema.sql — design_albums table + policies inserted
--      right after design_item_like_counts (phần 9), design_items ALTERs
--      right after that, public_design_items view replaced in place.
--    - src/lib/supabase/types.ts — new design_albums Row/Insert/Update,
--      design_items Row/Insert gains album_id/alt_text/deleted_at,
--      public_design_items Row gains album_id/alt_text, DesignItemCategory
--      union expanded to 14 values.
--    - src/lib/design/get-design-gallery.ts (DESIGN_CATEGORIES, 14 entries)
--      and new src/lib/design/art-styles.ts (ART_STYLES, 10 entries).
-- 3. No backfill needed — every new column is nullable/has a safe default,
--    every existing category value stays valid under the expanded CHECK.
