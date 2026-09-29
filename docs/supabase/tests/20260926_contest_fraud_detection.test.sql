-- Test cho migrations/archive/20260926_add_contest_fraud_detection.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Ngưỡng dùng trong test = mặc định của fraud-service.ts: 10 phiếu / 10 phút;
-- phiếu đầu trong 3 ngày sau khi vừa đủ 7 ngày tuổi và ≥ 5 phiếu.
-- 10 bài dự thi. Người bầu (phiếu ghi thẳng, tự đặt thời điểm):
--   fast     : tài khoản 60 ngày, 10 phiếu trong 5 phút      → rapid_voting
--   slow     : tài khoản 60 ngày, 10 phiếu cách nhau 1 giờ   → không
--   fresh    : tài khoản 8 ngày, 5 phiếu cách nhau 20 phút   → new_account_mass_voting
--   fresh4   : tài khoản 8 ngày, 4 phiếu                     → không (dưới 5 phiếu)
--   veteran  : tài khoản 60 ngày, 5 phiếu cách nhau 20 phút  → không
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_fast uuid := gen_random_uuid();
  v_slow uuid := gen_random_uuid();
  v_fresh uuid := gen_random_uuid();
  v_fresh4 uuid := gen_random_uuid();
  v_veteran uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_book uuid;
  v_subs uuid[] := '{}';
  v_signal public.contest_fraud_signals;
  v_signal_id uuid;
  v_created integer;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at) values
    (v_admin, 'fd-d-' || v_admin || '@test.invalid', now() - interval '60 days'),
    (v_author, 'fd-a-' || v_author || '@test.invalid', now() - interval '60 days'),
    (v_fast, 'fd-1-' || v_fast || '@test.invalid', now() - interval '60 days'),
    (v_slow, 'fd-2-' || v_slow || '@test.invalid', now() - interval '60 days'),
    (v_fresh, 'fd-3-' || v_fresh || '@test.invalid', now() - interval '8 days'),
    (v_fresh4, 'fd-4-' || v_fresh4 || '@test.invalid', now() - interval '8 days'),
    (v_veteran, 'fd-5-' || v_veteran || '@test.invalid', now() - interval '60 days');
  insert into public.profiles (id, username, nickname)
  select u, 'fd' || left(replace(u::text, '-', ''), 12), 'U'
  from unnest(array[v_admin, v_author, v_fast, v_slow, v_fresh, v_fresh4, v_veteran]) as u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('fd-' || left(v_admin::text, 8), 'Giải thử', now() - interval '20 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  for i in 1..10 loop
    insert into public.books (author_id, title, slug, published) values (v_author, 'B' || i, 'fd-b' || i || '-' || v_author, true)
    returning id into v_book;
    insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true);
    v_subs := v_subs || (select s.id from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]') s);
  end loop;

  -- Trước khi mở bình chọn: không quét.
  v_created := public.detect_contest_fraud_signals(v_contest, 10, 10, 3, 5);
  v_results := array_append(v_results, case when v_created = 0 then 'PASS chưa bình chọn thì không quét' else 'FAIL quét trước bình chọn: ' || v_created end);

  update public.contests set submission_end = now() - interval '1 minute',
         voting_start = now() - interval '12 hours', voting_end = now() + interval '1 day'
   where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);
  perform public.transition_contest_status(v_contest, 'community_voting', v_admin, null);

  insert into public.contest_votes (contest_id, submission_id, user_id, created_at)
  select v_contest, v_subs[i], v_fast, now() - interval '2 hours' + make_interval(secs => i * 30) from generate_series(1, 10) i
  union all
  select v_contest, v_subs[i], v_slow, now() - interval '11 hours' + make_interval(hours => i) from generate_series(1, 10) i
  union all
  select v_contest, v_subs[i], v_fresh, now() - interval '3 hours' + make_interval(mins => i * 20) from generate_series(1, 5) i
  union all
  select v_contest, v_subs[i], v_fresh4, now() - interval '3 hours' + make_interval(mins => i * 20) from generate_series(1, 4) i
  union all
  select v_contest, v_subs[i], v_veteran, now() - interval '3 hours' + make_interval(mins => i * 20) from generate_series(1, 5) i;

  -- ===== 1. Phát hiện =====
  v_created := public.detect_contest_fraud_signals(v_contest, 10, 10, 3, 5);
  v_results := array_append(v_results, case when v_created = 2 then 'PASS quét gắn đúng 2 tín hiệu' else 'FAIL số tín hiệu: ' || v_created end);

  select * into v_signal from public.contest_fraud_signals where contest_id = v_contest and signal_code = 'rapid_voting' and user_id = v_fast;
  select count(*) into v_count from public.contest_fraud_signals where contest_id = v_contest and signal_code = 'rapid_voting';
  v_results := array_append(v_results, case when v_signal.id is not null and v_count = 1 and v_signal.status = 'open'
    and v_signal.severity = 'medium' and (v_signal.evidence ->> 'votes_in_window')::integer = 10 and v_signal.submission_id is null
    then 'PASS bình chọn dồn dập: 10 phiếu / 5 phút bị gắn, 10 phiếu rải 10 giờ thì không'
    else 'FAIL rapid_voting' end);

  select * into v_signal from public.contest_fraud_signals where contest_id = v_contest and signal_code = 'new_account_mass_voting';
  select count(*) into v_count from public.contest_fraud_signals where contest_id = v_contest and signal_code = 'new_account_mass_voting';
  v_results := array_append(v_results, case when v_signal.user_id = v_fresh and v_count = 1
    and (v_signal.evidence ->> 'votes')::integer = 5
    then 'PASS tài khoản vừa đủ tuổi bầu hàng loạt bị gắn; dưới 5 phiếu hoặc tài khoản lâu năm thì không'
    else 'FAIL new_account_mass_voting: ' || v_count end);

  v_created := public.detect_contest_fraud_signals(v_contest, 10, 10, 3, 5);
  v_results := array_append(v_results, case when v_created = 0 then 'PASS quét lại không gắn trùng' else 'FAIL quét lại: ' || v_created end);

  begin
    insert into public.contest_fraud_signals (contest_id, user_id, signal_code) values (v_contest, v_fast, 'rapid_voting');
    v_results := array_append(v_results, 'FAIL ghi trùng tín hiệu được');
  exception when unique_violation then
    v_results := array_append(v_results, 'PASS index chặn tín hiệu trùng');
  end;

  -- ===== 2. Admin xét =====
  select id into v_signal_id from public.contest_fraud_signals where contest_id = v_contest and user_id = v_fast;
  begin
    perform public.review_contest_fraud_signal(v_signal_id, v_author, 'confirmed', null);
    v_results := array_append(v_results, 'FAIL người không phải admin xét được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin xét tín hiệu' else 'FAIL not_admin: ' || sqlerrm end);
  end;
  begin
    perform public.review_contest_fraud_signal(v_signal_id, v_admin, 'banned', null);
    v_results := array_append(v_results, 'FAIL nhận trạng thái lạ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_input' then 'PASS trạng thái xét lạ bị từ chối' else 'FAIL invalid_input: ' || sqlerrm end);
  end;

  v_signal := public.review_contest_fraud_signal(v_signal_id, v_admin, 'confirmed', '  Bot  ');
  v_results := array_append(v_results, case when v_signal.status = 'confirmed' and v_signal.reviewed_by = v_admin
    and v_signal.reviewed_at is not null and v_signal.review_note = 'Bot'
    then 'PASS xác nhận: ghi người xét, thời điểm, ghi chú' else 'FAIL xác nhận' end);
  v_signal := public.review_contest_fraud_signal(v_signal.id, v_admin, 'open', null);
  v_results := array_append(v_results, case when v_signal.status = 'open' and v_signal.reviewed_by is null and v_signal.reviewed_at is null
    then 'PASS mở lại tín hiệu' else 'FAIL mở lại' end);

  v_signal := public.review_contest_fraud_signal(v_signal.id, v_admin, 'dismissed', null);
  v_created := public.detect_contest_fraud_signals(v_contest, 10, 10, 3, 5);
  select count(*) into v_count from public.contest_fraud_signals where contest_id = v_contest and user_id = v_fast;
  v_results := array_append(v_results, case when v_created = 0 and v_count = 1
    then 'PASS đã bỏ qua thì quét lại không gắn lại' else 'FAIL gắn lại sau khi bỏ qua' end);

  -- ===== 3. Công bố kết quả → khoá =====
  perform public.transition_contest_status(v_contest, 'results', v_admin, null);
  v_created := public.detect_contest_fraud_signals(v_contest, 10, 10, 3, 5);
  begin
    perform public.review_contest_fraud_signal(v_signal.id, v_admin, 'confirmed', null);
    v_results := array_append(v_results, 'FAIL xét được sau khi công bố');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'signal_locked' and v_created = 0
      then 'PASS sau công bố: không quét, không xét lại' else 'FAIL signal_locked: ' || sqlerrm end);
  end;

  -- ===== 4. Chỉ service-role =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.detect_contest_fraud_signals(v_contest, 10, 10, 3, 5);
    v_results := array_append(v_results, 'FAIL client gọi được hàm quét');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS hàm quét chỉ dành cho service-role' else 'FAIL grant detect: ' || sqlerrm end);
  end;
  begin
    perform public.review_contest_fraud_signal(v_signal.id, v_admin, 'confirmed', null);
    v_results := array_append(v_results, 'FAIL client gọi được hàm xét');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS hàm xét chỉ dành cho service-role' else 'FAIL grant review: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
