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
