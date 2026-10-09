-- Run after 20261009_author_daily_words.sql on dev/staging only, as postgres, in
-- the Supabase SQL Editor. The final RAISE EXCEPTION ("KẾT QUẢ TEST …") is
-- expected: it prints the summary and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b uuid; ch uuid; ch2 uuid; n integer; ok boolean;
  results text[] := '{}'; failed integer := 0;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'wa' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'wr' || left(replace(r::text, '-', ''), 12), 'Other') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Words book', 'wd-' || a, false) returning id into b;
  insert into public.chapters(book_id, title, content, order_index, published) values (b, 'C1', 'một hai', 1, false) returning id into ch;

  -- ===== Author edits (as the author, like the editor's PATCH) =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.chapters set content = 'một hai ba bốn' where id = ch;
  select coalesce(sum(words), 0) into n from public.author_daily_words where user_id = a;
  results := array_append(results, case when n = 2 then 'PASS' else 'FAIL' end || ' 1 new words counted from the old length (' || n || ')');

  update public.chapters set content = 'một hai' where id = ch;
  update public.chapters set content = 'một hai ba bốn' where id = ch;
  select coalesce(sum(words), 0) into n from public.author_daily_words where user_id = a;
  results := array_append(results, case when n = 2 then 'PASS' else 'FAIL' end || ' 2 delete + paste back is not counted twice (' || n || ')');

  update public.chapters set content = 'một hai ba bốn năm' || chr(160) || 'sáu' where id = ch;
  select coalesce(sum(words), 0) into n from public.author_daily_words where user_id = a;
  results := array_append(results, case when n = 4 then 'PASS' else 'FAIL' end || ' 3 growth past the high-water mark counts, NBSP splits words (' || n || ')');

  update public.chapters set title = 'Tên mới' where id = ch;
  select coalesce(sum(words), 0) into n from public.author_daily_words where user_id = a;
  results := array_append(results, case when n = 4 then 'PASS' else 'FAIL' end || ' 4 title-only edit adds nothing');

  insert into public.chapters(book_id, title, content, order_index, published)
    values (b, 'C2', repeat('chữ ', 500), 2, false) returning id into ch2;
  select coalesce(sum(words), 0) into n from public.author_daily_words where user_id = a;
  results := array_append(results, case when n = 4 then 'PASS' else 'FAIL' end || ' 5 inserting a chapter (import) is not counted');

  ok := false;
  begin insert into public.author_daily_words(user_id, day, words) values (a, current_date, 99999);
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 6 client cannot write daily words');

  insert into public.author_writing_goals(user_id, daily_words) values (a, 1000);
  ok := false;
  begin update public.author_writing_goals set daily_words = 10 where user_id = a;
  exception when check_violation then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 7 goal outside 50..50000 rejected');

  ok := false;
  begin insert into public.author_writing_goals(user_id, daily_words) values (r, 1000);
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 8 cannot set another user''s goal');

  -- ===== Other user =====
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  select (select count(*) from public.author_daily_words where user_id = a) + (select count(*) from public.author_writing_goals where user_id = a) into n;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 9 other user reads nothing');
  ok := false;
  begin select count(*) into n from public.chapter_word_marks;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 10 word marks hidden from clients');

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  ok := false;
  begin select count(*) into n from public.author_daily_words;
    ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  results := array_append(results, case when ok then 'PASS' else 'FAIL' end || ' 11 anon cannot read');
  execute 'reset role';

  select count(*) into failed from unnest(results) x where x like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
