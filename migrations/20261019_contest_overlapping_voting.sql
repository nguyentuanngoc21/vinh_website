-- Allow voting while submissions are still open, without changing lifecycle status.
-- Dates continue to bound voting; eligibility, account-age and read checks stay intact.
BEGIN;

alter table public.contests drop constraint if exists contests_official_scoring_window;
alter table public.contests add constraint contests_official_scoring_window check (
  (official_scoring_start is null) = (official_scoring_end is null)
  and (official_scoring_start is null or official_scoring_start < official_scoring_end)
  and (official_scoring_start is null or official_scoring_start >= submission_start)
);

create or replace function public.cast_contest_vote(
  p_user_id uuid,
  p_submission_id uuid
) returns public.contest_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_user_created timestamptz;
  v_vote public.contest_votes;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select * into v_contest from public.contests where id = v_sub.contest_id;

  if v_contest.status not in ('submission_open', 'submission_closed', 'community_voting')
     or v_contest.voting_start is null or v_contest.voting_end is null
     or now() < v_contest.voting_start or now() >= v_contest.voting_end then
    raise exception 'Voting is not open' using hint = 'voting_closed';
  end if;

  if v_sub.status not in ('eligible', 'shortlisted') or not exists (
    select 1 from public.books b where b.id = v_sub.book_id and b.published and b.deleted_at is null
  ) then
    raise exception 'Entry cannot receive votes' using hint = 'entry_not_votable';
  end if;

  if v_sub.author_id = p_user_id then
    raise exception 'Authors cannot vote for their own entry' using hint = 'own_entry';
  end if;

  select created_at into v_user_created from auth.users where id = p_user_id;
  if v_user_created is null then
    raise exception 'User % not found', p_user_id using hint = 'user_not_found';
  end if;
  if v_user_created > now() - make_interval(days => (v_contest.vote_rules ->> 'min_account_age_days')::integer) then
    raise exception 'Account is too new to vote' using hint = 'account_too_new';
  end if;

  if (v_contest.vote_rules ->> 'require_completed_chapter')::boolean and not exists (
    select 1 from public.reading_history rh
    join public.chapters ch on ch.id = rh.chapter_id
    where rh.user_id = p_user_id
      and ch.book_id = v_sub.book_id
      and ch.published and ch.removed_at is null
  ) then
    raise exception 'Read at least one chapter before voting' using hint = 'no_completed_chapter';
  end if;

  insert into public.contest_votes (contest_id, submission_id, user_id)
  values (v_sub.contest_id, p_submission_id, p_user_id)
  on conflict (submission_id, user_id) do nothing
  returning * into v_vote;

  if v_vote.id is null then
    raise exception 'Already voted for this entry' using hint = 'already_voted';
  end if;
  return v_vote;
end;
$$;

