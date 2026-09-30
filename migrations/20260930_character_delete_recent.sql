-- Hard delete of a character created by mistake, only within 15 minutes of
-- creation and only before any reader has followed or voted for it.
-- Apply after 20260930_character_management.sql. Safe to rerun.
begin;

-- created_at is the delete window's clock, so clients must not set or move it
-- (the author RLS policy otherwise allows direct inserts/updates).
create or replace function public.guard_character_created_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  elsif new.created_at is distinct from old.created_at then
    raise exception 'created_at is read-only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists character_created_at_guard on public.characters;
create trigger character_created_at_guard before insert or update of created_at on public.characters
for each row execute function public.guard_character_created_at();

create or replace function public.delete_recent_character(p_book_id uuid, p_character_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Row lock: waits for in-flight chapter tagging (FOR SHARE) and blocks new tags.
  select c.created_at into v_created_at from public.characters c
    join public.books b on b.id = c.book_id
    where c.id = p_character_id and c.book_id = p_book_id
      and b.author_id = auth.uid() and b.deleted_at is null
    for update of c;
  if not found then raise exception 'Character not found or forbidden' using errcode = '42501'; end if;
  if v_created_at < now() - interval '15 minutes' then
    raise exception 'Delete window expired' using errcode = '55000', hint = 'expired';
  end if;
  if exists (select 1 from public.character_follows where character_id = p_character_id)
    or exists (select 1 from public.character_trope_votes where character_id = p_character_id) then
    raise exception 'Character has reader activity' using errcode = '55000', hint = 'reader_activity';
  end if;
  -- chapter_characters rows cascade.
  delete from public.characters where id = p_character_id;
end $$;
revoke all on function public.delete_recent_character(uuid, uuid) from public, anon;
grant execute on function public.delete_recent_character(uuid, uuid) to authenticated;

commit;
-- Notes: mirrored in baseline/02_books_and_chapters.sql; regenerate schema.sql.
