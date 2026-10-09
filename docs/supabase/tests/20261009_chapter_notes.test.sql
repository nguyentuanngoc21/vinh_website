-- Run after 20261009_chapter_notes.sql on dev/staging only, as postgres, in the
-- Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is expected:
-- it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b uuid; ch uuid; n integer; ok boolean;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'na' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'nr' || left(replace(r::text, '-', ''), 12), 'Other') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Notes book', 'cn-' || a, true) returning id into b;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C1', 'x', 1, true) returning id into ch;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.chapter_notes(chapter_id, notes) values (ch, 'Dàn ý: mở đầu, cao trào.')
    on conflict (chapter_id) do update set notes = excluded.notes;
  select count(*) into n from public.chapter_notes where chapter_id = ch;
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 1 author saves and reads notes');

  ok := false;
  begin update public.chapter_notes set notes = repeat('x', 10001) where chapter_id = ch;
  exception when check_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 2 notes over 10.000 characters rejected');

  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  select count(*) into n from public.chapter_notes where chapter_id = ch;
  ok := n = 0;
  begin insert into public.chapter_notes(chapter_id, notes) values (ch, 'chen ngang'); ok := false;
  exception when insufficient_privilege then null; when unique_violation then ok := false; end;
  update public.chapter_notes set notes = 'hacked' where chapter_id = ch;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 3 other user cannot read or write');

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  ok := false;
  begin select count(*) into n from public.chapter_notes; ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 4 readers (anon) never see notes');
  execute 'reset role';

  select count(*) into n from public.chapter_notes where chapter_id = ch and notes = 'Dàn ý: mở đầu, cao trào.';
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 5 notes unchanged by other user');

  update public.chapters set content = '', content_purged_at = now() where id = ch;
  select count(*) into n from public.chapter_notes where chapter_id = ch;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 6 purging the chapter purges its notes');

  select count(*) into failed from unnest(results) x where x like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
