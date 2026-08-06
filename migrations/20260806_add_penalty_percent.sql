-- Migration: add penalty_percent to transactions and update apply_transaction
-- Run this in the Supabase SQL editor (or via psql connected to your Supabase DB).

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS penalty_percent numeric NOT NULL DEFAULT 0;

-- Replace apply_transaction to accept p_penalty_percent and store it in transactions
CREATE OR REPLACE FUNCTION public.apply_transaction(
  p_user_id uuid,
  p_type public.transaction_type,
  p_amount integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_penalty_percent numeric default 0
) returns public.transactions as $$
declare
  v_new_balance integer;
  v_row public.transactions;
begin
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

  insert into public.transactions (user_id, type, amount, penalty_percent, balance_after, reference_type, reference_id)
  values (p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance, p_reference_type, p_reference_id)
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

COMMIT;

-- Notes:
-- 1) This migration adds the `penalty_percent` column and updates the RPC `apply_transaction`.
-- 2) If you run this in production, test in a staging DB first. Consider creating a new function name
--    and migrating callers gradually to avoid downtime.
-- 3) After running, redeploy the app so server code uses the new signature (we already included a backward-compatible retry).
