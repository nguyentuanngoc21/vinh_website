-- Test cho migrations/archive/20260926_add_scoring_tracking.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Chương 1: "a b c" / "d e" / "f" (3 đoạn, 6 chữ). Chương 2: "g h i j".
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_reader uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_book uuid;
  v_ch1 uuid;
  v_ch2 uuid;
  v_char uuid;
  v_list uuid;
  v_session uuid;
  v_session2 uuid;
  v_comment uuid;
  v_words integer;
  v_ts timestamptz;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_reader, 'st-r-' || v_reader || '@test.invalid'), (v_author, 'st-a-' || v_author || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_reader, 'st' || left(replace(v_reader::text, '-', ''), 12), 'R'),
    (v_author, 'su' || left(replace(v_author::text, '-', ''), 12), 'A')
  on conflict (id) do nothing;
  insert into public.books (author_id, title, slug, published) values (v_author, 'B', 'st-b-' || v_author, true) returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book, 'C1', E'a b c\n\nd e\n\nf', 1, true) returning id into v_ch1;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book, 'C2', 'g h i j', 2, true) returning id into v_ch2;

  -- ===== 1. words_reached =====
  select h.session_id into v_session from public.record_reading_heartbeat(v_reader, null, v_ch1, 0, null) h;
  select words_reached into v_words from public.reading_sessions where id = v_session;
  v_results := array_append(v_results, case when v_words = 3 then 'PASS đoạn 0 → 3 chữ' else 'FAIL đoạn 0: ' || coalesce(v_words::text, 'null') end);

  perform public.record_reading_heartbeat(v_reader, v_session, v_ch1, 1, null);
  select words_reached into v_words from public.reading_sessions where id = v_session;
  v_results := array_append(v_results, case when v_words = 5 then 'PASS tới đoạn 1 → cộng dồn các đoạn trước (5 chữ)' else 'FAIL đoạn 1: ' || v_words end);

  perform public.record_reading_heartbeat(v_reader, v_session, v_ch1, 0, null);
  select words_reached into v_words from public.reading_sessions where id = v_session;
  v_results := array_append(v_results, case when v_words = 5 then 'PASS cuộn ngược lên không làm giảm số chữ đã tới' else 'FAIL giảm: ' || v_words end);

  perform public.record_reading_heartbeat(v_reader, v_session, v_ch1, 99, null);
  select words_reached into v_words from public.reading_sessions where id = v_session;
  v_results := array_append(v_results, case when v_words = 6 then 'PASS đoạn vượt số đoạn → cả chương (6 chữ)' else 'FAIL vượt: ' || v_words end);

  select h.session_id into v_session2 from public.record_reading_heartbeat(v_reader, v_session, v_ch2, 0, null) h;
  select words_reached into v_words from public.reading_sessions where id = v_session2;
  v_results := array_append(v_results, case when v_session2 <> v_session and v_words = 4
    then 'PASS phiên chương mới tính theo nội dung chương đó' else 'FAIL chương 2: ' || coalesce(v_words::text, 'null') end);

  -- ===== 2. Thời gian sự kiện do server đặt =====
  insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content, created_at)
  values (v_reader, v_ch1, 0, 0, 1, 'Hay', now() - interval '30 days') returning id, created_at into v_comment, v_ts;
  v_results := array_append(v_results, case when v_ts = now() then 'PASS bình luận: không ghi lùi được thời gian' else 'FAIL bình luận insert: ' || v_ts end);
  update public.anchored_comments set created_at = now() - interval '30 days', content = 'Hay quá' where id = v_comment
  returning created_at into v_ts;
  v_results := array_append(v_results, case when v_ts = now() then 'PASS bình luận: sửa không đổi được thời gian' else 'FAIL bình luận update: ' || v_ts end);

  insert into public.chapter_votes (chapter_id, user_id, created_at) values (v_ch1, v_reader, now() + interval '30 days')
  returning created_at into v_ts;
  v_results := array_append(v_results, case when v_ts = now() then 'PASS bình chọn chương: không ghi trước ngày được' else 'FAIL chapter_votes: ' || v_ts end);

  insert into public.characters (book_id, name) values (v_book, 'N') returning id into v_char;
  insert into public.character_trope_votes (user_id, chapter_id, character_id, created_at) values (v_reader, v_ch1, v_char, now() - interval '30 days')
  returning created_at into v_ts;
  v_results := array_append(v_results, case when v_ts = now() then 'PASS bình chọn nhân vật: không ghi lùi được' else 'FAIL trope votes: ' || v_ts end);

  insert into public.reading_lists (user_id, name) values (v_reader, 'L') returning id into v_list;
  insert into public.reading_list_items (list_id, book_id, added_at) values (v_list, v_book, now() - interval '30 days')
  returning added_at into v_ts;
  v_results := array_append(v_results, case when v_ts = now() then 'PASS lưu danh sách đọc: không ghi lùi được' else 'FAIL list insert: ' || v_ts end);
  update public.reading_list_items set added_at = now() - interval '30 days' where list_id = v_list and book_id = v_book
  returning added_at into v_ts;
  v_results := array_append(v_results, case when v_ts = now() then 'PASS lưu danh sách đọc: sửa không đổi được thời gian' else 'FAIL list update: ' || v_ts end);

  -- ===== 3. Quyền RPC không đổi =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_reader, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.record_reading_heartbeat(v_reader, null, v_ch1, 0, null);
    v_results := array_append(v_results, 'FAIL client gọi thẳng RPC nhịp đọc');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC nhịp đọc vẫn chỉ dành cho service-role' else 'FAIL grant: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
