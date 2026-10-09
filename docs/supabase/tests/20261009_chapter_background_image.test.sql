-- Run after 20261009_chapter_background_image.sql on dev/staging only, as postgres,
-- in the Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is
-- expected: it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b uuid; ch uuid; ok boolean; n integer;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'ba' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'br' || left(replace(r::text, '-', ''), 12), 'Other') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Bg book', 'cbg-' || a, true) returning id into b;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C1', 'x', 1, true) returning id into ch;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.chapters set background_image_path = a || '/chapter-bg-' || ch || '-1700000000000.webp' where id = ch;
  select count(*) into n from public.chapters where id = ch and background_image_path is not null;
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 1 author sets a valid path and can read it back');

  ok := false;
  begin update public.chapters set background_image_path = r || '/chapter-bg-' || ch || '-1.webp' where id = ch;
  exception when check_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 2 another user''s folder rejected');

  ok := false;
  begin update public.chapters set background_image_path = a || '/cover-' || b || '-1.png' where id = ch;
  exception when check_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 3 other file of the same author rejected');

  ok := false;
  begin update public.chapters set background_image_path = a || '/chapter-bg-' || ch || '-1.webp/../x.png' where id = ch;
  exception when check_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 4 path traversal rejected');

  update public.chapters set background_image_path = null where id = ch;
  select count(*) into n from public.chapters where id = ch and background_image_path is null;
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 5 clearing allowed');

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  ok := has_column_privilege('anon', 'public.chapters', 'background_image_path', 'SELECT')
    and not has_column_privilege('anon', 'public.chapters', 'content', 'SELECT');
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 6 anon reads the column, still not content');
  execute 'reset role';

  select count(*) into failed from unnest(results) t where t like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
