-- Test cho migrations/20260926_add_contest_scores.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Chương 1000 chữ → đọc ước tính 240 giây → ngưỡng meaningful read =
-- max(30, 40% × 240) = 96 giây (mặc định scoring_config).
-- Độc giả giả lập (phiên đọc ghi thẳng, bỏ qua heartbeat):
--   r1: 60 + 50 giây (2 phiên)           → hợp lệ, đạt ngưỡng 1 giờ trước
--   r2: 90 giây                          → chưa đủ ngưỡng
--   r3: 200 giây nhưng bị xác nhận gian lận (toàn cuộc thi)
--   r4: 200 giây nhưng trước khi cuộc thi mở
--   r5: 200 giây, đạt ngưỡng 10 ngày trước → "7 ngày trước đó"
--   tác giả tự đọc 500 giây             → không tính
-- Phiếu: r1, r2, r3, r5 → 4 phiếu thô, 2 phiếu đã lọc (r1, r5).
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_r1 uuid := gen_random_uuid();
  v_r2 uuid := gen_random_uuid();
  v_r3 uuid := gen_random_uuid();
  v_r4 uuid := gen_random_uuid();
  v_r5 uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_book uuid;
  v_ch uuid;
  v_sub uuid;
  v_score public.contest_submission_scores;
  v_state public.contest_score_state;
  v_value integer;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at) values
    (v_admin, 'sc-d-' || v_admin || '@test.invalid', now() - interval '60 days'),
    (v_author, 'sc-a-' || v_author || '@test.invalid', now() - interval '60 days'),
    (v_r1, 'sc-1-' || v_r1 || '@test.invalid', now() - interval '60 days'),
    (v_r2, 'sc-2-' || v_r2 || '@test.invalid', now() - interval '60 days'),
    (v_r3, 'sc-3-' || v_r3 || '@test.invalid', now() - interval '60 days'),
    (v_r4, 'sc-4-' || v_r4 || '@test.invalid', now() - interval '60 days'),
    (v_r5, 'sc-5-' || v_r5 || '@test.invalid', now() - interval '60 days');
  insert into public.profiles (id, username, nickname)
  select u, 'sc' || left(replace(u::text, '-', ''), 12), 'U'
  from unnest(array[v_admin, v_author, v_r1, v_r2, v_r3, v_r4, v_r5]) as u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('sc-' || left(v_admin::text, 8), 'Giải thử', now() - interval '20 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'sc-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book, 'C1', repeat('chữ ', 1000), 1, true) returning id into v_ch;
  select id into v_sub from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');
  update public.contests set submission_end = now() - interval '1 minute',
         voting_start = now() - interval '1 hour', voting_end = now() + interval '1 day'
   where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);
  perform public.transition_contest_status(v_contest, 'community_voting', v_admin, null);

  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds) values
    (v_r1, v_ch, v_book, now() - interval '3 hours', now() - interval '3 hours' + interval '1 minute', now() - interval '3 hours', 60),
    (v_r1, v_ch, v_book, now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour', 50),
    (v_r2, v_ch, v_book, now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours', 90),
    (v_r3, v_ch, v_book, now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours', 200),
    (v_r4, v_ch, v_book, now() - interval '25 days', now() - interval '25 days', now() - interval '25 days', 200),
    (v_r5, v_ch, v_book, now() - interval '10 days', now() - interval '10 days', now() - interval '10 days', 200),
    (v_author, v_ch, v_book, now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours', 500);
  insert into public.contest_votes (contest_id, submission_id, user_id)
  select v_contest, v_sub, u from unnest(array[v_r1, v_r2, v_r3, v_r5]) as u;
  insert into public.contest_fraud_signals (contest_id, user_id, signal_code, status, reviewed_by, reviewed_at)
  values (v_contest, v_r3, 'test_confirmed', 'confirmed', v_admin, now());

  -- ===== 1. Tính lần đầu =====
  v_state := public.refresh_contest_scores(v_contest, false, false);
  select * into v_score from public.contest_submission_scores where submission_id = v_sub;
  v_results := array_append(v_results, case when v_score.raw_votes = 4 and v_score.filtered_votes = 2
    then 'PASS phiếu đã lọc: bỏ phiếu chưa đọc đủ ngưỡng và phiếu bị xác nhận gian lận (4 → 2)'
    else format('FAIL phiếu: thô %s, lọc %s', v_score.raw_votes, v_score.filtered_votes) end);
  v_results := array_append(v_results, case when v_score.valid_readers = 2
    then 'PASS độc giả hợp lệ: cộng dồn nhiều phiếu đọc; bỏ tác giả, đọc trước khi mở, chưa đủ ngưỡng, gian lận'
    else 'FAIL độc giả hợp lệ: ' || v_score.valid_readers end);
  v_results := array_append(v_results, case when v_score.readers_7d = 1 and v_score.readers_prev_7d = 1
    then 'PASS độc giả mới 7 ngày / 7 ngày trước đó'
    else format('FAIL 7 ngày: %s / %s', v_score.readers_7d, v_score.readers_prev_7d) end);
  v_results := array_append(v_results, case when v_state.refreshed_at = now() and v_state.frozen_at is null
    and (v_state.params ->> 'meaningful_read_min_seconds')::integer = 30
    then 'PASS lưu thời điểm tính + ngưỡng đã dùng' else 'FAIL trạng thái tính' end);

  -- ===== 2. Làm mới lười 15 phút =====
  insert into public.contest_votes (contest_id, submission_id, user_id) values (v_contest, v_sub, v_r4);
  perform public.refresh_contest_scores(v_contest, false, false);
  select raw_votes into v_value from public.contest_submission_scores where submission_id = v_sub;
  v_results := array_append(v_results, case when v_value = 4
    then 'PASS trong 15 phút không tính lại' else 'FAIL tính lại trong 15 phút: ' || v_value end);
  update public.contest_score_state set refreshed_at = now() - interval '16 minutes' where contest_id = v_contest;
  perform public.refresh_contest_scores(v_contest, false, false);
  select raw_votes into v_value from public.contest_submission_scores where submission_id = v_sub;
  v_results := array_append(v_results, case when v_value = 5
    then 'PASS quá 15 phút thì tính lại' else 'FAIL quá 15 phút: ' || v_value end);

  -- ===== 3. Tín hiệu theo bài + tín hiệu chưa xác nhận =====
  insert into public.contest_fraud_signals (contest_id, user_id, submission_id, signal_code, status, reviewed_by, reviewed_at)
  values (v_contest, v_r5, v_sub, 'test_confirmed', 'confirmed', v_admin, now());
  insert into public.contest_fraud_signals (contest_id, user_id, signal_code) values (v_contest, v_r1, 'test_open');
  perform public.refresh_contest_scores(v_contest, true, false);
  select filtered_votes into v_value from public.contest_submission_scores where submission_id = v_sub;
  v_results := array_append(v_results, case when v_value = 1
    then 'PASS tín hiệu xác nhận theo bài loại phiếu; tín hiệu chưa xác nhận không loại'
    else 'FAIL tín hiệu: ' || v_value end);

  -- ===== 4. BXH từ bảng điểm =====
  select r.value into v_value from public.get_contest_score_ranking(v_contest, 'popular', 10) r where r.submission_id = v_sub;
  v_results := array_append(v_results, case when v_value = 1 then 'PASS BXH popular đọc phiếu đã lọc' else 'FAIL BXH popular: ' || v_value end);
  select r.value into v_value from public.get_contest_score_ranking(v_contest, 'trending', 10) r where r.submission_id = v_sub;
  v_results := array_append(v_results, case when v_value = 1 then 'PASS BXH trending đọc độc giả mới 7 ngày' else 'FAIL BXH trending: ' || v_value end);
  begin
    perform public.get_contest_score_ranking(v_contest, 'views', 10);
    v_results := array_append(v_results, 'FAIL nhận loại BXH lạ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_sort' then 'PASS loại BXH lạ bị từ chối' else 'FAIL loại lạ: ' || sqlerrm end);
  end;

  -- ===== 5. Chốt khi công bố kết quả =====
  begin
    perform public.refresh_contest_scores(v_contest, true, true);
    v_results := array_append(v_results, 'FAIL chốt điểm trước khi công bố');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'scores_not_final' then 'PASS chưa công bố kết quả thì không chốt' else 'FAIL scores_not_final: ' || sqlerrm end);
  end;
  perform public.transition_contest_status(v_contest, 'results', v_admin, null);
  v_state := public.refresh_contest_scores(v_contest, true, true);
  delete from public.contest_fraud_signals where contest_id = v_contest;
  perform public.refresh_contest_scores(v_contest, true, false);
  select filtered_votes into v_value from public.contest_submission_scores where submission_id = v_sub;
  v_results := array_append(v_results, case when v_state.frozen_at is not null and v_value = 1
    then 'PASS đã chốt thì không bao giờ tính lại (kể cả ép)' else 'FAIL chốt: ' || v_value end);

  -- ===== 6. Client không đọc được bảng điểm, không gọi được RPC =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_r1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_count from public.contest_submission_scores;
    v_results := array_append(v_results, 'FAIL client đọc được bảng điểm');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS client không đọc được bảng điểm (số phiếu ẩn)' else 'FAIL đọc bảng điểm: ' || sqlerrm end);
  end;
  begin
    select count(*) into v_count from public.contest_fraud_signals;
    v_results := array_append(v_results, 'FAIL client đọc được tín hiệu gian lận');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS client không đọc được tín hiệu gian lận' else 'FAIL đọc tín hiệu: ' || sqlerrm end);
  end;
  begin
    perform public.refresh_contest_scores(v_contest, true, false);
    v_results := array_append(v_results, 'FAIL client gọi được RPC tính điểm');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC tính điểm chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
