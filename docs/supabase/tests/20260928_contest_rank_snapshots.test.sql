-- Test cho migrations/archive/20260928_add_contest_rank_snapshots.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- Cuộc thi đang nhận bài, 3 bài A, B, C. Trending lấy readers_7d từ bảng điểm
-- (ghi thẳng cho test); sau đó chuyển sang bình chọn và bỏ phiếu thật.
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
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_contest uuid;
  v_draft uuid;
  v_ba uuid; v_bb uuid; v_bc uuid;
  v_sa uuid; v_sb uuid; v_sc uuid;
  v_n integer;
  v_rank integer;
  v_ranks text;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'rs-' || left(u::text, 8) || '-' || u || '@test.invalid', now() - interval '60 days'
  from unnest(array[v_admin, v_a1, v_a2, v_a3, v_r1, v_r2]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'rs' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_admin, v_a1, v_a2, v_a3, v_r1, v_r2]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('rs-' || left(v_admin::text, 8), 'Giải thử', now() - interval '5 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_a1, 'A', 'rs-a-' || v_a1, true) returning id into v_ba;
  insert into public.books (author_id, title, slug, published) values (v_a2, 'B', 'rs-b-' || v_a2, true) returning id into v_bb;
  insert into public.books (author_id, title, slug, published) values (v_a3, 'C', 'rs-c-' || v_a3, true) returning id into v_bc;
  insert into public.chapters (book_id, title, content, order_index, published)
  select b, 'C1', repeat('chữ ', 1000), 1, true from unnest(array[v_ba, v_bb, v_bc]) b;
  select id into v_sa from public.submit_contest_entry(v_contest, v_ba, v_a1, '1', '[]');
  select id into v_sb from public.submit_contest_entry(v_contest, v_bb, v_a2, '1', '[]');
  select id into v_sc from public.submit_contest_entry(v_contest, v_bc, v_a3, '1', '[]');

  insert into public.contest_submission_scores (submission_id, contest_id, readers_7d)
  values (v_sa, v_contest, 5), (v_sb, v_contest, 3), (v_sc, v_contest, 1)
  on conflict (submission_id) do update set readers_7d = excluded.readers_7d;

  -- ===== 1. Đang nhận bài: chỉ chụp Trending =====
  v_n := public.snapshot_contest_ranks(v_contest, null);
  select string_agg(case submission_id when v_sa then 'A' when v_sb then 'B' else 'C' end || rank, ',' order by rank, submission_id = v_sc)
    into v_ranks from public.contest_rank_snapshots where contest_id = v_contest and kind = 'trending' and snapshot_day = v_today;
  v_results := array_append(v_results, case when v_n = 3 and v_ranks = 'A1,B2,C3'
    and not exists (select 1 from public.contest_rank_snapshots where contest_id = v_contest and kind = 'popular')
    then 'PASS nhận bài → chụp Trending theo độc giả mới 7 ngày (A1,B2,C3), chưa chụp bảng phiếu'
    else 'FAIL chụp Trending: ' || v_n || ' ' || coalesce(v_ranks, 'null') end);

  -- ===== 2. Chụp lại cùng ngày → bỏ qua, không trộn thời điểm =====
  update public.contest_submission_scores set readers_7d = 9 where submission_id = v_sc;
  v_n := public.snapshot_contest_ranks(v_contest, null);
  select rank into v_rank from public.contest_rank_snapshots
   where contest_id = v_contest and kind = 'trending' and snapshot_day = v_today and submission_id = v_sc;
  v_results := array_append(v_results, case when v_n = 0 and v_rank = 3
    then 'PASS chụp lại cùng ngày → 0 dòng, giữ bản chụp đầu (C vẫn hạng 3)' else 'FAIL chụp lại: ' || v_n || ' ' || coalesce(v_rank::text, 'null') end);

  -- ===== 3. Ngày khác → bản chụp mới; đồng hạng kiểu rank() =====
  update public.contest_submission_scores set readers_7d = 5 where submission_id = v_sb;
  v_n := public.snapshot_contest_ranks(v_contest, v_today - 1);
  select string_agg(case submission_id when v_sa then 'A' when v_sb then 'B' else 'C' end || rank, ',' order by rank, submission_id <> v_sc, submission_id = v_sb)
    into v_ranks from public.contest_rank_snapshots where contest_id = v_contest and kind = 'trending' and snapshot_day = v_today - 1;
  v_results := array_append(v_results, case when v_n = 3 and v_ranks = 'C1,A2,B2'
    then 'PASS ngày khác → chụp mới; A, B cùng 5 độc giả → đồng hạng 2' else 'FAIL ngày khác: ' || v_n || ' ' || coalesce(v_ranks, 'null') end);

  -- ===== 4. Bình chọn: chụp bảng phiếu theo phiếu hợp lệ =====
  update public.contests set submission_end = now() - interval '1 minute',
         voting_start = now() - interval '1 hour', voting_end = now() + interval '1 day'
   where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);
  perform public.transition_contest_status(v_contest, 'community_voting', v_admin, null);
  insert into public.contest_votes (contest_id, submission_id, user_id)
  values (v_contest, v_sb, v_r1), (v_contest, v_sb, v_r2), (v_contest, v_sa, v_r1);
  v_n := public.snapshot_contest_ranks(v_contest, null);
  select string_agg(case submission_id when v_sa then 'A' when v_sb then 'B' else 'C' end || rank, ',' order by rank)
    into v_ranks from public.contest_rank_snapshots where contest_id = v_contest and kind = 'popular' and snapshot_day = v_today;
  v_results := array_append(v_results, case when v_n = 3 and v_ranks = 'B1,A2,C3'
    then 'PASS bình chọn → chụp bảng phiếu (B1,A2,C3); Trending hôm nay đã có nên bỏ qua'
    else 'FAIL bảng phiếu: ' || v_n || ' ' || coalesce(v_ranks, 'null') end);

  -- ===== 5. Ngày mới trong lúc bình chọn → chụp cả 2 bảng =====
  v_n := public.snapshot_contest_ranks(v_contest, v_today + 1);
  v_results := array_append(v_results, case when v_n = 6
    and (select count(distinct kind) from public.contest_rank_snapshots where contest_id = v_contest and snapshot_day = v_today + 1) = 2
    then 'PASS ngày mới lúc bình chọn → chụp cả bảng phiếu và Trending' else 'FAIL 2 bảng: ' || v_n end);

  -- ===== 6. Cuộc thi nháp / không tồn tại =====
  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('rs-d-' || left(v_admin::text, 8), 'Nháp', now() + interval '5 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_draft;
  v_n := public.snapshot_contest_ranks(v_draft, null);
  v_results := array_append(v_results, case when v_n = 0 then 'PASS cuộc thi nháp → không chụp' else 'FAIL nháp: ' || v_n end);

  begin
    perform public.snapshot_contest_ranks(gen_random_uuid(), null);
    v_results := array_append(v_results, 'FAIL cuộc thi không tồn tại vẫn chạy');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_not_found'
      then 'PASS cuộc thi không tồn tại → contest_not_found' else 'FAIL hint: ' || coalesce(v_hint, 'null') end);
  end;

  -- ===== 7. Quyền: chỉ service-role =====
  v_results := array_append(v_results, case
    when not has_function_privilege('anon', 'public.snapshot_contest_ranks(uuid, date)', 'execute')
     and not has_function_privilege('authenticated', 'public.snapshot_contest_ranks(uuid, date)', 'execute')
     and not has_table_privilege('anon', 'public.contest_rank_snapshots', 'select')
     and not has_table_privilege('authenticated', 'public.contest_rank_snapshots', 'select')
    then 'PASS anon / authenticated không gọi hàm, không đọc bảng chụp hạng' else 'FAIL quyền' end);

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % PASS / % FAIL (tổng %) — rollback có chủ đích ===',
    array_to_string(v_results, E'\n'), v_pass, v_total - v_pass, v_total;
end $$;
