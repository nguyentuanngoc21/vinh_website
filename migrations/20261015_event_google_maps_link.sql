-- Additive: keeps existing events and the legacy organizer_bio column intact.
begin;
alter table public.community_events
  add column if not exists google_maps_url text;
alter table public.community_events
  drop constraint if exists community_events_google_maps_url_check;
alter table public.community_events
  add constraint community_events_google_maps_url_check check (
    google_maps_url is null or (
      char_length(google_maps_url) <= 2000 and
      google_maps_url ~* '^https://(maps\.app\.goo\.gl/[^/?#]+|goo\.gl/maps/[^/?#]+|(www\.)?google\.com(\.vn)?/maps([/?#]|$)|maps\.google\.com(\.vn)?([/?#]|$))'
    )
  );
commit;
-- Apply after 20261015_community_events.sql, before deploying the updated form/API.
-- No Google Places API, API key, billing or new storage bucket is needed.
-- organizer_bio is retained for old clients; current UI reads organizer bio from profiles.
