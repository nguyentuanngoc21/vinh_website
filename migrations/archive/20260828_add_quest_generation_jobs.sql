-- Migration: quest_generation_jobs — hàng đợi cho Python worker (Phase 2,
-- spec "Hạ tầng Python server"). Dùng chính Postgres làm queue (bảng +
-- polling), KHÔNG dùng Redis/RabbitMQ — đúng khuyến nghị trong spec:
-- "đơn giản, không cần thêm hạ tầng ở giai đoạn này".
--
-- Phase này (skeleton): CHƯA wire route publish chương của Next.js để tự
-- insert job — quyết định chủ động (đã hỏi lại), test bằng insert tay
-- trước, xác nhận worker poll/process/log đúng rồi mới đụng route publish
-- chương thật (chưa đọc/review trong phiên này).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.quest_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Worker poll query: "select ... where status='queued' order by created_at limit N".
create index quest_generation_jobs_poll_idx
  on public.quest_generation_jobs (created_at)
  where status = 'queued';

alter table public.quest_generation_jobs enable row level security;

-- Admin-only select (đọc để theo dõi/debug qua dashboard nếu cần sau) —
-- KHÔNG có policy nào cho user thường, và KHÔNG có policy insert/update
-- nào cho "authenticated" — bảng này hoàn toàn nội bộ, chỉ Python worker
-- (service role key riêng, theo đúng khuyến nghị "không dùng chung anon
-- key với frontend") và (sau này) route publish chương của Next.js viết.
create policy "admins view quest generation jobs"
  on public.quest_generation_jobs for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

COMMIT;

-- Notes:
-- 1. Không có trigger tự update `updated_at` — worker tự set now() ở mỗi
--    lần UPDATE (giống cách deposit_transactions.processed_at set tay,
--    không dùng trigger, cho nhất quán với convention hiện tại).
-- 2. attempts tối đa enforce ở TS... à Python layer (MAX_ATTEMPTS trong
--    python-service/app/config.py), KHÔNG có CHECK nào ở DB — retry limit
--    là logic nghiệp vụ (đổi số không cần migration), không phải bất
--    biến dữ liệu.
-- 3. Test tay (insert 1 chapter_id có thật):
--      insert into public.quest_generation_jobs (chapter_id) values ('<uuid chương thật>');
--    rồi xem worker Python tự nhặt, chuyển processing -> done/failed.
-- 4. Cập nhật docs/supabase/schema.sql (phần mới, sau 10m) +
--    src/lib/supabase/types.ts (Tables.quest_generation_jobs — chỉ Row,
--    Insert/Update để `never` như các bảng service-role-only khác, dù
--    Python không dùng types.ts — giữ để Next.js đọc/debug qua Supabase
--    client TS nếu cần sau này, không phá convention nhất quán).
