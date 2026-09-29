-- =======================================================================
-- Baseline 09 — Đơn hàng & dịch vụ (commission)  (09_orders_and_services.sql)
-- =======================================================================
-- Phạm vi: service_listings/samples, danh mục tag, orders + máy trạng thái,
-- share bản thảo, bàn giao file (bucket order-deliverables), hoàn
-- tiền/huỷ/mất liên lạc, đứng tên tác giả thay (ghostwriting), độ uy tín +
-- tranh chấp, thân các hàm RPC Order (12j).
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     service_listings, service_samples, orders, order_events,
--     service_tag_options, service_tag_suggestions,
--     manuscript_access_grants, order_delivered_assets, order_file_requests,
--     order_cancel_requests, author_name_agreements, disputes
--   Hàm:
--     prevent_unfinalize_book, lock_manuscript_grants_on_finalize,
--     create_order, set_order_scope, set_order_brief, confirm_order_brief,
--     record_order_payment, submit_order_draft, approve_order_draft,
--     request_order_revision, deliver_order, confirm_order_received,
--     attach_order_book, request_order_file, resolve_order_file_request,
--     calculate_refund, request_order_cancel, resolve_order_cancel_request,
--     record_order_reminder, record_lost_contact_report,
--     initiate_author_name_agreement, confirm_author_name_agreement,
--     recalculate_trust_score, open_dispute, resolve_dispute
--   Kiểu (enum):
--     service_type, order_status
--   Sequence:
--     order_code_seq
--   Storage bucket:
--     order-deliverables
--   Thêm cột vào bảng của file trước:
--     books.{is_ghostwritten, author_display},
--     profiles.{trust_orders_completed, trust_orders_cancelled_at_fault,
--     trust_off_platform_flags, trust_violations_resolved},
--     direct_messages.flagged_off_platform
--
-- Gộp từ migration (migrations/archive/):
--   20260901_add_ghostwriting_authorship.sql,
--   20260901_add_manuscript_share.sql, 20260901_add_order_cancel_system.sql,
--   20260901_add_order_delivery_assets.sql,
--   20260901_add_order_refund_minimum_table.sql,
--   20260901_add_order_system_core.sql,
--   20260901_add_service_tag_catalog.sql,
--   20260901_add_service_tag_option_metadata.sql,
--   20260901_add_trust_and_disputes.sql,
--   20260910_add_service_commission_status.sql,
--   20260924_enforce_order_payment_amounts.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql, 04_wallet_and_payments.sql,
--   06_social_and_messaging.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 12. Hệ thống giao dịch commission (Order/Escrow) — xem
-- migrations/archive/20260901_add_order_payment_transaction_type.sql,
-- 20260901_add_order_earning_transaction_type.sql,
-- 20260901_add_order_system_core.sql. Phase 1: order_events (nhật ký bất
-- biến) + máy trạng thái Order cơ bản + service_listings/service_samples
-- (Mục 2 đặc tả — tạo cùng lúc cho FK, API/UI quản lý là việc phase sau).
-- CHƯA gồm: hoàn tiền tự động, mất liên lạc, bàn giao chi tiết theo loại
-- hình (Share bản thảo ghostwriting), đứng tên tác giả thay,
-- is_ghostwritten, trust score, phát hiện giao dịch ngoài nền tảng,
-- dispute — các phase sau sẽ thêm section con 12d, 12e, ... nối tiếp.
-- ---------------------------------------------------------------------

create type public.service_type as enum ('illustration', 'voice', 'ghostwriting');

-- 11 trường bắt buộc của Mục 2 đặc tả ánh xạ vào các cột dưới đây: 1 name,
-- 2 scope_description, 3 price_tiers, 4 deposit_pct, 5 delivery_days, 6
-- revisions_max, 7 tags (nhóm theo loại hình, chọn từ danh mục cố định do
-- Nền tảng quản lý — validate ở tầng service, KHÔNG ở DB), 8
-- default_usage_scope, 9 refund_policy, 10 lost_contact_days, 11
-- is_private. is_accepting_orders CHỈ được service layer bật khi đủ
-- 11/11 — xem src/lib/orders/service-listing-service.ts (phase sau).
create table public.service_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  service_type public.service_type not null,
  name text not null default '',
  scope_description text not null default '',
  price_tiers jsonb not null default '[]'::jsonb,
  deposit_pct integer,
  delivery_days integer,
  revisions_max integer,
  tags jsonb not null default '{}'::jsonb,
  default_usage_scope text,
  -- null = seller CHƯA tự khai — calculate_refund() (phase sau) dùng bảng
  -- % tối thiểu của Nền tảng làm fallback; số liệu bảng đó CHƯA có.
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

