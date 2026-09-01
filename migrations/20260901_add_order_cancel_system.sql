-- Migration: Tính hoàn tiền tự động khi hủy đơn (Mục 5.1 đặc tả).
--
-- QUAN TRỌNG — sửa lại hình dạng service_listings.refund_policy: Phase 2
-- (migrations/20260901_add_service_tag_catalog.sql) để seller tự gõ TÊN
-- MỐC tự do (vd "Trước khi gửi nháp #1") — không dùng được ở đây vì hệ
-- thống cần TỰ suy ra mốc từ order_events rồi tra thẳng vào key cố định,
-- không so khớp được với text tự do của seller. Từ migration này,
-- refund_policy PHẢI là object 4 key cố định:
--   {"before_draft": 70, "draft_pending": 40, "draft_approved": 15, "delivered": 0}
-- Cột vẫn là jsonb (không đổi schema) — chỉ đổi hợp đồng hình dạng dữ
-- liệu, validate lại ở src/lib/orders/service-listing-service.ts +
-- UI src/components/profile/services-tab.tsx (cùng đợt sửa file này).
-- Listing cũ (nếu ai đã lưu theo hình dạng mảng cũ trước khi có migration
-- này) sẽ không đọc được 4 key này -> calculate_refund() coi như "chưa có
-- chính sách", seller phải vào sửa lại chính sách theo form mới (form chỉ
-- có 4 ô cố định, không cho gõ tự do nữa) mới tiếp tục nhận đơn được.
--
-- "cancelled_by": nếu SELLER là bên yêu cầu hủy -> hoàn 100% (quy ước hợp
-- lý, không cần seller tự khai % riêng cho trường hợp lỗi của mình); nếu
-- BUYER yêu cầu hủy -> áp bảng % theo mốc tiến độ ở trên. Quyết định kỹ
-- thuật này CHƯA được xác nhận với người yêu cầu lúc viết file này.
--
-- ĐÃ SỬA (migrations/20260901_add_order_refund_minimum_table.sql, sau khi
-- có bảng % sàn thật từ người yêu cầu): vế seller-fault KHÔNG phải hằng
-- số 100% — chỉ giữ 100% khi seller ĐÃ tự khai refund_policy (luôn hợp
-- lệ vì ≥ sàn ở mọi mốc); khi seller CHƯA khai gì, seller-fault tra đúng
-- bảng sàn (100/90/70/100 theo mốc), không còn cố định.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.
-- Yêu cầu migrations/20260901_add_order_refund_transaction_type.sql đã
-- chạy trước.

BEGIN;

-- Đọc order_events để suy ra mốc tiến độ cao nhất đã đạt — KHÔNG lưu 1
-- cột "stage" cứng nào (đúng cảnh báo Mục 3.2: dễ lệch dữ liệu). Hàm này
-- THUẦN TÚY (stable, không ghi gì) — dùng cho cả preview lẫn lúc chốt hủy
-- thật, để đảm bảo số hiển thị lúc preview và số áp dụng lúc chốt LUÔN
-- khớp nhau (đọc lại từ đầu, không tin số client gửi lên).
create function public.calculate_refund(p_order_id uuid, p_cancelled_by text)
returns jsonb as $$
declare
  v_order public.orders;
  v_policy jsonb;
  v_stage text;
  v_pct integer;
  v_refund integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if p_cancelled_by not in ('buyer', 'seller') then raise exception 'cancelled_by must be buyer or seller'; end if;

  if p_cancelled_by = 'seller' then
    v_stage := null;
    v_pct := 100;
  else
    if exists (select 1 from public.order_events where order_id = p_order_id and event_type = 'delivered') then
      v_stage := 'delivered';
    elsif exists (select 1 from public.order_events where order_id = p_order_id and event_type = 'draft_approved') then
      v_stage := 'draft_approved';
    elsif exists (select 1 from public.order_events where order_id = p_order_id and event_type = 'draft_submitted') then
      v_stage := 'draft_pending';
    else
      v_stage := 'before_draft';
    end if;

    select refund_policy into v_policy from public.service_listings where id = v_order.listing_id;
    if v_policy is null or not (v_policy ? v_stage) then
      -- TODO(chờ người yêu cầu cung cấp): fallback về bảng % TỐI THIỂU
      -- của Nền tảng khi seller chưa tự khai — Mục 5.1 đặc tả. Số liệu
      -- CHƯA có (đã hỏi lại 2026-09-01, người yêu cầu xác nhận sẽ gửi
      -- sau). Hiện raise lỗi rõ ràng thay vì đoán số — an toàn vì Phase 2
      -- (migrations/20260901_add_service_tag_catalog.sql,
      -- computeMissingFields() trong service-listing-service.ts) đã bắt
      -- buộc refund_policy đủ 4 mốc mới được bật is_accepting_orders, nên
      -- nhánh này trên thực tế chỉ chạm tới với listing cũ/lỗi dữ liệu.
      -- Khi có bảng thật: thêm 1 hằng số mặc định (vd DEFAULT_REFUND_POLICY
      -- constant ở đây hoặc 1 dòng service_listings đặc biệt) rồi COALESCE
      -- vào v_policy trước dòng if này, không cần đổi chữ ký hàm.
      raise exception 'NO_REFUND_POLICY: listing has no usable refund_policy for stage %', v_stage;
    end if;
    v_pct := (v_policy ->> v_stage)::integer;
  end if;

  v_refund := round(v_order.paid * v_pct / 100.0)::integer;

  return jsonb_build_object(
    'stage', v_stage,
    'pct', v_pct,
    'refund_amount', v_refund,
    'seller_amount', v_order.paid - v_refund,
    'cancelled_by', p_cancelled_by
  );
