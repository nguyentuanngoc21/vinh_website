-- Migration: tổng hợp số liệu chấm chung cuộc + lượt tính có snapshot
-- (Contest Engine, Slice 2.6a). Phụ thuộc (chạy trước):
--   migrations/20260926_add_contest_snapshots.sql      (bản chụp — mẫu số Reading Depth)
--   migrations/20260926_add_contest_scores.sql         (contest_fraud_signals)
--   migrations/20260926_add_scoring_tracking.sql       (reading_sessions.words_reached)
--   migrations/20260926_add_contest_judging.sql        (khung chấm, config version, phiếu chấm)
--
-- Pipeline (docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XXI.3, XXI.12):
--   SQL get_contest_scoring_metrics()  RAW EVENTS → VALIDATION → số liệu thô / bài
--   TS  src/lib/contests/final-scoring/engine.ts   điều chỉnh → chuẩn hoá → điểm → xếp hạng → đề xuất giải
--   SQL save_contest_score_run()       lưu lượt tính + snapshot mọi tầng trong 1 giao dịch
--
-- Định nghĩa (chỉ sự kiện trong [official_scoring_start, official_scoring_end)):
--   - Cohort: bài eligible / shortlisted, sách còn hiển thị. Bài bị loại / rút / sách
--     bị gỡ không vào cohort (không ảnh hưởng mức "cao nhất").
--   - Phiên đọc: bắt đầu trong khung, không phải tác giả, active_seconds > 0, người đọc
--     không bị tín hiệu gian lận ĐÃ XÁC NHẬN (toàn cuộc thi hoặc đúng bài).
--   - Chỉ chương có trong BẢN CHỤP lúc đóng nhận bài (số chữ cố định → tính lại ra
--     cùng kết quả dù chương bị sửa).
--   - Valid reader: tổng active_seconds trên 1 chương ≥ max(tối thiểu, tỷ lệ × thời
--     gian đọc ước tính) — ngưỡng trong config version.
--   - Depth 1 người: Σ chương min(words_reached xa nhất, active_seconds ÷ 60 × trần
--     tốc độ, số chữ chương) ÷ tổng chữ bản chụp, tối đa 1.
--   - Returning: ≥ 2 lượt ghé (phiên cách phiên trước ≥ min_gap_minutes mở lượt mới;
--     lượt tính khi tổng active ≥ min_active_seconds).
--   - Engaged: valid reader có ≥ 1 hành động (theo engagement_actions) trong khung;
--     theo dõi tác giả chỉ tính khi là valid reader của CHÍNH bài.
--   - Valid vote: phiếu trong khung của valid reader bài đó.
--   - Judge: tổng điểm phiếu ĐÃ CHỐT của giám khảo ĐANG GÁN.
-- Lượt tính trên dữ liệu thật chỉ dùng version cấu hình đang áp dụng (J3 mục 15 —
-- không "thử công thức để chọn người thắng"). 'final' chỉ sau khi hết khung chấm.
--
-- Idempotent: if not exists, create or replace.
-- Test: docs/supabase/tests/20260926_final_scoring.test.sql.

