-- Test cho migrations/20260926_add_contest_snapshots.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration (và
-- migration core 20260926_add_contest_engine_core.sql). Không chạy trên
-- production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- now() cố định trong cả khối: "sau hạn" được giả lập bằng cách lùi
-- submission_end (cuộc thi vẫn 'submission_open' — đúng trường hợp cron trễ).
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid; v_b5 uuid; v_b6 uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5a uuid; v_c5b uuid; v_c6 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s6 uuid;
  v_snap public.contest_submission_snapshots;
  v_count integer;
  v_text text;
  v_int integer;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_author, 'sn-a-' || v_author || '@test.invalid'),
    (v_other, 'sn-o-' || v_other || '@test.invalid'),
    (v_admin, 'sn-d-' || v_admin || '@test.invalid');
  insert into public.profiles (id, username, nickname) values
    (v_author, 'sa' || left(replace(v_author::text, '-', ''), 12), 'A'),
    (v_other, 'so' || left(replace(v_other::text, '-', ''), 12), 'O'),
    (v_admin, 'sd' || left(replace(v_admin::text, '-', ''), 12), 'D')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('sn-' || left(v_admin::text, 8), 'SN', now() - interval '2 days', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);

  -- b1: sửa chương sau hạn. b2: sửa tựa sau hạn. b3: đã rút bài. b4: không
  -- sửa (cron chụp). b5: đổi thứ tự sau hạn. b6: bị cron purge dọn nội dung.
  insert into public.books (author_id, title, slug, published, synopsis) values (v_author, 'Tựa gốc', 'sn-b1-' || v_author, true, 'Tóm tắt gốc') returning id into v_b1;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b1, 'C1', 'một hai ba', 1, true) returning id into v_c1;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b1, 'C2', 'bốn năm', 2, true) returning id into v_c2;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b1, 'Nháp', 'nháp', 3, false) returning id into v_c3;
  insert into public.books (author_id, title, slug, published) values (v_author, 'Sách 2', 'sn-b2-' || v_author, true) returning id into v_b2;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b2, 'C1', 'x', 1, true);
  insert into public.books (author_id, title, slug, published) values (v_other, 'Sách 3', 'sn-b3-' || v_other, true) returning id into v_b3;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b3, 'C1', 'z', 1, true);
  insert into public.books (author_id, title, slug, published) values (v_author, 'Sách 4', 'sn-b4-' || v_author, true) returning id into v_b4;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b4, 'C1', 'nguyên bản', 1, true) returning id into v_c4;
  insert into public.books (author_id, title, slug, published) values (v_author, 'Sách 5', 'sn-b5-' || v_author, true) returning id into v_b5;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b5, 'A', 'a', 1, true) returning id into v_c5a;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b5, 'B', 'b', 2, true) returning id into v_c5b;
  insert into public.books (author_id, title, slug, published) values (v_author, 'Sách 6', 'sn-b6-' || v_author, true) returning id into v_b6;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_b6, 'C1', 'vi phạm', 1, true) returning id into v_c6;

  select id into v_s1 from public.submit_contest_entry(v_contest, v_b1, v_author, '1', '[]');
  select id into v_s2 from public.submit_contest_entry(v_contest, v_b2, v_author, '1', '[]');
  select id into v_s3 from public.submit_contest_entry(v_contest, v_b3, v_other, '1', '[]');
  select id into v_s4 from public.submit_contest_entry(v_contest, v_b4, v_author, '1', '[]');
  select id into v_s5 from public.submit_contest_entry(v_contest, v_b5, v_author, '1', '[]');
  select id into v_s6 from public.submit_contest_entry(v_contest, v_b6, v_author, '1', '[]');
  perform public.set_contest_submission_status(v_s3, 'withdrawn', v_other, 'author', null);

  -- ===== 1. Trước hạn: sửa không chụp =====
  update public.chapters set content = 'một hai ba bốn' where id = v_c1;
  select count(*) into v_count from public.contest_submission_snapshots where contest_id = v_contest;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS trước hạn: sửa chương không tạo bản chụp' else 'FAIL chụp trước hạn' end);

  -- ===== 2. Quá hạn, cron chưa chạy =====
  update public.contests set submission_end = now() - interval '1 minute' where id = v_contest;

  -- Tác giả sửa chương dưới role authenticated (trigger SECURITY DEFINER vẫn ghi được bản chụp).
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.chapters set content = 'sửa sau hạn' where id = v_c1;
  execute 'reset role';

  select * into v_snap from public.contest_submission_snapshots where submission_id = v_s1;
  select content into v_text from public.contest_submission_snapshot_chapters where snapshot_id = v_snap.id and chapter_id = v_c1;
  v_results := array_append(v_results, case when v_snap.id is not null and v_text = 'một hai ba bốn'
    then 'PASS sửa sau hạn: bản chụp giữ nội dung TRƯỚC khi sửa' else 'FAIL bản chụp chương sửa: ' || coalesce(v_text, 'null') end);
  v_results := array_append(v_results, case when v_snap.chapter_count = 2 and v_snap.total_words = 6 and v_snap.book_title = 'Tựa gốc' and v_snap.synopsis = 'Tóm tắt gốc'
    then 'PASS bản chụp: chỉ chương đã xuất bản, đếm đúng số chữ, giữ tựa/tóm tắt' else 'FAIL bản chụp: ' || v_snap.chapter_count || ' chương, ' || v_snap.total_words || ' chữ' end);
  select content_hash into v_text from public.contest_submission_snapshot_chapters where snapshot_id = v_snap.id and chapter_id = v_c1;
  v_results := array_append(v_results, case when v_text = encode(sha256(convert_to('một hai ba bốn', 'UTF8')), 'hex')
    then 'PASS content_hash = sha256 nội dung đã chụp' else 'FAIL content_hash' end);

  update public.chapters set content = 'sửa lần hai' where id = v_c2;
  select count(*) into v_count from public.contest_submission_snapshots where submission_id = v_s1;
  select content into v_text from public.contest_submission_snapshot_chapters where snapshot_id = v_snap.id and chapter_id = v_c2;
  v_results := array_append(v_results, case when v_count = 1 and v_text = 'bốn năm'
    then 'PASS sửa lần hai: không chụp lại, bản chụp không đổi' else 'FAIL sửa lần hai' end);

  insert into public.chapters (book_id, title, content, order_index, published) values (v_b1, 'C mới', 'chương mới', 4, true);
  select count(*) into v_count from public.contest_submission_snapshot_chapters where snapshot_id = v_snap.id;
  v_results := array_append(v_results, case when v_count = 2 then 'PASS chương thêm sau hạn không vào bản chụp' else 'FAIL chương mới vào bản chụp' end);

  -- Sửa tựa là lần ghi đầu tiên của b2 → bản chụp lấy tựa cũ.
  update public.books set title = 'Sách 2 (đổi tên)' where id = v_b2;
  select book_title into v_text from public.contest_submission_snapshots where submission_id = v_s2;
  v_results := array_append(v_results, case when v_text = 'Sách 2' then 'PASS sửa tựa sau hạn: bản chụp giữ tựa cũ' else 'FAIL tựa trong bản chụp: ' || coalesce(v_text, 'null') end);

  -- Đổi thứ tự sau hạn → bản chụp giữ thứ tự cũ.
  update public.chapters set order_index = 9 where id = v_c5a;
  select sc.order_index into v_int from public.contest_submission_snapshot_chapters sc
  join public.contest_submission_snapshots x on x.id = sc.snapshot_id
  where x.submission_id = v_s5 and sc.chapter_id = v_c5a;
  v_results := array_append(v_results, case when v_int = 1 then 'PASS đổi thứ tự sau hạn: bản chụp giữ thứ tự cũ' else 'FAIL thứ tự: ' || coalesce(v_int::text, 'null') end);

  -- Bài đã rút: sửa sau hạn không chụp.
  update public.chapters set content = 'z2' where book_id = v_b3;
  select count(*) into v_count from public.contest_submission_snapshots where submission_id = v_s3;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS bài đã rút không có bản chụp' else 'FAIL chụp bài đã rút' end);

  -- Thao tác dọn nội dung (cron purge) không tạo bản chụp.
  update public.chapters set content = '', content_purged_at = now() where id = v_c6;
  select count(*) into v_count from public.contest_submission_snapshots where submission_id = v_s6;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS dọn nội dung không tạo bản chụp' else 'FAIL purge tạo bản chụp' end);

  -- ===== 3. Cron / admin đóng nhận bài =====
  select public.snapshot_contest_submissions(v_contest) into v_count;
  select content into v_text from public.contest_submission_snapshot_chapters sc
  join public.contest_submission_snapshots x on x.id = sc.snapshot_id where x.submission_id = v_s4;
  v_results := array_append(v_results, case when v_count = 2 and v_text = 'nguyên bản'
    then 'PASS cron chụp các bài chưa bị sửa (trạng thái hiện tại)' else 'FAIL cron chụp: ' || v_count end);
  select public.snapshot_contest_submissions(v_contest) into v_count;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS chạy cron lần hai không chụp trùng' else 'FAIL chụp trùng: ' || v_count end);
  select count(*) into v_count from public.contest_submission_snapshots where contest_id = v_contest;
  v_results := array_append(v_results, case when v_count = 5 then 'PASS mỗi bài đang dự thi đúng 1 bản chụp' else 'FAIL số bản chụp: ' || v_count end);

  -- ===== 4. Dọn bản chụp cùng nội dung đã gỡ =====
  select public.purge_contest_snapshots(array[v_b1], array[v_c4]) into v_count;
  select count(*) into v_int from public.contest_submission_snapshot_chapters sc
  join public.contest_submission_snapshots x on x.id = sc.snapshot_id
  where x.submission_id in (v_s1, v_s4) and sc.content = '' and sc.content_purged_at is not null;
  select synopsis into v_text from public.contest_submission_snapshots where submission_id = v_s1;
  v_results := array_append(v_results, case when v_int = 3 and v_text is null
    then 'PASS purge dọn nội dung bản chụp (theo sách và theo chương)' else 'FAIL purge bản chụp: ' || v_int end);

  -- ===== 5. Quyền =====
  execute 'set local role authenticated';
  begin
    select count(*) into v_count from public.contest_submission_snapshots;
    v_results := array_append(v_results, 'FAIL authenticated đọc được bản chụp');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS bản chụp chỉ dành cho service-role' else 'FAIL quyền đọc: ' || sqlerrm end);
  end;
  begin
    perform public.snapshot_contest_submissions(v_contest);
    v_results := array_append(v_results, 'FAIL authenticated gọi thẳng RPC chụp');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS RPC chụp chỉ dành cho service-role' else 'FAIL grant RPC: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
