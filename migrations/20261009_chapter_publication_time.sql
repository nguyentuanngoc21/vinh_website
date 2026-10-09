-- Track first publication, rather than draft creation or metadata edits.
begin;

alter table public.chapters add column if not exists published_at timestamptz;

-- Historical publication times were not recorded; created_at is the fallback.
update public.chapters set published_at = created_at
where published and published_at is null;

create or replace function public.set_chapter_published_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := case when new.published then now() else null end;
  else
    new.published_at := old.published_at;
    if new.published and not old.published and old.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_chapter_published_at on public.chapters;
create trigger set_chapter_published_at
before insert or update on public.chapters
for each row execute function public.set_chapter_published_at();

create or replace view public.book_chapter_stats as
  select c.book_id,
         count(*)::integer as published_chapter_count,
         bool_or(c.is_last_chapter) as has_published_last_chapter,
         max(coalesce(c.published_at, c.created_at)) as latest_published_chapter_at
  from public.chapters c
  join public.books b on b.id = c.book_id
  where c.published and b.published and b.deleted_at is null
  group by c.book_id;

grant select on public.book_chapter_stats to anon, authenticated, service_role;

commit;
