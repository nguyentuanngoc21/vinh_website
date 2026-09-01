-- Migration: Độ uy tín (Trust Score) + phát hiện giao dịch ngoài nền
-- tảng + Báo cáo vi phạm/Tranh chấp (Module 7, 8, 9 đặc tả).
--
-- Trust Score lưu dưới dạng 4 CỘT ĐẾM trên profiles (không tạo bảng
-- TrustScore riêng) — mô phỏng đúng pattern screenshot_penalty_* đã có
-- (schema.sql phần "Penalty"), đơn giản hơn 1 bảng riêng cho use-case
-- này. Tính lại bằng recalculate_trust_score() gọi TƯỜNG MINH từ 3 điểm:
-- confirm_order_received (đơn completed), resolve_order_cancel_request
-- (hủy được đồng ý), resolve_dispute (tranh chấp xử lý xong) — KHÔNG
-- dùng trigger ngầm, đúng khuyến nghị đặc tả Mục 7 ("gọi tường minh").
-- Không trừ điểm ngay lúc mới bị report — chỉ tính vào lúc dispute đã
-- resolved (Mục 7: "tránh bị lợi dụng report khống để hạ điểm đối thủ").
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

alter table public.profiles
  add column if not exists trust_orders_completed integer not null default 0,
  add column if not exists trust_orders_cancelled_at_fault integer not null default 0,
  add column if not exists trust_off_platform_flags integer not null default 0,
  add column if not exists trust_violations_resolved integer not null default 0;

-- Đọc lại TOÀN BỘ nguồn dữ liệu, ghi đè 4 cột — idempotent, gọi lại bao
-- nhiêu lần cũng ra cùng kết quả (không phải increment/decrement rải rác
-- dễ lệch). "Completed" tính cả 2 vai trò (buyer lẫn seller) vì cả 2 đều
-- thể hiện đã hoàn tất giao dịch tử tế.
create function public.recalculate_trust_score(p_user_id uuid)
returns public.profiles as $$
declare
  v_completed integer;
  v_cancelled_at_fault integer;
  v_off_platform integer;
  v_violations integer;
  v_row public.profiles;
begin
  select count(*) into v_completed
    from public.orders
    where status = 'completed' and (buyer_id = p_user_id or seller_id = p_user_id);

  -- "Lỗi của user này" = user đó là bên đã YÊU CẦU hủy (cancelled_by đúng
  -- vai trò của họ trong order) và bên kia đã đồng ý — tự nhận trách
  -- nhiệm hủy giữa chừng, không phải bên bị hủy oan.
  select count(*) into v_cancelled_at_fault
    from public.order_cancel_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'agreed'
      and (
        (r.cancelled_by = 'buyer' and o.buyer_id = p_user_id)
        or (r.cancelled_by = 'seller' and o.seller_id = p_user_id)
      );

  select count(*) into v_off_platform
    from public.direct_messages
    where sender_id = p_user_id and flagged_off_platform = true;

  select count(*) into v_violations
    from public.disputes
    where at_fault_user_id = p_user_id and status = 'resolved';

  update public.profiles
    set trust_orders_completed = v_completed,
        trust_orders_cancelled_at_fault = v_cancelled_at_fault,
        trust_off_platform_flags = v_off_platform,
        trust_violations_resolved = v_violations
    where id = p_user_id
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.recalculate_trust_score from public, anon, authenticated;
grant execute on function public.recalculate_trust_score to service_role;

-- Mục 8 — phát hiện giao dịch ngoài nền tảng. Regex chạy ở TẦNG ROUTE
-- (src/app/api/messages/[userId]/route.ts), không ở DB — cột này chỉ lưu
-- kết quả. KHÔNG chặn gửi tin (Mục 8: false positive với trao đổi hợp lệ
-- như kích thước/số đo), chỉ gắn nhãn.
alter table public.direct_messages add column if not exists flagged_off_platform boolean not null default false;

