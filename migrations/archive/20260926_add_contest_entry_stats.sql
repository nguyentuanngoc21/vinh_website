-- Migration: thống kê bài dự thi cho tác giả (Contest Engine Phase 2, Slice 2.7).
-- Phụ thuộc migrations/20260926_add_reading_session_tracking.sql và
-- migrations/20260926_add_contest_scores.sql (chạy trước).
--
-- Chỉ thêm 1 hàm đọc (service_role): get_contest_entry_stats(submission).
-- Route kiểm người xem là tác giả của bài trước khi gọi.
--
-- Mọi chỉ số tính từ submission_start của cuộc thi, KHÔNG tính chính tác giả,
-- và không dùng lượt xem trang (books.view_count):
--   - readers: người có phiên đọc với thời gian đọc thật > 0 (Slice 2.1).
--   - return_readers: người đọc ở ≥ 2 ngày khác nhau (giờ Việt Nam).
--   - completed_readers: người đã đọc hết chương cuối đang hiển thị
--     (reading_history — record_chapter_read, kiểm quyền đọc ở server).
--   - continue_rate: trung bình qua từng cặp chương liền nhau của (người đọc
--     cả 2 chương ÷ người đọc chương trước); null nếu truyện 1 chương.
--   - avg_session_seconds: thời gian đọc thật trung bình mỗi phiên.
--   - sources: nguồn của phiên ĐẦU TIÊN của mỗi người (null → 'other').
--   - funnel: số người đọc từng chương (tối đa 50 chương đầu).
--   - comments / commenters: bình luận trên các chương của truyện.
--   - new_followers(_7d): người theo dõi TÁC GIẢ mới (theo dõi là theo tác giả,
--     không theo truyện).
--   - valid_readers / readers_7d: từ bảng điểm cache (cùng số với xếp hạng;
--     null khi chưa tính lần nào).
-- Số phiếu KHÔNG có ở đây: route quyết định hiển thị theo capability (P9 — ẩn
-- trong lúc bình chọn).
--
-- Idempotent: create or replace function.
-- Test: docs/supabase/tests/20260926_contest_entry_stats.test.sql.

create or replace function public.get_contest_entry_stats(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_start timestamptz;
  v_result jsonb;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select submission_start into v_start from public.contests where id = v_sub.contest_id;

  with chapters as (
    select ch.id, ch.title, ch.order_index,
           row_number() over (order by ch.order_index, ch.id) as pos
    from public.chapters ch
    where ch.book_id = v_sub.book_id and ch.published and ch.removed_at is null
  ),
  sessions as (
    select rs.user_id, rs.chapter_id, rs.active_seconds, rs.start_time, rs.source
    from public.reading_sessions rs
    where rs.book_id = v_sub.book_id
      and rs.start_time >= v_start
      and rs.user_id <> v_sub.author_id
      and rs.active_seconds > 0
  ),
  readers as (
    select s.user_id,
           count(distinct (s.start_time at time zone 'Asia/Ho_Chi_Minh')::date) as days
    from sessions s
    group by s.user_id
  ),
  chapter_readers as (
    select distinct s.user_id, c.pos
    from sessions s
    join chapters c on c.id = s.chapter_id
  ),
  funnel as (
    select c.id, c.title, c.pos, count(cr.user_id)::integer as readers
    from chapters c
    left join chapter_readers cr on cr.pos = c.pos
    where c.pos <= 50
    group by c.id, c.title, c.pos
  ),
  continuation as (
    select a.pos,
           count(*)::numeric as prev_readers,
           count(b.user_id)::numeric as kept
    from chapter_readers a
    left join chapter_readers b on b.user_id = a.user_id and b.pos = a.pos + 1
    where a.pos < (select max(pos) from chapters)
    group by a.pos
  ),
  first_source as (
    select distinct on (s.user_id) s.user_id, coalesce(s.source, 'other') as source
    from sessions s
    order by s.user_id, s.start_time
  ),
  last_chapter as (
    select c.id from chapters c order by c.pos desc limit 1
  ),
  comments as (
    select ac.user_id
    from public.anchored_comments ac
    join chapters c on c.id = ac.chapter_id
    where ac.created_at >= v_start and ac.user_id <> v_sub.author_id
  ),
  follows as (
    select f.created_at
    from public.author_follows f
    where f.author_id = v_sub.author_id and f.created_at >= v_start
  )
  select jsonb_build_object(
    'since', v_start,
    'chapter_count', (select count(*) from chapters),
    'readers', (select count(*) from readers),
    'return_readers', (select count(*) from readers where days >= 2),
    'completed_readers', (
      select count(distinct rh.user_id) from public.reading_history rh
      where rh.chapter_id = (select id from last_chapter)
        and rh.read_at >= v_start and rh.user_id <> v_sub.author_id),
    'continue_rate', (
      select case when (select count(*) from chapters) < 2 or count(*) = 0 then null
                  else round(avg(kept / prev_readers), 4) end
      from continuation),
    'avg_session_seconds', (select round(avg(active_seconds))::integer from sessions),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'readers', x.n) order by x.n desc, x.source)
      from (select source, count(*)::integer as n from first_source group by source) x), '[]'::jsonb),
    'funnel', coalesce((
      select jsonb_agg(jsonb_build_object('chapter_id', f.id, 'title', f.title, 'position', f.pos, 'readers', f.readers) order by f.pos)
      from funnel f), '[]'::jsonb),
    'comments', (select count(*) from comments),
    'commenters', (select count(distinct user_id) from comments),
    'new_followers', (select count(*) from follows),
    'new_followers_7d', (select count(*) from follows where created_at >= now() - interval '7 days'),
    'valid_readers', (select sc.valid_readers from public.contest_submission_scores sc where sc.submission_id = p_submission_id),
    'readers_7d', (select sc.readers_7d from public.contest_submission_scores sc where sc.submission_id = p_submission_id)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.get_contest_entry_stats(uuid) from public, anon, authenticated;
grant execute on function public.get_contest_entry_stats(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Functions get_contest_entry_stats.
--   - src/lib/contests/stats-service.ts, trang /author/contests/[slug]/stats.
-- ---------------------------------------------------------------------