end;
$$ language plpgsql stable;

revoke execute on function public.calculate_refund from public, anon, authenticated;
grant execute on function public.calculate_refund to service_role;

-- Mục 3.3: "hiển thị con số này cho cả 2 bên xác nhận TRƯỚC KHI thực thi
-- hoàn tiền, không tự động hoàn ngay" — cùng khuôn request/resolve với
-- order_file_requests (migrations/20260901_add_order_delivery_assets.sql):
-- 1 bên yêu cầu hủy (refund_amount CHỐT NGAY tại thời điểm yêu cầu, không
-- đổi nếu tiến độ đổi sau đó trong lúc chờ bên kia trả lời), bên CÒN LẠI
-- đồng ý mới thực thi.
create table public.order_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  cancelled_by text not null check (cancelled_by in ('buyer', 'seller')),
  refund_amount integer not null,
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.order_cancel_requests enable row level security;

create policy "order parties view their cancel requests"
  on public.order_cancel_requests for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create index order_cancel_requests_order_idx on public.order_cancel_requests (order_id, status);

create function public.request_order_cancel(p_order_id uuid, p_actor_id uuid)
returns public.order_cancel_requests as $$
declare
  v_order public.orders;
  v_cancelled_by text;
  v_calc jsonb;
  v_row public.order_cancel_requests;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.buyer_id <> p_actor_id and v_order.seller_id <> p_actor_id then
    raise exception 'Only order parties can request cancellation';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Cannot cancel a closed order';
  end if;
  if exists (select 1 from public.order_cancel_requests where order_id = p_order_id and status = 'pending') then
    raise exception 'A cancel request is already pending for this order';
  end if;

  v_cancelled_by := case when p_actor_id = v_order.buyer_id then 'buyer' else 'seller' end;
  v_calc := public.calculate_refund(p_order_id, v_cancelled_by);

  insert into public.order_cancel_requests (order_id, requested_by, cancelled_by, refund_amount)
  values (p_order_id, p_actor_id, v_cancelled_by, (v_calc ->> 'refund_amount')::integer)
  returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'cancel_requested', p_actor_id, v_calc);

  return v_row;
end;
$$ language plpgsql security definer;

create function public.resolve_order_cancel_request(p_request_id uuid, p_actor_id uuid, p_agree boolean)
returns public.orders as $$
declare
  v_req public.order_cancel_requests;
  v_order public.orders;
