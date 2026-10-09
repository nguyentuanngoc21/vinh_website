-- Run after 20261009_content_flag_terms.sql on dev/staging only, as postgres, in
-- the Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is
-- expected: it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid();
  n integer; ok boolean;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid');
  insert into public.content_flag_terms(term, note) values ('__test_term__', 'test');

  ok := false;
  begin insert into public.content_flag_terms(term) values ('__test_term__');
  exception when unique_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 1 duplicate term rejected');

  ok := false;
  begin insert into public.content_flag_terms(term) values ('   ');
  exception when check_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 2 blank term rejected');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin select count(*) into n from public.content_flag_terms;
  exception when insufficient_privilege then ok := true; end;
  begin insert into public.content_flag_terms(term) values ('x'); ok := false;
  exception when insufficient_privilege then null; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 3 authors cannot read or edit the list');

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  ok := false;
  begin select count(*) into n from public.content_flag_terms;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 4 anon cannot read the list');
  execute 'reset role';

  select count(*) into failed from unnest(results) x where x like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from public.content_flag_terms where term = '__test_term__';
