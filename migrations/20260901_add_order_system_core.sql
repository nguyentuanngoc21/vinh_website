-- Migration: nền tảng Hệ thống giao dịch commission (schema.sql phần 12).
--
-- Phase 1 của đặc tả "Hệ thống giao dịch commission (Vịnh)": order_events
-- (nhật ký bất biến) + máy trạng thái Order cơ bản (Mục 3.1-3.2 của đặc
-- tả, CHƯA gồm hoàn tiền/tranh chấp — xem migration riêng sau cho
-- calculate_refund, disputes, manuscript_access_grants,
-- author_name_agreements, trust score). service_listings/service_samples
-- (Mục 2 của đặc tả) được tạo CÙNG migration này dù API/UI quản lý dịch
-- vụ là việc của phase sau — vì orders.listing_id cần FK vào 1 bảng đã
-- tồn tại; is_accepting_orders mặc định false nên không ảnh hưởng gì cho
-- tới khi phase đó xong.
--
-- QUAN TRỌNG: yêu cầu 2 migration ADD VALUE đã chạy trước:
--   migrations/20260901_add_order_payment_transaction_type.sql
--   migrations/20260901_add_order_earning_transaction_type.sql
--
-- Run with: supabase db push (hoặc dán vào SQL editor). Test ở staging
-- trước theo docs/DEV_WORKFLOW.md (set_config('request.jwt.claims', ...)
-- trong 1 transaction rollback để kiểm RLS).

BEGIN;

-- ---------------------------------------------------------------------
-- 12a. service_listings / service_samples (Mục 2 đặc tả)
-- ---------------------------------------------------------------------

create type public.service_type as enum ('illustration', 'voice', 'ghostwriting');

-- 11 trường bắt buộc của Mục 2 đặc tả ánh xạ vào các cột dưới đây (tên/độ
-- gộp có thể khác chữ trong đặc tả nhưng đủ 11 ý: 1 name, 2
-- scope_description, 3 price_tiers, 4 deposit_pct, 5 delivery_days, 6
-- revisions_max, 7 tags (nhóm theo loại hình, chọn từ danh mục cố định do
-- Nền tảng quản lý — validate ở tầng service, KHÔNG ở DB), 8
-- default_usage_scope, 9 refund_policy, 10 lost_contact_days, 11
-- is_private). is_accepting_orders CHỈ được service layer bật khi đủ
-- 11/11 — xem src/lib/orders/service-listing-service.ts (phase sau).
create table public.service_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  service_type public.service_type not null,
  name text not null default '',
  scope_description text not null default '',
  price_tiers jsonb not null default '[]'::jsonb,       -- [{label, price, deposit_pct?}]
  deposit_pct integer,
  delivery_days integer,
  revisions_max integer,
  tags jsonb not null default '{}'::jsonb,               -- {g1:[...], g2:[...], ...} — nhóm khác nhau theo service_type
  default_usage_scope text,
  -- null = seller CHƯA tự khai — calculate_refund() (phase sau) sẽ phải
  -- dùng bảng % tối thiểu của Nền tảng làm fallback; số liệu bảng đó
  -- CHƯA có (đang chờ từ người yêu cầu), nên tới khi có, listing chưa tự
  -- khai refund_policy sẽ không tính hoàn tiền tự động được.
  refund_policy jsonb,
  lost_contact_days integer not null default 7,
  accepted_content text,
  rejected_content text,
  is_private boolean not null default false,
  is_accepting_orders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deposit_pct is null or deposit_pct between 0 and 100)
);

alter table public.service_listings enable row level security;

create policy "public can view listings accepting orders"
  on public.service_listings for select
  using (is_accepting_orders = true);

create policy "sellers manage their own listings"
  on public.service_listings for all
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "admins view all listings"
  on public.service_listings for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index service_listings_seller_idx on public.service_listings (seller_id);

