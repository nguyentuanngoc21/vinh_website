-- Migration: Contest Passport (Contest Engine Phase 3, Slice 3.2).
-- Phụ thuộc migrations/20260927_add_contest_quests.sql (chạy trước) và định
-- nghĩa LẠI record_contest_activity() của migration đó (cùng chữ ký).
--
-- Xem docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md VIII.2 + XXII (K5, K6, K7):
--   - 7 cột mốc / cuộc thi, không reset hằng ngày, chỉ trong mùa thi
--     (submission_open → judging). Định nghĩa + mục tiêu nằm DUY NHẤT ở
--     contest_passport_state(); TS chỉ giữ nhãn hiển thị.
--       read_entry     đọc thật 1 chương của ≥ 1 bài dự thi
--       read_3_authors đọc bài của ≥ 3 tác giả khác nhau
--       finish_entry   đọc hết mọi chương đang hiển thị của 1 bài
--       hidden_gem     đọc 1 bài đang là "Viên ngọc ẩn" (cùng tiêu chí hàng khám phá)
--       comment_entry  bình luận ở 1 bài dự thi
--       vote_3         đang có phiếu cho ≥ 3 bài (rút phiếu → tự trừ)
--       return_3_days  đọc thật ở ≥ 3 ngày khác nhau (giờ Việt Nam)
--   - Đọc = tới cuối chương VÀ đạt ngưỡng đọc thật (K7) → ghi
--     contest_passport_reads (idempotent: 1 dòng / người × cuộc thi × chương × ngày).
--     Bình luận / phiếu đếm thẳng từ dữ liệu thật.
--   - Đủ 7 mốc → contest_passports.completed_at: huy hiệu "Người đi hết mùa
--     thi" của cuộc thi đó (K6: chỉ huy hiệu, không token). Đã đạt thì giữ.
--   - record_contest_activity() ghi Passport cho MỌI cuộc thi đang có bài đó
--     (không phụ thuộc ô nhiệm vụ hôm nay), rồi ghi nhiệm vụ sự kiện như 3.1.
--
-- Idempotent: if not exists, create or replace.
-- Test: docs/supabase/tests/20260927_contest_passport.test.sql.

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

-- Định nghĩa lại (cùng chữ ký — Slice 3.1): Passport cho mọi cuộc thi đang có bài, rồi nhiệm vụ sự kiện.
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
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: record_contest_activity SỬA TẠI CHỖ (khối Slice 3.1);
--     2 bảng + contest_passport_state thêm ở CUỐI file.
--   - src/lib/supabase/types.ts: 2 bảng, 1 hàm.
--   - src/lib/contests/passport-service.ts, microsite "Hành trình của bạn" +
--     "Nhiệm vụ sự kiện", hub /cuoc-thi.
-- ---------------------------------------------------------------------
