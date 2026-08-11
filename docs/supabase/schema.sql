-- Vịnh — starter Supabase schema.
--
-- Scope: covers accounts/roles, identity verification (CCCD upload),
-- a minimal books/chapters model, token wallet + transaction history,
-- daily tasks, and vector-based book recommendations. Still NOT modeled:
-- audio, blog, connect directory, rankings, chat — those are still mock
-- data in src/lib/*.ts; add tables for them the same way as you wire each
-- section up for real.
--
-- Run with: supabase db push  (or paste into the SQL editor)

-- ---------------------------------------------------------------------
-- 1. Roles & profiles
-- ---------------------------------------------------------------------
-- Mirrors src/lib/auth.ts's Role type. "author" is new — the current
-- frontend only distinguishes reader/admin (see auth.ts); add it once you
-- Mirrors src/lib/auth.ts's Role type — cập nhật lại 3 cấp:
--   'user'        — mặc định cho mọi người mới đăng ký. Tác giả, họa sĩ,
--                    diễn viên lồng tiếng KHÔNG phải role riêng — đó chỉ
--                    là tag mô tả (cột creator_tags bên dưới), ai cũng tự
--                    gắn được cho mình, không cần ai duyệt, vì tag không
--                    mang quyền hạn gì (khác hẳn role).
--   'admin'        — quản trị nội dung/người dùng hàng ngày.
--   'super_admin'  — mọi quyền của admin, CỘNG THÊM quyền duy nhất được
--                    đổi role của bất kỳ ai (kể cả phong thêm admin khác).
--                    Không có super_admin, hệ thống rơi vào tình huống
--                    admin có thể tự phong admin khác vô hạn — xem trigger
--                    ở phần 5.
create type public.user_role as enum ('user', 'admin', 'super_admin');

-- Tag mô tả vai trò sáng tác — KHÔNG phải quyền hạn hệ thống, giống hệt
-- tag thể loại truyện: tự gắn, gắn nhiều cái cùng lúc, không ảnh hưởng gì
-- tới RLS hay quyền truy cập. Một user có thể vừa là tác giả vừa là diễn
-- viên lồng tiếng cùng lúc — mảng cho phép nhiều giá trị.
create type public.creator_tag as enum ('author', 'illustrator', 'narrator');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  nickname text not null,
  avatar_url text, -- công khai — path trong bucket "avatars" (thêm ở phần 4) hoặc URL ngoài
  role public.user_role not null default 'user',
  creator_tags public.creator_tag[] not null default '{}',
  real_name text,
  phone text,
  cccd_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by their owner and admins"
  on public.profiles for select
  using (auth.uid() = id or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create policy "users can update their own profile (not their own role)"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
  -- creator_tags sửa thoải mái qua policy này (không mang quyền hạn gì).
  -- role thì KHÔNG — dù policy này về lý thuyết cho sửa mọi cột của hàng
  -- mình, cột role bị chặn riêng bằng trigger ở phần 5 (RLS không diễn tả
  -- được "cho sửa cột này, cấm sửa cột kia" trong cùng 1 policy).

-- A separate public-facing view for author pages / by-lines, so the app
-- never needs to select from `profiles` directly for anything visitor-facing
-- (keeps phone/real_name/cccd_verified out of reach by construction).
-- Không lọc theo role — mọi user (kể cả role='user' thường, có gắn tag
-- creator_tags hay không) đều cần username/nickname/avatar hiện công khai.
create view public.author_public_profiles as
  select id, username, nickname, avatar_url, creator_tags
  from public.profiles;

-- ---------------------------------------------------------------------
-- 2. Identity verification (CCCD)
-- ---------------------------------------------------------------------
-- Deliberately NOT part of `profiles`. This table holds the sensitive
-- fields — keeping them separate means the much-more-frequently-queried
-- `profiles` table (used for every by-line, comment, session check) never
-- has sensitive columns to accidentally over-select.
--
-- cccd_number: store only if you have a real compliance reason to keep it
-- queryable (e.g. matching against a registry). Prefer hashing it
-- (e.g. hmac with a server-only pepper) over storing it in the clear —
-- swap the column for `cccd_number_hash text` if you don't need the raw
-- value after verification.
--
-- cccd_front_path / cccd_back_path: paths into a PRIVATE storage bucket
-- (see section 4), never a public one. The app should only ever generate
-- short-lived signed URLs for these, server-side, for an admin reviewing
-- a dispute — never expose them to the reading/browsing UI.
create type public.verification_status as enum ('pending', 'approved', 'rejected');

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cccd_number text not null,
  cccd_front_path text not null,
  cccd_back_path text not null,
  status public.verification_status not null default 'pending',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.identity_verifications enable row level security;

create policy "users can view their own verification status"
  on public.identity_verifications for select
  using (auth.uid() = user_id);

create policy "users can submit their own verification"
  on public.identity_verifications for insert
  with check (auth.uid() = user_id);

create policy "admins can view and review all verifications"
  on public.identity_verifications for all
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

-- Data-retention note (Nghị định 13/2023/NĐ-CP): define how long a
-- rejected/expired verification's CCCD images are kept, then enforce it
-- with a scheduled job (Supabase Cron + Edge Function) that deletes the
-- storage objects and nulls out cccd_number for rows past that window —
-- RLS controls *who* can read this table, not *how long* the data lives.

-- ---------------------------------------------------------------------
-- 3. Books & chapters (minimal starting model for author + reading flows)
-- ---------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  slug text unique not null,
  synopsis text,
  -- Không có cột ảnh bìa ở đây — cột `cover_design_item_id` được thêm
  -- bằng ALTER TABLE ở phần 9, sau khi bảng design_items tồn tại (không
  -- thể tham chiếu forward tới 1 bảng chưa được tạo).
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

create policy "published books are public"
  on public.books for select
  using (published or auth.uid() = author_id);

create policy "authors manage their own books"
  on public.books for insert
  with check (auth.uid() = author_id);

create policy "authors update their own books"
  on public.books for update
  using (auth.uid() = author_id);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  title text not null,
  content text not null,
  order_index integer not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.chapters enable row level security;

create policy "published chapters follow their book's visibility"
  on public.chapters for select
  using (
    published and exists (select 1 from public.books b where b.id = book_id and b.published)
    or exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid())
  );

create policy "authors manage chapters on their own books"
  on public.chapters for insert
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()));

create policy "authors update chapters on their own books"
  on public.chapters for update
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Storage buckets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('identity-documents', 'identity-documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
-- Không còn bucket 'book-covers' riêng — ảnh bìa giờ đi qua kho thiết kế
-- dùng chung (bucket 'design-images', tạo ở phần 9), vì bìa sách cũng chỉ
-- là 1 "design_item" như minh hoạ khác, được books.cover_design_item_id
-- trỏ tới.

create policy "users upload their own identity documents"
  on storage.objects for insert
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users and admins read identity documents appropriately"
  on storage.objects for select
  using (
    bucket_id = 'identity-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
    )
  );

create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload and replace their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- 5. Chỉ super_admin được đổi role của bất kỳ ai
-- ---------------------------------------------------------------------
-- Bản trước chỉ chặn "không tự đổi role của chính mình" — vẫn còn lỗ
-- hổng: 1 admin thường vẫn đổi được role của NGƯỜI KHÁC (kể cả tự phong
-- thêm admin khác, hoặc phong ai đó lên admin tùy ý). Giờ chặt hơn: đổi
-- role — của bất kỳ ai, kể cả role của chính mình — chỉ hợp lệ nếu người
-- thực hiện đang có role = 'super_admin'.
create function public.enforce_role_change_authority()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null nghĩa là câu lệnh chạy ngoài phiên người dùng
    -- thường (SQL Editor với quyền postgres, script dùng service role
    -- key, migration) — coi là ngữ cảnh tin cậy, cho qua. Đây cũng là
    -- cách duy nhất để tạo super_admin ĐẦU TIÊN (xem hướng dẫn cuối phần
    -- này), vì lúc đó chưa ai có role super_admin để tự cấp cho người
    -- khác qua app được.
    if auth.uid() is not null and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'
    ) then
      raise exception 'Only a super_admin can change a role';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger enforce_role_change_authority
  before update on public.profiles
  for each row execute function public.enforce_role_change_authority();

-- Bootstrap super_admin đầu tiên (chạy 1 lần, trong SQL Editor — auth.uid()
-- ở đó là null nên đi qua được trigger trên):
--   update public.profiles set role = 'super_admin' where id = '<uuid của bạn>';
-- Từ sau đó, mọi thay đổi role khác phải đi qua session đăng nhập thật
-- của 1 super_admin (ví dụ 1 trang admin panel gọi update bằng chính
-- phiên đăng nhập của họ) — không dùng SQL Editor cho việc thường xuyên,
-- chỉ dùng đúng 1 lần lúc khởi tạo.

-- =======================================================================
-- Phần bổ sung: ví token & lịch sử giao dịch, nhiệm vụ hàng ngày, gợi ý
-- truyện. Ba phần độc lập, thêm phần nào cần trước cũng được.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 6. Ví token & lịch sử giao dịch
-- ---------------------------------------------------------------------
-- Thiết kế cố ý: KHÔNG cho user tự insert vào `transactions`. Nếu cho
-- phép insert trực tiếp (dù có RLS "chỉ insert cho chính mình"), user vẫn
-- có thể tự cộng token cho bản thân bằng cách gửi amount dương. Mọi thay
-- đổi số dư phải đi qua hàm `apply_transaction()` bên dưới — hàm này
-- security definer, chỉ gọi được từ code server tin cậy (route handler
-- dùng service role, hoặc từ trigger/hàm khác trong DB như
-- `claim_daily_task`), không bao giờ expose để client gọi RPC trực tiếp
-- với amount tự chọn.

alter table public.profiles add column token_balance integer not null default 0;
-- Doanh thu chia sẻ tác giả (purchase_credit) còn trong hold period — xem
-- phần 6b. Hiện ra cho user thấy, nhưng KHÔNG tiêu/rút được cho tới khi
-- settle_due_pending_transactions() chuyển sang token_balance.
alter table public.profiles add column token_balance_pending integer not null default 0 check (token_balance_pending >= 0);
alter table public.profiles add column screenshot_penalty_count integer not null default 0;
alter table public.profiles add column screenshot_penalty_expires_at timestamptz;
alter table public.profiles add column screenshot_penalty_banned boolean not null default false;
alter table public.profiles add column screenshot_penalty_last_offense_at timestamptz;

create type public.transaction_type as enum (
  'signup_bonus', 'daily_task_reward', 'purchase_chapter', 'topup', 'refund', 'admin_adjustment', 'screenshot_penalty',
  -- 'purchase_chapter' ở trên là vế trừ của người mua; 'purchase_credit' là
  -- vế cộng (pending) cho tác giả — xem phần 6e — tách riêng để không bao
  -- giờ lẫn 2 chiều của 1 giao dịch khi rà lịch sử.
  'purchase_credit', 'withdrawal', 'platform_bonus'
);

create type public.transaction_status as enum (
  'pending',    -- đã cộng vào token_balance_pending, chưa tiêu/rút được
  'processing', -- đã trừ/cộng token_balance rồi, đang chờ xác nhận từ bên ngoài (payout)
  'available',  -- 1 entry pending đã tới hạn và được settle
  'completed',  -- trạng thái cuối, bình thường cho mọi entry ngay-lập-tức
  'failed',     -- lời gọi ngoài (payout) thất bại, đã hoàn tiền
  'reversed'    -- entry bị đảo ngược sau đó bởi 1 refund/tranh chấp
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  amount integer not null, -- dương = cộng, âm = trừ
  penalty_percent numeric not null default 0,
  balance_after integer not null, -- snapshot token_balance sau giao dịch, phục vụ đối soát
  -- snapshot token_balance_pending sau giao dịch — null trừ khi status='pending'.
  pending_balance_after integer,
  status public.transaction_status not null default 'completed',
  available_at timestamptz, -- khi nào 1 entry 'pending' được settle — null nếu available ngay
  -- liên kết 2 chiều: vế purchase_chapter <-> purchase_credit của 1 giao
  -- dịch mua, hoặc vế withdrawal <-> refund nếu payout thất bại.
  related_transaction_id uuid references public.transactions (id),
  reference_type text, -- 'chapter' | 'daily_task' | 'topup_order' | 'withdrawal_request' | 'platform_bonus' | null
  reference_id uuid,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "users view their own transaction history"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "admins view all transactions"
  on public.transactions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index transactions_pending_due_idx on public.transactions (available_at) where status = 'pending';

-- Không có policy insert/update cho role "authenticated" — mặc định deny.
-- Chỉ service role (bypass RLS) hoặc hàm security definer dưới đây được ghi.

-- p_status/p_available_at/p_related_transaction_id đều có default nên mọi
-- lời gọi cũ (signup_bonus lúc đăng ký, claim_daily_task, penalty route)
-- không cần đổi gì. p_status='pending' rẽ nhánh sang token_balance_pending
-- thay vì token_balance, và bỏ qua kiểm tra "đủ số dư" — 1 entry pending
-- luôn là 1 khoản cộng (doanh thu tác giả), không bao giờ là khoản trừ.
create function public.apply_transaction(
  p_user_id uuid,
  p_type public.transaction_type,
  p_amount integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_penalty_percent numeric default 0,
  p_status public.transaction_status default 'completed',
  p_available_at timestamptz default null,
  p_related_transaction_id uuid default null
) returns public.transactions as $$
declare
  v_new_balance integer;
  v_new_pending integer;
  v_row public.transactions;
begin
  if p_status = 'pending' then
    if p_amount <= 0 then
      raise exception 'Pending entries must be credits (amount > 0), got %', p_amount;
    end if;
    if p_available_at is null then
      raise exception 'p_available_at is required when p_status = pending';
    end if;

    update public.profiles
      set token_balance_pending = token_balance_pending + p_amount
      where id = p_user_id
      returning token_balance_pending into v_new_pending;

    if v_new_pending is null then
      raise exception 'User % not found', p_user_id;
    end if;

    select token_balance into v_new_balance from public.profiles where id = p_user_id;

    insert into public.transactions (
      user_id, type, amount, penalty_percent, balance_after, pending_balance_after,
      reference_type, reference_id, status, available_at, related_transaction_id
    )
    values (
      p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance, v_new_pending,
      p_reference_type, p_reference_id, p_status, p_available_at, p_related_transaction_id
    )
    returning * into v_row;

    return v_row;
  end if;

  update public.profiles
    set token_balance = token_balance + p_amount
    where id = p_user_id
    returning token_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'User % not found', p_user_id;
  end if;
  if v_new_balance < 0 then
    raise exception 'Insufficient balance for user %', p_user_id;
  end if;

  insert into public.transactions (
    user_id, type, amount, penalty_percent, balance_after,
    reference_type, reference_id, status, related_transaction_id
  )
  values (
    p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance,
    p_reference_type, p_reference_id, p_status, p_related_transaction_id
  )
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- Ví dụ gọi từ route /api/auth/register sau khi tạo user (dùng service role client):
--   await supabase.rpc('apply_transaction', {
--     p_user_id: newUser.id, p_type: 'signup_bonus', p_amount: 100,
--   });

-- ---------------------------------------------------------------------
-- 6b. Job chuyển pending -> available (chạy định kỳ, xem vercel.json +
-- src/app/api/wallet/cron/settle-pending)
-- ---------------------------------------------------------------------
-- Settle đúng 1 row, có row lock — 1 request đọc/hoàn tiền đúng entry này
-- (xem refund trong mark_withdrawal_result, phần 6d) không thể đụng job
-- này cùng lúc. Trả về null (không raise) nếu row hết hạn 'due' ngay lúc
-- lấy được lock, để hàm gọi theo batch dưới đây bỏ qua thay vì abort batch.
create function public.settle_pending_transaction(p_transaction_id uuid)
returns public.transactions as $$
declare
  v_txn public.transactions;
begin
  select * into v_txn from public.transactions where id = p_transaction_id for update;

  if v_txn is null or v_txn.status <> 'pending' or v_txn.available_at > now() then
    return null;
  end if;

  update public.profiles
    set token_balance = token_balance + v_txn.amount,
        token_balance_pending = token_balance_pending - v_txn.amount
    where id = v_txn.user_id;

  update public.transactions set status = 'available' where id = v_txn.id returning * into v_txn;

  return v_txn;
end;
$$ language plpgsql security definer;

create function public.settle_due_pending_transactions(p_limit integer default 500)
returns setof public.transactions as $$
declare
  v_id uuid;
  v_result public.transactions;
begin
  for v_id in
    select id from public.transactions
    where status = 'pending' and available_at <= now()
    order by available_at
    limit p_limit
  loop
    v_result := public.settle_pending_transaction(v_id);
    if v_result is not null then
      return next v_result;
    end if;
  end loop;
  return;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 6c. Nạp tiền — gateway-agnostic (chưa gắn cổng thanh toán thật)
-- ---------------------------------------------------------------------
create type public.deposit_status as enum ('pending', 'success', 'failed');

create table public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_gateway text not null, -- 'vnpay' | 'payos' | 'momo' | 'stub' — xem src/lib/wallet/deposit-service.ts
  gateway_order_id text not null,
  amount_vnd integer not null check (amount_vnd > 0),
  token_amount integer not null check (token_amount > 0),
  status public.deposit_status not null default 'pending',
  raw_payload jsonb,
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (payment_gateway, gateway_order_id)
);

alter table public.deposit_transactions enable row level security;

create policy "users view their own deposits"
  on public.deposit_transactions for select
  using (auth.uid() = user_id);

create policy "admins view all deposits"
  on public.deposit_transactions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update — webhook handler ghi hoàn toàn qua service role.

-- ---------------------------------------------------------------------
-- 6d. Rút tiền
-- ---------------------------------------------------------------------
create type public.withdrawal_status as enum ('pending', 'processing', 'success', 'failed');

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_tokens integer not null check (amount_tokens > 0),
  amount_vnd integer not null check (amount_vnd > 0), -- amount_tokens * TOKEN_TO_VND_RATE lúc tạo request
  bank_account_number text not null,
  bank_account_name text not null,
  bank_code text not null,
  status public.withdrawal_status not null default 'pending',
  payout_gateway_ref text,
  failure_reason text,
  transaction_id uuid not null references public.transactions (id),
  refund_transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.withdrawal_requests enable row level security;

create policy "users view their own withdrawal requests"
  on public.withdrawal_requests for select
  using (auth.uid() = user_id);

create policy "admins view all withdrawal requests"
  on public.withdrawal_requests for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index withdrawal_requests_user_month_idx on public.withdrawal_requests (user_id, created_at);

-- Atomic: trừ token_balance (status='processing' — tiền đã ra khỏi số dư
-- khả dụng nhưng payout API chưa xác nhận) + tạo request, trong 1 lời gọi.
create function public.create_withdrawal_request(
  p_user_id uuid,
  p_amount_tokens integer,
  p_amount_vnd integer,
  p_bank_account_number text,
  p_bank_account_name text,
  p_bank_code text
) returns public.withdrawal_requests as $$
declare
  v_txn public.transactions;
  v_request public.withdrawal_requests;
begin
  v_txn := public.apply_transaction(
    p_user_id, 'withdrawal', -p_amount_tokens,
    'withdrawal_request', null, 0, 'processing'
  );

  insert into public.withdrawal_requests (
    user_id, amount_tokens, amount_vnd, bank_account_number, bank_account_name, bank_code, transaction_id, status
  )
  values (p_user_id, p_amount_tokens, p_amount_vnd, p_bank_account_number, p_bank_account_name, p_bank_code, v_txn.id, 'processing')
  returning * into v_request;

  update public.transactions set reference_id = v_request.id where id = v_txn.id;

  return v_request;
end;
$$ language plpgsql security definer;

-- Idempotent — no-op nếu request không còn 'processing' (đã được 1 lời
-- gọi callback trước đó xử lý), nhờ row lock + kiểm tra status ngay sau.
create function public.mark_withdrawal_result(
  p_request_id uuid,
  p_success boolean,
  p_gateway_ref text default null,
  p_failure_reason text default null
) returns public.withdrawal_requests as $$
declare
  v_request public.withdrawal_requests;
  v_refund public.transactions;
begin
  select * into v_request from public.withdrawal_requests where id = p_request_id for update;
  if v_request is null then
    raise exception 'Withdrawal request % not found', p_request_id;
  end if;

  if v_request.status <> 'processing' then
    return v_request;
  end if;

  if p_success then
    update public.transactions set status = 'completed' where id = v_request.transaction_id;
    update public.withdrawal_requests
      set status = 'success', payout_gateway_ref = p_gateway_ref, processed_at = now()
      where id = p_request_id
      returning * into v_request;
  else
    update public.transactions set status = 'failed' where id = v_request.transaction_id;

    -- Hoàn tiền = 1 entry ledger mới (append-only), không sửa entry gốc.
    v_refund := public.apply_transaction(
      v_request.user_id, 'refund', v_request.amount_tokens,
      'withdrawal_request', p_request_id, 0, 'completed', null, v_request.transaction_id
    );

    update public.withdrawal_requests
      set status = 'failed', failure_reason = p_failure_reason, refund_transaction_id = v_refund.id, processed_at = now()
      where id = p_request_id
      returning * into v_request;
  end if;

  return v_request;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 6e. Mua chương (chia sẻ doanh thu tác giả) & thưởng nền tảng
-- ---------------------------------------------------------------------
create table public.purchase_transactions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null,
  amount integer not null check (amount > 0),
  author_share integer not null check (author_share >= 0),
  platform_share integer not null check (platform_share >= 0),
  debit_transaction_id uuid not null references public.transactions (id),
  credit_transaction_id uuid not null references public.transactions (id),
  created_at timestamptz not null default now(),
  check (author_share + platform_share = amount)
);

alter table public.purchase_transactions enable row level security;

create policy "buyers view their own purchases"
  on public.purchase_transactions for select
  using (auth.uid() = buyer_id);

create policy "authors view sales of their own content"
  on public.purchase_transactions for select
  using (auth.uid() = author_id);

create policy "admins view all purchases"
  on public.purchase_transactions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Platform commission không đi qua ví ai — nó đã nằm trong tài khoản ngân
-- hàng công ty từ lúc buyer nạp tiền. Bảng này chỉ để báo cáo doanh thu.
create table public.platform_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  purchase_transaction_id uuid not null references public.purchase_transactions (id),
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.platform_revenue_entries enable row level security;

create policy "admins view platform revenue"
  on public.platform_revenue_entries for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- 1 lời gọi, 1 DB transaction: trừ buyer, cộng pending cho author (bắt đầu
-- tính hold period), ghi platform commission, link 2 chiều.
create function public.create_purchase(
  p_buyer_id uuid,
  p_author_id uuid,
  p_chapter_id uuid,
  p_amount integer,
  p_author_share integer,
  p_platform_share integer,
  p_hold_days integer
) returns public.purchase_transactions as $$
declare
  v_debit public.transactions;
  v_credit public.transactions;
  v_purchase public.purchase_transactions;
  v_available_at timestamptz := now() + (p_hold_days || ' days')::interval;
begin
  if p_author_share + p_platform_share <> p_amount then
    raise exception 'author_share (%) + platform_share (%) must equal amount (%)', p_author_share, p_platform_share, p_amount;
  end if;

  v_debit := public.apply_transaction(p_buyer_id, 'purchase_chapter', -p_amount, 'chapter', p_chapter_id);

  v_credit := public.apply_transaction(
    p_author_id, 'purchase_credit', p_author_share, 'chapter', p_chapter_id,
    0, 'pending', v_available_at, v_debit.id
  );

  update public.transactions set related_transaction_id = v_credit.id where id = v_debit.id;

  insert into public.purchase_transactions (
    buyer_id, author_id, chapter_id, amount, author_share, platform_share,
    debit_transaction_id, credit_transaction_id
  )
  values (p_buyer_id, p_author_id, p_chapter_id, p_amount, p_author_share, p_platform_share, v_debit.id, v_credit.id)
  returning * into v_purchase;

  insert into public.platform_revenue_entries (purchase_transaction_id, amount)
  values (v_purchase.id, p_platform_share);

  return v_purchase;
end;
$$ language plpgsql security definer;

-- Thưởng cuộc thi / bonus công ty — quỹ công ty, không hold, không trừ
-- token của ai. Audit trail (ai duyệt, vì sao) nằm ở bảng riêng dưới đây,
-- không lẫn vào doanh thu chia sẻ tác giả khi báo cáo tài chính.
create table public.platform_bonus_grants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid not null references auth.users (id),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_bonus_grants enable row level security;

create policy "recipients view their own bonus grants"
  on public.platform_bonus_grants for select
  using (auth.uid() = recipient_id);

create policy "admins view all bonus grants"
  on public.platform_bonus_grants for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- p_admin_id được kiểm tra role NGAY TRONG hàm (defense in depth) — route
-- handler phải gate theo session trước, nhưng vì đây là security definer
-- và gọi được qua service role (bypass RLS hoàn toàn), check không thể chỉ
-- nằm ở RLS.
create function public.grant_platform_bonus(
  p_admin_id uuid,
  p_recipient_id uuid,
  p_amount integer,
  p_reason text
) returns public.transactions as $$
declare
  v_txn public.transactions;
begin
  if p_amount <= 0 then
    raise exception 'Bonus amount must be positive, got %', p_amount;
  end if;
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'User % is not authorized to grant platform bonuses', p_admin_id;
  end if;

  v_txn := public.apply_transaction(p_recipient_id, 'platform_bonus', p_amount, 'platform_bonus', null);

  insert into public.platform_bonus_grants (transaction_id, recipient_id, granted_by, reason)
  values (v_txn.id, p_recipient_id, p_admin_id, p_reason);

  update public.transactions set reference_id = (
    select id from public.platform_bonus_grants where transaction_id = v_txn.id
  ) where id = v_txn.id;

  return v_txn;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 7. Nhiệm vụ hàng ngày
-- ---------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, -- vd 'read_3_chapters', dùng để logic app nhận diện
  title text not null,
  description text,
  target_count integer not null default 1,
  reward_tokens integer not null default 0,
  active boolean not null default true
);

alter table public.task_templates enable row level security;

-- Đây là định nghĩa nhiệm vụ (không phải dữ liệu riêng tư của ai), nên cho
-- mọi người đã đăng nhập đọc — cần thiết để hiện danh sách nhiệm vụ trong
-- app. Chỉ admin mới được thêm/sửa/xoá loại nhiệm vụ.
create policy "authenticated users can view active task templates"
  on public.task_templates for select
  to authenticated
  using (active);

create policy "admins manage task templates"
  on public.task_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.task_templates (id) on delete cascade,
  task_date date not null default current_date,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, template_id, task_date)
);

alter table public.user_daily_tasks enable row level security;

create policy "users view their own daily tasks"
  on public.user_daily_tasks for select
  using (auth.uid() = user_id);

-- Không cho user tự update completed/claimed trực tiếp — đi qua 2 hàm dưới.

-- Gọi khi user có hành động liên quan (đọc xong 1 chương, v.v.) — tự tạo
-- dòng nhiệm vụ hôm nay nếu chưa có (lazy-create, không cần chờ cron),
-- cộng dồn progress, tự đánh dấu completed khi đủ target_count.
create function public.increment_task_progress(p_user_id uuid, p_task_code text, p_amount integer default 1)
returns public.user_daily_tasks as $$
declare
  v_template public.task_templates;
  v_row public.user_daily_tasks;
begin
  select * into v_template from public.task_templates where code = p_task_code and active;
  if v_template is null then
    raise exception 'Unknown or inactive task code: %', p_task_code;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, current_date)
  on conflict (user_id, template_id, task_date) do nothing;

  update public.user_daily_tasks
    set progress = least(progress + p_amount, v_template.target_count),
        completed = (progress + p_amount) >= v_template.target_count
    where user_id = p_user_id and template_id = v_template.id and task_date = current_date
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- Gọi khi user bấm "nhận thưởng" trên UI — kiểm tra đã hoàn thành & chưa
-- nhận trước khi cộng token, tránh nhận thưởng 2 lần.
create function public.claim_daily_task(p_user_id uuid, p_task_id uuid)
returns public.transactions as $$
declare
  v_task public.user_daily_tasks;
  v_template public.task_templates;
begin
  select * into v_task from public.user_daily_tasks where id = p_task_id and user_id = p_user_id;
  if v_task is null then
    raise exception 'Task not found';
  end if;
  if not v_task.completed then
    raise exception 'Task not completed yet';
  end if;
  if v_task.claimed then
    raise exception 'Task already claimed';
  end if;

  select * into v_template from public.task_templates where id = v_task.template_id;

  update public.user_daily_tasks set claimed = true where id = p_task_id;

  return public.apply_transaction(p_user_id, 'daily_task_reward', v_template.reward_tokens, 'daily_task', p_task_id);
end;
$$ language plpgsql security definer;

-- Tuỳ chọn: nếu muốn nhiệm vụ được TẠO SẴN cho mọi user lúc 0h (thay vì
-- lazy-create ở lần hành động đầu tiên trong ngày — cách trên đã đủ dùng,
-- phần này chỉ cần nếu bạn muốn hiện danh sách nhiệm vụ "trống, chưa làm"
-- ngay khi user mở app buổi sáng mà chưa hành động gì):
--
-- select cron.schedule('generate-daily-tasks', '0 0 * * *', $$
--   insert into public.user_daily_tasks (user_id, template_id, task_date)
--   select p.id, t.id, current_date
--   from public.profiles p cross join public.task_templates t
--   where t.active
--   on conflict (user_id, template_id, task_date) do nothing;
-- $$);
--
-- Cần bật extension pg_cron trước (Database → Extensions trong Supabase
-- dashboard), và cân nhắc chi phí insert nếu số lượng user lớn.

-- ---------------------------------------------------------------------
-- 8. Gợi ý truyện (pgvector)
-- ---------------------------------------------------------------------
-- Bật extension pgvector (Database → Extensions, hoặc chạy lệnh dưới nếu
-- role của bạn có quyền).
create extension if not exists vector;

-- Kích thước vector tuỳ model embedding bạn dùng để sinh (ví dụ
-- text-embedding-3-small của OpenAI = 1536 chiều). Sinh embedding từ
-- title + synopsis (+ có thể vài chương đầu) mỗi khi sách được publish,
-- lưu vào cột này từ code server (không sinh trong SQL).
alter table public.books add column embedding vector(1536);

-- Lịch sử đọc — vừa là input để tính gợi ý, vừa là dữ liệu phân tích nói
-- chung (sách nào được đọc nhiều, bỏ dở ở đâu, v.v.).
create table public.reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete set null,
  read_at timestamptz not null default now()
);

alter table public.reading_history enable row level security;

create policy "users manage their own reading history"
  on public.reading_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index gần-đúng cho tìm kiếm vector nhanh trên tập sách lớn (bỏ qua nếu
-- catalog còn nhỏ — dưới ~10k sách thì quét tuần tự vẫn đủ nhanh).
-- create index on public.books using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Gợi ý = sách có embedding gần với "vector trung bình" các sách user đã
-- đọc gần đây, loại trừ sách đã đọc, chỉ lấy sách đã publish.
create function public.recommend_books(p_user_id uuid, p_limit integer default 10)
returns setof public.books as $$
declare
  v_profile_vector vector(1536);
begin
  -- Lưu ý: KHÔNG viết `select avg(embedding) ... order by ... limit 20`
  -- trực tiếp — vì avg() là aggregate nên toàn bộ hàng khớp điều kiện sẽ
  -- được gộp trước, ORDER BY/LIMIT ở ngoài chỉ tác dụng lên 1 dòng kết quả
  -- cuối cùng (vô nghĩa). Phải giới hạn 20 lượt đọc gần nhất trong subquery
  -- TRƯỚC, rồi mới avg() trên tập đã giới hạn đó.
  select avg(embedding) into v_profile_vector
  from (
    select b.embedding
    from public.reading_history rh
    join public.books b on b.id = rh.book_id
    where rh.user_id = p_user_id and b.embedding is not null
    order by rh.read_at desc
    limit 20 -- chỉ lấy 20 lượt đọc gần nhất, tránh gu đọc cũ kéo lệch gợi ý
  ) recent_reads;

  if v_profile_vector is null then
    -- Chưa có lịch sử đọc (user mới) — fallback: trả sách publish gần đây
    -- nhất thay vì rỗng. Cân nhắc đổi thành "sách trending" nếu có bảng đó.
    return query
      select * from public.books
      where published
      order by created_at desc
      limit p_limit;
  else
    return query
      select b.* from public.books b
      where b.published
        and b.embedding is not null
        and b.id not in (select book_id from public.reading_history where user_id = p_user_id)
      order by b.embedding <=> v_profile_vector -- cosine distance, càng nhỏ càng giống
      limit p_limit;
  end if;
end;
$$ language plpgsql stable;

-- Gọi từ Next.js: const { data } = await supabase.rpc('recommend_books', { p_user_id: userId });
-- `security invoker` mặc định (không thêm security definer) — hàm chạy
-- với quyền của người gọi, RLS của `books`/`reading_history` vẫn áp dụng
-- bình thường, không cần lo hàm này lộ dữ liệu ngoài phạm vi cho phép.

-- ---------------------------------------------------------------------
-- 9. Audio & Thiết kế — kho độc lập, liên kết vào truyện qua SHARE LINK
-- ---------------------------------------------------------------------
-- Mô hình (bản sửa — thêm cơ chế share-token, giống Google Drive):
--
--   • Diễn viên lồng tiếng / họa sĩ upload TỰ DO vào kho Audio / Thiết kế
--     — độc lập, không cần thuộc về chương/truyện nào cả lúc tạo.
--   • Kho này CÓ trang duyệt công khai (ai cũng xem/nghe được, giống
--     browse file "chỉ xem" trên Drive) — nhưng xem công khai KHÔNG đồng
--     nghĩa với việc ai cũng link được vào truyện của họ.
--   • Muốn link, tác giả cần đúng "share link" — một chuỗi bí mật
--     (`share_token`) do chủ sở hữu tạo ra và tự tay gửi cho tác giả sau
--     khi thoả thuận ngoài nền tảng. `share_token` KHÔNG xuất hiện ở
--     trang duyệt công khai — chỉ chủ sở hữu xem được token của chính
--     mình để copy đi chia sẻ, y hệt nút "Get link" của Google Drive.
--   • Copy id/URL từ vị trí người nghe/xem (trang duyệt công khai) sẽ
--     KHÔNG link được — vì hàm liên kết bắt buộc kiểm tra token đúng,
--     không chỉ id đúng.
--   • Tác giả tự upload từ máy (không qua ai khác): app tạo hộ 1 dòng
--     audio_narrations/design_items với narrator_id/illustrator_id =
--     chính tác giả, lấy luôn token vừa tạo (họ đang sở hữu, không cần ai
--     cho phép) để tự link cho mình trong cùng 1 thao tác.

-- Trên Supabase, pgcrypto thường được cài vào schema "extensions" (không
-- phải "public") — nên mọi lời gọi gen_random_bytes() bên dưới đều chỉ
-- rõ extensions.gen_random_bytes(...), tránh lỗi "function does not exist"
-- nếu search_path không tình cờ bao gồm schema đó.
create extension if not exists pgcrypto with schema extensions;

create type public.content_source as enum ('independent', 'story_upload');

-- --- Kho Thiết kế (ảnh bìa, minh hoạ) ---
create table public.design_items (
  id uuid primary key default gen_random_uuid(),
  illustrator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  image_url text not null, -- path trong bucket 'design-images'
  source public.content_source not null default 'independent',
  -- Chuỗi bí mật để chia sẻ quyền link — 48 ký tự hex (192 bit), không
  -- đoán được. Đừng lộ cột này ra bất kỳ view/API công khai nào.
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.design_items enable row level security;

-- CHỈ chủ sở hữu xem được toàn bộ dòng (bao gồm share_token, để họ copy
-- đi chia sẻ) — KHÔNG có policy "public select" trên bảng gốc này.
create policy "illustrators view their own design items (incl. share token)"
  on public.design_items for select
  using (auth.uid() = illustrator_id);

create policy "illustrators insert their own design items"
  on public.design_items for insert
  with check (auth.uid() = illustrator_id);

create policy "illustrators update their own design items"
  on public.design_items for update
  using (auth.uid() = illustrator_id);

create policy "illustrators delete their own design items"
  on public.design_items for delete
  using (auth.uid() = illustrator_id);

-- View công khai cho trang "duyệt kho Thiết kế" — CỐ Ý không có
-- share_token. Đây là view app dùng để hiện danh sách công khai.
create view public.public_design_items as
  select id, illustrator_id, title, image_url, source, created_at
  from public.design_items;

-- --- Kho Audio ---
create table public.audio_narrations (
  id uuid primary key default gen_random_uuid(),
  narrator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  audio_url text not null, -- path trong bucket 'audio-narrations'
  duration_seconds integer,
  source public.content_source not null default 'independent',
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.audio_narrations enable row level security;

create policy "narrators view their own audio narrations (incl. share token)"
  on public.audio_narrations for select
  using (auth.uid() = narrator_id);

create policy "narrators insert their own audio narrations"
  on public.audio_narrations for insert
  with check (auth.uid() = narrator_id);

create policy "narrators update their own audio narrations"
  on public.audio_narrations for update
  using (auth.uid() = narrator_id);

create policy "narrators delete their own audio narrations"
  on public.audio_narrations for delete
  using (auth.uid() = narrator_id);

create view public.public_audio_narrations as
  select id, narrator_id, title, audio_url, duration_seconds, source, created_at
  from public.audio_narrations;

-- --- Liên kết chương ↔ audio (nhiều-nhiều) ---
-- Bảng này TỰ NÓ không nhạy cảm (không có share_token), nên select công
-- khai được — vấn đề nằm ở việc TẠO dòng mới, không phải xem dòng đã có.
create table public.chapter_audio_links (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  linked_by uuid not null references auth.users (id),
  linked_at timestamptz not null default now(),
  unique (chapter_id, audio_narration_id)
);

alter table public.chapter_audio_links enable row level security;

create policy "audio links are publicly viewable"
  on public.chapter_audio_links for select
  using (true);

-- KHÔNG có policy insert nào ở đây — cố ý. Tạo liên kết chỉ được phép
-- qua hàm link_audio_to_chapter() bên dưới, hàm đó mới là nơi kiểm tra
-- share_token. Nếu chỉ dùng RLS "book author sở hữu chapter" như bản
-- trước, tác giả copy được id công khai là link được luôn — không kiểm
-- tra được liệu diễn viên có thật sự đồng ý hay không.

-- Gỡ liên kết thì không cần xin phép diễn viên (đây là quyền của tác giả
-- với truyện của họ), nên vẫn cho phép DELETE trực tiếp.
create policy "book authors unlink audio from their own chapters"
  on public.chapter_audio_links for delete
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid()
  ));

-- Hàm DUY NHẤT được phép tạo liên kết — kiểm tra CẢ 2 điều kiện:
-- (1) người gọi sở hữu sách chứa chương này, VÀ
-- (2) share_token khớp đúng với audio_narration đó (chứng minh chủ sở
--     hữu audio đã chủ động chia sẻ link, không phải tác giả tự đoán id).
create function public.link_audio_to_chapter(
  p_chapter_id uuid,
  p_audio_narration_id uuid,
  p_share_token text
) returns public.chapter_audio_links as $$
declare
  v_row public.chapter_audio_links;
begin
  if not exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = p_chapter_id and b.author_id = auth.uid()
  ) then
    raise exception 'Bạn không sở hữu sách chứa chương này';
  end if;

  if not exists (
    select 1 from public.audio_narrations
    where id = p_audio_narration_id and share_token = p_share_token
  ) then
    raise exception 'Share link không đúng hoặc đã bị thu hồi';
  end if;

  insert into public.chapter_audio_links (chapter_id, audio_narration_id, linked_by)
  values (p_chapter_id, p_audio_narration_id, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- Cho diễn viên "thu hồi link" nếu lỡ chia sẻ nhầm, hoặc tác giả không
-- còn hợp tác nữa — sinh token mới, mọi link cũ vẫn hiển thị bình thường
-- (link đã tạo không tự mất) nhưng token cũ không dùng để link thêm được
-- nữa. Giống nút "Get new link" của Google Drive.
create function public.regenerate_audio_share_token(p_audio_narration_id uuid)
returns text as $$
declare
  v_new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.audio_narrations
    set share_token = v_new_token
    where id = p_audio_narration_id and narrator_id = auth.uid();
  if not found then
    raise exception 'Không tìm thấy, hoặc bạn không phải chủ sở hữu';
  end if;
  return v_new_token;
end;
$$ language plpgsql security definer;

-- --- Ảnh bìa sách — cùng cơ chế token, nhưng gắn thẳng vào cột
-- books.cover_design_item_id thay vì 1 bảng liên kết riêng (1 sách chỉ
-- có 1 bìa tại 1 thời điểm, khác audio có thể nhiều bản cùng lúc). ---
alter table public.books
  add column cover_design_item_id uuid references public.design_items (id) on delete set null;

-- Chặn việc UPDATE trực tiếp cột này qua policy "authors update their own
-- books" ở phần 3 (policy đó cho sửa TOÀN BỘ cột, không phân biệt được
-- "sửa title" với "sửa cover" — RLS không làm được điều này). Trigger này
-- chặn khi giá trị mới KHÁC NULL và bị đổi trực tiếp — cho phép xoá bìa
-- (set về null) thoải mái vì việc đó không cần ai cho phép, chỉ chặn việc
-- ĐẶT bìa mới ngoài hàm link_cover_to_book().
create function public.prevent_direct_cover_change()
returns trigger as $$
begin
  if new.cover_design_item_id is distinct from old.cover_design_item_id
     and new.cover_design_item_id is not null
     and coalesce(current_setting('vinh.allow_cover_change', true), 'false') <> 'true' then
    raise exception 'Dùng link_cover_to_book() để đổi bìa — không update trực tiếp được';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_cover_via_function
  before update on public.books
  for each row execute function public.prevent_direct_cover_change();

create function public.link_cover_to_book(
  p_book_id uuid,
  p_design_item_id uuid,
  p_share_token text
) returns public.books as $$
declare
  v_row public.books;
begin
  if not exists (select 1 from public.books where id = p_book_id and author_id = auth.uid()) then
    raise exception 'Bạn không sở hữu sách này';
  end if;

  if not exists (
    select 1 from public.design_items
    where id = p_design_item_id and share_token = p_share_token
  ) then
    raise exception 'Share link không đúng hoặc đã bị thu hồi';
  end if;

  -- Cờ tạm trong transaction hiện tại (true ở tham số cuối = local, tự
  -- hết hiệu lực khi transaction kết thúc) — cho phép chính update ngay
  -- dưới đây đi qua được trigger enforce_cover_via_function ở trên.
  perform set_config('vinh.allow_cover_change', 'true', true);

  update public.books set cover_design_item_id = p_design_item_id
    where id = p_book_id
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

create function public.regenerate_design_share_token(p_design_item_id uuid)
returns text as $$
declare
  v_new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.design_items
    set share_token = v_new_token
    where id = p_design_item_id and illustrator_id = auth.uid();
  if not found then
    raise exception 'Không tìm thấy, hoặc bạn không phải chủ sở hữu';
  end if;
  return v_new_token;
end;
$$ language plpgsql security definer;

-- --- Storage buckets ---
insert into storage.buckets (id, name, public) values ('design-images', 'design-images', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('audio-narrations', 'audio-narrations', true)
  on conflict (id) do nothing;

create policy "design images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'design-images');

create policy "illustrators upload their own design images"
  on storage.objects for insert
  with check (
    bucket_id = 'design-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "illustrators update their own design images"
  on storage.objects for update
  using (
    bucket_id = 'design-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio narrations are publicly readable"
  on storage.objects for select
  using (bucket_id = 'audio-narrations');

create policy "narrators upload their own audio files"
  on storage.objects for insert
  with check (
    bucket_id = 'audio-narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "narrators update their own audio files"
  on storage.objects for update
  using (
    bucket_id = 'audio-narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- Cách app dùng (gợi ý luồng, không phải SQL bắt buộc) ---
--
-- Diễn viên upload độc lập, lấy link để chia sẻ:
--   const { data } = await supabase.from('audio_narrations')
--     .insert({ narrator_id: user.id, title, audio_url, duration_seconds })
--     .select('id, share_token').single();
--   → hiện cho họ: vinh.vn/lien-ket-audio?id=${data.id}&token=${data.share_token}
--   → họ tự copy link này gửi cho tác giả (kênh nào cũng được — chat, email...).
--
-- Tác giả dán link (app tự parse id + token từ URL họ paste vào):
--   const { data, error } = await supabase.rpc('link_audio_to_chapter', {
--     p_chapter_id: chapterId,
--     p_audio_narration_id: parsedId,
--     p_share_token: parsedToken,
--   });
--   // error nếu token sai/đã bị thu hồi, hoặc tác giả không sở hữu chương này.
--
-- Tác giả tự upload từ máy (không qua ai khác) — app làm 2 bước liền
-- nhau trong 1 lần bấm, TỰ CÓ token vì vừa tạo xong nên không cần ai gửi:
--   const { data: item } = await supabase.from('audio_narrations')
--     .insert({ narrator_id: user.id, title, audio_url, source: 'story_upload' })
--     .select('id, share_token').single();
--   await supabase.rpc('link_audio_to_chapter', {
--     p_chapter_id: chapterId,
--     p_audio_narration_id: item.id,
--     p_share_token: item.share_token, // họ vừa tạo, tự có sẵn, không cần dán tay
--   });
--
-- Ảnh bìa dùng đúng logic tương tự với link_cover_to_book().
--
-- Lấy danh sách audio đã link cho 1 chương (để hiện "chọn giọng đọc") —
-- LƯU Ý: join qua view public_audio_narrations, không phải bảng gốc, vì
-- bảng gốc chỉ chủ sở hữu mới select được:
--   select an.*, p.nickname as narrator_name, p.avatar_url
--   from public.chapter_audio_links cal
--   join public.public_audio_narrations an on an.id = cal.audio_narration_id
--   join public.author_public_profiles p on p.id = an.narrator_id
--   where cal.chapter_id = :chapter_id
--   order by cal.linked_at asc;

-- =======================================================================
-- Nếu bạn ĐÃ CHẠY 1 trong 2 bản audio_narrations trước đó (bản có cột
-- chapter_id/status, HOẶC bản không-token vừa rồi) — chạy dọn dẹp sau
-- TRƯỚC khi chạy phần 9 ở trên. An toàn dù bản nào bạn từng chạy, vì
-- toàn bộ dùng IF EXISTS:
--
--   drop trigger if exists enforce_narration_column_ownership on public.audio_narrations;
--   drop trigger if exists enforce_cover_via_function on public.books;
--   drop function if exists public.enforce_narration_column_ownership cascade;
--   drop function if exists public.prevent_direct_cover_change cascade;
--   drop function if exists public.link_audio_to_chapter cascade;
--   drop function if exists public.link_cover_to_book cascade;
--   drop function if exists public.regenerate_audio_share_token cascade;
--   drop function if exists public.regenerate_design_share_token cascade;
--   drop view if exists public.public_audio_narrations cascade;
--   drop view if exists public.public_design_items cascade;
--   drop table if exists public.chapter_audio_links cascade;
--   drop table if exists public.audio_narrations cascade;
--   drop table if exists public.design_items cascade;
--   drop type if exists public.narration_status cascade;
--   alter table public.books drop column if exists cover_design_item_id;
--   -- book-covers bucket cũ (nếu có) không còn dùng, để nguyên vô hại
--   -- hoặc xoá thủ công qua Dashboard → Storage nếu muốn dọn sạch.
-- =======================================================================