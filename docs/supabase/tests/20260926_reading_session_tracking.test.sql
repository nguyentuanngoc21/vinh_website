-- Test cho migrations/20260926_add_reading_session_tracking.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. Không chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- now() cố định trong cả khối DO, nên "thời gian trôi qua" được giả lập bằng
-- cách lùi last_heartbeat_at của phiên trước mỗi nhịp.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_reader uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_book uuid;
  v_ch1 uuid;
  v_ch2 uuid;
  v_session uuid;
  v_session2 uuid;
  v_active integer;
  v_row public.reading_sessions;
  v_count integer;
  v_text text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_reader, 'rs-r-' || v_reader || '@test.invalid'),
    (v_other, 'rs-o-' || v_other || '@test.invalid'),
    (v_author, 'rs-a-' || v_author || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_reader, 'rr' || left(replace(v_reader::text, '-', ''), 12), 'R'),
    (v_other, 'ro' || left(replace(v_other::text, '-', ''), 12), 'O'),
    (v_author, 'ra' || left(replace(v_author::text, '-', ''), 12), 'A')
  on conflict (id) do nothing;
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'rs-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C1', 'x', 1, true) returning id into v_ch1;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'C2', 'y', 2, true) returning id into v_ch2;

  -- ===== 1. Nhịp đầu: mở phiên, chưa cộng thời gian =====
  select h.session_id, h.active_seconds into v_session, v_active
  from public.record_reading_heartbeat(v_reader, null, v_ch1, 2, 'contest') h;
  select * into v_row from public.reading_sessions where id = v_session;
  v_results := array_append(v_results, case when v_session is not null and v_active = 0 and v_row.book_id = v_book
    and v_row.source = 'contest' and v_row.max_paragraph = 2
    then 'PASS nhịp đầu mở phiên (book_id, nguồn, đoạn), 0 giây' else 'FAIL nhịp đầu' end);

  -- ===== 2. Nhịp sau 60 giây thật: cộng 60 =====
  update public.reading_sessions set last_heartbeat_at = now() - interval '60 seconds' where id = v_session;
  select h.session_id, h.active_seconds into v_session2, v_active
  from public.record_reading_heartbeat(v_reader, v_session, v_ch1, 5, null) h;
  v_results := array_append(v_results, case when v_session2 = v_session and v_active = 60
    then 'PASS cộng đúng khoảng thời gian thật (60 giây)' else 'FAIL cộng thời gian: ' || v_active end);

  -- ===== 3. Nhịp dồn dập (0 giây trôi qua): không cộng thêm =====
  select h.active_seconds into v_active from public.record_reading_heartbeat(v_reader, v_session, v_ch1, 5, null) h;
  select h.active_seconds into v_active from public.record_reading_heartbeat(v_reader, v_session, v_ch1, 5, null) h;
  v_results := array_append(v_results, case when v_active = 60
    then 'PASS gửi dồn nhiều nhịp không cộng thêm thời gian' else 'FAIL nhịp dồn dập: ' || v_active end);

  -- ===== 4. Khoảng trống > 90 giây (bỏ đi / tab ẩn): không cộng =====
  update public.reading_sessions set last_heartbeat_at = now() - interval '10 minutes' where id = v_session;
  select h.active_seconds into v_active from public.record_reading_heartbeat(v_reader, v_session, v_ch1, 6, null) h;
  select * into v_row from public.reading_sessions where id = v_session;
  v_results := array_append(v_results, case when v_active = 60 and v_row.max_paragraph = 6
    then 'PASS khoảng trống > 90 giây không cộng (vẫn cập nhật đoạn)' else 'FAIL khoảng trống: ' || v_active end);

  -- ===== 5. Phiên nguội > 30 phút, người khác, chương khác → phiên mới =====
  update public.reading_sessions set last_heartbeat_at = now() - interval '31 minutes' where id = v_session;
  select h.session_id into v_session2 from public.record_reading_heartbeat(v_reader, v_session, v_ch1, 0, null) h;
  v_results := array_append(v_results, case when v_session2 <> v_session then 'PASS phiên nguội > 30 phút → mở phiên mới' else 'FAIL phiên nguội' end);

  select h.session_id into v_session2 from public.record_reading_heartbeat(v_other, v_session, v_ch1, 0, null) h;
  v_results := array_append(v_results, case when v_session2 <> v_session then 'PASS không dùng được phiên của người khác' else 'FAIL phiên người khác' end);

  select h.session_id into v_session2 from public.record_reading_heartbeat(v_reader, v_session, v_ch2, 0, null) h;
  v_results := array_append(v_results, case when v_session2 <> v_session then 'PASS đổi chương → phiên mới' else 'FAIL đổi chương' end);

  -- ===== 6. Nguồn lạ bị bỏ, không lỗi =====
  select h.session_id into v_session2 from public.record_reading_heartbeat(v_reader, null, v_ch2, 0, 'hack') h;
  select source into v_text from public.reading_sessions where id = v_session2;
  v_results := array_append(v_results, case when v_text is null then 'PASS nguồn không hợp lệ được bỏ qua' else 'FAIL nguồn lạ được lưu' end);

  -- ===== 7. Client không ghi được, chỉ đọc phiên của mình =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_reader, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.reading_sessions (user_id, chapter_id, active_seconds) values (v_reader, v_ch1, 7200);
    v_results := array_append(v_results, 'FAIL client tự ghi được phiên đọc');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS client không tự ghi được phiên đọc' else 'FAIL insert: ' || sqlerrm end);
  end;
  begin
    update public.reading_sessions set active_seconds = 7200 where user_id = v_reader;
    v_results := array_append(v_results, 'FAIL client tự sửa được thời gian đọc');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS client không tự sửa được thời gian đọc' else 'FAIL update: ' || sqlerrm end);
  end;
  select count(*) into v_count from public.reading_sessions where user_id in (v_reader, v_other);
  v_results := array_append(v_results, case when v_count >= 1 and not exists (select 1 from public.reading_sessions where user_id = v_other)
    then 'PASS chỉ đọc được phiên của chính mình' else 'FAIL đọc phiên người khác' end);
  begin
    perform public.record_reading_heartbeat(v_reader, null, v_ch1, 0, null);
    v_results := array_append(v_results, 'FAIL client gọi thẳng RPC nhịp đọc');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC nhịp đọc chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
