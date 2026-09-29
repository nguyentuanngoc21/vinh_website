-- Migration: anchored_comments — comment neo vào vị trí cụ thể trong
-- chương, cơ chế trả lời DUY NHẤT cho quest khi cần "câu trả lời" (spec:
-- "Không dùng form nhập đáp án hay trắc nghiệm A/B/C/D. Khi nhiệm vụ cần
-- 'câu trả lời', thay bằng comment neo vào vị trí cụ thể").
--
-- Bảng MỚI hoàn toàn — không có bảng comment nào tồn tại trước đây trong
-- schema (grep toàn repo không ra kết quả). Dùng chung vị trí neo với
-- highlights (chapter_id + paragraph_index + char_start/char_end, xem
-- migrations/20260827_add_reading_behavior_tables.sql) để 1 lần xây UI
-- "chọn vùng trong chương" phục vụ được cả 2 tính năng.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.anchored_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  paragraph_index integer,
  char_start integer not null check (char_start >= 0),
  char_end integer not null check (char_end > char_start),
  content text not null check (char_length(trim(content)) > 0),
  -- Polymorphic, giống quest_reset_events.quest_id — NULL cho comment
  -- thường (không phải trả lời quest nào), NOT NULL khi comment này CHÍNH
  -- LÀ hành động hoàn thành 1 quest (lore_hunt/cross_compare/prediction).
  -- Không FK — có thể trỏ task_templates.id hoặc hidden_quests.id, phân
  -- biệt qua quest_source.
  quest_id uuid,
  quest_source text check (quest_source is null or quest_source in ('task_template', 'hidden_quest')),
  created_at timestamptz not null default now(),
  check ((quest_id is null) = (quest_source is null))
);

create index anchored_comments_chapter_id_idx on public.anchored_comments (chapter_id);
create index anchored_comments_quest_idx on public.anchored_comments (quest_id, quest_source) where quest_id is not null;

alter table public.anchored_comments enable row level security;

-- Comment là nội dung công khai dưới chương (giống comment thường trên
-- mọi nền tảng đọc) — ai cũng xem được, không cần đăng nhập.
create policy "anchored comments are publicly readable"
  on public.anchored_comments for select
  using (true);

create policy "users write their own anchored comments"
  on public.anchored_comments for insert
  with check (auth.uid() = user_id);

create policy "users update their own anchored comments"
  on public.anchored_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete their own anchored comments"
  on public.anchored_comments for delete
  using (auth.uid() = user_id);

create policy "admins moderate anchored comments"
  on public.anchored_comments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

COMMIT;

-- Notes:
-- 1. Verifiability (Phase 2 pipeline mục 4) kiểm content của quest match
--    nguyên văn chapters.content trong khoảng char_start/char_end của
--    CHÍNH chapter_ref — không phải kiểm nội dung anchored_comments (bình
--    luận trả lời không cần khớp chữ, chỉ cần user chọt đúng VỊ TRÍ mà
--    quest hỏi tới).
-- 2. Route hoàn thành quest (server-side) là nơi vừa insert 1 dòng ở đây
--    (với quest_id/quest_source) vừa gọi apply_transaction() cho thưởng —
--    2 việc này nên nằm trong 1 DB transaction ở tầng app (hoặc 1 hàm
--    security definer riêng nếu cần atomic thật ở mức DB) để tránh trạng
--    thái "đã ghi comment nhưng lỗi nửa đường, không được thưởng" hoặc
--    ngược lại.
-- 3. Cập nhật docs/supabase/schema.sql (phần 10) + src/lib/supabase/types.ts.