-- Trạng thái "nhận comm" — ĐỘC LẬP với is_accepting_orders (không nằm
-- trong 11 mục bắt buộc để publish). monthly_commission_limit null = seller
-- chưa đặt hạn mức (khi đó is_accepting_commissions không có ý nghĩa gì,
-- route chặn bật). Đếm "đang nhận bao nhiêu comm" theo TỪNG gói riêng —
-- count(*) orders where listing_id=this and status='in_progress', tính
-- trực tiếp lúc đọc, không cache cột riêng. Xem
-- migrations/archive/20260910_add_service_commission_status.sql.
alter table public.service_listings
  add column monthly_commission_limit integer,
  add column is_accepting_commissions boolean not null default false,
  add constraint service_listings_monthly_commission_limit_check
    check (monthly_commission_limit is null or monthly_commission_limit > 0);

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
  unverified_external boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.service_samples enable row level security;

create policy "public can view samples of listings accepting orders"
  on public.service_samples for select
  using (exists (select 1 from public.service_listings l where l.id = listing_id and l.is_accepting_orders = true));

create policy "sellers manage samples of their own listings"
  on public.service_samples for all
  using (exists (select 1 from public.service_listings l where l.id = listing_id and l.seller_id = auth.uid()))
  with check (exists (select 1 from public.service_listings l where l.id = listing_id and l.seller_id = auth.uid()));

create index service_samples_listing_idx on public.service_samples (listing_id);

-- Giữ đủ 8 trạng thái đúng sơ đồ đặc tả (kể cả 'brief_confirmed' và
-- 'deposit_paid' dù thực tế chỉ dừng lại rất ngắn — xem
-- record_order_payment() bên dưới).
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
  usage_scope text,
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
  -- delivered_at + 7 ngày — cron (src/app/api/orders/cron/auto-confirm)
  -- quét cột này.
  auto_confirm_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Nội dung TOS của seller TẠI THỜI ĐIỂM "Bắt đầu giao dịch" — snapshot
  -- thật, không chỉ id.
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
-- thái qua các hàm security definer bên dưới, giống public.transactions.

create index orders_buyer_idx on public.orders (buyer_id);
create index orders_seller_idx on public.orders (seller_id);
create index orders_auto_confirm_idx on public.orders (auto_confirm_at) where status = 'delivered';

-- Nhật ký bất biến — created_at do server sinh, không nhận timestamp từ
-- client.
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users (id),
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

create index order_events_order_idx on public.order_events (order_id, created_at);

-- Hàm máy trạng thái — mỗi hành động 1 hàm riêng, không có hàm "update
-- status trần" nào được phép gọi trực tiếp từ route. Thân đầy đủ 10 hàm
-- (create_order, set_order_scope, set_order_brief, confirm_order_brief,
-- record_order_payment, submit_order_draft, approve_order_draft,
-- request_order_revision, deliver_order, confirm_order_received) nằm ở
-- phần 12j (sau 12i) — đặt sau cùng để mọi bảng/cột order mà chúng dùng
-- đã tồn tại. Gốc: migrations/archive/20260901_add_order_system_core.sql;
-- record_order_payment() là bản của
-- migrations/archive/20260924_enforce_order_payment_amounts.sql (lần trả đầu phải
-- >= round(price * deposit_pct / 100), tổng đã trả không vượt price).

-- 12d. Danh mục tag cố định cho service_listings (Mục 2.2 đặc tả) — xem
-- migrations/archive/20260901_add_service_tag_catalog.sql,
-- scripts/seed_service_tag_options.sql (dữ liệu seed). tier/rule/multi/
-- optional/warn_text thêm bởi migrations/archive/20260901_add_service_tag_option_metadata.sql
-- (đối chiếu lại TAG_GROUPS/VOICE_GROUPS trong Vịnh Cá nhân.dc.html).
create table public.service_tag_options (
  id uuid primary key default gen_random_uuid(),
  service_type public.service_type not null,
  group_key text not null,
  group_label text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  tier text,
  rule text,
  multi boolean not null default true,
  optional boolean not null default false,
  warn_text text,
  unique (service_type, group_key, label)
);

