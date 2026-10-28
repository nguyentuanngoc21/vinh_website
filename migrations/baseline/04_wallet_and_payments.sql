-- =======================================================================
-- Baseline 04 — Ví token & thanh toán  (04_wallet_and_payments.sql)
-- =======================================================================
-- Phạm vi: Cột ví/phạt chụp màn hình/ngân hàng trên profiles,
-- transaction_type/status, transactions + apply_transaction(), settle
-- pending, nạp tiền, rút tiền, mua chương, thưởng nền tảng.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     transactions, deposit_transactions, withdrawal_requests,
--     purchase_transactions, platform_revenue_entries, platform_bonus_grants
--   Hàm:
--     apply_transaction, settle_pending_transaction,
--     settle_due_pending_transactions, create_withdrawal_request,
--     mark_withdrawal_result, create_purchase, grant_platform_bonus
--   Kiểu (enum):
--     transaction_type, transaction_status, deposit_status,
--     withdrawal_status
--   Thêm cột vào bảng của file trước:
--     profiles.{token_balance, token_balance_pending,
--     screenshot_penalty_count, screenshot_penalty_expires_at,
--     screenshot_penalty_banned, screenshot_penalty_last_offense_at,
--     cccd_last4, bank_code, bank_name, bank_account_number,
--     bank_account_name}
--
-- Gộp từ migration (migrations/archive/):
--   20260806_add_penalty_percent.sql, 20260807_wallet_ledger_extension.sql,
--   20260826_add_profile_bank_info.sql, 20260827_add_bank_account_name.sql,
--   20260827_add_quest_reward_transaction_type.sql,
--   20260827_add_streak_bonus_transaction_type.sql,
--   20260827_add_streak_rescue_transaction_type.sql,
--   20260827_drop_stale_apply_transaction_overloads.sql,
--   20260827_restrict_sensitive_rpc_execute_grants.sql,
--   20260901_add_order_earning_transaction_type.sql,
--   20260901_add_order_payment_transaction_type.sql,
--   20260901_add_order_refund_transaction_type.sql,
--   20260908_add_achievement_bonus_transaction_type.sql,
--   20260909_add_purchase_transactions_unique_buyer_chapter.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

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

-- Ngân hàng thụ hưởng để rút token (src/components/profile/bank-info-form.tsx)
-- + 4 chữ số cuối CCCD để hiện dạng che bớt trong Thông tin cá nhân, không
-- cần SELECT bảng identity_verifications nhạy cảm hơn cho việc đó — xem
-- migrations/archive/20260826_add_profile_bank_info.sql. Rút token
-- (create_withdrawal_request bên dưới, cùng phần 6) chỉ dùng được khi
-- cccd_verified = true VÀ đủ 3 cột ngân hàng — xem
-- WithdrawalService.requestWithdrawal.
alter table public.profiles add column cccd_last4 text;
alter table public.profiles add column bank_code text;
alter table public.profiles add column bank_name text;
alter table public.profiles add column bank_account_number text;

-- Tên chủ tài khoản ngân hàng — người dùng TỰ NHẬP, KHÔNG ép = real_name
-- nữa (xem migrations/archive/20260827_add_bank_account_name.sql: chủ tài khoản
-- có thể khác người lập hồ sơ — mượn tài khoản người thân — và nhiều
-- ngân hàng in tên không dấu, so khớp cứng với real_name có dấu sẽ sai
-- dù đúng người). Thông tin do người dùng khai, sai thì trách nhiệm
-- thuộc về người dùng.
alter table public.profiles add column bank_account_name text;

-- bio + nickname_updated_at: đã chuyển vào CREATE TABLE public.profiles
-- (phần 1) — view author_public_profiles cần cột bio tồn tại trước.

