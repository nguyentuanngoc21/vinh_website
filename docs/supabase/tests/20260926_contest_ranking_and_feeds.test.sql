-- Test cho migrations/20260926_add_contest_ranking_and_feeds.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration (và
-- migration core 20260926_add_contest_engine_core.sql). Không chạy trên
-- production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu
-- giả. Phiếu được chèn thẳng (bỏ qua cast_contest_vote) vì ở đây chỉ kiểm
-- cách đếm/xếp hạng; luật bình chọn đã có test riêng.
--
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_authors uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_voters uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_admin uuid := gen_random_uuid();
  v_rules jsonb := '{"allow_resubmit_after_withdraw": false, "require_exclusive": false, "allow_multi_contest": true, "max_entries_per_author": null}';
  v_vote_rules jsonb := '{"min_account_age_days": 7, "require_completed_chapter": true}';
  v_contest uuid;
  v_done uuid;
  v_books uuid[] := '{}';
  v_subs uuid[] := '{}';
  v_chapters uuid[] := '{}';
  v_id uuid;
  v_i integer;
  v_ids uuid[];
  v_ranks integer[];
  v_values integer[];
  v_tied boolean[];
  v_last record;
  v_count integer;
  v_hint text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
  v_genres text[] := array['Trinh thám', 'Linh dị', 'Trinh thám', 'Kỳ ảo', 'Tình cảm'];
  -- Chữ cái đầu không dấu: thứ tự A–Z không phụ thuộc collation của DB (đ/Đ xếp khác nhau giữa C và en_US).
  v_titles text[] := array['Chuyến Phà Cuối', 'Sóng Đêm', 'Bà Ngoại Và Con Cá Voi', 'Muối', 'Cửa Biển'];
