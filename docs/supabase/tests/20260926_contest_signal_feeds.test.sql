-- Test cho migrations/20260926_add_contest_signal_feeds.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- 12 bài dự thi (sách 1..12). Bảng điểm ghi thẳng (bỏ qua tính điểm — đã test
-- ở 20260926_contest_scores.test.sql):
--   view_count     = i × 100          → top 10 lượt xem (trong 11 bài còn hiển thị) = sách 2..11
--   valid_readers  = i × 20           → dưới 100 độc giả: sách 1..4
--   readers_7d     = 0 nếu i chia hết cho 3, ngược lại = i
--   sách 12 bị xoá (deleted_at) → không xuất hiện ở đâu.
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
  v_books uuid[] := '{}';
  v_subs uuid[] := '{}';
  v_ids uuid[];
  v_ids2 uuid[];
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_admin, 'sf-d-' || v_admin || '@test.invalid'), (v_author, 'sf-a-' || v_author || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_admin, 'sf' || left(replace(v_admin::text, '-', ''), 12), 'D'),
    (v_author, 'sg' || left(replace(v_author::text, '-', ''), 12), 'A')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('sf-' || left(v_admin::text, 8), 'Giải thử', now() - interval '2 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);

  for i in 1..12 loop
    insert into public.books (author_id, title, slug, published) values (v_author, 'B' || i, 'sf-b' || i || '-' || v_author, true)
    returning id into v_book;
    insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true);
    v_books := v_books || v_book;
    v_subs := v_subs || (select s.id from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]') s);
    update public.books set view_count = i * 100 where id = v_book;
    insert into public.contest_submission_scores (submission_id, contest_id, valid_readers, readers_7d, readers_prev_7d)
    values (v_subs[i], v_contest, i * 20, case when i % 3 = 0 then 0 else i end, 1);
  end loop;
  update public.books set deleted_at = now() where id = v_books[12];

  -- ===== 1. Đang được chú ý =====
  select array_agg(f.submission_id) into v_ids from public.get_contest_signal_feed(v_contest, 'attention', 20) f;
  v_results := array_append(v_results, case when v_ids[1] = v_subs[11] and array_length(v_ids, 1) = 11 and not (v_subs[12] = any(v_ids))
    then 'PASS "Đang được chú ý" xếp theo độc giả hợp lệ, bỏ sách đã xoá'
    else 'FAIL attention: ' || coalesce(array_length(v_ids, 1), 0) end);

  -- ===== 2. Đang tăng tốc =====
  select array_agg(f.submission_id) into v_ids from public.get_contest_signal_feed(v_contest, 'trending', 20) f;
  v_results := array_append(v_results, case when v_ids[1] = v_subs[11] and array_length(v_ids, 1) = 8 and not (v_subs[3] = any(v_ids))
    then 'PASS "Đang tăng tốc" xếp theo độc giả mới 7 ngày, bỏ bài không có độc giả mới'
    else 'FAIL trending: ' || coalesce(array_length(v_ids, 1), 0) end);

  select count(*) into v_count from public.get_contest_signal_feed(v_contest, 'attention', 3);
  v_results := array_append(v_results, case when v_count = 3 then 'PASS giới hạn số dòng' else 'FAIL giới hạn: ' || v_count end);

  begin
    perform public.get_contest_signal_feed(v_contest, 'views', 10);
    v_results := array_append(v_results, 'FAIL nhận loại hàng lạ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_sort' then 'PASS loại hàng lạ bị từ chối' else 'FAIL loại lạ: ' || sqlerrm end);
  end;

  -- ===== 3. Viên ngọc ẩn — 2 nhóm ứng viên =====
  select array_agg(p.submission_id) into v_ids from public.get_contest_hidden_gem_pools(v_contest, 'seed-a', 100, 20) p where p.pool = 'low_readers';
  v_results := array_append(v_results, case when array_length(v_ids, 1) = 4 and v_ids <@ v_subs[1:4]
    then 'PASS nhóm 80%: bài dưới 100 độc giả hợp lệ' else 'FAIL low_readers: ' || coalesce(array_length(v_ids, 1), 0) end);
  select array_agg(p.submission_id) into v_ids from public.get_contest_hidden_gem_pools(v_contest, 'seed-a', 100, 20) p where p.pool = 'low_views';
  v_results := array_append(v_results, case when v_ids = array[v_subs[1]]
    then 'PASS nhóm 20%: bài ngoài top 10 lượt xem (không tính sách đã xoá)' else 'FAIL low_views: ' || coalesce(array_length(v_ids, 1), 0) end);

  select array_agg(p.submission_id) into v_ids from public.get_contest_hidden_gem_pools(v_contest, 'seed-b', 1000, 20) p where p.pool = 'low_readers';
  select array_agg(p.submission_id) into v_ids2 from public.get_contest_hidden_gem_pools(v_contest, 'seed-b', 1000, 20) p where p.pool = 'low_readers';
  v_results := array_append(v_results, case when v_ids = v_ids2 and array_length(v_ids, 1) = 11
    then 'PASS cùng seed → cùng thứ tự (ổn định trong ngày)' else 'FAIL seed' end);

  -- ===== 4. Chỉ service-role =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.get_contest_signal_feed(v_contest, 'attention', 10);
    v_results := array_append(v_results, 'FAIL client gọi được hàng tín hiệu');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS hàng tín hiệu chỉ dành cho service-role' else 'FAIL grant feed: ' || sqlerrm end);
  end;
  begin
    perform public.get_contest_hidden_gem_pools(v_contest, 'x', 100, 10);
    v_results := array_append(v_results, 'FAIL client gọi được Viên ngọc ẩn');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS Viên ngọc ẩn chỉ dành cho service-role' else 'FAIL grant gems: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
