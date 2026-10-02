-- Test cho migrations/20261002_book_age_ratings.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- 1 admin, 1 tác giả, 1 người đọc đủ 18 (CCCD năm 1990), 1 người đọc 15 tuổi
-- (CCCD năm hiện tại - 15), 1 người chưa xác thực CCCD. Kiểm: năm sinh từ số
-- CCCD, xác thực tuổi, CHECK cảnh báo ↔ độ tuổi, GRANT cột, khoá nhãn bởi
-- admin, nhật ký actor, RLS chapters truyện 18+/16+, quyền hàm.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_adult uuid := gen_random_uuid();
  v_minor uuid := gen_random_uuid();
  v_unverified uuid := gen_random_uuid();
  v_edge uuid := gen_random_uuid();
  v_year integer := extract(year from (now() at time zone 'Asia/Ho_Chi_Minh'))::integer;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_book uuid;
  v_book16 uuid;
  v_chapter uuid;
  v_ret public.books;
  v_n integer;
  v_b boolean;
  v_hint text;
  v_state text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'ar-' || left(u::text, 8) || '-' || u || '@test.invalid', now()
  from unnest(array[v_admin, v_author, v_adult, v_minor, v_unverified, v_edge]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'ar' || left(replace(u::text, '-', ''), 12), 'U'
  from unnest(array[v_admin, v_author, v_adult, v_minor, v_unverified, v_edge]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  -- CCCD: tỉnh 001, chữ số 4 = 0 (nam 1900s) / 2 (nam 2000s), 2 số năm, 6 số cuối.
  -- Số ngẫu nhiên ở đuôi để không đụng unique index cccd_number của dữ liệu thật.
  update public.profiles set cccd_verified = true where id in (v_adult, v_minor, v_edge);
  insert into public.identity_verifications (user_id, cccd_number, cccd_front_path, cccd_back_path, status)
  values
    (v_adult, '001090' || lpad((floor(random() * 1000000))::text, 6, '0'), 'test/f', 'test/b', 'approved'),
    (v_minor, '0012' || lpad(((v_year - 15) % 100)::text, 2, '0') || lpad((floor(random() * 1000000))::text, 6, '0'),
       'test/f', 'test/b', 'approved'),
    -- Biên: năm sinh = năm hiện tại - 18, ngày sinh tự nhập khớp năm và đã qua sinh nhật hôm nay.
    (v_edge, '0012' || lpad(((v_year - 18) % 100)::text, 2, '0') || lpad((floor(random() * 1000000))::text, 6, '0'),
       'test/f', 'test/b', 'approved');
  update public.profiles set date_of_birth = (v_today - interval '18 years')::date where id = v_edge;

  -- ===== 1. cccd_birth_year =====
  v_results := array_append(v_results, case when
      public.cccd_birth_year('001090123456') = 1990
      and public.cccd_birth_year('079203123456') = 2003
      and public.cccd_birth_year('079303123456') = 2003
      and public.cccd_birth_year('12345') is null
      and public.cccd_birth_year('00109012345a') is null
    then 'PASS' else 'FAIL' end || ' 1. năm sinh từ số CCCD');

  -- ===== 2. is_age_verified_adult =====
  v_results := array_append(v_results, case when
      public.is_age_verified_adult(v_adult)
      and not public.is_age_verified_adult(v_minor)
      and not public.is_age_verified_adult(v_unverified)
      and public.is_age_verified_adult(v_edge)
    then 'PASS' else 'FAIL' end || ' 2. xác thực tuổi: 18+ đúng, 15 tuổi/chưa xác thực sai, biên đúng ngày');

  -- ===== 3. Biên: ngày sinh tự nhập KHÔNG khớp năm trên CCCD → không dùng được =====
  update public.profiles set date_of_birth = (v_today - interval '30 years')::date where id = v_edge;
  v_b := public.is_age_verified_adult(v_edge);
  update public.profiles set date_of_birth = (v_today - interval '18 years')::date where id = v_edge;
  v_results := array_append(v_results, case when not v_b
    then 'PASS' else 'FAIL' end || ' 3. ngày sinh lệch năm CCCD không được tính');

  -- ===== 4. Tạo truyện: mặc định Mọi lứa tuổi + 1 sự kiện ban đầu =====
  insert into public.books (author_id, title, slug, published) values (v_author, 'Thử 18', 'ar-' || v_author, true)
  returning id into v_book;
  select count(*) into v_n from public.book_age_rating_events where book_id = v_book;
  v_results := array_append(v_results, case when
      (select age_rating from public.books where id = v_book) = 'all'
      and v_n = 1 and exists (select 1 from public.book_age_rating_events
        where book_id = v_book and from_rating is null and to_rating = 'all' and not locked)
    then 'PASS' else 'FAIL' end || ' 4. mặc định all + sự kiện ban đầu (events=' || v_n || ')');

  -- ===== 5. CHECK cảnh báo ↔ độ tuổi =====
  v_n := 0;
  begin
    update public.books set age_rating = '16', content_warnings = '{sexual_explicit}' where id = v_book;
  exception when check_violation then v_n := v_n + 1; end;
  begin
    update public.books set age_rating = 'all', content_warnings = '{violence}' where id = v_book;
  exception when check_violation then v_n := v_n + 1; end;
  begin
    update public.books set age_rating = '18', content_warnings = '{khong_ton_tai}' where id = v_book;
  exception when check_violation then v_n := v_n + 1; end;
  v_results := array_append(v_results, case when v_n = 3
    then 'PASS' else 'FAIL' end || ' 5. CHECK chặn 3 tổ hợp sai (' || v_n || '/3)');

  -- ===== 6. Tác giả đổi nhãn qua session thật (GRANT cột) → actor author =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.books set age_rating = '18', content_warnings = '{violence,sexual_explicit}' where id = v_book;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when
      (select age_rating from public.books where id = v_book) = '18'
      and exists (select 1 from public.book_age_rating_events
        where book_id = v_book and actor_kind = 'author' and actor_id = v_author and from_rating = 'all' and to_rating = '18')
    then 'PASS' else 'FAIL' end || ' 6. tác giả đổi nhãn → actor author');

  -- ===== 7. Tác giả không tự set cột khoá =====
  v_state := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.books set age_rating_locked_at = now(), age_rating_locked_by = v_author where id = v_book;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 7. tác giả không set được cột khoá (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 8. RPC admin: thiếu lý do / không phải admin bị chặn =====
  v_hint := null;
  begin
    perform public.admin_set_book_age_rating(v_book, v_admin, '18', '{violence}', '  ', true);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; end;
  v_state := null;
  begin
    perform public.admin_set_book_age_rating(v_book, v_author, '18', '{violence}', 'thử', true);
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  v_results := array_append(v_results, case when v_hint = 'age_rating_reason_required' and v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 8. RPC chặn thiếu lý do + người không phải admin');

  -- ===== 9. Admin đặt nhãn + khoá → actor admin, lưu lý do, khoá =====
  v_ret := public.admin_set_book_age_rating(v_book, v_admin, '18', '{gore_extreme}', 'Báo cáo #1', true);
  v_results := array_append(v_results, case when
      v_ret.age_rating = '18' and v_ret.content_warnings = '{gore_extreme}'
      and v_ret.age_rating_locked_at is not null and v_ret.age_rating_locked_by = v_admin
      and exists (select 1 from public.book_age_rating_events
        where book_id = v_book and actor_kind = 'admin' and actor_id = v_admin and reason = 'Báo cáo #1' and locked)
    then 'PASS' else 'FAIL' end || ' 9. admin đặt + khoá + lưu lý do');

  -- ===== 10. Đang khoá: tác giả sửa bị chặn =====
  v_hint := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.books set age_rating = '16', content_warnings = '{violence}' where id = v_book;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_hint = 'age_rating_locked'
      and (select age_rating from public.books where id = v_book) = '18'
    then 'PASS' else 'FAIL' end || ' 10. đang khoá: tác giả bị chặn (hint=' || coalesce(v_hint, 'null') || ')');

  -- ===== 11. Giả mạo biến phiên bằng id người thường → vẫn bị chặn =====
  v_hint := null;
  perform set_config('vinh.age_rating_actor', v_author::text, true);
  begin
    update public.books set age_rating = '16', content_warnings = '{violence}' where id = v_book;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; end;
  perform set_config('vinh.age_rating_actor', '', true);
  v_results := array_append(v_results, case when v_hint = 'age_rating_locked'
    then 'PASS' else 'FAIL' end || ' 11. biến phiên giả không mở được khoá');

  -- ===== 12. RLS chapters truyện 18+ =====
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book, 'C1', 'nội dung 18+', 1, true) returning id into v_chapter;

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into v_n from public.chapters where id = v_chapter;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 0
    then 'PASS' else 'FAIL' end || ' 12a. khách không thấy chương 18+ (' || v_n || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', v_minor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.chapters where id = v_chapter;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 0
    then 'PASS' else 'FAIL' end || ' 12b. người 15 tuổi không thấy (' || v_n || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', v_unverified, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.chapters where id = v_chapter;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 0
    then 'PASS' else 'FAIL' end || ' 12c. chưa xác thực không thấy (' || v_n || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', v_adult, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.chapters where id = v_chapter;
  select public.viewer_can_read_adult() into v_b;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 1 and v_b
    then 'PASS' else 'FAIL' end || ' 12d. người đủ 18 đã xác thực thấy (' || v_n || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.chapters where id = v_chapter;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_n = 1
    then 'PASS' else 'FAIL' end || ' 12e. tác giả thấy chương của mình (' || v_n || ')');

  -- ===== 13. Truyện 16+: khách vẫn thấy chương (chỉ tự xác nhận ở giao diện) =====
  insert into public.books (author_id, title, slug, published, age_rating, content_warnings)
  values (v_author, 'Thử 16', 'ar16-' || v_author, true, '16', '{horror}') returning id into v_book16;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book16, 'C1', 'x', 1, true);
  execute 'set local role anon';
  select count(*) into v_n from public.chapters where book_id = v_book16;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 1
    then 'PASS' else 'FAIL' end || ' 13. truyện 16+ khách vẫn thấy chương (' || v_n || ')');

  -- ===== 14. Admin mở khoá → tác giả sửa lại được =====
  perform public.admin_set_book_age_rating(v_book, v_admin, '18', '{gore_extreme}', 'Mở khoá', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.books set age_rating = '18', content_warnings = '{abuse}' where id = v_book;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when
      (select content_warnings from public.books where id = v_book) = '{abuse}'
      and (select age_rating_locked_at from public.books where id = v_book) is null
    then 'PASS' else 'FAIL' end || ' 14. mở khoá → tác giả sửa được');

  -- ===== 15. Quyền =====
  v_results := array_append(v_results, case when
      not has_function_privilege('anon', 'public.is_age_verified_adult(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.is_age_verified_adult(uuid)', 'execute')
      and has_function_privilege('service_role', 'public.is_age_verified_adult(uuid)', 'execute')
      and has_function_privilege('anon', 'public.viewer_can_read_adult()', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_set_book_age_rating(uuid, uuid, text, text[], text, boolean)', 'execute')
      and has_function_privilege('service_role', 'public.admin_set_book_age_rating(uuid, uuid, text, text[], text, boolean)', 'execute')
      and not has_table_privilege('authenticated', 'public.book_age_rating_events', 'insert')
      and not has_column_privilege('authenticated', 'public.books', 'age_rating_locked_at', 'update')
      and has_column_privilege('authenticated', 'public.books', 'age_rating', 'update')
      and has_table_privilege('anon', 'public.adult_audio_narration_ids', 'select')
    then 'PASS' else 'FAIL' end || ' 15. quyền hàm/bảng/cột đúng');

  -- ===== 16. RLS nhật ký: user thường 0 dòng, admin đọc được =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.book_age_rating_events where book_id = v_book;
  execute 'reset role';
  v_b := v_n = 0;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.book_age_rating_events where book_id = v_book;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_b and v_n >= 4
    then 'PASS' else 'FAIL' end || ' 16. nhật ký chỉ admin đọc (admin=' || v_n || ')');

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % / % PASS, % FAIL (rollback có chủ đích) ===',
    array_to_string(v_results, E'\n'), v_pass, v_total, v_total - v_pass;
end;
$$;