begin
  insert into auth.users (id, email)
  select u, 'rf-' || u || '@test.invalid' from unnest(v_authors || v_voters || v_admin) as u;
  insert into public.profiles (id, username, nickname)
  select u, 'rf' || left(replace(u::text, '-', ''), 12), 'RF' from unnest(v_authors || v_voters || v_admin) as u
  on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('rf-' || left(v_admin::text, 8), 'RF', now() - interval '1 day', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_contest;
  perform public.transition_contest_status(v_contest, 'announced', v_admin, null);
  perform public.transition_contest_status(v_contest, 'submission_open', v_admin, null);

  -- Cuộc thi đã kết thúc: bài của nó không được lên feed hub.
  insert into public.contests (slug, title, submission_start, submission_end, eligibility_rules, vote_rules)
  values ('rf-done-' || left(v_admin::text, 8), 'Done', now() - interval '1 day', now() + interval '10 days', v_rules, v_vote_rules)
  returning id into v_done;
  perform public.transition_contest_status(v_done, 'announced', v_admin, null);
  perform public.transition_contest_status(v_done, 'submission_open', v_admin, null);

  for v_i in 1..5 loop
    insert into public.books (author_id, title, slug, published, genre)
    values (v_authors[v_i], v_titles[v_i], 'rf-b' || v_i || '-' || v_authors[v_i], true, v_genres[v_i])
    returning id into v_id;
    v_books := v_books || v_id;
    insert into public.chapters (book_id, title, content, order_index, published)
    values (v_id, 'C1', 'x', 1, true) returning id into v_id;
    v_chapters := v_chapters || v_id;
    select s.id into v_id from public.submit_contest_entry(v_contest, v_books[v_i], v_authors[v_i], '1', '[]') s;
    v_subs := v_subs || v_id;
    -- submitted_at tăng dần theo thứ tự nộp (now() cố định trong khối DO).
    update public.contest_submissions set submitted_at = now() - make_interval(hours => 10 - v_i) where id = v_id;
  end loop;

  -- Bài của cuộc thi đã kết thúc (tác giả 1, sách 1 — cho đa cuộc thi).
  perform public.submit_contest_entry(v_done, v_books[1], v_authors[1], '1', '[]');
  update public.contests set submission_end = now() - interval '1 minute' where id = v_done;
  perform public.transition_contest_status(v_done, 'submission_closed', v_admin, null);
  perform public.transition_contest_status(v_done, 'results', v_admin, null);

  -- Phiếu: bài 1 = 3, bài 2 = 1, bài 3 = 1, bài 4 = 0, bài 5 = 0.
  insert into public.contest_votes (contest_id, submission_id, user_id)
  select v_contest, v_subs[1], u from unnest(v_voters) as u;
  insert into public.contest_votes (contest_id, submission_id, user_id) values
    (v_contest, v_subs[2], v_voters[1]), (v_contest, v_subs[3], v_voters[2]);

  -- Bài 5 bị loại → không lên BXH/feed.
  perform public.set_contest_submission_status(v_subs[5], 'disqualified', v_admin, 'admin', 'test');

  -- ===== 1. Xếp hạng =====
  select array_agg(submission_id order by ord), array_agg(rank order by ord), array_agg(value order by ord), array_agg(tied order by ord)
  into v_ids, v_ranks, v_values, v_tied
  from (select r.*, row_number() over () as ord from public.get_contest_ranking(v_contest, 10) r) x;

  v_results := array_append(v_results, case when v_ids = array[v_subs[1], v_subs[2], v_subs[3], v_subs[4]]
    then 'PASS thứ tự BXH: phiếu giảm dần, đồng phiếu thì nộp sớm hơn' else 'FAIL thứ tự BXH' end);
  v_results := array_append(v_results, case when v_ranks = array[1, 2, 2, 4] and v_values = array[3, 1, 1, 0]
    then 'PASS đồng hạng kiểu rank(): 1, 2, 2, 4' else 'FAIL hạng: ' || v_ranks::text || ' / ' || v_values::text end);
  v_results := array_append(v_results, case when v_tied = array[false, true, true, false]
    then 'PASS cờ đồng hạng' else 'FAIL cờ đồng hạng: ' || v_tied::text end);
  v_results := array_append(v_results, case when not (v_subs[5] = any(v_ids))
    then 'PASS bài bị loại không lên BXH' else 'FAIL bài bị loại lên BXH' end);

  -- Trang 2 (sau 2 dòng đầu) giữ hạng TOÀN CỤC.
  select r.* into v_last from public.get_contest_ranking(v_contest, 2) r offset 1 limit 1;
  select array_agg(submission_id), array_agg(rank) into v_ids, v_ranks
  from public.get_contest_ranking(v_contest, 10, v_last.rank, v_last.submitted_at, v_last.submission_id);
  v_results := array_append(v_results, case when v_ids = array[v_subs[3], v_subs[4]] and v_ranks = array[2, 4]
    then 'PASS phân trang keyset giữ hạng toàn cục' else 'FAIL phân trang BXH: ' || coalesce(v_ranks::text, 'null') end);

  -- Sách bị gỡ → rời BXH.
  update public.books set deleted_at = now() where id = v_books[1];
  select count(*) into v_count from public.get_contest_ranking(v_contest, 10) where submission_id = v_subs[1];
  v_results := array_append(v_results, case when v_count = 0 then 'PASS sách bị gỡ rời BXH' else 'FAIL sách bị gỡ vẫn trên BXH' end);
  update public.books set deleted_at = null where id = v_books[1];

  -- ===== 2. Feed =====
  select array_agg(submission_id) into v_ids from public.get_contest_entries(v_contest, 'new', null, null, 10);
  v_results := array_append(v_results, case when v_ids = array[v_subs[4], v_subs[3], v_subs[2], v_subs[1]]
    then 'PASS feed Mới tham gia: mới nhất trước, bỏ bài bị loại' else 'FAIL feed new' end);

  select * into v_last from public.get_contest_entries(v_contest, 'new', null, null, 2) offset 1 limit 1;
  select array_agg(submission_id) into v_ids
  from public.get_contest_entries(v_contest, 'new', null, null, 10, v_last.sort_key, v_last.submission_id);
  v_results := array_append(v_results, case when v_ids = array[v_subs[2], v_subs[1]]
    then 'PASS phân trang feed new' else 'FAIL phân trang feed new' end);

  select array_agg(submission_id) into v_ids from public.get_contest_entries(v_contest, 'az', null, null, 10);
  v_results := array_append(v_results, case when v_ids = array[v_subs[3], v_subs[1], v_subs[4], v_subs[2]]
    then 'PASS sắp A–Z theo tựa' else 'FAIL sắp A–Z' end);

  -- Discover: 2 trang ghép lại = đủ 4 bài, không lặp; cùng seed → cùng thứ tự.
  select array_agg(submission_id) into v_ids from public.get_contest_entries(v_contest, 'discover', 'seed-a', null, 10);
  select * into v_last from public.get_contest_entries(v_contest, 'discover', 'seed-a', null, 2) offset 1 limit 1;
  select count(*) into v_count from (
    select submission_id from public.get_contest_entries(v_contest, 'discover', 'seed-a', null, 2)
    union all
    select submission_id from public.get_contest_entries(v_contest, 'discover', 'seed-a', null, 10, v_last.sort_key, v_last.submission_id)
  ) x;
  v_results := array_append(v_results, case when array_length(v_ids, 1) = 4 and v_count = 4
    and (select count(distinct x) from unnest(v_ids) x) = 4
    and v_ids = (select array_agg(submission_id) from public.get_contest_entries(v_contest, 'discover', 'seed-a', null, 10))
    then 'PASS discover: ổn định theo seed, phân trang không lặp' else 'FAIL discover' end);

  select count(*) into v_count from public.get_contest_entries(v_contest, 'new', null, 'Trinh thám', 10);
  v_results := array_append(v_results, case when v_count = 2 then 'PASS lọc thể loại' else 'FAIL lọc thể loại: ' || v_count end);

  -- Hub (không chỉ định cuộc thi): bài của cuộc thi đã có kết quả không lên.
  select count(*) into v_count from public.get_contest_entries(null, 'new', null, null, 100) e
  where e.contest_id = v_done;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS hub bỏ cuộc thi đã kết thúc' else 'FAIL hub có bài của cuộc thi đã kết thúc' end);
  select count(*) into v_count from public.get_contest_entries(null, 'new', null, null, 100) e
  where e.contest_id = v_contest;
  v_results := array_append(v_results, case when v_count = 4 then 'PASS hub gồm bài của cuộc thi đang diễn ra' else 'FAIL hub: ' || v_count end);

  -- Trạng thái của người xem theo lô.
  insert into public.reading_history (user_id, book_id, chapter_id) values (v_voters[3], v_books[2], v_chapters[2]);
  select count(*) filter (where viewer_has_voted), count(*) filter (where viewer_completed_chapter) into v_i, v_count
  from public.get_contest_entries(v_contest, 'new', null, null, 10, null, null, v_voters[3]);
  v_results := array_append(v_results, case when v_i = 1 and v_count = 1
    then 'PASS trạng thái bình chọn của người xem (đã bình chọn / đã đọc)' else 'FAIL viewer flags: ' || v_i || '/' || v_count end);

  begin
    perform public.get_contest_entries(v_contest, 'hot', null, null, 10);
    v_results := array_append(v_results, 'FAIL sort lạ được chấp nhận');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_sort' then 'PASS từ chối sort lạ' else 'FAIL invalid_sort: ' || sqlerrm end);
  end;

  begin
    perform public.get_contest_entries(v_contest, 'new', null, null, 10, 'không-phải-thời-gian', v_subs[1]);
    v_results := array_append(v_results, 'FAIL cursor hỏng được chấp nhận');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    v_results := array_append(v_results, case when v_hint = 'invalid_cursor' then 'PASS từ chối cursor hỏng' else 'FAIL invalid_cursor: ' || sqlerrm end);
  end;

  -- ===== 3. Tóm tắt =====
  select entry_count, author_count into v_i, v_count from public.get_contest_summaries(array[v_contest]);
  v_results := array_append(v_results, case when v_i = 4 and v_count = 4
    then 'PASS đếm bài hợp lệ / tác giả' else 'FAIL summaries: ' || v_i || '/' || v_count end);

  -- ===== 4. Quyền =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_voters[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.get_contest_ranking(v_contest, 10);
    v_results := array_append(v_results, 'FAIL authenticated gọi thẳng get_contest_ranking');
  exception when others then
    v_results := array_append(v_results, case when sqlstate = '42501' then 'PASS hàm xếp hạng chỉ dành cho service_role' else 'FAIL grant ranking: ' || sqlerrm end);
  end;
  execute 'reset role';

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
