-- Test cho migrations/20260926_add_contest_award_payout.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration (và
-- migration core 20260926_add_contest_engine_core.sql). Không chạy trên
-- production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu
-- giả (kể cả giao dịch ví và số dư token của tài khoản giả).
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
  v_sub uuid;
  v_award uuid;
  v_zero uuid;
  v_revoked uuid;
  v_row public.contest_awards;
  v_balance_before integer;
  v_balance_after integer;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_author, 'pa-a-' || v_author || '@test.invalid'), (v_admin, 'pa-d-' || v_admin || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_author, 'qa' || left(replace(v_author::text, '-', ''), 12), 'A'),
    (v_admin, 'qd' || left(replace(v_admin::text, '-', ''), 12), 'D')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('pa-' || left(v_admin::text, 8), 'Giải thử', now() - interval '2 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'pa-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true);
  select id into v_sub from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');
  update public.contests set submission_end = now() - interval '1 minute' where id = v_contest;
  perform public.transition_contest_status(v_contest, 'submission_closed', v_admin, null);

  insert into public.contest_awards (contest_id, submission_id, award_code, award_name, prize_vnd, token_vnd_rate, prize_tokens, created_by)
  values (v_contest, v_sub, 'first_prize', 'Giải Nhất', 20000000, 200, 100000, v_admin) returning id into v_award;
  insert into public.contest_awards (contest_id, submission_id, award_code, award_name, prize_vnd, token_vnd_rate, prize_tokens, prize_extras, created_by)
  values (v_contest, v_sub, 'mention', 'Khuyến khích', 0, 200, 0, 'Banner trang chủ', v_admin) returning id into v_zero;
  insert into public.contest_awards (contest_id, submission_id, award_code, award_name, prize_vnd, token_vnd_rate, prize_tokens, created_by)
  values (v_contest, v_sub, 'readers_choice', 'Độc giả yêu thích', 1000000, 200, 5000, v_admin) returning id into v_revoked;

  -- ===== Trước khi công bố kết quả =====
  begin
    perform public.pay_contest_award(v_award, v_admin);
    v_results := array_append(v_results, 'FAIL chi trả trước khi công bố');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'results_not_published' then 'PASS chưa công bố kết quả thì không chi' else 'FAIL results_not_published: ' || sqlerrm end);
  end;

  perform public.transition_contest_status(v_contest, 'results', v_admin, null);

  begin
    perform public.pay_contest_award(v_award, v_author);
    v_results := array_append(v_results, 'FAIL người không phải admin chi được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin chi trả' else 'FAIL not_admin: ' || sqlerrm end);
  end;

  -- ===== Chi trả =====
  select token_balance into v_balance_before from public.profiles where id = v_author;
  select * into v_row from public.pay_contest_award(v_award, v_admin);
  select token_balance into v_balance_after from public.profiles where id = v_author;
  v_results := array_append(v_results, case when v_row.payout_transaction_id is not null and v_row.paid_at is not null
    and v_balance_after - v_balance_before = 100000
    then 'PASS chi trả: cộng đúng số token vào ví tác giả, ghi mã giao dịch' else 'FAIL chi trả: chênh ' || (v_balance_after - v_balance_before) end);

  select count(*) into v_count from public.transactions t
  join public.platform_bonus_grants g on g.transaction_id = t.id
  where t.id = v_row.payout_transaction_id and t.type = 'platform_bonus' and t.user_id = v_author
    and g.reason = 'Giải Giải Nhất — Giải thử' and g.granted_by = v_admin;
  v_results := array_append(v_results, case when v_count = 1
    then 'PASS đi qua grant_platform_bonus (sổ cái ví, ghi người chi và lý do)' else 'FAIL giao dịch: ' || v_count end);

  begin
    perform public.pay_contest_award(v_award, v_admin);
    v_results := array_append(v_results, 'FAIL chi trả hai lần');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'award_already_paid' then 'PASS không chi trả hai lần' else 'FAIL award_already_paid: ' || sqlerrm end);
  end;

  begin
    perform public.pay_contest_award(v_zero, v_admin);
    v_results := array_append(v_results, 'FAIL chi giải không có token');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'award_no_tokens' then 'PASS giải chỉ có quà kèm không chi token' else 'FAIL award_no_tokens: ' || sqlerrm end);
  end;

  update public.contest_awards set revoked_at = now(), revoked_by = v_admin, revoked_reason = 'Đạo văn' where id = v_revoked;
  begin
    perform public.pay_contest_award(v_revoked, v_admin);
    v_results := array_append(v_results, 'FAIL chi giải đã thu hồi');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'award_revoked' then 'PASS không chi giải đã thu hồi' else 'FAIL award_revoked: ' || sqlerrm end);
  end;

  begin
    update public.contest_awards set payout_transaction_id = gen_random_uuid(), paid_at = now() where id = v_zero;
    v_results := array_append(v_results, 'FAIL gắn mã giao dịch không tồn tại');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '23503' then 'PASS mã giao dịch phải trỏ tới giao dịch thật (FK)' else 'FAIL FK payout: ' || sqlerrm end);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.pay_contest_award(v_award, v_admin);
    v_results := array_append(v_results, 'FAIL authenticated gọi thẳng RPC chi trả');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC chi trả chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
