-- Run on dev/staging after 20261015_community_events.sql. Rolls back all fixtures.
-- Needs at least one existing profile. Run as SQL Editor owner, not as anon.
begin;
do $$ begin
  if not exists (select 1 from public.profiles) then raise exception 'Create a staging test user first'; end if;
end $$;
insert into public.community_events (id, organizer_id, title, summary, overview, starts_at, ends_at, venue, address, city, status, hidden)
select fixture.id::uuid, p.id, 'RLS staging event', 'Test summary', 'Test overview', now() + interval '1 day', now() + interval '2 days', 'Test venue', 'Test address', 'Test city', fixture.status, fixture.hidden
from (select id from public.profiles limit 1) p
cross join (values
 ('71000000-0000-4000-8000-000000000001', 'published', false),
 ('71000000-0000-4000-8000-000000000002', 'draft', false),
 ('71000000-0000-4000-8000-000000000003', 'published', true)
) as fixture(id, status, hidden);
set local role anon;
do $$ declare found_count integer; begin
  select count(*) into found_count from public.community_events where id::text like '71000000-%';
  if found_count <> 1 then raise exception 'Anon must see only published, unhidden event; got %', found_count; end if;
  if has_table_privilege('anon', 'public.community_events', 'INSERT')
     or has_table_privilege('anon', 'public.community_events', 'UPDATE')
     or has_table_privilege('anon', 'public.community_events', 'DELETE') then
    raise exception 'Anon must not write events';
  end if;
end $$;
reset role;
set local role authenticated;
do $$ declare found_count integer; begin
  select count(*) into found_count from public.community_events where id::text like '71000000-%';
  if found_count <> 1 then raise exception 'Authenticated direct reads must not leak drafts/hidden events'; end if;
  if has_table_privilege('authenticated', 'public.community_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.community_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.community_events', 'DELETE') then
    raise exception 'Authenticated writes must pass server owner/admin checks';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'event-banners' and file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg','image/png','image/webp']) then
    raise exception 'Banner bucket restrictions are missing';
  end if;
end $$;
rollback;
