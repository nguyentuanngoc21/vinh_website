-- Story terms: places, items, skills, organizations… per book — the non-
-- character half of the editor's "Nhập nhanh" quick insert (characters stay in
-- public.characters). Author-only: nothing here is shown to readers yet.
-- Safe to rerun.
begin;

create table if not exists public.story_terms (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  kind text not null default 'other' check (kind in ('place', 'item', 'skill', 'organization', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  aliases text check (char_length(aliases) <= 200),
  description text check (char_length(description) <= 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, name)
);
create index if not exists story_terms_book_id_idx on public.story_terms (book_id);

alter table public.story_terms enable row level security;
drop policy if exists "authors manage terms in their own books" on public.story_terms;
create policy "authors manage terms in their own books" on public.story_terms for all
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null))
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null));

revoke all on public.story_terms from anon;
revoke truncate, references, trigger on public.story_terms from public, authenticated;
grant select, insert, delete on public.story_terms to authenticated;
-- A term never moves to another book; only these columns are editable.
revoke update on public.story_terms from authenticated;
grant update (kind, name, aliases, description, pinned) on public.story_terms to authenticated;
grant all on public.story_terms to service_role;

create or replace function public.touch_story_term() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists story_terms_touch on public.story_terms;
create trigger story_terms_touch before update on public.story_terms
for each row execute function public.touch_story_term();

commit;
-- Notes: mirrored in baseline/02_books_and_chapters.sql; regenerate schema.sql.
-- Update supabase/types.ts (story_terms). Code: lib/story-terms.ts,
-- api/authoring/books/[bookId]/terms (+ [termId]), components/author/quick-insert.tsx,
-- chapter-editor.tsx, author-workspace.tsx, author/[bookId]/[chapterId]/page.tsx.