create or replace function public.get_contest_scoring_metrics(p_contest_id uuid)
returns table (
  submission_id uuid,
  submitted_at timestamptz,
  has_snapshot boolean,
  valid_readers integer,
  reader_depths double precision[],
  returning_readers integer,
  engaged_readers integer,
  valid_votes integer,
  judge_totals numeric[],
  active_judges integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_contest public.contests;
  v_cfg jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_ratio numeric;
  v_min_seconds numeric;
  v_wpm numeric;
  v_max_wpm numeric;
  v_gap interval;
  v_min_active numeric;
  v_actions text[];
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.official_scoring_start is null then
    raise exception 'Official scoring window is not set' using hint = 'scoring_window_missing';
  end if;
  select config into v_cfg from public.contest_scoring_configs
  where contest_id = p_contest_id and version = v_contest.scoring_config_version;
  if v_cfg is null then
    raise exception 'Scoring config is missing' using hint = 'scoring_config_missing';
  end if;

  v_start := v_contest.official_scoring_start;
  v_end := v_contest.official_scoring_end;
  v_ratio := (v_cfg #>> '{valid_reader,meaningful_read_ratio}')::numeric;
  v_min_seconds := (v_cfg #>> '{valid_reader,meaningful_read_min_seconds}')::numeric;
  v_wpm := (v_cfg #>> '{valid_reader,reading_words_per_minute}')::numeric;
  v_max_wpm := (v_cfg #>> '{reading_depth,max_words_per_minute}')::numeric;
  v_gap := make_interval(mins => (v_cfg #>> '{return_visit,min_gap_minutes}')::integer);
  v_min_active := (v_cfg #>> '{return_visit,min_active_seconds}')::numeric;
  v_actions := array(select jsonb_array_elements_text(v_cfg -> 'engagement_actions'));

  return query
  with entries as (
    select s.id as sub_id, s.book_id, s.author_id, s.submitted_at as sub_at,
           snap.id as snap_id, snap.total_words
    from public.contest_submissions s
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    left join public.contest_submission_snapshots snap on snap.submission_id = s.id and snap.reason = 'submission_closed'
    where s.contest_id = p_contest_id and s.status in ('eligible', 'shortlisted')
  ),
  snap_ch as (
    select e.sub_id, sc.chapter_id, sc.word_count
    from entries e
    join public.contest_submission_snapshot_chapters sc on sc.snapshot_id = e.snap_id
    where sc.chapter_id is not null
  ),
  fraud as (
    select f.user_id as f_user, f.submission_id as f_sub
    from public.contest_fraud_signals f
    where f.contest_id = p_contest_id and f.status = 'confirmed' and f.user_id is not null
  ),
  sess as (
    select e.sub_id, rs.user_id as uid, rs.chapter_id as ch_id, rs.active_seconds as act,
           rs.start_time as st, rs.end_time as en, coalesce(rs.words_reached, 0) as reached, rs.id as sid
    from entries e
    join public.reading_sessions rs on rs.book_id = e.book_id
    where rs.start_time >= v_start and rs.start_time < v_end
      and rs.user_id <> e.author_id
      and rs.active_seconds > 0
      and not exists (select 1 from fraud f where f.f_user = rs.user_id and (f.f_sub is null or f.f_sub = e.sub_id))
  ),
  per_chapter as (
    select s.sub_id, s.uid, s.ch_id, sum(s.act) as act, max(s.reached) as reached, sc.word_count as words
    from sess s
    join snap_ch sc on sc.sub_id = s.sub_id and sc.chapter_id = s.ch_id
    group by s.sub_id, s.uid, s.ch_id, sc.word_count
  ),
  valid as (
    select distinct pc.sub_id, pc.uid
    from per_chapter pc
    where pc.act >= greatest(v_min_seconds, ceil(v_ratio * pc.words * 60.0 / v_wpm))
  ),
  depth as (
    select v.sub_id, v.uid,
           least(1.0, coalesce(
             sum(least(pc.reached::numeric, pc.act * v_max_wpm / 60.0, pc.words::numeric)) / nullif(max(e.total_words), 0),
             0)) as d
    from valid v
    join per_chapter pc on pc.sub_id = v.sub_id and pc.uid = v.uid
    join entries e on e.sub_id = v.sub_id
    group by v.sub_id, v.uid
  ),
  ordered as (
    select s.sub_id, s.uid, s.act, s.st, s.sid,
           case when lag(s.en) over w is null or s.st - lag(s.en) over w >= v_gap then 1 else 0 end as new_visit
    from sess s
    join valid v on v.sub_id = s.sub_id and v.uid = s.uid
    window w as (partition by s.sub_id, s.uid order by s.st, s.sid)
  ),
  visits as (
    select o.sub_id, o.uid, o.act,
           sum(o.new_visit) over (partition by o.sub_id, o.uid order by o.st, o.sid rows between unbounded preceding and current row) as visit_no
    from ordered o
  ),
  returners as (
    select x.sub_id, x.uid
    from (select vi.sub_id, vi.uid, vi.visit_no, sum(vi.act) as act from visits vi group by vi.sub_id, vi.uid, vi.visit_no) x
    where x.act >= v_min_active
    group by x.sub_id, x.uid
    having count(*) >= 2
  ),
  book_chapters as (
    select e.sub_id, ch.id as ch_id from entries e join public.chapters ch on ch.book_id = e.book_id
  ),
  actions as (
    select bc.sub_id, ac.user_id as uid
    from public.anchored_comments ac join book_chapters bc on bc.ch_id = ac.chapter_id
    where 'comment' = any(v_actions) and ac.created_at >= v_start and ac.created_at < v_end
    union
    select bc.sub_id, cv.user_id
    from public.chapter_votes cv join book_chapters bc on bc.ch_id = cv.chapter_id
    where 'chapter_vote' = any(v_actions) and cv.created_at >= v_start and cv.created_at < v_end
    union
    select bc.sub_id, tv.user_id
    from public.character_trope_votes tv join book_chapters bc on bc.ch_id = tv.chapter_id
    where 'character_vote' = any(v_actions) and tv.created_at >= v_start and tv.created_at < v_end
    union
    select e.sub_id, rl.user_id
    from public.reading_list_items li
    join public.reading_lists rl on rl.id = li.list_id
    join entries e on e.book_id = li.book_id
    where 'reading_list' = any(v_actions) and li.added_at >= v_start and li.added_at < v_end
    union
    select e.sub_id, fo.follower_id
    from public.author_follows fo join entries e on e.author_id = fo.author_id
    where 'author_follow' = any(v_actions) and fo.created_at >= v_start and fo.created_at < v_end
  ),
  engaged as (
    select distinct a.sub_id, a.uid from actions a join valid v on v.sub_id = a.sub_id and v.uid = a.uid
  ),
  votes as (
    select cv.submission_id as sub_id, count(*)::integer as n
    from public.contest_votes cv
    join valid v on v.sub_id = cv.submission_id and v.uid = cv.user_id
    where cv.contest_id = p_contest_id and cv.created_at >= v_start and cv.created_at < v_end
    group by cv.submission_id
  ),
  judges as (
    select j.user_id as jid from public.contest_judges j where j.contest_id = p_contest_id and j.removed_at is null
  ),
  judge_cards as (
    select c.submission_id as sub_id, array_agg(c.total order by c.judge_id) as totals
    from public.contest_judge_scorecards c
    join judges j on j.jid = c.judge_id
    where c.contest_id = p_contest_id and c.status = 'finalized'
    group by c.submission_id
  )
  select e.sub_id,
         e.sub_at,
         e.snap_id is not null,
         (select count(*) from valid v where v.sub_id = e.sub_id)::integer,
         coalesce((select array_agg(d.d::double precision order by d.uid) from depth d where d.sub_id = e.sub_id), '{}'::double precision[]),
         (select count(*) from returners r where r.sub_id = e.sub_id)::integer,
         (select count(*) from engaged g where g.sub_id = e.sub_id)::integer,
         coalesce((select vo.n from votes vo where vo.sub_id = e.sub_id), 0),
         coalesce(jc.totals, '{}'::numeric[]),
         (select count(*) from judges)::integer
  from entries e
  left join judge_cards jc on jc.sub_id = e.sub_id
  order by e.sub_at, e.sub_id;
end;
$$;

revoke execute on function public.get_contest_scoring_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_contest_scoring_metrics(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Lượt tính + snapshot (mọi tầng — J3 mục 16)
-- ---------------------------------------------------------------------
create table if not exists public.contest_score_runs (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  config_version integer not null,
  kind text not null check (kind in ('preview', 'final')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  -- sha256 của (config + số liệu thô): cùng digest + cùng version → cùng kết quả.
  input_digest text not null,
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  computed_by uuid not null references auth.users (id),
  computed_at timestamptz not null default now(),
  -- Slice 2.6b: công bố / thay thế.
  published_at timestamptz,
  published_by uuid references auth.users (id),
  superseded_at timestamptz,
  publish_reason text,
  constraint contest_score_runs_config_fk foreign key (contest_id, config_version)
    references public.contest_scoring_configs (contest_id, version)
);

create index if not exists contest_score_runs_contest_idx on public.contest_score_runs (contest_id, computed_at desc);

create table if not exists public.contest_score_snapshots (
  run_id uuid not null references public.contest_score_runs (id) on delete cascade,
  submission_id uuid not null,
  rank integer not null check (rank > 0),
  tied boolean not null default false,
  submitted_at timestamptz not null,
  -- Reader
  valid_readers integer not null,
  reader_transformed numeric not null,
  reader_score numeric not null,
  -- Reading quality
  reader_depth_count integer not null,
  aggregated_depth numeric not null,
  adjusted_depth numeric not null,
  depth_score numeric not null,
  returning_readers integer not null,
  raw_return_rate numeric not null,
  adjusted_return_rate numeric not null,
  return_score numeric not null,
  reading_quality_score numeric not null,
  -- Engagement
  engaged_readers integer not null,
  raw_engagement_rate numeric not null,
  adjusted_engagement_rate numeric not null,
  engagement_score numeric not null,
  -- Vote
  valid_votes integer not null,
  raw_vote_rate numeric not null,
  adjusted_vote_rate numeric not null,
  vote_score numeric not null,
  -- Judge + tổng
  judge_count integer not null,
  judge_score numeric,
  system_score numeric not null,
  final_score numeric not null,
  -- Đề xuất giải [{code, name, kind: main | special}] — admin xác nhận ở Slice 2.6b.
  awards jsonb not null default '[]'::jsonb check (jsonb_typeof(awards) = 'array'),
  primary key (run_id, submission_id)
);

alter table public.contest_score_runs enable row level security;
alter table public.contest_score_snapshots enable row level security;
revoke all on public.contest_score_runs, public.contest_score_snapshots from anon, authenticated;

-- Lượt tính / snapshot bất biến (chỉ cột công bố của run được đổi — Slice 2.6b).
create or replace function public.contest_score_snapshots_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Score snapshots are immutable' using hint = 'score_run_immutable';
end;
$$;

drop trigger if exists contest_score_snapshots_immutable on public.contest_score_snapshots;
create trigger contest_score_snapshots_immutable
  before update or delete on public.contest_score_snapshots
  for each row execute function public.contest_score_snapshots_immutable();

-- p_run: { kind, config_version, input_digest, flags: [...], rows: [ {...cột snapshot} ] }
create or replace function public.save_contest_score_run(
  p_contest_id uuid,
  p_admin_id uuid,
  p_run jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_kind text := p_run ->> 'kind';
  v_version integer := (p_run ->> 'config_version')::integer;
  v_run uuid;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.official_scoring_start is null then
    raise exception 'Official scoring window is not set' using hint = 'scoring_window_missing';
  end if;
  if v_kind is null or v_kind not in ('preview', 'final') then
    raise exception 'Invalid run kind' using hint = 'invalid_input';
  end if;
  -- J3 mục 15: dữ liệu thật chỉ tính bằng version đang áp dụng.
  if v_version is distinct from v_contest.scoring_config_version then
    raise exception 'Runs must use the active scoring config version' using hint = 'score_run_stale';
  end if;
  if now() < v_contest.official_scoring_start then
    raise exception 'Scoring window has not started' using hint = 'scoring_not_started';
  end if;
  if v_kind = 'final' and now() < v_contest.official_scoring_end then
    raise exception 'Final runs need the scoring window to be over' using hint = 'scoring_not_finished';
  end if;

  insert into public.contest_score_runs (contest_id, config_version, kind, window_start, window_end, input_digest, flags, computed_by)
  values (p_contest_id, v_version, v_kind, v_contest.official_scoring_start, v_contest.official_scoring_end,
          p_run ->> 'input_digest', coalesce(p_run -> 'flags', '[]'::jsonb), p_admin_id)
  returning id into v_run;

  insert into public.contest_score_snapshots
  select v_run, r.*
  from jsonb_to_recordset(coalesce(p_run -> 'rows', '[]'::jsonb)) as r (
    submission_id uuid, rank integer, tied boolean, submitted_at timestamptz,
    valid_readers integer, reader_transformed numeric, reader_score numeric,
    reader_depth_count integer, aggregated_depth numeric, adjusted_depth numeric, depth_score numeric,
    returning_readers integer, raw_return_rate numeric, adjusted_return_rate numeric, return_score numeric,
    reading_quality_score numeric,
    engaged_readers integer, raw_engagement_rate numeric, adjusted_engagement_rate numeric, engagement_score numeric,
    valid_votes integer, raw_vote_rate numeric, adjusted_vote_rate numeric, vote_score numeric,
    judge_count integer, judge_score numeric, system_score numeric, final_score numeric,
    awards jsonb
  );
  -- Mọi dòng phải thuộc cuộc thi này.
  if exists (
    select 1 from public.contest_score_snapshots ss
    where ss.run_id = v_run and not exists (
      select 1 from public.contest_submissions s where s.id = ss.submission_id and s.contest_id = p_contest_id)
  ) then
    raise exception 'Snapshot rows must belong to the contest' using hint = 'invalid_input';
  end if;
  return v_run;
end;
$$;

revoke execute on function public.save_contest_score_run(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_contest_score_run(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: 2 bảng, 2 hàm.
--   - src/lib/contests/final-scoring/engine.ts, final-scoring-service.ts,
--     tab "Chấm điểm" → "Kết quả chấm".
-- ---------------------------------------------------------------------
