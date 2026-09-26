-- Migration: Contest Engine — bản chụp bài dự thi lúc đóng nhận bài (Slice 1.6, D3 + Q1).
-- Phụ thuộc migrations/20260926_add_contest_engine_core.sql.
--
-- Mục tiêu: bản được chấm ĐÚNG BẰNG trạng thái sách tại submission_end, dù
-- cron đổi trạng thái chạy trễ (1 lần/ngày). Không clone Book — mọi ID,
-- comment, highlight, tiến độ đọc, giao dịch giữ nguyên; tác giả vẫn sửa
-- sách tự do, chỉ bản chụp được chấm.
--
-- Snapshot-on-write (XIX.5 của docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md):
--   - Lần GHI ĐẦU TIÊN sau hạn vào chương/sách của một bài dự thi chưa có bản
--     chụp → trigger BEFORE chụp toàn bộ sách, trong đó dòng đang bị sửa lấy
--     giá trị OLD (trước khi sửa), dòng khác lấy hiện tại (chưa ai sửa từ lúc
--     hạn — nếu có thì trigger đã chụp trước đó). Rồi mới cho ghi. Lần ghi
--     sau thấy bản chụp đã có → bỏ qua (1 truy vấn exists).
--   - Không cần so nội dung để biết sách có bị sửa: có thao tác ghi đã là
--     tín hiệu. content_hash chỉ để Phase 2 báo "đã sửa sau hạn".
--   - Sách không bị sửa: cron/admin đóng nhận bài gọi
--     snapshot_contest_submissions() — trạng thái hiện tại chính là lúc hạn.
--   - "Đã quá hạn" = cuộc thi đã rời submission_open HOẶC now() >= submission_end
--     (admin đóng sớm cũng được chụp đúng lúc đóng).
--   - Thao tác dọn nội dung của cron purge-deleted-content (content_purged_at
--     được đặt) không phải chỉnh sửa của tác giả → không chụp; bản chụp có
--     sẵn của nội dung bị dọn được dọn theo bằng purge_contest_snapshots().
--
-- Lưu ý PL/pgSQL: với biến kiểu dòng (public.chapters), `v IS NOT NULL` chỉ
-- đúng khi MỌI cột khác null — nên luôn kiểm (v).id thay vì cả dòng.
--
-- Bảo mật: 2 bảng bản chụp không có policy nào (chỉ service-role đọc; màn
-- giám khảo ở Phase 2). Trigger function là SECURITY DEFINER để ghi được bản
-- chụp khi tác giả (role authenticated) sửa chương.
--
-- Idempotent: create ... if not exists, create or replace, drop trigger if exists.
-- Test: docs/supabase/tests/20260926_contest_snapshots.test.sql.

create table if not exists public.contest_submission_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  contest_id uuid not null,
  reason text not null check (reason in ('submission_closed', 'manual')),
  taken_at timestamptz not null default now(),
  book_title text not null,
  synopsis text,
  genre text,
  tags text[] not null default '{}',
  chapter_count integer not null default 0,
  total_words integer not null default 0,
  content_purged_at timestamptz,
  constraint contest_submission_snapshots_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_submission_snapshots_once unique (submission_id, reason)
);

create index if not exists contest_submission_snapshots_contest_idx
  on public.contest_submission_snapshots (contest_id);

create table if not exists public.contest_submission_snapshot_chapters (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.contest_submission_snapshots (id) on delete cascade,
  -- set null: chương nháp có thể bị xoá thật; bản chụp vẫn giữ nội dung đã chấm.
  chapter_id uuid references public.chapters (id) on delete set null,
  order_index integer not null,
  title text not null,
  content text not null,
  word_count integer not null,
  content_hash text not null,           -- sha256 hex của content lúc chụp
  content_purged_at timestamptz
);

create index if not exists contest_submission_snapshot_chapters_snapshot_idx
  on public.contest_submission_snapshot_chapters (snapshot_id, order_index);
create index if not exists contest_submission_snapshot_chapters_chapter_idx
  on public.contest_submission_snapshot_chapters (chapter_id);

