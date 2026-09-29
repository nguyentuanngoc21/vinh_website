-- Test cho migrations/archive/20260926_add_contest_judging.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Rubric test = mặc định: plot 25, characters 20, style 20, creativity 15, theme 20.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_judge uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_rubric jsonb := '[{"code":"plot","label":"Cốt truyện","max":25},{"code":"characters","label":"Nhân vật","max":20},{"code":"style","label":"Văn phong","max":20},{"code":"creativity","label":"Sáng tạo","max":15},{"code":"theme","label":"Chủ đề","max":20}]';
  v_full jsonb := '{"plot":20,"characters":15,"style":15.5,"creativity":10,"theme":18}';
  v_contest uuid;
  v_book uuid;
  v_book2 uuid;
  v_sub uuid;
  v_sub2 uuid;
  v_card public.contest_judge_scorecards;
  v_card_id uuid;
  v_version integer;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_admin, 'jg-d-' || v_admin || '@test.invalid'), (v_judge, 'jg-j-' || v_judge || '@test.invalid'),
    (v_other, 'jg-o-' || v_other || '@test.invalid'), (v_author, 'jg-a-' || v_author || '@test.invalid');
  insert into public.profiles (id, username, nickname)
  select u, 'jg' || left(replace(u::text, '-', ''), 12), 'U'
  from unnest(array[v_admin, v_judge, v_other, v_author]) as u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('jg-' || left(v_admin::text, 8), 'Giải thử', now() - interval '20 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B1', 'jg-b1-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B2', 'jg-b2-' || v_author, true) returning id into v_book2;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book2, 'C1', 'y', 1, true);
  select id into v_sub from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');
  select id into v_sub2 from public.submit_contest_entry(v_contest, v_book2, v_author, '1', '[]');
  insert into public.contest_judges (contest_id, user_id, assigned_by) values (v_contest, v_judge, v_admin);

  -- ===== 1. Cấu hình có version =====
  v_version := public.set_contest_scoring_config(v_contest, v_admin, jsonb_build_object('rubric', v_rubric, 'weights', '{"judge":0.5}'::jsonb), null);
  select count(*) into v_count from public.contests where id = v_contest and scoring_config_version = 1;
  v_results := array_append(v_results, case when v_version = 1 and v_count = 1
    then 'PASS lưu cấu hình → version 1, cuộc thi trỏ tới version 1' else 'FAIL version 1: ' || v_version end);
  begin
    update public.contest_scoring_configs set config = '{}' where contest_id = v_contest;
    v_results := array_append(v_results, 'FAIL sửa được version đã lưu');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'scoring_config_immutable' then 'PASS version cấu hình bất biến' else 'FAIL immutable: ' || sqlerrm end);
  end;

  -- ===== 2. Chưa đóng nhận bài → chưa chấm =====
  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":20}', null, false);
    v_results := array_append(v_results, 'FAIL chấm khi còn nhận bài');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'judging_closed' then 'PASS chưa đóng nhận bài thì chưa chấm' else 'FAIL judging_closed: ' || sqlerrm end);
  end;

  update public.contests set submission_end = now() - interval '2 hours' where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);

  -- ===== 3. Khung chấm chính thức (J2) =====
  begin
    update public.contests set official_scoring_start = now() - interval '3 hours', official_scoring_end = now() + interval '10 days' where id = v_contest;
    v_results := array_append(v_results, 'FAIL khung chấm bắt đầu trước khi đóng nhận bài');
  exception when check_violation then
    v_results := array_append(v_results, 'PASS khung chấm phải bắt đầu sau khi đóng nhận bài');
  end;
  update public.contests set official_scoring_start = now() - interval '1 hour', official_scoring_end = now() + interval '10 days' where id = v_contest;
  begin
    update public.contests set voting_start = now() - interval '90 minutes', voting_end = now() + interval '1 day' where id = v_contest;
    v_results := array_append(v_results, 'FAIL bình chọn nằm ngoài khung chấm');
  exception when check_violation then
    v_results := array_append(v_results, 'PASS khung bình chọn phải nằm trong khung chấm');
  end;
  begin
    update public.contests set official_scoring_end = now() + interval '20 days' where id = v_contest;
    v_results := array_append(v_results, 'FAIL đổi được khung chấm đã bắt đầu');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'scoring_window_locked' then 'PASS khung chấm khoá khi đã bắt đầu' else 'FAIL window lock: ' || sqlerrm end);
  end;

  -- ===== 4. Phiếu chấm =====
  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_other, '{"plot":20}', null, false);
    v_results := array_append(v_results, 'FAIL người không phải giám khảo chấm được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_judge' then 'PASS chỉ giám khảo được gán mới chấm' else 'FAIL not_judge: ' || sqlerrm end);
  end;

  v_card := public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":20}', '  ghi chú  ', false);
  v_card_id := v_card.id;
  v_results := array_append(v_results, case when v_card.status = 'draft' and v_card.total = 20 and v_card.note = 'ghi chú' and v_card.config_version = 1
    then 'PASS lưu nháp (thiếu tiêu chí vẫn được), tổng do DB tính' else 'FAIL nháp: ' || v_card.total end);

  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":26}', null, false);
    v_results := array_append(v_results, 'FAIL nhận điểm vượt tối đa');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_scores' then 'PASS điểm vượt tối đa tiêu chí bị từ chối' else 'FAIL > max: ' || sqlerrm end);
  end;
  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":20,"bonus":5}', null, false);
    v_results := array_append(v_results, 'FAIL nhận tiêu chí lạ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_scores' then 'PASS tiêu chí không có trong rubric bị từ chối' else 'FAIL tiêu chí lạ: ' || sqlerrm end);
  end;
  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":20}', null, true);
    v_results := array_append(v_results, 'FAIL chốt khi thiếu tiêu chí');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_scores' then 'PASS chốt cần đủ mọi tiêu chí' else 'FAIL chốt thiếu: ' || sqlerrm end);
  end;

  v_card := public.save_judge_scorecard(v_contest, v_sub, v_judge, v_full, null, true);
  v_results := array_append(v_results, case when v_card.id = v_card_id and v_card.status = 'finalized' and v_card.total = 78.5 and v_card.finalized_at is not null
    then 'PASS chốt phiếu: tổng 78,5 (lưu điểm từng tiêu chí)' else 'FAIL chốt: ' || v_card.total end);
  select count(*) into v_count from public.contest_judge_criterion_scores where scorecard_id = v_card_id;
  v_results := array_append(v_results, case when v_count = 5 then 'PASS lưu riêng 5 điểm tiêu chí' else 'FAIL criterion rows: ' || v_count end);

  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_judge, v_full, null, false);
    v_results := array_append(v_results, 'FAIL sửa được phiếu đã chốt');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'scorecard_finalized' then 'PASS phiếu đã chốt không tự sửa được' else 'FAIL finalized: ' || sqlerrm end);
  end;

  update public.contest_submissions set status = 'ineligible', status_reason = 'test' where id = v_sub2;
  begin
    perform public.save_judge_scorecard(v_contest, v_sub2, v_judge, '{"plot":1}', null, false);
    v_results := array_append(v_results, 'FAIL chấm bài không hợp lệ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'entry_not_judgeable' then 'PASS chỉ chấm bài hợp lệ' else 'FAIL entry_not_judgeable: ' || sqlerrm end);
  end;

  -- ===== 5. Rubric khoá khi đã có phiếu; lý do bắt buộc sau khi khung chấm bắt đầu =====
  begin
    perform public.set_contest_scoring_config(v_contest, v_admin, jsonb_build_object('rubric', '[{"code":"plot","label":"P","max":100}]'::jsonb), 'đổi');
    v_results := array_append(v_results, 'FAIL đổi rubric khi đã có phiếu');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'rubric_locked' then 'PASS rubric khoá khi đã có phiếu chấm' else 'FAIL rubric_locked: ' || sqlerrm end);
  end;
  begin
    perform public.set_contest_scoring_config(v_contest, v_admin, jsonb_build_object('rubric', v_rubric, 'weights', '{"judge":0.6}'::jsonb), '  ');
    v_results := array_append(v_results, 'FAIL đổi cấu hình trong khung chấm không cần lý do');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'reason_required' then 'PASS trong khung chấm phải có lý do' else 'FAIL reason_required: ' || sqlerrm end);
  end;
  v_version := public.set_contest_scoring_config(v_contest, v_admin, jsonb_build_object('rubric', v_rubric, 'weights', '{"judge":0.6}'::jsonb), 'Sửa trọng số');
  select count(*) into v_count from public.contest_scoring_configs where contest_id = v_contest;
  v_results := array_append(v_results, case when v_version = 2 and v_count = 2
    and exists (select 1 from public.contest_scoring_configs where contest_id = v_contest and version = 2 and previous_version = 1 and reason = 'Sửa trọng số')
    and exists (select 1 from public.contest_scoring_configs where contest_id = v_contest and version = 1 and previous_version is null)
    then 'PASS thay đổi tạo version 2 (ghi version trước + lý do), version 1 giữ nguyên' else 'FAIL version 2: ' || v_version end);

  -- ===== 6. Admin mở lại / huỷ, có nhật ký =====
  begin
    perform public.review_judge_scorecard(v_card_id, v_admin, 'reopen', '');
    v_results := array_append(v_results, 'FAIL mở lại không cần lý do');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'reason_required' then 'PASS mở lại phải có lý do' else 'FAIL reopen reason: ' || sqlerrm end);
  end;
  begin
    perform public.review_judge_scorecard(v_card_id, v_judge, 'reopen', 'x');
    v_results := array_append(v_results, 'FAIL giám khảo tự mở lại được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin mở lại / huỷ phiếu' else 'FAIL review not_admin: ' || sqlerrm end);
  end;
  v_card := public.review_judge_scorecard(v_card_id, v_admin, 'reopen', 'Nhập nhầm điểm văn phong');
  v_card := public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":20,"characters":15,"style":17,"creativity":10,"theme":18}', null, true);
  v_results := array_append(v_results, case when v_card.id = v_card_id and v_card.status = 'finalized' and v_card.total = 80 and v_card.config_version = 2
    then 'PASS mở lại → giám khảo sửa và chốt lại (theo version cấu hình mới)' else 'FAIL sửa lại: ' || v_card.total end);

  v_card := public.review_judge_scorecard(v_card_id, v_admin, 'invalidate', 'Giám khảo có xung đột lợi ích');
  v_results := array_append(v_results, case when v_card.status = 'invalidated' and v_card.finalized_at is null and v_card.invalidated_by = v_admin
    then 'PASS huỷ phiếu (ghi người huỷ, lý do)' else 'FAIL huỷ' end);
  v_card := public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":10}', null, false);
  v_results := array_append(v_results, case when v_card.id <> v_card_id and v_card.status = 'draft'
    then 'PASS phiếu đã huỷ giữ lại làm lịch sử; giám khảo chấm phiếu mới' else 'FAIL phiếu mới sau huỷ' end);

  select count(*) into v_count from public.contest_judge_score_events where scorecard_id = v_card_id;
  v_results := array_append(v_results, case when v_count = 5
    then 'PASS nhật ký: nháp, chốt, mở lại, chốt lại, huỷ' else 'FAIL số sự kiện: ' || v_count end);

  -- ===== 7. Chỉ service-role =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_judge, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.save_judge_scorecard(v_contest, v_sub, v_judge, '{"plot":1}', null, false);
    v_results := array_append(v_results, 'FAIL client gọi thẳng RPC chấm');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC chấm chỉ dành cho service-role' else 'FAIL grant save: ' || sqlerrm end);
  end;
  begin
    select count(*) into v_count from public.contest_judge_scorecards;
    v_results := array_append(v_results, 'FAIL client đọc được phiếu chấm');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS client không đọc được phiếu chấm' else 'FAIL grant read: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
