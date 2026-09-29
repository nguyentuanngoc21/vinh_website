-- Contest Engine Phase 3, Slice 3.4 (K9): cột "Thay đổi" ▲▼ ở BXH.
--
--   - contest_rank_snapshots: hạng của mỗi bài theo ngày (giờ Việt Nam), cho
--     2 bảng còn biến động: Bảng phiếu bình chọn (chỉ trong lúc bình chọn) và
--     Trending (từ lúc nhận bài đến hết chấm). Chung cuộc / Ban giám khảo đã
--     chốt nên không chụp.
--   - snapshot_contest_ranks(): cron 00:05 giờ VN (api/contests/cron/advance,
--     sau khi tính lại bảng điểm) chụp 1 lần / ngày / bảng. Hạng lấy từ đúng
--     RPC của BXH công khai (get_contest_ranking, get_contest_score_ranking),
--     phân trang theo cursor → khớp hạng người xem thấy. Đã có bản chụp của
--     ngày đó thì bỏ qua (không trộn 2 thời điểm).
--   - BXH so hạng hiện tại với bản chụp 0h hôm nay (= hạng cuối ngày hôm qua).
--     Chỉ so hạng, không lưu / lộ số phiếu (Q3).
--
-- Idempotent: if not exists, create or replace.
-- Test: docs/supabase/tests/20260928_contest_rank_snapshots.test.sql.

create table if not exists public.contest_rank_snapshots (
  contest_id uuid not null references public.contests (id) on delete cascade,
  kind text not null check (kind in ('popular', 'trending')),
  snapshot_day date not null,       -- ngày theo giờ Việt Nam
  submission_id uuid not null,
  rank integer not null check (rank > 0),
  created_at timestamptz not null default now(),
  primary key (contest_id, kind, snapshot_day, submission_id),
  constraint contest_rank_snapshots_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete cascade
);

alter table public.contest_rank_snapshots enable row level security;
revoke all on public.contest_rank_snapshots from anon, authenticated;

-- Chụp hạng của 1 cuộc thi cho ngày p_day (mặc định: hôm nay giờ VN).
-- Trả số dòng đã ghi (0 nếu ngoài giai đoạn hoặc đã chụp).
create or replace function public.snapshot_contest_ranks(p_contest_id uuid, p_day date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.contest_status;
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_total integer := 0;
  v_page integer;
  v_rank integer;
  v_at timestamptz;
  v_id uuid;
  r record;
begin
  select c.status into v_status from public.contests c where c.id = p_contest_id;
  if v_status is null then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;

  -- Bảng phiếu bình chọn: chỉ biến động trong khung bình chọn.
  if v_status = 'community_voting' and not exists (
    select 1 from public.contest_rank_snapshots s
     where s.contest_id = p_contest_id and s.kind = 'popular' and s.snapshot_day = v_day
  ) then
    v_rank := null; v_at := null; v_id := null;
    loop
      v_page := 0;
      for r in select * from public.get_contest_ranking(p_contest_id, 100, v_rank, v_at, v_id) loop
        insert into public.contest_rank_snapshots (contest_id, kind, snapshot_day, submission_id, rank)
        values (p_contest_id, 'popular', v_day, r.submission_id, r.rank);
        v_page := v_page + 1;
        v_rank := r.rank; v_at := r.submitted_at; v_id := r.submission_id;
      end loop;
      v_total := v_total + v_page;
      exit when v_page < 100;
    end loop;
  end if;

  -- Trending: từ lúc nhận bài đến hết chấm (cùng tập cuộc thi được cron tính lại điểm).
  if v_status in ('submission_open', 'submission_closed', 'community_voting', 'judging') and not exists (
    select 1 from public.contest_rank_snapshots s
     where s.contest_id = p_contest_id and s.kind = 'trending' and s.snapshot_day = v_day
  ) then
    v_rank := null; v_at := null; v_id := null;
    loop
      v_page := 0;
      for r in select * from public.get_contest_score_ranking(p_contest_id, 'trending', 100, v_rank, v_at, v_id) loop
        insert into public.contest_rank_snapshots (contest_id, kind, snapshot_day, submission_id, rank)
        values (p_contest_id, 'trending', v_day, r.submission_id, r.rank);
        v_page := v_page + 1;
        v_rank := r.rank; v_at := r.submitted_at; v_id := r.submission_id;
      end loop;
      v_total := v_total + v_page;
      exit when v_page < 100;
    end loop;
  end if;

  return v_total;
end;
$$;

revoke execute on function public.snapshot_contest_ranks(uuid, date) from public, anon, authenticated;
grant execute on function public.snapshot_contest_ranks(uuid, date) to service_role;
