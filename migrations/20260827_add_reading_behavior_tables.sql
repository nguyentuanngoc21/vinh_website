-- Migration: highlights + reading_sessions — dữ liệu hành vi đọc nền
-- tảng cho chân dung độc giả VÀ cho quest neo vị trí (lore_hunt,
-- cross_compare tra chapter_ref khớp nguyên văn qua chapters.content).
--
-- Đây là công trình PHẢI XÂY MỚI, không phải hạ tầng đã có — bản spec gốc
-- liệt 2 bảng này trong "dữ liệu hành vi nền tảng" như đã tồn tại sẵn,
-- nhưng grep toàn repo không thấy bảng, cột, hay cả mock data nào cho
-- highlight/reading-session. chapters.content hiện là 1 cột text nguyên
-- khối, KHÔNG có bảng "paragraph" riêng — paragraph_index dưới đây là chỉ
-- số tính phía client lúc render (tách theo \n\n), lưu để hiển thị lại
-- đúng chỗ, KHÔNG phải FK.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  paragraph_index integer,
  char_start integer not null check (char_start >= 0),
  char_end integer not null check (char_end > char_start),
  created_at timestamptz not null default now()
);

create index highlights_chapter_id_idx on public.highlights (chapter_id);
create index highlights_user_id_idx on public.highlights (user_id);

alter table public.highlights enable row level security;

-- Passive signal — không gắn KPI ép buộc (spec: "chỉ track hoặc thưởng
-- nhẹ bất ngờ sau khi xảy ra"), nên chỉ chủ sở hữu xem được, giống
-- reading_history/book_progress. KHÔNG có view công khai — highlight của
-- 1 user không phải nội dung chia sẻ công khai (khác anchored_comments).
create policy "users manage their own highlights"
  on public.highlights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  -- Vị trí (char offset trong chapters.content) lúc user rời trang mà
  -- CHƯA đọc hết chương — NULL nếu đọc xong hoặc chưa có tín hiệu rời
  -- trang (session đang mở, end_time cũng NULL trong lúc đó).
  drop_off_offset integer,
  check (end_time is null or end_time >= start_time),
  check (drop_off_offset is null or drop_off_offset >= 0)
);

create index reading_sessions_chapter_id_idx on public.reading_sessions (chapter_id);
create index reading_sessions_user_id_idx on public.reading_sessions (user_id, start_time);

alter table public.reading_sessions enable row level security;

create policy "users manage their own reading sessions"
  on public.reading_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

COMMIT;

-- Notes:
-- 1. Tốc độ đọc/drop-off là passive signal — dùng để tính quality_flag
--    của task_templates (thời gian nhận -> hoàn thành quá nhanh) và cho
--    chân dung độc giả, KHÔNG dùng để tự động phạt/chặn ai.
-- 2. Client cần tự sinh + giữ nguyên paragraph_index khi tách content
--    (vd split theo "\n\n") — đổi logic tách ở frontend sau này sẽ làm
--    lệch paragraph_index của highlight/comment cũ; char_start/char_end
--    (tính trên toàn bộ content, không phụ thuộc cách tách đoạn) là
--    nguồn sự thật chính, paragraph_index chỉ hỗ trợ hiển thị nhanh.
-- 3. Cập nhật docs/supabase/schema.sql (phần 10) + src/lib/supabase/types.ts.
