-- Migration: quest_examples_pool — pool mẫu do admin/tác giả soạn thủ
-- công, dùng làm few-shot reference cho Python service sinh quest bằng AI
-- (Phase 2+, xem prompt triển khai Quest System).
--
-- Bảng MỚI hoàn toàn (không có tương đương cũ, khác task_templates —
-- xem migrations/20260827_extend_task_templates_for_quests.sql).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.quest_examples_pool (
  id uuid primary key default gen_random_uuid(),
  quest_type text not null check (quest_type in (
    'discovery', 'engagement', 'lore_hunt', 'cross_compare', 'prediction', 'topup'
  )),
  content text not null,
  genre text,
  -- 'good': ví dụ mẫu đạt chuẩn. 'bad_counterexample': ví dụ KHÔNG đạt
  -- (vd hỏi kiến thức phổ thông search được ngoài, hoặc dùng dạng trắc
  -- nghiệm) — bắt buộc pool có cả 2 loại cho mỗi (quest_type, genre) để
  -- few-shot prompt dạy được AI phân biệt, nhưng đây là business rule của
  -- quy trình soạn pool, không phải thứ CHECK constraint enforce được ở
  -- mức 1 dòng (không có cách diễn tả "phải có ít nhất 1 dòng loại kia
  -- cùng genre" bằng CHECK trên chính dòng đang insert).
  example_quality text not null check (example_quality in ('good', 'bad_counterexample')),
  spoiler_risk text not null default 'low' check (spoiler_risk in ('low', 'medium', 'high')),
  version integer not null default 1,
  added_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index quest_examples_pool_type_genre_idx
  on public.quest_examples_pool (quest_type, genre);

alter table public.quest_examples_pool enable row level security;

-- Chỉ Python service (service role key, bypass RLS hoàn toàn) đọc bảng
-- này để build few-shot prompt — không có lý do gì client/app cần SELECT
-- trực tiếp. Policy dưới đây chỉ cho admin xem/soạn qua 1 trang quản trị
-- nếu sau này cần, KHÔNG có policy select công khai nào khác (mặc định
-- deny cho authenticated/anon).
create policy "admins manage quest examples pool"
  on public.quest_examples_pool for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

COMMIT;

-- Notes:
-- 1. Idempotent nếu chạy trên DB chưa có bảng này; KHÔNG idempotent nếu
--    chạy lại (create table không có IF NOT EXISTS) — giống phần lớn
--    "create table" gốc trong docs/supabase/schema.sql, chỉ migration
--    dạng ALTER mới cần IF NOT EXISTS/idempotent thật.
-- 2. added_by KHÔNG NULL — mọi ví dụ trong pool phải quy được về 1 người
--    chịu trách nhiệm nội dung (admin hoặc chính tác giả), khác
--    task_templates.author_id (nullable — quest có thể chung toàn nền
--    tảng, không gắn tác giả nào).
-- 3. Cập nhật docs/supabase/schema.sql (thêm phần 10 — Quest System) +
--    src/lib/supabase/types.ts.
