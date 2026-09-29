-- Migration: hàng khám phá dựa trên tín hiệu (Contest Engine Phase 2, Slice 2.3).
-- Phụ thuộc migrations/20260926_add_contest_scores.sql (chạy trước).
--
-- Chỉ thêm 2 hàm đọc (service_role), đọc bảng điểm cache contest_submission_scores
-- (làm mới lười 15 phút — Slice 2.2). Không đổi bảng, không đổi hàm cũ.
--   - get_contest_signal_feed: hàng "Đang được chú ý" (attention — tổng độc
--     giả hợp lệ) và "Đang tăng tốc" (trending — độc giả hợp lệ mới trong 7
--     ngày, P4). Chỉ bài có giá trị > 0; kèm số 7 ngày trước đó để hiện % tăng.
--   - get_contest_hidden_gem_pools: 2 nhóm ứng viên "Viên ngọc ẩn" (P5), mỗi
--     nhóm xáo theo seed (md5, như feed discover):
--       low_readers = bài có < p_max_readers độc giả hợp lệ;
--       low_views   = bài NGOÀI top 10 theo books.view_count của cuộc thi.
--     Tỷ lệ 80/20 và fallback khi 1 nhóm trống chọn ở
--     src/lib/contests/signals.ts. view_count chỉ dùng để chọn bài hiển thị,
--     không vào điểm / hạng / giải (VII.4).
--
-- Mọi hàm chỉ tính bài eligible/shortlisted của sách còn hiển thị thuộc cuộc
-- thi không nháp — giống get_contest_ranking.
--
-- Idempotent: create or replace function.
-- Test: docs/supabase/tests/20260926_contest_signal_feeds.test.sql.

create or replace function public.get_contest_signal_feed(
  p_contest_id uuid,
  p_kind text,          -- 'attention' | 'trending'
  p_limit integer
) returns table (
  submission_id uuid,
  book_id uuid,
  valid_readers integer,
  readers_7d integer,
  readers_prev_7d integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_kind not in ('attention', 'trending') then
    raise exception 'Unknown feed kind %', p_kind using hint = 'invalid_sort';
  end if;

  return query
  select s.id, s.book_id, sc.valid_readers, sc.readers_7d, sc.readers_prev_7d
  from public.contest_submissions s
  join public.contests c on c.id = s.contest_id and c.status <> 'draft'
  join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
  join public.contest_submission_scores sc on sc.submission_id = s.id
  where s.contest_id = p_contest_id
    and s.status in ('eligible', 'shortlisted')
    and (case when p_kind = 'attention' then sc.valid_readers else sc.readers_7d end) > 0
  order by (case when p_kind = 'attention' then sc.valid_readers else sc.readers_7d end) desc,
           s.submitted_at asc, s.id asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

revoke execute on function public.get_contest_signal_feed(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.get_contest_signal_feed(uuid, text, integer) to service_role;

create or replace function public.get_contest_hidden_gem_pools(
  p_contest_id uuid,
  p_seed text,
  p_max_readers integer,
  p_pool_limit integer
) returns table (
  submission_id uuid,
  book_id uuid,
  pool text             -- 'low_readers' | 'low_views'
)
language sql
stable
security definer
set search_path = public
as $$
  with entries as (
    select s.id, s.book_id, s.submitted_at, b.view_count,
           coalesce(sc.valid_readers, 0) as readers
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id and c.status <> 'draft'
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    left join public.contest_submission_scores sc on sc.submission_id = s.id
    where s.contest_id = p_contest_id
      and s.status in ('eligible', 'shortlisted')
  ),
  top_views as (
    select e.id from entries e
    order by e.view_count desc, e.submitted_at asc, e.id asc
    limit 10
  ),
  low_readers as (
    select e.id, e.book_id, 'low_readers'::text as pool
    from entries e
    where e.readers < p_max_readers
    order by md5(e.id::text || p_seed)
    limit least(greatest(coalesce(p_pool_limit, 20), 1), 50)
  ),
  low_views as (
    select e.id, e.book_id, 'low_views'::text as pool
    from entries e
    where e.id not in (select t.id from top_views t)
    order by md5(e.id::text || p_seed)
    limit least(greatest(coalesce(p_pool_limit, 20), 1), 50)
  )
  select id, book_id, pool from low_readers
  union all
  select id, book_id, pool from low_views;
$$;

revoke execute on function public.get_contest_hidden_gem_pools(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_contest_hidden_gem_pools(uuid, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Functions get_contest_signal_feed,
--     get_contest_hidden_gem_pools.
--   - src/lib/contests/signals.ts (80/20, % tăng), feeds.ts, microsite tab
--     Khám phá + BXH Trending.
-- ---------------------------------------------------------------------