alter table public.service_tag_options enable row level security;

create policy "public can view tag options"
  on public.service_tag_options for select
  using (true);

create index service_tag_options_lookup_idx on public.service_tag_options (service_type, group_key, sort_order);

create table public.service_tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  service_type public.service_type not null,
  group_key text not null,
  label text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.service_tag_suggestions enable row level security;

create policy "users view their own tag suggestions"
  on public.service_tag_suggestions for select
  using (auth.uid() = submitted_by);

create policy "admins view all tag suggestions"
  on public.service_tag_suggestions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index service_tag_suggestions_status_idx on public.service_tag_suggestions (status, created_at);

-- Cờ riêng-tư MỖI ĐƠN (khác is_private của service_listings) — 1 đơn đã
-- completed có được dùng làm sample tự động (Mục 2.2 sample_source='auto')
-- hay không. Mặc định false.
alter table public.orders add column is_private boolean not null default false;

-- 12e. Share bản thảo kiểu Drive (tổng quát cho MỌI truyện ở "Viết
-- truyện", không chỉ ghostwriting) + "Hoàn thiện" — xem
-- migrations/archive/20260901_add_manuscript_share.sql. finalized_at đã gộp vào
-- GRANT UPDATE của books ở trên (phần 3). Cột finalized_at khai báo sẵn
-- trong CREATE TABLE public.books (phần 3).

create function public.prevent_unfinalize_book()
returns trigger as $$
begin
  if old.finalized_at is not null and new.finalized_at is null then
    raise exception 'Không thể bỏ trạng thái Hoàn thiện của một truyện đã hoàn thiện.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger prevent_unfinalize_book_trigger
  before update on public.books
  for each row execute function public.prevent_unfinalize_book();

-- Tối đa 1 grant ĐANG HOẠT ĐỘNG/book — ép ở tầng DB qua partial unique
-- index, đúng ràng buộc "chỉ 1 tài khoản". order_id chỉ có giá trị khi
-- share phát sinh từ 1 đơn ghostwriting (route attach-book).
create table public.manuscript_access_grants (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  order_id uuid references public.orders (id),
  granted_to_user_id uuid not null references auth.users (id) on delete cascade,
  granted_by_user_id uuid not null references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  locked_at timestamptz,
  check (granted_to_user_id <> granted_by_user_id)
);

create unique index manuscript_access_grants_one_active_idx
  on public.manuscript_access_grants (book_id)
  where revoked_at is null and locked_at is null;

alter table public.manuscript_access_grants enable row level security;

create policy "granter and grantee view their own grants"
  on public.manuscript_access_grants for select
  using (auth.uid() = granted_by_user_id or auth.uid() = granted_to_user_id);

create policy "book owner grants access"
  on public.manuscript_access_grants for insert
  with check (
    auth.uid() = granted_by_user_id
    and exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.finalized_at is null)
  );

create policy "book owner revokes access before finalized"
  on public.manuscript_access_grants for update
  using (auth.uid() = granted_by_user_id and locked_at is null)
  with check (auth.uid() = granted_by_user_id and locked_at is null);

grant update (revoked_at) on public.manuscript_access_grants to authenticated;

create index manuscript_access_grants_book_idx on public.manuscript_access_grants (book_id);
create index manuscript_access_grants_grantee_idx on public.manuscript_access_grants (granted_to_user_id) where revoked_at is null;

-- Tự động khóa TOÀN BỘ grant đang hoạt động của 1 book khi "Hoàn thiện" —
-- không route nào tự set locked_at trực tiếp được (không nằm trong GRANT
-- ở trên).
create function public.lock_manuscript_grants_on_finalize()
returns trigger as $$
begin
  if new.finalized_at is not null and old.finalized_at is null then
    update public.manuscript_access_grants
      set locked_at = now()
      where book_id = new.id and revoked_at is null and locked_at is null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger lock_manuscript_grants_on_finalize_trigger
  after update on public.books
  for each row execute function public.lock_manuscript_grants_on_finalize();

