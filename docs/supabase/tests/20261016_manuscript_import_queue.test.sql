-- Dev/staging only; needs an EMPTY queue. Does not upload files. Everything rolls back.
begin;
do $$
declare
  owner uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
  second_job uuid:=gen_random_uuid(); c record; reclaimed record; reservation record; result boolean;
  filler uuid; i integer;
begin
  if exists(select 1 from public.manuscript_import_jobs) then raise exception 'Use an empty staging queue'; end if;
  insert into auth.users(id) values(owner),(other_owner);
  if has_function_privilege('authenticated','public.claim_manuscript_import()','EXECUTE')
    or has_function_privilege('anon','public.reserve_manuscript_import(uuid,uuid)','EXECUTE') then
    raise exception 'Queue functions exposed to untrusted roles';
  end if;
  if not exists(select 1 from storage.buckets where id='manuscript-imports' and public=false) then raise exception 'Bucket must exist and be private'; end if;
  select * into reservation from public.reserve_manuscript_import(job,owner);
  if not reservation.created then raise exception 'Reservation missing'; end if;
  select * into reservation from public.reserve_manuscript_import(job,owner);
  if reservation.created then raise exception 'Duplicate reservation created'; end if;
  begin
    perform public.reserve_manuscript_import(job,other_owner);
    raise exception 'Cross-owner ID accepted';
  exception when others then
    if sqlerrm <> 'Import unavailable' then raise; end if;
  end;
  perform public.reserve_manuscript_import(second_job,owner);
  begin
    perform public.reserve_manuscript_import(gen_random_uuid(),owner);
    raise exception 'Owner cap missing';
  exception when others then
    if sqlerrm <> 'IMPORT_OWNER_FULL' then raise; end if;
  end;
  for i in 1..18 loop
    filler:=gen_random_uuid(); insert into auth.users(id) values(filler);
    perform public.reserve_manuscript_import(gen_random_uuid(),filler);
  end loop;
  begin
    perform public.reserve_manuscript_import(gen_random_uuid(),other_owner);
    raise exception 'Global backlog cap missing';
  exception when others then
    if sqlerrm <> 'IMPORT_QUEUE_FULL' then raise; end if;
  end;
  update public.manuscript_import_jobs set status='queued' where id=job;
  select * into c from public.claim_manuscript_import();
  if c.id is distinct from job or c.attempts<>1 or c.lease_token is null then raise exception 'Claim failed'; end if;
  if exists(select 1 from public.claim_manuscript_import()) then raise exception 'Global concurrency exceeded'; end if;
  update public.manuscript_import_jobs set lease_until=now()-interval '1 second' where id=job;
  select * into reclaimed from public.claim_manuscript_import();
  if reclaimed.id is distinct from job or reclaimed.lease_token=c.lease_token or reclaimed.attempts<>2 then raise exception 'Reclaim/fencing failed'; end if;
  select public.finish_manuscript_import(job,c.lease_token,'succeeded',owner::text||'/'||job::text||'/result-'||c.lease_token::text||'.json') into result;
  if result then raise exception 'Stale worker committed'; end if;
  select public.finish_manuscript_import(job,reclaimed.lease_token,'succeeded',owner::text||'/'||job::text||'/result-'||reclaimed.lease_token::text||'.json') into result;
  if not result then raise exception 'Current worker failed'; end if;
  raise notice 'PASS: private bucket, permissions, idempotency, owner cap, serialized claims and stale-worker fencing';
end $$;
rollback;
