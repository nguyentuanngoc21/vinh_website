-- =======================================================================
-- Baseline 11 — Cuộc thi (Contest Engine)  (11_contests.sql)
-- =======================================================================
-- Phạm vi: contests/submissions/votes/awards, trigger chặn trên
-- books/chapters, RPC, xếp hạng + feed, cờ cần bổ sung, snapshot, chi trả
-- giải, tín hiệu + gian lận, điểm, chấm giám khảo, chấm chung cuộc + công
-- bố, nhiệm vụ sự kiện, Contest Passport, chụp hạng BXH.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     contests, contest_status_events, contest_submissions,
--     contest_submission_events, contest_votes, contest_awards,
--     contest_reminders, contest_submission_snapshots,
--     contest_submission_snapshot_chapters, contest_fraud_signals,
--     contest_submission_scores, contest_score_state,
--     contest_scoring_configs, contest_judges, contest_judge_scorecards,
--     contest_judge_criterion_scores, contest_judge_score_events,
--     contest_score_runs, contest_score_snapshots, contest_passport_reads,
--     contest_passports, contest_rank_snapshots
--   View:
--     contest_award_details
--   Hàm:
--     contest_word_count, contest_status_transition_allowed,
--     contest_submission_transition_allowed, contest_config_missing_key,
--     contests_guard_write, contests_prevent_delete,
--     contest_submissions_guard_write, get_books_contest_stats,
--     book_has_active_contest_entry,
--     book_has_active_exclusive_contest_entry,
--     chapters_block_paid_during_contest,
--     books_block_exclusive_off_during_contest, transition_contest_status,
--     submit_contest_entry, set_contest_submission_status,
--     cast_contest_vote, retract_contest_vote, get_contest_ranking,
--     get_contest_entries, get_contest_summaries, add_contest_review_flag,
--     resolve_contest_review_flag, contest_book_needs_snapshot,
--     take_contest_snapshots_for_book, chapters_snapshot_before_write,
--     books_snapshot_before_write, snapshot_contest_submissions,
--     purge_contest_snapshots, pay_contest_award, refresh_contest_scores,
--     get_contest_score_ranking, get_contest_signal_feed,
--     get_contest_hidden_gem_pools, detect_contest_fraud_signals,
--     review_contest_fraud_signal, get_contest_entry_stats,
--     force_server_created_at, force_server_added_at,
--     contests_guard_scoring_window, contest_scoring_configs_immutable,
--     set_contest_scoring_config, save_judge_scorecard,
--     review_judge_scorecard, get_contest_scoring_metrics,
--     contest_score_snapshots_immutable, save_contest_score_run,
--     contest_score_runs_guard_update, publish_contest_score_run,
--     contest_quest_available, add_event_quest_slot, reset_event_quest_slot,
--     record_contest_activity, contest_passport_state,
--     snapshot_contest_ranks
--   Kiểu (enum):
--     contest_status, contest_submission_status
--   Thêm cột vào bảng của file trước:
--     task_templates.{quest_pool, contest_action},
--     user_quest_pool.{slot_kind, contest_id, reroll_count}
--
-- Gộp từ migration (migrations/archive/):
--   20260926_add_contest_award_payout.sql,
--   20260926_add_contest_engine_core.sql,
--   20260926_add_contest_entry_stats.sql,
--   20260926_add_contest_fraud_detection.sql,
--   20260926_add_contest_judging.sql,
--   20260926_add_contest_ranking_and_feeds.sql,
--   20260926_add_contest_review_flags.sql, 20260926_add_contest_scores.sql,
--   20260926_add_contest_signal_feeds.sql,
--   20260926_add_contest_snapshots.sql, 20260926_add_final_scoring.sql,
--   20260926_add_score_run_publish.sql, 20260926_add_scoring_tracking.sql,
--   20260927_add_contest_passport.sql, 20260927_add_contest_quests.sql,
--   20260928_add_contest_rank_snapshots.sql,
--   20260928_contest_dry_run_fixes.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql, 03_reading.sql, 04_wallet_and_payments.sql,
--   05_quests_and_achievements.sql, 06_social_and_messaging.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- --- Contest Engine — lõi Phase 1 (cuộc thi viết). Contest ─< contest_submissions
-- >─ Book (n–n); books vẫn là nguồn chân lý, không thêm cột nào vào books/
-- chapters. Mọi ghi qua service-role + RPC; client không có quyền ghi bảng
-- contest. Hai trigger mới trên bảng có sẵn: chapters_block_paid_during_contest
-- (D8) và books_block_exclusive_off_during_contest (D11). Thiết kế:
-- docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md. Xem
-- migrations/archive/20260926_add_contest_engine_core.sql. ---

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.contest_status as enum (
    'draft', 'announced', 'submission_open', 'submission_closed',
    'community_voting', 'judging', 'results', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contest_submission_status as enum (
    'submitted', 'eligible', 'ineligible', 'withdrawn', 'disqualified', 'shortlisted'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Hàm thuần (không phụ thuộc bảng contest)
-- ---------------------------------------------------------------------

-- Cùng định nghĩa với countWords() ở src/lib/authoring/split-chapters.ts
-- (/\S+/g). JS coi NBSP và các khoảng trắng Unicode là khoảng trắng, còn
-- [:space:] của Postgres thì không → đổi chúng thành dấu cách trước khi đếm.
create or replace function public.contest_word_count(p text)
returns integer
language sql
immutable
parallel safe
as $$
  select count(*)::integer
  from regexp_matches(
    regexp_replace(coalesce(p, ''), '[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]', ' ', 'g'),
    '\S+', 'g'
  );
$$;

-- Ma trận chuyển trạng thái cuộc thi (mục VI.1): chỉ đi tiến.
create or replace function public.contest_status_transition_allowed(
  p_from public.contest_status, p_to public.contest_status
) returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft'::public.contest_status, 'announced'::public.contest_status),
    ('announced', 'submission_open'),
    ('submission_open', 'submission_closed'),
    ('submission_closed', 'community_voting'),
    ('submission_closed', 'judging'),
    ('submission_closed', 'results'),
    ('community_voting', 'judging'),
    ('community_voting', 'results'),
    ('judging', 'results'),
    ('results', 'archived')
  );
$$;

-- Ma trận chuyển trạng thái bài dự thi (mục IV.4) — phần không phụ thuộc
-- người thực hiện. Ai được làm gì kiểm ở set_contest_submission_status().
create or replace function public.contest_submission_transition_allowed(
  p_from public.contest_submission_status, p_to public.contest_submission_status
) returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('submitted'::public.contest_submission_status, 'eligible'::public.contest_submission_status),
    ('submitted', 'ineligible'),
    ('submitted', 'withdrawn'),
    ('submitted', 'disqualified'),
    ('eligible', 'ineligible'),
    ('eligible', 'withdrawn'),
    ('eligible', 'shortlisted'),
    ('eligible', 'disqualified'),
    ('ineligible', 'eligible'),
    ('ineligible', 'disqualified'),
    ('withdrawn', 'eligible'),      -- nộp lại, chỉ qua submit_contest_entry()
    ('shortlisted', 'disqualified')
  );
$$;

-- Trả tên khoá thiếu/sai kiểu đầu tiên, hoặc null nếu cấu hình đủ.
create or replace function public.contest_config_missing_key(
  p_eligibility jsonb, p_vote jsonb
) returns text
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_eligibility -> 'allow_resubmit_after_withdraw') is distinct from 'boolean'
      then 'eligibility_rules.allow_resubmit_after_withdraw'
    when jsonb_typeof(p_eligibility -> 'require_exclusive') is distinct from 'boolean'
      then 'eligibility_rules.require_exclusive'
    when jsonb_typeof(p_eligibility -> 'allow_multi_contest') is distinct from 'boolean'
      then 'eligibility_rules.allow_multi_contest'
    when coalesce(jsonb_typeof(p_eligibility -> 'max_entries_per_author'), 'missing') not in ('number', 'null')
      then 'eligibility_rules.max_entries_per_author'
    when jsonb_typeof(p_vote -> 'min_account_age_days') is distinct from 'number'
      then 'vote_rules.min_account_age_days'
    when jsonb_typeof(p_vote -> 'require_completed_chapter') is distinct from 'boolean'
      then 'vote_rules.require_completed_chapter'
    else null
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. contests
-- ---------------------------------------------------------------------
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  short_description text not null default '',
  description text not null default '',
  key_visual_url text,
  banner_url text,
  status public.contest_status not null default 'draft',
  is_featured boolean not null default false,

  submission_start timestamptz not null,
  submission_end timestamptz not null,
  voting_start timestamptz,
  voting_end timestamptz,
  judging_start timestamptz,
  judging_end timestamptz,
  result_at timestamptz,
  results_published_at timestamptz,   -- null = kết quả chưa công bố

  rules_content text not null default '',
  rules_version text not null default '1',   -- Q5: khoá cùng thể lệ khi rời draft
  prizes_summary jsonb not null default '[]'::jsonb,
  eligibility_rules jsonb not null default '{}'::jsonb,
  vote_rules jsonb not null default '{}'::jsonb,
  scoring_config jsonb not null default '{}'::jsonb,
  legacy_stats jsonb,                  -- thống kê mùa thi, chụp khi chuyển 'archived' (XIX.2)

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint contests_submission_window check (submission_start < submission_end),
  constraint contests_voting_window check (
    voting_start is null or voting_end is null or voting_start < voting_end),
  constraint contests_voting_after_open check (
    voting_start is null or voting_start >= submission_start),
  constraint contests_judging_window check (
    judging_start is null or judging_end is null or judging_start < judging_end),
  constraint contests_config_objects check (
    jsonb_typeof(eligibility_rules) = 'object' and jsonb_typeof(vote_rules) = 'object'
    and jsonb_typeof(scoring_config) = 'object' and jsonb_typeof(prizes_summary) = 'array')
);

