-- =======================================================================
-- Baseline 05 — Nhiệm vụ & thành tựu  (05_quests_and_achievements.sql)
-- =======================================================================
-- Phạm vi: Nhiệm vụ hàng ngày, Quest System (taxonomy, pool mẫu, nhiệm vụ
-- ẩn, reset, streak + mốc thưởng, cứu streak, quest pool ngày), hạ tầng
-- Python quest_generation_jobs, gate for_role, thành tựu.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     task_templates, user_daily_tasks, quest_examples_pool, hidden_quests,
--     user_hidden_quest_progress, quest_reset_events, streak_milestones,
--     user_streak_milestone_claims, user_quest_pool, quest_generation_jobs,
--     achievement_templates, user_achievements
--   Hàm:
--     increment_task_progress, set_task_progress, claim_daily_task,
--     complete_hidden_quest, enforce_quest_streak_authority,
--     claim_streak_milestone, sync_reading_streak,
--     rescue_streak_with_tokens, create_quest_pool_for_today,
--     reset_quest_pool_slot, sync_user_achievements
--   Thêm cột vào bảng của file trước:
--     profiles.{current_quest_streak, streak_updated_at,
--     streak_rest_days_banked, streak_at_risk_since}
--
-- Gộp từ migration (migrations/archive/):
--   20260827_add_hidden_quests.sql, 20260827_add_quest_examples_pool.sql,
--   20260827_add_quest_reset_events.sql,
--   20260827_add_quest_reward_transaction_type.sql,
--   20260827_add_quest_streak_to_profiles.sql,
--   20260827_add_streak_bonus_transaction_type.sql,
--   20260827_add_streak_milestones.sql,
--   20260827_add_streak_rescue_transaction_type.sql,
--   20260827_add_streak_sync_functions.sql,
--   20260827_extend_task_templates_for_quests.sql,
--   20260827_restrict_sensitive_rpc_execute_grants.sql,
--   20260828_add_quest_generation_jobs.sql,
--   20260828_add_user_quest_pool.sql,
--   20260908_add_achievement_bonus_transaction_type.sql,
--   20260908_add_achievements.sql,
--   20260908_add_task_template_role_gating.sql,
--   20260917_add_reading_event_log.sql,
--   20260918_add_streak_quests_and_time_windows.sql,
--   20260919_add_bookmark_and_tag_achievements.sql,
--   20260919_add_characters.sql,
--   20260919_add_reading_behavior_achievements.sql,
--   20260927_add_contest_quests.sql
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql, 03_reading.sql, 04_wallet_and_payments.sql
-- Tham chiếu tới file SAU chỉ nằm trong thân hàm plpgsql (bind lúc chạy,
-- không cần khi tạo): 07_design.sql, 08_audio.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 7. Nhiệm vụ hàng ngày
-- ---------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, -- vd 'read_3_chapters', dùng để logic app nhận diện
  title text not null,
  description text,
  target_count integer not null default 1,
  reward_tokens integer not null default 0,
  active boolean not null default true
);

alter table public.task_templates enable row level security;

-- Đây là định nghĩa nhiệm vụ (không phải dữ liệu riêng tư của ai), nên cho
-- mọi người đã đăng nhập đọc — cần thiết để hiện danh sách nhiệm vụ trong
-- app. Chỉ admin mới được thêm/sửa/xoá loại nhiệm vụ.
create policy "authenticated users can view active task templates"
  on public.task_templates for select
  to authenticated
  using (active);

create policy "admins manage task templates"
  on public.task_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.task_templates (id) on delete cascade,
  task_date date not null default current_date,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, template_id, task_date)
);

alter table public.user_daily_tasks enable row level security;

create policy "users view their own daily tasks"
  on public.user_daily_tasks for select
  using (auth.uid() = user_id);

-- Không cho user tự update completed/claimed trực tiếp — đi qua 2 hàm dưới.

-- Gọi khi user có hành động liên quan (đọc xong 1 chương, v.v.) — tự tạo
-- dòng nhiệm vụ hôm nay nếu chưa có (lazy-create, không cần chờ cron),
-- cộng dồn progress, tự đánh dấu completed khi đủ target_count.
create function public.increment_task_progress(p_user_id uuid, p_task_code text, p_amount integer default 1)
returns public.user_daily_tasks as $$
declare
  v_template public.task_templates;
  v_row public.user_daily_tasks;
begin
  select * into v_template from public.task_templates where code = p_task_code and active;
  if v_template is null then
    raise exception 'Unknown or inactive task code: %', p_task_code;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, current_date)
  on conflict (user_id, template_id, task_date) do nothing;

  update public.user_daily_tasks
    set progress = least(progress + p_amount, v_template.target_count),
        completed = (progress + p_amount) >= v_template.target_count
    where user_id = p_user_id and template_id = v_template.id and task_date = current_date
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- p_user_id trần — nếu gọi được trực tiếp, user tự ghi/hoàn thành tiến
-- trình nhiệm vụ hàng ngày của NGƯỜI KHÁC. Chỉ service_role gọi được. Xem
-- migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.increment_task_progress from public, anon, authenticated;
grant execute on function public.increment_task_progress to service_role;

-- Gọi khi "tiến trình" thật ra là 1 trạng thái ngoài (vd streak hiện tại),
-- không phải số lần hành động trong ngày — GHI ĐÈ progress thay vì cộng
-- dồn như increment_task_progress ở trên. An toàn overwrite trong cùng 1
-- ngày vì nguồn trạng thái (sync_reading_streak) không giảm giữa ngày. Xem
-- migrations/archive/20260918_add_streak_quests_and_time_windows.sql.
create function public.set_task_progress(p_user_id uuid, p_task_code text, p_progress integer)
returns public.user_daily_tasks as $$
declare
  v_template public.task_templates;
  v_row public.user_daily_tasks;
