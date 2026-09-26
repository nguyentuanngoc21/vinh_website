-- Migration: tín hiệu hợp lệ + bảng điểm cache (Contest Engine Phase 2, Slice 2.2).
-- Phụ thuộc migrations/20260926_add_contest_engine_core.sql và
-- migrations/20260926_add_reading_session_tracking.sql (chạy trước).
--
-- Định nghĩa (docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XX.4, P2–P3–P8–P10):
--   - Meaningful read (P2): tổng active_seconds (server đo — Slice 2.1) của
--     một người trên một chương đạt ≥ max(tối thiểu, tỷ lệ × thời gian đọc
--     ước tính). Thời gian ước tính = số chữ ÷ chữ/phút. Mặc định 40%, 30
--     giây, 250 chữ/phút — khoá trong scoring_config (src/lib/contests/config.ts).
--     Chỉ tính phiên bắt đầu từ submission_start, chương đang hiển thị, trừ
--     chính tác giả.
--   - Độc giả hợp lệ của bài = người có ≥ 1 meaningful read trên sách đó.
--     reached_at = lúc tổng thời gian đạt ngưỡng (theo phiên) — dùng cho
--     "độc giả mới trong 7 ngày" (trending, P4).
--   - Phiếu đã lọc (P3) = phiếu mà người bầu là độc giả hợp lệ của bài.
--   - Gian lận (P10): chỉ tín hiệu admin ĐÃ XÁC NHẬN mới loại. Tín hiệu có
--     user_id và không có submission_id → loại người đó khỏi mọi bài của
--     cuộc thi; có cả hai → chỉ loại ở bài đó. Tín hiệu chỉ có submission_id
--     không tự loại gì (admin tự quyết đánh loại bài). Bảng tạo ở đây để
--     công thức điểm dùng ngay; phát hiện tự động + màn admin là Slice 2.4.
--
-- Tần suất (P8, bản cập nhật): refresh_contest_scores() tính lại tối đa mỗi
-- 15 phút khi có người xem (khoá hàng skip locked — người xem đến cùng lúc
-- không chờ nhau, không tính trùng), cron 0h giờ VN ép tính lại. BXH Độc giả
-- yêu thích trong lúc bình chọn KHÔNG đọc bảng này (vẫn đếm phiếu trực tiếp —
-- get_contest_ranking). Khi công bố kết quả: tính lần cuối rồi CHỐT
-- (frozen_at) — không bao giờ tính lại nữa.
--
-- popular-v2 (phiếu đã lọc) là mặc định cho cuộc thi mới. Cuộc thi chưa mở
-- bình chọn được chuyển sang popular-v2 ở cuối file (scoring_config chỉ khoá
-- từ lúc mở bình chọn); cuộc thi đã mở bình chọn giữ nguyên công thức đã khoá.
--
-- Idempotent: if not exists, create or replace, update có điều kiện.
-- Test: docs/supabase/tests/20260926_contest_scores.test.sql.

-- ---------------------------------------------------------------------
-- 1. Tín hiệu gian lận (P10)
-- ---------------------------------------------------------------------
create table if not exists public.contest_fraud_signals (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  submission_id uuid,
  signal_code text not null check (signal_code ~ '^[a-z0-9_]+$'),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  -- 'open' = chờ admin; chỉ 'confirmed' mới loại phiếu / độc giả khỏi điểm.
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint contest_fraud_signals_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete cascade,
  constraint contest_fraud_signals_target check (user_id is not null or submission_id is not null),
  constraint contest_fraud_signals_reviewed check ((status = 'open') = (reviewed_at is null))
);

create index if not exists contest_fraud_signals_contest_status_idx
  on public.contest_fraud_signals (contest_id, status, created_at desc);
create index if not exists contest_fraud_signals_confirmed_user_idx
  on public.contest_fraud_signals (contest_id, user_id) where status = 'confirmed';

-- ---------------------------------------------------------------------
-- 2. Bảng điểm cache + trạng thái tính
-- ---------------------------------------------------------------------
create table if not exists public.contest_submission_scores (
  submission_id uuid primary key,
  contest_id uuid not null,
  raw_votes integer not null default 0 check (raw_votes >= 0),
  filtered_votes integer not null default 0 check (filtered_votes >= 0),
  valid_readers integer not null default 0 check (valid_readers >= 0),
  readers_7d integer not null default 0 check (readers_7d >= 0),
  readers_prev_7d integer not null default 0 check (readers_prev_7d >= 0),
  computed_at timestamptz not null default now(),
  constraint contest_submission_scores_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete cascade
);

create index if not exists contest_submission_scores_contest_idx on public.contest_submission_scores (contest_id);

