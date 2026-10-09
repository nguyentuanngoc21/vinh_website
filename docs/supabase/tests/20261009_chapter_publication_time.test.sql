-- Run after 20261009_chapter_publication_time.sql. Fixtures roll back.
begin;
do $$
declare
  v_author uuid := gen_random_uuid();
  v_book uuid := gen_random_uuid();
  v_chapter uuid := gen_random_uuid();
  v_time timestamptz;
  v_latest timestamptz;
begin
  insert into auth.users (id, email, created_at)
  values (v_author, v_author::text || '@test.invalid', now());
  insert into public.profiles (id, username, nickname)
  values (v_author, 'pub' || left(replace(v_author::text, '-', ''), 12), 'Publication test');
  insert into public.books (id, author_id, title, slug, published, is_exclusive)
  values (v_book, v_author, 'Original title', v_book::text, true, false);
  insert into public.chapters (id, book_id, title, content, order_index, published)
  values (v_chapter, v_book, 'Draft', 'Test', 1, false);
  if (select published_at from public.chapters where id = v_chapter) is not null then
    raise exception 'Draft must not have a publication timestamp';
  end if;
  update public.chapters set published = true where id = v_chapter;
  select published_at into v_time from public.chapters where id = v_chapter;
  if v_time is distinct from now() then raise exception 'Publication must record current time'; end if;
  update public.books set title = 'Renamed story' where id = v_book;
  update public.chapters set title = 'Edited', published_at = now() - interval '7 days' where id = v_chapter;
  select latest_published_chapter_at into v_latest from public.book_chapter_stats where book_id = v_book;
  if v_latest is distinct from v_time then raise exception 'Edits must not bump or overwrite publication time'; end if;
  update public.chapters set published = false where id = v_chapter;
  if exists (select 1 from public.book_chapter_stats where book_id = v_book) then
    raise exception 'A story without public chapters must be absent from updates';
  end if;
  update public.chapters set published = true where id = v_chapter;
  if (select published_at from public.chapters where id = v_chapter) is distinct from v_time then
    raise exception 'Republishing an existing chapter must preserve its first publication';
  end if;
  update public.books set deleted_at = now() where id = v_book;
  if exists (select 1 from public.book_chapter_stats where book_id = v_book) then
    raise exception 'Deleted stories must be absent from updates';
  end if;
  raise notice 'PASS: chapter publication and stable story ID';
end;
$$;
rollback;