begin
  select * into v_template from public.task_templates where code = p_task_code and active;
  if v_template is null then
    raise exception 'Unknown or inactive task code: %', p_task_code;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, current_date)
  on conflict (user_id, template_id, task_date) do nothing;

  update public.user_daily_tasks
    set progress = least(greatest(p_progress, 0), v_template.target_count),
        completed = p_progress >= v_template.target_count
    where user_id = p_user_id and template_id = v_template.id and task_date = current_date
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.set_task_progress from public, anon, authenticated;
grant execute on function public.set_task_progress to service_role;

-- Gọi khi user bấm "nhận thưởng" trên UI — kiểm tra đã hoàn thành & chưa
-- nhận trước khi cộng token, tránh nhận thưởng 2 lần.
create function public.claim_daily_task(p_user_id uuid, p_task_id uuid)
returns public.transactions as $$
declare
  v_task public.user_daily_tasks;
  v_template public.task_templates;
begin
  select * into v_task from public.user_daily_tasks where id = p_task_id and user_id = p_user_id;
  if v_task is null then
    raise exception 'Task not found';
  end if;
  if not v_task.completed then
    raise exception 'Task not completed yet';
  end if;
  if v_task.claimed then
    raise exception 'Task already claimed';
  end if;

  select * into v_template from public.task_templates where id = v_task.template_id;

  update public.user_daily_tasks set claimed = true where id = p_task_id;

  return public.apply_transaction(p_user_id, 'daily_task_reward', v_template.reward_tokens, 'daily_task', p_task_id);
end;
$$ language plpgsql security definer;

-- p_user_id trần — mức hại thấp hơn các hàm khác ở trên (chỉ cho phép
-- ép claim thưởng CỦA NGƯỜI KHÁC, tiền vẫn về đúng người đó, không bị
-- cướp), nhưng vẫn không nên gọi trực tiếp từ client. Chỉ service_role
-- gọi được. Xem migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.claim_daily_task from public, anon, authenticated;
grant execute on function public.claim_daily_task to service_role;

-- Tuỳ chọn: nếu muốn nhiệm vụ được TẠO SẴN cho mọi user lúc 0h (thay vì
-- lazy-create ở lần hành động đầu tiên trong ngày — cách trên đã đủ dùng,
-- phần này chỉ cần nếu bạn muốn hiện danh sách nhiệm vụ "trống, chưa làm"
-- ngay khi user mở app buổi sáng mà chưa hành động gì):
--
-- select cron.schedule('generate-daily-tasks', '0 0 * * *', $$
--   insert into public.user_daily_tasks (user_id, template_id, task_date)
--   select p.id, t.id, current_date
--   from public.profiles p cross join public.task_templates t
--   where t.active
--   on conflict (user_id, template_id, task_date) do nothing;
-- $$);
--
-- Cần bật extension pg_cron trước (Database → Extensions trong Supabase
-- dashboard), và cân nhắc chi phí insert nếu số lượng user lớn.

-- ---------------------------------------------------------------------
-- 10. Hệ thống Nhiệm vụ Vịnh (Quest System)
-- ---------------------------------------------------------------------
-- Quest system KHÔNG tạo bảng system_quests/user_quest_progress riêng —
-- task_templates + user_daily_tasks (phần 7) đã làm đúng việc đó. Chỉ mở
-- rộng cặp bảng cũ + apply_transaction() (phần 6) làm đường ghi thưởng
-- duy nhất, KHÔNG có ledger riêng cho quest.

-- --- 10a. Mở rộng task_templates cho taxonomy quest. quest_type NULL =
-- nhiệm vụ hàng ngày cũ, không thuộc Quest System. Xem
-- migrations/archive/20260827_extend_task_templates_for_quests.sql. ---
alter table public.task_templates add column quest_type text;

alter table public.task_templates
  add constraint task_templates_quest_type_check
  check (quest_type is null or quest_type in (
    'discovery', 'engagement', 'lore_hunt', 'cross_compare', 'prediction', 'topup'
  ));

-- Vị trí neo trong chương — {chapter_id, paragraph_index, char_start,
-- char_end}. paragraph_index KHÔNG phải FK (chapters.content là 1 cột
-- text, không có bảng paragraph) — chỉ số tính phía client lúc render.
alter table public.task_templates add column chapter_ref jsonb;

alter table public.task_templates add column genre text;

alter table public.task_templates add column author_id uuid references auth.users (id);

alter table public.task_templates add column generated_by text not null default 'manual';

alter table public.task_templates add column quality_flag text;

alter table public.task_templates add column similarity_to_pool_score double precision;

alter table public.task_templates
  add constraint task_templates_similarity_score_check
  check (similarity_to_pool_score is null or similarity_to_pool_score between 0 and 1);

alter table public.task_templates add column auto_flag_reason text;

-- Track lượt reset — lịch sử chi tiết ở quest_reset_events (10e).
alter table public.user_daily_tasks add column reset_count integer not null default 0;

alter table public.user_daily_tasks
  add constraint user_daily_tasks_reset_count_check check (reset_count >= 0);

