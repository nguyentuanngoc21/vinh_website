-- Run on DEV/STAGING as postgres after 20261023_admin_treasury.sql.
-- Creates isolated users/evidence, verifies permissions and idempotence, rolls back.
begin;
do $$
declare
  actor uuid := gen_random_uuid();
  member uuid := gen_random_uuid();
  deposit_id uuid := gen_random_uuid();
  source_name text := 'treasury-test-' || gen_random_uuid()::text;
  batch jsonb;
  report jsonb;
  row_id uuid;
  got integer;
  fixture_page integer;
  initial_unseen bigint;
begin
  insert into auth.users(id) values (actor), (member);
  insert into public.profiles(id, username, nickname, role) values
    (actor, 'test_' || replace(actor::text, '-', ''), 'Treasury test admin', 'admin'),
    (member, 'test_' || replace(member::text, '-', ''), 'Treasury test member', 'user');
  insert into public.deposit_transactions(id, user_id, payment_gateway, gateway_order_id, amount_vnd, token_amount, status, processed_at)
    values (deposit_id, member, 'test', deposit_id::text, 100000, 500, 'success', now());
  batch := jsonb_build_array(jsonb_build_object(
    'external_id', 'BANK-1', 'direction', 'in', 'amount_vnd', 100000, 'fee_vnd', 100,
    'occurred_at', now(), 'reference_type', 'deposit', 'reference_id', deposit_id
  ));
  got := public.admin_import_bank_entries(source_name, batch, actor);
  assert got = 1, 'First import must insert one row';
  got := public.admin_import_bank_entries(source_name, batch, actor);
  assert got = 0, 'Retry must not duplicate evidence';
  begin
    perform public.admin_import_bank_entries(source_name, batch, member);
    raise exception 'Non-admin import unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm <> 'Admin required' then raise; end if;
  end;
  begin
    perform public.admin_import_bank_entries(source_name, jsonb_set(batch, '{0,amount_vnd}', '99999'), actor);
    raise exception 'Conflicting evidence unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'Bank entry conflicts with existing evidence' then raise; end if;
  end;
  select id into row_id from public.treasury_bank_entries where source = source_name;
  select 1 + count(*) / 25 into fixture_page from public.treasury_bank_entries
    where occurred_at > now() or (occurred_at = now() and id < row_id);
  report := public.admin_treasury_report(fixture_page);
  initial_unseen := (report->>'unseenCount')::bigint;
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'matched'), 'Exact successful reference must match';
  -- Owner-only changes below are isolated test fixtures; service_role cannot update originals.
  update public.treasury_bank_entries set direction = 'out' where id = row_id;
  report := public.admin_treasury_report(fixture_page);
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'direction_mismatch'), 'Wrong direction must be flagged';
  update public.treasury_bank_entries set direction = 'in', amount_vnd = 99999 where id = row_id;
  report := public.admin_treasury_report(fixture_page);
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'amount_mismatch'), 'Wrong amount must be flagged';
  update public.treasury_bank_entries set amount_vnd = 100000 where id = row_id;
  update public.deposit_transactions set status = 'pending' where id = deposit_id;
  report := public.admin_treasury_report(fixture_page);
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'internal_pending'), 'Pending deposit must not match';
  update public.deposit_transactions set status = 'success' where id = deposit_id;
  insert into public.treasury_reconciliation_links(bank_entry_id, reference_type, reference_id, note, created_by)
    values (row_id, 'withdrawal', gen_random_uuid(), 'Wrong ID fixture', actor);
  report := public.admin_treasury_report(fixture_page);
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'missing_reference'), 'Missing internal reference must be flagged';
  insert into public.treasury_reconciliation_links(bank_entry_id, reference_type, reference_id, note, created_by)
    values (row_id, null, null, 'Unlink fixture', actor);
  report := public.admin_treasury_report(fixture_page);
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'unlinked'), 'Unlink must not fall back to original reference';
  assert (report->>'unseenCount')::bigint = initial_unseen + 1, 'Successful deposit without effective link must be reported';
  assert (select count(*) from public.treasury_reconciliation_links where bank_entry_id = row_id) = 2, 'Link audit history must be retained';
  insert into public.treasury_reconciliation_links(bank_entry_id, reference_type, reference_id, note, created_by)
    values (row_id, 'deposit', deposit_id, 'Restore fixture', actor);
  insert into public.treasury_bank_entries(source, external_id, direction, amount_vnd, occurred_at, reference_type, reference_id, created_by)
    values (source_name, 'BANK-2', 'in', 100000, now(), 'deposit', deposit_id, actor);
  select 1 + count(*) / 25 into fixture_page from public.treasury_bank_entries
    where occurred_at > now() or (occurred_at = now() and id < row_id);
  report := public.admin_treasury_report(fixture_page);
  assert exists(select 1 from jsonb_array_elements(report->'entries') e where e->>'id' = row_id::text and e->>'reconciliation_status' = 'duplicate_reference'), 'Two pieces of evidence for one internal transaction must not both match';
  assert not has_function_privilege('anon', 'public.admin_treasury_report(integer)', 'EXECUTE'), 'Anon RPC leak';
  assert not has_function_privilege('authenticated', 'public.admin_treasury_report(integer)', 'EXECUTE'), 'Authenticated RPC leak';
  assert not has_function_privilege('authenticated', 'public.admin_import_bank_entries(text,jsonb,uuid)', 'EXECUTE'), 'Authenticated import leak';
  assert not has_table_privilege('anon', 'public.treasury_bank_entries', 'SELECT'), 'Anon bank data leak';
  assert not has_table_privilege('authenticated', 'public.treasury_snapshots', 'SELECT'), 'Authenticated cash leak';
  assert not has_table_privilege('service_role', 'public.treasury_bank_entries', 'UPDATE'), 'Original evidence must not be updated';
  assert not has_table_privilege('service_role', 'public.treasury_snapshots', 'DELETE'), 'Snapshot audit must be retained';
end;
$$;
rollback;
