-- Words/phrases to double-check before publishing ("Kiểm tra từ nhạy cảm").
-- WARN ONLY — publishing is never blocked (owner decision 2026-10-09). The list
-- is maintained by admins directly in Supabase (Table editor); it starts empty.
-- Clients never read the list: POST /api/authoring/flag-check (service role)
-- returns only the terms found in the text the author sends. Safe to rerun.
begin;

create table if not exists public.content_flag_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique check (char_length(btrim(term)) between 1 and 100),
  -- Shown to the author next to the match, e.g. "Cân nhắc dán nhãn 18+".
  note text check (char_length(note) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.content_flag_terms enable row level security;
revoke all on public.content_flag_terms from public, anon, authenticated;
grant all on public.content_flag_terms to service_role;

commit;
-- Notes: mirrored in baseline/13_content_reports.sql; regenerate schema.sql. Update
-- supabase/types.ts (content_flag_terms). Code: lib/authoring/flag-terms.ts,
-- api/authoring/flag-check, author-workspace.tsx (warning before "Xuất bản").
-- Add terms: insert into public.content_flag_terms (term, note) values ('…', '…');