-- --- 10b. quest_examples_pool — pool mẫu thủ công, few-shot cho AI sinh
-- quest (Phase 2+). Bảng mới, không có tương đương cũ. Xem
-- migrations/archive/20260827_add_quest_examples_pool.sql. ---
create table public.quest_examples_pool (
  id uuid primary key default gen_random_uuid(),
  quest_type text not null check (quest_type in (
    'discovery', 'engagement', 'lore_hunt', 'cross_compare', 'prediction', 'topup'
  )),
  content text not null,
  genre text,
  -- 'good' | 'bad_counterexample' — pool phải có cả 2 loại cho mỗi
  -- (quest_type, genre), enforce ở quy trình soạn pool, không phải CHECK.
  example_quality text not null check (example_quality in ('good', 'bad_counterexample')),
  spoiler_risk text not null default 'low' check (spoiler_risk in ('low', 'medium', 'high')),
  version integer not null default 1,
  added_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index quest_examples_pool_type_genre_idx
  on public.quest_examples_pool (quest_type, genre);

alter table public.quest_examples_pool enable row level security;

-- Admin-only — Python service đọc qua service role, client không cần
-- SELECT trực tiếp.
create policy "admins manage quest examples pool"
  on public.quest_examples_pool for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- --- 10c. hidden_quests — nhiệm vụ ẩn theo campaign, KHÔNG nằm trong
-- random pool hàng ngày. reward_tokens là số CỐ ĐỊNH admin tự nhập lúc
-- soạn campaign — KHÔNG qua 1 bảng "reward_rules" chung, và KHÔNG cộng
-- streak bonus (streak bonus tách bạch hoàn toàn, xem 10i/10j). Kèm
-- user_hidden_quest_progress riêng (KHÔNG dùng chung user_daily_tasks —
-- campaign theo khoảng thời gian, không theo nhịp ngày). Xem
-- migrations/archive/20260827_add_hidden_quests.sql. ---
create table public.hidden_quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Điều kiện mở khoá tự định nghĩa theo campaign — kiểm ở tầng app, shape
  -- thay đổi theo từng campaign nên không CHECK cứng.
  unlock_condition jsonb not null,
  reward_tokens integer not null check (reward_tokens >= 0),
  campaign_name text not null,
  active_from timestamptz not null,
  active_to timestamptz not null check (active_to > active_from),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index hidden_quests_active_window_idx on public.hidden_quests (active_from, active_to);

alter table public.hidden_quests enable row level security;

-- Admin-only select — client chỉ biết hidden_quests đã mở khoá qua 1 API
-- route (service role, kiểm unlock_condition ở tầng app), không query
-- thẳng bảng gốc bằng anon key.
create policy "admins manage hidden quests"
  on public.hidden_quests for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_hidden_quest_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hidden_quest_id uuid not null references public.hidden_quests (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, hidden_quest_id)
);

alter table public.user_hidden_quest_progress enable row level security;

create policy "users view their own hidden quest progress"
  on public.user_hidden_quest_progress for select
  using (auth.uid() = user_id);

create policy "admins view all hidden quest progress"
  on public.user_hidden_quest_progress for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — hoàn thành phải đi
-- qua hàm dưới đây (reward engine tự kiểm unlock_condition ở tầng app
-- TRƯỚC khi gọi — hàm này không tự validate shape jsonb đó, chỉ đảm bảo
-- atomic + chống thưởng 2 lần).
create function public.complete_hidden_quest(p_user_id uuid, p_hidden_quest_id uuid)
returns public.transactions as $$
declare
  v_quest public.hidden_quests;
  v_txn public.transactions;
  v_row_id uuid;
begin
  select * into v_quest from public.hidden_quests where id = p_hidden_quest_id;
  if v_quest is null then
    raise exception 'Hidden quest not found';
  end if;

  if now() < v_quest.active_from or now() > v_quest.active_to then
    raise exception 'Hidden quest % is not currently active', p_hidden_quest_id;
  end if;

  insert into public.user_hidden_quest_progress (user_id, hidden_quest_id, status, completed_at)
  values (p_user_id, p_hidden_quest_id, 'completed', now())
  on conflict (user_id, hidden_quest_id) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    update public.user_hidden_quest_progress
      set status = 'completed', completed_at = now()
      where user_id = p_user_id and hidden_quest_id = p_hidden_quest_id and status <> 'completed'
      returning id into v_row_id;

    if v_row_id is null then
      raise exception 'Hidden quest already completed';
    end if;
  end if;

  v_txn := public.apply_transaction(p_user_id, 'quest_reward', v_quest.reward_tokens, 'quest', p_hidden_quest_id);
  return v_txn;
end;
$$ language plpgsql security definer;

-- p_user_id là tham số trần — chỉ service_role gọi được (xem lý do đầy
-- đủ ở 10k).
revoke execute on function public.complete_hidden_quest from public, anon, authenticated;
grant execute on function public.complete_hidden_quest to service_role;

-- --- 10d. quest_reset_events — lịch sử chi tiết reset (loại quest bị
-- reset, quest thay thế, tần suất theo user) — hành vi né tránh cũng là
-- dữ liệu cần track, không chỉ hành vi hoàn thành. Xem
-- migrations/archive/20260827_add_quest_reset_events.sql. ---
create table public.quest_reset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Polymorphic: task_templates.id hoặc hidden_quests.id, phân biệt qua
  -- quest_source. Không FK — cùng pattern purchase_transactions.chapter_id
  -- (phần 6e).
  quest_id uuid not null,
  quest_source text not null check (quest_source in ('task_template', 'hidden_quest')),
  replaced_by_quest_id uuid,
  created_at timestamptz not null default now()
);

create index quest_reset_events_user_id_idx on public.quest_reset_events (user_id, created_at);
create index quest_reset_events_quest_idx on public.quest_reset_events (quest_id, quest_source);

alter table public.quest_reset_events enable row level security;

create policy "users view their own quest reset events"
  on public.quest_reset_events for select
  using (auth.uid() = user_id);

create policy "admins view all quest reset events"
  on public.quest_reset_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- --- 10g. Thưởng quest — thêm loại giao dịch, KHÔNG có ledger riêng.
-- Reward engine (service layer) đọc trực tiếp task_templates.reward_tokens
-- (nhiệm vụ hàng ngày/rotate, mức cố định) hoặc hidden_quests.reward_tokens
-- (campaign, admin tự nhập) rồi gọi apply_transaction() — reference_type =
-- 'quest', reference_id = task_templates.id hoặc hidden_quests.id. KHÔNG
-- có bảng "reward_rules" chung — cả 2 nguồn đều tự giữ số token cố định
-- ngay trên bảng định nghĩa quest của mình, không tra qua bảng nào khác,
-- và KHÔNG cộng streak bonus (streak bonus tách bạch hoàn toàn, xem 10i).
-- Xem migrations/archive/20260827_add_quest_reward_transaction_type.sql. ---
alter type public.transaction_type add value if not exists 'quest_reward';

