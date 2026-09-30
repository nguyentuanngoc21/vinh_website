-- Apply before deploying the character-management UI/API. Safe to rerun.
begin;

alter table public.characters
  add column if not exists archived_at timestamptz,
  add column if not exists is_public boolean not null default true,
  add column if not exists show_role boolean not null default true,
  add column if not exists story_role text not null default 'supporting',
  add column if not exists aliases text,
  add column if not exists avatar_url text,
  add column if not exists description text,
  add column if not exists private_notes text;
-- Existing characters keep their previous visibility; new ones are private.
alter table public.characters alter column is_public set default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.characters'::regclass and conname = 'characters_profile_valid') then
    alter table public.characters add constraint characters_profile_valid check (
      char_length(name) <= 60 and char_length(trope) <= 40
      and story_role in ('main', 'supporting', 'cameo')
      and char_length(aliases) <= 200 and char_length(description) <= 2000
      and char_length(private_notes) <= 5000
      and (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://[^[:space:]]+$'))
    ) not valid;
  end if;
end $$;

-- Base table is author-only, including all private fields. The public view
-- deliberately runs with its owner's rights and exposes a fixed safe projection.
drop policy if exists "characters follow their book's visibility" on public.characters;
drop policy if exists "authors manage characters in their own books" on public.characters;
create policy "authors manage characters in their own books" on public.characters for all
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null))
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null));
revoke delete, truncate, references, trigger on public.characters from public, anon, authenticated;

create or replace view public.public_characters with (security_barrier = true) as
select c.id, c.book_id, c.name,
  case when c.show_role then c.role else null::text end as role,
  c.trope, c.story_role, c.aliases, c.avatar_url, c.description, c.created_at
from public.characters c join public.books b on b.id = c.book_id
where c.is_public and c.archived_at is null and b.published and b.deleted_at is null;
revoke all on public.public_characters from public, anon, authenticated;
grant select on public.public_characters to anon, authenticated, service_role;

-- Only the transactional RPC may change chapter associations. Interactions
-- go through server endpoints, which verify visibility and chapter access.
revoke insert, update, delete, truncate, references, trigger on public.chapter_characters from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.character_trope_votes from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.character_follows from public, anon, authenticated;

create or replace function public.check_character_book() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'characters' then
    if new.book_id is distinct from old.book_id then
      raise exception 'Cannot move a character to another book' using errcode = '23514';
    end if;
  elsif tg_table_name = 'chapters' then
    if new.book_id is distinct from old.book_id and exists (
      select 1 from public.chapter_characters cc where cc.chapter_id = old.id
    ) then
      raise exception 'Cannot move a chapter with character tags' using errcode = '23514';
    end if;
  elsif not exists (
    select 1 from public.chapters ch join public.characters c on c.book_id = ch.book_id
    where ch.id = new.chapter_id and c.id = new.character_id
  ) then
    raise exception 'Character must belong to the chapter book' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists character_book_immutable on public.characters;
create trigger character_book_immutable before update of book_id on public.characters
for each row execute function public.check_character_book();
drop trigger if exists tagged_chapter_book_immutable on public.chapters;
create trigger tagged_chapter_book_immutable before update of book_id on public.chapters
for each row execute function public.check_character_book();
drop trigger if exists chapter_character_same_book on public.chapter_characters;
create trigger chapter_character_same_book before insert or update on public.chapter_characters
for each row execute function public.check_character_book();
drop trigger if exists trope_vote_same_book on public.character_trope_votes;
create trigger trope_vote_same_book before insert or update on public.character_trope_votes
for each row execute function public.check_character_book();

create or replace function public.set_chapter_characters(
  p_chapter_id uuid, p_character_ids uuid[], p_expected_character_ids uuid[] default null
) returns uuid[] language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book_id uuid;
  v_current uuid[];
  v_next uuid[];
  v_expected uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_character_ids is null or array_position(p_character_ids, null) is not null
    or cardinality(p_character_ids) > 500 or array_position(p_expected_character_ids, null) is not null then
    raise exception 'Invalid character list' using errcode = '22023';
  end if;
  -- Serialize all writers of the same chapter, including legacy clients.
  select ch.book_id into v_book_id from public.chapters ch
    join public.books b on b.id = ch.book_id
    where ch.id = p_chapter_id and b.author_id = auth.uid() and b.deleted_at is null
    for update of ch;
  if not found then raise exception 'Chapter not found or forbidden' using errcode = '42501'; end if;

  select coalesce(array_agg(character_id order by character_id), '{}'::uuid[]) into v_current
    from public.chapter_characters where chapter_id = p_chapter_id;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_next from unnest(p_character_ids) x;
  if p_expected_character_ids is not null then
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_expected from unnest(p_expected_character_ids) x;
    if v_expected is distinct from v_current then
      raise exception 'Character list changed; reload before saving' using errcode = '40001';
    end if;
  end if;

  -- Lock referenced profiles until commit, so archive/move cannot race this check.
  perform 1 from public.characters where id = any(v_next) order by id for share;
  if exists (
    select 1 from unnest(v_next) x left join public.characters c on c.id = x
    where c.id is null or c.book_id <> v_book_id
      or (c.archived_at is not null and not (c.id = any(v_current)))
  ) then raise exception 'Invalid, archived or foreign character' using errcode = '22023'; end if;

  delete from public.chapter_characters where chapter_id = p_chapter_id and not (character_id = any(v_next));
  insert into public.chapter_characters(chapter_id, character_id)
    select p_chapter_id, x from unnest(v_next) x on conflict do nothing;
  return v_next;
end $$;
revoke all on function public.set_chapter_characters(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.set_chapter_characters(uuid, uuid[], uuid[]) to authenticated;

commit;
-- Notes: mirrored in baseline/02_books_and_chapters.sql; regenerate schema.sql.
-- Update supabase/types.ts, authoring routes/workspace, public readers,
-- mobile authoring adapters and character components together with this migration.
