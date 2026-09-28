-- Test cho migrations/20260928_add_role_change_logs.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- 1 super_admin, 1 admin, 1 user thường. Kiểm admin_set_user_role(): chỉ
-- super_admin đổi được, ghi nhật ký đúng, không ghi khi role không đổi,
-- chặn tự hạ quyền, chặn người lạ gọi hàm / đọc bảng nhật ký.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_super uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_role public.user_role;
  v_n integer;
  v_log record;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'rc-' || left(u::text, 8) || '-' || u || '@test.invalid', now()
  from unnest(array[v_super, v_admin, v_user]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'rc' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_super, v_admin, v_user]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'super_admin' where id = v_super;
  update public.profiles set role = 'admin' where id = v_admin;

  -- ===== 1. Admin thường không đổi được role =====
  v_hint := null;
  begin
    perform public.admin_set_user_role(v_admin, v_user, 'admin');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  select role into v_role from public.profiles where id = v_user;
  v_results := v_results || (case when v_hint = 'actor_not_super_admin' and v_role = 'user'
    then 'PASS' else 'FAIL' end || ' 1. admin thường bị chặn (hint=' || coalesce(v_hint, 'null') || ', role=' || v_role || ')');

  -- ===== 2. super_admin nâng user → admin, có 1 dòng nhật ký đúng =====
  v_role := public.admin_set_user_role(v_super, v_user, 'admin');
  select count(*) into v_n from public.role_change_logs where target_id = v_user;
  select * into v_log from public.role_change_logs where target_id = v_user order by created_at desc limit 1;
  v_results := v_results || (case when v_role = 'admin'
      and (select role from public.profiles where id = v_user) = 'admin'
      and v_n = 1 and v_log.actor_id = v_super and v_log.old_role = 'user' and v_log.new_role = 'admin'
    then 'PASS' else 'FAIL' end || ' 2. super_admin nâng quyền + ghi nhật ký (logs=' || v_n || ')');

  -- ===== 3. Đặt lại đúng role hiện tại → không ghi thêm =====
  perform public.admin_set_user_role(v_super, v_user, 'admin');
  select count(*) into v_n from public.role_change_logs where target_id = v_user;
  v_results := v_results || (case when v_n = 1
    then 'PASS' else 'FAIL' end || ' 3. role không đổi thì không ghi (logs=' || v_n || ')');

  -- ===== 4. Hạ quyền về user → dòng nhật ký thứ 2 =====
  perform public.admin_set_user_role(v_super, v_user, 'user');
  select count(*) into v_n from public.role_change_logs
   where target_id = v_user and old_role = 'admin' and new_role = 'user';
  v_results := v_results || (case when v_n = 1 and (select role from public.profiles where id = v_user) = 'user'
    then 'PASS' else 'FAIL' end || ' 4. hạ quyền được ghi');

  -- ===== 5. super_admin tự hạ quyền → bị chặn =====
  v_hint := null;
  begin
    perform public.admin_set_user_role(v_super, v_super, 'admin');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  v_results := v_results || (case when v_hint = 'self_demotion'
      and (select role from public.profiles where id = v_super) = 'super_admin'
    then 'PASS' else 'FAIL' end || ' 5. chặn tự hạ quyền (hint=' || coalesce(v_hint, 'null') || ')');

  -- ===== 6. Người đích không tồn tại =====
  v_hint := null;
  begin
    perform public.admin_set_user_role(v_super, gen_random_uuid(), 'admin');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  v_results := v_results || (case when v_hint = 'target_not_found'
    then 'PASS' else 'FAIL' end || ' 6. target không tồn tại (hint=' || coalesce(v_hint, 'null') || ')');

  -- ===== 7. anon/authenticated không gọi được hàm, không đọc được bảng =====
  v_results := v_results || (case when
      not has_function_privilege('anon', 'public.admin_set_user_role(uuid, uuid, public.user_role)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_set_user_role(uuid, uuid, public.user_role)', 'execute')
      and not has_table_privilege('anon', 'public.role_change_logs', 'select')
      and not has_table_privilege('authenticated', 'public.role_change_logs', 'select')
      and has_function_privilege('service_role', 'public.admin_set_user_role(uuid, uuid, public.user_role)', 'execute')
    then 'PASS' else 'FAIL' end || ' 7. chỉ service_role dùng được');

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % / % PASS, % FAIL (rollback có chủ đích) ===',
    array_to_string(v_results, E'\n'), v_pass, v_total, v_total - v_pass;
end;
$$;
