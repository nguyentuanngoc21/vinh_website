-- Character mention scan: the author reviews scan suggestions; confirmed
-- own-book chapters become chapter_characters tags, everything else is
-- remembered here so later scans skip it.
-- Apply after 20260930_character_management.sql. Safe to rerun.
begin;

-- How a character appears in ANOTHER book of the same author: 'main' lists
-- confirmed chapters, 'cameo' lists only the book title, 'dismissed' hides it
-- from future scans. The character's own book never has a row.
create table if not exists public.character_book_links (
  character_id uuid not null references public.characters (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  appearance text not null check (appearance in ('main', 'cameo', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, book_id)
);
create index if not exists character_book_links_book_id_idx on public.character_book_links (book_id);

-- Per-chapter decisions. Own-book chapters only ever hold 'dismissed'
-- (confirmed ones live in chapter_characters); other books' chapters hold both.
create table if not exists public.character_chapter_reviews (
  character_id uuid not null references public.characters (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  decision text not null check (decision in ('confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (character_id, chapter_id)
);
create index if not exists character_chapter_reviews_chapter_id_idx on public.character_chapter_reviews (chapter_id);

alter table public.character_book_links enable row level security;
alter table public.character_chapter_reviews enable row level security;

drop policy if exists "authors read their characters' book links" on public.character_book_links;
create policy "authors read their characters' book links" on public.character_book_links for select
  using (exists (select 1 from public.characters c join public.books b on b.id = c.book_id
    where c.id = character_id and b.author_id = auth.uid() and b.deleted_at is null));
drop policy if exists "authors read their characters' chapter reviews" on public.character_chapter_reviews;
create policy "authors read their characters' chapter reviews" on public.character_chapter_reviews for select
  using (exists (select 1 from public.characters c join public.books b on b.id = c.book_id
    where c.id = character_id and b.author_id = auth.uid() and b.deleted_at is null));

-- Writes only through review_character_appearances.
revoke insert, update, delete, truncate, references, trigger on public.character_book_links from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.character_chapter_reviews from public, anon, authenticated;
revoke all on public.character_book_links from anon;
revoke all on public.character_chapter_reviews from anon;
grant select on public.character_book_links, public.character_chapter_reviews to authenticated;
grant all on public.character_book_links, public.character_chapter_reviews to service_role;

create or replace function public.review_character_appearances(
  p_character_id uuid,
  p_confirm_chapter_ids uuid[] default '{}',
  p_dismiss_chapter_ids uuid[] default '{}',
  p_reset_chapter_ids uuid[] default '{}',
  p_main_book_ids uuid[] default '{}',
  p_cameo_book_ids uuid[] default '{}',
  p_dismiss_book_ids uuid[] default '{}',
  p_reset_book_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book_id uuid;
  v_chapters uuid[];
  v_books uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_confirm_chapter_ids is null or p_dismiss_chapter_ids is null or p_reset_chapter_ids is null
    or p_main_book_ids is null or p_cameo_book_ids is null or p_dismiss_book_ids is null or p_reset_book_ids is null
    or array_position(p_confirm_chapter_ids || p_dismiss_chapter_ids || p_reset_chapter_ids, null) is not null
    or array_position(p_main_book_ids || p_cameo_book_ids || p_dismiss_book_ids || p_reset_book_ids, null) is not null
    or cardinality(p_confirm_chapter_ids || p_dismiss_chapter_ids || p_reset_chapter_ids) > 5000
    or cardinality(p_main_book_ids || p_cameo_book_ids || p_dismiss_book_ids || p_reset_book_ids) > 500 then
    raise exception 'Invalid review list' using errcode = '22023';
  end if;
  v_chapters := p_confirm_chapter_ids || p_dismiss_chapter_ids || p_reset_chapter_ids;
  v_books := p_main_book_ids || p_cameo_book_ids || p_dismiss_book_ids || p_reset_book_ids;
  -- One decision per chapter/book per call.
  if (select count(distinct x) from unnest(v_chapters) x) <> cardinality(v_chapters)
    or (select count(distinct x) from unnest(v_books) x) <> cardinality(v_books) then
    raise exception 'Conflicting decisions' using errcode = '22023';
  end if;

  -- Lock like set_chapter_characters, so archive/delete cannot race this.
  select c.book_id into v_book_id from public.characters c join public.books b on b.id = c.book_id
    where c.id = p_character_id and b.author_id = auth.uid() and b.deleted_at is null and c.archived_at is null
    for share of c;
  if not found then raise exception 'Character not found, archived or forbidden' using errcode = '42501'; end if;

  if exists (
    select 1 from unnest(v_books) x left join public.books b on b.id = x
    where b.id is null or b.author_id <> auth.uid() or b.deleted_at is not null or b.id = v_book_id
  ) then raise exception 'Invalid or foreign book' using errcode = '22023'; end if;
  -- Serialize with set_chapter_characters on the same chapters.
  perform 1 from public.chapters where id = any(v_chapters) order by id for update;
  if exists (
    select 1 from unnest(v_chapters) x left join public.chapters ch on ch.id = x
      left join public.books b on b.id = ch.book_id
    where ch.id is null or b.author_id <> auth.uid() or b.deleted_at is not null
  ) or exists (
    select 1 from public.chapters ch where ch.id = any(p_confirm_chapter_ids) and ch.removed_at is not null
  ) then raise exception 'Invalid or foreign chapter' using errcode = '22023'; end if;

  delete from public.character_book_links where character_id = p_character_id and book_id = any(p_reset_book_ids);
  insert into public.character_book_links (character_id, book_id, appearance)
    select p_character_id, x, 'main' from unnest(p_main_book_ids) x
    union all select p_character_id, x, 'cameo' from unnest(p_cameo_book_ids) x
    union all select p_character_id, x, 'dismissed' from unnest(p_dismiss_book_ids) x
  on conflict (character_id, book_id) do update set appearance = excluded.appearance, updated_at = now();

  -- Another book's chapters can only be confirmed while that book is 'main'.
  if exists (
    select 1 from public.chapters ch where ch.id = any(p_confirm_chapter_ids) and ch.book_id <> v_book_id
      and not exists (select 1 from public.character_book_links l
        where l.character_id = p_character_id and l.book_id = ch.book_id and l.appearance = 'main')
  ) then raise exception 'Book is not a main appearance' using errcode = '22023'; end if;

  delete from public.character_chapter_reviews where character_id = p_character_id
    and chapter_id = any(p_reset_chapter_ids || p_confirm_chapter_ids);
  insert into public.chapter_characters (chapter_id, character_id)
    select ch.id, p_character_id from public.chapters ch
    where ch.id = any(p_confirm_chapter_ids) and ch.book_id = v_book_id
  on conflict do nothing;
  insert into public.character_chapter_reviews (character_id, chapter_id, decision)
    select p_character_id, ch.id, 'confirmed' from public.chapters ch
    where ch.id = any(p_confirm_chapter_ids) and ch.book_id <> v_book_id
    union all
    -- An already tagged own-book chapter is untagged from the chapter panel, not here.
    select p_character_id, ch.id, 'dismissed' from public.chapters ch
    where ch.id = any(p_dismiss_chapter_ids) and not (ch.book_id = v_book_id and exists (
      select 1 from public.chapter_characters cc where cc.chapter_id = ch.id and cc.character_id = p_character_id))
  on conflict (character_id, chapter_id) do update set decision = excluded.decision, created_at = now();
end $$;
revoke all on function public.review_character_appearances(uuid, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.review_character_appearances(uuid, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]) to authenticated;

-- Reader-facing list behind the hover popover: only public, unarchived
-- characters of a published book, and only published, unremoved chapters of
-- published books. chapter_id is null for a cameo book.
create or replace function public.public_character_appearances(p_character_id uuid)
returns table (book_id uuid, book_title text, appearance text, chapter_id uuid, chapter_title text, order_index integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with ch as (
    select c.id, c.book_id from public.characters c join public.books b on b.id = c.book_id
    where c.id = p_character_id and c.is_public and c.archived_at is null and b.published and b.deleted_at is null
  )
  select b.id, b.title, 'own'::text, x.id, x.title, x.order_index
    from ch join public.chapter_characters cc on cc.character_id = ch.id
    join public.chapters x on x.id = cc.chapter_id and x.book_id = ch.book_id
    join public.books b on b.id = x.book_id
    where x.published and x.removed_at is null
  union all
  select b.id, b.title, 'main'::text, x.id, x.title, x.order_index
    from ch join public.character_book_links l on l.character_id = ch.id and l.appearance = 'main'
    join public.books b on b.id = l.book_id and b.published and b.deleted_at is null
    join public.character_chapter_reviews r on r.character_id = ch.id and r.decision = 'confirmed'
    join public.chapters x on x.id = r.chapter_id and x.book_id = b.id
    where x.published and x.removed_at is null
  union all
  select b.id, b.title, 'cameo'::text, null::uuid, null::text, null::integer
    from ch join public.character_book_links l on l.character_id = ch.id and l.appearance = 'cameo'
    join public.books b on b.id = l.book_id and b.published and b.deleted_at is null
  order by 3, 2, 6;
$$;
revoke all on function public.public_character_appearances(uuid) from public;
grant execute on function public.public_character_appearances(uuid) to anon, authenticated, service_role;

commit;
-- Notes: mirrored in baseline/02_books_and_chapters.sql (after delete_recent_character);
-- regenerate schema.sql. Update supabase/types.ts (two tables, two functions).
-- Code: src/lib/character-mentions.ts, authoring characters/[characterId]/scan + appearances
-- routes, GET characters/[characterId] (author view), /api/characters/[characterId]/appearances,
-- components/author/character-scan.tsx, character-manager.tsx, story/character-list.tsx.
