-- Test cho migrations/20260927_add_contest_passport.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration (và
-- migrations/20260927_add_contest_quests.sql). KHÔNG chạy trên production.
--
-- Cuộc thi đang nhận bài; 3 tác giả, 3 bài: A (2 chương), B, C (1 chương), mỗi chương
-- 1000 chữ → ngưỡng đọc thật 96 giây. Người đọc r1 đi dần 7 cột mốc.
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
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_ba uuid; v_bb uuid; v_bc uuid; v_bx uuid;
  v_a_ch1 uuid; v_a_ch2 uuid; v_b_ch uuid; v_c_ch uuid; v_x_ch uuid;
  v_sa uuid; v_sb uuid; v_sc uuid;
  v_state jsonb;
  v_count integer;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email)
  select u, 'pp-' || left(u::text, 8) || '-' || u || '@test.invalid' from unnest(array[v_admin, v_a1, v_a2, v_a3, v_r1]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'pp' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_admin, v_a1, v_a2, v_a3, v_r1]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('pp-' || left(v_admin::text, 8), 'Giải thử', now() - interval '5 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_a1, 'A', 'pp-a-' || v_a1, true) returning id into v_ba;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_ba, 'A1', repeat('chữ ', 1000), 1, true) returning id into v_a_ch1;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_ba, 'A2', repeat('chữ ', 1000), 2, true) returning id into v_a_ch2;
  insert into public.books (author_id, title, slug, published) values (v_a2, 'B', 'pp-b-' || v_a2, true) returning id into v_bb;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_bb, 'B1', repeat('chữ ', 1000), 1, true) returning id into v_b_ch;
  insert into public.books (author_id, title, slug, published) values (v_a3, 'C', 'pp-c-' || v_a3, true) returning id into v_bc;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_bc, 'C1', repeat('chữ ', 1000), 1, true) returning id into v_c_ch;
  insert into public.books (author_id, title, slug, published) values (v_a3, 'X', 'pp-x-' || v_a3, true) returning id into v_bx;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_bx, 'X1', repeat('chữ ', 1000), 1, true) returning id into v_x_ch;
  select id into v_sa from public.submit_contest_entry(v_contest, v_ba, v_a1, '1', '[]');
  select id into v_sb from public.submit_contest_entry(v_contest, v_bb, v_a2, '1', '[]');
  select id into v_sc from public.submit_contest_entry(v_contest, v_bc, v_a3, '1', '[]');

  -- ===== 1. Đọc thật mới ghi =====
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r1, v_a_ch1, v_ba, now() - interval '20 minutes', now() - interval '19 minutes', now() - interval '19 minutes', 40);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_ba, v_a_ch1);
  select count(*) into v_count from public.contest_passport_reads where user_id = v_r1;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS lướt tới cuối chương (40 giây) → Passport không ghi' else 'FAIL ghi khi lướt' end);

  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r1, v_a_ch1, v_ba, now() - interval '10 minutes', now() - interval '8 minutes', now() - interval '8 minutes', 100);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_ba, v_a_ch1);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_ba, v_a_ch1);
  select count(*) into v_count from public.contest_passport_reads where user_id = v_r1;
  v_state := public.contest_passport_state(v_r1, v_contest, false);
  v_results := array_append(v_results, case when v_count = 1
    and (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'read_entry') = 1
    and (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'hidden_gem') = 1
    and (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'finish_entry') = 0
    then 'PASS đọc thật → mốc "đọc 1 bài" + "Viên ngọc ẩn"; gửi lại cùng ngày không ghi trùng; chưa đọc hết bài 2 chương'
    else 'FAIL đọc thật: ' || v_count || ' ' || (v_state -> 'milestones')::text end);

  -- ===== 2. Đọc hết bài + 3 tác giả =====
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds) values
    (v_r1, v_a_ch2, v_ba, now() - interval '7 minutes', now() - interval '5 minutes', now() - interval '5 minutes', 100),
    (v_r1, v_b_ch, v_bb, now() - interval '4 minutes', now() - interval '2 minutes', now() - interval '2 minutes', 100),
    (v_r1, v_c_ch, v_bc, now() - interval '2 minutes', now(), now(), 100);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_ba, v_a_ch2);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_bb, v_b_ch);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_bc, v_c_ch);
  v_state := public.contest_passport_state(v_r1, v_contest, false);
  v_results := array_append(v_results, case
    when (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'finish_entry') = 1
     and (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'read_3_authors') = 3
    then 'PASS đọc hết mọi chương của 1 bài + bài của 3 tác giả' else 'FAIL finish/authors: ' || (v_state -> 'milestones')::text end);

  -- ===== 3. Không tính =====
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r1, v_x_ch, v_bx, now() - interval '3 minutes', now(), now(), 300),
         (v_a1, v_a_ch1, v_ba, now() - interval '3 minutes', now(), now(), 300);
  perform public.record_contest_activity(v_r1, 'chapter_completed', v_bx, v_x_ch);
  perform public.record_contest_activity(v_a1, 'chapter_completed', v_ba, v_a_ch1);
  select count(*) into v_count from public.contest_passport_reads where chapter_id = v_x_ch or user_id = v_a1;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS truyện không dự thi / tác giả tự đọc → không ghi Passport' else 'FAIL ghi sai' end);

  -- ===== 4. Bình luận, phiếu, quay lại → huy hiệu =====
  insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content)
  values (v_r1, v_b_ch, 0, 0, 1, 'Hay');
  insert into public.contest_votes (contest_id, submission_id, user_id) values (v_contest, v_sa, v_r1), (v_contest, v_sb, v_r1);
  -- 2 ngày trước đó (giả lập quay lại): cùng chương, khác ngày.
  insert into public.contest_passport_reads (user_id, contest_id, submission_id, chapter_id, read_day) values
    (v_r1, v_contest, v_sa, v_a_ch1, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1),
    (v_r1, v_contest, v_sa, v_a_ch1, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 2);
  v_state := public.contest_passport_state(v_r1, v_contest, true);
  v_results := array_append(v_results, case when v_state -> 'completed_at' = 'null'::jsonb
    and (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'vote_3') = 2
    then 'PASS mới 2 phiếu → chưa đủ 7 mốc, chưa có huy hiệu' else 'FAIL chưa đủ: ' || v_state::text end);

  insert into public.contest_votes (contest_id, submission_id, user_id) values (v_contest, v_sc, v_r1);
  perform public.record_contest_activity(v_r1, 'vote', v_bc, null);
  v_state := public.contest_passport_state(v_r1, v_contest, false);
  select count(*) into v_count from public.contest_passports where user_id = v_r1 and contest_id = v_contest;
  v_results := array_append(v_results, case when v_count = 1 and v_state -> 'completed_at' <> 'null'::jsonb
    and not exists (select 1 from jsonb_array_elements(v_state -> 'milestones') m where (m ->> 'progress')::integer < (m ->> 'target')::integer)
    then 'PASS đủ 7 mốc → huy hiệu "Người đi hết mùa thi"' else 'FAIL huy hiệu: ' || v_state::text end);

  delete from public.contest_votes where submission_id = v_sc and user_id = v_r1;
  perform public.record_contest_activity(v_r1, 'vote', v_ba, null);
  v_state := public.contest_passport_state(v_r1, v_contest, true);
  select count(*) into v_count from public.contest_passports where user_id = v_r1 and contest_id = v_contest;
  v_results := array_append(v_results, case when v_count = 1 and v_state -> 'completed_at' <> 'null'::jsonb
    and (select (m ->> 'progress')::integer from jsonb_array_elements(v_state -> 'milestones') m where m ->> 'code' = 'vote_3') = 2
    then 'PASS rút phiếu → mốc bình chọn tự trừ, huy hiệu đã đạt vẫn giữ' else 'FAIL rút phiếu' end);

  -- ===== 5. Chỉ service-role =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_r1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.contest_passport_state(v_r1, v_contest, true);
    v_results := array_append(v_results, 'FAIL client gọi thẳng hàm Passport');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS hàm Passport chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  begin
    select count(*) into v_count from public.contest_passports;
    v_results := array_append(v_results, 'FAIL client đọc thẳng bảng huy hiệu');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS bảng Passport chỉ đọc qua server' else 'FAIL grant table: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
