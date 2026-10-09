-- Run after 20261009_chapter_versions.sql on dev/staging only, as postgres, in
-- the Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is
-- expected: it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid; ch uuid; n integer; ok boolean; t text;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'va' || left(replace(a::text, '-', ''), 12), 'Author') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Versions book', 'cvh-' || a, false) returning id into b;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C1', '', 1, false) returning id into ch;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.chapters set content = repeat('Bản đầu. ', 100) where id = ch;
  execute 'reset role';
  select count(*) into n from public.chapter_versions where chapter_id = ch;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 1 empty old content is not snapshotted');

  execute 'set local role authenticated';
  update public.chapters set content = repeat('Bản đầu. ', 100) || 'thêm' where id = ch;
  execute 'reset role';
  select count(*), max(content) into n, t from public.chapter_versions where chapter_id = ch group by chapter_id;
  results := array_append(results, case when n = 1 and t = repeat('Bản đầu. ', 100) then 'PASS' else 'FAIL' end || ' 2 first edit keeps the previous text');

  execute 'set local role authenticated';
  update public.chapters set content = repeat('Bản đầu. ', 100) || 'thêm nữa' where id = ch;
  execute 'reset role';
  select count(*) into n from public.chapter_versions where chapter_id = ch;
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 3 small edits within 10 minutes are not snapshotted again');

  execute 'set local role authenticated';
  update public.chapters set content = 'Thay toàn bộ.' where id = ch;
  execute 'reset role';
  select count(*) into n from public.chapter_versions where chapter_id = ch;
  results := array_append(results, case when n = 2 then 'PASS' else 'FAIL' end || ' 4 a large change always keeps the previous text');

  execute 'set local role authenticated';
  ok := false;
  begin select count(*) into n from public.chapter_versions;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 5 clients cannot read version content');
  execute 'reset role';

  for i in 1..55 loop
    update public.chapters set content = case when i % 2 = 0 then repeat('a ', 400) else repeat('b ', 10) end || i where id = ch;
  end loop;
  select count(*) into n from public.chapter_versions where chapter_id = ch;
  results := array_append(results, case when n = 50 then 'PASS' else 'FAIL' end || ' 6 only the latest 50 are kept (' || n || ')');

  update public.chapters set removed_at = now() where id = ch;
  select count(*) into n from public.chapter_versions where chapter_id = ch;
  update public.chapters set content = repeat('c ', 500) where id = ch;
  ok := (select count(*) from public.chapter_versions where chapter_id = ch) = n;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 7 removed chapters stop collecting history');

  update public.chapters set content = '', content_purged_at = now() where id = ch;
  select count(*) into n from public.chapter_versions where chapter_id = ch;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 8 purging content also purges its history');

  select count(*) into failed from unnest(results) x where x like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
