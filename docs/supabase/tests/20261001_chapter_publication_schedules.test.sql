-- Run ONLY in dev/staging after the scheduling migration. Rolls back all fixtures.
begin;
do $$
declare
  u uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); b uuid; c1 uuid; c2 uuid;
  s uuid := gen_random_uuid(); d uuid := gen_random_uuid(); n integer;
begin
  insert into auth.users(id,email,created_at) values(u,u || '@test.invalid',now()),(outsider,outsider || '@test.invalid',now());
  insert into public.profiles(id,username,nickname) values(u,'sched' || left(u::text,8),'Test'),(outsider,'sched' || left(outsider::text,8),'Test') on conflict(id) do nothing;
  insert into public.books(author_id,title,slug,is_exclusive) values(u,'Schedule test','sched-' || u,false) returning id into b;
  insert into public.chapters(book_id,title,content,order_index) values(b,'One','Content',1) returning id into c1;
  insert into public.chapters(book_id,title,content,order_index) values(b,'Two','Content',2) returning id into c2;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.schedule_chapter_publication(s,b,array[c1,c2],now()+interval '1 day',0,null);
    raise exception 'TEST: another author was allowed to schedule';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.schedule_chapter_publication(s,b,array[c2,c1],now()+interval '1 day',0,0);
  perform public.schedule_chapter_publication(s,b,array[c2,c1],now()+interval '1 day',0,0);
  if (select count(*) from public.chapter_publication_schedules where id=s) <> 1 then raise exception 'Retry created duplicate schedules'; end if;
  if (select chapter_ids from public.chapter_publication_schedules where id=s) <> array[c1,c2] then raise exception 'Chapter order was not canonical'; end if;
  begin
    perform public.schedule_chapter_publication(d,b,array[c1],now()+interval '1 day',0,null);
    raise exception 'TEST: overlap was allowed';
  exception when others then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform public.cancel_chapter_publication(s);
  perform public.schedule_chapter_publication(d,b,array[c1,c2],now()+interval '1 day',1,null);
  update public.chapter_publication_schedules set starts_at=now()-interval '1 minute' where id=d;
  perform set_config('request.jwt.claim.sub','',true);
  n := public.run_due_chapter_publications('test-version');
  if n <> 1 or not (select published from public.chapters where id=c1) or (select published from public.chapters where id=c2) then raise exception 'Daily cadence published incorrect chapters'; end if;
  if not (select published from public.books where id=b) then raise exception 'Parent book remained private'; end if;
  if public.run_due_chapter_publications('test-version') <> 0 then raise exception 'Worker retry duplicated publication'; end if;
  update public.chapter_publication_schedules set starts_at=now()-interval '2 days' where id=d;
  if public.run_due_chapter_publications('test-version') <> 1 then raise exception 'Second day did not publish'; end if;
  if (select status from public.chapter_publication_schedules where id=d) <> 'completed' then raise exception 'Schedule did not complete'; end if;
  -- A removed chapter blocks the whole simultaneous batch, not just that chapter.
  update public.chapters set published=false where id=any(array[c1,c2]);
  s := gen_random_uuid();
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.schedule_chapter_publication(s,b,array[c1,c2],now()+interval '1 day',0,null);
  update public.chapters set removed_at=now() where id=c2;
  update public.chapter_publication_schedules set starts_at=now()-interval '1 minute' where id=s;
  perform set_config('request.jwt.claim.sub','',true);
  if public.run_due_chapter_publications('test-version') <> 0 then raise exception 'Moderated batch published chapters'; end if;
  if exists(select 1 from public.chapters where id=any(array[c1,c2]) and published) then raise exception 'Moderated batch partially published'; end if;
  if (select status from public.chapter_publication_schedules where id=s) <> 'failed' then raise exception 'Moderation failure not reported'; end if;
  update public.chapters set removed_at=null where id=c2;
  s := gen_random_uuid();
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.schedule_chapter_publication(s,b,array[c1,c2],now()+interval '1 day',0,0);
  update public.chapter_publication_schedules set starts_at=now()-interval '1 minute' where id=s;
  perform set_config('request.jwt.claim.sub','',true);
  if public.run_due_chapter_publications('test-version') <> 2 then raise exception 'Simultaneous publication did not publish both chapters'; end if;
  if (select status from public.chapter_publication_schedules where id=s) <> 'completed' then raise exception 'Simultaneous schedule did not complete'; end if;
  if has_function_privilege('authenticated','public.run_due_chapter_publications(text)','execute') then raise exception 'Worker exposed to authenticated users'; end if;
  raise notice 'PASS: ownership, retry, canonical order, overlap, cancellation, daily cadence, moderation rollback, simultaneous publication, visibility, worker grants';
end $$;
rollback;

-- SQL Editor shows this result row; RAISE NOTICE alone may not appear in Results.
-- Any failed assertion above raises an exception and prevents this statement.
select 'PASS' as result,
  'Ownership, retry, canonical order, overlap, cancellation, daily cadence, moderation rollback, simultaneous publication, visibility, worker grants' as checks,
  'Test fixtures rolled back' as cleanup;