create table public.service_samples (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.service_listings (id) on delete cascade,
  source text not null default 'upload' check (source in ('upload', 'auto', 'external')),
  file_url text not null,
  -- true cho sample KHÔNG do hệ thống tự lấy từ Order đã completed của
  -- chính seller (Mục 2.2 đặc tả) — hiển thị badge "chưa được Nền tảng
  -- xác thực" ở UI.
  unverified_external boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.service_samples enable row level security;

create policy "public can view samples of listings accepting orders"
  on public.service_samples for select
  using (exists (
    select 1 from public.service_listings l
    where l.id = listing_id and l.is_accepting_orders = true
  ));

create policy "sellers manage samples of their own listings"
  on public.service_samples for all
  using (exists (select 1 from public.service_listings l where l.id = listing_id and l.seller_id = auth.uid()))
  with check (exists (select 1 from public.service_listings l where l.id = listing_id and l.seller_id = auth.uid()));

create index service_samples_listing_idx on public.service_samples (listing_id);

-- ---------------------------------------------------------------------
-- 12b. orders / order_events (Mục 1 + 3.1-3.2 đặc tả)
-- ---------------------------------------------------------------------

-- Giữ đủ 8 trạng thái đúng như sơ đồ trong đặc tả (kể cả 'brief_confirmed'
-- và 'deposit_paid' dù 2 trạng thái này chỉ dừng lại rất ngắn trong thực
-- tế — xem record_order_payment() bên dưới đi thẳng từ 'brief_confirmed'
-- qua 'deposit_paid' rồi 'in_progress' cùng 1 lời gọi, mỗi bước đều có 1
-- order_events tương ứng — để không mất thông tin nếu sau này cần chặn ở
-- đúng bước 'deposit_paid').
create type public.order_status as enum (
  'draft', 'brief_confirmed', 'deposit_paid', 'in_progress', 'delivered', 'completed', 'cancelled', 'disputed'
);

create sequence public.order_code_seq start 2000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DH-' || nextval('public.order_code_seq')),
  buyer_id uuid not null references auth.users (id) on delete restrict,
  seller_id uuid not null references auth.users (id) on delete restrict,
  listing_id uuid not null references public.service_listings (id) on delete restrict,
  status public.order_status not null default 'draft',
  usage_scope text,     -- 'personal' | 'commercial_limited' | 'commercial_full'
  scope_note text,
  brief text not null default '',
  brief_locked_at timestamptz,
  price integer not null,
  paid integer not null default 0,
  deposit_pct integer not null,
  revisions_max integer not null default 2,
  revisions_used integer not null default 0,
  draft_number integer not null default 0,
  drafts_approved integer not null default 0,
  delivered_at timestamptz,
  -- delivered_at + 7 ngày (Mục 3.2 "Xác nhận đã nhận") — cron
  -- (src/app/api/orders/cron/auto-confirm, phase này) quét cột này.
  auto_confirm_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Nội dung TOS của seller TẠI THỜI ĐIỂM "Bắt đầu giao dịch" — snapshot
  -- thật, không chỉ id, vì seller có thể sửa TOS của listing sau này
  -- (Mục 3.2 đặc tả).
  tos_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (price >= 0 and paid >= 0),
  check (deposit_pct between 0 and 100),
  check (usage_scope is null or usage_scope in ('personal', 'commercial_limited', 'commercial_full'))
);

alter table public.orders enable row level security;

create policy "order parties view their own orders"
  on public.orders for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "admins view all orders"
  on public.orders for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — mọi thay đổi trạng
-- thái BẮT BUỘC qua các hàm security definer bên dưới (record_order_event
-- + 1 hàm riêng cho từng hành động), giống hệt nguyên tắc của
-- public.transactions (schema.sql phần 6).

create index orders_buyer_idx on public.orders (buyer_id);
create index orders_seller_idx on public.orders (seller_id);
create index orders_auto_confirm_idx on public.orders (auto_confirm_at) where status = 'delivered';

-- Nhật ký bất biến — MỌI hành động có ý nghĩa trên 1 Order phải để lại 1
-- dòng ở đây, created_at do server sinh (default now(), không nhận
-- timestamp từ client) — đây là bằng chứng tra cứu được cho yêu cầu
-- "mỗi hành động quan trọng phải để lại mốc thời gian".
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users (id),  -- null = hệ thống/cron (vd auto_confirmed_by_system)
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_events enable row level security;

create policy "order parties view their own order events"
  on public.order_events for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create policy "admins view all order events"
  on public.order_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update/delete cho "authenticated" — bất biến,
-- chỉ service_role (qua các hàm dưới) ghi được.

create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------
-- 12c. Hàm máy trạng thái — MỖI hành động là 1 hàm riêng (giống
-- create_purchase/mark_withdrawal_result ở phần 6), không có 1 hàm
-- "update status trần" nào được phép gọi trực tiếp từ route.
-- ---------------------------------------------------------------------

create function public.create_order(
  p_buyer_id uuid,
  p_seller_id uuid,
  p_listing_id uuid,
  p_price integer,
  p_deposit_pct integer,
  p_revisions_max integer,
  p_tos_snapshot jsonb
) returns public.orders as $$
declare
  v_row public.orders;
begin
  insert into public.orders (buyer_id, seller_id, listing_id, price, deposit_pct, revisions_max, tos_snapshot)
  values (p_buyer_id, p_seller_id, p_listing_id, p_price, p_deposit_pct, p_revisions_max, p_tos_snapshot)
  returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (v_row.id, 'order_created', p_buyer_id, jsonb_build_object('listing_id', p_listing_id));

  return v_row;
