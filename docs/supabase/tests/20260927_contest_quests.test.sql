-- Test cho migrations/20260927_add_contest_quests.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Cuộc thi đang nhận bài; truyện A (dự thi, chương 1000 chữ → ngưỡng đọc thật 96 giây),
-- truyện X (không dự thi). Mẫu nhiệm vụ sự kiện lấy từ seed của migration.
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
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_book uuid;
  v_other_book uuid;
  v_ch uuid;
  v_other_ch uuid;
  v_t_read uuid;
  v_t_gem uuid;
  v_t_comment uuid;
  v_t_vote uuid;
  v_t_general uuid;
  v_slot public.user_quest_pool;
  v_ok boolean;
  v_task public.user_daily_tasks;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  select id into v_t_read from public.task_templates where code = 'contest_read_entry_chapter';
  select id into v_t_gem from public.task_templates where code = 'contest_read_hidden_gem';
  select id into v_t_comment from public.task_templates where code = 'contest_comment_entry';
  select id into v_t_vote from public.task_templates where code = 'contest_vote_entry';
  select id into v_t_general from public.task_templates where quest_pool = 'general' and active and quest_type is not null limit 1;

  insert into auth.users (id, email)
  select u, 'cq-' || left(u::text, 8) || '-' || u || '@test.invalid' from unnest(array[v_admin, v_author, v_r1, v_r2, v_r3]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'cq' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_admin, v_author, v_r1, v_r2, v_r3]) u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('cq-' || left(v_admin::text, 8), 'Giải thử', now() - interval '5 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);
  insert into public.books (author_id, title, slug, published) values (v_author, 'A', 'cq-a-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', repeat('chữ ', 1000), 1, true) returning id into v_ch;
  insert into public.books (author_id, title, slug, published) values (v_author, 'X', 'cq-x-' || v_author, true) returning id into v_other_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_other_book, 'C1', repeat('chữ ', 1000), 1, true) returning id into v_other_ch;
  perform public.submit_contest_entry(v_contest, v_book, v_author, '1', '[]');

  v_results := array_append(v_results, case when v_t_read is not null and v_t_gem is not null and v_t_comment is not null and v_t_vote is not null
    and not exists (select 1 from public.task_templates where quest_pool = 'contest' and quest_type is not null)
    then 'PASS 5 mẫu nhiệm vụ sự kiện đã seed (quest_type NULL — code cũ không bốc vào pool thường)' else 'FAIL seed mẫu' end);

  -- ===== 1. Ô sự kiện =====
  begin
    perform public.add_event_quest_slot(v_r1, current_date, v_t_vote, v_contest);
    v_results := array_append(v_results, 'FAIL nhận nhiệm vụ bình chọn khi chưa mở bình chọn');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'quest_not_available' then 'PASS nhiệm vụ bình chọn chỉ có trong khung bình chọn' else 'FAIL vote slot: ' || sqlerrm end);
  end;
  begin
    perform public.add_event_quest_slot(v_r1, current_date, v_t_general, v_contest);
    v_results := array_append(v_results, 'FAIL dùng mẫu thường làm ô sự kiện');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'quest_not_available' then 'PASS ô sự kiện chỉ nhận mẫu sự kiện' else 'FAIL general as event: ' || sqlerrm end);
  end;

  v_slot := public.add_event_quest_slot(v_r1, current_date, v_t_read, v_contest);
  select count(*) into v_count from public.user_daily_tasks where user_id = v_r1 and template_id = v_t_read and task_date = current_date;
  v_results := array_append(v_results, case when v_slot.slot_kind = 'event' and v_slot.contest_id = v_contest and v_count = 1
    then 'PASS thêm ô sự kiện (ghi cuộc thi của ngày + tạo dòng tiến độ)' else 'FAIL add slot' end);
  v_slot := public.add_event_quest_slot(v_r1, current_date, v_t_comment, v_contest);
  select count(*) into v_count from public.user_quest_pool where user_id = v_r1 and pool_date = current_date and slot_kind = 'event';
  v_results := array_append(v_results, case when v_count = 1 and v_slot.task_template_id = v_t_read
    then 'PASS gọi lại không tạo ô thứ 2 (trả ô đang có)' else 'FAIL idempotent' end);
  begin
    insert into public.user_quest_pool (user_id, pool_date, task_template_id, slot_index, slot_kind, contest_id)
    values (v_r1, current_date, v_t_gem, 9, 'event', v_contest);
    v_results := array_append(v_results, 'FAIL có 2 ô sự kiện / ngày');
  exception when unique_violation then
    v_results := array_append(v_results, 'PASS DB chặn 2 ô sự kiện / ngày');
  end;
  begin
    perform public.reset_quest_pool_slot(v_r1, current_date, v_t_read, v_t_general, 3);
    v_results := array_append(v_results, 'FAIL đổi ô sự kiện bằng lượt đổi chung');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'event_slot' then 'PASS ô sự kiện không đổi bằng lượt đổi chung' else 'FAIL general reset: ' || sqlerrm end);
  end;

  -- ===== 2. Ghi tiến độ (đọc thật — K7) =====
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r1, v_ch, v_book, now() - interval '10 minutes', now() - interval '9 minutes', now() - interval '9 minutes', 40);
  v_ok := public.record_contest_activity(v_r1, 'chapter_completed', v_book, v_ch);
  v_results := array_append(v_results, case when not v_ok then 'PASS tới cuối chương nhưng đọc chưa đủ lâu → không tính' else 'FAIL tính khi lướt' end);
  v_ok := public.record_contest_activity(v_r1, 'comment', v_book, null);
  v_results := array_append(v_results, case when not v_ok then 'PASS hành động khác nhiệm vụ hôm nay → không tính' else 'FAIL sai hành động' end);
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r1, v_other_ch, v_other_book, now() - interval '5 minutes', now(), now(), 200);
  v_ok := public.record_contest_activity(v_r1, 'chapter_completed', v_other_book, v_other_ch);
  v_results := array_append(v_results, case when not v_ok then 'PASS truyện không dự thi → không tính' else 'FAIL tính truyện ngoài cuộc thi' end);
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r1, v_ch, v_book, now() - interval '5 minutes', now(), now(), 60);
  v_ok := public.record_contest_activity(v_r1, 'chapter_completed', v_book, v_ch);
  select * into v_task from public.user_daily_tasks where user_id = v_r1 and template_id = v_t_read and task_date = current_date;
  v_results := array_append(v_results, case when v_ok and v_task.completed and v_task.progress = 1
    then 'PASS đọc thật (40 + 60 ≥ 96 giây) bài dự thi → hoàn thành nhiệm vụ' else 'FAIL hoàn thành' end);
  v_ok := public.record_contest_activity(v_r1, 'chapter_completed', v_book, v_ch);
  v_results := array_append(v_results, case when not v_ok then 'PASS đã hoàn thành thì không cộng thêm' else 'FAIL cộng thêm' end);

  -- Tác giả không làm nhiệm vụ trên bài của chính mình.
  perform public.add_event_quest_slot(v_author, current_date, v_t_read, v_contest);
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_author, v_ch, v_book, now() - interval '5 minutes', now(), now(), 500);
  v_ok := public.record_contest_activity(v_author, 'chapter_completed', v_book, v_ch);
  v_results := array_append(v_results, case when not v_ok then 'PASS tác giả tự đọc bài mình → không tính' else 'FAIL tác giả' end);

  -- ===== 3. Viên ngọc ẩn =====
  perform public.add_event_quest_slot(v_r3, current_date, v_t_gem, v_contest);
  insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, active_seconds)
  values (v_r3, v_ch, v_book, now() - interval '5 minutes', now(), now(), 120);
  v_ok := public.record_contest_activity(v_r3, 'chapter_completed', v_book, v_ch);
  v_results := array_append(v_results, case when v_ok then 'PASS đọc thật 1 bài ít độc giả → hoàn thành "Tìm viên ngọc ẩn"' else 'FAIL hidden gem' end);

  -- ===== 4. Đổi nhiệm vụ sự kiện (K3: 1 lần/ngày) =====
  perform public.add_event_quest_slot(v_r2, current_date, v_t_read, v_contest);
  begin
    perform public.reset_event_quest_slot(v_r2, current_date, v_t_vote, 1);
    v_results := array_append(v_results, 'FAIL đổi sang nhiệm vụ bình chọn ngoài khung bình chọn');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'quest_not_available' then 'PASS chỉ đổi sang nhiệm vụ sự kiện dùng được lúc này' else 'FAIL reroll vote: ' || sqlerrm end);
  end;
  v_slot := public.reset_event_quest_slot(v_r2, current_date, v_t_comment, 1);
  v_results := array_append(v_results, case when v_slot.task_template_id = v_t_comment and v_slot.reroll_count = 1 and v_slot.contest_id = v_contest
    then 'PASS đổi nhiệm vụ sự kiện (giữ cuộc thi, đếm lượt đổi riêng)' else 'FAIL reroll' end);
  begin
    perform public.reset_event_quest_slot(v_r2, current_date, v_t_read, 1);
    v_results := array_append(v_results, 'FAIL đổi quá 1 lần/ngày');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'event_reroll_limit' then 'PASS tối đa 1 lần đổi nhiệm vụ sự kiện / ngày' else 'FAIL reroll limit: ' || sqlerrm end);
  end;
  v_ok := public.record_contest_activity(v_r2, 'comment', v_book, null);
  v_results := array_append(v_results, case when v_ok then 'PASS bình luận bài dự thi → hoàn thành nhiệm vụ bình luận' else 'FAIL comment' end);

  -- ===== 5. Chỉ service-role =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_r1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.record_contest_activity(v_r1, 'comment', v_book, null);
    v_results := array_append(v_results, 'FAIL client tự ghi tiến độ nhiệm vụ sự kiện');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS ghi tiến độ nhiệm vụ sự kiện chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
