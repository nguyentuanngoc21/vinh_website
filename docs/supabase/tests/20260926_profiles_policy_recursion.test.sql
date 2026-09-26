-- Test cho migrations/20260926_fix_profiles_policy_recursion.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. Không chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu
-- giả. Mỗi truy vấn bọc exception riêng để lỗi 42P17 (nếu còn) hiện thành
-- FAIL thay vì dừng cả script.
--
-- Đạt khi dòng tổng ghi "8 PASS, 0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_count integer;
  v_bool boolean;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_user, 'pu-' || v_user || '@test.invalid'),
    (v_other, 'po-' || v_other || '@test.invalid'),
    (v_admin, 'pa-' || v_admin || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_user, 'pu' || left(replace(v_user::text, '-', ''), 12), 'User'),
    (v_other, 'po' || left(replace(v_other::text, '-', ''), 12), 'Other'),
    (v_admin, 'pa' || left(replace(v_admin::text, '-', ''), 12), 'Admin')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  -- ===== Người dùng thường =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    select count(*) into v_count from public.profiles where id = v_user;
    v_results := array_append(v_results, case when v_count = 1 then 'PASS đọc được hồ sơ của chính mình' else 'FAIL không đọc được hồ sơ của mình' end);
  exception when others then
    v_results := array_append(v_results, 'FAIL đọc hồ sơ của mình: ' || sqlerrm);
  end;

  begin
    select count(*) into v_count from public.profiles where id = v_other;
    v_results := array_append(v_results, case when v_count = 0 then 'PASS không đọc được hồ sơ người khác' else 'FAIL đọc được hồ sơ người khác' end);
  exception when others then
    v_results := array_append(v_results, 'FAIL đọc hồ sơ người khác: ' || sqlerrm);
  end;

  begin
    select public.current_user_is_admin() into v_bool;
    v_results := array_append(v_results, case when not v_bool then 'PASS người thường không phải admin' else 'FAIL người thường là admin' end);
  exception when others then
    v_results := array_append(v_results, 'FAIL current_user_is_admin (user): ' || sqlerrm);
  end;

  -- Policy của bảng khác có subquery trên profiles (trước đây cũng dính 42P17).
  begin
    select count(*) into v_count from public.book_moderation_actions;
    v_results := array_append(v_results, case when v_count = 0 then 'PASS policy bảng khác hỏi profiles: không lỗi, không lộ' else 'FAIL book_moderation_actions lộ dữ liệu' end);
  exception when others then
    v_results := array_append(v_results, 'FAIL book_moderation_actions (user): ' || sqlerrm);
  end;

  -- ===== Admin =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  begin
    select count(*) into v_count from public.profiles where id in (v_user, v_other);
    v_results := array_append(v_results, case when v_count = 2 then 'PASS admin đọc được mọi hồ sơ' else 'FAIL admin đọc hồ sơ: ' || v_count end);
  exception when others then
    v_results := array_append(v_results, 'FAIL admin đọc hồ sơ: ' || sqlerrm);
  end;

  begin
    select count(*) into v_count from public.book_moderation_actions;
    v_results := array_append(v_results, 'PASS admin đọc book_moderation_actions không lỗi');
  exception when others then
    v_results := array_append(v_results, 'FAIL book_moderation_actions (admin): ' || sqlerrm);
  end;

  -- ===== Khách (anon) =====
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';

  begin
    select count(*) into v_count from public.profiles where id in (v_user, v_other, v_admin);
    v_results := array_append(v_results, case when v_count = 0 then 'PASS anon không đọc được hồ sơ, không lỗi' else 'FAIL anon đọc được hồ sơ' end);
  exception when others then
    v_results := array_append(v_results, 'FAIL anon đọc profiles: ' || sqlerrm);
  end;

  begin
    select public.current_user_is_admin() into v_bool;
    v_results := array_append(v_results, case when not v_bool then 'PASS anon không phải admin' else 'FAIL anon là admin' end);
  exception when others then
    v_results := array_append(v_results, 'FAIL current_user_is_admin (anon): ' || sqlerrm);
  end;

  execute 'reset role';
  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
