-- Migration: khung chấm chính thức, cấu hình chấm có version, giám khảo và phiếu
-- chấm (Contest Engine, Slice 2.5b). Phụ thuộc
-- migrations/20260926_add_contest_engine_core.sql và
-- migrations/20260926_add_contest_snapshots.sql (chạy trước).
--
-- Xem docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XXI (J2, J5, J6, J7, J11):
--   - contests.official_scoring_start / _end: khung chấm chính thức. Bắt đầu
--     sau khi đóng nhận bài; khung bình chọn nằm trong khung chấm (J2). Khoá
--     khi khung chấm đã bắt đầu.
--   - contest_scoring_configs: mỗi lần lưu = 1 version bất biến; từ lúc khung
--     chấm bắt đầu phải kèm lý do (J11). Rubric không đổi được khi đã có
--     phiếu chấm còn hiệu lực. Nội dung jsonb do src/lib/contests/final-scoring/config.ts
--     kiểm (DB chỉ kiểm rubric cần cho phiếu chấm).
--   - contest_judges: tài khoản Vịnh sẵn có, admin gán theo cuộc thi (không
--     thêm role). Gỡ giám khảo → phiếu của người đó không vào điểm.
--   - contest_judge_scorecards + _criterion_scores: điểm theo từng tiêu chí;
--     tổng do DB tính. draft → finalized (giám khảo) → admin mở lại (về draft)
--     hoặc huỷ (invalidated), luôn kèm lý do; mọi thay đổi ghi
--     contest_judge_score_events (trước → sau).
-- Chấm mọi bài eligible / shortlisted (J6), từ lúc đóng nhận bài tới trước khi
-- công bố. Màn chấm đọc BẢN CHỤP, không hiện tác giả (J7) — ở route.
-- Mọi bảng chỉ service-role; ghi phiếu chấm chỉ qua RPC.
--
-- Idempotent: if not exists, create or replace, drop ... if exists.
-- Test: docs/supabase/tests/20260926_contest_judging.test.sql.

-- ---------------------------------------------------------------------
-- 1. Khung chấm chính thức + con trỏ version cấu hình
-- ---------------------------------------------------------------------
alter table public.contests
  add column if not exists official_scoring_start timestamptz,
  add column if not exists official_scoring_end timestamptz,
  add column if not exists scoring_config_version integer;

do $$ begin
  alter table public.contests add constraint contests_official_scoring_window check (
    (official_scoring_start is null) = (official_scoring_end is null)
    and (official_scoring_start is null or official_scoring_start < official_scoring_end)
    and (official_scoring_start is null or official_scoring_start >= submission_end));
exception when duplicate_object then null; end $$;
do $$ begin
  -- J2: khung bình chọn nằm trong khung chấm.
  alter table public.contests add constraint contests_voting_within_scoring check (
    official_scoring_start is null or voting_start is null or voting_end is null
    or (voting_start >= official_scoring_start and voting_end <= official_scoring_end));
exception when duplicate_object then null; end $$;

create or replace function public.contests_guard_scoring_window()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.official_scoring_start is distinct from old.official_scoring_start
      or new.official_scoring_end is distinct from old.official_scoring_end)
     and old.official_scoring_start is not null and now() >= old.official_scoring_start then
    raise exception 'Official scoring window is locked once it has started' using hint = 'scoring_window_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists contests_guard_scoring_window on public.contests;
create trigger contests_guard_scoring_window
  before update on public.contests
  for each row execute function public.contests_guard_scoring_window();

-- ---------------------------------------------------------------------
-- 2. Cấu hình chấm có version
-- ---------------------------------------------------------------------
create table if not exists public.contest_scoring_configs (
  contest_id uuid not null references public.contests (id) on delete cascade,
  version integer not null check (version > 0),
  config jsonb not null check (jsonb_typeof(config) = 'object' and jsonb_typeof(config -> 'rubric') = 'array'),
  reason text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (contest_id, version)
);

