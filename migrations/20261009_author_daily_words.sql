-- Daily writing goal ("Mục tiêu viết mỗi ngày"): a personal target per author,
-- words written per day, and a streak — display only, no token reward (owner
-- decision 2026-10-09). The day is current_date (UTC), the same 07:00 VN reset
-- as daily quests.
--
-- Words are counted by a trigger on chapters, so every save path counts the
-- same way. A chapter only earns words beyond the most it has ever had
-- (chapter_word_marks), so deleting and pasting the same text back, or
-- rewriting a passage, never counts twice. Inserting a chapter (manuscript
-- import, new book) is not counted — only edits are.
-- Safe to rerun.
begin;

create table if not exists public.author_writing_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_words integer not null check (daily_words between 50 and 50000),
  updated_at timestamptz not null default now()
);

create table if not exists public.author_daily_words (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  words integer not null default 0 check (words >= 0),
  primary key (user_id, day)
);

create table if not exists public.chapter_word_marks (
  chapter_id uuid primary key references public.chapters (id) on delete cascade,
  max_words integer not null check (max_words >= 0)
);

alter table public.author_writing_goals enable row level security;
alter table public.author_daily_words enable row level security;
alter table public.chapter_word_marks enable row level security;

drop policy if exists "users manage their own writing goal" on public.author_writing_goals;
create policy "users manage their own writing goal" on public.author_writing_goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "users read their own daily words" on public.author_daily_words;
create policy "users read their own daily words" on public.author_daily_words for select
  using (user_id = auth.uid());
-- chapter_word_marks: no policy — only the trigger (security definer) touches it.

revoke all on public.author_writing_goals, public.author_daily_words, public.chapter_word_marks from anon;
revoke all on public.chapter_word_marks from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.author_daily_words from public, authenticated;
revoke truncate, references, trigger on public.author_writing_goals from public, authenticated;
grant select on public.author_daily_words to authenticated;
grant select, insert, update, delete on public.author_writing_goals to authenticated;
grant all on public.author_writing_goals, public.author_daily_words, public.chapter_word_marks to service_role;

-- Same rule as countWords() in src/lib/authoring/split-chapters.ts (/\S+/g),
-- incl. Unicode spaces (see contest_word_count in 11_contests.sql).
create or replace function public.chapter_word_count(p text)
returns integer language sql immutable parallel safe as $$
  select count(*)::integer
  from regexp_matches(
    regexp_replace(coalesce(p, ''), '[   -     　﻿]', ' ', 'g'),
    '\S+', 'g'
  );
$$;

create or replace function public.record_chapter_words() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_author uuid;
  v_new integer;
  v_mark integer;
begin
  if new.content is not distinct from old.content then return new; end if;
  select author_id into v_author from public.books where id = new.book_id;
  if v_author is null then return new; end if;
  v_new := public.chapter_word_count(new.content);

  -- First edit since this feature shipped: the chapter's old length is the baseline.
  insert into public.chapter_word_marks (chapter_id, max_words)
    values (new.id, public.chapter_word_count(old.content))
    on conflict (chapter_id) do nothing;
  select max_words into v_mark from public.chapter_word_marks where chapter_id = new.id for update;

  if v_new > v_mark then
    update public.chapter_word_marks set max_words = v_new where chapter_id = new.id;
    insert into public.author_daily_words (user_id, day, words) values (v_author, current_date, v_new - v_mark)
      on conflict (user_id, day) do update set words = public.author_daily_words.words + excluded.words;
  end if;
  return new;
end $$;
revoke all on function public.record_chapter_words() from public, anon, authenticated;

drop trigger if exists chapter_record_words on public.chapters;
create trigger chapter_record_words after update of content on public.chapters
for each row execute function public.record_chapter_words();

commit;
-- Notes: mirrored in baseline/05_quests_and_achievements.sql (needs 02's books/chapters);
-- regenerate schema.sql. Update supabase/types.ts (3 tables). Code: lib/authoring/writing-goal.ts,
-- api/authoring/writing-goal, components/author/writing-goal-card.tsx, chapter-editor.tsx (WordGoal),
-- author-workspace.tsx, components/profile/daily-tasks-tab.tsx.
