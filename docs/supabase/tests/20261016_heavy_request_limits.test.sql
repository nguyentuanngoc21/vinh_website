-- Run only on dev/staging after the migration. No persistent test data.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  result record; original_reset timestamptz;
begin
  insert into auth.users(id) values (a), (b);
  if has_function_privilege('anon', 'public.consume_heavy_request_limit(uuid,text,integer,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.consume_heavy_request_limit(uuid,text,integer,integer)', 'EXECUTE') then
    raise exception 'Untrusted callers can execute limiter';
  end if;
  select * into result from public.consume_heavy_request_limit(a, 'identity-ocr', 2, 60);
  if not result.allowed then raise exception 'First attempt blocked'; end if;
  perform public.consume_heavy_request_limit(a, 'identity-ocr', 2, 60);
  select reset_at into original_reset from public.heavy_request_limits where subject=a and scope='identity-ocr';
  select * into result from public.consume_heavy_request_limit(a, 'identity-ocr', 2, 60);
  if result.allowed or result.retry_after_seconds not between 1 and 60 then raise exception 'Limit not enforced'; end if;
  perform public.consume_heavy_request_limit(a, 'identity-ocr', 2, 60);
  if (select reset_at from public.heavy_request_limits where subject=a and scope='identity-ocr') <> original_reset then
    raise exception 'Denied request extended the window';
  end if;
  select * into result from public.consume_heavy_request_limit(b, 'identity-ocr', 2, 60);
  if not result.allowed then raise exception 'Accounts share a bucket'; end if;
  select * into result from public.consume_heavy_request_limit(a, 'audio-upload', 2, 60);
  if not result.allowed then raise exception 'Actions share a bucket'; end if;
  update public.heavy_request_limits set reset_at=now()-interval '1 second' where subject=a and scope='identity-ocr';
  select * into result from public.consume_heavy_request_limit(a, 'identity-ocr', 2, 60);
  if not result.allowed then raise exception 'Expired window did not reset'; end if;
  delete from auth.users where id in (a,b);
  if exists(select 1 from public.heavy_request_limits where subject in (a,b)) then raise exception 'Deleted account buckets retained'; end if;
  raise notice 'PASS: limit, reset, isolation, privileges and account deletion';
end $$;
rollback;