begin
  select * into v_req from public.order_cancel_requests where id = p_request_id for update;
  if v_req is null or v_req.status <> 'pending' then
    raise exception 'Request % not found or already resolved', p_request_id;
  end if;

  select * into v_order from public.orders where id = v_req.order_id for update;
  if p_actor_id <> v_order.buyer_id and p_actor_id <> v_order.seller_id then
    raise exception 'Only order parties can resolve a cancel request';
  end if;
  if p_actor_id = v_req.requested_by then
    raise exception 'The requester cannot resolve their own request — the OTHER party must agree';
  end if;

  if not p_agree then
    update public.order_cancel_requests set status = 'declined', resolved_at = now() where id = p_request_id;
    insert into public.order_events (order_id, event_type, actor_id)
    values (v_req.order_id, 'cancel_declined', p_actor_id);
    return v_order;
  end if;

  if v_req.refund_amount > 0 then
    perform public.apply_transaction(
      p_user_id => v_order.buyer_id, p_type => 'order_refund', p_amount => v_req.refund_amount,
      p_reference_type => 'order', p_reference_id => v_order.id
    );
  end if;

  update public.order_cancel_requests set status = 'agreed', resolved_at = now() where id = p_request_id;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = v_order.id returning * into v_order;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (
    v_order.id, 'cancelled', p_actor_id,
    jsonb_build_object('refund_amount', v_req.refund_amount, 'cancelled_by', v_req.cancelled_by)
  );

  return v_order;
end;
$$ language plpgsql security definer;

revoke execute on function public.request_order_cancel from public, anon, authenticated;
revoke execute on function public.resolve_order_cancel_request from public, anon, authenticated;
grant execute on function public.request_order_cancel to service_role;
grant execute on function public.resolve_order_cancel_request to service_role;

-- Mục 5.4 "Mất liên lạc" — chỉ cần 1 hàm ghi mốc "đã nhắc" (điều kiện bật
-- nút "Báo cáo mất liên lạc" — ≥72h không phản hồi kể từ nhắc, ≥7 ngày kể
-- từ nhắc ĐẦU TIÊN — tính ở tầng route bằng cách đọc lại order_events +
-- direct_messages, KHÔNG cần hàm SQL riêng vì không ghi gì, chỉ đọc).
create function public.record_order_reminder(p_order_id uuid, p_actor_id uuid, p_target_user_id uuid)
returns public.order_events as $$
declare
  v_order public.orders;
  v_row public.order_events;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.buyer_id <> p_actor_id and v_order.seller_id <> p_actor_id then
    raise exception 'Only order parties can send a reminder';
  end if;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'reminder_sent', p_actor_id, jsonb_build_object('target_user_id', p_target_user_id))
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- "Báo cáo mất liên lạc" (Mục 5.4) — CHỈ ghi lại mốc bất biến ở phase
-- này; xử lý/leo thang (đóng băng đơn, đưa vào hàng đợi admin) là việc
-- của Module 9 (Dispute/Trust Score), chưa làm. Điều kiện bật nút được
-- validate ở route (đọc order_events + direct_messages), hàm này chỉ
-- kiểm tối thiểu (order tồn tại, actor là 1 trong 2 bên) — route PHẢI tự
-- kiểm đủ điều kiện trước khi gọi, hàm không tự kiểm lại (tránh trùng
-- logic 2 nơi, xem src/app/api/orders/[orderId]/lost-contact/report/route.ts).
create function public.record_lost_contact_report(p_order_id uuid, p_actor_id uuid)
returns public.order_events as $$
declare
  v_order public.orders;
  v_row public.order_events;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.buyer_id <> p_actor_id and v_order.seller_id <> p_actor_id then
    raise exception 'Only order parties can report lost contact';
  end if;

  insert into public.order_events (order_id, event_type, actor_id)
  values (p_order_id, 'lost_contact_reported', p_actor_id)
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.record_order_reminder from public, anon, authenticated;
revoke execute on function public.record_lost_contact_report from public, anon, authenticated;
grant execute on function public.record_order_reminder to service_role;
grant execute on function public.record_lost_contact_report to service_role;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 12 (section 12g) —
--    calculate_refund, order_cancel_requests + 2 hàm, record_order_reminder,
--    record_lost_contact_report.
-- 2. Cập nhật src/lib/supabase/types.ts.
-- 3. Cập nhật src/lib/orders/service-listing-service.ts +
--    src/components/profile/services-tab.tsx — refund_policy đổi hình
--    dạng (xem ghi chú đầu file). Listing cũ đã lưu theo mảng tự do
--    (nếu có) coi như mất giá trị, seller cần điền lại.