create or replace function public.retract_contest_vote(
  p_user_id uuid,
  p_submission_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_deleted integer;
begin
  select c.* into v_contest
  from public.contest_submissions s join public.contests c on c.id = s.contest_id
  where s.id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;

  if v_contest.status not in ('submission_open', 'submission_closed', 'community_voting')
     or v_contest.voting_start is null or v_contest.voting_end is null
     or now() < v_contest.voting_start or now() >= v_contest.voting_end then
    raise exception 'Voting is not open' using hint = 'voting_closed';
  end if;

  delete from public.contest_votes where submission_id = p_submission_id and user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.contest_quest_available(p_template public.task_templates, p_contest public.contests)
returns boolean
language sql
stable
as $$
  select p_template.active and p_template.quest_pool = 'contest'
     and p_contest.status in ('submission_open', 'community_voting')
     and (p_template.contest_action <> 'vote_entry' or (
           p_contest.status in ('submission_open', 'community_voting') and p_contest.voting_start is not null and p_contest.voting_end is not null
           and now() >= p_contest.voting_start and now() < p_contest.voting_end));
$$;

create or replace function public.detect_contest_fraud_signals(
  p_contest_id uuid,
  p_rapid_votes integer,
  p_rapid_minutes integer,
  p_new_account_grace_days integer,
  p_new_account_votes integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_min_age integer;
  v_created integer := 0;
  v_rows integer;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.status not in ('submission_open', 'submission_closed', 'community_voting', 'judging') then
    return 0;
  end if;
  -- Hai lần quét cùng lúc (admin + cron) không gắn trùng.
  perform pg_advisory_xact_lock(hashtext('contest_fraud:' || p_contest_id::text));
  v_min_age := coalesce((v_contest.vote_rules ->> 'min_account_age_days')::integer, 7);

  -- rapid_voting: cửa sổ bắt đầu ở mỗi phiếu, lấy cửa sổ đông nhất của từng người.
  with windows as (
    select v1.user_id, v1.created_at as window_start,
           (select count(*) from public.contest_votes v2
             where v2.contest_id = p_contest_id and v2.user_id = v1.user_id
               and v2.created_at >= v1.created_at
               and v2.created_at < v1.created_at + make_interval(mins => p_rapid_minutes))::integer as n
    from public.contest_votes v1
    where v1.contest_id = p_contest_id
  ),
  best as (
    select distinct on (w.user_id) w.user_id, w.window_start, w.n
    from windows w
    order by w.user_id, w.n desc, w.window_start
  )
  insert into public.contest_fraud_signals (contest_id, user_id, signal_code, severity, evidence)
  select p_contest_id, b.user_id, 'rapid_voting',
         case when b.n >= 2 * p_rapid_votes then 'high' else 'medium' end,
         jsonb_build_object('votes_in_window', b.n, 'window_minutes', p_rapid_minutes, 'window_start', b.window_start)
  from best b
  where b.n >= p_rapid_votes
    and not exists (
      select 1 from public.contest_fraud_signals f
      where f.contest_id = p_contest_id and f.signal_code = 'rapid_voting'
        and f.user_id = b.user_id and f.submission_id is null
    );
  get diagnostics v_rows = row_count;
  v_created := v_created + v_rows;

  insert into public.contest_fraud_signals (contest_id, user_id, signal_code, severity, evidence)
  select p_contest_id, s.user_id, 'new_account_mass_voting', 'medium',
         jsonb_build_object(
           'account_created_at', u.created_at,
           'first_vote_at', s.first_vote,
           'account_age_days_at_first_vote', round((extract(epoch from (s.first_vote - u.created_at)) / 86400.0)::numeric, 1),
           'votes', s.votes)
  from (
    select v.user_id, min(v.created_at) as first_vote, count(*)::integer as votes
    from public.contest_votes v
    where v.contest_id = p_contest_id
    group by v.user_id
  ) s
  join auth.users u on u.id = s.user_id
  where s.votes >= p_new_account_votes
    and s.first_vote < u.created_at + make_interval(days => v_min_age + p_new_account_grace_days)
    and not exists (
      select 1 from public.contest_fraud_signals f
      where f.contest_id = p_contest_id and f.signal_code = 'new_account_mass_voting'
        and f.user_id = s.user_id and f.submission_id is null
    );
  get diagnostics v_rows = row_count;
  v_created := v_created + v_rows;

  return v_created;
end;
$$;

create or replace function public.snapshot_contest_ranks(p_contest_id uuid, p_day date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.contest_status;
  v_filtered boolean;
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  v_total integer := 0;
  v_page integer;
  v_rank integer;
  v_at timestamptz;
  v_id uuid;
  r record;
begin
  select c.status, coalesce(c.scoring_config ->> 'popular_formula_id', 'popular-v2') = 'popular-v2'
    into v_status, v_filtered
    from public.contests c where c.id = p_contest_id;
  if v_status is null then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;

  -- Bảng phiếu bình chọn: chỉ biến động trong khung bình chọn. Cùng nguồn với
  -- BXH công khai: phiếu đã lọc (popular-v2) hoặc phiếu thô (popular-v1).
  if v_status in ('submission_open', 'submission_closed', 'community_voting') and exists (
    select 1 from public.contests c where c.id = p_contest_id
      and c.voting_start is not null and now() >= c.voting_start
  ) and not exists (
    select 1 from public.contest_rank_snapshots s
     where s.contest_id = p_contest_id and s.kind = 'popular' and s.snapshot_day = v_day
  ) then
    v_rank := null; v_at := null; v_id := null;
    loop
      v_page := 0;
      for r in
        select * from public.get_contest_score_ranking(p_contest_id, 'popular', 100, v_rank, v_at, v_id) where v_filtered
        union all
        select * from public.get_contest_ranking(p_contest_id, 100, v_rank, v_at, v_id) where not v_filtered
      loop
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

COMMIT;
