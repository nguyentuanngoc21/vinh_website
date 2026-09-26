-- Test cho migrations/20260926_add_contest_review_flags.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration (và
-- migration core 20260926_add_contest_engine_core.sql). Không chạy trên
-- production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_author uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_book uuid;
  v_sub public.contest_submissions;
  v_flag_id uuid;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_author, 'fl-a-' || v_author || '@test.invalid'), (v_admin, 'fl-d-' || v_admin || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_author, 'fa' || left(replace(v_author::text, '-', ''), 12), 'A'),
    (v_admin, 'fd' || left(replace(v_admin::text, '-', ''), 12), 'D')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('fl-' || left(v_admin::text, 8), 'FL', now() - interval '1 day', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'fl-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true);
  select * into v_sub from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');

  begin
    perform public.add_contest_review_flag(v_sub.id, v_author, 'synopsis_too_short', 'Thiếu tóm tắt', null);
    v_results := array_append(v_results, 'FAIL người không phải admin gắn cờ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin gắn cờ' else 'FAIL not_admin: ' || sqlerrm end);
  end;

  begin
    perform public.add_contest_review_flag(v_sub.id, v_admin, 'Bad Code', 'x', null);
    v_results := array_append(v_results, 'FAIL mã cờ sai định dạng');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_flag' then 'PASS mã cờ phải snake_case' else 'FAIL invalid_flag: ' || sqlerrm end);
  end;

  select * into v_sub from public.add_contest_review_flag(v_sub.id, v_admin, 'synopsis_too_short', ' Bổ sung tóm tắt ≥ 50 chữ ', now() + interval '3 days');
  v_results := array_append(v_results, case when jsonb_array_length(v_sub.review_flags) = 1
    and v_sub.review_flags -> 0 ->> 'source' = 'admin'
    and v_sub.review_flags -> 0 ->> 'message' = 'Bổ sung tóm tắt ≥ 50 chữ'
    and (v_sub.review_flags -> 0 ->> 'visible_to_author')::boolean
    and v_sub.review_flags -> 0 -> 'resolved_at' = 'null'::jsonb
    and v_sub.status = 'eligible'
    then 'PASS gắn cờ, không đổi status (D4)' else 'FAIL gắn cờ: ' || v_sub.review_flags::text end);
  v_flag_id := (v_sub.review_flags -> 0 ->> 'id')::uuid;

  begin
    perform public.add_contest_review_flag(v_sub.id, null, 'synopsis_too_short', 'lặp', null);
    v_results := array_append(v_results, 'FAIL gắn trùng mã đang mở');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'flag_exists' then 'PASS không gắn trùng mã đang mở' else 'FAIL flag_exists: ' || sqlerrm end);
  end;

  select * into v_sub from public.add_contest_review_flag(v_sub.id, null, 'below_min_words_at_close', 'Tụt dưới số chữ tối thiểu', null, false);
  v_results := array_append(v_results, case when jsonb_array_length(v_sub.review_flags) = 2
    and v_sub.review_flags -> 1 ->> 'source' = 'system'
    and not (v_sub.review_flags -> 1 ->> 'visible_to_author')::boolean
    then 'PASS cờ hệ thống (ẩn với tác giả)' else 'FAIL cờ hệ thống' end);

  begin
    perform public.resolve_contest_review_flag(v_sub.id, v_flag_id, v_admin, 'done');
    v_results := array_append(v_results, 'FAIL cách xử lý lạ được chấp nhận');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_flag' then 'PASS chỉ nhận fixed/dismissed/escalated' else 'FAIL resolution: ' || sqlerrm end);
  end;

  select * into v_sub from public.resolve_contest_review_flag(v_sub.id, v_flag_id, v_admin, 'fixed');
  v_results := array_append(v_results, case when v_sub.review_flags -> 0 ->> 'resolution' = 'fixed'
    and v_sub.review_flags -> 0 ->> 'resolved_by' = v_admin::text
    and v_sub.review_flags -> 1 -> 'resolved_at' = 'null'::jsonb
    and jsonb_array_length(v_sub.review_flags) = 2
    then 'PASS xử lý đúng cờ, giữ nguyên thứ tự và cờ khác' else 'FAIL xử lý cờ: ' || v_sub.review_flags::text end);

  begin
    perform public.resolve_contest_review_flag(v_sub.id, v_flag_id, v_admin, 'dismissed');
    v_results := array_append(v_results, 'FAIL xử lý lại cờ đã đóng');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'flag_not_found' then 'PASS không xử lý lại cờ đã đóng' else 'FAIL flag_not_found: ' || sqlerrm end);
  end;

  -- Đã xử lý thì gắn lại cùng mã được.
  select * into v_sub from public.add_contest_review_flag(v_sub.id, v_admin, 'synopsis_too_short', 'Lần 2', null);
  v_results := array_append(v_results, case when jsonb_array_length(v_sub.review_flags) = 3
    then 'PASS gắn lại mã đã xử lý' else 'FAIL gắn lại mã' end);

  perform public.set_contest_submission_status(v_sub.id, 'withdrawn', v_author, 'author', null);
  begin
    perform public.add_contest_review_flag(v_sub.id, v_admin, 'other', 'x', null);
    v_results := array_append(v_results, 'FAIL gắn cờ bài đã rút');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_allowed' then 'PASS không gắn cờ bài đã rút' else 'FAIL gắn cờ bài đã rút: ' || sqlerrm end);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.add_contest_review_flag(v_sub.id, v_admin, 'x', 'x', null);
    v_results := array_append(v_results, 'FAIL authenticated gọi thẳng RPC gắn cờ');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC gắn cờ chỉ dành cho service_role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