alter table public.contest_submission_snapshots enable row level security;
alter table public.contest_submission_snapshot_chapters enable row level security;
revoke all on public.contest_submission_snapshots, public.contest_submission_snapshot_chapters from anon, authenticated;

-- Có bài dự thi nào của sách đang chờ chụp không (đường nóng của trigger).
create or replace function public.contest_book_needs_snapshot(p_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    where s.book_id = p_book_id
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging')
      and (c.status <> 'submission_open' or now() >= c.submission_end)
      and not exists (
        select 1 from public.contest_submission_snapshots x
        where x.submission_id = s.id and x.reason = 'submission_closed'
      )
  );
$$;

-- Chụp mọi bài đang chờ của 1 sách. p_old_chapter / p_old_book: giá trị
-- TRƯỚC KHI SỬA của dòng đang được ghi (null = chụp đúng trạng thái hiện tại).
-- p_submission_id: chỉ chụp 1 bài (cron); null = mọi bài đang chờ của sách.
create or replace function public.take_contest_snapshots_for_book(
  p_book_id uuid,
  p_old_chapter public.chapters default null,
  p_old_book public.books default null,
  p_submission_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books;
  v_sub record;
  v_snap uuid;
  v_count integer := 0;
begin
  if (p_old_book).id is not null then
    v_book := p_old_book;
  else
    select * into v_book from public.books where id = p_book_id;
  end if;
  if v_book.id is null then
    return 0;
  end if;

  for v_sub in
    select s.id, s.contest_id
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    where s.book_id = p_book_id
      and (p_submission_id is null or s.id = p_submission_id)
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging')
      and (c.status <> 'submission_open' or now() >= c.submission_end)
      and not exists (
        select 1 from public.contest_submission_snapshots x
        where x.submission_id = s.id and x.reason = 'submission_closed'
      )
  loop
    v_snap := null;
    insert into public.contest_submission_snapshots (submission_id, contest_id, reason, book_title, synopsis, genre, tags)
    values (v_sub.id, v_sub.contest_id, 'submission_closed', v_book.title, v_book.synopsis, v_book.genre, coalesce(v_book.tags, '{}'))
    on conflict (submission_id, reason) do nothing
    returning id into v_snap;
    continue when v_snap is null;

    insert into public.contest_submission_snapshot_chapters (snapshot_id, chapter_id, order_index, title, content, word_count, content_hash)
    select v_snap, ch.id, ch.order_index, ch.title, ch.content,
           public.contest_word_count(ch.content),
           encode(sha256(convert_to(ch.content, 'UTF8')), 'hex')
    from (
      select c.id, c.order_index, c.title, c.content
      from public.chapters c
      where c.book_id = p_book_id and c.published and c.removed_at is null
        and ((p_old_chapter).id is null or c.id <> (p_old_chapter).id)
      union all
      select (p_old_chapter).id, (p_old_chapter).order_index, (p_old_chapter).title, (p_old_chapter).content
      where (p_old_chapter).id is not null
        and (p_old_chapter).book_id = p_book_id
        and (p_old_chapter).published
        and (p_old_chapter).removed_at is null
    ) ch;

    update public.contest_submission_snapshots s
       set chapter_count = t.n, total_words = t.words
      from (
        select count(*)::integer as n, coalesce(sum(word_count), 0)::integer as words
        from public.contest_submission_snapshot_chapters where snapshot_id = v_snap
      ) t
     where s.id = v_snap;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.contest_book_needs_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.contest_book_needs_snapshot(uuid) to service_role;
revoke execute on function public.take_contest_snapshots_for_book(uuid, public.chapters, public.books, uuid) from public, anon, authenticated;
grant execute on function public.take_contest_snapshots_for_book(uuid, public.chapters, public.books, uuid) to service_role;

-- Trigger trên chapters: bắt sửa/xuất bản/gỡ chương, đổi thứ tự
-- (reorder_book_chapters), thêm chương mới (chương mới không vào bản chụp).
create or replace function public.chapters_snapshot_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cron dọn nội dung đã gỡ/xoá: không phải chỉnh sửa của tác giả.
  if tg_op = 'UPDATE' and new.content_purged_at is not null and old.content_purged_at is null then
    return new;
  end if;
  if public.contest_book_needs_snapshot(new.book_id) then
    if tg_op = 'UPDATE' then
      perform public.take_contest_snapshots_for_book(new.book_id, old, null, null);
    else
      perform public.take_contest_snapshots_for_book(new.book_id, null, null, null);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_snapshot_before_write on public.chapters;
create trigger chapters_snapshot_before_write
  before insert or update on public.chapters
  for each row execute function public.chapters_snapshot_before_write();

-- Trigger trên books: tựa / tóm tắt / thể loại / tag nằm trong bản chụp.
create or replace function public.books_snapshot_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.content_purged_at is not null and old.content_purged_at is null then
    return new;
  end if;
  if public.contest_book_needs_snapshot(new.id) then
    perform public.take_contest_snapshots_for_book(new.id, null, old, null);
  end if;
  return new;
end;
$$;

drop trigger if exists books_snapshot_before_write on public.books;
create trigger books_snapshot_before_write
  before update of title, synopsis, genre, tags on public.books
  for each row execute function public.books_snapshot_before_write();

-- Cron / admin đóng nhận bài: chụp mọi bài của cuộc thi chưa có bản chụp
-- (sách không bị sửa từ lúc hạn). Idempotent nhờ unique (submission_id, reason).
create or replace function public.snapshot_contest_submissions(p_contest_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_count integer := 0;
begin
  for v_sub in
    select s.id, s.book_id
    from public.contest_submissions s
    where s.contest_id = p_contest_id
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and not exists (
        select 1 from public.contest_submission_snapshots x
        where x.submission_id = s.id and x.reason = 'submission_closed'
      )
  loop
    v_count := v_count + public.take_contest_snapshots_for_book(v_sub.book_id, null, null, v_sub.id);
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.snapshot_contest_submissions(uuid) from public, anon, authenticated;
grant execute on function public.snapshot_contest_submissions(uuid) to service_role;

-- Dọn bản chụp cùng nội dung đã gỡ/xoá quá hạn (gọi từ cron
-- purge-deleted-content SAU khi dọn chương/sách) — không để bản chụp thành
-- đường giữ lại nội dung vi phạm.
create or replace function public.purge_contest_snapshots(p_book_ids uuid[], p_chapter_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.contest_submission_snapshot_chapters sc
     set content = '', content_purged_at = now()
   where sc.content_purged_at is null
     and (
       sc.chapter_id = any (coalesce(p_chapter_ids, '{}'))
       or sc.snapshot_id in (
         select x.id from public.contest_submission_snapshots x
         join public.contest_submissions s on s.id = x.submission_id
         where s.book_id = any (coalesce(p_book_ids, '{}'))
       )
     );
  get diagnostics v_count = row_count;

  update public.contest_submission_snapshots x
     set synopsis = null, content_purged_at = now()
    from public.contest_submissions s
   where s.id = x.submission_id
     and s.book_id = any (coalesce(p_book_ids, '{}'))
     and x.content_purged_at is null;
  return v_count;
end;
$$;

revoke execute on function public.purge_contest_snapshots(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.purge_contest_snapshots(uuid[], uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Tables contest_submission_snapshots,
--     contest_submission_snapshot_chapters; Functions
--     snapshot_contest_submissions, purge_contest_snapshots.
--   - src/lib/contests/lifecycle-service.ts: đóng nhận bài (cron + admin) gọi
--     snapshot_contest_submissions() rồi kiểm lại điều kiện lúc đóng (D4).
--   - src/app/api/admin/cron/purge-deleted-content/route.ts: gọi
--     purge_contest_snapshots() sau khi dọn chương/sách.
--   - vercel.json: cron /api/contests/cron/advance.
-- ---------------------------------------------------------------------
