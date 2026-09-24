-- Test cho migrations/20260924_enforce_order_payment_amounts.sql.
-- Chạy trong SQL Editor của dev/staging SAU KHI đã chạy migration. Không chạy
-- trên production (docs/DEV_WORKFLOW.md, Luồng A bước 2).
--
-- Toàn bộ test nằm trong MỘT khối DO và luôn kết thúc bằng RAISE EXCEPTION có
-- chủ đích: khối DO lỗi thì Postgres hoàn tác mọi thứ bên trong, nên người
-- dùng/đơn hàng giả không bao giờ được lưu — kể cả khi SQL Editor không giữ
-- BEGIN/ROLLBACK (bản trước dùng bảng tạm + rollback đã lỗi vì lý do đó).
--
-- Kết quả hiện ở dòng "Error: ... KẾT QUẢ TEST ...". Đạt khi dòng tổng ghi
-- "13 PASS, 0 FAIL". Kiểm tra không còn dữ liệu giả:
--   select count(*) from auth.users where email like '%@test.invalid';  -- phải là 0
do $$
declare
  v_buyer uuid := gen_random_uuid();
  v_seller uuid := gen_random_uuid();
  v_listing uuid;
  v_order public.orders;
  v_free public.orders;
  v_balance integer;
  v_results text[] := '{}';
  v_pass integer;
  v_total integer;
