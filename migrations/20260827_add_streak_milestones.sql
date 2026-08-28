-- Migration: streak_milestones — mốc thưởng đọc-liên-tục kiểu Duolingo.
-- Định nghĩa 1 lần (7/14/30/60 ngày...), KHÔNG liên quan gì tới công thức
-- thưởng nhiệm vụ hàng ngày (task_templates.reward_tokens) hay hidden_quests
-- (hidden_quests.reward_tokens) — 3 khoản thưởng độc lập, không nhân/cộng
-- chồng lên nhau:
--   - task_template: rotate quest, mức thưởng CỐ ĐỊNH (reward_tokens).
--   - hidden_quest: campaign thủ công, mức thưởng CỐ ĐỊNH admin tự nhập.
--   - streak_milestone: chuỗi ngày đọc liên tục đạt mốc, thưởng CỐ ĐỊNH
--     của riêng mốc đó — KHÔNG cộng/nhân vào bất kỳ quest nào ở trên.
--
-- profiles.current_quest_streak (migrations/20260827_add_quest_streak_to_profiles.sql)
-- đã lưu sẵn số ngày liên tục hiện tại — bảng này chỉ định nghĩa CÁC MỐC,
-- không lưu tiến trình.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.streak_milestones (
  id uuid primary key default gen_random_uuid(),
  streak_days integer not null unique check (streak_days > 0),
  reward_token integer not null check (reward_token >= 0),
  -- Chưa có bảng badges trong schema hiện tại (grep toàn repo không ra
  -- kết quả) — cột giữ chỗ theo đúng ý "nếu có bảng badges riêng", KHÔNG
  -- có FK constraint ở migration này. Thêm
  -- `alter table streak_milestones add constraint ... foreign key (badge_id)
  -- references public.badges (id)` trong 1 migration riêng SAU KHI bảng
  -- badges tồn tại — đừng quên, cột này vô dụng (không enforce gì) cho
  -- tới lúc đó.
  badge_id uuid,
  created_at timestamptz not null default now()
);

alter table public.streak_milestones enable row level security;

-- Định nghĩa mốc thưởng không phải dữ liệu riêng tư — mọi user đăng nhập
-- cần đọc được để hiện "còn N ngày nữa được thưởng X token" trên UI,
-- giống task_templates cho phép authenticated xem các template active.
create policy "authenticated users can view streak milestones"
  on public.streak_milestones for select
  to authenticated
  using (true);

create policy "admins manage streak milestones"
  on public.streak_milestones for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Chống nhận thưởng 1 mốc nhiều lần — profiles.current_quest_streak chỉ
-- là 1 số hiện tại (có thể tụt về 0 rồi lên lại), không tự nói "mốc 30
-- ngày đã được thưởng lần nào chưa". Không có trong bản phác của bạn —
-- thêm vì cần thiết để claim_streak_milestone() bên dưới chống double-claim,
-- cùng nguyên tắc user_daily_tasks.claimed/withdrawal idempotency ở
-- schema.sql phần 6/7.
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

-- Duy nhất đường ghi — kiểm streak hiện tại của user đã tới mốc chưa,
-- kiểm chưa claim mốc này lần nào (unique constraint ở trên chặn ở mức DB,
-- nhưng raise exception rõ nghĩa hơn để route xử lý lỗi tử tế), rồi gọi
-- apply_transaction() giống mọi đường thưởng khác trong hệ thống — không
-- có ledger riêng.
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

-- p_user_id là tham số trần — REVOKE EXECUTE khỏi PUBLIC/anon/authenticated,
-- chỉ service_role gọi được (xem lý do đầy đủ trong
-- migrations/20260827_add_streak_sync_functions.sql, cuối file).
revoke execute on function public.claim_streak_milestone(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_streak_milestone(uuid, uuid) to service_role;

COMMIT;

-- Notes:
-- 1. current_quest_streak KHÔNG tự reset về 0 ở migration này — logic
--    "ngắt streak khi bỏ đọc quá N giờ/ngày" thuộc route/cron cập nhật
--    profiles.current_quest_streak (đã có sẵn khung bảo vệ ở
--    migrations/20260827_add_quest_streak_to_profiles.sql), không phải
--    việc của bảng streak_milestones.
-- 2. claim_streak_milestone() KHÔNG tự động chạy — 1 route server (hoặc
--    cron) phải chủ động gọi cho mọi mốc user đủ điều kiện mỗi khi
--    current_quest_streak tăng, hoặc để user tự bấm "nhận thưởng" trên UI
--    (giống claim_daily_task) — chưa quyết định UX nào, để tầng app quyết.
-- 3. badge_id: theo dõi riêng — cần bảng `badges` + FK ALTER bổ sung sau.
-- 4. Cập nhật docs/supabase/schema.sql (phần 10) + src/lib/supabase/types.ts.
