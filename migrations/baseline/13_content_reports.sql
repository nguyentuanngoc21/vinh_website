begin;
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  book_id uuid not null references public.books(id),
  chapter_id uuid references public.chapters(id),
  reason text not null check (reason in ('offensive', 'age_rating', 'plagiarism')),
  description text not null check (length(trim(description)) between 10 and 3000),
  evidence_url text check (length(evidence_url) <= 2000 and evidence_url ~ '^https?://'),
  book_title text not null,
  chapter_title text,
  book_slug text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text check (length(resolution_note) <= 3000),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('resolved', 'dismissed') or (reviewed_by is not null and resolution_note is not null and length(trim(resolution_note)) > 0))
);
create unique index content_reports_open_book on public.content_reports(reporter_id, book_id)
  where chapter_id is null and status in ('pending', 'reviewing');
create unique index content_reports_open_chapter on public.content_reports(reporter_id, chapter_id)
  where chapter_id is not null and status in ('pending', 'reviewing');
create index content_reports_queue on public.content_reports(status, created_at desc);
alter table public.content_reports enable row level security;
-- Only server endpoints can read/write: they resolve the signed app session
-- and check the current admin role. Reporter identity is never public.
revoke all on public.content_reports from public, anon, authenticated;
grant select, insert, update on public.content_reports to service_role;
commit;
