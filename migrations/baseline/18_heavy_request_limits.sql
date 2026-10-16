-- Apply to each web/mobile Supabase project before HEAVY_REQUEST_LIMIT_STORE=supabase.
begin;
create table if not exists public.heavy_request_limits (
  subject uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('audio-upload', 'manuscript-extract', 'identity-ocr')),
  hits integer not null check (hits >= 1),
  reset_at timestamptz not null,
  primary key (subject, scope)
);
alter table public.heavy_request_limits enable row level security;
revoke all on public.heavy_request_limits from public, anon, authenticated;

create or replace function public.consume_heavy_request_limit(
  p_subject uuid, p_scope text, p_limit integer, p_window_seconds integer
) returns table(allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hits integer;
  v_reset timestamptz;
begin
  if p_subject is null or p_scope is null or p_scope not in ('audio-upload', 'manuscript-extract', 'identity-ocr')
    or p_limit is null or p_limit < 1 or p_limit > 100000
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;
  -- Unique-key row locking makes concurrent increments atomic across function instances.
  insert into public.heavy_request_limits as bucket(subject, scope, hits, reset_at)
    values (p_subject, p_scope, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (subject, scope) do update set
    hits = case when bucket.reset_at <= v_now then 1 else least(bucket.hits + 1, p_limit + 1) end,
    reset_at = case when bucket.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds) else bucket.reset_at end
  returning hits, reset_at into v_hits, v_reset;
  return query select v_hits <= p_limit,
    case when v_hits <= p_limit then 0 else greatest(1, ceil(extract(epoch from (v_reset - v_now)))::integer) end;
end $$;
revoke all on function public.consume_heavy_request_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_heavy_request_limit(uuid, text, integer, integer) to service_role;
commit;
-- At most three rows per account; expired rows are reused, deleted accounts cascade.
-- No cron, extension, secrets or additional provider required.
