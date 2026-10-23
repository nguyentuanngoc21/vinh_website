-- One statement snapshot for wallet liabilities and paginated owner balances.
BEGIN;
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
COMMIT;

-- Notes: mirrored in baseline/04_wallet_and_payments.sql; regenerate docs/supabase/schema.sql.
-- RPC type: src/lib/supabase/types.ts; consumer: src/lib/admin/wallet-exposure.ts.