-- Mục 9 — Báo cáo vi phạm/Tranh chấp.
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  reporter_id uuid not null references auth.users (id),
  reason_category text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  evidence_snapshot jsonb not null default '{}'::jsonb,
  resolution_note text,
  -- Bên bị xác định có lỗi sau khi admin xử lý xong — NULL nếu không quy
  -- lỗi cho ai (vd hiểu lầm, cả 2 đều không sai). Dùng bởi
  -- recalculate_trust_score() ở trên.
  at_fault_user_id uuid references auth.users (id),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.disputes enable row level security;

create policy "order parties view their disputes"
  on public.disputes for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create policy "admins view all disputes"
  on public.disputes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index disputes_order_idx on public.disputes (order_id);
create index disputes_status_idx on public.disputes (status, created_at);

-- Mở tranh chấp — tự chụp lại (snapshot) toàn bộ order_events +
-- manuscript_access_grants (nếu có, qua orders.book_id) +
-- author_name_agreements (nếu có) + lịch sử tin nhắn giữa 2 bên VÀO 1
-- bundle jsonb (Mục 9: "không yêu cầu người báo cáo tự chụp màn hình gửi
-- kèm"). Khóa toàn bộ hành động khác trên Order Card qua status='disputed'
-- (UI tự ẩn nút hành động khi thấy status này, xem order-card.tsx).
create function public.open_dispute(
  p_order_id uuid, p_reporter_id uuid, p_reason_category text, p_description text
) returns public.disputes as $$
declare
  v_order public.orders;
  v_events jsonb;
  v_grants jsonb;
  v_agreement jsonb;
  v_messages jsonb;
  v_row public.disputes;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.buyer_id <> p_reporter_id and v_order.seller_id <> p_reporter_id then
    raise exception 'Only order parties can open a dispute';
  end if;
  if v_order.status in ('completed', 'cancelled', 'disputed') then
    raise exception 'Cannot open a dispute on this order in status %', v_order.status;
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) into v_events
    from public.order_events e where e.order_id = p_order_id;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.granted_at), '[]'::jsonb) into v_grants
    from public.manuscript_access_grants g where g.book_id = v_order.book_id;

  select to_jsonb(a) into v_agreement from public.author_name_agreements a where a.order_id = p_order_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) into v_messages
    from public.direct_messages m
    where (m.sender_id = v_order.buyer_id and m.recipient_id = v_order.seller_id)
       or (m.sender_id = v_order.seller_id and m.recipient_id = v_order.buyer_id);

  insert into public.disputes (order_id, reporter_id, reason_category, description, evidence_snapshot)
  values (
    p_order_id, p_reporter_id, p_reason_category, p_description,
    jsonb_build_object('order_events', v_events, 'manuscript_access_grants', v_grants, 'author_name_agreement', v_agreement, 'messages', v_messages, 'snapshot_at', now())
  ) returning * into v_row;

  update public.orders set status = 'disputed' where id = p_order_id;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'dispute_opened', p_reporter_id, jsonb_build_object('dispute_id', v_row.id, 'reason_category', p_reason_category));

  return v_row;
end;
$$ language plpgsql security definer;

