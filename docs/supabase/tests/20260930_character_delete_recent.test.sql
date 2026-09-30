-- Run after 20260930_character_delete_recent.sql on dev/staging, as postgres.
-- One DO block that always ends in an exception, so every fixture is rolled
-- back even in the Supabase SQL Editor. Expected result: an error whose
-- message starts with "ALL PASS". Any "FAIL ..." message is a real failure.
-- Briefly disables the created_at guard trigger (ACCESS EXCLUSIVE lock on
-- characters until the block ends) to fake an old character — dev/staging only.
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b uuid; ch uuid; fresh uuid; old_c uuid; followed uuid; hint text; ts timestamptz;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'da' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'dr' || left(replace(r::text, '-', ''), 12), 'Reader') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Delete test', 'dt-' || a, true) returning id into b;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C1', '', 1, true) returning id into ch;

  -- Clients cannot choose or move created_at.
  insert into public.characters(book_id, name, created_at) values (b, 'Fresh', now() + interval '1 year') returning id, created_at into fresh, ts;
  if ts > now() + interval '1 minute' then raise exception 'FAIL insert kept client created_at'; end if;
  begin
    update public.characters set created_at = now() + interval '1 year' where id = fresh;
    raise exception 'FAIL created_at was updatable';
  exception when insufficient_privilege then null; end;

  insert into public.characters(book_id, name, is_public) values (b, 'Followed', true) returning id into followed;
  insert into public.character_follows(follower_id, character_id) values (r, followed);
  insert into public.characters(book_id, name) values (b, 'Old') returning id into old_c;
  execute 'alter table public.characters disable trigger character_created_at_guard';
  update public.characters set created_at = now() - interval '16 minutes' where id = old_c;
  execute 'alter table public.characters enable trigger character_created_at_guard';
  insert into public.chapter_characters(chapter_id, character_id) values (ch, fresh);

  -- Another user cannot delete.
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.delete_recent_character(b, fresh);
    raise exception 'FAIL non-owner deleted character';
  exception when insufficient_privilege then null; end;
  -- Wrong book id for the right author is also refused.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_recent_character(gen_random_uuid(), fresh);
    raise exception 'FAIL delete ignored book id';
  exception when insufficient_privilege then null; end;
  -- Expired window and reader activity are refused with distinct hints.
  begin
    perform public.delete_recent_character(b, old_c);
    raise exception 'FAIL expired character deleted';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'expired' then raise exception 'FAIL expired hint: %', hint; end if;
  end;
  begin
    perform public.delete_recent_character(b, followed);
    raise exception 'FAIL followed character deleted';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics hint = pg_exception_hint;
    if hint is distinct from 'reader_activity' then raise exception 'FAIL reader hint: %', hint; end if;
  end;
  -- Direct DELETE stays revoked; only the RPC can remove rows.
  begin
    delete from public.characters where id = fresh;
    raise exception 'FAIL direct delete allowed';
  exception when insufficient_privilege then null; end;
  -- Owner deletes a fresh character; its chapter tag cascades.
  perform public.delete_recent_character(b, fresh);
  execute 'reset role';
  if exists (select 1 from public.characters where id = fresh) then raise exception 'FAIL fresh character not deleted'; end if;
  if exists (select 1 from public.chapter_characters where character_id = fresh) then raise exception 'FAIL chapter tag not removed'; end if;
  if not exists (select 1 from public.characters where id in (old_c, followed) having count(*) = 2) then raise exception 'FAIL refused characters missing'; end if;
  -- anon cannot call the RPC at all.
  if has_function_privilege('anon', 'public.delete_recent_character(uuid, uuid)', 'execute') then raise exception 'FAIL anon can execute'; end if;

  raise exception 'ALL PASS character delete window: owner-only, 15-minute limit, reader-activity guard, created_at immutable, cascade (deliberate exception rolls back test data)';
end $$;