-- Order biết đang viết cho truyện nào — chỉ đơn ghostwriting mới gắn.
alter table public.orders add column book_id uuid references public.books (id);

-- attach_order_book(): thân hàm ở phần 12j (bản cuối từ
-- migrations/archive/20260901_add_ghostwriting_authorship.sql).

-- 12f. Bàn giao illustration/voice (Mục 4.1-4.2 đặc tả) — xem
-- migrations/archive/20260901_add_order_delivery_assets.sql. ghostwriting đã
-- xong ở phần 12e (manuscript_access_grants).
insert into storage.buckets (id, name, public)
values ('order-deliverables', 'order-deliverables', false)
on conflict (id) do nothing;

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

create index order_file_requests_order_idx on public.order_file_requests (order_id, status);

-- request_order_file()/resolve_order_file_request(): thân hàm ở phần 12j
-- (từ migrations/archive/20260901_add_order_delivery_assets.sql).

-- 12g. Tính hoàn tiền + Mất liên lạc (Mục 5.1, 5.4 đặc tả) — xem
-- migrations/archive/20260901_add_order_refund_transaction_type.sql,
-- 20260901_add_order_cancel_system.sql. QUAN TRỌNG: từ đây
-- service_listings.refund_policy PHẢI là object 4 key cố định
-- ({"before_draft":70,"draft_pending":40,"draft_approved":15,"delivered":0})
-- thay vì mảng tự do đã mô tả ở phần 12d — xem ghi chú đầu file migration
-- 20260901_add_order_cancel_system.sql. calculate_refund() sau đó được
-- CREATE OR REPLACE bởi migrations/archive/20260901_add_order_refund_minimum_table.sql
-- để thêm bảng % SÀN của Nền tảng khi seller chưa tự khai — vế
-- seller-fault KHÔNG còn là hằng số 100% (bảng sàn thật: 100/90/70/100
-- theo mốc), sửa lại giả định ban đầu chưa được xác nhận.
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

-- calculate_refund()/request_order_cancel()/resolve_order_cancel_request()/
-- record_order_reminder()/record_lost_contact_report(): thân hàm ở phần
-- 12j (gốc migrations/archive/20260901_add_order_cancel_system.sql).

