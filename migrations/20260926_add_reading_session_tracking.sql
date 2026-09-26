-- Migration: ghi nhận phiên đọc ở server (Contest Engine Phase 2, Slice 2.1 — P1).
--
-- Trước đây reading_sessions có bảng nhưng KHÔNG code nào ghi, và policy
-- "users manage their own reading sessions" (for all) cho người dùng tự
-- insert/update phiên của mình thẳng qua PostgREST — tức tự khai "đã đọc 2
-- tiếng" được. Migration này:
--   1. Bỏ quyền ghi của client: policy chỉ còn SELECT của chủ hàng; revoke
--      insert/update/delete. Không ảnh hưởng tính năng nào (chưa có ai ghi).
--   2. Thêm cột: book_id, active_seconds (thời gian đọc THẬT do server cộng),
--      last_heartbeat_at, max_paragraph, source (nguồn truy cập — chỉ cho
--      analytics, không vào điểm vì client tự khai được).
--   3. record_reading_heartbeat(): đường ghi DUY NHẤT (service-role). Reader
--      gửi nhịp mỗi 60 giây khi tab đang hiển thị và người đọc có tương tác.
--      Server cộng KHOẢNG THỜI GIAN THẬT giữa 2 nhịp (không tin số client
--      gửi): nhịp dồn dập chỉ cộng vài giây thật đã trôi qua; khoảng cách
--      > 90 giây (tab ẩn / người đọc bỏ đi) không cộng gì. Vì vậy
--      active_seconds không bao giờ vượt thời gian thực của phiên.
--   Kiểm quyền đọc (chương xuất bản, chưa gỡ, chương trả phí đã mua) nằm ở
--   route trước khi gọi RPC — dùng chung checkChapterAccess() với
--   recordReadingProgress().
--
-- Meaningful read (P2) được tính từ active_seconds ở Slice 2.2, không ở đây.
--
-- Idempotent: add column if not exists, drop policy if exists, create or replace.
-- Test: docs/supabase/tests/20260926_reading_session_tracking.test.sql.

alter table public.reading_sessions
  add column if not exists book_id uuid references public.books (id) on delete cascade,
  add column if not exists active_seconds integer not null default 0,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists max_paragraph integer,
  add column if not exists source text;

do $$ begin
  alter table public.reading_sessions add constraint reading_sessions_active_seconds_check check (active_seconds >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reading_sessions add constraint reading_sessions_source_check
    check (source is null or source in ('contest', 'trending', 'search', 'profile', 'recommendation', 'other'));
exception when duplicate_object then null; end $$;

create index if not exists reading_sessions_book_user_idx on public.reading_sessions (book_id, user_id, start_time);

drop policy if exists "users manage their own reading sessions" on public.reading_sessions;
drop policy if exists "users view their own reading sessions" on public.reading_sessions;
create policy "users view their own reading sessions"
  on public.reading_sessions for select
  using (auth.uid() = user_id);
revoke insert, update, delete, truncate on public.reading_sessions from anon, authenticated;

-- Trả id phiên (mới hoặc cũ) + active_seconds hiện tại.
-- p_session_id null / không khớp (người khác, chương khác, đã nguội > 30 phút)
-- → mở phiên mới.
create or replace function public.record_reading_heartbeat(
  p_user_id uuid,
  p_session_id uuid,
  p_chapter_id uuid,
  p_paragraph integer,
  p_source text
) returns table (session_id uuid, active_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reading_sessions;
  v_book uuid;
  v_elapsed numeric;
  v_source text := case when p_source in ('contest', 'trending', 'search', 'profile', 'recommendation', 'other') then p_source else null end;
begin
  select book_id into v_book from public.chapters where id = p_chapter_id;
  if v_book is null then
    raise exception 'Chapter % not found', p_chapter_id using hint = 'chapter_not_found';
  end if;

  if p_session_id is not null then
    select * into v_row from public.reading_sessions
    where id = p_session_id and user_id = p_user_id and chapter_id = p_chapter_id
      and last_heartbeat_at > now() - interval '30 minutes'
    for update;
  end if;

  if v_row.id is null then
    insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, max_paragraph, source)
    values (p_user_id, p_chapter_id, v_book, now(), now(), now(), greatest(coalesce(p_paragraph, 0), 0), v_source)
    returning * into v_row;
    return query select v_row.id, v_row.active_seconds;
    return;
  end if;

  -- Khoảng thời gian THẬT từ nhịp trước. Quá 90 giây = đã bỏ đi / tab ẩn → không cộng.
  v_elapsed := extract(epoch from (now() - v_row.last_heartbeat_at));
  update public.reading_sessions s
     set active_seconds = s.active_seconds + case when v_elapsed <= 90 then floor(v_elapsed)::integer else 0 end,
         last_heartbeat_at = now(),
         end_time = now(),
         max_paragraph = greatest(coalesce(s.max_paragraph, 0), coalesce(p_paragraph, 0)),
         drop_off_offset = greatest(coalesce(p_paragraph, 0), 0),
         source = coalesce(s.source, v_source)
   where s.id = v_row.id
  returning * into v_row;
  return query select v_row.id, v_row.active_seconds;
end;
$$;

revoke execute on function public.record_reading_heartbeat(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_reading_heartbeat(uuid, uuid, uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: đổi policy của reading_sessions tại chỗ (phần
--     tạo bảng) + thêm cột / hàm ở CUỐI file.
--   - src/lib/supabase/types.ts: cột mới của reading_sessions (Insert/Update
--     còn cho service-role), Functions.record_reading_heartbeat.
--   - POST /api/reading/heartbeat (web + mobile, kiểm quyền đọc trước) và
--     nhịp 60 giây trong src/components/reading/reader.tsx.
-- ---------------------------------------------------------------------
