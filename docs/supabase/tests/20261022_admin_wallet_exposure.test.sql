-- Run after 20261022_admin_wallet_exposure.sql as postgres. Read-only assertions.
begin isolation level repeatable read;
do $$
declare
  result jsonb;
  expected numeric;
begin
  if has_function_privilege('anon', 'public.admin_wallet_exposure(text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_wallet_exposure(text,integer,integer)', 'EXECUTE') then
    raise exception 'Wallet balances must not be readable by anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.admin_wallet_exposure(text,integer,integer)', 'EXECUTE') then
    raise exception 'service_role requires execute';
  end if;
  result := public.admin_wallet_exposure('', 1, 25);
  select coalesce(sum(token_balance), 0) into expected from public.profiles;
  assert (result->>'available')::numeric = expected, 'Available total mismatch';
  select coalesce(sum(token_balance_pending), 0) into expected from public.profiles;
  assert (result->>'pending')::numeric = expected, 'Pending total mismatch';
  select coalesce(sum(amount_tokens), 0) into expected from public.withdrawal_requests where status = 'processing';
  assert (result->>'processing')::numeric = expected, 'Processing token mismatch';
  select coalesce(sum(amount_vnd), 0) into expected from public.withdrawal_requests where status = 'processing';
  assert (result->>'processingVnd')::numeric = expected, 'Booked VND mismatch';
  assert (result->>'userCount')::bigint = (select count(*) from public.profiles), 'Missing owners';
  assert jsonb_array_length(result->'users') <= 25, 'Page limit failed';
  result := public.admin_wallet_exposure('no-match-' || gen_random_uuid()::text, 1, 25);
  assert (result->>'userCount')::bigint = 0, 'Search mismatch';
  assert jsonb_array_length(result->'users') = 0, 'Empty search must yield no rows';
  select coalesce(sum(token_balance), 0) into expected from public.profiles;
  assert (result->>'available')::numeric = expected, 'Search changed global totals';
end;
$$;
rollback;
