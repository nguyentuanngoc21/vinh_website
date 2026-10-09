-- Run after 20261009_chapter_content_version.sql on dev/staging only, as postgres,
-- in the Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is
-- expected: it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid; ch uuid; v integer; ok boolean;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'va' || left(replace(a::text, '-', ''), 12), 'Author') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Version book', 'cv-' || a, false) returning id into b;
  insert into public.chapters(book_id, title, content, order_index, published, content_version)
    values (b, 'C1', 'x', 1, false, 99) returning id, content_version into ch, v;
  results := array_append(results, case when v = 0 then 'PASS' else 'FAIL' end || ' 1 insert always starts at 0 (' || v || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.chapters set content = 'y' where id = ch returning content_version into v;
  results := array_append(results, case when v = 1 then 'PASS' else 'FAIL' end || ' 2 content change bumps');
  update public.chapters set title = 'C1 mới' where id = ch returning content_version into v;
  results := array_append(results, case when v = 2 then 'PASS' else 'FAIL' end || ' 3 title change bumps');
  update public.chapters set price = 0, content = 'y' where id = ch returning content_version into v;
  results := array_append(results, case when v = 2 then 'PASS' else 'FAIL' end || ' 4 metadata-only / same text keeps version');
  update public.chapters set content_version = 500 where id = ch returning content_version into v;
  results := array_append(results, case when v = 2 then 'PASS' else 'FAIL' end || ' 5 client cannot set the counter');

  -- The route's conditional write: a stale expected version updates nothing.
  update public.chapters set content = 'z' where id = ch and content_version = 1 returning content_version into v;
  ok := not found;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 6 stale expected version writes nothing');

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{}', true);
  ok := has_column_privilege('anon', 'public.chapters', 'content_version', 'SELECT')
    and not has_column_privilege('anon', 'public.chapters', 'content', 'SELECT');
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 7 column readable, content still not');
  execute 'reset role';

  select count(*) into failed from unnest(results) t where t like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