-- Version trước đó (null = version đầu). Thêm riêng để chạy lại được trên DB
-- đã có bảng từ bản migration trước (bản cập nhật J3, 27/09/2026 — mục 14).
alter table public.contest_scoring_configs
  add column if not exists previous_version integer;

create or replace function public.contest_scoring_configs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Scoring config versions are immutable' using hint = 'scoring_config_immutable';
end;
$$;

drop trigger if exists contest_scoring_configs_immutable on public.contest_scoring_configs;
create trigger contest_scoring_configs_immutable
  before update or delete on public.contest_scoring_configs
  for each row execute function public.contest_scoring_configs_immutable();

-- ---------------------------------------------------------------------
-- 3. Giám khảo, phiếu chấm, nhật ký
-- ---------------------------------------------------------------------
create table if not exists public.contest_judges (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid not null references auth.users (id),
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id),
  removed_reason text,
  primary key (contest_id, user_id),
  constraint contest_judges_removed_consistent check ((removed_at is null) = (removed_by is null))
);

create table if not exists public.contest_judge_scorecards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  judge_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'invalidated')),
  total numeric(6, 2) not null default 0 check (total >= 0),
  -- Version cấu hình (rubric) lúc lưu gần nhất.
  config_version integer not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid references auth.users (id),
  invalidated_reason text,
  constraint contest_judge_scorecards_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete cascade,
  constraint contest_judge_scorecards_finalized check ((status = 'finalized') = (finalized_at is not null)),
  constraint contest_judge_scorecards_invalidated check ((status = 'invalidated') = (invalidated_at is not null))
);

-- Mỗi giám khảo 1 phiếu còn hiệu lực / bài; phiếu đã huỷ giữ lại làm lịch sử.
create unique index if not exists contest_judge_scorecards_active_key
  on public.contest_judge_scorecards (contest_id, submission_id, judge_id) where status <> 'invalidated';
create index if not exists contest_judge_scorecards_contest_idx
  on public.contest_judge_scorecards (contest_id, submission_id);

create table if not exists public.contest_judge_criterion_scores (
  scorecard_id uuid not null references public.contest_judge_scorecards (id) on delete cascade,
  criterion_code text not null check (criterion_code ~ '^[a-z0-9_]+$'),
  score numeric(6, 2) not null check (score >= 0),
  primary key (scorecard_id, criterion_code)
);

