-- Migration: hidden_quests — nhiệm vụ ẩn, admin tự soạn theo mùa/campaign,
-- KHÔNG nằm trong random pool hàng ngày (task_templates/user_daily_tasks).
--
-- Bảng MỚI hoàn toàn — không có tương đương cũ để mở rộng, khác quyết
-- định gộp system_quests vào task_templates (xem
-- migrations/20260827_extend_task_templates_for_quests.sql).
--
-- Kèm user_hidden_quest_progress: hidden_quests là campaign theo khoảng
-- thời gian (active_from/active_to có thể kéo dài nhiều ngày/tuần), KHÔNG
-- theo nhịp ngày như user_daily_tasks (task_date + unique theo ngày) — vì
-- vậy KHÔNG dùng chung user_daily_tasks cho hidden_quests dù cả 2 đều là
-- "tiến trình quest của user". Cần bảng tiến trình riêng, đơn giản hơn
-- (không có progress/target_count đếm dần như daily task — unlock_condition
-- tự quyết có mở khoá hay chưa, tầng app kiểm tra rồi mới cho hoàn thành).
--
-- reward_tokens là số CỐ ĐỊNH do admin tự nhập khi soạn campaign, KHÔNG
-- qua bảng reward_rules chung (bản trước của migration này có
-- reward_rule_id — bỏ, xem lại quyết định dưới) và KHÔNG cộng streak
-- bonus — 2 việc tách bạch: streak bonus là thưởng RIÊNG cho việc đọc
-- liên tục N ngày (streak_milestones, xem
-- migrations/20260827_add_streak_milestones.sql), không phải multiplier
-- nhân vào bất kỳ quest nào. hidden_quest cũng không rotate/dùng chung
-- công thức với quest_type nào để cần tra theo nhóm — mỗi campaign tự có
-- 1 số token riêng, admin gõ tay lúc tạo, y hệt cách task_templates.reward_tokens
-- đã làm từ trước.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.hidden_quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Điều kiện mở khoá tự định nghĩa theo campaign (vd {"type": "read_streak",
  -- "days": 7} hay {"type": "book_completed", "book_id": "..."}) — kiểm
  -- tra ở tầng app khi user mở trang quest, KHÔNG có CHECK/trigger DB nào
  -- validate shape của jsonb này (shape thay đổi theo từng campaign, ép
  -- schema cứng ở DB sẽ phải ALTER liên tục).
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

-- Admin-only select — CỐ Ý không có policy cho user thường xem thẳng
-- bảng gốc. Client chỉ nhận biết hidden_quests đã mở khoá qua 1 API route
-- (service role, kiểm unlock_condition ở tầng app), tránh lộ toàn bộ
-- campaign sắp tới (title, điều kiện mở khoá, mốc thời gian) cho ai tò mò
-- query thẳng qua REST API bằng anon key.
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

-- Không có policy insert/update cho "authenticated" — giống user_daily_tasks,
-- ghi dòng completed phải đi qua hàm dưới đây, không phải UPDATE trực
-- tiếp từ client.

-- Hoàn thành 1 hidden quest — idempotent + atomic. KHÔNG tự kiểm
-- unlock_condition (shape jsonb tuỳ campaign, không hợp để validate
-- trong SQL) — caller (reward engine, src/lib/quests/reward-engine.ts)
-- PHẢI tự kiểm điều kiện mở khoá đạt hay chưa TRƯỚC khi gọi hàm này; hàm
-- chỉ đảm bảo 2 việc: không hoàn thành 2 lần, và ghi nhận + trả thưởng
-- trong đúng 1 transaction.
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

  -- Dòng tiến trình có thể đã tồn tại ở 'in_progress' từ trước (route
  -- khác insert lúc user mở trang campaign) — thử insert mới trước,
  -- không trúng conflict thì user chưa từng có dòng nào; trúng conflict
  -- thì rơi qua UPDATE bên dưới. RETURNING id (không phải so sánh
  -- timestamp) để biết chắc câu lệnh nào thực sự vừa chạy.
  insert into public.user_hidden_quest_progress (user_id, hidden_quest_id, status, completed_at)
  values (p_user_id, p_hidden_quest_id, 'completed', now())
  on conflict (user_id, hidden_quest_id) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    -- Đã có dòng — chỉ update nếu CHƯA completed (chống thưởng 2 lần).
    update public.user_hidden_quest_progress
      set status = 'completed', completed_at = now()
      where user_id = p_user_id and hidden_quest_id = p_hidden_quest_id and status <> 'completed'
      returning id into v_row_id;

    if v_row_id is null then
      raise exception 'Hidden quest already completed';
    end if;
  end if;

  v_txn := public.apply_transaction(
    p_user_id, 'quest_reward', v_quest.reward_tokens,
    'quest', p_hidden_quest_id
  );

  return v_txn;
end;
$$ language plpgsql security definer;

-- p_user_id là tham số trần — REVOKE EXECUTE khỏi PUBLIC/anon/authenticated,
-- chỉ service_role gọi được (xem lý do đầy đủ trong
-- migrations/20260827_add_streak_sync_functions.sql, cuối file).
revoke execute on function public.complete_hidden_quest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_hidden_quest(uuid, uuid) to service_role;

COMMIT;

-- Notes:
-- 1. reward_tokens NOT NULL, không default — admin phải gõ số cụ thể lúc
--    tạo campaign, không có "quên nhập thì mặc định 0 token" âm thầm.
-- 2. complete_hidden_quest() dùng on conflict do nothing + kiểm lại status
--    thay vì chỉ dựa unique constraint raise lỗi — vì user_hidden_quest_progress
--    có thể đã có dòng 'in_progress' từ trước (lúc user mở trang campaign,
--    trước khi đủ điều kiện hoàn thành), không phải luôn luôn insert mới.
-- 3. Cập nhật docs/supabase/schema.sql (phần 10) + src/lib/supabase/types.ts.