-- --- 10h. Streak — lưu sẵn trên profiles (đọc thường xuyên, ghi ít),
-- bảo vệ trigger giống role/cccd_verified (phần 5). Kèm 2 cột phục vụ
-- luật nghỉ/cứu streak (chốt qua trao đổi trực tiếp, không có trong bản
-- phác spec gốc) — chi tiết luật ở 10l. Xem
-- migrations/archive/20260827_add_quest_streak_to_profiles.sql. ---
alter table public.profiles add column current_quest_streak integer not null default 0;
alter table public.profiles add column streak_updated_at date;
-- Kho "thẻ nghỉ" tích lũy — xem công thức tích luỹ/trần ở sync_reading_streak() (10l).
alter table public.profiles add column streak_rest_days_banked integer not null default 0;
-- Mốc bắt đầu ân hạn khi lỡ 1 ngày và hết thẻ nghỉ — NULL = đang khoẻ mạnh.
alter table public.profiles add column streak_at_risk_since timestamptz;

alter table public.profiles
  add constraint profiles_current_quest_streak_check check (current_quest_streak >= 0);

alter table public.profiles
  add constraint profiles_streak_rest_days_banked_check check (streak_rest_days_banked >= 0);

create function public.enforce_quest_streak_authority()
returns trigger as $$
begin
  if new.current_quest_streak is distinct from old.current_quest_streak
     or new.streak_updated_at is distinct from old.streak_updated_at
     or new.streak_rest_days_banked is distinct from old.streak_rest_days_banked
     or new.streak_at_risk_since is distinct from old.streak_at_risk_since then
    if auth.uid() is not null and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    ) then
      raise exception 'streak columns can only be set by a trusted server context or an admin';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger enforce_quest_streak_authority
  before update on public.profiles
  for each row execute function public.enforce_quest_streak_authority();

-- --- 10i. streak_bonus — loại giao dịch riêng cho thưởng mốc streak,
-- TÁCH khỏi 'quest_reward' (10g) vì bản chất khác: không gắn với 1 quest
-- cụ thể nào, chỉ gắn với chuỗi ngày đọc liên tục. Xem
-- migrations/archive/20260827_add_streak_bonus_transaction_type.sql. ---
alter type public.transaction_type add value if not exists 'streak_bonus';

-- --- 10j. streak_milestones — mốc thưởng đọc-liên-tục kiểu Duolingo,
-- định nghĩa 1 lần (7/14/30/60 ngày...), thưởng CỐ ĐỊNH của riêng mốc đó
-- — KHÔNG liên quan/không cộng-nhân vào công thức thưởng của task_template
-- hay hidden_quest (10c, 10g). profiles.current_quest_streak (10h) chỉ
-- lưu số ngày hiện tại — bảng này định nghĩa CÁC MỐC, không lưu tiến
-- trình. Xem migrations/archive/20260827_add_streak_milestones.sql. ---
create table public.streak_milestones (
  id uuid primary key default gen_random_uuid(),
  streak_days integer not null unique check (streak_days > 0),
  reward_token integer not null check (reward_token >= 0),
  -- Chưa có bảng badges trong schema hiện tại — cột giữ chỗ, KHÔNG có FK
  -- ở đây. Thêm FK bằng 1 migration riêng sau khi bảng badges tồn tại.
  badge_id uuid,
  created_at timestamptz not null default now()
);

alter table public.streak_milestones enable row level security;

create policy "authenticated users can view streak milestones"
  on public.streak_milestones for select
  to authenticated
  using (true);

create policy "admins manage streak milestones"
  on public.streak_milestones for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Chống nhận thưởng 1 mốc nhiều lần — current_quest_streak chỉ là 1 số
-- hiện tại (có thể tụt về 0 rồi lên lại), không tự nói mốc nào đã thưởng.
create table public.user_streak_milestone_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  streak_milestone_id uuid not null references public.streak_milestones (id),
  transaction_id uuid not null references public.transactions (id),
  claimed_at timestamptz not null default now(),
  unique (user_id, streak_milestone_id)
);

alter table public.user_streak_milestone_claims enable row level security;

create policy "users view their own streak milestone claims"
  on public.user_streak_milestone_claims for select
  using (auth.uid() = user_id);

create policy "admins view all streak milestone claims"
  on public.user_streak_milestone_claims for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Duy nhất đường ghi — kiểm streak hiện tại đã tới mốc chưa, kiểm chưa
-- claim mốc này lần nào, rồi gọi apply_transaction() giống mọi đường
-- thưởng khác — không có ledger riêng.
create function public.claim_streak_milestone(p_user_id uuid, p_streak_milestone_id uuid)
returns public.transactions as $$
declare
  v_milestone public.streak_milestones;
  v_current_streak integer;
  v_txn public.transactions;
begin
  select * into v_milestone from public.streak_milestones where id = p_streak_milestone_id;
  if v_milestone is null then
    raise exception 'Streak milestone not found';
  end if;

  select current_quest_streak into v_current_streak from public.profiles where id = p_user_id;
  if v_current_streak is null or v_current_streak < v_milestone.streak_days then
    raise exception 'User % has not reached streak_days %', p_user_id, v_milestone.streak_days;
  end if;

  if exists (
    select 1 from public.user_streak_milestone_claims
    where user_id = p_user_id and streak_milestone_id = p_streak_milestone_id
  ) then
    raise exception 'Streak milestone already claimed';
  end if;

  v_txn := public.apply_transaction(
    p_user_id, 'streak_bonus', v_milestone.reward_token,
    'streak_milestone', p_streak_milestone_id
  );

  insert into public.user_streak_milestone_claims (user_id, streak_milestone_id, transaction_id)
  values (p_user_id, p_streak_milestone_id, v_txn.id);

  return v_txn;
