-- Run after 20261009_story_terms.sql on dev/staging only, as postgres, in the
-- Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is expected:
-- it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b uuid; b2 uuid; rb uuid; t uuid; n integer; ok boolean;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'sa' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'sr' || left(replace(r::text, '-', ''), 12), 'Other') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Terms book', 'st-a-' || a, true) returning id into b;
  insert into public.books(author_id, title, slug, published) values (a, 'Terms book 2', 'st-a2-' || a, true) returning id into b2;
  insert into public.books(author_id, title, slug, published) values (r, 'Other book', 'st-r-' || r, true) returning id into rb;

  -- ===== Author =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.story_terms(book_id, kind, name) values (b, 'place', 'Tỉnh Lâm Khư') returning id into t;
  results := array_append(results, case when t is not null then 'PASS' else 'FAIL' end || ' 1 author adds a term');

  ok := false;
  begin insert into public.story_terms(book_id, name) values (b, 'Tỉnh Lâm Khư');
  exception when unique_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 2 duplicate name in the same book rejected');

  ok := false;
  begin insert into public.story_terms(book_id, name) values (b, '   ');
  exception when check_violation then ok := true; end;
  begin insert into public.story_terms(book_id, name) values (b, repeat('x', 61)); ok := false;
  exception when check_violation then null; end;
  begin insert into public.story_terms(book_id, name, kind) values (b, 'Y', 'planet'); ok := false;
  exception when check_violation then null; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 3 blank / too long / bad kind rejected');

  update public.story_terms set pinned = true, aliases = 'Lâm Khư' where id = t;
  select count(*) into n from public.story_terms where id = t and pinned and aliases = 'Lâm Khư';
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 4 author edits allowed columns');

  ok := false;
  begin update public.story_terms set book_id = b2 where id = t;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 5 term cannot move to another book');

  ok := false;
  begin insert into public.story_terms(book_id, name) values (rb, 'Xâm nhập');
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 6 cannot add to another author''s book');

  -- ===== Other author =====
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  select count(*) into n from public.story_terms where book_id = b;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 7 other author cannot read');
  update public.story_terms set name = 'Hacked' where id = t;
  delete from public.story_terms where id = t;
  execute 'reset role';
  select count(*) into n from public.story_terms where id = t and name = 'Tỉnh Lâm Khư';
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 8 other author cannot edit or delete');

  -- ===== Anonymous =====
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  ok := false;
  begin select count(*) into n from public.story_terms;
    ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 9 anon cannot read');
  execute 'reset role';

  delete from public.books where id = b;
  select count(*) into n from public.story_terms where id = t;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 10 terms cascade with their book');

  select count(*) into failed from unnest(results) x where x like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
