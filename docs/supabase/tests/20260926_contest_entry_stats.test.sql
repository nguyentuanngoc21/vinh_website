-- Test cho migrations/20260926_add_contest_entry_stats.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Truyện 3 chương, cuộc thi mở nhận bài 20 ngày trước. Phiên đọc ghi thẳng:
--   u1: ch1 5 ngày trước (nguồn contest, 100s); ch2, ch3 1 ngày trước (60s, 60s)
--   u2: ch1 (nguồn search, 30s), ch2 (30s) — cùng ngày hôm nay
--   u3: ch1 (không nguồn, 40s)
--   u4: ch1 25 ngày trước (trước khi mở)     → không tính
--   u5: ch1 active_seconds = 0               → không tính
--   tác giả tự đọc ch1                        → không tính
-- Kỳ vọng: 3 người đọc; 1 quay lại (u1); TB phiên = 320/6 ≈ 53 giây;
-- phễu 3 → 2 → 1; đọc tiếp = trung bình(2/3, 1/2) = 0,5833;
-- nguồn: contest 1, search 1, other 1; đọc hết chương cuối: 1 (u1).
-- Bình luận: u1 ×1, u2 ×2 (tác giả và bình luận trước khi mở không tính) → 3 bình luận / 2 người.
-- Theo dõi tác giả: u1 (1 ngày trước), u2 (10 ngày trước); u4 (25 ngày trước) không tính → 2, trong 7 ngày: 1.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_u1 uuid := gen_random_uuid();
  v_u2 uuid := gen_random_uuid();
  v_u3 uuid := gen_random_uuid();
  v_u4 uuid := gen_random_uuid();
  v_u5 uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_book uuid;
  v_ch1 uuid;
  v_ch2 uuid;
  v_ch3 uuid;
  v_sub uuid;
  v_stats jsonb;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_admin, 'es-d-' || v_admin || '@test.invalid'), (v_author, 'es-a-' || v_author || '@test.invalid'),
    (v_u1, 'es-1-' || v_u1 || '@test.invalid'), (v_u2, 'es-2-' || v_u2 || '@test.invalid'),
    (v_u3, 'es-3-' || v_u3 || '@test.invalid'), (v_u4, 'es-4-' || v_u4 || '@test.invalid'),
    (v_u5, 'es-5-' || v_u5 || '@test.invalid');
  insert into public.profiles (id, username, nickname)
  select u, 'es' || left(replace(u::text, '-', ''), 12), 'U'
  from unnest(array[v_admin, v_author, v_u1, v_u2, v_u3, v_u4, v_u5]) as u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('es-' || left(v_admin::text, 8), 'Giải thử', now() - interval '20 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'es-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true) returning id into v_ch1;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C2', 'y', 2, true) returning id into v_ch2;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C3', 'z', 3, true) returning id into v_ch3;
  select id into v_sub from public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');

  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds, source) values
    (v_u1, v_ch1, v_book, now() - interval '5 days', now() - interval '5 days', now() - interval '5 days', 100, 'contest'),
    (v_u1, v_ch2, v_book, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', 60, null),
    (v_u1, v_ch3, v_book, now() - interval '1 day' + interval '2 minutes', now() - interval '1 day' + interval '2 minutes', now() - interval '1 day' + interval '2 minutes', 60, null),
    (v_u2, v_ch1, v_book, now() - interval '2 minutes', now(), now(), 30, 'search'),
    (v_u2, v_ch2, v_book, now() - interval '1 minute', now(), now(), 30, null),
    (v_u3, v_ch1, v_book, now() - interval '3 minutes', now(), now(), 40, null),
    (v_u4, v_ch1, v_book, now() - interval '25 days', now() - interval '25 days', now() - interval '25 days', 500, 'contest'),
    (v_u5, v_ch1, v_book, now() - interval '1 minute', now(), now(), 0, 'contest'),
    (v_author, v_ch1, v_book, now() - interval '1 minute', now(), now(), 999, null);
  insert into public.reading_history (user_id, book_id, chapter_id, read_at) values
    (v_u1, v_book, v_ch3, now() - interval '1 day'),
    (v_author, v_book, v_ch3, now()),
    (v_u4, v_book, v_ch3, now() - interval '25 days');
  -- Trigger anchored_comments_server_time (migrations/20260926_add_scoring_tracking.sql)
  -- ép created_at = now(); tắt tạm để dựng bình luận cũ. Tắt/bật nằm trong giao
  -- dịch của test nên cũng bị hoàn tác khi test kết thúc.
  if exists (select 1 from pg_trigger where tgname = 'anchored_comments_server_time') then
    execute 'alter table public.anchored_comments disable trigger anchored_comments_server_time';
  end if;
  insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content, created_at) values
    (v_u1, v_ch1, 0, 0, 1, 'Hay', now() - interval '1 day'),
    (v_u2, v_ch2, 0, 0, 1, 'Tuyệt', now()),
    (v_u2, v_ch2, 0, 0, 1, 'Nữa', now()),
    (v_author, v_ch1, 0, 0, 1, 'Cảm ơn', now()),
    (v_u4, v_ch1, 0, 0, 1, 'Cũ', now() - interval '25 days');
  if exists (select 1 from pg_trigger where tgname = 'anchored_comments_server_time') then
    execute 'alter table public.anchored_comments enable trigger anchored_comments_server_time';
  end if;
  insert into public.author_follows (follower_id, author_id, created_at) values
    (v_u1, v_author, now() - interval '1 day'),
    (v_u2, v_author, now() - interval '10 days'),
    (v_u4, v_author, now() - interval '25 days');

  v_stats := public.get_contest_entry_stats(v_sub);

  v_results := array_append(v_results, case when (v_stats ->> 'readers')::integer = 3
    then 'PASS người đọc: bỏ tác giả, đọc trước khi mở, phiên 0 giây' else 'FAIL readers: ' || (v_stats ->> 'readers') end);
  v_results := array_append(v_results, case when (v_stats ->> 'return_readers')::integer = 1
    then 'PASS độc giả quay lại = đọc ở ≥ 2 ngày' else 'FAIL return_readers: ' || (v_stats ->> 'return_readers') end);
  v_results := array_append(v_results, case when (v_stats ->> 'completed_readers')::integer = 1
    then 'PASS đọc hết chương cuối (bỏ tác giả, trước khi mở)' else 'FAIL completed_readers: ' || (v_stats ->> 'completed_readers') end);
  v_results := array_append(v_results, case when (v_stats ->> 'continue_rate')::numeric = 0.5833
    then 'PASS đọc tiếp chương sau = trung bình các cặp chương' else 'FAIL continue_rate: ' || coalesce(v_stats ->> 'continue_rate', 'null') end);
  v_results := array_append(v_results, case when (v_stats ->> 'avg_session_seconds')::integer = 53
    then 'PASS thời gian đọc trung bình mỗi phiên' else 'FAIL avg_session_seconds: ' || (v_stats ->> 'avg_session_seconds') end);
  v_results := array_append(v_results, case
    when (select array_agg((f ->> 'readers')::integer order by (f ->> 'position')::integer) from jsonb_array_elements(v_stats -> 'funnel') f) = array[3, 2, 1]
    then 'PASS giữ chân theo chương 3 → 2 → 1' else 'FAIL funnel: ' || (v_stats -> 'funnel')::text end);
  v_results := array_append(v_results, case
    when (select jsonb_object_agg(x ->> 'source', (x ->> 'readers')::integer) from jsonb_array_elements(v_stats -> 'sources') x)
         = '{"contest": 1, "search": 1, "other": 1}'::jsonb
    then 'PASS nguồn theo phiên đầu tiên của mỗi người' else 'FAIL sources: ' || (v_stats -> 'sources')::text end);
  v_results := array_append(v_results, case when (v_stats ->> 'comments')::integer = 3 and (v_stats ->> 'commenters')::integer = 2
    then 'PASS bình luận 3 / 2 người (bỏ tác giả, trước khi mở)' else 'FAIL comments: ' || (v_stats ->> 'comments') end);
  v_results := array_append(v_results, case when (v_stats ->> 'new_followers')::integer = 2 and (v_stats ->> 'new_followers_7d')::integer = 1
    then 'PASS người theo dõi mới từ khi mở / 7 ngày' else 'FAIL followers: ' || (v_stats ->> 'new_followers') end);
  v_results := array_append(v_results, case when v_stats ->> 'valid_readers' is null and (v_stats ->> 'chapter_count')::integer = 3
    then 'PASS chưa tính bảng điểm → độc giả hợp lệ null' else 'FAIL valid_readers / chapter_count' end);

  -- Truyện 1 chương → đọc tiếp = null
  update public.chapters set published = false where id in (v_ch2, v_ch3);
  v_stats := public.get_contest_entry_stats(v_sub);
  v_results := array_append(v_results, case when v_stats -> 'continue_rate' = 'null'::jsonb
    then 'PASS truyện 1 chương: không có "đọc tiếp chương sau"' else 'FAIL continue_rate 1 chương: ' || (v_stats ->> 'continue_rate') end);

  begin
    perform public.get_contest_entry_stats(gen_random_uuid());
    v_results := array_append(v_results, 'FAIL bài không tồn tại vẫn trả số liệu');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'submission_not_found' then 'PASS bài không tồn tại → submission_not_found' else 'FAIL not found: ' || sqlerrm end);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.get_contest_entry_stats(v_sub);
    v_results := array_append(v_results, 'FAIL client gọi thẳng được thống kê');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS thống kê chỉ dành cho service-role (route kiểm tác giả)' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