end;
$$ language plpgsql security definer;

-- p_user_id là tham số trần — chỉ service_role gọi được (xem lý do đầy
-- đủ ở 10l).
revoke execute on function public.claim_streak_milestone from public, anon, authenticated;
grant execute on function public.claim_streak_milestone to service_role;

-- --- 10k. streak_rescue — loại giao dịch TRỪ token khi user trả token
-- cứu streak (rescue_streak_with_tokens(), 10l) — tách khỏi 'streak_bonus'
-- (10i, khoản CỘNG) để báo cáo/đối soát đọc trực quan hơn, giống
-- purchase_chapter/purchase_credit. Xem
-- migrations/archive/20260827_add_streak_rescue_transaction_type.sql. ---
alter type public.transaction_type add value if not exists 'streak_rescue';

-- --- 10l. sync_reading_streak() + rescue_streak_with_tokens() — state
-- machine đầy đủ cho streak, chốt qua trao đổi trực tiếp:
--   - Kho thẻ nghỉ (streak_rest_days_banked, 10h): +1 thẻ mỗi 7 ngày
--     streak liên tục, TRẦN = min(31, 1 + floor(streak_days / 100)) —
--     trần tăng theo mốc streak (100 ngày -> trần 2, ..., 3000 ngày ->
--     trần tối đa 31). "31 ngày nghỉ" là TRẦN CỦA KHO, không phải
--     quota/tuần.
--   - Lỡ ĐÚNG 1 ngày: có thẻ -> tự trừ 1, streak KHÔNG tăng cho ngày đó
--     (giống streak freeze — "vô hình") nhưng KHÔNG reset. Hết thẻ ->
--     "at risk" (streak_at_risk_since), ĐÓNG BĂNG streak, chờ trả token
--     cứu trong 48h — hết hạn không cứu thì reset thật.
--   - Lỡ ≥ 2 ngày liên tiếp mà kho không đủ bù hết: KHÔNG có cứu (rescue
--     chỉ áp dụng lỡ đúng 1 ngày) — reset ngay, không ân hạn.
-- Xem migrations/archive/20260827_add_streak_sync_functions.sql. ---
create function public.sync_reading_streak(p_user_id uuid, p_activity_date date default current_date)
returns public.profiles as $$
declare
  v_profile public.profiles;
  v_gap integer;
  v_needed integer;
  v_cap integer;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then
    raise exception 'User % not found', p_user_id;
  end if;

  if v_profile.streak_updated_at is null then
    update public.profiles set
      current_quest_streak = 1, streak_updated_at = p_activity_date,
      streak_rest_days_banked = 0, streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  -- Event trễ/trùng với ngày CŨ HƠN ngày đã ghi nhận — no-op, không lùi
  -- lại tính lại (tránh undo tiến trình do retry/lệch giờ client).
  if p_activity_date < v_profile.streak_updated_at then
    return v_profile;
  end if;

  v_gap := p_activity_date - v_profile.streak_updated_at;

  if v_gap = 0 then
    if v_profile.streak_at_risk_since is not null then
      update public.profiles set streak_at_risk_since = null where id = p_user_id returning * into v_profile;
    end if;
    return v_profile;
  end if;

  if v_gap = 1 then
    v_profile.current_quest_streak := v_profile.current_quest_streak + 1;
    v_cap := least(31, 1 + (v_profile.current_quest_streak / 100));
    if v_profile.current_quest_streak % 7 = 0 then
      v_profile.streak_rest_days_banked := least(v_cap, v_profile.streak_rest_days_banked + 1);
    end if;
    update public.profiles set
      current_quest_streak = v_profile.current_quest_streak, streak_updated_at = p_activity_date,
      streak_rest_days_banked = v_profile.streak_rest_days_banked, streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  v_needed := v_gap - 1;

  if v_profile.streak_rest_days_banked >= v_needed then
    update public.profiles set
      current_quest_streak = current_quest_streak + 1,
      streak_rest_days_banked = streak_rest_days_banked - v_needed,
      streak_updated_at = p_activity_date, streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  if v_needed = 1 then
    if v_profile.streak_at_risk_since is null then
      update public.profiles set streak_at_risk_since = now() where id = p_user_id returning * into v_profile;
    end if;
    return v_profile;
  end if;

  update public.profiles set
    current_quest_streak = 1, streak_updated_at = p_activity_date,
    streak_rest_days_banked = 0, streak_at_risk_since = null
  where id = p_user_id
  returning * into v_profile;
  return v_profile;
end;
$$ language plpgsql security definer;

revoke execute on function public.sync_reading_streak from public, anon, authenticated;
grant execute on function public.sync_reading_streak to service_role;

-- p_token_cost do caller (TS, src/lib/quests/config.ts) truyền vào —
-- KHÔNG hardcode số ở đây, giống create_withdrawal_request() nhận
-- p_amount_vnd đã tính sẵn từ tokensToVnd() thay vì tự tính lại trong SQL.
create function public.rescue_streak_with_tokens(p_user_id uuid, p_token_cost integer)
returns public.profiles as $$
declare
  v_profile public.profiles;
begin
  if p_token_cost <= 0 then
    raise exception 'p_token_cost must be positive, got %', p_token_cost;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then
    raise exception 'User % not found', p_user_id;
  end if;

  if v_profile.streak_at_risk_since is null then
    raise exception 'Streak is not at risk — nothing to rescue';
  end if;

  if now() > v_profile.streak_at_risk_since + interval '48 hours' then
    update public.profiles set
      current_quest_streak = 0, streak_rest_days_banked = 0,
      streak_at_risk_since = null, streak_updated_at = null
    where id = p_user_id;
    raise exception 'Grace period expired — streak already reset';
  end if;

  perform public.apply_transaction(p_user_id, 'streak_rescue', -p_token_cost, 'streak_rescue', null);

  update public.profiles set
    streak_updated_at = current_date - 1, streak_at_risk_since = null
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$ language plpgsql security definer;