create table if not exists public.contest_judge_score_events (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.contest_judge_scorecards (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  action text not null check (action in ('save_draft', 'finalize', 'reopen', 'invalidate')),
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists contest_judge_score_events_scorecard_idx
  on public.contest_judge_score_events (scorecard_id, created_at);

alter table public.contest_scoring_configs enable row level security;
alter table public.contest_judges enable row level security;
alter table public.contest_judge_scorecards enable row level security;
alter table public.contest_judge_criterion_scores enable row level security;
alter table public.contest_judge_score_events enable row level security;
revoke all on public.contest_scoring_configs, public.contest_judges, public.contest_judge_scorecards,
  public.contest_judge_criterion_scores, public.contest_judge_score_events from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------
-- Lưu version cấu hình mới (nội dung đã được TS kiểm). Trả version mới.
create or replace function public.set_contest_scoring_config(
  p_contest_id uuid,
  p_admin_id uuid,
  p_config jsonb,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_current jsonb;
  v_version integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config -> 'rubric') <> 'array' then
    raise exception 'Invalid scoring config' using hint = 'invalid_input';
  end if;
  -- J11: từ lúc khung chấm bắt đầu, mỗi thay đổi phải có lý do.
  if v_contest.official_scoring_start is not null and now() >= v_contest.official_scoring_start and v_reason is null then
    raise exception 'A reason is required once scoring has started' using hint = 'reason_required';
  end if;

  select config into v_current from public.contest_scoring_configs
  where contest_id = p_contest_id and version = v_contest.scoring_config_version;
  if v_current is not null and (v_current -> 'rubric') is distinct from (p_config -> 'rubric') and exists (
    select 1 from public.contest_judge_scorecards
    where contest_id = p_contest_id and status <> 'invalidated'
  ) then
    raise exception 'Rubric cannot change after scoring has begun' using hint = 'rubric_locked';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.contest_scoring_configs where contest_id = p_contest_id;
  insert into public.contest_scoring_configs (contest_id, version, previous_version, config, reason, created_by)
  values (p_contest_id, v_version, v_contest.scoring_config_version, p_config, v_reason, p_admin_id);
  update public.contests set scoring_config_version = v_version where id = p_contest_id;
  return v_version;
end;
$$;

revoke execute on function public.set_contest_scoring_config(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.set_contest_scoring_config(uuid, uuid, jsonb, text) to service_role;

-- Giám khảo lưu nháp / chốt phiếu. p_scores = {"criterion_code": điểm, ...}.
create or replace function public.save_judge_scorecard(
  p_contest_id uuid,
  p_submission_id uuid,
  p_judge_id uuid,
  p_scores jsonb,
  p_note text,
  p_finalize boolean
) returns public.contest_judge_scorecards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_rubric jsonb;
  v_card public.contest_judge_scorecards;
  v_before jsonb;
  v_key text;
  v_value jsonb;
  v_max numeric;
  v_total numeric := 0;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if not exists (
    select 1 from public.contest_judges where contest_id = p_contest_id and user_id = p_judge_id and removed_at is null
  ) then
    raise exception 'Not a judge of this contest' using hint = 'not_judge';
  end if;
  if v_contest.status not in ('submission_closed', 'community_voting', 'judging') then
    raise exception 'Judging is not open' using hint = 'judging_closed';
  end if;
  if not exists (
    select 1 from public.contest_submissions
    where id = p_submission_id and contest_id = p_contest_id and status in ('eligible', 'shortlisted')
  ) then
    raise exception 'Entry cannot be judged' using hint = 'entry_not_judgeable';
  end if;
  select config -> 'rubric' into v_rubric from public.contest_scoring_configs
  where contest_id = p_contest_id and version = v_contest.scoring_config_version;
  if v_rubric is null then
    raise exception 'Scoring config is missing' using hint = 'scoring_config_missing';
  end if;

  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    raise exception 'Scores must be an object' using hint = 'invalid_scores';
  end if;
  for v_key, v_value in select key, value from jsonb_each(p_scores) loop
    select (r ->> 'max')::numeric into v_max from jsonb_array_elements(v_rubric) r where r ->> 'code' = v_key;
    if v_max is null or jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric < 0 or (v_value #>> '{}')::numeric > v_max then
      raise exception 'Invalid score for %', v_key using hint = 'invalid_scores';
    end if;
    v_total := v_total + round((v_value #>> '{}')::numeric, 2);
  end loop;
  if p_finalize and exists (
    select 1 from jsonb_array_elements(v_rubric) r where not (p_scores ? (r ->> 'code'))
  ) then
    raise exception 'Every criterion needs a score before finalizing' using hint = 'invalid_scores';
  end if;

  select * into v_card from public.contest_judge_scorecards
  where contest_id = p_contest_id and submission_id = p_submission_id and judge_id = p_judge_id and status <> 'invalidated'
  for update;
  if v_card.id is not null and v_card.status = 'finalized' then
    raise exception 'Scorecard is finalized' using hint = 'scorecard_finalized';
  end if;

  if v_card.id is null then
    insert into public.contest_judge_scorecards (contest_id, submission_id, judge_id, config_version)
    values (p_contest_id, p_submission_id, p_judge_id, v_contest.scoring_config_version)
    returning * into v_card;
  else
    select jsonb_build_object('status', v_card.status, 'total', v_card.total, 'note', v_card.note,
             'scores', coalesce((select jsonb_object_agg(criterion_code, score) from public.contest_judge_criterion_scores where scorecard_id = v_card.id), '{}'::jsonb))
      into v_before;
  end if;

  delete from public.contest_judge_criterion_scores where scorecard_id = v_card.id;
  insert into public.contest_judge_criterion_scores (scorecard_id, criterion_code, score)
  select v_card.id, key, round((value #>> '{}')::numeric, 2) from jsonb_each(p_scores);

  update public.contest_judge_scorecards
     set total = v_total,
         status = case when p_finalize then 'finalized' else 'draft' end,
         finalized_at = case when p_finalize then now() else null end,
         config_version = v_contest.scoring_config_version,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where id = v_card.id
  returning * into v_card;

  insert into public.contest_judge_score_events (scorecard_id, contest_id, actor_id, action, before, after)
  values (v_card.id, p_contest_id, p_judge_id, case when p_finalize then 'finalize' else 'save_draft' end, v_before,
          jsonb_build_object('status', v_card.status, 'total', v_card.total, 'note', v_card.note, 'scores', p_scores));
  return v_card;
end;
$$;

revoke execute on function public.save_judge_scorecard(uuid, uuid, uuid, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.save_judge_scorecard(uuid, uuid, uuid, jsonb, text, boolean) to service_role;

-- Admin mở lại (finalized → draft, giám khảo sửa tiếp) hoặc huỷ phiếu. Luôn kèm lý do.
create or replace function public.review_judge_scorecard(
  p_scorecard_id uuid,
  p_admin_id uuid,
  p_action text,          -- 'reopen' | 'invalidate'
  p_reason text
) returns public.contest_judge_scorecards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.contest_judge_scorecards;
  v_before jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if p_action is null or p_action not in ('reopen', 'invalidate') then
    raise exception 'Invalid action %', p_action using hint = 'invalid_input';
  end if;
  if v_reason is null then
    raise exception 'A reason is required' using hint = 'reason_required';
  end if;
  select * into v_card from public.contest_judge_scorecards where id = p_scorecard_id for update;
  if not found then
    raise exception 'Scorecard % not found', p_scorecard_id using hint = 'scorecard_not_found';
  end if;
  if (p_action = 'reopen' and v_card.status <> 'finalized') or (p_action = 'invalidate' and v_card.status = 'invalidated') then
    raise exception 'Scorecard cannot % from %', p_action, v_card.status using hint = 'invalid_status_transition';
  end if;
  v_before := jsonb_build_object('status', v_card.status, 'total', v_card.total);

  update public.contest_judge_scorecards
     set status = case when p_action = 'reopen' then 'draft' else 'invalidated' end,
         finalized_at = null,
         invalidated_at = case when p_action = 'invalidate' then now() else null end,
         invalidated_by = case when p_action = 'invalidate' then p_admin_id else null end,
         invalidated_reason = case when p_action = 'invalidate' then v_reason else null end,
         updated_at = now()
   where id = p_scorecard_id
  returning * into v_card;

  insert into public.contest_judge_score_events (scorecard_id, contest_id, actor_id, action, before, after, reason)
  values (v_card.id, v_card.contest_id, p_admin_id, p_action, v_before,
          jsonb_build_object('status', v_card.status, 'total', v_card.total), v_reason);
  return v_card;
end;
$$;

revoke execute on function public.review_judge_scorecard(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_judge_scorecard(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: cột contests mới, 5 bảng, 3 hàm.
--   - src/lib/contests/final-scoring/config.ts (hình dạng + kiểm cấu hình),
--     src/lib/contests/judging-service.ts, /admin/cuoc-thi/[id] tab "Chấm điểm",
--     /giam-khao (màn chấm), proxy.ts gác /giam-khao.
-- ---------------------------------------------------------------------
