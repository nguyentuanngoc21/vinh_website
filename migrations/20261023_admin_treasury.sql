-- Manual cash observations and immutable bank evidence. No money movement.
BEGIN;
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
COMMIT;
-- Notes: mirror in baseline/04_wallet_and_payments.sql, regenerate docs/supabase/schema.sql.
-- Types: src/lib/supabase/types.ts. API: /api/admin/treasury. UI: admin/treasury-panel.
