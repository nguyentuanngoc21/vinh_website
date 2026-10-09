-- Run after 20261009_character_appearance_reviews.sql on dev/staging only, as postgres,
-- in the Supabase SQL Editor. One DO block: the final RAISE EXCEPTION prints the
-- summary ("KẾT QUẢ TEST …" is the expected output) and rolls back every fixture.
do $$
declare
  a uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  b1 uuid; b2 uuid; rb uuid; c1 uuid; c2 uuid; c3 uuid; d1 uuid; d2 uuid; x1 uuid;
  ch uuid; priv uuid;
  n integer; results text[] := '{}'; failed integer := 0;
  procedure_ok boolean;
begin
  insert into auth.users(id, email) values (a, a || '@test.invalid'), (r, r || '@test.invalid');
  insert into public.profiles(id, username, nickname) values
    (a, 'ra' || left(replace(a::text, '-', ''), 12), 'Author'),
    (r, 'rr' || left(replace(r::text, '-', ''), 12), 'Other') on conflict (id) do nothing;
  insert into public.books(author_id, title, slug, published) values (a, 'Own book', 'car-a1-' || a, true) returning id into b1;
  insert into public.books(author_id, title, slug, published) values (a, 'Second book', 'car-a2-' || a, true) returning id into b2;
  insert into public.books(author_id, title, slug, published) values (r, 'Foreign book', 'car-r-' || r, true) returning id into rb;
  insert into public.chapters(book_id, title, content, order_index, published) values (b1, 'C1', 'Lâu Lâm', 1, true) returning id into c1;
  insert into public.chapters(book_id, title, content, order_index, published) values (b1, 'C2', 'Lâu Lâm', 2, true) returning id into c2;
  insert into public.chapters(book_id, title, content, order_index, published) values (b1, 'C3', 'Lâu Lâm', 3, false) returning id into c3;
  insert into public.chapters(book_id, title, content, order_index, published) values (b2, 'D1', 'Lâu Lâm', 1, true) returning id into d1;
  insert into public.chapters(book_id, title, content, order_index, published) values (b2, 'D2', 'Lâu Lâm', 2, true) returning id into d2;
  insert into public.chapters(book_id, title, content, order_index, published) values (rb, 'X1', 'Lâu Lâm', 1, true) returning id into x1;
  insert into public.characters(book_id, name, is_public) values (b1, 'Lâu Lâm', true) returning id into ch;
  insert into public.characters(book_id, name, is_public) values (b1, 'Private', false) returning id into priv;

  -- ===== Author =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform public.review_character_appearances(ch, array[c1], array[c2]);
  select count(*) into n from public.chapter_characters where chapter_id = c1 and character_id = ch;
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 1 confirm own chapter tags it');
  select count(*) into n from public.character_chapter_reviews where character_id = ch and chapter_id = c2 and decision = 'dismissed';
  results := array_append(results, case when n = 1 then 'PASS' else 'FAIL' end || ' 2 dismissed own chapter remembered');

  procedure_ok := false;
  begin perform public.review_character_appearances(ch, array[d1]);
  exception when invalid_parameter_value then procedure_ok := true; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 3 other-book chapter needs a main link');

  perform public.review_character_appearances(ch, array[d1], array[d2], p_main_book_ids => array[b2]);
  select count(*) into n from public.character_chapter_reviews where character_id = ch and chapter_id in (d1, d2);
  results := array_append(results, case when n = 2 then 'PASS' else 'FAIL' end || ' 4 main book + chapter decisions in one call');

  procedure_ok := false;
  begin perform public.review_character_appearances(ch, array[c3], array[c3]);
  exception when invalid_parameter_value then procedure_ok := true; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 5 conflicting decisions rejected');

  procedure_ok := false;
  begin perform public.review_character_appearances(ch, p_cameo_book_ids => array[b1]);
  exception when invalid_parameter_value then procedure_ok := true; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 6 own book cannot be linked');

  procedure_ok := false;
  begin perform public.review_character_appearances(ch, p_cameo_book_ids => array[rb]);
  exception when invalid_parameter_value then procedure_ok := true; end;
  procedure_ok := procedure_ok and not exists (select 1 from public.character_book_links where book_id = rb);
  begin perform public.review_character_appearances(ch, p_dismiss_chapter_ids => array[x1]);
    procedure_ok := false;
  exception when invalid_parameter_value then null; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 7 another author''s book/chapter rejected');

  procedure_ok := false;
  begin insert into public.character_chapter_reviews(character_id, chapter_id, decision) values (ch, c3, 'confirmed');
  exception when insufficient_privilege then procedure_ok := true; end;
  begin insert into public.character_book_links(character_id, book_id, appearance) values (ch, b2, 'cameo');
    procedure_ok := false;
  exception when insufficient_privilege then null; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 8 direct writes blocked');

  select count(*) into n from public.character_chapter_reviews where character_id = ch;
  results := array_append(results, case when n = 3 then 'PASS' else 'FAIL' end || ' 9 author reads own reviews (' || n || ')');

  -- Dismissing an already tagged own chapter keeps the tag and stores nothing.
  perform public.review_character_appearances(ch, p_dismiss_chapter_ids => array[c1]);
  select count(*) into n from public.character_chapter_reviews where character_id = ch and chapter_id = c1;
  results := array_append(results, case when n = 0 and exists (select 1 from public.chapter_characters where chapter_id = c1 and character_id = ch)
    then 'PASS' else 'FAIL' end || ' 10 dismiss never removes an existing tag');

  -- ===== Anonymous reader =====
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into n from public.public_character_appearances(ch);
  results := array_append(results, case when n = 2 then 'PASS' else 'FAIL' end || ' 11 public list = own C1 + main D1 (' || n || ')');
  -- anon has no privilege at all on the table (stricter than an empty RLS result).
  procedure_ok := false;
  begin
    select count(*) into n from public.character_chapter_reviews;
    procedure_ok := n = 0;
  exception when insufficient_privilege then procedure_ok := true; end;
  begin
    select count(*) into n from public.character_book_links;
    procedure_ok := procedure_ok and n = 0;
  exception when insufficient_privilege then null; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 12 anon cannot read reviews or book links');
  select count(*) into n from public.public_character_appearances(priv);
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 13 private character hidden');

  -- ===== Other author =====
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.character_chapter_reviews where character_id = ch;
  procedure_ok := n = 0;
  begin perform public.review_character_appearances(ch, p_reset_chapter_ids => array[c2]);
    procedure_ok := false;
  exception when insufficient_privilege then null; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 14 non-owner cannot read or review');

  -- ===== Author: cameo, reset, unpublish, archive =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.review_character_appearances(ch, p_cameo_book_ids => array[b2], p_reset_chapter_ids => array[c2]);
  select count(*) into n from public.character_chapter_reviews where character_id = ch and chapter_id = c2;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 15 reset restores a dismissed chapter');
  execute 'reset role';
  select count(*) into n from public.public_character_appearances(ch) where appearance = 'cameo' and chapter_id is null;
  results := array_append(results, case when n = 1 and (select count(*) from public.public_character_appearances(ch)) = 2
    then 'PASS' else 'FAIL' end || ' 16 cameo book shows title only');
  update public.chapters set published = false where id = c1;
  select count(*) into n from public.public_character_appearances(ch) where chapter_id = c1;
  results := array_append(results, case when n = 0 then 'PASS' else 'FAIL' end || ' 17 unpublished chapter hidden');
  update public.characters set archived_at = now() where id = ch;
  select count(*) into n from public.public_character_appearances(ch);
  procedure_ok := n = 0;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.review_character_appearances(ch, array[c3]);
    procedure_ok := false;
  exception when insufficient_privilege then null; end;
  results := array_append(results, case when procedure_ok then 'PASS' else 'FAIL' end || ' 18 archived character hidden and locked');
  execute 'reset role';

  select count(*) into failed from unnest(results) t where t like 'FAIL%';
  raise exception E'KẾT QUẢ TEST (% FAIL / % ca) — lỗi này là chủ ý để rollback:\n%', failed, cardinality(results), array_to_string(results, E'\n');
end $$;

-- Sau khi chạy, xác nhận không còn dữ liệu test (kỳ vọng 0):
-- select count(*) from auth.users where email like '%@test.invalid';
