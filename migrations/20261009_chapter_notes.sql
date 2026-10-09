-- Private per-chapter notes / outline ("Ghi chú & dàn ý") for the author —
-- never shown to readers. Retention: notes go when the chapter's content is
-- purged (same as chapter_versions). Safe to rerun.
begin;

create table if not exists public.chapter_notes (
  chapter_id uuid primary key references public.chapters (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now()
);

alter table public.chapter_notes enable row level security;
drop policy if exists "authors manage notes on their own chapters" on public.chapter_notes;
create policy "authors manage notes on their own chapters" on public.chapter_notes for all
  using (exists (select 1 from public.chapters c join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid() and b.deleted_at is null))
  with check (exists (select 1 from public.chapters c join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid() and b.deleted_at is null));

revoke all on public.chapter_notes from anon;
revoke truncate, references, trigger on public.chapter_notes from public, authenticated;
grant select, insert, update, delete on public.chapter_notes to authenticated;
grant all on public.chapter_notes to service_role;

create or replace function public.purge_chapter_notes() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.content_purged_at is not null and old.content_purged_at is null then
    delete from public.chapter_notes where chapter_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.purge_chapter_notes() from public, anon, authenticated;
drop trigger if exists chapter_purge_notes on public.chapters;
create trigger chapter_purge_notes after update of content_purged_at on public.chapters
for each row execute function public.purge_chapter_notes();

commit;
-- Notes: mirrored in baseline/12_content_retention.sql (trigger needs content_purged_at); regenerate schema.sql. Update
-- supabase/types.ts (chapter_notes). Code: api/authoring/chapters/[chapterId]/notes,
-- components/author/chapter-notes-panel.tsx, author-workspace.tsx (PublishPanel section).