-- Admin xử lý xong — ghi quyết định, cập nhật Trust Score bên có lỗi (nếu
-- có), mở khóa lại Order về 1 trạng thái admin chọn (khác 'disputed'), và
-- hoàn tiền thủ công nếu admin quyết định (số tiền do admin phán đoán,
-- KHÔNG qua calculate_refund() — đây là quyết định ngoài bảng % thông
-- thường). p_admin_id re-validate role NGAY TRONG hàm — cùng nguyên tắc
-- grant_platform_bonus() (schema.sql phần 6), vì service-role bypass RLS
-- hoàn toàn.
create function public.resolve_dispute(
  p_dispute_id uuid, p_admin_id uuid, p_resolution_note text,
  p_at_fault_user_id uuid default null, p_resume_status public.order_status default 'cancelled',
  p_refund_amount integer default 0
) returns public.disputes as $$
declare
  v_dispute public.disputes;
  v_order public.orders;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Only admins can resolve a dispute';
  end if;
  if p_resume_status = 'disputed' then raise exception 'p_resume_status cannot be disputed'; end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if v_dispute is null or v_dispute.status <> 'open' then
    raise exception 'Dispute % not found or already resolved', p_dispute_id;
  end if;

  select * into v_order from public.orders where id = v_dispute.order_id for update;

  if p_refund_amount > 0 then
    perform public.apply_transaction(
      p_user_id => v_order.buyer_id, p_type => 'order_refund', p_amount => p_refund_amount,
      p_reference_type => 'order', p_reference_id => v_order.id
    );
  end if;

  update public.orders set status = p_resume_status,
    cancelled_at = case when p_resume_status = 'cancelled' then now() else cancelled_at end
    where id = v_order.id;

  update public.disputes
    set status = 'resolved', resolution_note = p_resolution_note, at_fault_user_id = p_at_fault_user_id,
        resolved_by = p_admin_id, resolved_at = now()
    where id = p_dispute_id
    returning * into v_dispute;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (
    v_order.id, 'dispute_resolved', p_admin_id,
    jsonb_build_object('resolution_note', p_resolution_note, 'at_fault_user_id', p_at_fault_user_id, 'refund_amount', p_refund_amount)
  );

  if p_at_fault_user_id is not null then
    perform public.recalculate_trust_score(p_at_fault_user_id);
  end if;

  return v_dispute;
end;
$$ language plpgsql security definer;

revoke execute on function public.open_dispute from public, anon, authenticated;
revoke execute on function public.resolve_dispute from public, anon, authenticated;
grant execute on function public.open_dispute to service_role;
grant execute on function public.resolve_dispute to service_role;

-- CREATE OR REPLACE 2 hàm cũ để gọi recalculate_trust_score() tường minh
-- tại đúng thời điểm hoàn tất/hủy đơn — thân hàm y hệt bản gốc (xem
-- migrations/20260901_add_order_system_core.sql,
-- 20260901_add_order_cancel_system.sql) + thêm đúng 1 dòng perform mỗi
-- hàm, không đổi logic nào khác.
create or replace function public.confirm_order_received(
  p_order_id uuid, p_actor_id uuid default null, p_is_system boolean default false, p_hold_days integer default 4
) returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if not p_is_system and v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer confirms receipt'; end if;
  if v_row.status <> 'delivered' then raise exception 'Order must be delivered to confirm, is %', v_row.status; end if;

  perform public.apply_transaction(
    p_user_id => v_row.seller_id, p_type => 'order_earning', p_amount => v_row.paid,
    p_reference_type => 'order', p_reference_id => p_order_id,
    p_status => 'pending', p_available_at => now() + (p_hold_days || ' days')::interval
  );

  update public.orders set status = 'completed', completed_at = now()
    where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id)
  values (p_order_id, case when p_is_system then 'auto_confirmed_by_system' else 'buyer_confirmed' end,
          case when p_is_system then null else p_actor_id end);

  perform public.recalculate_trust_score(v_row.buyer_id);
  perform public.recalculate_trust_score(v_row.seller_id);

  return v_row;
end;
$$ language plpgsql security definer;

create or replace function public.resolve_order_cancel_request(p_request_id uuid, p_actor_id uuid, p_agree boolean)
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

  perform public.recalculate_trust_score(case when v_req.cancelled_by = 'buyer' then v_order.buyer_id else v_order.seller_id end);

  return v_order;
end;
$$ language plpgsql security definer;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 1 (profiles thêm 4 cột trust_*)
--    và phần 12 (section 12i: disputes, direct_messages.flagged_off_platform,
--    recalculate_trust_score/open_dispute/resolve_dispute; ghi chú
--    CREATE OR REPLACE confirm_order_received/resolve_order_cancel_request).
-- 2. Cập nhật src/lib/supabase/types.ts.
-- 3. Cập nhật src/app/api/messages/[userId]/route.ts — regex phát hiện
--    giao dịch ngoài nền tảng (Mục 8), set flagged_off_platform + gọi
--    recalculate_trust_score(senderId) NẾU flagged=true.
-- 4. Route mở/xử lý tranh chấp + UI khóa Order Card khi status='disputed':
--    xem báo cáo tiến độ, không lặp lại ở đây.
