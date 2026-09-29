-- Migration: quest_reset_events — lịch sử chi tiết việc reset quest
-- (spec mục 1.3: "Track riêng: loại quest bị reset, quest thay thế được
-- chọn, tần suất theo user — đây là dữ liệu, không chỉ là thao tác UI").
--
-- user_daily_tasks.reset_count (migrations/20260827_extend_task_templates_for_quests.sql)
-- chỉ là số đếm nhanh cho UI (vd disable nút reset khi hết lượt hôm nay)
-- — bảng này giữ lịch sử đầy đủ để phân tích hành vi né tránh.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.quest_reset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- quest_id: polymorphic reference to task_templates.id or
  -- hidden_quests.id, disambiguated by quest_source. No FK constraint —
  -- enforced at app layer. Same pattern as purchase_transactions.chapter_id
  -- (docs/supabase/schema.sql phần 6e) — 1 cột uuid trần trỏ tới bảng nào
  -- tuỳ ngữ cảnh, vì Postgres không cho 1 FK trỏ "tuỳ điều kiện" tới 2
  -- bảng khác nhau.
  quest_id uuid not null,
  quest_source text not null check (quest_source in ('task_template', 'hidden_quest')),
  -- Quest được random pool chọn thay vào chỗ quest bị reset — NULL nếu
  -- không có gì thay (vd reset nhưng hết lượt trong ngày, hoặc pool rỗng
  -- sau khi trừ quest vừa reset + các quest đang cooldown).
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

-- Không có policy insert cho "authenticated" — ghi dòng phải đi qua cùng
-- 1 route server xử lý reset (kiểm giới hạn 1-2 lần/ngày + cooldown N
-- ngày trước khi cho quest vừa reset xuất hiện lại), dùng service role,
-- không phải INSERT trực tiếp từ client.

COMMIT;

-- Notes:
-- 1. Chỉ quest nguồn task_template mới có cơ chế reset (random pool hàng
--    ngày) theo spec mục 1.3 — hidden_quests là campaign, không bị "quay
--    số lại" theo cách này. quest_source vẫn giữ 2 giá trị (không chỉ
--    'task_template') để không phải ALTER lại nếu sau này hidden_quests
--    cũng có cơ chế reset riêng.
-- 2. Cập nhật docs/supabase/schema.sql (phần 10) + src/lib/supabase/types.ts.
