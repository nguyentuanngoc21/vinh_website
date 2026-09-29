-- Test cho migrations/archive/20260926_add_score_run_publish.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_book uuid;
  v_version integer;
  v_preview uuid;
  v_final1 uuid;
  v_final2 uuid;
  v_old uuid;
  v_run public.contest_score_runs;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
  d1 constant interval := interval '1 day';
begin
  insert into auth.users (id, email) values
    (v_admin, 'sp-d-' || v_admin || '@test.invalid'), (v_author, 'sp-a-' || v_author || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_admin, 'sp' || left(replace(v_admin::text, '-', ''), 12), 'D'),
    (v_author, 'sq' || left(replace(v_author::text, '-', ''), 12), 'A')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('sp-' || left(v_admin::text, 8), 'Giải thử', now() - 30 * d1, now() + d1, v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'sp-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true);
  perform public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');
  update public.contests set submission_end = now() - 12 * d1 where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);

  perform public.set_contest_scoring_config(v_contest, v_admin, '{"rubric": []}'::jsonb, null);
  update public.contests set official_scoring_start = now() - 11 * d1, official_scoring_end = now() - d1 where id = v_contest;
  v_version := public.set_contest_scoring_config(v_contest, v_admin, '{"rubric": [], "v": 2}'::jsonb, 'Lần 2');
  insert into public.contest_score_runs (contest_id, config_version, kind, window_start, window_end, input_digest, computed_by)
  values (v_contest, 1, 'final', now() - 11 * d1, now() - d1, 'old', v_admin) returning id into v_old;
  v_preview := public.save_contest_score_run(v_contest, v_admin, jsonb_build_object('kind', 'preview', 'config_version', v_version, 'input_digest', 'p', 'rows', '[]'::jsonb));
  v_final1 := public.save_contest_score_run(v_contest, v_admin, jsonb_build_object('kind', 'final', 'config_version', v_version, 'input_digest', 'f1', 'rows', '[]'::jsonb));
  v_final2 := public.save_contest_score_run(v_contest, v_admin, jsonb_build_object('kind', 'final', 'config_version', v_version, 'input_digest', 'f2', 'rows', '[]'::jsonb));

  begin
    perform public.publish_contest_score_run(v_preview, v_admin, null);
    v_results := array_append(v_results, 'FAIL công bố được lượt tính thử');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'score_run_not_final' then 'PASS chỉ công bố lượt chính thức' else 'FAIL not_final: ' || sqlerrm end);
  end;
  begin
    perform public.publish_contest_score_run(v_old, v_admin, null);
    v_results := array_append(v_results, 'FAIL công bố lượt dùng version cũ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'score_run_stale' then 'PASS lượt dùng version cấu hình cũ không công bố được' else 'FAIL stale: ' || sqlerrm end);
  end;
  begin
    perform public.publish_contest_score_run(v_final1, v_author, null);
    v_results := array_append(v_results, 'FAIL người không phải admin công bố được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin công bố' else 'FAIL not_admin: ' || sqlerrm end);
  end;

  v_run := public.publish_contest_score_run(v_final1, v_admin, null);
  v_results := array_append(v_results, case when v_run.published_at is not null and v_run.published_by = v_admin and v_run.superseded_at is null
    then 'PASS công bố lượt đầu (không cần lý do)' else 'FAIL công bố lần đầu' end);

  begin
    perform public.publish_contest_score_run(v_final2, v_admin, '  ');
    v_results := array_append(v_results, 'FAIL thay kết quả không cần lý do');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'reason_required' then 'PASS thay kết quả đã công bố phải có lý do' else 'FAIL reason: ' || sqlerrm end);
  end;
  v_run := public.publish_contest_score_run(v_final2, v_admin, 'Giám khảo sửa điểm');
  select count(*) into v_count from public.contest_score_runs
  where contest_id = v_contest and published_at is not null and superseded_at is null;
  v_results := array_append(v_results, case when v_count = 1 and v_run.publish_reason = 'Giám khảo sửa điểm'
    and exists (select 1 from public.contest_score_runs where id = v_final1 and superseded_at is not null and published_at is not null)
    then 'PASS công bố lại: lượt cũ giữ lại, đánh dấu thay thế; chỉ 1 lượt đang công bố' else 'FAIL republish' end);

  begin
    perform public.publish_contest_score_run(v_final1, v_admin, 'quay lại');
    v_results := array_append(v_results, 'FAIL công bố lại lượt đã bị thay thế');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_status_transition' then 'PASS lượt đã thay thế không công bố lại được (tính lượt mới)' else 'FAIL superseded: ' || sqlerrm end);
  end;
  begin
    update public.contest_score_runs set input_digest = 'hack' where id = v_final2;
    v_results := array_append(v_results, 'FAIL sửa được nội dung lượt tính');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'score_run_immutable' then 'PASS nội dung lượt tính bất biến' else 'FAIL immutable: ' || sqlerrm end);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.publish_contest_score_run(v_final2, v_admin, 'x');
    v_results := array_append(v_results, 'FAIL client gọi thẳng hàm công bố');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS hàm công bố chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