create table if not exists public.contest_score_state (
  contest_id uuid primary key references public.contests (id) on delete cascade,
  refreshed_at timestamptz,
  -- Chốt lúc công bố kết quả — sau mốc này bảng điểm không bao giờ đổi.
  frozen_at timestamptz,
  -- Ngưỡng đã dùng ở lần tính gần nhất (bằng chứng khi xem lại kết quả).
  params jsonb not null default '{}'::jsonb
);

-- Chỉ service-role (route/cron) đọc/ghi — không lộ số phiếu đang ẩn (Q3).
alter table public.contest_fraud_signals enable row level security;
alter table public.contest_submission_scores enable row level security;
alter table public.contest_score_state enable row level security;
revoke all on public.contest_fraud_signals, public.contest_submission_scores, public.contest_score_state
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Tính điểm
-- ---------------------------------------------------------------------
-- p_force: bỏ qua mốc 15 phút (cron 0h, chốt kết quả). p_freeze: chốt sau lần
-- tính này — chỉ khi đã công bố kết quả. Trả trạng thái hiện tại; nếu một
-- lần tính khác đang chạy thì trả ngay trạng thái cũ (không chờ).
create or replace function public.refresh_contest_scores(
  p_contest_id uuid,
  p_force boolean default false,
  p_freeze boolean default false
) returns public.contest_score_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_state public.contest_score_state;
  -- Mặc định giống DEFAULT_SCORING_CONFIG (config.ts): cuộc thi tạo trước
  -- Slice 2.2 không có các khoá này trong scoring_config.
  v_ratio numeric;
  v_min_seconds integer;
  v_wpm integer;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if p_freeze and not (v_contest.status in ('results', 'archived') and v_contest.results_published_at is not null) then
    raise exception 'Scores can only be frozen after results are published' using hint = 'scores_not_final';
  end if;

  insert into public.contest_score_state (contest_id) values (p_contest_id) on conflict (contest_id) do nothing;
  select * into v_state from public.contest_score_state where contest_id = p_contest_id for update skip locked;
  if v_state.contest_id is null then
    -- Lần tính khác đang giữ khoá.
    select * into v_state from public.contest_score_state where contest_id = p_contest_id;
    return v_state;
  end if;
  if v_state.frozen_at is not null then
    return v_state;
  end if;
  if not p_force and v_state.refreshed_at is not null and v_state.refreshed_at > now() - interval '15 minutes' then
    return v_state;
  end if;

  v_ratio := coalesce((v_contest.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4);
  v_min_seconds := coalesce((v_contest.scoring_config ->> 'meaningful_read_min_seconds')::integer, 30);
  v_wpm := coalesce((v_contest.scoring_config ->> 'reading_words_per_minute')::integer, 250);

  with entries as (
    select s.id, s.book_id, s.author_id
    from public.contest_submissions s
    where s.contest_id = p_contest_id
  ),
  sessions as (
    select e.id as submission_id, rs.user_id, rs.chapter_id, rs.active_seconds, rs.start_time, rs.end_time, rs.id as session_id
    from entries e
    join public.reading_sessions rs on rs.book_id = e.book_id
    where rs.start_time >= v_contest.submission_start
      and rs.user_id <> e.author_id
      and rs.active_seconds > 0
  ),
  -- Chỉ đếm chữ cho chương thật sự có người đọc — không quét cả cuộc thi.
  chapter_need as (
    select ch.id as chapter_id,
           greatest(v_min_seconds, ceil(v_ratio * public.contest_word_count(ch.content) * 60.0 / v_wpm))::integer as need
    from public.chapters ch
    where ch.id in (select distinct chapter_id from sessions)
      and ch.published and ch.removed_at is null
  ),
  running as (
    select s.submission_id, s.user_id, s.end_time, n.need,
           sum(s.active_seconds) over (
             partition by s.submission_id, s.user_id, s.chapter_id
             order by s.start_time, s.session_id
             rows between unbounded preceding and current row
           ) as acc
    from sessions s
    join chapter_need n on n.chapter_id = s.chapter_id
  ),
  readers as (
    select r.submission_id, r.user_id, min(r.end_time) as reached_at
    from running r
    where r.acc >= r.need
      and not exists (
        select 1 from public.contest_fraud_signals f
        where f.contest_id = p_contest_id and f.status = 'confirmed' and f.user_id = r.user_id
          and (f.submission_id is null or f.submission_id = r.submission_id)
      )
    group by r.submission_id, r.user_id
  ),
  vote_counts as (
    select v.submission_id,
           count(*)::integer as raw,
           count(*) filter (where exists (
             select 1 from readers r where r.submission_id = v.submission_id and r.user_id = v.user_id
           ))::integer as filtered
    from public.contest_votes v
    where v.contest_id = p_contest_id
    group by v.submission_id
  ),
  reader_counts as (
    select r.submission_id,
           count(*)::integer as total,
           count(*) filter (where r.reached_at >= now() - interval '7 days')::integer as d7,
           count(*) filter (where r.reached_at >= now() - interval '14 days' and r.reached_at < now() - interval '7 days')::integer as prev
    from readers r
    group by r.submission_id
  )
  insert into public.contest_submission_scores
    (submission_id, contest_id, raw_votes, filtered_votes, valid_readers, readers_7d, readers_prev_7d, computed_at)
  select e.id, p_contest_id, coalesce(vc.raw, 0), coalesce(vc.filtered, 0),
         coalesce(rc.total, 0), coalesce(rc.d7, 0), coalesce(rc.prev, 0), now()
  from entries e
  left join vote_counts vc on vc.submission_id = e.id
  left join reader_counts rc on rc.submission_id = e.id
  on conflict (submission_id) do update
    set raw_votes = excluded.raw_votes,
        filtered_votes = excluded.filtered_votes,
        valid_readers = excluded.valid_readers,
        readers_7d = excluded.readers_7d,
        readers_prev_7d = excluded.readers_prev_7d,
        computed_at = excluded.computed_at;

  update public.contest_score_state
     set refreshed_at = now(),
         frozen_at = case when p_freeze then now() else null end,
         params = jsonb_build_object(
           'meaningful_read_ratio', v_ratio,
           'meaningful_read_min_seconds', v_min_seconds,
           'reading_words_per_minute', v_wpm)
   where contest_id = p_contest_id
  returning * into v_state;
  return v_state;
end;
$$;

revoke execute on function public.refresh_contest_scores(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.refresh_contest_scores(uuid, boolean, boolean) to service_role;

-- BXH đọc từ bảng điểm cache — cùng quy tắc với get_contest_ranking (rank()
-- toàn cục, value desc / submitted_at asc / id asc, keyset theo hạng).
--   'popular'  = phiếu đã lọc (popular-v2 — dùng khi đã chốt kết quả)
--   'trending' = độc giả hợp lệ mới trong 7 ngày (P4 — Slice 2.3)
create or replace function public.get_contest_score_ranking(
  p_contest_id uuid,
  p_kind text,
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_kind not in ('popular', 'trending') then
    raise exception 'Unknown ranking kind %', p_kind using hint = 'invalid_sort';
  end if;

  return query
  with entries as (
    select s.id, s.book_id, s.author_id, s.submitted_at,
           coalesce(case p_kind when 'popular' then sc.filtered_votes else sc.readers_7d end, 0) as value
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id and c.status <> 'draft'
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    left join public.contest_submission_scores sc on sc.submission_id = s.id
    where s.contest_id = p_contest_id
      and s.status in ('eligible', 'shortlisted')
  ),
  ranked as (
    select e.id, e.book_id, e.author_id, e.submitted_at, e.value,
           (rank() over (order by e.value desc))::integer as rnk,
           count(*) over (partition by e.value) > 1 as is_tied
    from entries e
  )
  select r.id, r.book_id, r.author_id, r.value, r.submitted_at, r.rnk, r.is_tied
  from ranked r
  where p_after_id is null
     or r.rnk > p_after_rank
     or (r.rnk = p_after_rank and (r.submitted_at, r.id) > (p_after_submitted_at, p_after_id))
  order by r.value desc, r.submitted_at asc, r.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke execute on function public.get_contest_score_ranking(uuid, text, integer, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_contest_score_ranking(uuid, text, integer, integer, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. popular-v2 cho cuộc thi chưa mở bình chọn (P3)
-- ---------------------------------------------------------------------
-- contests_guard_write cho đổi scoring_config tới trước lúc mở bình chọn.
update public.contests
   set scoring_config = scoring_config || '{"popular_formula_id": "popular-v2"}'::jsonb
 where scoring_config ->> 'popular_formula_id' = 'popular-v1'
   and status in ('draft', 'announced', 'submission_open', 'submission_closed')
   and (voting_start is null or voting_start > now());

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối (trừ mục 4 — dữ liệu) ở CUỐI file.
--   - src/lib/supabase/types.ts: 3 bảng mới, Functions refresh_contest_scores,
--     get_contest_score_ranking.
--   - src/lib/contests/config.ts: popular-v2 + 3 ngưỡng meaningful read.
--   - src/lib/contests/scores-service.ts (làm mới lười 15 phút, chốt khi công
--     bố), cron /api/contests/cron/advance (0h VN), admin xem số liệu.
-- ---------------------------------------------------------------------
