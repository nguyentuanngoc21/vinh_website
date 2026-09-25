-- Test cho migrations/20260925_add_chapter_delete_and_reorder.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. Không chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Toàn bộ test nằm trong MỘT khối DO và luôn kết thúc bằng RAISE EXCEPTION có
-- chủ đích, nên người dùng/truyện giả không bao giờ được lưu. Các thao tác của
-- tác giả chạy dưới role `authenticated` với request.jwt.claims giả, để policy
-- RLS và auth.uid() áp dụng thật.
--
-- Kết quả hiện ở dòng "Error: ... KẾT QUẢ TEST ...". Đạt khi dòng tổng ghi
-- "11 PASS, 0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_book uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_pub uuid; v_removed uuid; v_last uuid;
  v_count integer;
  v_order uuid[];
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_author, 'author-' || v_author || '@test.invalid'), (v_other, 'other-' || v_other || '@test.invalid');
  insert into public.profiles (id, username, nickname)
  values (v_author, 'ta' || left(replace(v_author::text, '-', ''), 12), 'Author'),
         (v_other, 'to' || left(replace(v_other::text, '-', ''), 12), 'Other')
  on conflict (id) do nothing;

  insert into public.books (author_id, title, slug) values (v_author, 'Test', 'test-' || v_author)
  returning id into v_book;
  insert into public.chapters (book_id, title, content, order_index) values (v_book, 'C1', '', 1) returning id into v_c1;
  insert into public.chapters (book_id, title, content, order_index) values (v_book, 'C2', '', 2) returning id into v_c2;
  insert into public.chapters (book_id, title, content, order_index) values (v_book, 'C3', '', 3) returning id into v_c3;
  insert into public.chapters (book_id, title, content, order_index, published) values (v_book, 'Pub', '', 4, true) returning id into v_pub;
  insert into public.chapters (book_id, title, content, order_index, removed_at) values (v_book, 'Rm', '', 5, now()) returning id into v_removed;
  insert into public.chapters (book_id, title, content, order_index, is_last_chapter) values (v_book, 'Last', '', 6, true) returning id into v_last;

  -- ===== Người KHÁC =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  delete from public.chapters where id = v_c1;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS người khác không xoá được chương nháp' else 'FAIL người khác xoá được chương nháp' end);

  begin
    perform public.reorder_book_chapters(v_book, array[v_c2, v_c1, v_c3, v_pub, v_removed, v_last]);
    v_results := array_append(v_results, 'FAIL người khác sắp xếp được');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like '%not owned by caller%' then 'PASS người khác không sắp xếp được' else 'FAIL người khác sắp xếp: ' || sqlerrm end);
  end;

  -- ===== Tác giả =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);

  delete from public.chapters where id = v_pub;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS không xoá được chương đang xuất bản' else 'FAIL xoá được chương đang xuất bản' end);

  delete from public.chapters where id = v_removed;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS không xoá được chương bị gỡ' else 'FAIL xoá được chương bị gỡ' end);

  delete from public.chapters where id = v_last;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS không xoá được chương cuối' else 'FAIL xoá được chương cuối' end);

  begin
    perform public.reorder_book_chapters(v_book, array[v_c2, v_c1, v_pub, v_removed, v_last]);
    v_results := array_append(v_results, 'FAIL thiếu chương vẫn sắp xếp được');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Chapter list must contain%' then 'PASS thiếu chương bị chặn' else 'FAIL thiếu chương: ' || sqlerrm end);
  end;

  begin
    perform public.reorder_book_chapters(v_book, array[v_c2, v_c2, v_c3, v_pub, v_removed, v_last]);
    v_results := array_append(v_results, 'FAIL trùng chương vẫn sắp xếp được');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Chapter list must contain%' then 'PASS trùng chương bị chặn' else 'FAIL trùng chương: ' || sqlerrm end);
  end;

  begin
    perform public.reorder_book_chapters(v_book, array[v_c2, v_c1, v_c3, v_pub, v_last, v_removed]);
    v_results := array_append(v_results, 'FAIL chương cuối không đứng cuối vẫn được');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'The last chapter must stay last%' then 'PASS chương cuối phải đứng cuối' else 'FAIL chương cuối: ' || sqlerrm end);
  end;

  perform public.reorder_book_chapters(v_book, array[v_c3, v_c1, v_c2, v_removed, v_pub, v_last]);
  select array_agg(id order by order_index) into v_order from public.chapters where book_id = v_book;
  v_results := array_append(v_results, case when v_order = array[v_c3, v_c1, v_c2, v_removed, v_pub, v_last]
    then 'PASS tác giả sắp xếp được' else 'FAIL tác giả sắp xếp: thứ tự sai' end);

  delete from public.chapters where id = v_c1;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 1 then 'PASS tác giả xoá được chương nháp' else 'FAIL tác giả không xoá được chương nháp' end);

  -- Sách đã xoá mềm: không xoá chương nào được nữa.
  execute 'reset role';
  update public.books set deleted_at = now() where id = v_book;
  execute 'set local role authenticated';
  delete from public.chapters where id = v_c2;
  get diagnostics v_count = row_count;
  v_results := array_append(v_results, case when v_count = 0 then 'PASS sách đã xoá: không xoá chương' else 'FAIL sách đã xoá vẫn xoá được chương' end);

  execute 'reset role';
  select count(*) filter (where r like 'PASS%'), count(*) into v_pass, v_total from unnest(v_results) as r;
  raise exception E'KẾT QUẢ TEST (đã hoàn tác mọi dữ liệu giả) — % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end;
$$;
