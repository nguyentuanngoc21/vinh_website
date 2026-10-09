-- Chapter version history ("Lịch sử phiên bản"): a trigger keeps the PREVIOUS
-- title/content whenever a chapter's content changes — at most one snapshot
-- per 10 minutes of editing, plus always before a large change (restoring an
-- old version, replacing the whole text). Keeps the latest 50 per chapter.
-- Content is as sensitive as chapters.content: no client grants at all; the
-- author reads it through /api/authoring/chapters/[chapterId]/versions after an
-- ownership check. Retention: a purged chapter (content_purged_at) loses its
-- history too, and removed chapters stop collecting it.
-- Apply after 20261009_author_daily_words.sql (uses chapter_word_count). Safe to rerun.
begin;

create table if not exists public.chapter_versions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  title text not null,
  content text not null,
  word_count integer not null,
  content_version integer not null,
  created_at timestamptz not null default now()
);
create index if not exists chapter_versions_chapter_created_idx on public.chapter_versions (chapter_id, created_at desc);

alter table public.chapter_versions enable row level security;
revoke all on public.chapter_versions from public, anon, authenticated;
grant all on public.chapter_versions to service_role;

create or replace function public.snapshot_chapter_version() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_last timestamptz;
  v_old integer := char_length(coalesce(old.content, ''));
  v_new integer := char_length(coalesce(new.content, ''));
begin
  if new.content_purged_at is not null and old.content_purged_at is null then
    delete from public.chapter_versions where chapter_id = new.id;
    return new;
  end if;
  if new.content is not distinct from old.content or new.removed_at is not null or btrim(coalesce(old.content, '')) = '' then
    return new;
  end if;
  select max(created_at) into v_last from public.chapter_versions where chapter_id = new.id;
  if v_last is null or v_last < now() - interval '10 minutes' or abs(v_new - v_old) > greatest(200, v_old / 5) then
    insert into public.chapter_versions (chapter_id, title, content, word_count, content_version)
      values (old.id, old.title, old.content, public.chapter_word_count(old.content), old.content_version);
    delete from public.chapter_versions where chapter_id = new.id and id not in (
      select id from public.chapter_versions where chapter_id = new.id order by created_at desc limit 50);
  end if;
  return new;
end $$;
revoke all on function public.snapshot_chapter_version() from public, anon, authenticated;

drop trigger if exists chapter_snapshot_version on public.chapters;
create trigger chapter_snapshot_version after update of content on public.chapters
for each row execute function public.snapshot_chapter_version();

commit;
-- Notes: mirrored in baseline/05_quests_and_achievements.sql right after the daily-words
-- section (needs chapter_word_count); regenerate schema.sql. Update supabase/types.ts
-- (chapter_versions). Code: api/authoring/chapters/[chapterId]/versions (+ [versionId]),
-- lib/authoring/paragraph-diff.ts, components/author/version-history.tsx, chapter-editor.tsx.