begin
  insert into auth.users (id, email) values
    (v_buyer, 'buyer-' || v_buyer || '@test.invalid'), (v_seller, 'seller-' || v_seller || '@test.invalid');
  -- Có thể đã có trigger tạo profiles khi insert auth.users — upsert cho chắc.
  insert into public.profiles (id, username, nickname, token_balance)
  values (v_buyer, 'tb' || left(replace(v_buyer::text, '-', ''), 12), 'Buyer', 10000),
         (v_seller, 'ts' || left(replace(v_seller::text, '-', ''), 12), 'Seller', 0)
  on conflict (id) do update set token_balance = excluded.token_balance;

  insert into public.service_listings (seller_id, service_type, name) values (v_seller, 'illustration', 'Test')
  returning id into v_listing;

  -- Giá 1000, cọc 33% → cọc tối thiểu round(330) = 330.
  v_order := public.create_order(v_buyer, v_seller, v_listing, 1000, 33, 2, '{}'::jsonb);
  update public.orders set status = 'brief_confirmed' where id = v_order.id;

  begin
    perform public.record_order_payment(v_order.id, v_buyer, 1);
    v_results := array_append(v_results, 'FAIL cọc 1 xu bị chặn: đã nhận');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Deposit must be at least 330%' then 'PASS cọc 1 xu bị chặn' else 'FAIL cọc 1 xu bị chặn: ' || sqlerrm end);
  end;

  begin
    perform public.record_order_payment(v_order.id, v_buyer, 1001);
    v_results := array_append(v_results, 'FAIL cọc vượt giá bị chặn: đã nhận');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Payment exceeds order price%' then 'PASS cọc vượt giá bị chặn' else 'FAIL cọc vượt giá bị chặn: ' || sqlerrm end);
  end;

  select * into v_order from public.orders where id = v_order.id;
  v_results := array_append(v_results, case when v_order.paid = 0 and v_order.status = 'brief_confirmed'
    then 'PASS lần bị chặn không đổi paid/status' else 'FAIL lần bị chặn không đổi paid/status: paid=' || v_order.paid || ' status=' || v_order.status end);

  v_order := public.record_order_payment(v_order.id, v_buyer, 330);
  v_results := array_append(v_results, case when v_order.paid = 330 and v_order.status = 'in_progress'
    then 'PASS cọc đúng mức → in_progress' else 'FAIL cọc đúng mức → in_progress: paid=' || v_order.paid || ' status=' || v_order.status end);

  begin
    perform public.record_order_payment(v_order.id, v_buyer, 671);
    v_results := array_append(v_results, 'FAIL trả vượt phần còn lại bị chặn: đã nhận');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Payment exceeds order price (remaining 670)%' then 'PASS trả vượt phần còn lại bị chặn' else 'FAIL trả vượt phần còn lại bị chặn: ' || sqlerrm end);
  end;

  -- Sau khi đã cọc, trả từng phần nhỏ hơn mức cọc vẫn được (chỉ lần đầu cần đủ cọc).
  v_order := public.record_order_payment(v_order.id, v_buyer, 70);
  v_order := public.record_order_payment(v_order.id, v_buyer, 600);
  v_results := array_append(v_results, case when v_order.paid = 1000 then 'PASS trả đủ phần còn lại' else 'FAIL trả đủ phần còn lại: paid=' || v_order.paid end);

  begin
    perform public.record_order_payment(v_order.id, v_buyer, 1);
    v_results := array_append(v_results, 'FAIL trả thêm khi đã đủ bị chặn: đã nhận');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Payment exceeds order price (remaining 0)%' then 'PASS trả thêm khi đã đủ bị chặn' else 'FAIL trả thêm khi đã đủ bị chặn: ' || sqlerrm end);
  end;

  select token_balance into v_balance from public.profiles where id = v_buyer;
  v_results := array_append(v_results, case when v_balance = 9000 then 'PASS ví người mua trừ đúng 1000' else 'FAIL ví người mua trừ đúng 1000: balance=' || v_balance end);

  -- deposit_pct = 0: lần đầu chỉ cần > 0.
  v_free := public.create_order(v_buyer, v_seller, v_listing, 500, 0, 2, '{}'::jsonb);
  update public.orders set status = 'brief_confirmed' where id = v_free.id;
  v_free := public.record_order_payment(v_free.id, v_buyer, 1);
  v_results := array_append(v_results, case when v_free.status = 'in_progress' then 'PASS cọc 0% nhận 1 xu' else 'FAIL cọc 0% nhận 1 xu: status=' || v_free.status end);

  -- Làm tròn giống Math.round ở web: giá 5, cọc 50% → round(2.5) = 3.
  v_free := public.create_order(v_buyer, v_seller, v_listing, 5, 50, 2, '{}'::jsonb);
  update public.orders set status = 'brief_confirmed' where id = v_free.id;
  begin
    perform public.record_order_payment(v_free.id, v_buyer, 2);
    v_results := array_append(v_results, 'FAIL làm tròn cọc 2.5 → 3: nhận 2');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm like 'Deposit must be at least 3%' then 'PASS làm tròn cọc 2.5 → 3' else 'FAIL làm tròn cọc 2.5 → 3: ' || sqlerrm end);
  end;

  -- Người không phải buyer vẫn bị chặn như trước.
  begin
    perform public.record_order_payment(v_free.id, v_seller, 3);
    v_results := array_append(v_results, 'FAIL seller không trả được: đã nhận');
  exception when others then
    v_results := array_append(v_results, case when sqlerrm = 'Only the buyer pays' then 'PASS seller không trả được' else 'FAIL seller không trả được: ' || sqlerrm end);
  end;

  -- authenticated/anon không được gọi hàm trực tiếp qua REST.
  v_results := array_append(v_results, case when has_function_privilege('authenticated', 'public.record_order_payment(uuid, uuid, integer)', 'execute')
    then 'FAIL authenticated không có EXECUTE' else 'PASS authenticated không có EXECUTE' end);
  v_results := array_append(v_results, case when has_function_privilege('anon', 'public.record_order_payment(uuid, uuid, integer)', 'execute')
    then 'FAIL anon không có EXECUTE' else 'PASS anon không có EXECUTE' end);

  v_total := cardinality(v_results);
  select count(*) into v_pass from unnest(v_results) r where r like 'PASS %';
  -- Lỗi có chủ đích: hoàn tác toàn bộ dữ liệu giả và hiện kết quả.
  raise exception E'KẾT QUẢ TEST (lỗi có chủ đích để hoàn tác dữ liệu giả): % PASS, % FAIL\n%',
    v_pass, v_total - v_pass, array_to_string(v_results, E'\n');
end $$;
