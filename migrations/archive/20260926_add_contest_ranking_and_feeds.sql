-- Migration: Contest Engine — xếp hạng + feed (Phase 1, Slice 1.2).
-- Phụ thuộc migrations/20260926_add_contest_engine_core.sql (chạy trước).
--
-- Chỉ thêm 3 hàm đọc (service_role). Không đổi bảng, không đổi policy.
--   - get_contest_ranking: BXH "Độc giả yêu thích" = số phiếu hợp lệ
--     (popular-v1, D7 — src/lib/contests/scoring/popular-v1.ts). Hạng là hạng
--     TOÀN CỤC kiểu rank() (đồng điểm cùng hạng: 1, 2, 2, 4), thứ tự tất định
--     value desc, submitted_at asc, id asc; phân trang keyset theo (rank,
--     submitted_at, id) — rank tăng dần đúng theo value giảm dần, nên cursor
--     không phải mang số phiếu (số phiếu bị ẩn trong lúc bình chọn — Q3).
--     Tính gộp trong SQL — không kéo toàn bộ về Node.
--   - get_contest_entries: feed "Mới tham gia" (new), "Truyện đề xuất" ngẫu
--     nhiên có seed (discover, md5(id || seed) → phân trang ổn định, không lặp
--     bài), A–Z (az); lọc thể loại; p_contest_id null = gộp mọi cuộc thi công
--     khai đang diễn ra (hub /cuoc-thi). Kèm trạng thái bình chọn của người
--     xem theo lô (đã bình chọn? đã đọc hết ≥ 1 chương đang hiển thị?) để API
--     tính nút Bình chọn cho từng bài mà không gọi riêng từng bài.
--   - get_contest_summaries: số bài / số tác giả cho thẻ cuộc thi.
--
-- Mọi hàm chỉ tính bài eligible/shortlisted của sách còn hiển thị
-- (published, chưa deleted_at) thuộc cuộc thi không nháp — tôn trọng
-- moderation giống policy SELECT công khai. API còn kiểm capability
-- (rankings_visible, popular_values_visible) trước khi trả kết quả.
--
-- Idempotent: create or replace function.
-- Test: docs/supabase/tests/20260926_contest_ranking_and_feeds.test.sql.

