-- Community events: depends on 01_extensions_and_accounts.sql (profiles).
begin;
create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  overview text not null check (char_length(btrim(overview)) between 1 and 20000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null check (char_length(btrim(venue)) between 1 and 200),
  address text not null check (char_length(btrim(address)) between 1 and 500),
  city text not null check (char_length(btrim(city)) between 1 and 100),
  price_vnd bigint check (price_vnd between 0 and 100000000),
  ticket_url text check (ticket_url is null or (char_length(ticket_url) <= 2000 and ticket_url ~ '^https://')),
  banner_path text check (banner_path is null or banner_path ~ '^[a-f0-9-]+/event-[a-f0-9-]+\.(jpg|png|webp)$'),
  category text not null default 'Cộng đồng' check (char_length(btrim(category)) between 1 and 100),
  organizer_bio text not null default '' check (char_length(organizer_bio) <= 500),
  travel_notes jsonb not null default '{}'::jsonb check (jsonb_typeof(travel_notes) = 'object'),
  games jsonb not null default '[]'::jsonb check (jsonb_typeof(games) = 'array' and jsonb_array_length(games) <= 20),
  status text not null default 'draft' check (status in ('draft', 'published')),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists community_events_public_schedule on public.community_events(starts_at, id)
  where status = 'published' and hidden = false;
create index if not exists community_events_organizer on public.community_events(organizer_id, created_at desc);
alter table public.community_events enable row level security;
-- Writes/private reads use narrow server endpoints with explicit owner/admin checks.
-- No direct browser writes: callers cannot impersonate organizers or unhide moderated events.
revoke all on public.community_events from public, anon, authenticated;
grant select on public.community_events to anon, authenticated;
grant all on public.community_events to service_role;
drop policy if exists "published community events are public" on public.community_events;
create policy "published community events are public" on public.community_events for select to anon, authenticated
  using (status = 'published' and hidden = false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-banners', 'event-banners', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "event banners are public" on storage.objects;
create policy "event banners are public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-banners');
-- Signed upload tokens are issued server-side to authenticated users, within their own folder.
commit;
-- Notes: apply to staging, run docs/supabase/tests/20261015_community_events.test.sql,
-- and exercise create/edit/publish/moderation before production. No seed events or games.
-- Global Storage upload limit must be >= 10485760 bytes; existing 50 MiB audio setting suffices.