end;
$$ language plpgsql security definer;

create function public.set_order_scope(
  p_order_id uuid,
  p_actor_id uuid,
  p_usage_scope text,
  p_scope_note text default null
) returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer selects usage scope'; end if;
  if v_row.status not in ('draft', 'brief_confirmed') then
    raise exception 'Cannot change usage scope in status %', v_row.status;
  end if;

  update public.orders set usage_scope = p_usage_scope, scope_note = p_scope_note
    where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'scope_selected', p_actor_id, jsonb_build_object('usage_scope', p_usage_scope));

  return v_row;
end;
$$ language plpgsql security definer;

-- Lưu nháp brief TRƯỚC khi khóa (confirm_order_brief bên dưới) — buyer có
-- thể gọi nhiều lần trong lúc còn soạn. Không tự chuyển status.
create function public.set_order_brief(p_order_id uuid, p_actor_id uuid, p_brief text)
returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer edits the brief'; end if;
  if v_row.status <> 'draft' then raise exception 'Brief is locked once past draft, status is %', v_row.status; end if;

  update public.orders set brief = p_brief where id = p_order_id returning * into v_row;
  return v_row;
end;
$$ language plpgsql security definer;

create function public.confirm_order_brief(p_order_id uuid, p_actor_id uuid)
returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer confirms the brief'; end if;
  if v_row.status <> 'draft' then raise exception 'Order must be in draft to confirm brief, is %', v_row.status; end if;
  if v_row.usage_scope is null then raise exception 'Usage scope must be selected before confirming brief'; end if;
  if btrim(v_row.brief) = '' then raise exception 'Brief is empty'; end if;

  update public.orders set status = 'brief_confirmed', brief_locked_at = now()
    where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id)
  values (p_order_id, 'brief_confirmed', p_actor_id);

  return v_row;
end;
$$ language plpgsql security definer;

-- Dùng CHUNG cho cả "Đặt cọc" lẫn "Thanh toán phần còn lại" (đúng 1 nút ở
-- thiết kế UI cho cả 2 mốc) — apply_transaction() nợ buyer NGAY (status
-- 'completed', KHÔNG 'pending' — tiền coi như đã vào ví trung gian của
-- Nền tảng, không phải của seller cho tới lúc buyer_confirmed, xem
-- migrations/20260901_add_order_payment_transaction_type.sql). Lần thanh
-- toán ĐẦU TIÊN (status còn 'brief_confirmed') mới đẩy status đi tiếp
-- brief_confirmed -> deposit_paid -> in_progress (2 order_events, 1 lời
-- gọi — xem ghi chú ở khai báo order_status phía trên); các lần thanh
-- toán sau (status đã 'in_progress' trở đi) chỉ cộng dồn `paid`, không
-- đổi status.
create function public.record_order_payment(p_order_id uuid, p_actor_id uuid, p_amount integer)
returns public.orders as $$
declare
  v_row public.orders;
begin
  if p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;

  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer pays'; end if;
  if v_row.status not in ('brief_confirmed', 'deposit_paid', 'in_progress') then
    raise exception 'Cannot pay in status %', v_row.status;
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

create function public.submit_order_draft(p_order_id uuid, p_actor_id uuid, p_asset jsonb)
returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.seller_id <> p_actor_id then raise exception 'Only the seller submits a draft'; end if;
  if v_row.status <> 'in_progress' then raise exception 'Order must be in_progress to submit a draft, is %', v_row.status; end if;

  update public.orders set draft_number = draft_number + 1 where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'draft_submitted', p_actor_id, jsonb_build_object('draft_number', v_row.draft_number) || coalesce(p_asset, '{}'::jsonb));

  return v_row;
end;
$$ language plpgsql security definer;

-- resolve_refund_stage() (phase Mục 5.1, chưa làm ở đây) sẽ đọc lại đúng
-- các order_events 'draft_approved' này để suy ra mốc tiến độ — KHÔNG có
-- cột "stage" cứng nào lưu riêng, tránh lệch dữ liệu (đúng cảnh báo trong
-- đặc tả Mục 3.2).
create function public.approve_order_draft(p_order_id uuid, p_actor_id uuid)
returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer approves a draft'; end if;
  if v_row.status <> 'in_progress' then raise exception 'Order must be in_progress, is %', v_row.status; end if;
  if v_row.draft_number <= v_row.drafts_approved then raise exception 'No unapproved draft to approve'; end if;

  update public.orders set drafts_approved = draft_number where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'draft_approved', p_actor_id, jsonb_build_object('draft_number', v_row.draft_number));

  return v_row;