create type public.transaction_type as enum (
  'signup_bonus', 'daily_task_reward', 'purchase_chapter', 'topup', 'refund', 'admin_adjustment', 'screenshot_penalty',
  -- 'purchase_chapter' ở trên là vế trừ của người mua; 'purchase_credit' là
  -- vế cộng (pending) cho tác giả — xem phần 6e — tách riêng để không bao
  -- giờ lẫn 2 chiều của 1 giao dịch khi rà lịch sử.
  'purchase_credit', 'withdrawal', 'platform_bonus',
  -- Thêm bởi migrations/archive/20260827_add_quest_reward_transaction_type.sql,
  -- 20260827_add_streak_bonus_transaction_type.sql,
  -- 20260827_add_streak_rescue_transaction_type.sql.
  'quest_reward', 'streak_bonus', 'streak_rescue',
  -- Hệ thống giao dịch commission (phần 12) — 'order_payment' là vế trừ
  -- ngay của buyer khi đặt cọc/thanh toán; 'order_earning' là vế cộng
  -- (pending, hold period) của seller tại thời điểm buyer_confirmed/
  -- auto_confirmed — xem phần 12b, KHÔNG ghi lúc đặt cọc. Thêm bởi
  -- migrations/archive/20260901_add_order_payment_transaction_type.sql,
  -- 20260901_add_order_earning_transaction_type.sql.
  'order_payment', 'order_earning',
  -- Hoàn tiền khi hủy Order (Mục 5.1) — cộng ngay (status='completed'),
  -- không qua hold period. Thêm bởi
  -- migrations/archive/20260901_add_order_refund_transaction_type.sql.
  'order_refund',
  -- Thưởng thành tựu (author/narrator/designer) — reference_type =
  -- 'achievement', reference_id = achievement_templates.id. Chỉ ghi khi
  -- achievement_templates.reward_tokens > 0. Thêm bởi
  -- migrations/archive/20260908_add_achievement_bonus_transaction_type.sql.
  'achievement_bonus'
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

-- p_user_id/p_type/p_amount trần, không tự kiểm auth.uid() — hàm ghi số
-- dư DUY NHẤT của toàn hệ thống, nghiêm trọng nhất nếu bị gọi trực tiếp.
-- Chỉ service_role gọi được. KHÔNG ghi danh sách tham số (chỉ tên hàm) —
-- an toàn vì tên này không bị overload, và tránh lệch chữ ký nếu chạy
-- migration ở project chưa cập nhật hết. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.apply_transaction from public, anon, authenticated;
grant execute on function public.apply_transaction to service_role;

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

-- Hàm nội bộ của cron (vercel.json + api/wallet/cron/settle-pending) —
-- không cần/không nên gọi từ client. Chỉ service_role gọi được. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.settle_pending_transaction from public, anon, authenticated;
revoke execute on function public.settle_due_pending_transactions from public, anon, authenticated;
grant execute on function public.settle_pending_transaction to service_role;
grant execute on function public.settle_due_pending_transactions to service_role;

-- ---------------------------------------------------------------------
-- 6c. Nạp tiền — gateway-agnostic (chưa gắn cổng thanh toán thật)
-- ---------------------------------------------------------------------
create type public.deposit_status as enum ('pending', 'success', 'failed');

create table public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_gateway text not null, -- 'zalopay' | 'vnpay' | 'payos' | 'momo' | 'stub' — xem src/lib/wallet/deposit-service.ts
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

-- p_user_id trần — nếu gọi được trực tiếp, user tự tạo yêu cầu rút tiền
-- TRỪ số dư NGƯỜI KHÁC, chuyển vào ngân hàng do MÌNH chỉ định. Chỉ
-- service_role gọi được. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.create_withdrawal_request from public, anon, authenticated;
grant execute on function public.create_withdrawal_request to service_role;

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

-- Idempotent theo status, nhưng KHÔNG kiểm người gọi có phải chủ request
-- hay không — nếu gọi được trực tiếp, user tự gọi p_success=false trên
-- request CỦA CHÍNH MÌNH (id tự xem được qua policy select) để tự tạo
-- hoàn tiền giả trong khi giao dịch rút tiền thật vẫn có thể được xử lý
-- song song ở gateway thật (double-dip). Chỉ service_role gọi được. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.mark_withdrawal_result from public, anon, authenticated;
grant execute on function public.mark_withdrawal_result to service_role;

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

-- Chặn mua trùng 1 chương (2 request gần như đồng thời cùng qua được check
-- "đã mua chưa" ở tầng app) — xem
-- migrations/archive/20260909_add_purchase_transactions_unique_buyer_chapter.sql +
-- POST /api/chapters/[chapterId]/purchase (bắt lỗi 23505, coi như đã sở hữu).
create unique index if not exists purchase_transactions_buyer_chapter_key
  on public.purchase_transactions (buyer_id, chapter_id);

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

-- buyer_id/author_id trần, không tự kiểm auth.uid() — nếu gọi được trực
-- tiếp, user tự đặt author_id = mình, buyer_id = NGƯỜI KHÁC để trừ tiền
-- người khác, cộng doanh thu cho mình mà không cần mua gì. Chỉ
-- service_role gọi được. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.create_purchase from public, anon, authenticated;
grant execute on function public.create_purchase to service_role;

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

-- Check role bên trong hàm dựa vào p_admin_id (THAM SỐ), KHÔNG dựa vào
-- auth.uid() của người gọi thật — nếu gọi được trực tiếp, truyền
-- p_admin_id = id của 1 admin thật (tra được qua author_public_profiles/
-- byline) là qua được check, tự thưởng bất kỳ số token cho bất kỳ ai.
-- REVOKE dưới đây chặn được đường gọi trực tiếp; check lỗi thiết kế dựa
-- theo tham số vẫn còn nếu sau này có endpoint khác gọi hàm này mà không
-- tự resolve p_admin_id từ session — xem note trong migration. Chỉ
-- service_role gọi được. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.grant_platform_bonus from public, anon, authenticated;
grant execute on function public.grant_platform_bonus to service_role;

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

create index if not exists purchase_transactions_chapter_idx
  on public.purchase_transactions (chapter_id);

-- Admin wallet exposure (20261022_admin_wallet_exposure.sql)
create or replace function public.admin_wallet_exposure(
  p_search text default '', p_page integer default 1, p_page_size integer default 25
) returns jsonb
language sql stable security definer set search_path = public
as $$
  with withdrawals as (
    select user_id, sum(amount_tokens) as tokens, sum(amount_vnd) as vnd
    from public.withdrawal_requests where status = 'processing' group by user_id
  ), owners as (
    select p.id, p.username, p.nickname,
      p.token_balance as available, p.token_balance_pending as pending,
      coalesce(w.tokens, 0) as processing, coalesce(w.vnd, 0) as processing_vnd
    from public.profiles p left join withdrawals w on w.user_id = p.id
  ), filtered as (
    select * from owners
    where coalesce(username, '') ilike '%' || p_search || '%'
       or coalesce(nickname, '') ilike '%' || p_search || '%'
       or id::text = p_search
  ), page_rows as (
    select * from filtered order by (available::bigint + pending + processing) desc, id
    limit greatest(1, least(p_page_size, 100))
    offset (greatest(1, p_page)::bigint - 1) * greatest(1, least(p_page_size, 100))
  )
  select jsonb_build_object(
    'asOf', statement_timestamp(),
    'available', (select coalesce(sum(available), 0) from owners),
    'pending', (select coalesce(sum(pending), 0) from owners),
    -- Aggregate requests directly so even an orphaned request cannot disappear.
    'processing', (select coalesce(sum(tokens), 0) from withdrawals),
    'processingVnd', (select coalesce(sum(vnd), 0) from withdrawals),
    'userCount', (select count(*) from filtered),
    'users', coalesce((select jsonb_agg(to_jsonb(r) order by (r.available::bigint + r.pending + r.processing) desc, r.id) from page_rows r), '[]'::jsonb)
  );
$$;
revoke execute on function public.admin_wallet_exposure(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_wallet_exposure(text, integer, integer) to service_role;

-- Manual treasury and bank reconciliation (20261023_admin_treasury.sql)
create table if not exists public.treasury_snapshots (
  id uuid primary key,
  balance_vnd bigint not null check (balance_vnd between 0 and 1000000000000),
  fee_buffer_vnd bigint not null default 0 check (fee_buffer_vnd between 0 and 1000000000000),
  as_of timestamptz not null,
  note text not null check (length(note) between 1 and 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (as_of <= created_at + interval '5 minutes')
);
create table if not exists public.treasury_bank_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (length(source) between 1 and 80),
  external_id text not null check (length(external_id) between 1 and 120),
  direction text not null check (direction in ('in', 'out')),
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  fee_vnd bigint not null default 0 check (fee_vnd between 0 and 1000000000000),
  occurred_at timestamptz not null,
  reference_type text check (reference_type in ('deposit', 'withdrawal')),
  reference_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(source, external_id),
  check ((reference_type is null) = (reference_id is null)),
  check (occurred_at <= created_at + interval '5 minutes')
);
-- Re-linking preserves the original statement and every prior assignment.
create table if not exists public.treasury_reconciliation_links (
  id bigint generated always as identity primary key,
  bank_entry_id uuid not null references public.treasury_bank_entries(id),
  reference_type text check (reference_type in ('deposit', 'withdrawal')),
  reference_id uuid,
  note text not null check (length(note) between 1 and 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((reference_type is null) = (reference_id is null))
);
alter table public.treasury_snapshots enable row level security;
alter table public.treasury_bank_entries enable row level security;
alter table public.treasury_reconciliation_links enable row level security;
revoke all on public.treasury_snapshots, public.treasury_bank_entries, public.treasury_reconciliation_links from public, anon, authenticated, service_role;
grant select, insert on public.treasury_snapshots, public.treasury_bank_entries, public.treasury_reconciliation_links to service_role;
grant usage, select on sequence public.treasury_reconciliation_links_id_seq to service_role;
create index if not exists treasury_snapshot_as_of_idx on public.treasury_snapshots(as_of desc, created_at desc);
create index if not exists treasury_links_entry_idx on public.treasury_reconciliation_links(bank_entry_id, id desc);
create index if not exists treasury_bank_occurred_idx on public.treasury_bank_entries(occurred_at desc, id);

create or replace function public.admin_import_bank_entries(p_source text, p_entries jsonb, p_actor uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare inserted_count integer;
begin
  if not exists(select 1 from public.profiles where id = p_actor and role in ('admin', 'super_admin')) then
    raise exception 'Admin required';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 200 then
    raise exception 'Expected 1-200 entries';
  end if;
  -- Serialize imports per bank source: a retry cannot silently overwrite evidence.
  perform pg_advisory_xact_lock(hashtextextended(p_source, 0));
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as r(external_id text, direction text, amount_vnd bigint, fee_vnd bigint, occurred_at timestamptz, reference_type text, reference_id uuid)
    join public.treasury_bank_entries b on b.source = p_source and b.external_id = r.external_id
    where (b.direction, b.amount_vnd, b.fee_vnd, b.occurred_at, b.reference_type, b.reference_id)
      is distinct from (r.direction, r.amount_vnd, r.fee_vnd, r.occurred_at, r.reference_type, r.reference_id)
  ) then raise exception 'Bank entry conflicts with existing evidence' using hint = 'bank_entry_conflict'; end if;
  insert into public.treasury_bank_entries(source, external_id, direction, amount_vnd, fee_vnd, occurred_at, reference_type, reference_id, created_by)
    select p_source, r.external_id, r.direction, r.amount_vnd, r.fee_vnd, r.occurred_at, r.reference_type, r.reference_id, p_actor
    from jsonb_to_recordset(p_entries) as r(external_id text, direction text, amount_vnd bigint, fee_vnd bigint, occurred_at timestamptz, reference_type text, reference_id uuid)
    on conflict(source, external_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke execute on function public.admin_import_bank_entries(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_import_bank_entries(text, jsonb, uuid) to service_role;

create or replace function public.admin_treasury_report(p_page integer default 1)
returns jsonb language sql stable security definer set search_path = public
as $$
  with effective as (
    select b.*,
      case when l.id is not null then l.reference_type else b.reference_type end as linked_type,
      case when l.id is not null then l.reference_id else b.reference_id end as linked_id
    from public.treasury_bank_entries b
    left join lateral (
      select * from public.treasury_reconciliation_links where bank_entry_id = b.id order by id desc limit 1
    ) l on true
  ), counted as (
    select e.*, count(*) over (partition by linked_type, linked_id) as reference_count from effective e
  ), compared as (
    select c.*,
      case when linked_type = 'deposit' then d.amount_vnd else w.amount_vnd end as expected_vnd,
      case when linked_type = 'deposit' then d.status::text else w.status::text end as internal_status,
      case
        when linked_id is null then 'unlinked'
        when reference_count > 1 then 'duplicate_reference'
        when (linked_type = 'deposit' and d.id is null) or (linked_type = 'withdrawal' and w.id is null) then 'missing_reference'
        when (linked_type = 'deposit' and direction <> 'in') or (linked_type = 'withdrawal' and direction <> 'out') then 'direction_mismatch'
        when c.amount_vnd <> case when linked_type = 'deposit' then d.amount_vnd else w.amount_vnd end then 'amount_mismatch'
        when case when linked_type = 'deposit' then d.status::text else w.status::text end <> 'success' then 'internal_pending'
        else 'matched'
      end as reconciliation_status
    from counted c
    left join public.deposit_transactions d on c.linked_type = 'deposit' and d.id = c.linked_id
    left join public.withdrawal_requests w on c.linked_type = 'withdrawal' and w.id = c.linked_id
  ), unseen as (
    select 'deposit'::text as reference_type, d.id as reference_id, d.amount_vnd, d.processed_at
    from public.deposit_transactions d where d.status = 'success'
      and not exists (select 1 from effective e where e.linked_type = 'deposit' and e.linked_id = d.id)
    union all
    select 'withdrawal', w.id, w.amount_vnd, w.processed_at
    from public.withdrawal_requests w where w.status = 'success'
      and not exists (select 1 from effective e where e.linked_type = 'withdrawal' and e.linked_id = w.id)
  ), paged as (
    select * from compared order by occurred_at desc, id
    limit 25 offset (greatest(1, p_page)::bigint - 1) * 25
  )
  select jsonb_build_object(
    'asOf', statement_timestamp(),
    'snapshot', (select to_jsonb(s) from public.treasury_snapshots s order by as_of desc, created_at desc, id desc limit 1),
    'history', coalesce((select jsonb_agg(to_jsonb(s)) from (select * from public.treasury_snapshots order by as_of desc, created_at desc, id desc limit 5) s), '[]'::jsonb),
    'entryCount', (select count(*) from compared),
    'matchedCount', (select count(*) from compared where reconciliation_status = 'matched'),
    'unresolvedCount', (select count(*) from compared where reconciliation_status <> 'matched'),
    'importedFeesVnd', (select coalesce(sum(fee_vnd), 0) from compared),
    'unseenCount', (select count(*) from unseen),
    'unseen', coalesce((select jsonb_agg(to_jsonb(u)) from (select * from unseen order by processed_at desc nulls last, reference_id limit 10) u), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc, id) from paged p), '[]'::jsonb)
  );
$$;
revoke execute on function public.admin_treasury_report(integer) from public, anon, authenticated;
grant execute on function public.admin_treasury_report(integer) to service_role;
