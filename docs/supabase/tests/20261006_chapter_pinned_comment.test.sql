-- Test cho migrations/20261006_chapter_pinned_comment.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. KHÔNG chạy trên production.
--
-- 1 tác giả, 1 người đọc, 1 chương. Kiểm: người bình luận (authenticated) KHÔNG tự
-- ghim được qua REST (cả INSERT lẫn UPDATE pinned_at), vẫn sửa nội dung bình luận
-- của mình được; service_role ghim được; mỗi chương tối đa 1 bình luận ghim; xoá
-- bình luận ghim thì không còn ghim.
-- Một khối DO, kết thúc bằng RAISE EXCEPTION có chủ đích → không lưu dữ liệu giả.
-- Đạt khi dòng tổng ghi "0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_author uuid := gen_random_uuid();
  v_reader uuid := gen_random_uuid();
  v_book uuid;
  v_chapter uuid;
  v_c1 uuid;
  v_c2 uuid;
  v_n integer;
  v_state text;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email, created_at)
  select u, 'pin-' || left(u::text, 8) || '-' || u || '@test.invalid', now() from unnest(array[v_author, v_reader]) u;
  insert into public.profiles (id, username, nickname)
  select u, 'pin' || left(replace(u::text, '-', ''), 12), 'U' from unnest(array[v_author, v_reader]) u
  on conflict (id) do nothing;

  insert into public.books (author_id, title, slug, published) values (v_author, 'Thử', 'pin-' || v_author, true)
  returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index, published)
  values (v_book, 'C1', 'nội dung', 1, true) returning id into v_chapter;

  insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content)
  values (v_reader, v_chapter, null, 0, 1, 'bình luận 1') returning id into v_c1;
  insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content)
  values (v_reader, v_chapter, null, 0, 1, 'bình luận 2') returning id into v_c2;

  -- ===== 1. Người đọc tự UPDATE pinned_at bình luận của mình → bị chặn =====
  v_state := null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_reader, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.anchored_comments set pinned_at = now() where id = v_c1;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  v_results := array_append(v_results, case when v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 1. authenticated UPDATE pinned_at bị chặn (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 2. Người đọc INSERT kèm pinned_at → bị chặn =====
  v_state := null;
  execute 'set local role authenticated';
  begin
    insert into public.anchored_comments (user_id, chapter_id, paragraph_index, char_start, char_end, content, pinned_at)
    values (v_reader, v_chapter, null, 0, 1, 'tự ghim', now());
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  v_results := array_append(v_results, case when v_state = '42501'
    then 'PASS' else 'FAIL' end || ' 2. authenticated INSERT kèm pinned_at bị chặn (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 3. Người đọc vẫn sửa nội dung bình luận của mình =====
  v_state := null;
  execute 'set local role authenticated';
  begin
    update public.anchored_comments set content = 'đã sửa' where id = v_c1;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  select count(*) into v_n from public.anchored_comments where id = v_c1 and content = 'đã sửa';
  v_results := array_append(v_results, case when v_state is null and v_n = 1
    then 'PASS' else 'FAIL' end || ' 3. authenticated vẫn sửa content của mình (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 4. service_role ghim được =====
  v_state := null;
  execute 'set local role service_role';
  begin
    update public.anchored_comments set pinned_at = now() where id = v_c1;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  select count(*) into v_n from public.anchored_comments where id = v_c1 and pinned_at is not null;
  v_results := array_append(v_results, case when v_state is null and v_n = 1
    then 'PASS' else 'FAIL' end || ' 4. service_role ghim được (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 5. Ghim bình luận thứ 2 cùng chương khi chưa bỏ ghim cũ → vi phạm unique =====
  v_state := null;
  execute 'set local role service_role';
  begin
    update public.anchored_comments set pinned_at = now() where id = v_c2;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  v_results := array_append(v_results, case when v_state = '23505'
    then 'PASS' else 'FAIL' end || ' 5. tối đa 1 bình luận ghim/chương (sqlstate=' || coalesce(v_state, 'null') || ')');

  -- ===== 6. Xoá bình luận ghim → chương không còn ghim =====
  delete from public.anchored_comments where id = v_c1;
  select count(*) into v_n from public.anchored_comments where chapter_id = v_chapter and pinned_at is not null;
  v_results := array_append(v_results, case when v_n = 0
    then 'PASS' else 'FAIL' end || ' 6. xoá bình luận ghim thì hết ghim');

  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) r;
  raise exception E'%\n=== % / % PASS, % FAIL (rollback có chủ đích) ===',
    array_to_string(v_results, E'\n'), v_pass, v_total, v_total - v_pass;
end;
$$;
