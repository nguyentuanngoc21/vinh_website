-- Migration: user_quest_pool — cơ chế random pool hàng ngày (spec mục
-- 1.3), chốt qua trao đổi trực tiếp (không có trong bản phác spec gốc,
-- chỉ nói "3-5 quest/ngày, trọng số theo tier, reset 1-2 lần/ngày,
-- cooldown N ngày" — cần cụ thể hoá).
--
-- Khoảng trống thiết kế: task_templates/user_daily_tasks (phần 7,
-- migrations/20260827_extend_task_templates_for_quests.sql) là mô hình
-- LAZY-PULL (chỉ tạo dòng tiến trình khi user hành động, không có khái
-- niệm "hôm nay có đúng N quest cụ thể để làm"). Spec mục 1.3 cần mô
-- hình PUSH (chốt sẵn quest cho user, cho reset đổi). Cần bảng mới,
-- KHÔNG dùng chung user_daily_tasks cho việc "chốt pool" — bảng đó vẫn
-- giữ đúng vai trò cũ (track progress/completed/claimed).
--
-- Luật đã chốt (trao đổi trực tiếp, không phải spec gốc):
--   - Trọng số theo quest_type (KHÔNG theo user) — xem
--     src/lib/quests/config.ts QUEST_TYPE_WEIGHTS.
--   - Reset: NGÂN SÁCH CHUNG 3 lần/ngày cho toàn bộ pool (không phải mỗi
--     quest 3 lần riêng) — tính bằng COUNT(quest_reset_events) của user
--     trong ngày, KHÔNG thêm cột counter riêng (tránh lệch nguồn sự
--     thật). user_daily_tasks.reset_count (đã có từ migration khác) chỉ
--     là số đếm phụ cho UI, không dùng để enforce giới hạn.
--   - Cooldown 3 ngày: quest bị đổi ra LOẠI HẲN (không phải giảm %) khỏi
--     pool ngẫu nhiên trong 3 ngày kế — đơn giản hơn, dễ verify.
--   - Quest thay vào khi reset PHẢI CÙNG quest_type với quest bị thay ra
--     — nếu không, reset đúng slot "Discovery" có thể phá luôn ràng buộc
--     "tối thiểu 1 Discovery" của ngày đó.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.user_quest_pool (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pool_date date not null default current_date,
  task_template_id uuid not null references public.task_templates (id),
  -- 0-based, ỔN ĐỊNH qua reset — reset chỉ đổi task_template_id của
  -- đúng 1 dòng, không xáo lại vị trí các dòng khác trong ngày.
  slot_index integer not null check (slot_index >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, pool_date, slot_index),
  -- Không cho 2 slot cùng 1 quest trong 1 ngày (kể cả sau reset).
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

-- Không có policy insert/update cho "authenticated" — chốt pool và reset
-- đều phải đi qua 2 hàm dưới đây (service-role), không insert/update
-- trực tiếp từ client.

-- --- create_quest_pool_for_today: chốt pool hôm nay cho 1 user. ---
-- TS layer (QuestPoolService.generateTodayPool) đã tự tính xong danh
-- sách task_template_id nào được chọn (trọng số + cooldown + ràng buộc
-- tối thiểu discovery/engagement/khác) — hàm này chỉ ghi ATOMIC, không
-- tự chọn quest nào (logic chọn ngẫu nhiên hợp lý hơn ở TS, không ở SQL).
-- pg_advisory_xact_lock chống race 2 lời gọi đồng thời cùng user+ngày
-- (vd user bấm mở app 2 tab cùng lúc) tạo trùng/thừa pool.
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
    -- Đã có pool hôm nay (gọi lại, hoặc thắng race trước khi lock) —
    -- KHÔNG tạo thêm, trả về pool đã có để caller idempotent.
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

    -- Tạo sẵn dòng tiến trình ngay lúc chốt pool (khác task_templates cũ
    -- — lazy-create khi hành động đầu tiên) — để UI hiện được "0/N" ngay
    -- từ đầu, không cần chờ user làm gì mới có dòng.
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

-- --- reset_quest_pool_slot: đổi 1 quest trong pool hôm nay. ---
-- p_replacement_template_id do TS layer chọn sẵn (đã áp trọng số +
-- cooldown + CÙNG quest_type với quest bị thay ra, xem
-- QuestPoolService.resetQuestInPool) — hàm chỉ kiểm lại (defense in
-- depth, chống race) + ghi atomic, không tự chọn thay thế.
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

  if p_task_template_id = p_replacement_template_id then
    raise exception 'Replacement quest must differ from the quest being reset';
  end if;

  if exists (
    select 1 from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date and task_template_id = p_replacement_template_id
  ) then
    raise exception 'Replacement quest is already in today''s pool';
  end if;

  -- Không cho reset quest đã hoàn thành hôm nay — tránh xoá mất 1 lượt
  -- hoàn thành thật khỏi pool đang hiện.
  if exists (
    select 1 from public.user_daily_tasks
    where user_id = p_user_id and template_id = p_task_template_id and task_date = p_pool_date and completed
  ) then
    raise exception 'Cannot reset a quest already completed today';
  end if;

  -- Ngân sách reset CHUNG cho cả pool trong ngày — đếm trực tiếp
  -- quest_reset_events, không dùng cột counter riêng nào (nguồn sự thật
  -- duy nhất, tránh lệch giữa 2 nơi lưu).
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

  -- Số đếm phụ cho UI trên chính dòng vừa bị thay ra — KHÔNG dùng để
  -- enforce giới hạn (đã enforce bằng COUNT(quest_reset_events) ở trên).
  update public.user_daily_tasks
    set reset_count = reset_count + 1
    where user_id = p_user_id and template_id = p_task_template_id and task_date = p_pool_date;

  return v_pool_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.reset_quest_pool_slot from public, anon, authenticated;
grant execute on function public.reset_quest_pool_slot to service_role;

COMMIT;

-- Notes:
-- 1. p_max_resets_per_day truyền từ TS (src/lib/quests/config.ts
--    MAX_QUEST_RESETS_PER_DAY = 3) — KHÔNG hardcode trong SQL, giống
--    p_token_cost của rescue_streak_with_tokens (migrations/
--    20260827_add_streak_sync_functions.sql) — đổi số không cần migration.
-- 2. Cooldown 3 ngày (loại hẳn khỏi random, không giảm % dần) tính hoàn
--    toàn ở TS layer khi build danh sách ứng viên (query
--    quest_reset_events trong N ngày gần nhất) — không có logic cooldown
--    nào trong 2 hàm SQL này.
-- 3. Cả 2 hàm dùng pg_advisory_xact_lock khoá theo (user_id, pool_date) —
--    tự giải phóng cuối transaction, không cần unlock tay, không rủi ro
--    deadlock giữa 2 hàm (không hàm nào gọi hàm kia).
-- 4. Cập nhật docs/supabase/schema.sql (phần 10) + src/lib/supabase/types.ts.
