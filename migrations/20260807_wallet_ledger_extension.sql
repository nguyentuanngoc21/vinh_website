-- Migration: wallet/ledger extension — pending balances, deposits,
-- withdrawals, revenue-share purchases, platform bonuses.
--
-- Deliberately EXTENDS the existing wallet (profiles.token_balance +
-- transactions + apply_transaction()) instead of replacing it — the
-- penalty route (src/app/api/penalty/route.ts) and claim_daily_task()
-- both call apply_transaction() with its current 5-arg signature and must
-- keep working unmodified after this runs.
--
-- Run in the Supabase SQL editor (or via psql), same as
-- 20260806_add_penalty_percent.sql. Test in staging first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Pending balance on the wallet
-- ---------------------------------------------------------------------
-- token_balance (renamed nowhere — stays as-is) is the *available* bucket:
-- spendable and withdrawable right now. token_balance_pending holds author
-- revenue-share still inside its hold period — visible to the user, but
-- neither spendable nor withdrawable until settle_due_pending_transactions()
-- moves it over.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS token_balance_pending integer NOT NULL DEFAULT 0
    CHECK (token_balance_pending >= 0);

-- ---------------------------------------------------------------------
-- 2. New transaction_type values + status/hold columns on `transactions`
-- ---------------------------------------------------------------------
-- ADD VALUE is safe inside this transaction block as long as we don't also
-- *use* the new value in the same block (we don't — no inserts here).
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'purchase_credit';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'withdrawal';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'platform_bonus';

-- 'purchase_chapter' (existing) stays as the buyer-side debit.
-- 'purchase_credit' (new) is the author-side revenue-share credit — kept
-- separate from 'purchase_chapter' rather than reusing it so the two legs
-- of one purchase are never ambiguous when scanning ledger history.

CREATE TYPE public.transaction_status AS ENUM (
  'pending',    -- credited to balance_pending, not yet spendable/withdrawable
  'processing', -- balance already moved (e.g. withdrawal debited), awaiting external confirmation
  'available',  -- historical placeholder for a pending entry that has settled (see below)
  'completed',  -- normal, final state for instant entries (deposit, purchase debit, bonus, ...)
  'failed',     -- external call (payout) failed; balance has been reversed
  'reversed'    -- entry was reversed by a refund/dispute after the fact
);

-- Every row created before this migration is a completed, instant entry —
-- default 'completed' backfills them correctly with no data migration needed.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS status public.transaction_status NOT NULL DEFAULT 'completed';

-- When an entry is created with status='pending', this is when it becomes
-- spendable — settle_due_pending_transactions() polls on this column.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS available_at timestamptz;

-- Links the two legs of one purchase (buyer's purchase_chapter debit <->
-- author's purchase_credit credit), and a withdrawal's debit <-> its later
-- refund if the payout fails. Two-way traceability: either row's id finds
-- the other with a single indexed lookup.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS related_transaction_id uuid REFERENCES public.transactions (id);

-- Snapshot of token_balance_pending *after* this op, mirroring the existing
-- balance_after (which snapshots token_balance and is left untouched by a
-- pending-credit, since that path deliberately doesn't move token_balance).
-- Null for every entry that never touches the pending bucket.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS pending_balance_after integer;

CREATE INDEX IF NOT EXISTS transactions_pending_due_idx
  ON public.transactions (available_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- 3. apply_transaction(): extend, don't break
-- ---------------------------------------------------------------------
-- New trailing params all have defaults, so every existing call site
-- (register's signup_bonus, claim_daily_task, the penalty route) keeps
-- compiling and behaving exactly as before.
--
-- Branch added: p_status = 'pending' routes the amount into
-- token_balance_pending instead of token_balance, and skips the
-- "insufficient balance" guard — a pending entry is always a credit
-- (author revenue-share), never a debit, so there's nothing to be
-- insufficient for. p_amount <= 0 with p_status='pending' is rejected to
-- keep that invariant enforced in the one place all writes funnel through.
CREATE OR REPLACE FUNCTION public.apply_transaction(
  p_user_id uuid,
  p_type public.transaction_type,
  p_amount integer,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_penalty_percent numeric DEFAULT 0,
  p_status public.transaction_status DEFAULT 'completed',
  p_available_at timestamptz DEFAULT NULL,
  p_related_transaction_id uuid DEFAULT NULL
) RETURNS public.transactions AS $$
DECLARE
  v_new_balance integer;
  v_new_pending integer;
  v_row public.transactions;
BEGIN
  IF p_status = 'pending' THEN
    IF p_amount <= 0 THEN
      RAISE EXCEPTION 'Pending entries must be credits (amount > 0), got %', p_amount;
    END IF;
    IF p_available_at IS NULL THEN
      RAISE EXCEPTION 'p_available_at is required when p_status = pending';
    END IF;

    -- Single-row UPDATE ... RETURNING is row-locked by Postgres for the
    -- duration of this statement — two concurrent purchases crediting the
    -- same author serialize here exactly like the existing token_balance
    -- update below does. No explicit SELECT ... FOR UPDATE needed.
    UPDATE public.profiles
      SET token_balance_pending = token_balance_pending + p_amount
      WHERE id = p_user_id
      RETURNING token_balance_pending INTO v_new_pending;

    IF v_new_pending IS NULL THEN
      RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;

    SELECT token_balance INTO v_new_balance FROM public.profiles WHERE id = p_user_id;

    INSERT INTO public.transactions (
      user_id, type, amount, penalty_percent, balance_after, pending_balance_after,
      reference_type, reference_id, status, available_at, related_transaction_id
    )
    VALUES (
      p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance, v_new_pending,
      p_reference_type, p_reference_id, p_status, p_available_at, p_related_transaction_id
    )
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  -- Existing path — unchanged behaviour, now also stamps status/related_transaction_id.
  UPDATE public.profiles
    SET token_balance = token_balance + p_amount
    WHERE id = p_user_id
    RETURNING token_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance for user %', p_user_id;
  END IF;

  INSERT INTO public.transactions (
    user_id, type, amount, penalty_percent, balance_after,
    reference_type, reference_id, status, related_transaction_id
  )
  VALUES (
    p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance,
    p_reference_type, p_reference_id, p_status, p_related_transaction_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 4. settle_due_pending_transactions(): pending -> available, on a cron
-- ---------------------------------------------------------------------
-- Settles ONE row, taking a row lock so a request that reads/refunds this
-- same entry (see refund note in withdrawal-service / LedgerService docs)
-- can't race with the cron job. Returns NULL (not an exception) if the row
-- isn't actually due anymore by the time the lock is acquired, so the
-- batch wrapper below can just skip it instead of aborting the batch.
CREATE OR REPLACE FUNCTION public.settle_pending_transaction(p_transaction_id uuid)
RETURNS public.transactions AS $$
DECLARE
  v_txn public.transactions;
BEGIN
  SELECT * INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_txn IS NULL OR v_txn.status <> 'pending' OR v_txn.available_at > now() THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
    SET token_balance = token_balance + v_txn.amount,
        token_balance_pending = token_balance_pending - v_txn.amount
    WHERE id = v_txn.user_id;

  UPDATE public.transactions
    SET status = 'available'
    WHERE id = v_txn.id
    RETURNING * INTO v_txn;

  RETURN v_txn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Batch wrapper the cron endpoint calls once per run. Each row settles in
-- its own sub-transaction (via the function call boundary) — one bad row
-- (shouldn't happen, but e.g. a profile deleted out from under it) doesn't
-- block the rest of the batch. p_limit caps how much one cron tick chews
-- through; the next tick picks up whatever's left.
CREATE OR REPLACE FUNCTION public.settle_due_pending_transactions(p_limit integer DEFAULT 500)
RETURNS SETOF public.transactions AS $$
DECLARE
  v_id uuid;
  v_result public.transactions;
BEGIN
  FOR v_id IN
    SELECT id FROM public.transactions
    WHERE status = 'pending' AND available_at <= now()
    ORDER BY available_at
    LIMIT p_limit
  LOOP
    v_result := public.settle_pending_transaction(v_id);
    IF v_result IS NOT NULL THEN
      RETURN NEXT v_result;
    END IF;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 5. Deposits — gateway-agnostic (no real gateway wired up yet)
-- ---------------------------------------------------------------------
CREATE TYPE public.deposit_status AS ENUM ('pending', 'success', 'failed');

CREATE TABLE public.deposit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  payment_gateway text NOT NULL, -- 'vnpay' | 'payos' | 'momo' | 'stub' — free text on purpose, see deposit-service.ts
  gateway_order_id text NOT NULL,
  amount_vnd integer NOT NULL CHECK (amount_vnd > 0),
  token_amount integer NOT NULL CHECK (token_amount > 0),
  status public.deposit_status NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  transaction_id uuid REFERENCES public.transactions (id), -- set once credited
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  -- One gateway can reuse order ids across time in theory; scope the
  -- uniqueness to the gateway so two different gateways never collide.
  UNIQUE (payment_gateway, gateway_order_id)
);

ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view their own deposits"
  ON public.deposit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins view all deposits"
  ON public.deposit_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

-- No insert/update policy — webhook handler writes exclusively through the
-- service-role client (src/lib/wallet/deposit-service.ts), never RLS-checked.

-- ---------------------------------------------------------------------
-- 6. Withdrawals
-- ---------------------------------------------------------------------
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'processing', 'success', 'failed');

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount_tokens integer NOT NULL CHECK (amount_tokens > 0),
  amount_vnd integer NOT NULL CHECK (amount_vnd > 0), -- amount_tokens * TOKEN_TO_VND_RATE at request time
  bank_account_number text NOT NULL,
  bank_account_name text NOT NULL,
  bank_code text NOT NULL,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  payout_gateway_ref text,
  failure_reason text,
  -- The ledger entry that debited token_balance the instant this request
  -- was created (see create_withdrawal_request below) — its `status`
  -- tracks processing/completed/failed for this specific request.
  transaction_id uuid NOT NULL REFERENCES public.transactions (id),
  -- Set only if the payout failed and the debit was reversed — the refund
  -- is its own ledger entry, kept distinct from the original debit.
  refund_transaction_id uuid REFERENCES public.transactions (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view their own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins view all withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

CREATE INDEX withdrawal_requests_user_month_idx ON public.withdrawal_requests (user_id, created_at);

-- Atomically: debit token_balance (status='processing' — money has left
-- the available balance but the payout API hasn't confirmed yet) and
-- record the request in one DB transaction (the function call boundary).
-- Raises (and the whole call — debit included — rolls back) if the
-- balance is insufficient, exactly like every other apply_transaction call.
CREATE OR REPLACE FUNCTION public.create_withdrawal_request(
  p_user_id uuid,
  p_amount_tokens integer,
  p_amount_vnd integer,
  p_bank_account_number text,
  p_bank_account_name text,
  p_bank_code text
) RETURNS public.withdrawal_requests AS $$
DECLARE
  v_txn public.transactions;
  v_request public.withdrawal_requests;
BEGIN
  v_txn := public.apply_transaction(
    p_user_id, 'withdrawal', -p_amount_tokens,
    'withdrawal_request', NULL, 0, 'processing'
  );

  -- status='processing' from the moment of creation, not the column's
  -- 'pending' default — the debit above already happened synchronously,
  -- there's no separate "pending" phase before a payout attempt starts.
  -- mark_withdrawal_result()'s idempotency guard specifically checks for
  -- 'processing', so this must match or the very first legitimate
  -- callback would be (wrongly) treated as a stale duplicate.
  INSERT INTO public.withdrawal_requests (
    user_id, amount_tokens, amount_vnd, bank_account_number, bank_account_name, bank_code, transaction_id, status
  )
  VALUES (p_user_id, p_amount_tokens, p_amount_vnd, p_bank_account_number, p_bank_account_name, p_bank_code, v_txn.id, 'processing')
  RETURNING * INTO v_request;

  -- Backfill reference_id now that we know the request's id (it didn't
  -- exist yet when apply_transaction ran above).
  UPDATE public.transactions SET reference_id = v_request.id WHERE id = v_txn.id;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Called from the payout gateway callback (withdrawal-service.ts) once
-- per request, exactly once for success and exactly once for failure —
-- caller is responsible for the idempotency check (payout_gateway_ref /
-- status already 'success' or 'failed') before calling this, same pattern
-- as the deposit webhook's gateway_order_id check.
CREATE OR REPLACE FUNCTION public.mark_withdrawal_result(
  p_request_id uuid,
  p_success boolean,
  p_gateway_ref text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
) RETURNS public.withdrawal_requests AS $$
DECLARE
  v_request public.withdrawal_requests;
  v_refund public.transactions;
BEGIN
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request % not found', p_request_id;
  END IF;

  -- Idempotency guard: only a request still 'processing' can be resolved.
  -- The FOR UPDATE lock above serializes concurrent callbacks for the same
  -- request, so the second one to arrive sees the already-updated status
  -- here and is a no-op — covers duplicate gateway callbacks and a
  -- success+failure race arriving together.
  IF v_request.status <> 'processing' THEN
    RETURN v_request;
  END IF;

  IF p_success THEN
    UPDATE public.transactions SET status = 'completed' WHERE id = v_request.transaction_id;
    UPDATE public.withdrawal_requests
      SET status = 'success', payout_gateway_ref = p_gateway_ref, processed_at = now()
      WHERE id = p_request_id
      RETURNING * INTO v_request;
  ELSE
    UPDATE public.transactions SET status = 'failed' WHERE id = v_request.transaction_id;

    -- Refund the reserved amount back to available balance — a fresh
    -- ledger entry, never an edit to the original debit (append-only).
    v_refund := public.apply_transaction(
      v_request.user_id, 'refund', v_request.amount_tokens,
      'withdrawal_request', p_request_id, 0, 'completed', NULL, v_request.transaction_id
    );

    UPDATE public.withdrawal_requests
      SET status = 'failed', failure_reason = p_failure_reason, refund_transaction_id = v_refund.id, processed_at = now()
      WHERE id = p_request_id
      RETURNING * INTO v_request;
  END IF;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 7. Purchases — buyer debit + author pending credit + platform revenue
-- ---------------------------------------------------------------------
CREATE TABLE public.purchase_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  author_share integer NOT NULL CHECK (author_share >= 0),
  platform_share integer NOT NULL CHECK (platform_share >= 0),
  debit_transaction_id uuid NOT NULL REFERENCES public.transactions (id),
  credit_transaction_id uuid NOT NULL REFERENCES public.transactions (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (author_share + platform_share = amount)
);

ALTER TABLE public.purchase_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers view their own purchases"
  ON public.purchase_transactions FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "authors view sales of their own content"
  ON public.purchase_transactions FOR SELECT
  USING (auth.uid() = author_id);

CREATE POLICY "admins view all purchases"
  ON public.purchase_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

-- Platform's commission never touches any wallet — it's already sitting in
-- the company's bank account from the moment the buyer topped up. This
-- table exists purely as the accounting record of how much of each
-- purchase was commission, for revenue reporting.
CREATE TABLE public.platform_revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_transaction_id uuid NOT NULL REFERENCES public.purchase_transactions (id),
  amount integer NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view platform revenue"
  ON public.platform_revenue_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

-- One call, one DB transaction: debit buyer (raises + rolls back the whole
-- purchase if their balance is insufficient), credit author's *pending*
-- bucket with the hold-period clock started, record platform commission,
-- and link everything two ways in purchase_transactions.
CREATE OR REPLACE FUNCTION public.create_purchase(
  p_buyer_id uuid,
  p_author_id uuid,
  p_chapter_id uuid,
  p_amount integer,
  p_author_share integer,
  p_platform_share integer,
  p_hold_days integer
) RETURNS public.purchase_transactions AS $$
DECLARE
  v_debit public.transactions;
  v_credit public.transactions;
  v_purchase public.purchase_transactions;
  v_available_at timestamptz := now() + (p_hold_days || ' days')::interval;
BEGIN
  IF p_author_share + p_platform_share <> p_amount THEN
    RAISE EXCEPTION 'author_share (%) + platform_share (%) must equal amount (%)', p_author_share, p_platform_share, p_amount;
  END IF;

  -- Buyer side — raises "Insufficient balance for user %" and rolls back
  -- this whole function (including the not-yet-run credit below) if short.
  v_debit := public.apply_transaction(
    p_buyer_id, 'purchase_chapter', -p_amount, 'chapter', p_chapter_id
  );

  -- Author side — pending, not spendable/withdrawable until the hold
  -- period passes and the cron job settles it.
  v_credit := public.apply_transaction(
    p_author_id, 'purchase_credit', p_author_share, 'chapter', p_chapter_id,
    0, 'pending', v_available_at, v_debit.id
  );

  UPDATE public.transactions SET related_transaction_id = v_credit.id WHERE id = v_debit.id;

  INSERT INTO public.purchase_transactions (
    buyer_id, author_id, chapter_id, amount, author_share, platform_share,
    debit_transaction_id, credit_transaction_id
  )
  VALUES (p_buyer_id, p_author_id, p_chapter_id, p_amount, p_author_share, p_platform_share, v_debit.id, v_credit.id)
  RETURNING * INTO v_purchase;

  INSERT INTO public.platform_revenue_entries (purchase_transaction_id, amount)
  VALUES (v_purchase.id, p_platform_share);

  RETURN v_purchase;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 8. Platform bonuses (contest prizes, etc.) — company funds, no hold
-- ---------------------------------------------------------------------
-- Audit trail kept OUTSIDE `transactions.metadata` (that column doesn't
-- exist on this table — reference_type/reference_id is all it has) so
-- "who approved this and why" is always queryable without parsing jsonb,
-- and so a report can trivially exclude platform_bonus rows from author
-- revenue-share totals.
CREATE TABLE public.platform_bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions (id),
  recipient_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES auth.users (id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_bonus_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipients view their own bonus grants"
  ON public.platform_bonus_grants FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "admins view all bonus grants"
  ON public.platform_bonus_grants FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

-- p_admin_id is checked against profiles.role INSIDE the function (defense
-- in depth) — the route handler must already gate this on the caller's
-- session, but since this is security definer and reachable via the
-- service-role client (which bypasses RLS entirely), the check can't live
-- in RLS alone.
CREATE OR REPLACE FUNCTION public.grant_platform_bonus(
  p_admin_id uuid,
  p_recipient_id uuid,
  p_amount integer,
  p_reason text
) RETURNS public.transactions AS $$
DECLARE
  v_txn public.transactions;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Bonus amount must be positive, got %', p_amount;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'User % is not authorized to grant platform bonuses', p_admin_id;
  END IF;

  v_txn := public.apply_transaction(p_recipient_id, 'platform_bonus', p_amount, 'platform_bonus', NULL);

  INSERT INTO public.platform_bonus_grants (transaction_id, recipient_id, granted_by, reason)
  VALUES (v_txn.id, p_recipient_id, p_admin_id, p_reason);

  UPDATE public.transactions SET reference_id = (
    SELECT id FROM public.platform_bonus_grants WHERE transaction_id = v_txn.id
  ) WHERE id = v_txn.id;

  RETURN v_txn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Notes:
-- 1) ALTER TYPE ... ADD VALUE statements above are only safe to run once —
--    re-running this file is idempotent everywhere else (IF NOT EXISTS /
--    OR REPLACE / ADD VALUE IF NOT EXISTS), so a partial re-run is fine.
-- 2) After running, redeploy the app — apply_transaction()'s new params
--    are all optional/defaulted, so no code needs to change immediately,
--    but the new services (src/lib/wallet/*) expect these functions/columns
--    to exist.
-- 3) Withdrawal AML policy ("giới hạn rút <= tổng đã nạp") is intentionally
--    NOT enforced in SQL here — it's a product/compliance decision with a
--    default implemented at the application layer
--    (src/lib/wallet/withdrawal-service.ts) that finance should confirm.