end;
$$ language plpgsql security definer;

create function public.request_order_revision(p_order_id uuid, p_actor_id uuid, p_note text default null)
returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.buyer_id <> p_actor_id then raise exception 'Only the buyer requests a revision'; end if;
  if v_row.status <> 'in_progress' then raise exception 'Order must be in_progress, is %', v_row.status; end if;
  if v_row.revisions_used >= v_row.revisions_max then raise exception 'No revisions remaining'; end if;

  update public.orders set revisions_used = revisions_used + 1 where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'revision_requested', p_actor_id, jsonb_build_object('note', p_note));

  return v_row;
end;
$$ language plpgsql security definer;

-- p_asset: payload mô tả sản phẩm bàn giao theo loại hình (Mục 4 đặc tả —
-- link watermark cho illustration, stream_link cho voice, hoặc marker cho
-- ghostwriting nếu đã cấp quyền xem qua manuscript_access_grants ở phase
-- riêng). Chưa validate "không có ChangeRequest đang pending" ở đây vì
-- bảng order_change_requests thuộc phase sau — TODO khi bảng đó có, thêm
-- guard vào đây.
create function public.deliver_order(p_order_id uuid, p_actor_id uuid, p_asset jsonb default '{}'::jsonb)
returns public.orders as $$
declare
  v_row public.orders;
begin
  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null then raise exception 'Order % not found', p_order_id; end if;
  if v_row.seller_id <> p_actor_id then raise exception 'Only the seller delivers'; end if;
  if v_row.status <> 'in_progress' then raise exception 'Order must be in_progress to deliver, is %', v_row.status; end if;

  update public.orders
    set status = 'delivered', delivered_at = now(), auto_confirm_at = now() + interval '7 days'
    where id = p_order_id returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'delivered', p_actor_id, p_asset);

  return v_row;
end;
$$ language plpgsql security definer;

-- p_is_system=true dành riêng cho cron auto-confirm (src/app/api/orders/
-- cron/auto-confirm) — actor_id null trong order_events, event_type khác
-- để phân biệt buyer tự bấm với hệ thống tự xác nhận sau 7 ngày (Mục 3.2
-- đặc tả, hàng "Xác nhận đã nhận"). order_earning dùng ĐÚNG cơ chế
-- pending+hold+settle-cron sẵn có của purchase_credit (schema.sql phần
-- 6e) — không cần hàm settle riêng nào mới, cron settle-pending hiện tại
-- (src/app/api/wallet/cron/settle-pending) tự quét luôn.
create function public.confirm_order_received(
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

  return v_row;
end;
$$ language plpgsql security definer;

-- Chỉ service_role gọi được — mọi hàm trên đều KHÔNG tự kiểm auth.uid(),
-- actor id truyền trần từ route (đã qua getAuthedUserId() ở tầng
-- Next.js), giống nguyên tắc của apply_transaction/grant_platform_bonus
-- (schema.sql phần 6). Xem migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.create_order from public, anon, authenticated;
revoke execute on function public.set_order_scope from public, anon, authenticated;
revoke execute on function public.set_order_brief from public, anon, authenticated;
revoke execute on function public.confirm_order_brief from public, anon, authenticated;
revoke execute on function public.record_order_payment from public, anon, authenticated;
revoke execute on function public.submit_order_draft from public, anon, authenticated;
revoke execute on function public.approve_order_draft from public, anon, authenticated;
revoke execute on function public.request_order_revision from public, anon, authenticated;
revoke execute on function public.deliver_order from public, anon, authenticated;
revoke execute on function public.confirm_order_received from public, anon, authenticated;

grant execute on function public.create_order to service_role;
grant execute on function public.set_order_scope to service_role;
grant execute on function public.set_order_brief to service_role;
grant execute on function public.confirm_order_brief to service_role;
grant execute on function public.record_order_payment to service_role;
grant execute on function public.submit_order_draft to service_role;
grant execute on function public.approve_order_draft to service_role;
grant execute on function public.request_order_revision to service_role;
grant execute on function public.deliver_order to service_role;
grant execute on function public.confirm_order_received to service_role;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql — thêm section 12 (nội dung y hệt
--    file này, đã làm trong cùng đợt sửa).
-- 2. Cập nhật src/lib/supabase/types.ts — Database.public.Tables cho
--    service_listings/service_samples/orders/order_events (Insert/Update:
--    never cho orders/order_events, giống transactions — mọi ghi đều qua
--    RPC ở trên), Database.public.Functions cho 9 hàm, và các union type
--    mới (ServiceType, OrderStatus).
-- 3. Test ở staging trước theo docs/DEV_WORKFLOW.md.
