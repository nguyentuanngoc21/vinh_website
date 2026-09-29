-- Migration: Contest Engine — lõi Phase 1 (Slice 1.1).
--
-- Thiết kế đầy đủ: docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md (mục III, IV, VI, X,
-- XIX; quyết định D1–D12, Q1–Q7).
--
-- Nguyên tắc:
--   - books vẫn là nguồn chân lý. Contest ─< contest_submissions >─ Book (n–n).
--     Không thêm cột nào vào books/chapters; "đang dự thi" luôn suy ra từ
--     contest_submissions.
--   - Mọi ghi dữ liệu contest đi qua route handler dùng service-role + các RPC
--     dưới đây. Không có policy INSERT/UPDATE/DELETE cho anon/authenticated,
--     và quyền ghi bảng bị REVOKE luôn (RLS chặn theo hàng, GRANT chặn theo cột
--     — docs/DEV_WORKFLOW.md).
--   - Cấu hình (eligibility_rules, vote_rules) do src/lib/contests/config.ts
--     chuẩn hoá và ghi ĐỦ mọi khoá. DB kiểm đủ khoá lúc rời 'draft', sau đó
--     RPC đọc thẳng khoá — không có bộ default thứ hai ở đây.
--   - Thể lệ không đổi sau khi công khai (Q5): trigger khoá rules/slug khi
--     cuộc thi rời 'draft'; scoring_config khoá từ lúc mở bình chọn.
--
-- Hai trigger mới trên bảng CÓ SẴN (ngoại lệ duy nhất với "chỉ thêm mới"):
--   - chapters_block_paid_during_contest (D8): chương của sách đang dự thi
--     không được có giá đọc/giá audio > 0.
--   - books_block_exclusive_off_during_contest (D11): sách đang dự thi cuộc
--     thi require_exclusive không được tắt độc quyền (cả admin/service-role).
--   Cả hai chỉ từ chối đúng các trường hợp đó; mọi đường ghi khác giữ nguyên.
--   Lỗi dùng errcode check_violation + hint riêng ('contest_paid_chapter',
--   'contest_exclusive_lock') để route đổi thành 409 tiếng Việt.
--
-- Mã lỗi nghiệp vụ của RPC: raise exception ... using hint = '<code>' — TS
-- đọc `hint` để trả lý do cho UI (không so chuỗi message).
--
-- Chưa có trong migration này (slice sau): snapshot + snapshot-on-write
-- (Slice 1.6), ranking/feeds SQL (1.2), RPC cờ "Cần bổ sung" (1.3),
-- pay_contest_award (1.7).
--
-- Idempotent: create ... if not exists, enum bọc duplicate_object,
-- create or replace function, drop trigger/policy if exists rồi tạo lại.
-- Test: docs/supabase/tests/20260926_contest_engine_core.test.sql.

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
--           trước submission_end;
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
    if v_sub.status not in ('submitted', 'eligible') or now() >= v_contest.submission_end then
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

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối migration này ở CUỐI file
--     (phụ thuộc books, chapters, profiles, reading_history, auth.users — đều
--     đã có phía trên).
--   - src/lib/supabase/types.ts: type ContestStatus, ContestSubmissionStatus;
--     Tables contests, contest_status_events, contest_submissions,
--     contest_submission_events, contest_votes, contest_awards,
--     contest_reminders; View contest_award_details; Functions
--     contest_word_count, get_books_contest_stats, book_has_active_contest_entry,
--     book_has_active_exclusive_contest_entry, transition_contest_status,
--     submit_contest_entry, set_contest_submission_status, cast_contest_vote,
--     retract_contest_vote.
--   - Route cần đổi lỗi trigger thành 409 (Slice 1.5): PATCH
--     /api/authoring/chapters/[chapterId] + route mobile tương ứng
--     (hint contest_paid_chapter), PATCH /api/authoring/books/[bookId] và
--     PATCH /api/admin/books/[bookId] (hint contest_exclusive_lock),
--     PATCH /api/admin/chapters/[chapterId] khi khôi phục chương có giá
--     (hint contest_paid_chapter).
-- ---------------------------------------------------------------------
