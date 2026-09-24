-- Migration: kiểm tra số tiền ở record_order_payment() (cọc đúng mức, không vượt giá).
--
-- Lỗ hổng trước đây: hàm chỉ kiểm tra p_amount > 0. Số tiền do client gửi
-- (src/app/api/orders/[orderId]/deposit/route.ts) — giao diện web tự tính
-- tiền cọc = round(price * deposit_pct / 100) và phần còn lại = price - paid,
-- nhưng server không cưỡng chế. Một request tự soạn có thể:
--   - "cọc" 1 xu để đơn chuyển sang in_progress (người bán bắt đầu làm);
--   - trả vượt giá đơn.
-- confirm_order_received() trả người bán đúng orders.paid, nên người bán có
-- thể nhận ít hơn giá đã chốt.
--
-- Quy tắc mới (chủ dự án chọn 24/09/2026):
--   1. Lần trả đầu (status 'brief_confirmed') phải >= round(price * deposit_pct / 100)
--      — cùng công thức Math.round ở order-card.tsx (Postgres round(numeric)
--      làm tròn nửa lên với số dương, khớp Math.round).
--   2. Tổng đã trả sau lần này không được vượt price.
-- KHÔNG bắt buộc trả đủ trước khi bàn giao (deliver_order giữ nguyên).
--
-- Chữ ký hàm không đổi → CREATE OR REPLACE giữ nguyên GRANT; vẫn khai lại
-- REVOKE/GRANT bên dưới cho chắc (idempotent).
--
-- Test: docs/supabase/tests/20260924_order_payment_amounts.test.sql (chạy trong
-- 1 transaction, kết thúc bằng rollback) — chạy ở dev/staging trước production.

create or replace function public.record_order_payment(p_order_id uuid, p_actor_id uuid, p_amount integer)
returns public.orders as $$
declare
  v_row public.orders;
  v_min_deposit integer;
begin
  if p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;

  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer pays'; end if;
  if v_row.status not in ('brief_confirmed', 'deposit_paid', 'in_progress') then
    raise exception 'Cannot pay in status %', v_row.status;
  end if;

  -- Kiểm tra dưới khoá hàng (for update ở trên) — 2 request song song không
  -- cùng lọt qua được giới hạn giá.
  if v_row.paid + p_amount > v_row.price then
    raise exception 'Payment exceeds order price (remaining %)', v_row.price - v_row.paid;
  end if;
  if v_row.status = 'brief_confirmed' then
    v_min_deposit := round(v_row.price * v_row.deposit_pct / 100.0)::integer;
    if p_amount < v_min_deposit then
      raise exception 'Deposit must be at least %', v_min_deposit;
    end if;
  end if;

  perform public.apply_transaction(
    p_user_id => p_actor_id, p_type => 'order_payment', p_amount => -p_amount,
    p_reference_type => 'order', p_reference_id => p_order_id
  );

  update public.orders set paid = paid + p_amount where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'payment_received', p_actor_id, jsonb_build_object('amount', p_amount));

  if v_row.status = 'brief_confirmed' then
    update public.orders set status = 'deposit_paid' where id = p_order_id returning * into v_row;
    insert into public.order_events (order_id, event_type, actor_id, payload)
    values (p_order_id, 'deposit_paid', p_actor_id, jsonb_build_object('amount', p_amount));

    update public.orders set status = 'in_progress' where id = p_order_id returning * into v_row;
    insert into public.order_events (order_id, event_type, actor_id)
    values (p_order_id, 'work_started', null);
  end if;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.record_order_payment(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.record_order_payment(uuid, uuid, integer) to service_role;

-- Notes:
-- - docs/supabase/schema.sql: không chép thân hàm (xem ghi chú "Hàm máy trạng
--   thái" — thân hàm nằm ở migration). Đã thêm dòng trỏ tới migration này.
-- - src/lib/supabase/types.ts: không đổi (chữ ký hàm giữ nguyên).
-- - src/app/api/orders/[orderId]/deposit/route.ts: map 2 lỗi mới sang tiếng Việt.
-- - Đơn cũ đã lỡ trả thiếu/vượt: migration KHÔNG sửa dữ liệu cũ. Kiểm tra trước
--   khi chạy production:
--     select id, code, status, price, paid, deposit_pct from public.orders
--     where paid > price
--        or (status in ('deposit_paid','in_progress','delivered','completed')
--            and paid < round(price * deposit_pct / 100.0));