revoke execute on function public.rescue_streak_with_tokens from public, anon, authenticated;
grant execute on function public.rescue_streak_with_tokens to service_role;

-- "Không giới hạn số lần rescue" là quyết định chủ động (đã hỏi lại) —
-- hệ quả: current_quest_streak KHÔNG còn phản ánh hành vi đọc thật 100%
-- nếu user đủ token trả liên tục. Dùng streak cho chân dung độc giả thì
-- cân nhắc lọc riêng theo transactions.type = 'streak_rescue'.
--
-- 2 lỗ hổng phát hiện lúc soát schema cho Quest System (ngoài phạm vi
-- quest, đã VÁ và verify trên cả staging + production):
--   1. User tự PATCH token_balance/screenshot_penalty_*/... qua REST API
--      bằng anon key — vá ở phần 1 (revoke update on public.profiles) —
--      xem migrations/archive/20260827_restrict_profiles_column_grants.sql.
--   2. Các hàm reward cũ (apply_transaction, claim_daily_task,
--      create_withdrawal_request, grant_platform_bonus, settle_*,
--      increment_task_progress) không có REVOKE EXECUTE FROM PUBLIC
--      tường minh — Postgres mặc định cấp PUBLIC execute khi tạo hàm
--      mới, cho phép gọi thẳng RPC bằng anon key, tự chọn p_user_id là
--      người khác — vá ở đúng vị trí định nghĩa mỗi hàm (phần 6/6b/6c/
--      6d/6e/7 ở trên) — xem
--      migrations/archive/20260827_restrict_sensitive_rpc_execute_grants.sql.
--      Đi kèm: apply_transaction từng có 3 overload cùng tồn tại (mỗi
--      lần CREATE OR REPLACE đổi chữ ký lại tạo thêm bản mới, không ghi
--      đè được bản cũ) — dọn về đúng 1 bản, xem
--      migrations/archive/20260827_drop_stale_apply_transaction_overloads.sql.

-- ---------------------------------------------------------------------
-- 10m. user_quest_pool — random pool hàng ngày (mục 1.3), chốt qua trao
-- đổi trực tiếp (không có trong bản phác spec gốc). Khoảng trống thiết
-- kế: task_templates/user_daily_tasks (phần 7) là mô hình LAZY-PULL,
-- spec mục 1.3 cần mô hình PUSH (chốt sẵn N quest/ngày, cho reset đổi) —
-- cần bảng mới, KHÔNG dùng chung user_daily_tasks (vẫn giữ vai trò track
-- progress cũ). Xem migrations/archive/20260828_add_user_quest_pool.sql.
-- ---------------------------------------------------------------------
create table public.user_quest_pool (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pool_date date not null default current_date,
  task_template_id uuid not null references public.task_templates (id),
  -- 0-based, ổn định qua reset — reset chỉ đổi task_template_id của
  -- đúng 1 dòng, không xáo lại vị trí các dòng khác trong ngày.
  slot_index integer not null check (slot_index >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, pool_date, slot_index),
  unique (user_id, pool_date, task_template_id)
);

create index user_quest_pool_user_date_idx on public.user_quest_pool (user_id, pool_date);

alter table public.user_quest_pool enable row level security;

create policy "users view their own quest pool"
  on public.user_quest_pool for select
  using (auth.uid() = user_id);

create policy "admins view all quest pools"
  on public.user_quest_pool for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Chốt pool hôm nay — TS layer (QuestPoolService.generateTodayPool) tự
-- tính danh sách task_template_id (trọng số theo quest_type + cooldown +
-- ràng buộc tối thiểu discovery/engagement/khác), hàm này chỉ ghi ATOMIC.
-- pg_advisory_xact_lock chống race 2 lời gọi đồng thời cùng user+ngày.
create function public.create_quest_pool_for_today(
  p_user_id uuid,
  p_pool_date date,
  p_task_template_ids uuid[]
) returns setof public.user_quest_pool as $$
declare
  v_existing_count integer;
  v_id uuid;
  v_idx integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_pool_date::text, 0));

  select count(*) into v_existing_count
    from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date;

  if v_existing_count > 0 then
    return query
      select * from public.user_quest_pool
      where user_id = p_user_id and pool_date = p_pool_date
      order by slot_index;
    return;
  end if;

  if p_task_template_ids is null or array_length(p_task_template_ids, 1) is null then
    raise exception 'p_task_template_ids must not be empty';
  end if;

  foreach v_id in array p_task_template_ids loop
    insert into public.user_quest_pool (user_id, pool_date, task_template_id, slot_index)
    values (p_user_id, p_pool_date, v_id, v_idx);

    insert into public.user_daily_tasks (user_id, template_id, task_date)
      values (p_user_id, v_id, p_pool_date)
      on conflict (user_id, template_id, task_date) do nothing;

    v_idx := v_idx + 1;
  end loop;

  return query
    select * from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date
    order by slot_index;
end;
$$ language plpgsql security definer;

revoke execute on function public.create_quest_pool_for_today from public, anon, authenticated;
grant execute on function public.create_quest_pool_for_today to service_role;

