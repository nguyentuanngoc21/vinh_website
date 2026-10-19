-- Admin repair: run manually in Supabase SQL Editor, NOT as a migration.
-- Replace BOTH UUIDs below with the chapter ID and its book ID.
-- All statements must run together. If an error occurs, run ROLLBACK.
BEGIN;

-- Prevent other writers from updating chapters while the guard is disabled.
LOCK TABLE public.chapters IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.chapters DISABLE TRIGGER prevent_unset_last_chapter;

DO $$
DECLARE
  target_chapter_id uuid := '00000000-0000-0000-0000-000000000000';
  target_book_id uuid := '00000000-0000-0000-0000-000000000000';
  affected integer;
BEGIN
  UPDATE public.chapters
  SET is_last_chapter = false
  WHERE id = target_chapter_id
    AND book_id = target_book_id
    AND is_last_chapter = true;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Expected one marked last chapter; check both IDs (updated %)', affected;
  END IF;
END;
$$;

ALTER TABLE public.chapters ENABLE TRIGGER prevent_unset_last_chapter;
COMMIT;
