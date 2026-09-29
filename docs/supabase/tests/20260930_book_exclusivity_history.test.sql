-- Test cho migrations/20260930_book_exclusivity_default_and_history.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- 1 admin, 1 tác giả, 1 user thường. Kiểm: mặc định Tự do, trigger ghi lịch
-- sử đúng actor (author/admin/system), RPC admin bắt buộc lý do + chặn người
-- không phải admin, biến phiên không lọt sang câu lệnh sau, quyền đọc/ghi bảng.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_book uuid;
  v_ret public.books;
  v_ev record;
  v_n integer;
  v_hint text;
  v_state text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'ex-' || left(u::text, 8) || '-' || u || '@test.invalid', now()
  from unnest(array[v_admin, v_author, v_user]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'ex' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_admin, v_author, v_user]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  -- ===== 1. Tạo truyện không truyền is_exclusive → Tự do + 1 sự kiện tạo =====
  insert into public.books (author_id, title, slug) values (v_author, 'Thử', 'ex-' || v_author)
  returning id into v_book;
  select * into v_ev from public.book_exclusivity_events where book_id = v_book;
  select count(*) into v_n from public.book_exclusivity_events where book_id = v_book;
  v_results := array_append(v_results, case when
      (select is_exclusive from public.books where id = v_book) = false
      and v_n = 1 and v_ev.from_exclusive is null and v_ev.to_exclusive = false and v_ev.actor_kind = 'system'
    then 'PASS' else 'FAIL' end || ' 1. mặc định Tự do + sự kiện tạo (events=' || v_n || ')');

  -- ===== 2. Tác giả (auth.uid() = author) bật độc quyền → actor author =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  update public.books set is_exclusive = true where id = v_book;
  perform set_config('request.jwt.claims', '{}', true);
  select count(*) into v_n from public.book_exclusivity_events where book_id = v_book;
  v_results := array_append(v_results, case when v_n = 2 and exists (
      select 1 from public.book_exclusivity_events
      where book_id = v_book and actor_kind = 'author' and actor_id = v_author
        and from_exclusive = false and to_exclusive = true)
    then 'PASS' else 'FAIL' end || ' 2. tác giả đổi → actor author (events=' || v_n || ')');

  -- ===== 3. Update không đổi giá trị → không ghi =====
  update public.books set is_exclusive = true where id = v_book;
  select count(*) into v_n from public.book_exclusivity_events where book_id = v_book;
  v_results := array_append(v_results, case when v_n = 2
    then 'PASS' else 'FAIL' end || ' 3. không đổi thì không ghi (events=' || v_n || ')');

  -- ===== 4. RPC thiếu lý do → bị chặn =====
  v_hint := null;
  begin
    perform public.admin_set_book_exclusive(v_book, v_admin, false, '   ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  v_results := array_append(v_results, case when v_hint = 'exclusivity_reason_required'
      and (select is_exclusive from public.books where id = v_book) = true
    then 'PASS' else 'FAIL' end || ' 4. thiếu lý do bị chặn (hint=' || coalesce(v_hint, 'null') || ')');

  -- ===== 5. Người không phải admin gọi RPC → bị chặn =====
  v_state := null;
  begin
    perform public.admin_set_book_exclusive(v_book, v_user, false, 'thử');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  v_results := array_append(v_results, case when v_state = '42501'
      and (select is_exclusive from public.books where id = v_book) = true
    then 'PASS' else 'FAIL' end || ' 5. user thường bị chặn (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 6. Admin bỏ độc quyền có lý do → actor admin, lưu lý do =====
  v_ret := public.admin_set_book_exclusive(v_book, v_admin, false, 'Gán nhầm khi nhập bản thảo');
  v_results := array_append(v_results, case when v_ret.id = v_book and v_ret.is_exclusive = false and exists (
      select 1 from public.book_exclusivity_events
      where book_id = v_book and actor_kind = 'admin' and actor_id = v_admin
        and reason = 'Gán nhầm khi nhập bản thảo' and from_exclusive = true and to_exclusive = false)
    then 'PASS' else 'FAIL' end || ' 6. admin đổi + lưu lý do');

  -- ===== 7. Biến phiên đã xoá: update thường sau RPC không bị ghi là admin =====
  update public.books set is_exclusive = true where id = v_book;
  -- false → true chỉ có 2 lần: tác giả (test 2) và lần này.
  select count(*) into v_n from public.book_exclusivity_events
   where book_id = v_book and from_exclusive = false and to_exclusive = true and actor_kind = 'system' and reason is null;
  v_results := array_append(v_results, case when v_n = 1
    then 'PASS' else 'FAIL' end || ' 7. không lọt actor admin (system=' || v_n || ')');

  -- ===== 8. Giả mạo biến phiên bằng id người thường → không thành admin =====
  perform set_config('vinh.exclusivity_actor', v_user::text, true);
  update public.books set is_exclusive = false where id = v_book;
  perform set_config('vinh.exclusivity_actor', '', true);
  -- true → false chỉ có 2 lần: admin (test 6) và lần này.
  select count(*) into v_n from public.book_exclusivity_events
   where book_id = v_book and from_exclusive = true and to_exclusive = false and actor_kind = 'system';
  v_results := array_append(v_results, case when v_n = 1
    then 'PASS' else 'FAIL' end || ' 8. biến phiên giả không thành admin (system=' || v_n || ')');

  -- ===== 9. Truyện không tồn tại → RPC trả null =====
  v_ret := public.admin_set_book_exclusive(gen_random_uuid(), v_admin, false, 'thử');
  v_results := array_append(v_results, case when v_ret.id is null
    then 'PASS' else 'FAIL' end || ' 9. truyện không tồn tại trả null');

  -- ===== 10. RLS: user thường không đọc được, admin đọc được =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.book_exclusivity_events where book_id = v_book;
  execute 'reset role';
  v_results := array_append(v_results, case when v_n = 0
    then 'PASS' else 'FAIL' end || ' 10a. user thường đọc 0 dòng (' || v_n || ')');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.book_exclusivity_events where book_id = v_book;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  v_results := array_append(v_results, case when v_n >= 5
    then 'PASS' else 'FAIL' end || ' 10b. admin đọc được (' || v_n || ')');

  -- ===== 11. Quyền: client không ghi bảng, không gọi RPC =====
  v_results := array_append(v_results, case when
      not has_table_privilege('authenticated', 'public.book_exclusivity_events', 'insert')
      and not has_table_privilege('anon', 'public.book_exclusivity_events', 'insert')
      and not has_table_privilege('authenticated', 'public.book_exclusivity_events', 'delete')
      and not has_function_privilege('anon', 'public.admin_set_book_exclusive(uuid, uuid, boolean, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_set_book_exclusive(uuid, uuid, boolean, text)', 'execute')
      and has_function_privilege('service_role', 'public.admin_set_book_exclusive(uuid, uuid, boolean, text)', 'execute')
    then 'PASS' else 'FAIL' end || ' 11. chỉ service_role gọi RPC, client không ghi bảng');

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % / % PASS, % FAIL (rollback có chủ đích) ===',
    array_to_string(v_results, E'\n'), v_pass, v_total, v_total - v_pass;
end;
$$;
