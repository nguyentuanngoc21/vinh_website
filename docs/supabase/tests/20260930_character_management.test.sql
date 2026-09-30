-- Run after 20260930_character_management.sql on dev/staging, as postgres.
-- Every fixture is rolled back. A failed assertion aborts the test.
begin;
create or replace function public._character_test_fail_insert() returns trigger language plpgsql as $$
begin
  if new.character_id::text = current_setting('character_test.reject_id', true) then
    raise exception 'Simulated insertion failure' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger character_test_fail_insert before insert on public.chapter_characters
for each row execute function public._character_test_fail_insert();
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b uuid; other_book uuid; ch uuid; ch2 uuid; c uuid; private_c uuid; foreign_c uuid;
  actual uuid[]; n integer;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'ca' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'cr' || left(replace(r::text, '-', ''), 12), 'Reader') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Characters test', 'ct-' || a, true) returning id into b;
  insert into public.books(author_id, title, slug, published) values (r, 'Other book', 'ct-' || r, true) returning id into other_book;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C1', '', 1, true) returning id into ch;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C2', '', 2, true) returning id into ch2;
  insert into public.characters(book_id, name, is_public, show_role, role, private_notes)
    values (b, 'Public', true, false, 'villain', 'secret') returning id into c;
  insert into public.characters(book_id, name) values (b, 'Private by default') returning id into private_c;
  insert into public.characters(book_id, name, is_public) values (other_book, 'Foreign', true) returning id into foreign_c;
  insert into public.character_follows(follower_id, character_id) values(r, c);
  insert into public.character_trope_votes(user_id, chapter_id, character_id) values(r, ch, c);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  actual := public.set_chapter_characters(ch, array[c], '{}'::uuid[]);
  if actual <> array[c] then raise exception 'FAIL initial assignment'; end if;
  actual := public.set_chapter_characters(ch, array[c, c], array[c]);
  if actual <> array[c] then raise exception 'FAIL duplicate handling'; end if;
  begin
    perform public.set_chapter_characters(ch, array[foreign_c], array[c]);
    raise exception 'FAIL foreign character accepted';
  exception when invalid_parameter_value then null; end;
  select array_agg(character_id) into actual from public.chapter_characters where chapter_id = ch;
  if actual <> array[c] then raise exception 'FAIL failed write lost old tags'; end if;
  perform set_config('character_test.reject_id', private_c::text, true);
  begin
    perform public.set_chapter_characters(ch, array[private_c], array[c]);
    raise exception 'FAIL simulated insertion error not raised';
  exception when check_violation then null; end;
  perform set_config('character_test.reject_id', '', true);
  select array_agg(character_id) into actual from public.chapter_characters where chapter_id = ch;
  if actual is distinct from array[c] then raise exception 'FAIL insertion error did not roll back deletion'; end if;
  begin
    perform public.set_chapter_characters(ch, '{}'::uuid[], '{}'::uuid[]);
    raise exception 'FAIL stale write accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.set_chapter_characters(ch, array[null::uuid], array[c]);
    raise exception 'FAIL null ID accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.chapter_characters(chapter_id, character_id) values(ch, private_c);
    raise exception 'FAIL direct tag insert permitted';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('authenticated', 'public.characters', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.character_trope_votes', 'TRUNCATE') then
    raise exception 'FAIL truncate privileges remain';
  end if;
  begin
    delete from public.characters where id = c;
    raise exception 'FAIL hard delete permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.characters set book_id = other_book where id = c;
    raise exception 'FAIL character moved';
  exception when check_violation or insufficient_privilege then null; end;
  update public.characters set archived_at = now() where id = c;
  perform public.set_chapter_characters(ch, array[c], array[c]); -- retained historical tag
  begin
    perform public.set_chapter_characters(ch2, array[c], '{}'::uuid[]);
    raise exception 'FAIL archived character newly tagged';
  exception when invalid_parameter_value then null; end;
  update public.characters set archived_at = null where id = c;

  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  select count(*) into n from public.characters where book_id = b;
  if n <> 0 then raise exception 'FAIL private base table leaked'; end if;
  select count(*) into n from public.public_characters where book_id = b and id = c and role is null;
  if n <> 1 then raise exception 'FAIL public role masking'; end if;
  select count(*) into n from public.public_characters where id = private_c;
  if n <> 0 then raise exception 'FAIL private character exposed'; end if;
  begin
    perform public.set_chapter_characters(ch, '{}'::uuid[], array[c]);
    raise exception 'FAIL non-owner replaced tags';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_chapter_characters(ch, '{}'::uuid[]);
    raise exception 'FAIL non-owner legacy clear';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.character_trope_votes(user_id, chapter_id, character_id) values(r, ch2, foreign_c);
    raise exception 'FAIL direct vote permitted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.character_follows(follower_id, character_id) values(r, private_c);
    raise exception 'FAIL direct follow permitted';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  begin
    update public.chapters set book_id = other_book where id = ch;
    raise exception 'FAIL chapter moved with existing tags';
  exception when check_violation then null; end;
  update public.characters set archived_at = now() where id = c;
  if not exists (select 1 from public.chapter_characters where chapter_id = ch and character_id = c)
    or not exists (select 1 from public.character_follows where follower_id = r and character_id = c)
    or not exists (select 1 from public.character_trope_votes where user_id = r and character_id = c) then
    raise exception 'FAIL archive destroyed history';
  end if;
  begin
    insert into public.chapter_characters(chapter_id, character_id) values(ch, foreign_c);
    raise exception 'FAIL database allowed cross-book tag';
  exception when check_violation then null; end;
  begin
    insert into public.character_trope_votes(user_id, chapter_id, character_id) values(r, ch2, foreign_c);
    raise exception 'FAIL database allowed cross-book vote';
  exception when check_violation then null; end;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_characters' and column_name = 'private_notes') then
    raise exception 'FAIL private notes in public projection';
  end if;
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  if exists (select 1 from public.public_characters where id in (c, private_c)) then raise exception 'FAIL archived/private profile public'; end if;
  if exists (select 1 from public.characters where book_id = b) then raise exception 'FAIL anonymous private read'; end if;
  execute 'reset role';
  update public.characters set archived_at = null where id = c;
  if not exists (select 1 from public.public_characters where id = c) then raise exception 'FAIL restore visibility'; end if;
  update public.books set published = false where id = b;
  if exists (select 1 from public.public_characters where id = c) then raise exception 'FAIL unpublished book exposed'; end if;
  raise notice 'PASS character management: atomic replacement, conflicts, ownership, grants, privacy, archive history, cross-book integrity';
end $$;
rollback;
