-- Per-chapter background image shown behind the reader text (under the
-- author-name watermark). The file lives in the public design-images bucket,
-- carries the "no AI training" XMP, and is uploaded only via
-- POST /api/authoring/chapters/[chapterId]/background. Safe to rerun.
begin;

alter table public.chapters add column if not exists background_image_path text;
-- chapters uses column-level SELECT grants (20261002_chapter_content_access.sql).
grant select (background_image_path) on public.chapters to anon, authenticated;

-- Authors may update their chapters directly (RLS), so pin the path to the
-- book author's own upload folder and the route's file-name pattern: a chapter
-- can never point at someone else's image.
create or replace function public.check_chapter_background_path() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_author uuid;
begin
  if new.background_image_path is null then return new; end if;
  select author_id into v_author from public.books where id = new.book_id;
  if v_author is null or new.background_image_path !~ ('^' || v_author::text || '/chapter-bg-' || new.id::text || '-[0-9]{1,16}\.(webp|png)$') then
    raise exception 'Invalid chapter background path' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists chapter_background_path_check on public.chapters;
create trigger chapter_background_path_check before insert or update of background_image_path on public.chapters
for each row execute function public.check_chapter_background_path();

commit;
-- Notes: mirrored in baseline/02_books_and_chapters.sql (the column grant comes
-- from baseline/15_chapter_content_access.sql); regenerate schema.sql. Update
-- supabase/types.ts (chapters.background_image_path). Code: lib/chapter-background.ts,
-- api/authoring/chapters/[chapterId]/background, components/author/chapter-background-panel.tsx,
-- author/[bookId]/[chapterId]/page.tsx, read/[bookSlug]/[chapterId]/page.tsx, reading/reader.tsx.
