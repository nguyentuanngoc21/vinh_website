-- Test cho migrations/20261002_chapter_content_access.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- 1 tác giả, 1 người đọc. Truyện công khai có 1 chương có giá. Kiểm: khách/người
-- đọc/kể cả tác giả KHÔNG SELECT được cột content qua vai trò anon/authenticated
-- (chỉ server service-role đọc), vẫn đọc được các cột khác; tác giả vẫn thêm
-- chương (RETURNING id) và sửa nội dung được.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_author uuid := gen_random_uuid();
  v_reader uuid := gen_random_uuid();
  v_book uuid;
  v_chapter uuid;
  v_new uuid;
  v_n integer;
  v_text text;
  v_state text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'cc-' || left(u::text, 8) || '-' || u || '@test.invalid', now() from unnest(array[v_author, v_reader]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'cc' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_author, v_reader]) u
  on conflict (id) do nothing;

  insert into public.books (author_id, title, slug, published) values (v_author, 'Thử', 'cc-' || v_author, true)
  returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published, price)
  values (v_book, 'VIP', 'nội dung trả phí', 1, true, 50) returning id into v_chapter;

  -- ===== 1. Quyền cột =====
  v_results := array_append(v_results, case when
      not has_column_privilege('anon', 'public.chapters', 'content', 'select')
      and not has_column_privilege('authenticated', 'public.chapters', 'content', 'select')
      and has_column_privilege('anon', 'public.chapters', 'title', 'select')
      and has_column_privilege('authenticated', 'public.chapters', 'price', 'select')
      and has_column_privilege('authenticated', 'public.chapters', 'content', 'update')
      and has_column_privilege('authenticated', 'public.chapters', 'content', 'insert')
    then 'PASS' else 'FAIL' end || ' 1. không SELECT content, vẫn SELECT cột khác + INSERT/UPDATE content');

  -- ===== 2. Khách: đọc content bị chặn =====
  v_state := null;
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin
    select content into v_text from public.chapters where id = v_chapter;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  v_results := array_append(v_results, case when v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 2. khách SELECT content bị chặn (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 3. Khách: vẫn thấy chương trong mục lục (tiêu đề, giá) =====
  execute 'set local role anon';
  select count(*) into v_n from public.chapters where id = v_chapter and title = 'VIP' and price = 50;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 1
    then 'PASS' else 'FAIL' end || ' 3. khách vẫn đọc tiêu đề/giá (' || v_n || ')');

  -- ===== 4. Người đọc đăng nhập: select * bị chặn =====
  v_state := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_reader, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from public.chapters where id = v_chapter;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  v_results := array_append(v_results, case when v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 4. người đọc select * bị chặn (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 5. Tác giả: thêm chương RETURNING id + sửa nội dung được =====
  v_state := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.chapters (book_id, title, content, order_index) values (v_book, 'Mới', 'nháp', 2) returning id into v_new;
    update public.chapters set content = 'đã sửa' where id = v_chapter;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_state is null and v_new is not null
      and (select content from public.chapters where id = v_chapter) = 'đã sửa'
    then 'PASS' else 'FAIL' end || ' 5. tác giả thêm/sửa chương được (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 6. Tác giả cũng không SELECT content qua vai trò authenticated (đọc qua server) =====
  v_state := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select content into v_text from public.chapters where id = v_chapter;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 6. tác giả cũng không SELECT content trực tiếp (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 7. service_role vẫn đọc được =====
  execute 'set local role service_role';
  select content into v_text from public.chapters where id = v_chapter;
  execute 'reset role';
  v_results := array_append(v_results, case when v_text = 'đã sửa'
    then 'PASS' else 'FAIL' end || ' 7. service_role đọc content');

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % / % PASS, % FAIL (rollback có chủ đích) ===',
    array_to_string(v_results, E'\n'), v_pass, v_total, v_total - v_pass;
end;
$$;
