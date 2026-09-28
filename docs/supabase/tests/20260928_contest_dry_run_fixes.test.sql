-- Test cho migrations/20260928_contest_dry_run_fixes.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- Cuộc thi đang nhận bài, 3 bài A, B, C (chương 1000 chữ → ngưỡng đọc thật 96 giây).
-- Admin đóng nhận bài SỚM (trước hạn) → tác giả không rút được; sau đó bình chọn:
-- A nhiều phiếu thô nhưng không ai đọc thật, B ít phiếu hơn nhưng đều là người đọc thật;
-- phiếu chỉ vào bảng điểm ở lần tính lại (P8).
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_a3 uuid := gen_random_uuid();
  v_r1 uuid := gen_random_uuid();
  v_r2 uuid := gen_random_uuid();
  v_r3 uuid := gen_random_uuid();
  v_r4 uuid := gen_random_uuid();
  v_r5 uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 0, "require_completed_chapter": true}';
  v_contest uuid;
  v_ba uuid; v_bb uuid; v_bc uuid;
  v_ca uuid; v_cb uuid;
  v_sa uuid; v_sb uuid; v_sc uuid;
  v_raw_a integer; v_filt_a integer; v_raw_b integer; v_filt_b integer;
  v_ranks text;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'df-' || left(u::text, 8) || '-' || u || '@test.invalid', now() - interval '60 days'
  from unnest(array[v_admin, v_a1, v_a2, v_a3, v_r1, v_r2, v_r3, v_r4, v_r5]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'df' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_admin, v_a1, v_a2, v_a3, v_r1, v_r2, v_r3, v_r4, v_r5]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('df-' || left(v_admin::text, 8), 'Giải thử', now() - interval '5 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_a1, 'A', 'df-a-' || v_a1, true) returning id into v_ba;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_ba, 'A1', repeat('chữ ', 1000), 1, true) returning id into v_ca;
  insert into public.books (author_id, title, slug, published) values (v_a2, 'B', 'df-b-' || v_a2, true) returning id into v_bb;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_bb, 'B1', repeat('chữ ', 1000), 1, true) returning id into v_cb;
  insert into public.books (author_id, title, slug, published) values (v_a3, 'C', 'df-c-' || v_a3, true) returning id into v_bc;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_bc, 'C1', repeat('chữ ', 1000), 1, true);
  select id into v_sa from public.submit_contest_entry(v_contest, v_ba, v_a1, '1', '[]');
  select id into v_sb from public.submit_contest_entry(v_contest, v_bb, v_a2, '1', '[]');
  select id into v_sc from public.submit_contest_entry(v_contest, v_bc, v_a3, '1', '[]');

  -- ===== 1. Rút bài: được khi đang nhận bài, bị chặn ngay khi admin đóng sớm =====
  perform public.set_contest_submission_status(v_sc, 'withdrawn', v_a3, 'author', null);
  v_results := array_append(v_results, case when (select status from public.contest_submissions where id = v_sc) = 'withdrawn'
    then 'PASS đang nhận bài → tác giả rút bài được' else 'FAIL rút bài lúc đang nhận bài' end);

  -- Khung bình chọn đặt trước (sau hạn nhận bài); hạn nhận bài vẫn còn 10 ngày.
  update public.contests set voting_start = submission_end + interval '1 hour', voting_end = submission_end + interval '2 days'
   where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);
  begin
    perform public.set_contest_submission_status(v_sb, 'withdrawn', v_a2, 'author', null);
    v_results := array_append(v_results, 'FAIL admin đóng sớm mà tác giả vẫn rút được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'withdraw_closed'
      then 'PASS admin đóng nhận bài sớm (chưa tới hạn) → rút bài bị chặn (withdraw_closed)' else 'FAIL hint: ' || coalesce(v_hint, 'null') end);
  end;

  -- Admin mở bình chọn sớm (chuyển trạng thái không kiểm giờ); phiếu ghi thẳng cho test.
  perform public.transition_contest_status(v_contest, 'community_voting', v_admin, null);

  -- ===== 2. Phiếu đã lọc: chỉ vào bảng điểm ở lần tính lại (P8, không đếm theo từng phiếu) =====
  -- r1 đọc B 60 + 60 giây (cộng dồn ≥ 96), r3 đọc B 150 giây; r2 lướt A 40 giây; r4, r5 không đọc.
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds) values
    (v_r1, v_cb, v_bb, now() - interval '30 minutes', now() - interval '28 minutes', now() - interval '28 minutes', 60),
    (v_r1, v_cb, v_bb, now() - interval '20 minutes', now() - interval '18 minutes', now() - interval '18 minutes', 60),
    (v_r3, v_cb, v_bb, now() - interval '20 minutes', now() - interval '17 minutes', now() - interval '17 minutes', 150),
    (v_r2, v_ca, v_ba, now() - interval '20 minutes', now() - interval '19 minutes', now() - interval '19 minutes', 40);
  insert into public.contest_votes (contest_id, submission_id, user_id) values
    (v_contest, v_sa, v_r2), (v_contest, v_sa, v_r4), (v_contest, v_sa, v_r5),
    (v_contest, v_sb, v_r1), (v_contest, v_sb, v_r3);
  select raw_votes, filtered_votes into v_raw_a, v_filt_a from public.contest_submission_scores where submission_id = v_sa;
  v_results := array_append(v_results, case when coalesce(v_raw_a, 0) = 0 and coalesce(v_filt_a, 0) = 0
    then 'PASS bỏ phiếu không ghi ngay vào bảng điểm (không trigger đếm theo từng phiếu)'
    else format('FAIL bảng điểm đổi ngay khi bỏ phiếu: A %s/%s', v_raw_a, v_filt_a) end);

  delete from public.contest_votes where submission_id = v_sb and user_id = v_r3;
  perform public.refresh_contest_scores(v_contest, true, false);
  select raw_votes, filtered_votes into v_raw_a, v_filt_a from public.contest_submission_scores where submission_id = v_sa;
  select raw_votes, filtered_votes into v_raw_b, v_filt_b from public.contest_submission_scores where submission_id = v_sb;
  v_results := array_append(v_results, case when v_raw_a = 3 and v_filt_a = 0 and v_raw_b = 1 and v_filt_b = 1
    then 'PASS tính lại: A 3 thô / 0 đã lọc (không ai đọc thật), B 1 / 1 (đã rút 1 phiếu)'
    else format('FAIL sau refresh: A %s/%s B %s/%s', v_raw_a, v_filt_a, v_raw_b, v_filt_b) end);

  -- ===== 3. Chụp hạng bảng phiếu theo phiếu đã lọc =====
  perform public.snapshot_contest_ranks(v_contest, null);
  select string_agg(case submission_id when v_sa then 'A' else 'B' end || rank, ',' order by rank)
    into v_ranks from public.contest_rank_snapshots where contest_id = v_contest and kind = 'popular';
  v_results := array_append(v_results, case when v_ranks = 'B1,A2'
    then 'PASS bảng phiếu xếp theo phiếu đã lọc: B (1 người đọc thật) trên A (3 phiếu thô, 0 người đọc thật)'
    else 'FAIL chụp hạng: ' || coalesce(v_ranks, 'null') end);

  -- ===== 4. Không còn trigger / hàm đếm phiếu ngay =====
  v_results := array_append(v_results, case
    when not exists (select 1 from pg_trigger where tgname = 'contest_votes_sync_scores' and not tgisinternal)
     and to_regprocedure('public.contest_is_valid_reader(uuid,uuid)') is null
    then 'PASS không có trigger đếm phiếu theo từng lượt (giữ P8)' else 'FAIL còn trigger / hàm đếm phiếu ngay — chạy lệnh dọn trên dev' end);

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % PASS / % FAIL (tổng %) — rollback có chủ đích ===',
    array_to_string(v_results, E'\n'), v_pass, v_total - v_pass, v_total;
end $$;