-- Đổi 1 quest trong pool hôm nay — p_replacement_template_id do TS layer
-- chọn sẵn (CÙNG quest_type với quest bị thay ra — bắt buộc, không thì
-- reset có thể phá ràng buộc tối thiểu discovery/engagement/khác của
-- ngày đó). Ngân sách reset CHUNG 3 lần/ngày cho cả pool (không phải mỗi
-- quest riêng) — đếm trực tiếp quest_reset_events, không cột counter
-- riêng nào (tránh lệch nguồn sự thật).
-- Slice 3.1 (migrations/archive/20260927_add_contest_quests.sql): từ chối ô / mẫu sự kiện.
create function public.reset_quest_pool_slot(
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
-- 11. Hạ tầng Python — quest_generation_jobs (Phase 2, xem prompt triển
-- khai Quest System, mục "Hạ tầng Python server"). Postgres table làm
-- queue (poll định kỳ), KHÔNG dùng Redis/RabbitMQ — đúng khuyến nghị
-- "đơn giản, không cần thêm hạ tầng ở giai đoạn này". Chưa wire route
-- publish chương của Next.js tự insert job (quyết định chủ động, test
-- tay trước) — xem python-service/. Xem
-- migrations/archive/20260828_add_quest_generation_jobs.sql.
-- ---------------------------------------------------------------------
create table public.quest_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quest_generation_jobs_poll_idx
  on public.quest_generation_jobs (created_at)
  where status = 'queued';

alter table public.quest_generation_jobs enable row level security;

create policy "admins view quest generation jobs"
  on public.quest_generation_jobs for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — bảng hoàn toàn nội
-- bộ, chỉ Python worker (service role key RIÊNG, không dùng chung anon
-- key với frontend) và (sau này) route publish chương viết.


-- --- Gate nhiệm vụ ngày theo "for_role" (tác giả/người thu âm/thiết kế) —
-- NULL = áp dụng chung (mặc định đọc giả), cùng convention với quest_type
-- NULL. Unlock role tính bằng EXISTS trên books/audio_narrations/
-- design_items (src/lib/quests/creator-roles.ts), KHÔNG cache trên
-- profiles — hệ thống không xoá hàng thật nên EXISTS đã tự vĩnh viễn.
-- KHÔNG dùng profiles.creator_tags (tự khai, chưa có UI set, không mang
-- quyền hạn theo thiết kế gốc — xem phần 1). Xem
-- migrations/archive/20260908_add_task_template_role_gating.sql. ---
alter table public.task_templates add column for_role text;

alter table public.task_templates
  add constraint task_templates_for_role_check
  check (for_role is null or for_role in ('author', 'narrator', 'designer'));

-- --- Hệ thống Thành tựu (Achievements) — 1 khung chung cho mọi role, lọc +
-- tô màu theo for_role ở UI (NULL = chung/đọc giả, cùng convention
-- task_templates.for_role). Ghép nối với streak_milestones.badge_id
-- (placeholder từ migrations/archive/20260827_add_streak_milestones.sql) — mốc
-- streak dùng 1 hàng ở đây (metric NULL) chỉ để cấp metadata hiển thị,
-- unlock/claim streak vẫn qua claim_streak_milestone(), KHÔNG đổi. Chỉ 3
-- role sản phẩm dùng metric+threshold+sync_user_achievements(). Xem
-- migrations/archive/20260908_add_achievement_bonus_transaction_type.sql +
-- migrations/archive/20260908_add_achievements.sql. ---
alter type public.transaction_type add value if not exists 'achievement_bonus';

create table public.achievement_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  for_role text,
  title text not null,
  description text,
  icon text,
  color_token text not null,
  metric text,
  threshold integer,
  reward_tokens integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint achievement_templates_for_role_check
    check (for_role is null or for_role in ('author', 'narrator', 'designer')),
  constraint achievement_templates_metric_check
    check (metric is null or metric in (
      'books_published', 'audio_published', 'design_published',
      'chapters_read', 'genres_read_count', 'night_reads_count',
      'finished_stories_count', 'longest_consecutive_chapters',
      'distinct_reading_days_count', 'max_reading_sessions_per_day',
      'max_gap_days_same_book', 'weekend_both_days_read',
      'max_books_read_same_genre', 'max_genres_within_15_days', 'topup_count',
      'sad_ending_finished_count', 'underrated_finished_count',
      'bookmarked_books_count', 'max_bookmarked_books_same_genre',
      'saved_highlights_count',
      'villain_followed_count', 'hero_followed_count', 'character_guardian_achieved'
    )),
  constraint achievement_templates_metric_threshold_check
    check ((metric is null) = (threshold is null)),
  constraint achievement_templates_threshold_check check (threshold is null or threshold > 0),
  constraint achievement_templates_reward_tokens_check check (reward_tokens >= 0)
);

alter table public.achievement_templates enable row level security;

create policy "authenticated users can view active achievement templates"
  on public.achievement_templates for select
  to authenticated
  using (active);

create policy "admins manage achievement templates"
  on public.achievement_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievement_templates (id) on delete cascade,
  transaction_id uuid references public.transactions (id),
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;

create policy "users view their own achievements"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "admins view all user achievements"
  on public.user_achievements for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index user_achievements_user_idx on public.user_achievements (user_id);

alter table public.streak_milestones
  add constraint streak_milestones_badge_id_fkey
  foreign key (badge_id) references public.achievement_templates (id);

create function public.sync_user_achievements(p_user_id uuid)
returns setof public.user_achievements as $$
declare
  v_template public.achievement_templates;
  v_count integer;
  v_txn public.transactions;
  v_row public.user_achievements;