create index if not exists contests_status_idx
  on public.contests (status, submission_end);
create index if not exists contests_featured_idx
  on public.contests (is_featured) where is_featured;

-- Nhật ký chuyển trạng thái (actor null = cron hệ thống).
create table if not exists public.contest_status_events (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  from_status public.contest_status,
  to_status public.contest_status not null,
  actor_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists contest_status_events_contest_idx
  on public.contest_status_events (contest_id, created_at);

-- Chèn: luôn bắt đầu ở 'draft'.
-- Sửa: kiểm ma trận trạng thái, cấu hình đủ khoá khi rời draft, khung bình
-- chọn khi vào community_voting; khoá thể lệ/slug sau draft (Q5), khoá
-- scoring_config từ lúc mở bình chọn; tự cập nhật updated_at.
create or replace function public.contests_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new contest must start as draft' using hint = 'contest_must_start_draft';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.contest_status_transition_allowed(old.status, new.status) then
      raise exception 'Contest status cannot go from % to %', old.status, new.status
        using hint = 'invalid_status_transition';
    end if;
    if old.status = 'draft' then
      v_missing := public.contest_config_missing_key(new.eligibility_rules, new.vote_rules);
      if v_missing is not null then
        raise exception 'Contest config is incomplete: %', v_missing using hint = 'config_incomplete';
      end if;
    end if;
    if new.status = 'community_voting' and (new.voting_start is null or new.voting_end is null) then
      raise exception 'Voting window must be set before community voting' using hint = 'voting_window_missing';
    end if;
  end if;

  if old.status <> 'draft' and (
       new.slug is distinct from old.slug
    or new.rules_content is distinct from old.rules_content
    or new.rules_version is distinct from old.rules_version
    or new.eligibility_rules is distinct from old.eligibility_rules
    or new.vote_rules is distinct from old.vote_rules
    or new.prizes_summary is distinct from old.prizes_summary
  ) then
    raise exception 'Contest rules are locked once the contest is public' using hint = 'rules_locked';
  end if;

  if new.scoring_config is distinct from old.scoring_config and (
       old.status in ('community_voting', 'judging', 'results', 'archived')
    or (old.voting_start is not null and now() >= old.voting_start)
  ) then
    raise exception 'Scoring formula is locked once voting has opened' using hint = 'scoring_locked';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contests_guard_write on public.contests;
create trigger contests_guard_write
  before insert or update on public.contests
  for each row execute function public.contests_guard_write();

-- Cuộc thi đã công khai không bao giờ bị hard-delete (X).
create or replace function public.contests_prevent_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft contests can be deleted' using hint = 'contest_not_deletable';
  end if;
  return old;
end;
$$;

drop trigger if exists contests_prevent_delete on public.contests;
create trigger contests_prevent_delete
  before delete on public.contests
  for each row execute function public.contests_prevent_delete();

-- ---------------------------------------------------------------------
-- 4. contest_submissions
-- ---------------------------------------------------------------------
create table if not exists public.contest_submissions (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete restrict,
  book_id uuid not null references public.books (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,  -- trigger ghi từ books
  -- D2: đạt điều kiện → 'eligible' ngay khi nộp. 'submitted' dành cho duyệt tay sau này.
  status public.contest_submission_status not null default 'eligible',
  status_reason text,                 -- lý do ineligible/disqualified hiển thị cho tác giả
  -- D4 + Q2 ("Cần bổ sung"): mảng cờ, cấu trúc ở XIX.6 của tài liệu thiết kế.
  -- Không tự đổi status. "Cần bổ sung" = còn cờ visible_to_author chưa resolved_at.
  review_flags jsonb not null default '[]'::jsonb,
  status_changed_by uuid references auth.users (id),
  status_changed_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),   -- đặt lại khi nộp lại sau khi rút
  rules_version_accepted text not null,
  rules_accepted_at timestamptz not null,
  eligibility_result jsonb not null default '[]'::jsonb,  -- kết quả engine lúc nộp, làm bằng chứng
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contest_submissions_contest_book_key unique (contest_id, book_id),
  constraint contest_submissions_id_contest_key unique (id, contest_id),  -- đích FK tổng hợp
  constraint contest_submissions_json_arrays check (
    jsonb_typeof(review_flags) = 'array' and jsonb_typeof(eligibility_result) = 'array')
);

create index if not exists contest_submissions_contest_status_idx
  on public.contest_submissions (contest_id, status, submitted_at desc, id);
create index if not exists contest_submissions_book_idx on public.contest_submissions (book_id);
create index if not exists contest_submissions_author_idx on public.contest_submissions (author_id);
create index if not exists contest_submissions_flagged_idx
  on public.contest_submissions (contest_id) where review_flags <> '[]'::jsonb;

-- author_id luôn lấy từ books, không bao giờ từ input; kiểm ma trận trạng
-- thái cho mọi đường ghi; tự cập nhật updated_at.
create or replace function public.contest_submissions_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select b.author_id into new.author_id from public.books b where b.id = new.book_id;
  if new.author_id is null then
    raise exception 'Book % not found', new.book_id using hint = 'book_not_found';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('submitted', 'eligible') then
      raise exception 'A new submission must be submitted or eligible' using hint = 'invalid_status_transition';
    end if;
  else
    if new.contest_id is distinct from old.contest_id or new.book_id is distinct from old.book_id then
      raise exception 'Submission contest/book cannot change' using hint = 'submission_immutable';
    end if;
    if new.status is distinct from old.status
       and not public.contest_submission_transition_allowed(old.status, new.status) then
      raise exception 'Submission status cannot go from % to %', old.status, new.status
        using hint = 'invalid_status_transition';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists contest_submissions_guard_write on public.contest_submissions;
create trigger contest_submissions_guard_write
  before insert or update on public.contest_submissions
  for each row execute function public.contest_submissions_guard_write();

-- Nhật ký chuyển trạng thái bài dự thi (giống book_moderation_actions).
create table if not exists public.contest_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.contest_submissions (id) on delete cascade,
  from_status public.contest_submission_status,
  to_status public.contest_submission_status not null,
  actor_id uuid references auth.users (id),
  actor_kind text not null check (actor_kind in ('author', 'admin', 'system')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists contest_submission_events_submission_idx
  on public.contest_submission_events (submission_id, created_at);

-- ---------------------------------------------------------------------
-- 5. contest_votes, contest_awards, contest_reminders
-- ---------------------------------------------------------------------
create table if not exists public.contest_votes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- FK tổng hợp: contest_id của vote không thể lệch với contest của bài.
  constraint contest_votes_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_votes_submission_user_key unique (submission_id, user_id)
);

create index if not exists contest_votes_contest_user_idx on public.contest_votes (contest_id, user_id);
create index if not exists contest_votes_submission_created_idx
  on public.contest_votes (submission_id, created_at);

-- Provenance: award -> submission (FK tổng hợp với contest) -> book -> author.
-- Không lưu lặp book_id/author_id; view contest_award_details join sẵn.
create table if not exists public.contest_awards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  award_code text not null check (award_code ~ '^[a-z0-9_]+$'),  -- 'first_prize', 'readers_choice'
  award_name text not null,
  award_rank integer check (award_rank is null or award_rank > 0),
  category text,
  -- D10: công bố bằng VND, quy đổi sang token; lưu tỷ giá lúc trao vì
  -- TOKEN_TO_VND_RATE (src/lib/wallet/config.ts) còn là giá trị tạm.
  prize_vnd bigint not null default 0 check (prize_vnd >= 0),
  token_vnd_rate integer check (token_vnd_rate is null or token_vnd_rate > 0),
  prize_tokens integer not null default 0 check (prize_tokens >= 0),
  prize_extras text,                  -- quà kèm không quy đổi: hợp đồng xuất bản, banner…
  -- Q6: admin chi thủ công qua pay_contest_award() → grant_platform_bonus() (Slice 1.7).
  payout_transaction_id uuid,
  paid_at timestamptz,
  -- Truyện bị gỡ/loại sau khi có giải → giữ award, nhãn "Đã thu hồi".
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  revoked_reason text,
  badge_icon_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint contest_awards_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_awards_unique unique (contest_id, award_code, submission_id),
  constraint contest_awards_paid_consistent check ((payout_transaction_id is null) = (paid_at is null)),
  constraint contest_awards_revoked_reason check (revoked_at is null or coalesce(btrim(revoked_reason), '') <> '')
);

