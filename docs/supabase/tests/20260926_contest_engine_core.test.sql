-- Test cho migrations/20260926_add_contest_engine_core.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. Không chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Toàn bộ test nằm trong MỘT khối DO và luôn kết thúc bằng RAISE EXCEPTION có
-- chủ đích, nên dữ liệu giả không bao giờ được lưu (SQL Editor của Supabase
-- không giữ BEGIN/ROLLBACK). Thao tác của tác giả / người đọc chạy dưới role
-- `authenticated` hoặc `anon` với request.jwt.claims giả để RLS, GRANT và
-- trigger áp dụng thật; thao tác "server" (RPC service-role) chạy bằng role
-- mặc định của SQL Editor.
--
-- Lưu ý: now() cố định trong cả khối (thời điểm bắt đầu transaction) — các
-- mốc thời gian dưới đây đều đặt tương đối với now().
--
-- Kết quả hiện ở dòng "Error: ... KẾT QUẢ TEST ...". Đạt khi dòng tổng ghi
-- "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_voter_old uuid := gen_random_uuid();
  v_voter_new uuid := gen_random_uuid();
  v_book1 uuid; v_book2 uuid; v_book3 uuid; v_book4 uuid; v_book5 uuid;
  v_ch1 uuid; v_ch2 uuid; v_ch4 uuid;
  v_a uuid; v_b uuid; v_c uuid; v_draft uuid;
  v_sub1 uuid; v_sub1b uuid; v_sub4 uuid; v_sub5 uuid;
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_rules jsonb;
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_count integer;
  v_int integer;
  v_uuid uuid;
  v_bool boolean;
  v_hint text;
  v_state text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  -- ===== Dữ liệu giả =====
  insert into auth.users (id, email, created_at) values
    (v_author, 'author-' || v_author || '@test.invalid', now() - interval '60 days'),
    (v_other, 'other-' || v_other || '@test.invalid', now() - interval '60 days'),
    (v_admin, 'admin-' || v_admin || '@test.invalid', now() - interval '60 days'),
    (v_voter_old, 'vold-' || v_voter_old || '@test.invalid', now() - interval '30 days'),
    (v_voter_new, 'vnew-' || v_voter_new || '@test.invalid', now() - interval '2 days');
  insert into public.profiles (id, username, nickname) values
    (v_author, 'ca' || left(replace(v_author::text, '-', ''), 12), 'Author'),
    (v_other, 'co' || left(replace(v_other::text, '-', ''), 12), 'Other'),
    (v_admin, 'cd' || left(replace(v_admin::text, '-', ''), 12), 'Admin'),
    (v_voter_old, 'cv' || left(replace(v_voter_old::text, '-', ''), 12), 'Voter'),
    (v_voter_new, 'cn' || left(replace(v_voter_new::text, '-', ''), 12), 'New')
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.books (author_id, title, slug, published, is_exclusive)
  values (v_author, 'B1', 'ct-b1-' || v_author, true, true) returning id into v_book1;
  insert into public.books (author_id, title, slug, published, is_exclusive)
  values (v_author, 'B2', 'ct-b2-' || v_author, true, false) returning id into v_book2;
  insert into public.books (author_id, title, slug, published, is_exclusive)
  values (v_author, 'B3', 'ct-b3-' || v_author, true, true) returning id into v_book3;
  insert into public.books (author_id, title, slug, published, is_exclusive)
  values (v_other, 'B4', 'ct-b4-' || v_other, true, true) returning id into v_book4;
  insert into public.books (author_id, title, slug, published, is_exclusive)
  values (v_author, 'B5', 'ct-b5-' || v_author, true, true) returning id into v_book5;

  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book1, 'C1', 'Một hai ba bốn', 1, true) returning id into v_ch1;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book1, 'C2', 'năm sáu', 2, true) returning id into v_ch2;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book1, 'Draft', 'bảy tám chín', 3, false);
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book2, 'C1', 'x', 1, true);
  insert into public.chapters (book_id, title, content, order_index, published, price)
  values (v_book3, 'Paid', 'x', 1, true, 5);
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book4, 'C1', 'x', 1, true) returning id into v_ch4;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book5, 'C1', 'x', 1, true);

  -- ===== 1. contest_word_count khớp countWords() =====
  v_results := array_append(v_results, case when
        public.contest_word_count('a b') = 2
    and public.contest_word_count(E'  xin chào\n\tthế   giới  ') = 4
    and public.contest_word_count('') = 0
    and public.contest_word_count(null) = 0
    and public.contest_word_count('a' || chr(160) || 'b') = 2
    and public.contest_word_count('Tiếng Việt có dấu') = 4
    then 'PASS contest_word_count' else 'FAIL contest_word_count' end);

  -- ===== 2. Vòng đời cuộc thi =====
  begin
    insert into public.contests (slug, title, status, submission_start, submission_end)
    values ('ct-bad-' || left(v_author::text, 8), 'Bad', 'announced', now(), now() + interval '1 day');
    v_results := array_append(v_results, 'FAIL tạo cuộc thi không ở draft vẫn được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_must_start_draft' then 'PASS cuộc thi mới phải là draft' else 'FAIL draft: ' || sqlerrm end);
  end;

  -- A: không yêu cầu độc quyền, cấm đa cuộc thi, tối đa 1 bài/tác giả, cho nộp lại.
  v_rules := '{"allow_resubmit_after_withdraw": true, "require_exclusive": false, "allow_multi_contest": false, "max_entries_per_author": 1}';
  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('ct-a-' || left(v_author::text, 8), 'A', now() - interval '1 day', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_a;
  -- B: yêu cầu độc quyền, cho đa cuộc thi, không giới hạn số bài, không cho nộp lại.
  v_rules := '{"allow_resubmit_after_withdraw": false, "require_exclusive": true, "allow_multi_contest": true, "max_entries_per_author": null}';
  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules, rules_version)
  values ('ct-b-' || left(v_author::text, 8), 'B', now() - interval '1 day', now() + interval '10 days', v_rules, v_vote_rules, '2')
  returning id into v_b;
  -- C: đang "submission_open" nhưng đã quá hạn nộp (cron chưa chạy).
  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('ct-c-' || left(v_author::text, 8), 'C', now() - interval '5 days', now() - interval '1 day', v_rules, v_vote_rules)
  returning id into v_c;
  -- Nháp với cấu hình thiếu khoá.
  insert into public.contests (slug, title, submission_start, submission_end)
  values ('ct-d-' || left(v_author::text, 8), 'D', now(), now() + interval '1 day')
  returning id into v_draft;

  begin
    perform public.transition_contest_status(v_draft, 'announced', v_admin, null);
    v_results := array_append(v_results, 'FAIL rời draft khi cấu hình thiếu khoá');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'config_incomplete' then 'PASS cấu hình thiếu khoá không rời draft được' else 'FAIL config_incomplete: ' || sqlerrm end);
  end;

  begin
    perform public.transition_contest_status(v_a, 'announced', v_other, null);
    v_results := array_append(v_results, 'FAIL người không phải admin chuyển trạng thái được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_admin' then 'PASS chỉ admin chuyển trạng thái' else 'FAIL not_admin: ' || sqlerrm end);
  end;

  perform public.transition_contest_status(v_a, 'announced', v_admin, null);
  perform public.transition_contest_status(v_a, 'submission_open', null, 'cron');
  perform public.transition_contest_status(v_b, 'announced', v_admin, null);
  perform public.transition_contest_status(v_b, 'submission_open', v_admin, null);
  perform public.transition_contest_status(v_c, 'announced', v_admin, null);
  perform public.transition_contest_status(v_c, 'submission_open', v_admin, null);
  select count(*) into v_count from public.contest_status_events where contest_id = v_a;
  v_results := array_append(v_results, case when v_count = 2 then 'PASS ghi nhật ký chuyển trạng thái' else 'FAIL nhật ký trạng thái: ' || v_count end);

  begin
    perform public.transition_contest_status(v_a, 'results', v_admin, null);
    v_results := array_append(v_results, 'FAIL nhảy submission_open → results được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_status_transition' then 'PASS chặn nhảy cóc trạng thái' else 'FAIL nhảy cóc: ' || sqlerrm end);
  end;

  begin
    update public.contests set status = 'announced' where id = v_a;
    v_results := array_append(v_results, 'FAIL lùi trạng thái được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_status_transition' then 'PASS chặn lùi trạng thái (update trực tiếp)' else 'FAIL lùi trạng thái: ' || sqlerrm end);
  end;

  begin
    update public.contests set rules_content = 'đổi thể lệ' where id = v_a;
    v_results := array_append(v_results, 'FAIL sửa thể lệ sau khi công khai');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'rules_locked' then 'PASS khoá thể lệ sau draft (Q5)' else 'FAIL khoá thể lệ: ' || sqlerrm end);
  end;

  begin
    update public.contests set slug = 'ct-renamed-' || left(v_author::text, 8) where id = v_a;
    v_results := array_append(v_results, 'FAIL đổi slug sau khi công khai');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'rules_locked' then 'PASS khoá slug sau draft' else 'FAIL khoá slug: ' || sqlerrm end);
  end;

  begin
    delete from public.contests where id = v_a;
    v_results := array_append(v_results, 'FAIL xoá được cuộc thi đã công khai');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_not_deletable' then 'PASS không xoá cuộc thi đã công khai' else 'FAIL xoá cuộc thi: ' || sqlerrm end);
  end;

  -- ===== 3. Nộp bài =====
  select id into v_sub1 from public.submit_contest_entry(v_a, v_book1, v_author, '1', '[]');
  select * into v_sub from public.contest_submissions where id = v_sub1;
  v_results := array_append(v_results, case when v_sub.status = 'eligible' and v_sub.author_id = v_author
    then 'PASS nộp bài → eligible (D2)' else 'FAIL nộp bài: ' || v_sub.status end);

  begin
    perform public.submit_contest_entry(v_a, v_book1, v_author, '1', '[]');
    v_results := array_append(v_results, 'FAIL nộp trùng được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'already_submitted' then 'PASS chặn nộp trùng' else 'FAIL nộp trùng: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_a, v_book1, v_other, '1', '[]');
    v_results := array_append(v_results, 'FAIL nộp sách không sở hữu');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_owner' then 'PASS chặn nộp sách không sở hữu' else 'FAIL không sở hữu: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_a, v_book2, v_author, '1', '[]');
    v_results := array_append(v_results, 'FAIL vượt giới hạn số bài/tác giả');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'max_entries_reached' then 'PASS giới hạn số bài/tác giả' else 'FAIL max_entries: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_b, v_book1, v_author, '2', '[]');
    v_results := array_append(v_results, 'FAIL sách ở cuộc thi cấm đa cuộc thi vẫn nộp được nơi khác');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'multi_contest_conflict' then 'PASS chặn đa cuộc thi (chiều cuộc thi kia cấm)' else 'FAIL multi_contest: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_b, v_book2, v_author, '2', '[]');
    v_results := array_append(v_results, 'FAIL sách không độc quyền nộp vào cuộc thi yêu cầu độc quyền');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_exclusive' then 'PASS require_exclusive lúc nộp (D11)' else 'FAIL not_exclusive: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_b, v_book3, v_author, '2', '[]');
    v_results := array_append(v_results, 'FAIL sách có chương trả phí vẫn nộp được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'paid_chapters' then 'PASS chặn sách có chương trả phí (D8)' else 'FAIL paid_chapters: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_b, v_book5, v_author, '1', '[]');
    v_results := array_append(v_results, 'FAIL sai phiên bản thể lệ vẫn nộp được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'rules_version_mismatch' then 'PASS kiểm phiên bản thể lệ' else 'FAIL rules_version: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_c, v_book5, v_author, '1', '[]');
    v_results := array_append(v_results, 'FAIL nộp sau hạn khi cron chưa đóng cổng');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'submission_closed' then 'PASS chặn nộp sau hạn dù status còn open' else 'FAIL sau hạn: ' || sqlerrm end);
  end;

  select id into v_sub5 from public.submit_contest_entry(v_b, v_book5, v_author, '2', '[]');
  select id into v_sub4 from public.submit_contest_entry(v_a, v_book4, v_other, '1', '[]');
  v_results := array_append(v_results, case when v_sub5 is not null and v_sub4 is not null
    then 'PASS một tác giả dự nhiều cuộc thi, nhiều tác giả một cuộc thi' else 'FAIL nộp hợp lệ' end);

  -- author_id luôn lấy từ books, kể cả khi ghi thẳng giá trị sai.
  update public.contest_submissions set author_id = v_other where id = v_sub5;
  select author_id into v_uuid from public.contest_submissions where id = v_sub5;
  v_results := array_append(v_results, case when v_uuid = v_author
    then 'PASS author_id do trigger ghi từ books' else 'FAIL author_id bị ghi đè' end);

  -- ===== 4. D8 + D11 dưới role của tác giả =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    update public.chapters set price = 5 where id = v_ch1;
    v_results := array_append(v_results, 'FAIL đặt giá chương của sách đang dự thi');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_hint = 'contest_paid_chapter' and v_state = '23514' then 'PASS chặn đặt giá khi dự thi (D8, update)' else 'FAIL D8 update: ' || sqlerrm end);
  end;

  begin
    insert into public.chapters (book_id, title, content, order_index, audio_price) values (v_book1, 'New', 'x', 9, 3);
    v_results := array_append(v_results, 'FAIL thêm chương có giá audio cho sách đang dự thi');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_paid_chapter' then 'PASS chặn giá audio khi dự thi (D8, insert)' else 'FAIL D8 insert: ' || sqlerrm end);
  end;

  update public.chapters set price = 5 where book_id = v_book2;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS sách không dự thi vẫn đặt giá được' else 'FAIL sách không dự thi không đặt giá được' end);
  update public.chapters set price = 0 where book_id = v_book2;

  begin
    update public.books set is_exclusive = false where id = v_book5;
    v_results := array_append(v_results, 'FAIL tắt độc quyền khi dự thi cuộc thi yêu cầu độc quyền');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_exclusive_lock' then 'PASS chặn tắt độc quyền (D11, tác giả)' else 'FAIL D11 tác giả: ' || sqlerrm end);
  end;

  update public.books set is_exclusive = false where id = v_book1;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS cuộc thi không yêu cầu độc quyền: tắt được' else 'FAIL tắt độc quyền ở cuộc thi không yêu cầu' end);
  update public.books set is_exclusive = true where id = v_book1;

  -- Client không ghi được bảng contest.
  begin
    insert into public.contest_submissions (contest_id, book_id, author_id, rules_version_accepted, rules_accepted_at)
    values (v_b, v_book2, v_author, '2', now());
    v_results := array_append(v_results, 'FAIL authenticated insert được contest_submissions');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '42501' then 'PASS authenticated không insert được bài dự thi' else 'FAIL insert submissions: ' || sqlerrm end);
  end;

  begin
    update public.contests set title = 'hack' where id = v_a;
    v_results := array_append(v_results, 'FAIL authenticated sửa được contests');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '42501' then 'PASS authenticated không sửa được cuộc thi' else 'FAIL update contests: ' || sqlerrm end);
  end;

  begin
    perform public.submit_contest_entry(v_b, v_book2, v_author, '2', '[]');
    v_results := array_append(v_results, 'FAIL authenticated gọi thẳng RPC nộp bài');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '42501' then 'PASS RPC chỉ dành cho service_role' else 'FAIL RPC grant: ' || sqlerrm end);
  end;

  execute 'reset role';

  -- D11 chặn cả service-role / admin.
  begin
    update public.books set is_exclusive = false where id = v_book5;
    v_results := array_append(v_results, 'FAIL service-role tắt được độc quyền');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_exclusive_lock' then 'PASS chặn tắt độc quyền cả với service-role' else 'FAIL D11 service: ' || sqlerrm end);
  end;

  -- Khôi phục chương có giá trong lúc thi bị chặn (D8 bắt removed_at).
  update public.chapters set removed_at = now() where id = v_ch2;
  update public.chapters set price = 7 where id = v_ch2;   -- chương đang bị gỡ: được
  begin
    update public.chapters set removed_at = null where id = v_ch2;
    v_results := array_append(v_results, 'FAIL khôi phục chương có giá khi dự thi');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'contest_paid_chapter' then 'PASS chặn khôi phục chương có giá khi dự thi' else 'FAIL D8 restore: ' || sqlerrm end);
  end;
  update public.chapters set price = 0, removed_at = null where id = v_ch2;

  -- ===== 5. Thống kê sách =====
  select published_chapter_count, total_words into v_count, v_int
  from public.get_books_contest_stats(array[v_book1]);
  v_results := array_append(v_results, case when v_count = 2 and v_int = 6
    then 'PASS thống kê: chỉ chương xuất bản chưa gỡ' else 'FAIL thống kê: ' || v_count || ' chương, ' || v_int || ' chữ' end);
  select priced_chapter_count into v_count from public.get_books_contest_stats(array[v_book3]);
  v_results := array_append(v_results, case when v_count = 1 then 'PASS thống kê: đếm chương có giá' else 'FAIL đếm chương có giá' end);

  -- ===== 6. Rút bài / nộp lại / admin =====
  begin
    perform public.set_contest_submission_status(v_sub1, 'withdrawn', v_other, 'author', null);
    v_results := array_append(v_results, 'FAIL người khác rút bài');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'not_owner' then 'PASS người khác không rút được bài' else 'FAIL rút bài người khác: ' || sqlerrm end);
  end;

  perform public.set_contest_submission_status(v_sub1, 'withdrawn', v_author, 'author', null);
  -- Sau khi rút: hết hạn chế D8.
  update public.chapters set price = 3 where id = v_ch1;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS rút bài → hết hạn chế giá (D8)' else 'FAIL D8 sau khi rút' end);
  update public.chapters set price = 0 where id = v_ch1;

  select id into v_sub1b from public.submit_contest_entry(v_a, v_book1, v_author, '1', '[]');
  select * into v_sub from public.contest_submissions where id = v_sub1b;
  v_results := array_append(v_results, case when v_sub1b = v_sub1 and v_sub.status = 'eligible'
    then 'PASS nộp lại cập nhật cùng dòng (D6)' else 'FAIL nộp lại' end);

  perform public.set_contest_submission_status(v_sub5, 'withdrawn', v_author, 'author', null);
  begin
    perform public.submit_contest_entry(v_b, v_book5, v_author, '2', '[]');
    v_results := array_append(v_results, 'FAIL nộp lại khi cuộc thi không cho phép');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'already_submitted' then 'PASS nộp lại bị chặn khi tắt allow_resubmit' else 'FAIL resubmit tắt: ' || sqlerrm end);
  end;

  begin
    perform public.set_contest_submission_status(v_sub4, 'disqualified', v_admin, 'admin', '  ');
    v_results := array_append(v_results, 'FAIL loại bài không cần lý do');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'reason_required' then 'PASS loại bài bắt buộc lý do' else 'FAIL reason_required: ' || sqlerrm end);
  end;

  perform public.set_contest_submission_status(v_sub4, 'disqualified', v_admin, 'admin', 'Đạo văn');
  begin
    perform public.set_contest_submission_status(v_sub4, 'eligible', v_admin, 'admin', null);
    v_results := array_append(v_results, 'FAIL bài bị loại được khôi phục');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_status_transition' then 'PASS disqualified là trạng thái cuối' else 'FAIL disqualified: ' || sqlerrm end);
  end;

  select count(*) into v_count from public.contest_submission_events where submission_id = v_sub1;
  v_results := array_append(v_results, case when v_count = 3
    then 'PASS nhật ký bài dự thi (nộp, rút, nộp lại)' else 'FAIL nhật ký bài dự thi: ' || v_count end);

  -- ===== 7. RLS đọc công khai =====
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into v_count from public.contests where id = v_draft;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS anon không thấy cuộc thi nháp' else 'FAIL anon thấy cuộc thi nháp' end);
  select count(*) into v_count from public.contest_submissions where id in (v_sub1, v_sub4);
  v_results := array_append(v_results, case when v_count = 1 then 'PASS anon chỉ thấy bài hợp lệ' else 'FAIL anon thấy bài: ' || v_count end);
  execute 'reset role';

  update public.books set deleted_at = now() where id = v_book1;
  execute 'set local role anon';
  select count(*) into v_count from public.contest_submissions where id = v_sub1;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS sách bị gỡ → bài ẩn khỏi công khai' else 'FAIL bài của sách bị gỡ vẫn hiện' end);
  execute 'reset role';
  update public.books set deleted_at = null where id = v_book1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.contest_submissions where id = v_sub5;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS tác giả thấy bài đã rút của mình' else 'FAIL tác giả không thấy bài của mình' end);
  execute 'reset role';

  -- ===== 8. Bình chọn =====
  update public.contests set submission_end = now() - interval '1 minute' where id = v_a;
  begin
    perform public.set_contest_submission_status(v_sub1, 'withdrawn', v_author, 'author', null);
    v_results := array_append(v_results, 'FAIL rút bài sau hạn');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'withdraw_closed' then 'PASS không rút bài sau hạn (D6)' else 'FAIL rút sau hạn: ' || sqlerrm end);
  end;

  perform public.transition_contest_status(v_a, 'submission_closed', v_admin, null);
  begin
    perform public.transition_contest_status(v_a, 'community_voting', v_admin, null);
    v_results := array_append(v_results, 'FAIL mở bình chọn khi chưa có khung giờ');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'voting_window_missing' then 'PASS bắt buộc khung bình chọn' else 'FAIL voting_window: ' || sqlerrm end);
  end;

  update public.contests set voting_start = now() - interval '1 hour', voting_end = now() + interval '1 day' where id = v_a;
  perform public.transition_contest_status(v_a, 'community_voting', v_admin, null);

  begin
    update public.contests set scoring_config = '{"formula_id": "x"}' where id = v_a;
    v_results := array_append(v_results, 'FAIL sửa công thức sau khi mở bình chọn');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'scoring_locked' then 'PASS khoá công thức từ lúc mở bình chọn' else 'FAIL scoring_locked: ' || sqlerrm end);
  end;

  begin
    perform public.cast_contest_vote(v_author, v_sub1);
    v_results := array_append(v_results, 'FAIL tự bình chọn bài mình');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'own_entry' then 'PASS chặn tự bình chọn' else 'FAIL own_entry: ' || sqlerrm end);
  end;

  begin
    perform public.cast_contest_vote(v_voter_new, v_sub1);
    v_results := array_append(v_results, 'FAIL tài khoản < 7 ngày bình chọn được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'account_too_new' then 'PASS chặn tài khoản mới (D5)' else 'FAIL account_too_new: ' || sqlerrm end);
  end;

  begin
    perform public.cast_contest_vote(v_voter_old, v_sub1);
    v_results := array_append(v_results, 'FAIL chưa đọc hết chương nào vẫn bình chọn được');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'no_completed_chapter' then 'PASS bắt buộc đã đọc hết ≥ 1 chương (D5)' else 'FAIL no_completed_chapter: ' || sqlerrm end);
  end;

  -- Đọc chương nháp không tính.
  insert into public.reading_history (user_id, book_id, chapter_id)
  select v_voter_old, v_book1, id from public.chapters where book_id = v_book1 and not published;
  begin
    perform public.cast_contest_vote(v_voter_old, v_sub1);
    v_results := array_append(v_results, 'FAIL đọc chương nháp vẫn tính');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'no_completed_chapter' then 'PASS chương nháp không tính là đã đọc' else 'FAIL chương nháp: ' || sqlerrm end);
  end;

  insert into public.reading_history (user_id, book_id, chapter_id) values (v_voter_old, v_book1, v_ch1);
  perform public.cast_contest_vote(v_voter_old, v_sub1);
  v_results := array_append(v_results, 'PASS bình chọn hợp lệ');

  begin
    perform public.cast_contest_vote(v_voter_old, v_sub1);
    v_results := array_append(v_results, 'FAIL bình chọn trùng');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'already_voted' then 'PASS 1 phiếu / bài / tài khoản' else 'FAIL already_voted: ' || sqlerrm end);
  end;

  insert into public.reading_history (user_id, book_id, chapter_id) values (v_voter_old, v_book4, v_ch4);
  begin
    perform public.cast_contest_vote(v_voter_old, v_sub4);
    v_results := array_append(v_results, 'FAIL bình chọn bài bị loại');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'entry_not_votable' then 'PASS không bình chọn bài bị loại' else 'FAIL entry_not_votable: ' || sqlerrm end);
  end;

  select public.retract_contest_vote(v_voter_old, v_sub1) into v_bool;
  select count(*) into v_count from public.contest_votes where submission_id = v_sub1;
  v_results := array_append(v_results, case when v_bool and v_count = 0 then 'PASS bỏ phiếu trong khung bình chọn' else 'FAIL bỏ phiếu' end);
  perform public.cast_contest_vote(v_voter_old, v_sub1);

  begin
    insert into public.contest_votes (contest_id, submission_id, user_id) values (v_b, v_sub1, v_voter_new);
    v_results := array_append(v_results, 'FAIL phiếu lệch cuộc thi của bài');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '23503' then 'PASS FK tổng hợp chặn phiếu lệch cuộc thi' else 'FAIL FK vote: ' || sqlerrm end);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.contest_votes where submission_id = v_sub1;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS không thấy phiếu của người khác' else 'FAIL lộ phiếu người khác' end);
  execute 'reset role';

  -- ===== 9. Giải thưởng, kết quả, lưu trữ =====
  begin
    insert into public.contest_awards (contest_id, submission_id, award_code, award_name, created_by)
    values (v_b, v_sub1, 'first_prize', 'Giải Nhất', v_admin);
    v_results := array_append(v_results, 'FAIL giải lệch cuộc thi của bài');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '23503' then 'PASS FK tổng hợp chặn giải lệch cuộc thi' else 'FAIL FK award: ' || sqlerrm end);
  end;

  insert into public.contest_awards (contest_id, submission_id, award_code, award_name, prize_vnd, token_vnd_rate, prize_tokens, created_by)
  values (v_a, v_sub1, 'first_prize', 'Giải Nhất', 20000000, 200, 100000, v_admin);

  execute 'set local role anon';
  select count(*) into v_count from public.contest_award_details where submission_id = v_sub1;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS giải ẩn trước khi công bố (cả qua view)' else 'FAIL lộ giải trước khi công bố' end);
  execute 'reset role';

  perform public.transition_contest_status(v_a, 'results', v_admin, null);
  select * into v_contest from public.contests where id = v_a;
  execute 'set local role anon';
  select count(*) into v_count from public.contest_award_details
  where submission_id = v_sub1 and book_id = v_book1 and author_id = v_author and contest_slug = v_contest.slug;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS giải công khai sau khi công bố, đủ provenance' else 'FAIL giải sau công bố: ' || v_count end);
  execute 'reset role';
  v_results := array_append(v_results, case when v_contest.results_published_at is not null then 'PASS results đặt results_published_at' else 'FAIL results_published_at' end);

  -- Sau khi có kết quả: hết hạn chế D8 cho sách của cuộc thi A.
  update public.chapters set price = 2 where id = v_ch1;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS công bố kết quả → hết hạn chế giá (D8)' else 'FAIL D8 sau kết quả' end);

  perform public.transition_contest_status(v_a, 'archived', v_admin, null);
  select * into v_contest from public.contests where id = v_a;
  select count(*) into v_count from public.contest_submissions where contest_id = v_a;
  v_results := array_append(v_results, case when v_contest.archived_at is not null and v_count = 2
    then 'PASS lưu trữ giữ nguyên bài dự thi' else 'FAIL lưu trữ' end);

  begin
    delete from public.contest_submissions where id = v_sub1;
    v_results := array_append(v_results, 'FAIL xoá được bài đã có giải');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '23503' then 'PASS không xoá bài đã có giải/phiếu' else 'FAIL xoá bài có giải: ' || sqlerrm end);
  end;

  begin
    update public.contest_awards set revoked_at = now() where submission_id = v_sub1;
    v_results := array_append(v_results, 'FAIL thu hồi giải không cần lý do');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_results := array_append(v_results, case when v_state = '23514' then 'PASS thu hồi giải bắt buộc lý do' else 'FAIL revoked_reason: ' || sqlerrm end);
  end;

  -- Xoá cuộc thi nháp thì được.
  delete from public.contests where id = v_draft;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS xoá được cuộc thi nháp' else 'FAIL không xoá được nháp' end);

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