create or replace function public.get_contest_ranking(
  p_contest_id uuid,
  p_limit integer,
  p_after_rank integer default null,
  p_after_submitted_at timestamptz default null,
  p_after_id uuid default null
) returns table (
  submission_id uuid,
  book_id uuid,
  author_id uuid,
  value integer,
  submitted_at timestamptz,
  rank integer,
  tied boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with entries as (
    select s.id, s.book_id, s.author_id, s.submitted_at
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id and c.status <> 'draft'
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.contest_id = p_contest_id
      and s.status in ('eligible', 'shortlisted')
  ),
  votes as (
    select v.submission_id, count(*)::integer as n
    from public.contest_votes v
    where v.contest_id = p_contest_id
    group by v.submission_id
  ),
  ranked as (
    select e.id, e.book_id, e.author_id, e.submitted_at,
           coalesce(v.n, 0) as value,
           (rank() over (order by coalesce(v.n, 0) desc))::integer as rank,
           count(*) over (partition by coalesce(v.n, 0)) > 1 as tied
    from entries e
    left join votes v on v.submission_id = e.id
  )
  select r.id, r.book_id, r.author_id, r.value, r.submitted_at, r.rank, r.tied
  from ranked r
  where p_after_id is null
     or r.rank > p_after_rank
     or (r.rank = p_after_rank and (r.submitted_at, r.id) > (p_after_submitted_at, p_after_id))
  order by r.value desc, r.submitted_at asc, r.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.get_contest_ranking(uuid, integer, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_contest_ranking(uuid, integer, integer, timestamptz, uuid) to service_role;

create or replace function public.get_contest_entries(
  p_contest_id uuid,              -- null = mọi cuộc thi công khai đang diễn ra (hub)
  p_sort text,                    -- 'new' | 'discover' | 'az'
  p_seed text,                    -- chỉ dùng cho 'discover'
  p_genre text,                   -- null = mọi thể loại
  p_limit integer,
  p_after_key text default null,  -- sort_key của dòng cuối trang trước
  p_after_id uuid default null,
  p_viewer_id uuid default null
) returns table (
  submission_id uuid,
  contest_id uuid,
  book_id uuid,
  author_id uuid,
  status public.contest_submission_status,
  submitted_at timestamptz,
  sort_key text,
  viewer_has_voted boolean,
  viewer_completed_chapter boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_after_ts timestamptz;
begin
  if p_sort not in ('new', 'discover', 'az') then
    raise exception 'Unknown sort %', p_sort using hint = 'invalid_sort';
  end if;
  if p_sort = 'discover' and coalesce(p_seed, '') = '' then
    raise exception 'Discover feed needs a seed' using hint = 'invalid_sort';
  end if;
  -- Ép kiểu cursor TRƯỚC truy vấn: OR trong SQL không đảm bảo đánh giá ngắn
  -- mạch, nên không được để p_after_key::timestamptz chạy trên cursor md5/tựa.
  if p_sort = 'new' and p_after_id is not null then
    begin
      v_after_ts := p_after_key::timestamptz;
    exception when others then
      raise exception 'Invalid cursor' using hint = 'invalid_cursor';
    end;
  end if;

  return query
  with entries as (
    select s.id, s.contest_id, s.book_id, s.author_id, s.status, s.submitted_at,
           case p_sort
             when 'new' then to_char(s.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             when 'discover' then md5(s.id::text || p_seed)
             else lower(b.title)
           end as sort_key
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.status in ('eligible', 'shortlisted')
      and (
        (p_contest_id is not null and s.contest_id = p_contest_id and c.status <> 'draft')
        or (p_contest_id is null and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging'))
      )
      and (p_genre is null or b.genre = p_genre)
  ),
  page as (
    select e.* from entries e
    where p_after_id is null
       or (p_sort = 'new' and (e.submitted_at, e.id) < (v_after_ts, p_after_id))
       or (p_sort <> 'new' and (e.sort_key, e.id) > (p_after_key, p_after_id))
    order by
      case when p_sort = 'new' then e.submitted_at end desc,
      case when p_sort = 'new' then e.id end desc,
      case when p_sort <> 'new' then e.sort_key end asc,
      case when p_sort <> 'new' then e.id end asc
    limit v_limit
  )
  select p.id, p.contest_id, p.book_id, p.author_id, p.status, p.submitted_at, p.sort_key,
         p_viewer_id is not null and exists (
           select 1 from public.contest_votes v where v.submission_id = p.id and v.user_id = p_viewer_id
         ),
         p_viewer_id is not null and exists (
           select 1 from public.reading_history rh
           join public.chapters ch on ch.id = rh.chapter_id
           where rh.user_id = p_viewer_id and ch.book_id = p.book_id and ch.published and ch.removed_at is null
         )
  from page p
  order by
    case when p_sort = 'new' then p.submitted_at end desc,
    case when p_sort = 'new' then p.id end desc,
    case when p_sort <> 'new' then p.sort_key end asc,
    case when p_sort <> 'new' then p.id end asc;
end;
$$;

revoke execute on function public.get_contest_entries(uuid, text, text, text, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_contest_entries(uuid, text, text, text, integer, text, uuid, uuid) to service_role;

create or replace function public.get_contest_summaries(p_contest_ids uuid[])
returns table (contest_id uuid, entry_count integer, author_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         count(s.id)::integer,
         count(distinct s.author_id)::integer
  from unnest(p_contest_ids) as c(id)
  left join public.contest_submissions s
    on s.contest_id = c.id
   and s.status in ('eligible', 'shortlisted')
   and exists (select 1 from public.books b where b.id = s.book_id and b.published and b.deleted_at is null)
  group by c.id;
$$;

revoke execute on function public.get_contest_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.get_contest_summaries(uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file (sau khối
--     Contest Engine core).
--   - src/lib/supabase/types.ts: Functions get_contest_ranking,
--     get_contest_entries, get_contest_summaries.
--   - Dùng bởi src/lib/contests/ranking-service.ts, feeds.ts, contest-service.ts.
-- ---------------------------------------------------------------------
