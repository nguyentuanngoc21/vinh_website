-- Migration: Bàn giao theo loại hình (Mục 4 đặc tả, phần còn lại của
-- Module 4 sau migrations/20260901_add_manuscript_share.sql — bản này
-- làm illustration + voice, ghostwriting đã xong ở migration đó).
--
-- illustration: bản watermark (buyer name/ID mờ lên ảnh + XMP metadata
-- "không cho AI huấn luyện", xử lý bằng sharp — xem
-- src/lib/orders/watermark.ts) lưu CÔNG KHAI được cho 2 bên đơn xem trong
-- lúc giao dịch; bản gốc (không watermark) lưu RIÊNG, chỉ mở khi cả 2 bên
-- đồng ý qua order_file_requests (Mục 3.2 "Yêu cầu file gốc").
--
-- voice: KHÔNG dùng bucket audio-narrations công khai hiện có (Mục 4.2:
-- "không expose URL file tải trực tiếp") — file gốc lưu ở bucket riêng
-- order-deliverables (private), phát qua signed URL ngắn hạn (route
-- GET .../asset tạo mới mỗi lần, không cache URL vĩnh viễn).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

insert into storage.buckets (id, name, public)
values ('order-deliverables', 'order-deliverables', false)
on conflict (id) do nothing;

-- Path convention: {order_id}/{kind}-{timestamp}.{ext} — quyền đọc theo
-- ĐÚNG 2 bên của order đó (buyer/seller), không theo folder-per-user như
-- avatars/design-images/audio-narnarrations (những bucket đó là "tài sản
-- của 1 user", còn cái này là "tài sản của 1 giao dịch giữa 2 người").
create policy "order parties read their deliverables"
  on storage.objects for select
  using (
    bucket_id = 'order-deliverables'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
    )
  );

-- Không có policy insert/update cho "authenticated" — CHỈ route server
-- (service-role, đã xử lý watermark/metadata bằng sharp trước khi upload)
-- được ghi vào bucket này, không client nào tự ý PUT thẳng REST API.

create table public.order_delivered_assets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('illustration_preview', 'illustration_original', 'voice_stream', 'voice_original')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.order_delivered_assets enable row level security;

create policy "order parties view their delivered assets"
  on public.order_delivered_assets for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create policy "admins view all delivered assets"
  on public.order_delivered_assets for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index order_delivered_assets_order_idx on public.order_delivered_assets (order_id);

-- "Yêu cầu file gốc" (Mục 3.2) — 1 bên yêu cầu, BÊN CÒN LẠI đồng ý mới mở
-- khóa (Mục 4: "cần cả 2 bên xác nhận"). Business logic (ai được request,
-- ai được resolve) nằm trong 2 hàm dưới, không phải RLS — cùng nguyên
-- tắc với các hành động Order khác.
create table public.order_file_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.order_file_requests enable row level security;

create policy "order parties view their file requests"
  on public.order_file_requests for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

-- Không có policy insert/update cho "authenticated" — chỉ 2 hàm dưới ghi.

create index order_file_requests_order_idx on public.order_file_requests (order_id, status);

create function public.request_order_file(p_order_id uuid, p_actor_id uuid)
returns public.order_file_requests as $$
declare
  v_order public.orders;
  v_row public.order_file_requests;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.buyer_id <> p_actor_id and v_order.seller_id <> p_actor_id then
    raise exception 'Only order parties can request the original file';
  end if;
  if exists (select 1 from public.order_file_requests where order_id = p_order_id and status = 'pending') then
    raise exception 'A file request is already pending for this order';
  end if;

  insert into public.order_file_requests (order_id, requested_by) values (p_order_id, p_actor_id) returning * into v_row;

  insert into public.order_events (order_id, event_type, actor_id)
  values (p_order_id, 'file_request_created', p_actor_id);

  return v_row;
end;
$$ language plpgsql security definer;

create function public.resolve_order_file_request(p_request_id uuid, p_actor_id uuid, p_agree boolean)
returns public.order_file_requests as $$
declare
  v_req public.order_file_requests;
  v_order public.orders;
begin
  select * into v_req from public.order_file_requests where id = p_request_id for update;
  if v_req is null or v_req.status <> 'pending' then raise exception 'Request % not found or already resolved', p_request_id; end if;

  select * into v_order from public.orders where id = v_req.order_id;
  if p_actor_id <> v_order.buyer_id and p_actor_id <> v_order.seller_id then
    raise exception 'Only order parties can resolve a file request';
  end if;
  if p_actor_id = v_req.requested_by then
    raise exception 'The requester cannot resolve their own request — the OTHER party must agree';
  end if;

  update public.order_file_requests
    set status = case when p_agree then 'agreed' else 'declined' end, resolved_at = now()
    where id = p_request_id
    returning * into v_req;

  insert into public.order_events (order_id, event_type, actor_id)
  values (v_req.order_id, case when p_agree then 'file_request_agreed' else 'file_request_declined' end, p_actor_id);

  return v_req;
end;
$$ language plpgsql security definer;

revoke execute on function public.request_order_file from public, anon, authenticated;
revoke execute on function public.resolve_order_file_request from public, anon, authenticated;
grant execute on function public.request_order_file to service_role;
grant execute on function public.resolve_order_file_request to service_role;

COMMIT;

-- Notes:
-- 1. Cập nhật docs/supabase/schema.sql phần 4 (bucket order-deliverables)
--    và phần 12 (order_delivered_assets, order_file_requests, 2 hàm mới —
--    phần 12f).
-- 2. Cập nhật src/lib/supabase/types.ts.
-- 3. sharp thêm vào package.json (npm install sharp) — dùng ở
--    src/lib/orders/watermark.ts, KHÔNG chạy trong Postgres (xử lý ảnh ở
--    tầng Next.js route trước khi upload, không phải trigger DB).
