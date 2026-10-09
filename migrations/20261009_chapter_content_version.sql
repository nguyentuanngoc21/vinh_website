-- Optimistic concurrency for the chapter editor: content_version goes up on
-- every title/content change, whoever writes it (editor autosave, a second
-- tab, manuscript tools). PATCH /api/authoring/chapters/[chapterId] takes
-- expected_version and answers 409 instead of silently overwriting.
-- Safe to rerun.
begin;

alter table public.chapters add column if not exists content_version integer not null default 0;
-- chapters uses column-level SELECT grants (20261002_chapter_content_access.sql).
grant select (content_version) on public.chapters to anon, authenticated;

-- Clients cannot set the counter: the trigger always derives it.
create or replace function public.bump_chapter_content_version() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 0;
  elsif new.content is distinct from old.content or new.title is distinct from old.title then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end $$;
drop trigger if exists chapter_content_version_bump on public.chapters;
create trigger chapter_content_version_bump before insert or update on public.chapters
for each row execute function public.bump_chapter_content_version();

commit;
-- Notes: mirrored in baseline/02_books_and_chapters.sql (the column grant comes
-- from baseline/15_chapter_content_access.sql); regenerate schema.sql. Update
-- supabase/types.ts (chapters.content_version). Code: api/authoring/chapters/[chapterId]
-- (PATCH expected_version → 409), author/[bookId]/[chapterId]/page.tsx, author-workspace.tsx.
