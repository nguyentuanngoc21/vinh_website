-- Test cho migrations/archive/20260926_add_final_scoring.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Khung chấm = [11 ngày trước, 1 ngày trước). Truyện A: ch1 1000 chữ, ch2 500 chữ
-- (bản chụp 1500 chữ). Ngưỡng đọc thật ch1 = max(30, 40% × 1000 ÷ 250 × 60) = 96 giây.
--   u1: ch1 9 ngày trước (100s, tới 1000 chữ) + 5 ngày trước (60s) → hợp lệ, QUAY LẠI, depth 1000/1500
--   u2: ch1 100s, tới 400 chữ                                    → hợp lệ, depth 400/1500
--   u3: ch1 97s, tới 1000 chữ → trần 600 chữ/phút = 970 chữ      → hợp lệ, depth 970/1500 (chặn "cuộn nhanh")
--   u7: ch1 2 phiên cùng ngày cách 1 giờ (60s + 60s), tới 1000   → hợp lệ, 1 lượt ghé (chưa quay lại)
--   u4: đọc 500s nhưng TRƯỚC khung                               → không tính
--   u5: ch1 50s                                                  → chưa đủ ngưỡng
--   u6: ch1 100s nhưng bị xác nhận gian lận                      → không tính
--   tác giả tự đọc                                               → không tính
-- Tương tác trong khung: u1 bình luận 3 lần (= 1), u2 bình chọn chương, u7 theo dõi tác giả,
-- u5 bình luận (không phải độc giả hợp lệ), u3 bình luận TRƯỚC khung → engaged = 3.
-- Phiếu trong khung: u1, u2, u5 (không hợp lệ), u6 (gian lận); u3 bầu SAU khung → valid votes = 2.
-- Truyện B: không ai đọc, phiếu chấm mới nháp. Truyện C: bị loại → không vào cohort.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_judge uuid := gen_random_uuid();
  v_u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_config jsonb := $cfg${
    "components": {
      "judge": {"weight": 0.5, "normalization": {"type": "none"}},
      "reader": {"weight": 0.15, "transformation": "log", "normalization": {"type": "relative_max"}},
      "reading_quality": {"weight": 0.15,
        "depth": {"weight": 0.7, "aggregation": "median", "adjustment": {"type": "bayesian", "prior_strength": 10}, "normalization": {"type": "relative_max"}},
        "return": {"weight": 0.3, "adjustment": {"type": "bayesian", "prior_strength": 20}, "normalization": {"type": "relative_max"}}},
      "engagement": {"weight": 0.1, "adjustment": {"type": "bayesian", "prior_strength": 20}, "normalization": {"type": "relative_max"}},
      "vote": {"weight": 0.1, "adjustment": {"type": "bayesian", "prior_strength": 20}, "normalization": {"type": "relative_max"}}},
    "valid_reader": {"meaningful_read_ratio": 0.4, "meaningful_read_min_seconds": 30, "reading_words_per_minute": 250},
    "reading_depth": {"max_words_per_minute": 600},
    "return_visit": {"min_gap_minutes": 360, "min_active_seconds": 60},
    "engagement_actions": ["comment", "chapter_vote", "character_vote", "reading_list", "author_follow"],
    "rubric": [{"code": "plot", "label": "P", "max": 25}, {"code": "characters", "label": "C", "max": 20}, {"code": "style", "label": "S", "max": 20}, {"code": "creativity", "label": "Cr", "max": 15}, {"code": "theme", "label": "T", "max": 20}],
    "tie_break": ["judge", "reading_quality", "reader", "submitted_at"],
    "main_awards": [{"code": "first_prize", "name": "Giải Nhất", "positions": [1]}],
    "special_awards": {"exclude_main_winners": true, "max_per_submission": 1, "order": []},
    "require_all_judges": true
  }$cfg$;
  v_contest uuid;
  v_book_a uuid;
  v_book_b uuid;
  v_book_c uuid;
  v_ch1 uuid;
  v_ch2 uuid;
  v_sub_a uuid;
  v_sub_b uuid;
  v_sub_c uuid;
  v_row record;
  v_rows integer;
  v_run uuid;
  v_version integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
  d1 constant interval := interval '1 day';