begin
  for v_template in
    select * from public.achievement_templates
    where active and metric is not null
      and id not in (
        select achievement_id from public.user_achievements where user_id = p_user_id
      )
  loop
    v_count := case v_template.metric
      when 'books_published' then
        (select count(*) from public.books where author_id = p_user_id and published)
      when 'audio_published' then
        (select count(*) from public.audio_narrations where narrator_id = p_user_id)
      when 'design_published' then
        (select count(*) from public.design_items where illustrator_id = p_user_id)
      when 'chapters_read' then
        (select count(distinct chapter_id) from public.reading_history
           where user_id = p_user_id and chapter_id is not null)
      when 'genres_read_count' then
        (select count(distinct b.genre) from public.reading_history rh
           join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and b.genre is not null)
      when 'night_reads_count' then
        -- Giờ server/UTC thống nhất, không theo timezone từng user — cùng
        -- quyết định đã có cho ranh giới "1 ngày" của quest pool.
        (select count(*) from public.reading_history
           where user_id = p_user_id
             and (extract(hour from timezone('utc', read_at)) >= 22
                  or extract(hour from timezone('utc', read_at)) < 2))
      when 'finished_stories_count' then
        (select count(distinct rh.book_id) from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           where rh.user_id = p_user_id and c.is_last_chapter = true)
      when 'longest_consecutive_chapters' then
        (with read_chapters as (
           select distinct c.book_id, c.order_index
           from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           where rh.user_id = p_user_id
         ), grp as (
           select book_id, order_index - row_number() over (partition by book_id order by order_index) as g
           from read_chapters
         )
         select coalesce(max(run_length), 0) from (
           select book_id, g, count(*) as run_length from grp group by book_id, g
         ) runs)
      when 'distinct_reading_days_count' then
        (select count(distinct read_at::date) from public.reading_history where user_id = p_user_id)
      when 'max_reading_sessions_per_day' then
        (with events as (
           select read_at::date as d, read_at,
                  read_at - lag(read_at) over (partition by read_at::date order by read_at) as gap
           from public.reading_history where user_id = p_user_id
         )
         select coalesce(max(session_count), 0) from (
           select d, count(*) filter (where gap is null or gap > interval '30 minutes') as session_count
           from events group by d
         ) s)
      when 'max_gap_days_same_book' then
        (with book_events as (
           select book_id, read_at - lag(read_at) over (partition by book_id order by read_at) as gap
           from public.reading_history where user_id = p_user_id
         )
         select coalesce(max(extract(day from gap)::integer), 0) from book_events)
      when 'weekend_both_days_read' then
        (select case when
           exists(select 1 from public.reading_history where user_id = p_user_id and extract(dow from read_at) = 6)
           and exists(select 1 from public.reading_history where user_id = p_user_id and extract(dow from read_at) = 0)
         then 1 else 0 end)
      when 'max_books_read_same_genre' then
        (select coalesce(max(cnt), 0) from (
           select b.genre, count(distinct rh.book_id) as cnt
           from public.reading_history rh join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and b.genre is not null
           group by b.genre
         ) t)
      when 'max_genres_within_15_days' then
        (with first_genre_read as (
           select b.genre, min(rh.read_at) as first_read
           from public.reading_history rh join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and b.genre is not null
           group by b.genre
         )
         select coalesce(max(cnt), 0) from (
           select o1.genre, count(*) as cnt
           from first_genre_read o1
           join first_genre_read o2 on o2.first_read between o1.first_read and o1.first_read + interval '15 days'
           group by o1.genre
         ) t)
      when 'topup_count' then
        (select count(*) from public.transactions
           where user_id = p_user_id and type = 'topup' and status <> 'reversed')
      when 'sad_ending_finished_count' then
        (select count(distinct rh.book_id) from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and c.is_last_chapter = true
             and exists (select 1 from unnest(b.tags) tg where lower(trim(tg)) = 'kết buồn'))
      when 'underrated_finished_count' then
        (select count(distinct rh.book_id) from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and c.is_last_chapter = true and b.view_count < 50)
      when 'bookmarked_books_count' then
        (select count(distinct rli.book_id) from public.reading_list_items rli
           join public.reading_lists rl on rl.id = rli.list_id
           where rl.user_id = p_user_id)
      when 'max_bookmarked_books_same_genre' then
        (select coalesce(max(cnt), 0) from (
           select b.genre, count(distinct rli.book_id) as cnt
           from public.reading_list_items rli
           join public.reading_lists rl on rl.id = rli.list_id
           join public.books b on b.id = rli.book_id
           where rl.user_id = p_user_id and b.genre is not null
           group by b.genre
         ) t)
      when 'saved_highlights_count' then
        (select count(*) from public.highlights where user_id = p_user_id)
      when 'villain_followed_count' then
        (select count(*) from public.character_follows cf
           join public.characters ch on ch.id = cf.character_id
           where cf.follower_id = p_user_id and ch.role = 'villain')
      when 'hero_followed_count' then
        (select count(*) from public.character_follows cf
           join public.characters ch on ch.id = cf.character_id
           where cf.follower_id = p_user_id and ch.role = 'hero')
      when 'character_guardian_achieved' then
        (select case when exists (
           select 1 from public.character_follows cf
           where cf.follower_id = p_user_id
             and not exists (
               select 1 from public.chapter_characters cc
               join public.chapters c on c.id = cc.chapter_id
               where cc.character_id = cf.character_id and c.published
                 and not exists (
                   select 1 from public.reading_history rh
                   where rh.user_id = p_user_id and rh.chapter_id = c.id
                 )
             )
             and exists (
               select 1 from public.chapter_characters cc
               join public.chapters c on c.id = cc.chapter_id
               where cc.character_id = cf.character_id and c.published
             )
         ) then 1 else 0 end)
      else 0
    end;

    if v_count >= v_template.threshold then
      v_txn := null;
      if v_template.reward_tokens > 0 then
        v_txn := public.apply_transaction(
          p_user_id, 'achievement_bonus', v_template.reward_tokens,
          'achievement', v_template.id
        );
      end if;

      insert into public.user_achievements (user_id, achievement_id, transaction_id)
      values (p_user_id, v_template.id, v_txn.id)
      returning * into v_row;

      return next v_row;
    end if;
  end loop;

  return;
end;
$$ language plpgsql security definer;

revoke execute on function public.sync_user_achievements from public, anon, authenticated;
grant execute on function public.sync_user_achievements to service_role;