-- 12h. Đứng tên tác giả thay + is_ghostwritten/author_display (Module 5+6
-- đặc tả, yêu cầu bổ sung #2) — xem
-- migrations/archive/20260901_add_ghostwriting_authorship.sql.
alter table public.books
  add column is_ghostwritten boolean not null default false,
  add column author_display text not null default 'pen_name'
    check (author_display in ('pen_name', 'anonymous', 'customer_name', 'co_authorship'));

-- 2 cột này KHÔNG nằm trong GRANT UPDATE của books (phần 3) — chỉ đổi
-- được qua confirm_author_name_agreement()/attach_order_book() (security
-- definer), không client nào PATCH thẳng qua REST API.

-- Mỗi Order ghostwriting tối đa 1 thỏa thuận — 2 bên xác nhận ĐỘC LẬP
-- (không phải request/resolve), bất biến sau khi đủ 2 xác nhận.
create table public.author_name_agreements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  book_id uuid not null references public.books (id),
  ghostwriter_id uuid not null references auth.users (id),
  ghostwriter_confirmed_at timestamptz,
  ghostwriter_statement_text text,
  customer_id uuid not null references auth.users (id),
  customer_confirmed_at timestamptz,
  customer_statement_text text,
  author_display_choice text not null check (author_display_choice in ('customer_name', 'co_authorship')),
  ghostwriter_sample_visible boolean not null default false,
  customer_profile_visible boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.author_name_agreements enable row level security;

create policy "ghostwriter and customer view their own agreement"
  on public.author_name_agreements for select
  using (auth.uid() = ghostwriter_id or auth.uid() = customer_id);

create index author_name_agreements_book_idx on public.author_name_agreements (book_id);

-- initiate_author_name_agreement()/confirm_author_name_agreement(): thân
-- hàm ở phần 12j (từ migrations/archive/20260901_add_ghostwriting_authorship.sql).
-- attach_order_book() (phần 12e) được CREATE OR REPLACE trong migration đó
-- để thêm dòng set is_ghostwritten=true — phần 12j chép bản đó.

-- 12i. Độ uy tín + phát hiện giao dịch ngoài nền tảng + Tranh chấp
-- (Module 7, 8, 9 đặc tả) — xem migrations/archive/20260901_add_trust_and_disputes.sql.
alter table public.profiles
  add column trust_orders_completed integer not null default 0,
  add column trust_orders_cancelled_at_fault integer not null default 0,
  add column trust_off_platform_flags integer not null default 0,
  add column trust_violations_resolved integer not null default 0;

alter table public.direct_messages add column flagged_off_platform boolean not null default false;

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  reporter_id uuid not null references auth.users (id),
  reason_category text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  evidence_snapshot jsonb not null default '{}'::jsonb,
  resolution_note text,
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

-- recalculate_trust_score()/open_dispute()/resolve_dispute(): thân hàm ở
-- phần 12j ngay dưới (từ migrations/archive/20260901_add_trust_and_disputes.sql).
-- confirm_order_received() (phần 12c) và resolve_order_cancel_request()
-- (phần 12g) được CREATE OR REPLACE trong migration đó để gọi thêm
-- recalculate_trust_score() tường minh — phần 12j chép bản đó.

-- ---------------------------------------------------------------------
-- 12j. Thân hàm RPC của hệ thống Order (phần 12c–12i) — trước đây chỉ có
-- ghi chú "xem migration… không lặp lại thân hàm", nay chép đầy đủ BẢN
-- CUỐI của từng hàm để file này tự dựng lại được toàn bộ schema trên 1
-- project trống. Mỗi hàm ghi rõ bản cuối lấy từ migration nào. Tất cả là
-- plpgsql security definer, CHỈ service_role được EXECUTE (route gọi qua
-- createServiceRoleClient()).
-- ---------------------------------------------------------------------

-- --- 12c. Máy trạng thái đơn hàng ---

-- create_order(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.create_order from public, anon, authenticated;
grant execute on function public.create_order to service_role;

-- set_order_scope(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.set_order_scope from public, anon, authenticated;
grant execute on function public.set_order_scope to service_role;

-- set_order_brief(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.set_order_brief from public, anon, authenticated;
grant execute on function public.set_order_brief to service_role;

-- confirm_order_brief(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.confirm_order_brief from public, anon, authenticated;
grant execute on function public.confirm_order_brief to service_role;

-- record_order_payment(): bản cuối từ migrations/archive/20260924_enforce_order_payment_amounts.sql.
create function public.record_order_payment(p_order_id uuid, p_actor_id uuid, p_amount integer)
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

revoke execute on function public.record_order_payment from public, anon, authenticated;
grant execute on function public.record_order_payment to service_role;

-- submit_order_draft(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.submit_order_draft from public, anon, authenticated;
grant execute on function public.submit_order_draft to service_role;

-- approve_order_draft(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.approve_order_draft from public, anon, authenticated;
grant execute on function public.approve_order_draft to service_role;

-- request_order_revision(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.request_order_revision from public, anon, authenticated;
grant execute on function public.request_order_revision to service_role;

-- deliver_order(): bản cuối từ migrations/archive/20260901_add_order_system_core.sql.
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

revoke execute on function public.deliver_order from public, anon, authenticated;
grant execute on function public.deliver_order to service_role;

-- confirm_order_received(): bản cuối từ migrations/archive/20260901_add_trust_and_disputes.sql.
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

  perform public.recalculate_trust_score(v_row.buyer_id);
  perform public.recalculate_trust_score(v_row.seller_id);

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.confirm_order_received from public, anon, authenticated;
grant execute on function public.confirm_order_received to service_role;

-- --- 12e. Gắn truyện vào đơn ghostwriting ---

-- attach_order_book(): bản cuối từ migrations/archive/20260901_add_ghostwriting_authorship.sql.
create function public.attach_order_book(p_order_id uuid, p_actor_id uuid, p_book_id uuid)
returns public.orders as $$
declare
  v_order public.orders;
  v_book public.books;
  v_listing_type public.service_type;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.seller_id <> p_actor_id then raise exception 'Only the seller attaches a manuscript'; end if;
  if v_order.status = 'completed' or v_order.status = 'cancelled' then
    raise exception 'Cannot attach a manuscript to a closed order';
  end if;

  select service_type into v_listing_type from public.service_listings where id = v_order.listing_id;
  if v_listing_type <> 'ghostwriting' then
    raise exception 'Only ghostwriting orders can attach a manuscript';
  end if;

  select * into v_book from public.books where id = p_book_id;
  if v_book is null or v_book.author_id <> p_actor_id then
    raise exception 'Book % not found or not owned by seller', p_book_id;
  end if;

  update public.orders set book_id = p_book_id where id = p_order_id returning * into v_order;
  update public.books set is_ghostwritten = true where id = p_book_id;

  begin
    insert into public.manuscript_access_grants (book_id, order_id, granted_to_user_id, granted_by_user_id)
    values (p_book_id, p_order_id, v_order.buyer_id, p_actor_id);
  exception when unique_violation then
    raise exception 'Truyện này đang được chia sẻ cho một tài khoản khác — gỡ chia sẻ cũ (mục Viết truyện) trước khi gắn vào đơn này.';
  end;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'book_attached', p_actor_id, jsonb_build_object('book_id', p_book_id));

  return v_order;
end;
$$ language plpgsql security definer;

revoke execute on function public.attach_order_book from public, anon, authenticated;
grant execute on function public.attach_order_book to service_role;

-- --- 12f. Bàn giao file gốc ---

-- request_order_file(): bản cuối từ migrations/archive/20260901_add_order_delivery_assets.sql.
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

revoke execute on function public.request_order_file from public, anon, authenticated;
grant execute on function public.request_order_file to service_role;

-- resolve_order_file_request(): bản cuối từ migrations/archive/20260901_add_order_delivery_assets.sql.
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

revoke execute on function public.resolve_order_file_request from public, anon, authenticated;
grant execute on function public.resolve_order_file_request to service_role;

-- --- 12g. Hoàn tiền / huỷ đơn / mất liên lạc ---

-- calculate_refund(): bản cuối từ migrations/archive/20260901_add_order_refund_minimum_table.sql.
create function public.calculate_refund(p_order_id uuid, p_cancelled_by text)
returns jsonb as $$
declare
  v_order public.orders;
  v_policy jsonb;
  v_stage text;
  v_pct integer;
  v_refund integer;
  v_used_platform_minimum boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if p_cancelled_by not in ('buyer', 'seller') then raise exception 'cancelled_by must be buyer or seller'; end if;

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

  if p_cancelled_by = 'buyer' then
    if v_policy is not null and (v_policy ? v_stage) then
      v_pct := (v_policy ->> v_stage)::integer;
    else
      v_used_platform_minimum := true;
      v_pct := case v_stage
        when 'before_draft' then 100
        when 'draft_pending' then 70
        when 'draft_approved' then 40
        when 'delivered' then 10
      end;
    end if;
  else
    -- seller-fault: seller đã tự khai policy nào đó -> vẫn hoàn 100% cố
    -- định (quy ước cũ, luôn >= sàn nên hợp lệ). Chưa khai gì -> áp đúng
    -- bảng sàn seller-fault ở trên (KHÔNG còn hằng số 100% nữa).
    if v_policy is not null then
      v_pct := 100;
    else
      v_used_platform_minimum := true;
      v_pct := case v_stage
        when 'before_draft' then 100
        when 'draft_pending' then 90
        when 'draft_approved' then 70
        when 'delivered' then 100
      end;
    end if;
  end if;

  v_refund := round(v_order.paid * v_pct / 100.0)::integer;

  return jsonb_build_object(
    'stage', v_stage,
    'pct', v_pct,
    'refund_amount', v_refund,
    'seller_amount', v_order.paid - v_refund,
    'cancelled_by', p_cancelled_by,
    -- true = số này lấy từ bảng sàn Nền tảng (seller chưa tự khai đủ cho
    -- mốc/vai trò này), không phải từ TOS riêng của seller — hiển thị rõ
    -- cho 2 bên biết nguồn gốc con số (xem order-card.tsx).
    'used_platform_minimum', v_used_platform_minimum
  );
end;
$$ language plpgsql stable;

revoke execute on function public.calculate_refund from public, anon, authenticated;
grant execute on function public.calculate_refund to service_role;

-- request_order_cancel(): bản cuối từ migrations/archive/20260901_add_order_cancel_system.sql.
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

revoke execute on function public.request_order_cancel from public, anon, authenticated;
grant execute on function public.request_order_cancel to service_role;

-- resolve_order_cancel_request(): bản cuối từ migrations/archive/20260901_add_trust_and_disputes.sql.
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

  perform public.recalculate_trust_score(case when v_req.cancelled_by = 'buyer' then v_order.buyer_id else v_order.seller_id end);

  return v_order;
end;
$$ language plpgsql security definer;

revoke execute on function public.resolve_order_cancel_request from public, anon, authenticated;
grant execute on function public.resolve_order_cancel_request to service_role;

-- record_order_reminder(): bản cuối từ migrations/archive/20260901_add_order_cancel_system.sql.
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

revoke execute on function public.record_order_reminder from public, anon, authenticated;
grant execute on function public.record_order_reminder to service_role;

-- record_lost_contact_report(): bản cuối từ migrations/archive/20260901_add_order_cancel_system.sql.
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

revoke execute on function public.record_lost_contact_report from public, anon, authenticated;
grant execute on function public.record_lost_contact_report to service_role;

-- --- 12h. Thỏa thuận đứng tên tác giả ---

-- initiate_author_name_agreement(): bản cuối từ migrations/archive/20260901_add_ghostwriting_authorship.sql.
create function public.initiate_author_name_agreement(
  p_order_id uuid, p_actor_id uuid, p_choice text,
  p_ghostwriter_sample_visible boolean default false,
  p_customer_profile_visible boolean default false
) returns public.author_name_agreements as $$
declare
  v_order public.orders;
  v_book public.books;
  v_ghostwriter_name text;
  v_customer_name text;
  v_book_title text;
  v_statement text;
  v_row public.author_name_agreements;
begin
  if p_choice not in ('customer_name', 'co_authorship') then
    raise exception 'Invalid author_display choice: %', p_choice;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order % not found', p_order_id; end if;
  if v_order.seller_id <> p_actor_id and v_order.buyer_id <> p_actor_id then
    raise exception 'Only order parties can start an author-name agreement';
  end if;
  if v_order.book_id is null then raise exception 'Order has no attached manuscript'; end if;
  if exists (select 1 from public.author_name_agreements where order_id = p_order_id) then
    raise exception 'An author-name agreement already exists for this order';
  end if;

  select * into v_book from public.books where id = v_order.book_id;
  select nickname into v_ghostwriter_name from public.profiles where id = v_order.seller_id;
  select nickname into v_customer_name from public.profiles where id = v_order.buyer_id;
  v_book_title := v_book.title;

  insert into public.author_name_agreements (
    order_id, book_id, ghostwriter_id, customer_id, author_display_choice,
    ghostwriter_sample_visible, customer_profile_visible
  ) values (
    p_order_id, v_order.book_id, v_order.seller_id, v_order.buyer_id, p_choice,
    p_ghostwriter_sample_visible, p_customer_profile_visible
  ) returning * into v_row;

  -- Bên khởi tạo tự xác nhận phần của mình ngay — statement SINH RIÊNG
  -- theo đúng vai trò (chủ ngữ là chính người xác nhận), y hệt logic ở
  -- confirm_author_name_agreement() bên dưới — không suy ra bằng cách
  -- thay thế chuỗi (dễ sai nếu 2 tên trùng/lồng nhau).
  if p_actor_id = v_order.seller_id then
    v_statement := case p_choice
      when 'customer_name' then format('Tôi, %s, đồng ý để %s đứng tên tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
    end;
    update public.author_name_agreements
      set ghostwriter_confirmed_at = now(), ghostwriter_statement_text = v_statement
      where id = v_row.id returning * into v_row;
  else
    v_statement := case p_choice
      when 'customer_name' then format('Tôi, %s, đồng ý đứng tên tác giả công khai đối với tác phẩm "%s" do %s viết hộ.', v_customer_name, v_book_title, v_ghostwriter_name)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_customer_name, v_ghostwriter_name, v_book_title)
    end;
    update public.author_name_agreements
      set customer_confirmed_at = now(), customer_statement_text = v_statement
      where id = v_row.id returning * into v_row;
  end if;

  insert into public.order_events (order_id, event_type, actor_id, payload)
  values (p_order_id, 'author_name_agreement_initiated', p_actor_id, jsonb_build_object('choice', p_choice));

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.initiate_author_name_agreement from public, anon, authenticated;
grant execute on function public.initiate_author_name_agreement to service_role;

-- confirm_author_name_agreement(): bản cuối từ migrations/archive/20260901_add_ghostwriting_authorship.sql.
create function public.confirm_author_name_agreement(p_agreement_id uuid, p_actor_id uuid)
returns public.author_name_agreements as $$
declare
  v_row public.author_name_agreements;
  v_order public.orders;
  v_ghostwriter_name text;
  v_customer_name text;
  v_book_title text;
  v_statement text;
begin
  select * into v_row from public.author_name_agreements where id = p_agreement_id for update;
  if v_row is null then raise exception 'Agreement % not found', p_agreement_id; end if;
  if v_row.ghostwriter_confirmed_at is not null and v_row.customer_confirmed_at is not null then
    raise exception 'Agreement already fully confirmed — immutable';
  end if;

  select nickname into v_ghostwriter_name from public.profiles where id = v_row.ghostwriter_id;
  select nickname into v_customer_name from public.profiles where id = v_row.customer_id;
  select title into v_book_title from public.books where id = v_row.book_id;

  if p_actor_id = v_row.ghostwriter_id and v_row.ghostwriter_confirmed_at is null then
    v_statement := case v_row.author_display_choice
      when 'customer_name' then format('Tôi, %s, đồng ý để %s đứng tên tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_ghostwriter_name, v_customer_name, v_book_title)
    end;
    update public.author_name_agreements
      set ghostwriter_confirmed_at = now(), ghostwriter_statement_text = v_statement
      where id = p_agreement_id returning * into v_row;
  elsif p_actor_id = v_row.customer_id and v_row.customer_confirmed_at is null then
    v_statement := case v_row.author_display_choice
      when 'customer_name' then format('Tôi, %s, đồng ý đứng tên tác giả công khai đối với tác phẩm "%s" do %s viết hộ.', v_customer_name, v_book_title, v_ghostwriter_name)
      else format('Tôi, %s, đồng ý cùng %s đứng tên đồng tác giả công khai đối với tác phẩm "%s".', v_customer_name, v_ghostwriter_name, v_book_title)
    end;
    update public.author_name_agreements
      set customer_confirmed_at = now(), customer_statement_text = v_statement
      where id = p_agreement_id returning * into v_row;
  else
    raise exception 'Actor % has no pending confirmation on this agreement', p_actor_id;
  end if;

  select * into v_order from public.orders where id = v_row.order_id;
  insert into public.order_events (order_id, event_type, actor_id)
  values (v_row.order_id, 'author_name_agreement_confirmed', p_actor_id);

  if v_row.ghostwriter_confirmed_at is not null and v_row.customer_confirmed_at is not null then
    update public.books set author_display = v_row.author_display_choice where id = v_row.book_id;
    insert into public.order_events (order_id, event_type, actor_id, payload)
    values (v_row.order_id, 'author_name_agreement_finalized', null, jsonb_build_object('choice', v_row.author_display_choice));
  end if;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.confirm_author_name_agreement from public, anon, authenticated;
grant execute on function public.confirm_author_name_agreement to service_role;

-- --- 12i. Độ uy tín + tranh chấp ---

-- recalculate_trust_score(): bản cuối từ migrations/archive/20260901_add_trust_and_disputes.sql.
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

-- open_dispute(): bản cuối từ migrations/archive/20260901_add_trust_and_disputes.sql.
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

revoke execute on function public.open_dispute from public, anon, authenticated;
grant execute on function public.open_dispute to service_role;

-- resolve_dispute(): bản cuối từ migrations/archive/20260901_add_trust_and_disputes.sql.
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

revoke execute on function public.resolve_dispute from public, anon, authenticated;
grant execute on function public.resolve_dispute to service_role;

create index if not exists orders_listing_status_idx
  on public.orders (listing_id, status);
create index if not exists author_name_agreements_ghostwriter_idx
  on public.author_name_agreements (ghostwriter_id);
create index if not exists author_name_agreements_customer_idx
  on public.author_name_agreements (customer_id);
