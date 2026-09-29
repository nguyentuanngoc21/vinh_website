-- Migration: nhiệm vụ sự kiện cuộc thi — Contest Quest (Contest Engine Phase 3, Slice 3.1).
-- Phụ thuộc: migrations/20260828_add_user_quest_pool.sql (pool nhiệm vụ),
-- migrations/20260926_add_contest_engine_core.sql, migrations/20260926_add_contest_scores.sql
-- (bảng điểm cache cho "Viên ngọc ẩn"), migrations/20260926_add_reading_session_tracking.sql
-- (thời gian đọc thật). Định nghĩa LẠI reset_quest_pool_slot() (cùng chữ ký).
--
-- Xem docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md VIII.1 + XXII (K1–K4, K7):
--   - task_templates.quest_pool ('general' | 'contest') + contest_action. Mẫu
--     nhiệm vụ sự kiện là mẫu CHUNG theo hành động; cuộc thi của ngày nằm trên
--     ô pool (user_quest_pool.contest_id) → admin không phải tạo mẫu cho từng
--     cuộc thi. Mẫu seed ở cuối file có quest_type NULL: code cũ (lọc
--     quest_type not null) không bao giờ bốc chúng vào pool thường, kể cả khi
--     migration chạy trước khi deploy code.
--   - user_quest_pool.slot_kind ('general' | 'event'): DB bảo đảm tối đa 1 ô
--     sự kiện / người / ngày (unique một phần), kể cả khi nhiều cuộc thi mở.
--   - Ô sự kiện đổi riêng (K3: 1 lần/ngày — reroll_count), không trừ 3 lượt đổi
--     chung; reset_quest_pool_slot() từ chối ô sự kiện và mẫu sự kiện.
--   - record_contest_activity(): đường ghi tiến độ duy nhất cho nhiệm vụ sự
--     kiện — chỉ tính hành động trên bài hợp lệ của ĐÚNG cuộc thi trong ô hôm
--     nay, không phải tác giả của bài. Đọc = tới cuối chương VÀ thời gian đọc
--     thật đạt ngưỡng đọc thật (K7). Không nhiệm vụ nào chỉ định 1 bài (K1).
--     Passport (Slice 3.2) dùng lại cùng sự kiện.
--
-- Idempotent: add column if not exists, create or replace, on conflict do nothing.
-- Test: docs/supabase/tests/20260927_contest_quests.test.sql.

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
-- 2. Đổi nhiệm vụ thường: từ chối ô / mẫu sự kiện (định nghĩa lại, cùng chữ ký)
-- ---------------------------------------------------------------------
create or replace function public.reset_quest_pool_slot(
  p_user_id uuid,
  p_pool_date date,
  p_task_template_id uuid,
  p_replacement_template_id uuid,
  p_max_resets_per_day integer
) returns public.user_quest_pool as $$
declare
  v_pool_row public.user_quest_pool;
  v_resets_today integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_pool_date::text, 0));

  select * into v_pool_row
    from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date and task_template_id = p_task_template_id
    for update;
  if v_pool_row is null then
    raise exception 'Quest % not found in % pool for user %', p_task_template_id, p_pool_date, p_user_id;
  end if;

  -- Slice 3.1: ô sự kiện đổi qua reset_event_quest_slot(); nhiệm vụ thường chỉ đổi sang nhiệm vụ thường.
  if v_pool_row.slot_kind <> 'general' then
    raise exception 'Event quest slots are reset separately' using hint = 'event_slot';
  end if;
  if not exists (select 1 from public.task_templates where id = p_replacement_template_id and quest_pool = 'general') then
    raise exception 'Replacement must be a general quest' using hint = 'event_slot';
  end if;

  if p_task_template_id = p_replacement_template_id then
    raise exception 'Replacement quest must differ from the quest being reset';
  end if;

  if exists (
    select 1 from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date and task_template_id = p_replacement_template_id
  ) then
    raise exception 'Replacement quest is already in today''s pool';
  end if;

  if exists (
    select 1 from public.user_daily_tasks
    where user_id = p_user_id and template_id = p_task_template_id and task_date = p_pool_date and completed
  ) then
    raise exception 'Cannot reset a quest already completed today';
  end if;

  select count(*) into v_resets_today
    from public.quest_reset_events
    where user_id = p_user_id and quest_source = 'task_template' and created_at::date = p_pool_date;
  if v_resets_today >= p_max_resets_per_day then
    raise exception 'Daily reset limit (%) reached', p_max_resets_per_day;
  end if;

  update public.user_quest_pool
    set task_template_id = p_replacement_template_id
    where id = v_pool_row.id
    returning * into v_pool_row;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
    values (p_user_id, p_replacement_template_id, p_pool_date)
    on conflict (user_id, template_id, task_date) do nothing;

  insert into public.quest_reset_events (user_id, quest_id, quest_source, replaced_by_quest_id)
    values (p_user_id, p_task_template_id, 'task_template', p_replacement_template_id);

  update public.user_daily_tasks
    set reset_count = reset_count + 1
    where user_id = p_user_id and template_id = p_task_template_id and task_date = p_pool_date;

  return v_pool_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.reset_quest_pool_slot from public, anon, authenticated;
grant execute on function public.reset_quest_pool_slot to service_role;

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
  v_sub uuid;
  v_author uuid;
  v_words integer;
  v_active integer;
  v_need numeric;
  v_updated integer;
begin
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
    select public.contest_word_count(ch.content) into v_words
    from public.chapters ch
    where ch.id = p_chapter_id and ch.book_id = p_book_id and ch.published and ch.removed_at is null;
    if v_words is null then
      return false;
    end if;
    select coalesce(sum(rs.active_seconds), 0)::integer into v_active
    from public.reading_sessions rs where rs.user_id = p_user_id and rs.chapter_id = p_chapter_id;
    v_need := greatest(
      coalesce((v_contest.scoring_config ->> 'meaningful_read_min_seconds')::numeric, 30),
      ceil(coalesce((v_contest.scoring_config ->> 'meaningful_read_ratio')::numeric, 0.4) * v_words * 60.0
           / coalesce((v_contest.scoring_config ->> 'reading_words_per_minute')::numeric, 250)));
    if v_active < v_need then
      return false;
    end if;
    -- "Viên ngọc ẩn": cùng tiêu chí với get_contest_hidden_gem_pools (ít độc giả hợp lệ, hoặc ngoài top 10 lượt xem).
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

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: reset_quest_pool_slot sửa TẠI CHỖ; cột, hàm, mẫu seed thêm ở CUỐI file.
--   - src/lib/supabase/types.ts: cột task_templates / user_quest_pool, 4 hàm.
--   - src/lib/quests/quest-pool-service.ts (lọc quest_pool = 'general', ô sự kiện, đổi ô sự kiện),
--     /api/quests/pool + reset, daily-tasks-tab.tsx, src/lib/contests/activity-service.ts +
--     móc ở đọc hết chương, bình luận, danh sách đọc, bình chọn.
-- ---------------------------------------------------------------------