create index if not exists contest_awards_submission_idx on public.contest_awards (submission_id);

-- Q4: "Nhắc tôi khi mở" — gửi qua notifications khi cuộc thi sang submission_open.
create table if not exists public.contest_reminders (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (contest_id, user_id)
);

create index if not exists contest_reminders_pending_idx
  on public.contest_reminders (contest_id) where notified_at is null;

-- ---------------------------------------------------------------------
-- 6. Thống kê sách cho eligibility (tính trong DB, không kéo content về Node)
-- ---------------------------------------------------------------------
-- Nhận mảng book id để engine nạp context theo lô (không N+1).
create or replace function public.get_books_contest_stats(p_book_ids uuid[])
returns table (
  book_id uuid,
  published_chapter_count integer,
  total_words integer,
  priced_chapter_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         (count(c.id) filter (where c.published and c.removed_at is null))::integer,
         coalesce(sum(public.contest_word_count(c.content)) filter (where c.published and c.removed_at is null), 0)::integer,
         (count(c.id) filter (where c.removed_at is null and (c.price > 0 or c.audio_price > 0)))::integer
  from unnest(p_book_ids) as b(id)
  left join public.chapters c on c.book_id = b.id
  group by b.id;
$$;

revoke execute on function public.get_books_contest_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.get_books_contest_stats(uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- 7. D8 + D11 — trigger trên bảng có sẵn
-- ---------------------------------------------------------------------
-- "Đang dự thi" = bài submitted/eligible/shortlisted và cuộc thi chưa sang
-- results/archived. Hết hạn chế tự động — không cần job gỡ khoá.
-- plpgsql (volatile) chứ không phải sql stable: mỗi lần gọi lấy snapshot mới,
-- nên UPDATE đang chờ khoá dòng của submit_contest_entry() sẽ thấy bài vừa commit.
create or replace function public.book_has_active_contest_entry(p_book_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.contest_submissions cs
    join public.contests c on c.id = cs.contest_id
    where cs.book_id = p_book_id
      and cs.status in ('submitted', 'eligible', 'shortlisted')
      and c.status not in ('results', 'archived')
  );
end;
$$;

create or replace function public.book_has_active_exclusive_contest_entry(p_book_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.contest_submissions cs
    join public.contests c on c.id = cs.contest_id
    where cs.book_id = p_book_id
      and cs.status in ('submitted', 'eligible', 'shortlisted')
      and c.status not in ('results', 'archived')
      and (c.eligibility_rules ->> 'require_exclusive')::boolean
  );
end;
$$;

-- authenticated cần EXECUTE vì trigger dưới chạy dưới role của người ghi.
revoke execute on function public.book_has_active_contest_entry(uuid) from public, anon;
grant execute on function public.book_has_active_contest_entry(uuid) to authenticated, service_role;
revoke execute on function public.book_has_active_exclusive_contest_entry(uuid) from public, anon;
grant execute on function public.book_has_active_exclusive_contest_entry(uuid) to authenticated, service_role;

-- D8. Bắt cả removed_at: admin khôi phục một chương có giá trong lúc thi cũng bị chặn.
create or replace function public.chapters_block_paid_during_contest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.price > 0 or new.audio_price > 0)
     and new.removed_at is null
     and public.book_has_active_contest_entry(new.book_id) then
    raise exception 'Chapter of a book in an active contest must be free'
      using errcode = 'check_violation', hint = 'contest_paid_chapter';
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_block_paid_during_contest on public.chapters;
create trigger chapters_block_paid_during_contest
  before insert or update of price, audio_price, book_id, removed_at on public.chapters
  for each row execute function public.chapters_block_paid_during_contest();

-- D11. Cần trigger vì authenticated có GRANT UPDATE (is_exclusive) trên books.
create or replace function public.books_block_exclusive_off_during_contest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_exclusive and not new.is_exclusive
     and public.book_has_active_exclusive_contest_entry(new.id) then
    raise exception 'Book in an exclusive-only contest must stay exclusive'
      using errcode = 'check_violation', hint = 'contest_exclusive_lock';
  end if;
  return new;
end;
$$;

drop trigger if exists books_block_exclusive_off_during_contest on public.books;
create trigger books_block_exclusive_off_during_contest
  before update of is_exclusive on public.books
  for each row execute function public.books_block_exclusive_off_during_contest();

-- ---------------------------------------------------------------------
-- 8. RPC (service_role)
-- ---------------------------------------------------------------------

-- Chuyển trạng thái cuộc thi. p_actor_id null = cron hệ thống; khác null thì
-- phải là admin/super_admin (kiểm lại ở DB vì service-role bỏ qua RLS).
create or replace function public.transition_contest_status(
  p_contest_id uuid,
  p_to public.contest_status,
  p_actor_id uuid,
  p_reason text default null
) returns public.contests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_from public.contest_status;
begin
  if p_actor_id is not null and not exists (
    select 1 from public.profiles where id = p_actor_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  v_from := v_contest.status;

  update public.contests
     set status = p_to,
         archived_at = case when p_to = 'archived' then coalesce(archived_at, now()) else archived_at end,
         results_published_at = case when p_to = 'results' then coalesce(results_published_at, now()) else results_published_at end
   where id = p_contest_id
  returning * into v_contest;

  insert into public.contest_status_events (contest_id, from_status, to_status, actor_id, reason)
  values (p_contest_id, v_from, p_to, p_actor_id, p_reason);

  return v_contest;
end;
$$;

revoke execute on function public.transition_contest_status(uuid, public.contest_status, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_contest_status(uuid, public.contest_status, uuid, text) to service_role;

-- Nộp bài (và nộp lại sau khi rút). TS đã chạy đủ eligibility engine trước;
-- RPC kiểm lại DƯỚI KHOÁ các bất biến có tranh chấp:
--   - khoá dòng contest → tuần tự hoá mọi lần nộp vào cùng cuộc thi
--     (max_entries_per_author không bị vượt khi nộp song song);
--   - khoá dòng sách + mọi chương → không có UPDATE giá / tắt độc quyền chen
--     vào giữa (D8, D11), và 2 lần nộp cùng sách vào 2 cuộc thi khác nhau
--     được tuần tự hoá (allow_multi_contest kiểm đúng cả 2 chiều).
create or replace function public.submit_contest_entry(
  p_contest_id uuid,
  p_book_id uuid,
  p_user_id uuid,
  p_rules_version text,
  p_eligibility_result jsonb
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_book public.books;
  v_existing public.contest_submissions;
  v_result public.contest_submissions;
  v_max integer;
begin
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.status <> 'submission_open'
     or now() < v_contest.submission_start or now() >= v_contest.submission_end then
    raise exception 'Contest is not accepting submissions' using hint = 'submission_closed';
  end if;
  if p_rules_version is distinct from v_contest.rules_version then
    raise exception 'Accepted rules version does not match' using hint = 'rules_version_mismatch';
  end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then
    raise exception 'Book % not found', p_book_id using hint = 'book_not_found';
  end if;
  if v_book.author_id is distinct from p_user_id then
    raise exception 'Book is not owned by caller' using hint = 'not_owner';
  end if;
  if not v_book.published or v_book.deleted_at is not null then
    raise exception 'Book is not visible' using hint = 'book_not_visible';
  end if;

  perform 1 from public.chapters where book_id = p_book_id for update;
  if exists (
    select 1 from public.chapters
    where book_id = p_book_id and removed_at is null and (price > 0 or audio_price > 0)
  ) then
    raise exception 'Every chapter must be free to enter a contest' using hint = 'paid_chapters';
  end if;

  if (v_contest.eligibility_rules ->> 'require_exclusive')::boolean and not v_book.is_exclusive then
    raise exception 'Contest requires an exclusive book' using hint = 'not_exclusive';
  end if;

  if exists (
    select 1 from public.contest_submissions s
    join public.contests oc on oc.id = s.contest_id
    where s.book_id = p_book_id
      and s.contest_id <> p_contest_id
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and oc.status not in ('results', 'archived')
      and (not (v_contest.eligibility_rules ->> 'allow_multi_contest')::boolean
           or not (oc.eligibility_rules ->> 'allow_multi_contest')::boolean)
  ) then
    raise exception 'Book is in another contest that does not allow multiple entries'
      using hint = 'multi_contest_conflict';
  end if;

  if jsonb_typeof(v_contest.eligibility_rules -> 'max_entries_per_author') = 'number' then
    v_max := (v_contest.eligibility_rules ->> 'max_entries_per_author')::integer;
    if (
      select count(*) from public.contest_submissions
      where contest_id = p_contest_id and author_id = p_user_id and book_id <> p_book_id
        and status in ('submitted', 'eligible', 'shortlisted')
    ) >= v_max then
      raise exception 'Author reached the entry limit for this contest' using hint = 'max_entries_reached';
    end if;
  end if;

  select * into v_existing from public.contest_submissions
  where contest_id = p_contest_id and book_id = p_book_id for update;

  if found then
    if v_existing.status = 'withdrawn'
       and (v_contest.eligibility_rules ->> 'allow_resubmit_after_withdraw')::boolean then
      update public.contest_submissions
         set status = 'eligible',
             status_reason = null,
             status_changed_by = p_user_id,
             status_changed_at = now(),
             submitted_at = now(),
             rules_version_accepted = p_rules_version,
             rules_accepted_at = now(),
             eligibility_result = coalesce(p_eligibility_result, '[]'::jsonb)
       where id = v_existing.id
      returning * into v_result;

      insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
      values (v_result.id, 'withdrawn', 'eligible', p_user_id, 'author', 'resubmit');
      return v_result;
    end if;
    raise exception 'Book is already entered in this contest'
      using errcode = 'unique_violation', hint = 'already_submitted';
  end if;

  insert into public.contest_submissions (
    contest_id, book_id, author_id, status, status_changed_by,
    rules_version_accepted, rules_accepted_at, eligibility_result
  ) values (
    p_contest_id, p_book_id, p_user_id, 'eligible', p_user_id,
    p_rules_version, now(), coalesce(p_eligibility_result, '[]'::jsonb)
  )
  returning * into v_result;

  insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
  values (v_result.id, null, 'eligible', p_user_id, 'author', 'submit');
  return v_result;
end;
$$;

revoke execute on function public.submit_contest_entry(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_contest_entry(uuid, uuid, uuid, text, jsonb) to service_role;

-- Đổi trạng thái bài dự thi — ai được làm gì (IV.4, D6):
--   author: chỉ rút (→ withdrawn) bài của chính mình, từ submitted/eligible,
--           khi cuộc thi còn submission_open và trước submission_end (admin
--           đóng nhận bài sớm → bản chụp đã chốt, không rút được nữa);
--   admin:  mọi chuyển hợp lệ trong ma trận trừ withdrawn; ineligible/
--           disqualified bắt buộc lý do (hiển thị cho tác giả);
--   system: submitted → eligible/ineligible (duyệt tự động).
create or replace function public.set_contest_submission_status(
  p_submission_id uuid,
  p_to public.contest_submission_status,
  p_actor_id uuid,
  p_actor_kind text,
  p_reason text default null
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_result public.contest_submissions;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select * into v_contest from public.contests where id = v_sub.contest_id;

  if v_sub.status = p_to then
    raise exception 'Submission is already %', p_to using hint = 'no_change';
  end if;

  if p_actor_kind = 'author' then
    if p_to <> 'withdrawn' then
      raise exception 'Authors can only withdraw' using hint = 'not_allowed';
    end if;
    if v_sub.author_id is distinct from p_actor_id then
      raise exception 'Submission is not owned by caller' using hint = 'not_owner';
    end if;
    if v_sub.status not in ('submitted', 'eligible')
       or v_contest.status <> 'submission_open'
       or now() >= v_contest.submission_end then
      raise exception 'Submission can no longer be withdrawn' using hint = 'withdraw_closed';
    end if;
  elsif p_actor_kind = 'admin' then
    if not exists (
      select 1 from public.profiles where id = p_actor_id and role in ('admin', 'super_admin')
    ) then
      raise exception 'Actor is not an admin' using hint = 'not_admin';
    end if;
    if p_to = 'withdrawn' then
      raise exception 'Only the author can withdraw' using hint = 'not_allowed';
    end if;
    if p_to in ('ineligible', 'disqualified') and coalesce(btrim(p_reason), '') = '' then
      raise exception 'A reason is required' using hint = 'reason_required';
    end if;
  elsif p_actor_kind = 'system' then
    if p_actor_id is not null or v_sub.status <> 'submitted' or p_to not in ('eligible', 'ineligible') then
      raise exception 'System can only review submitted entries' using hint = 'not_allowed';
    end if;
  else
    raise exception 'Unknown actor kind %', p_actor_kind using hint = 'not_allowed';
  end if;

  -- Ma trận (không phụ thuộc người thực hiện) được trigger guard kiểm.
  update public.contest_submissions
     set status = p_to,
         status_reason = case when p_to in ('ineligible', 'disqualified') then btrim(p_reason) else null end,
         status_changed_by = p_actor_id,
         status_changed_at = now()
   where id = p_submission_id
  returning * into v_result;

  insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
  values (p_submission_id, v_sub.status, p_to, p_actor_id, p_actor_kind, nullif(btrim(p_reason), ''));

  return v_result;
end;
$$;

revoke execute on function public.set_contest_submission_status(uuid, public.contest_submission_status, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_contest_submission_status(uuid, public.contest_submission_status, uuid, text, text) to service_role;

-- Bình chọn (D5): 1 phiếu / bài / tài khoản, không giới hạn số bài; đã đọc
-- hết ≥ 1 chương đang hiển thị của truyện (reading_history chỉ có dòng khi
-- tới đoạn cuối chương, qua kiểm quyền đọc ở server); tài khoản đủ tuổi.
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

  if v_contest.status <> 'community_voting'
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

revoke execute on function public.cast_contest_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cast_contest_vote(uuid, uuid) to service_role;

-- Bỏ phiếu — chỉ trong khung bình chọn. Trả true nếu có phiếu để bỏ.
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

  if v_contest.status <> 'community_voting'
     or v_contest.voting_start is null or v_contest.voting_end is null
     or now() < v_contest.voting_start or now() >= v_contest.voting_end then
    raise exception 'Voting is not open' using hint = 'voting_closed';
  end if;

  delete from public.contest_votes where submission_id = p_submission_id and user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke execute on function public.retract_contest_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retract_contest_vote(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 9. RLS + GRANT
-- ---------------------------------------------------------------------
alter table public.contests enable row level security;
alter table public.contest_status_events enable row level security;
alter table public.contest_submissions enable row level security;
alter table public.contest_submission_events enable row level security;
alter table public.contest_votes enable row level security;
alter table public.contest_awards enable row level security;
alter table public.contest_reminders enable row level security;

-- Không có đường ghi nào cho client: bỏ luôn quyền ghi mặc định của Supabase.
revoke insert, update, delete, truncate on
  public.contests, public.contest_status_events, public.contest_submissions,
  public.contest_submission_events, public.contest_votes, public.contest_awards,
  public.contest_reminders
from anon, authenticated;

-- contests: công khai trừ nháp. Admin đọc nháp qua route service-role (bỏ
-- qua RLS) — KHÔNG hỏi public.profiles ở đây: policy SELECT của profiles tự
-- truy vấn lại profiles, nên mọi policy khác tham chiếu profiles đều gây
-- "infinite recursion detected in policy for relation profiles" (42P17) khi
-- anon/authenticated đọc bảng này.
drop policy if exists "public contests are readable" on public.contests;
create policy "public contests are readable"
  on public.contests for select
  using (status <> 'draft');

-- contest_submissions: công khai chỉ khi bài hợp lệ, cuộc thi không nháp VÀ
-- sách còn hiển thị (tôn trọng moderation); tác giả thấy bài của mình.
-- Archive hiển thị bài của sách đã gỡ qua API service-role (placeholder), không qua policy này.
drop policy if exists "public contest submissions are readable" on public.contest_submissions;
create policy "public contest submissions are readable"
  on public.contest_submissions for select
  using (
    auth.uid() = author_id
    or (
      status in ('eligible', 'shortlisted')
      and exists (select 1 from public.contests c where c.id = contest_id and c.status <> 'draft')
      and exists (select 1 from public.books b where b.id = book_id and b.published and b.deleted_at is null)
    )
  );

-- contest_votes: chỉ thấy phiếu của chính mình (không lộ ai bầu cho ai).
drop policy if exists "users view their own contest votes" on public.contest_votes;
create policy "users view their own contest votes"
  on public.contest_votes for select
  using (auth.uid() = user_id);

-- contest_awards: chỉ công khai khi kết quả đã công bố.
drop policy if exists "published contest awards are readable" on public.contest_awards;
create policy "published contest awards are readable"
  on public.contest_awards for select
  using (exists (
    select 1 from public.contests c
    where c.id = contest_id and c.status in ('results', 'archived')
      and c.results_published_at is not null and c.results_published_at <= now()
  ));

drop policy if exists "users view their own contest reminders" on public.contest_reminders;
create policy "users view their own contest reminders"
  on public.contest_reminders for select
  using (auth.uid() = user_id);

-- contest_status_events / contest_submission_events: không có policy select
-- → chỉ service-role đọc; API trả phần tác giả được xem.

-- security_invoker: view chạy RLS của người gọi → không lộ award chưa công
-- bố (view mặc định chạy quyền OWNER, bỏ qua RLS của contest_awards).
create or replace view public.contest_award_details
  with (security_invoker = true) as
  select a.*, s.book_id, s.author_id, c.slug as contest_slug, c.title as contest_title
  from public.contest_awards a
  join public.contest_submissions s on s.id = a.submission_id
  join public.contests c on c.id = a.contest_id;

revoke insert, update, delete, truncate on public.contest_award_details from anon, authenticated;
grant select on public.contest_award_details to anon, authenticated;

-- --- Contest Engine — xếp hạng + feed (đọc, service_role): BXH Độc giả yêu
-- thích (popular-v1 = số phiếu hợp lệ, rank() toàn cục, keyset), feed
-- new/discover/az có trạng thái bình chọn của người xem theo lô, số bài/tác
-- giả cho thẻ cuộc thi. Xem migrations/archive/20260926_add_contest_ranking_and_feeds.sql. ---

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

-- --- Contest Engine — cờ "Cần bổ sung" (Q2): gắn / xử lý cờ trong
-- contest_submissions.review_flags, khoá dòng + kiểm admin trong DB, không
-- đổi status bài (D4). Xem migrations/archive/20260926_add_contest_review_flags.sql. ---

create or replace function public.add_contest_review_flag(
  p_submission_id uuid,
  p_admin_id uuid,
  p_code text,
  p_message text,
  p_fix_by timestamptz,
  p_visible_to_author boolean default true
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
begin
  if p_admin_id is not null and not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if coalesce(p_code, '') !~ '^[a-z0-9_]+$' then
    raise exception 'Flag code must be snake_case' using hint = 'invalid_flag';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'A message is required' using hint = 'reason_required';
  end if;

  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  if v_sub.status not in ('submitted', 'eligible', 'shortlisted') then
    raise exception 'Only active entries can be flagged' using hint = 'not_allowed';
  end if;
  -- Không gắn trùng một mã đang mở (hệ thống kiểm lại nhiều lần vẫn chỉ 1 cờ).
  if exists (
    select 1 from jsonb_array_elements(v_sub.review_flags) f
    where f ->> 'code' = p_code and f -> 'resolved_at' = 'null'::jsonb
  ) then
    raise exception 'An open flag with this code already exists' using hint = 'flag_exists';
  end if;

  update public.contest_submissions
     set review_flags = review_flags || jsonb_build_array(jsonb_build_object(
           'id', gen_random_uuid(),
           'code', p_code,
           'source', case when p_admin_id is null then 'system' else 'admin' end,
           'message', btrim(p_message),
           'visible_to_author', coalesce(p_visible_to_author, true),
           'fix_by', p_fix_by,
           'created_at', now(),
           'created_by', p_admin_id,
           'resolved_at', null,
           'resolved_by', null,
           'resolution', null))
   where id = p_submission_id
  returning * into v_sub;
  return v_sub;
end;
$$;

revoke execute on function public.add_contest_review_flag(uuid, uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.add_contest_review_flag(uuid, uuid, text, text, timestamptz, boolean) to service_role;

-- fixed = tác giả đã sửa; dismissed = cờ không còn đúng; escalated = chuyển
-- sang xử lý loại bài (admin đổi status riêng bằng set_contest_submission_status).
create or replace function public.resolve_contest_review_flag(
  p_submission_id uuid,
  p_flag_id uuid,
  p_admin_id uuid,
  p_resolution text
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_found boolean;
begin
  if p_admin_id is not null and not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if p_resolution is null or p_resolution not in ('fixed', 'dismissed', 'escalated') then
    raise exception 'Unknown resolution %', p_resolution using hint = 'invalid_flag';
  end if;

  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_sub.review_flags) f
    where f ->> 'id' = p_flag_id::text and f -> 'resolved_at' = 'null'::jsonb
  ) into v_found;
  if not v_found then
    raise exception 'Open flag % not found', p_flag_id using hint = 'flag_not_found';
  end if;

  update public.contest_submissions
     set review_flags = (
       select coalesce(jsonb_agg(
         case when f ->> 'id' = p_flag_id::text
              then f || jsonb_build_object('resolved_at', now(), 'resolved_by', p_admin_id, 'resolution', p_resolution)
              else f end
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(v_sub.review_flags) with ordinality as t(f, ord)
     )
   where id = p_submission_id
  returning * into v_sub;
  return v_sub;
end;
$$;

revoke execute on function public.resolve_contest_review_flag(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_contest_review_flag(uuid, uuid, uuid, text) to service_role;

-- --- Contest Engine — bản chụp bài dự thi lúc đóng nhận bài (D3, Q1):
-- snapshot-on-write (trigger BEFORE trên chapters/books chụp bản TRƯỚC khi
-- sửa ở lần ghi đầu tiên sau hạn) + snapshot_contest_submissions() cho sách
-- không bị sửa; purge_contest_snapshots() dọn theo nội dung đã gỡ. Chỉ
-- service-role đọc. Xem migrations/archive/20260926_add_contest_snapshots.sql. ---

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

-- --- Contest Engine — admin chi trả giải thủ công (D10, Q6): pay_contest_award()
-- khoá dòng giải, kiểm đã công bố / chưa thu hồi / chưa chi, rồi gọi
-- grant_platform_bonus() (sổ cái ví). Xem migrations/archive/20260926_add_contest_award_payout.sql. ---

do $$ begin
  alter table public.contest_awards
    add constraint contest_awards_payout_transaction_fk
    foreign key (payout_transaction_id) references public.transactions (id);
exception when duplicate_object then null; end $$;

create or replace function public.pay_contest_award(p_award_id uuid, p_admin_id uuid)
returns public.contest_awards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award public.contest_awards;
  v_contest public.contests;
  v_author uuid;
  v_txn public.transactions;
begin
  if p_admin_id is null or not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;

  select * into v_award from public.contest_awards where id = p_award_id for update;
  if not found then
    raise exception 'Award % not found', p_award_id using hint = 'award_not_found';
  end if;
  select * into v_contest from public.contests where id = v_award.contest_id;

  if v_contest.status not in ('results', 'archived')
     or v_contest.results_published_at is null or v_contest.results_published_at > now() then
    raise exception 'Results are not published yet' using hint = 'results_not_published';
  end if;
  if v_award.revoked_at is not null then
    raise exception 'Award was revoked' using hint = 'award_revoked';
  end if;
  if v_award.payout_transaction_id is not null then
    raise exception 'Award already paid' using hint = 'award_already_paid';
  end if;
  if v_award.prize_tokens <= 0 then
    raise exception 'Award has no token prize' using hint = 'award_no_tokens';
  end if;

  select author_id into v_author from public.contest_submissions where id = v_award.submission_id;

  v_txn := public.grant_platform_bonus(
    p_admin_id,
    v_author,
    v_award.prize_tokens,
    format('Giải %s — %s', v_award.award_name, v_contest.title)
  );

  update public.contest_awards
     set payout_transaction_id = v_txn.id, paid_at = now()
   where id = p_award_id
  returning * into v_award;
  return v_award;
end;
$$;

revoke execute on function public.pay_contest_award(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_contest_award(uuid, uuid) to service_role;

-- --- Contest Engine Phase 2, Slice 2.2: tín hiệu hợp lệ (meaningful read,
-- độc giả hợp lệ, phiếu đã lọc), tín hiệu gian lận, bảng điểm cache làm mới
-- lười 15 phút + chốt khi công bố kết quả. Xem
-- migrations/archive/20260926_add_contest_scores.sql (mục 4 của migration — chuyển
-- cuộc thi chưa mở bình chọn sang popular-v2 — là dữ liệu, không ở đây). ---

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

-- --- Contest Engine Phase 2, Slice 2.3: hàng "Đang được chú ý", "Đang tăng
-- tốc" và 2 nhóm ứng viên "Viên ngọc ẩn" (80/20 chọn ở src/lib/contests/signals.ts).
-- Xem migrations/archive/20260926_add_contest_signal_feeds.sql. ---

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

-- --- Contest Engine Phase 2, Slice 2.4: phát hiện tín hiệu gian lận (bình
-- chọn dồn dập, tài khoản vừa đủ tuổi bầu hàng loạt) + admin xét. Hệ thống chỉ
-- gắn tín hiệu; chỉ tín hiệu đã xác nhận mới loại khỏi điểm (P10). Xem
-- migrations/archive/20260926_add_contest_fraud_detection.sql. ---

create unique index if not exists contest_fraud_signals_dedupe_idx
  on public.contest_fraud_signals (
    contest_id,
    signal_code,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(submission_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Trả số tín hiệu mới. Chỉ quét cuộc thi đang/đã bình chọn chưa công bố.
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
  if v_contest.status not in ('community_voting', 'judging') then
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

revoke execute on function public.detect_contest_fraud_signals(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.detect_contest_fraud_signals(uuid, integer, integer, integer, integer) to service_role;

-- Admin xác nhận / bỏ qua / mở lại một tín hiệu. Khoá khi bảng điểm đã chốt
-- (đã công bố kết quả) — quyết định lúc đó không còn tác dụng lên điểm.
create or replace function public.review_contest_fraud_signal(
  p_signal_id uuid,
  p_admin_id uuid,
  p_status text,          -- 'confirmed' | 'dismissed' | 'open'
  p_note text
) returns public.contest_fraud_signals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal public.contest_fraud_signals;
  v_contest_status public.contest_status;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if p_status is null or p_status not in ('confirmed', 'dismissed', 'open') then
    raise exception 'Invalid review status %', p_status using hint = 'invalid_input';
  end if;

  select * into v_signal from public.contest_fraud_signals where id = p_signal_id for update;
  if not found then
    raise exception 'Signal % not found', p_signal_id using hint = 'signal_not_found';
  end if;
  select status into v_contest_status from public.contests where id = v_signal.contest_id;
  if v_contest_status in ('results', 'archived') or exists (
    select 1 from public.contest_score_state st where st.contest_id = v_signal.contest_id and st.frozen_at is not null
  ) then
    raise exception 'Scores are frozen' using hint = 'signal_locked';
  end if;

  update public.contest_fraud_signals
     set status = p_status,
         reviewed_by = case when p_status = 'open' then null else p_admin_id end,
         reviewed_at = case when p_status = 'open' then null else now() end,
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_signal_id
  returning * into v_signal;
  return v_signal;
end;
$$;

revoke execute on function public.review_contest_fraud_signal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_contest_fraud_signal(uuid, uuid, text, text) to service_role;

-- --- Contest Engine Phase 2, Slice 2.7: thống kê bài dự thi cho tác giả
-- (không dùng lượt xem trang; số phiếu do route ẩn/hiện theo P9). Xem
-- migrations/archive/20260926_add_contest_entry_stats.sql. ---

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

-- --- Contest Engine Slice 2.5a: thời gian sự kiện engagement do server đặt
-- (không ghi lùi / ghi trước để rơi vào khung chấm). Xem
-- migrations/archive/20260926_add_scoring_tracking.sql. ---

-- Thời gian sự kiện do server đặt: insert → now(); update → giữ giá trị cũ.
create or replace function public.force_server_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.force_server_added_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := now();
  else
    new.added_at := old.added_at;
  end if;
  return new;
end;
$$;

drop trigger if exists anchored_comments_server_time on public.anchored_comments;
create trigger anchored_comments_server_time
  before insert or update on public.anchored_comments
  for each row execute function public.force_server_created_at();

drop trigger if exists chapter_votes_server_time on public.chapter_votes;
create trigger chapter_votes_server_time
  before insert or update on public.chapter_votes
  for each row execute function public.force_server_created_at();

drop trigger if exists character_trope_votes_server_time on public.character_trope_votes;
create trigger character_trope_votes_server_time
  before insert or update on public.character_trope_votes
  for each row execute function public.force_server_created_at();

drop trigger if exists reading_list_items_server_time on public.reading_list_items;
create trigger reading_list_items_server_time
  before insert or update on public.reading_list_items
  for each row execute function public.force_server_added_at();

-- --- Contest Engine Slice 2.5b: khung chấm chính thức, cấu hình chấm có
-- version, giám khảo, phiếu chấm theo tiêu chí + nhật ký. Xem
-- migrations/archive/20260926_add_contest_judging.sql. ---

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

-- --- Contest Engine Slice 2.6a: số liệu chấm chung cuộc trong khung chấm +
-- lượt tính / snapshot mọi tầng. Engine tính điểm ở
-- src/lib/contests/final-scoring/engine.ts. Xem migrations/archive/20260926_add_final_scoring.sql. ---

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

-- --- Contest Engine Slice 2.6b: công bố lượt tính chung cuộc (1 lượt đang công
-- bố / cuộc thi; thay thế cần lý do, lượt cũ giữ lại). Xem
-- migrations/archive/20260926_add_score_run_publish.sql. ---

create unique index if not exists contest_score_runs_one_published
  on public.contest_score_runs (contest_id) where published_at is not null and superseded_at is null;

create or replace function public.contest_score_runs_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.contest_id is distinct from old.contest_id or new.config_version is distinct from old.config_version
     or new.kind is distinct from old.kind or new.window_start is distinct from old.window_start
     or new.window_end is distinct from old.window_end or new.input_digest is distinct from old.input_digest
     or new.flags is distinct from old.flags or new.computed_by is distinct from old.computed_by
     or new.computed_at is distinct from old.computed_at then
    raise exception 'Score runs are immutable' using hint = 'score_run_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists contest_score_runs_guard_update on public.contest_score_runs;
create trigger contest_score_runs_guard_update
  before update on public.contest_score_runs
  for each row execute function public.contest_score_runs_guard_update();

create or replace function public.publish_contest_score_run(
  p_run_id uuid,
  p_admin_id uuid,
  p_reason text
) returns public.contest_score_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.contest_score_runs;
  v_contest public.contests;
  v_current uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  select * into v_run from public.contest_score_runs where id = p_run_id for update;
  if not found then
    raise exception 'Score run % not found', p_run_id using hint = 'score_run_not_found';
  end if;
  select * into v_contest from public.contests where id = v_run.contest_id for update;
  if v_run.kind <> 'final' then
    raise exception 'Only final runs can be published' using hint = 'score_run_not_final';
  end if;
  if v_run.superseded_at is not null or v_run.published_at is not null then
    raise exception 'Run was already published' using hint = 'invalid_status_transition';
  end if;
  if v_run.config_version is distinct from v_contest.scoring_config_version then
    raise exception 'Run uses an old scoring config version' using hint = 'score_run_stale';
  end if;

  select id into v_current from public.contest_score_runs
  where contest_id = v_run.contest_id and published_at is not null and superseded_at is null
  for update;
  if v_current is not null then
    if v_reason is null then
      raise exception 'A reason is required to replace published results' using hint = 'reason_required';
    end if;
    update public.contest_score_runs set superseded_at = now() where id = v_current;
  end if;

  update public.contest_score_runs
     set published_at = now(), published_by = p_admin_id, publish_reason = v_reason
   where id = p_run_id
  returning * into v_run;
  return v_run;
end;
$$;

revoke execute on function public.publish_contest_score_run(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_contest_score_run(uuid, uuid, text) to service_role;

-- --- Contest Engine Phase 3, Slice 3.1: nhiệm vụ sự kiện cuộc thi (1 ô sự kiện
-- / ngày, ghi tiến độ nhận biết cuộc thi, mẫu seed). reset_quest_pool_slot đã
-- sửa tại chỗ ở phần 10 (từ chối ô / mẫu sự kiện). Xem
-- migrations/archive/20260927_add_contest_quests.sql. ---

-- ---------------------------------------------------------------------
-- 1. Cột mới
-- ---------------------------------------------------------------------
alter table public.task_templates
  add column if not exists quest_pool text not null default 'general',
  add column if not exists contest_action text;

do $$ begin
  alter table public.task_templates add constraint task_templates_quest_pool_check
    check (quest_pool in ('general', 'contest'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.task_templates add constraint task_templates_contest_action_check
    check (contest_action is null or contest_action in ('read_entry_chapter', 'read_hidden_gem', 'comment_entry', 'save_entry', 'vote_entry'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.task_templates add constraint task_templates_contest_action_consistent
    check ((quest_pool = 'contest') = (contest_action is not null));
exception when duplicate_object then null; end $$;

alter table public.user_quest_pool
  add column if not exists slot_kind text not null default 'general',
  add column if not exists contest_id uuid references public.contests (id) on delete cascade,
  add column if not exists reroll_count integer not null default 0;

do $$ begin
  alter table public.user_quest_pool add constraint user_quest_pool_slot_kind_check
    check (slot_kind in ('general', 'event') and reroll_count >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_quest_pool add constraint user_quest_pool_event_contest
    check ((slot_kind = 'event') = (contest_id is not null));
exception when duplicate_object then null; end $$;

create unique index if not exists user_quest_pool_one_event_per_day
  on public.user_quest_pool (user_id, pool_date) where slot_kind = 'event';

-- ---------------------------------------------------------------------
-- 3. Ô sự kiện
-- ---------------------------------------------------------------------
-- Mẫu sự kiện có dùng được cho cuộc thi lúc này không (bình chọn chỉ trong khung bình chọn).
create or replace function public.contest_quest_available(p_template public.task_templates, p_contest public.contests)
returns boolean
language sql
stable
as $$
  select p_template.active and p_template.quest_pool = 'contest'
     and p_contest.status in ('submission_open', 'community_voting')
     and (p_template.contest_action <> 'vote_entry' or (
           p_contest.status = 'community_voting' and p_contest.voting_start is not null and p_contest.voting_end is not null
           and now() >= p_contest.voting_start and now() < p_contest.voting_end));
$$;

-- Thêm ô sự kiện cho ngày (idempotent: đã có thì trả ô đang có). TS chọn cuộc thi (K4) + mẫu.
create or replace function public.add_event_quest_slot(
  p_user_id uuid,
  p_pool_date date,
  p_template_id uuid,
  p_contest_id uuid
) returns public.user_quest_pool
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_quest_pool;
  v_template public.task_templates;
  v_contest public.contests;
  v_index integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_pool_date::text, 0));
  select * into v_row from public.user_quest_pool where user_id = p_user_id and pool_date = p_pool_date and slot_kind = 'event';
  if v_row.id is not null then
    return v_row;
  end if;

  select * into v_template from public.task_templates where id = p_template_id;
  select * into v_contest from public.contests where id = p_contest_id;
  if v_template.id is null or v_contest.id is null or not public.contest_quest_available(v_template, v_contest) then
    raise exception 'Event quest is not available' using hint = 'quest_not_available';
  end if;

  select coalesce(max(slot_index), -1) + 1 into v_index from public.user_quest_pool where user_id = p_user_id and pool_date = p_pool_date;
  insert into public.user_quest_pool (user_id, pool_date, task_template_id, slot_index, slot_kind, contest_id)
  values (p_user_id, p_pool_date, p_template_id, v_index, 'event', p_contest_id)
  returning * into v_row;
  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, p_template_id, p_pool_date)
  on conflict (user_id, template_id, task_date) do nothing;
  return v_row;
end;
$$;

revoke execute on function public.add_event_quest_slot(uuid, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_event_quest_slot(uuid, date, uuid, uuid) to service_role;

-- Đổi nhiệm vụ sự kiện (K3: tối đa p_max_rerolls lần/ngày, tách khỏi ngân sách chung). Giữ nguyên cuộc thi.
create or replace function public.reset_event_quest_slot(
  p_user_id uuid,
  p_pool_date date,
  p_replacement_template_id uuid,
  p_max_rerolls integer
) returns public.user_quest_pool
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_quest_pool;
  v_template public.task_templates;
  v_contest public.contests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_pool_date::text, 0));
  select * into v_row from public.user_quest_pool
  where user_id = p_user_id and pool_date = p_pool_date and slot_kind = 'event' for update;
  if v_row.id is null then
    raise exception 'No event quest today' using hint = 'quest_not_available';
  end if;
  if v_row.reroll_count >= p_max_rerolls then
    raise exception 'Event quest reroll limit reached' using hint = 'event_reroll_limit';
  end if;
  if exists (
    select 1 from public.user_daily_tasks
    where user_id = p_user_id and template_id = v_row.task_template_id and task_date = p_pool_date and completed
  ) then
    raise exception 'Cannot reset a completed quest' using hint = 'event_reroll_limit';
  end if;
  select * into v_template from public.task_templates where id = p_replacement_template_id;
  select * into v_contest from public.contests where id = v_row.contest_id;
  if v_template.id is null or v_template.id = v_row.task_template_id or not public.contest_quest_available(v_template, v_contest) then
    raise exception 'Replacement event quest is not available' using hint = 'quest_not_available';
  end if;

  update public.user_quest_pool
     set task_template_id = p_replacement_template_id, reroll_count = reroll_count + 1
   where id = v_row.id
  returning * into v_row;
  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, p_replacement_template_id, p_pool_date)
  on conflict (user_id, template_id, task_date) do nothing;
  return v_row;
end;
$$;

revoke execute on function public.reset_event_quest_slot(uuid, date, uuid, integer) from public, anon, authenticated;
grant execute on function public.reset_event_quest_slot(uuid, date, uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- 4. Ghi tiến độ nhiệm vụ sự kiện
-- ---------------------------------------------------------------------
-- p_event: 'chapter_completed' | 'comment' | 'reading_list_add' | 'vote'.
-- Trả true nếu tiến độ nhiệm vụ sự kiện hôm nay tăng.
-- Slice 3.2 (migrations/archive/20260927_add_contest_passport.sql): ghi Passport trước nhiệm vụ sự kiện.
create or replace function public.record_contest_activity(
  p_user_id uuid,
  p_event text,
  p_book_id uuid,
  p_chapter_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.user_quest_pool;
  v_template public.task_templates;
  v_contest public.contests;
  v_entry record;
  v_sub uuid;
  v_author uuid;
  v_words integer;
  v_active integer;
  v_updated integer;
  v_meaningful boolean;
begin
  -- Thời gian đọc thật của chương (dùng chung cho Passport + nhiệm vụ).
  if p_event = 'chapter_completed' then
    select public.contest_word_count(ch.content) into v_words
    from public.chapters ch
    where ch.id = p_chapter_id and ch.book_id = p_book_id and ch.published and ch.removed_at is null;
    if v_words is null then
      return false;
    end if;
    select coalesce(sum(rs.active_seconds), 0)::integer into v_active
    from public.reading_sessions rs where rs.user_id = p_user_id and rs.chapter_id = p_chapter_id;
  end if;

  -- ===== Passport (Slice 3.2): mọi cuộc thi trong mùa có bài này =====
  for v_entry in
    select s.id as sub_id, s.author_id, c.*
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.book_id = p_book_id and s.status in ('eligible', 'shortlisted')
      and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging')
      and s.author_id <> p_user_id
  loop
    if p_event = 'chapter_completed' then
      v_meaningful := v_active >= greatest(
        coalesce((v_entry.scoring_config ->> 'meaningful_read_min_seconds')::numeric, 30),
        ceil(coalesce((v_entry.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4) * v_words * 60.0
             / coalesce((v_entry.scoring_config ->> 'reading_words_per_minute')::numeric, 250)));
      if v_meaningful then
        insert into public.contest_passport_reads (user_id, contest_id, submission_id, chapter_id, read_day, hidden_gem)
        values (p_user_id, v_entry.id, v_entry.sub_id, p_chapter_id, (now() at time zone 'Asia/Ho_Chi_Minh')::date,
          coalesce((select sc.valid_readers from public.contest_submission_scores sc where sc.submission_id = v_entry.sub_id), 0)
            < coalesce((v_entry.scoring_config ->> 'hidden_gem_max_readers')::integer, 100)
          or p_book_id not in (
            select s2.book_id from public.contest_submissions s2
            join public.books b2 on b2.id = s2.book_id and b2.published and b2.deleted_at is null
            where s2.contest_id = v_entry.id and s2.status in ('eligible', 'shortlisted')
            order by b2.view_count desc, s2.submitted_at asc, s2.id asc
            limit 10))
        on conflict (user_id, contest_id, chapter_id, read_day) do nothing;
      end if;
    end if;
    perform public.contest_passport_state(p_user_id, v_entry.id, true);
  end loop;

  -- ===== Nhiệm vụ sự kiện (Slice 3.1) =====
  select * into v_slot from public.user_quest_pool
  where user_id = p_user_id and pool_date = current_date and slot_kind = 'event';
  if v_slot.id is null then
    return false;
  end if;
  select * into v_template from public.task_templates where id = v_slot.task_template_id;
  if not (
    (p_event = 'chapter_completed' and v_template.contest_action in ('read_entry_chapter', 'read_hidden_gem'))
    or (p_event = 'comment' and v_template.contest_action = 'comment_entry')
    or (p_event = 'reading_list_add' and v_template.contest_action = 'save_entry')
    or (p_event = 'vote' and v_template.contest_action = 'vote_entry')
  ) then
    return false;
  end if;

  select * into v_contest from public.contests where id = v_slot.contest_id;
  select s.id, s.author_id into v_sub, v_author
  from public.contest_submissions s
  join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
  where s.contest_id = v_slot.contest_id and s.book_id = p_book_id and s.status in ('eligible', 'shortlisted');
  if v_sub is null or v_author = p_user_id then
    return false;
  end if;

  if p_event = 'chapter_completed' then
    -- K7: tới cuối chương VÀ thời gian đọc thật ≥ ngưỡng đọc thật của cuộc thi.
    if v_active < greatest(
      coalesce((v_contest.scoring_config ->> 'meaningful_read_min_seconds')::numeric, 30),
      ceil(coalesce((v_contest.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4) * v_words * 60.0
           / coalesce((v_contest.scoring_config ->> 'reading_words_per_minute')::numeric, 250))) then
      return false;
    end if;
    if v_template.contest_action = 'read_hidden_gem' and not (
      coalesce((select sc.valid_readers from public.contest_submission_scores sc where sc.submission_id = v_sub), 0)
        < coalesce((v_contest.scoring_config ->> 'hidden_gem_max_readers')::integer, 100)
      or p_book_id not in (
        select s.book_id from public.contest_submissions s
        join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
        where s.contest_id = v_slot.contest_id and s.status in ('eligible', 'shortlisted')
        order by b.view_count desc, s.submitted_at asc, s.id asc
        limit 10)
    ) then
      return false;
    end if;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, v_slot.pool_date)
  on conflict (user_id, template_id, task_date) do nothing;
  update public.user_daily_tasks
     set progress = least(progress + 1, v_template.target_count),
         completed = (progress + 1) >= v_template.target_count
   where user_id = p_user_id and template_id = v_template.id and task_date = v_slot.pool_date and not completed;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.record_contest_activity(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_contest_activity(uuid, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 5. Mẫu nhiệm vụ sự kiện (K1, K2 — admin chỉnh thưởng / thêm mẫu sau)
-- ---------------------------------------------------------------------
insert into public.task_templates (code, title, description, for_role, quest_type, target_count, reward_tokens, active, quest_pool, contest_action)
values
  ('contest_read_entry_chapter', 'Đọc 1 chương bài dự thi', 'Đọc hết 1 chương của một tác phẩm đang dự thi — đọc thật, không lướt.', null, null, 1, 10, true, 'contest', 'read_entry_chapter'),
  ('contest_read_hidden_gem', 'Tìm viên ngọc ẩn', 'Đọc hết 1 chương của một tác phẩm dự thi còn ít người đọc (hàng "Viên ngọc ẩn").', null, null, 1, 12, true, 'contest', 'read_hidden_gem'),
  ('contest_comment_entry', 'Góp ý cho bài dự thi', 'Để lại 1 bình luận ở một tác phẩm đang dự thi.', null, null, 1, 8, true, 'contest', 'comment_entry'),
  ('contest_save_entry', 'Lưu bài dự thi', 'Thêm 1 tác phẩm dự thi vào danh sách đọc của bạn.', null, null, 1, 6, true, 'contest', 'save_entry'),
  ('contest_vote_entry', 'Bình chọn cho bài đã đọc', 'Bình chọn cho 1 tác phẩm dự thi bạn đã đọc hết ít nhất 1 chương.', null, null, 1, 8, true, 'contest', 'vote_entry')
on conflict (code) do nothing;

-- --- Contest Engine Phase 3, Slice 3.2: Contest Passport (7 cột mốc / cuộc
-- thi, huy hiệu "Người đi hết mùa thi"). record_contest_activity đã sửa tại
-- chỗ ở khối Slice 3.1. Xem migrations/archive/20260927_add_contest_passport.sql. ---

create table if not exists public.contest_passport_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  contest_id uuid not null,
  submission_id uuid not null,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  read_day date not null,           -- ngày theo giờ Việt Nam
  hidden_gem boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, contest_id, chapter_id, read_day),
  constraint contest_passport_reads_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete cascade
);

create index if not exists contest_passport_reads_contest_user_idx on public.contest_passport_reads (contest_id, user_id);

create table if not exists public.contest_passports (
  user_id uuid not null references auth.users (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, contest_id)
);

alter table public.contest_passport_reads enable row level security;
alter table public.contest_passports enable row level security;
revoke all on public.contest_passport_reads, public.contest_passports from anon, authenticated;

-- Trạng thái Passport của 1 người ở 1 cuộc thi: { milestones: [{code, progress, target}], completed_at }.
-- p_record_completion = true: đủ mốc thì ghi huy hiệu (chỉ trong mùa thi).
create or replace function public.contest_passport_state(p_user_id uuid, p_contest_id uuid, p_record_completion boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_read_entries integer;
  v_authors integer;
  v_finished integer;
  v_gems integer;
  v_comments integer;
  v_votes integer;
  v_days integer;
  v_milestones jsonb;
  v_done boolean;
  v_completed timestamptz;
begin
  select * into v_contest from public.contests where id = p_contest_id;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;

  select count(distinct r.submission_id), count(distinct s.author_id), count(distinct r.read_day),
         count(distinct r.submission_id) filter (where r.hidden_gem)
    into v_read_entries, v_authors, v_days, v_gems
  from public.contest_passport_reads r
  join public.contest_submissions s on s.id = r.submission_id
  where r.user_id = p_user_id and r.contest_id = p_contest_id;

  select count(*) into v_finished
  from (
    select r.submission_id
    from public.contest_passport_reads r
    join public.contest_submissions s on s.id = r.submission_id
    join public.chapters ch on ch.id = r.chapter_id and ch.book_id = s.book_id and ch.published and ch.removed_at is null
    where r.user_id = p_user_id and r.contest_id = p_contest_id
    group by r.submission_id, s.book_id
    having count(distinct r.chapter_id) >= (
      select count(*) from public.chapters c2 where c2.book_id = s.book_id and c2.published and c2.removed_at is null)
  ) x;

  select count(*) into v_comments
  from public.anchored_comments ac
  join public.chapters ch on ch.id = ac.chapter_id
  join public.contest_submissions s on s.book_id = ch.book_id and s.contest_id = p_contest_id and s.status in ('eligible', 'shortlisted')
  where ac.user_id = p_user_id and ac.user_id <> s.author_id and ac.created_at >= v_contest.submission_start;

  select count(*) into v_votes
  from public.contest_votes v
  join public.contest_submissions s on s.id = v.submission_id and s.status in ('eligible', 'shortlisted')
  where v.user_id = p_user_id and v.contest_id = p_contest_id;

  v_milestones := jsonb_build_array(
    jsonb_build_object('code', 'read_entry', 'progress', least(v_read_entries, 1), 'target', 1),
    jsonb_build_object('code', 'read_3_authors', 'progress', least(v_authors, 3), 'target', 3),
    jsonb_build_object('code', 'finish_entry', 'progress', least(v_finished, 1), 'target', 1),
    jsonb_build_object('code', 'hidden_gem', 'progress', least(v_gems, 1), 'target', 1),
    jsonb_build_object('code', 'comment_entry', 'progress', least(v_comments, 1), 'target', 1),
    jsonb_build_object('code', 'vote_3', 'progress', least(v_votes, 3), 'target', 3),
    jsonb_build_object('code', 'return_3_days', 'progress', least(v_days, 3), 'target', 3)
  );
  v_done := not exists (
    select 1 from jsonb_array_elements(v_milestones) m where (m ->> 'progress')::integer < (m ->> 'target')::integer);

  if v_done and p_record_completion
     and v_contest.status in ('submission_open', 'submission_closed', 'community_voting', 'judging') then
    insert into public.contest_passports (user_id, contest_id) values (p_user_id, p_contest_id)
    on conflict (user_id, contest_id) do nothing;
  end if;
  select completed_at into v_completed from public.contest_passports where user_id = p_user_id and contest_id = p_contest_id;

  return jsonb_build_object('milestones', v_milestones, 'completed_at', v_completed);
end;
$$;

revoke execute on function public.contest_passport_state(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.contest_passport_state(uuid, uuid, boolean) to service_role;

-- --- Contest Engine Phase 3, Slice 3.4: chụp hạng BXH mỗi ngày (cột "Thay
-- đổi" ▲▼, K9). Xem migrations/archive/20260928_add_contest_rank_snapshots.sql. ---

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
  if v_status = 'community_voting' and not exists (
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

revoke execute on function public.snapshot_contest_ranks(uuid, date) from public, anon, authenticated;
grant execute on function public.snapshot_contest_ranks(uuid, date) to service_role;

create index if not exists contest_awards_payout_txn_idx
  on public.contest_awards (payout_transaction_id) where payout_transaction_id is not null;