begin
  insert into auth.users (id, email)
  select u, 'fs-' || left(u::text, 8) || '-' || u || '@test.invalid' from unnest(array[v_admin, v_author, v_judge] || v_u) u;
  insert into public.profiles (id, username, nickname)
  select u, 'fs' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_admin, v_author, v_judge] || v_u) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('fs-' || left(v_admin::text, 8), 'Giải thử', now() - 30 * d1, now() + d1, v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'A', 'fs-a-' || v_author, true) returning id into v_book_a;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book_a, 'C1', repeat('chữ ', 1000), 1, true) returning id into v_ch1;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book_a, 'C2', repeat('chữ ', 500), 2, true) returning id into v_ch2;
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'fs-b-' || v_author, true) returning id into v_book_b;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book_b, 'C1', 'x', 1, true);
  insert into public.books (author_id, title, slug, published) values (v_author, 'C', 'fs-c-' || v_author, true) returning id into v_book_c;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book_c, 'C1', 'y', 1, true);
  select id into v_sub_a from public.submit_contest_entry(v_contest, v_book_a, v_author, '1', '[]');
  select id into v_sub_b from public.submit_contest_entry(v_contest, v_book_b, v_author, '1', '[]');
  select id into v_sub_c from public.submit_contest_entry(v_contest, v_book_c, v_author, '1', '[]');
  update public.contests set submission_end = now() - 12 * d1 where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);
  perform public.snapshot_contest_submissions(v_contest);
  update public.contest_submissions set status = 'disqualified', status_reason = 'test' where id = v_sub_c;

  v_version := public.set_contest_scoring_config(v_contest, v_admin, v_config, null);
  update public.contests
     set official_scoring_start = now() - 11 * d1, official_scoring_end = now() - d1,
         voting_start = now() - 11 * d1, voting_end = now() - d1
   where id = v_contest;
  insert into public.contest_judges (contest_id, user_id, assigned_by) values (v_contest, v_judge, v_admin);
  perform public.save_judge_scorecard(v_contest, v_sub_a, v_judge, '{"plot":20,"characters":16,"style":16,"creativity":12,"theme":16}', null, true);
  perform public.save_judge_scorecard(v_contest, v_sub_b, v_judge, '{"plot":10}', null, false);

  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds, words_reached) values
    (v_u[1], v_ch1, v_book_a, now() - 9 * d1, now() - 9 * d1 + interval '100 seconds', now() - 9 * d1, 100, 1000),
    (v_u[1], v_ch1, v_book_a, now() - 5 * d1, now() - 5 * d1 + interval '60 seconds', now() - 5 * d1, 60, 1000),
    (v_u[2], v_ch1, v_book_a, now() - 8 * d1, now() - 8 * d1 + interval '100 seconds', now() - 8 * d1, 100, 400),
    (v_u[3], v_ch1, v_book_a, now() - 7 * d1, now() - 7 * d1 + interval '97 seconds', now() - 7 * d1, 97, 1000),
    (v_u[7], v_ch1, v_book_a, now() - 6 * d1, now() - 6 * d1 + interval '60 seconds', now() - 6 * d1, 60, 500),
    (v_u[7], v_ch1, v_book_a, now() - 6 * d1 + interval '1 hour', now() - 6 * d1 + interval '1 hour' + interval '60 seconds', now() - 6 * d1, 60, 1000),
    (v_u[4], v_ch1, v_book_a, now() - 20 * d1, now() - 20 * d1 + interval '500 seconds', now() - 20 * d1, 500, 1000),
    (v_u[5], v_ch1, v_book_a, now() - 6 * d1, now() - 6 * d1 + interval '50 seconds', now() - 6 * d1, 50, 1000),
    (v_u[6], v_ch1, v_book_a, now() - 6 * d1, now() - 6 * d1 + interval '100 seconds', now() - 6 * d1, 100, 1000),
    (v_author, v_ch1, v_book_a, now() - 6 * d1, now() - 6 * d1 + interval '500 seconds', now() - 6 * d1, 500, 1000);
  insert into public.contest_fraud_signals (contest_id, user_id, signal_code, status, reviewed_by, reviewed_at)
  values (v_contest, v_u[6], 'test_confirmed', 'confirmed', v_admin, now());

  -- Trigger ép thời gian server (Slice 2.5a) — tắt tạm để dựng sự kiện trong quá khứ (hoàn tác cùng test).
  execute 'alter table public.anchored_comments disable trigger anchored_comments_server_time';
  execute 'alter table public.chapter_votes disable trigger chapter_votes_server_time';
  insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content, created_at) values
    (v_u[1], v_ch1, 0, 0, 1, 'a', now() - 5 * d1), (v_u[1], v_ch1, 0, 0, 1, 'b', now() - 5 * d1), (v_u[1], v_ch1, 0, 0, 1, 'c', now() - 4 * d1),
    (v_u[5], v_ch1, 0, 0, 1, 'd', now() - 5 * d1),
    (v_u[3], v_ch1, 0, 0, 1, 'e', now() - 20 * d1);
  insert into public.chapter_votes (chapter_id, user_id, created_at) values (v_ch1, v_u[2], now() - 5 * d1);
  execute 'alter table public.anchored_comments enable trigger anchored_comments_server_time';
  execute 'alter table public.chapter_votes enable trigger chapter_votes_server_time';
  insert into public.author_follows (follower_id, author_id, created_at) values (v_u[7], v_author, now() - 5 * d1);
  insert into public.contest_votes (contest_id, submission_id, user_id, created_at) values
    (v_contest, v_sub_a, v_u[1], now() - 5 * d1), (v_contest, v_sub_a, v_u[2], now() - 5 * d1),
    (v_contest, v_sub_a, v_u[5], now() - 5 * d1), (v_contest, v_sub_a, v_u[6], now() - 5 * d1),
    (v_contest, v_sub_a, v_u[3], now());

  -- ===== 1. Số liệu thô =====
  select count(*) into v_rows from public.get_contest_scoring_metrics(v_contest);
  v_results := array_append(v_results, case when v_rows = 2 then 'PASS cohort chỉ gồm bài hợp lệ (bài bị loại không vào)' else 'FAIL cohort: ' || v_rows end);

  select * into v_row from public.get_contest_scoring_metrics(v_contest) m where m.submission_id = v_sub_a;
  v_results := array_append(v_results, case when v_row.valid_readers = 4 and v_row.has_snapshot
    then 'PASS độc giả hợp lệ = 4 (bỏ đọc trước khung, chưa đủ ngưỡng, gian lận, tác giả)' else 'FAIL valid_readers: ' || v_row.valid_readers end);
  v_results := array_append(v_results, case
    when array_length(v_row.reader_depths, 1) = 4
     and abs((select sum(x) from unnest(v_row.reader_depths) x) - (1000 + 400 + 970 + 1000) / 1500.0) < 0.0001
     and exists (select 1 from unnest(v_row.reader_depths) x where abs(x - 970 / 1500.0) < 0.0001)
    then 'PASS depth theo % chữ bản chụp; trần 600 chữ/phút chặn cuộn nhanh (970/1500)'
    else 'FAIL depth: ' || array_to_string(v_row.reader_depths, ',') end);
  v_results := array_append(v_results, case when v_row.returning_readers = 1
    then 'PASS quay lại: 2 lượt ghé cách ≥ 6 giờ; 2 phiên cách 1 giờ = 1 lượt' else 'FAIL returning: ' || v_row.returning_readers end);
  v_results := array_append(v_results, case when v_row.engaged_readers = 3
    then 'PASS tương tác theo người: bình luận 3 lần = 1; bỏ người không đọc thật, sự kiện ngoài khung' else 'FAIL engaged: ' || v_row.engaged_readers end);
  v_results := array_append(v_results, case when v_row.valid_votes = 2
    then 'PASS phiếu hợp lệ = 2 (bỏ người chưa đọc thật, gian lận, phiếu ngoài khung)' else 'FAIL votes: ' || v_row.valid_votes end);
  v_results := array_append(v_results, case when v_row.judge_totals = array[80]::numeric[] and v_row.active_judges = 1
    then 'PASS điểm BGK: chỉ phiếu đã chốt' else 'FAIL judge: ' || array_to_string(v_row.judge_totals, ',') end);

  select * into v_row from public.get_contest_scoring_metrics(v_contest) m where m.submission_id = v_sub_b;
  v_results := array_append(v_results, case when v_row.valid_readers = 0 and cardinality(v_row.judge_totals) = 0 and cardinality(v_row.reader_depths) = 0
    then 'PASS bài không có độc giả và phiếu nháp → 0 / rỗng (không lỗi)' else 'FAIL bài B' end);

  -- ===== 2. Lưu lượt tính =====
  begin
    perform public.save_contest_score_run(v_contest, v_admin, jsonb_build_object('kind', 'preview', 'config_version', v_version + 1, 'input_digest', 'x', 'rows', '[]'::jsonb));
    v_results := array_append(v_results, 'FAIL tính bằng version cấu hình khác');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'score_run_stale' then 'PASS chỉ tính bằng version đang áp dụng' else 'FAIL stale: ' || sqlerrm end);
  end;
  begin
    perform public.save_contest_score_run(v_contest, v_author, jsonb_build_object('kind', 'final', 'config_version', v_version, 'input_digest', 'x', 'rows', '[]'::jsonb));
    v_results := array_append(v_results, 'FAIL người không phải admin lưu được lượt tính');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin lưu lượt tính' else 'FAIL not_admin: ' || sqlerrm end);
  end;

  v_run := public.save_contest_score_run(v_contest, v_admin, jsonb_build_object(
    'kind', 'final', 'config_version', v_version, 'input_digest', 'abc', 'flags', '[{"code":"single_submission"}]'::jsonb,
    'rows', jsonb_build_array(jsonb_build_object(
      'submission_id', v_sub_a, 'rank', 1, 'tied', false, 'submitted_at', now(),
      'valid_readers', 4, 'reader_transformed', 1.6, 'reader_score', 100, 'reader_depth_count', 4,
      'aggregated_depth', 0.66, 'adjusted_depth', 0.6, 'depth_score', 100,
      'returning_readers', 1, 'raw_return_rate', 0.25, 'adjusted_return_rate', 0.25, 'return_score', 100, 'reading_quality_score', 100,
      'engaged_readers', 3, 'raw_engagement_rate', 0.75, 'adjusted_engagement_rate', 0.7, 'engagement_score', 100,
      'valid_votes', 2, 'raw_vote_rate', 0.5, 'adjusted_vote_rate', 0.5, 'vote_score', 100,
      'judge_count', 1, 'judge_score', 80, 'system_score', 100, 'final_score', 90,
      'awards', '[{"code":"first_prize","name":"Giải Nhất","kind":"main"}]'::jsonb))));
  select count(*) into v_rows from public.contest_score_snapshots where run_id = v_run and final_score = 90 and awards -> 0 ->> 'code' = 'first_prize';
  v_results := array_append(v_results, case when v_run is not null and v_rows = 1
    and exists (select 1 from public.contest_score_runs where id = v_run and window_end < now() and config_version = v_version and flags -> 0 ->> 'code' = 'single_submission')
    then 'PASS lưu lượt tính chính thức (sau khung chấm) + snapshot đủ các tầng, ghi version + khung + cờ' else 'FAIL lưu run' end);

  begin
    update public.contest_score_snapshots set final_score = 100 where run_id = v_run;
    v_results := array_append(v_results, 'FAIL sửa được snapshot');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'score_run_immutable' then 'PASS snapshot bất biến' else 'FAIL immutable: ' || sqlerrm end);
  end;
  begin
    perform public.save_contest_score_run(v_contest, v_admin, jsonb_build_object('kind', 'preview', 'config_version', v_version, 'input_digest', 'x',
      'rows', jsonb_build_array(jsonb_build_object('submission_id', gen_random_uuid(), 'rank', 1, 'tied', false, 'submitted_at', now(),
        'valid_readers', 0, 'reader_transformed', 0, 'reader_score', 0, 'reader_depth_count', 0, 'aggregated_depth', 0, 'adjusted_depth', 0, 'depth_score', 0,
        'returning_readers', 0, 'raw_return_rate', 0, 'adjusted_return_rate', 0, 'return_score', 0, 'reading_quality_score', 0,
        'engaged_readers', 0, 'raw_engagement_rate', 0, 'adjusted_engagement_rate', 0, 'engagement_score', 0,
        'valid_votes', 0, 'raw_vote_rate', 0, 'adjusted_vote_rate', 0, 'vote_score', 0,
        'judge_count', 0, 'judge_score', null, 'system_score', 0, 'final_score', 0, 'awards', '[]'::jsonb))));
    v_results := array_append(v_results, 'FAIL lưu dòng của bài ngoài cuộc thi');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_input' then 'PASS dòng snapshot phải thuộc cuộc thi' else 'FAIL foreign row: ' || sqlerrm end);
  end;

  -- ===== 3. Chỉ service-role =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.get_contest_scoring_metrics(v_contest);
    v_results := array_append(v_results, 'FAIL client đọc được số liệu chấm');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS số liệu chấm chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
