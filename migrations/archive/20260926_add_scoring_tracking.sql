-- Migration: tracking bổ sung cho chấm điểm chung cuộc (Contest Engine, Slice 2.5a).
-- Phụ thuộc migrations/20260926_add_reading_session_tracking.sql (chạy trước)
-- và định nghĩa LẠI record_reading_heartbeat() của migration đó (cùng chữ ký —
-- code đang chạy không phải đổi gì).
--
-- Xem docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XXI.2:
--   1. reading_sessions.words_reached — số chữ từ đầu chương tới hết đoạn xa
--      nhất người đọc đã tới trong phiên (đoạn tách bằng "\n\n", giống reader.tsx;
--      đếm chữ bằng contest_word_count). Server tính trên nội dung chương LÚC
--      NHẬN NHỊP và lưu lại → tính điểm sau này ra cùng kết quả dù chương bị
--      sửa. Chỉ tăng, không giảm. Reading Depth (lúc tính điểm) chặn thêm bằng
--      thời gian đọc thật × trần tốc độ trong config có version — không áp ở đây.
--   2. Thời gian sự kiện engagement do SERVER đặt: anchored_comments,
--      chapter_votes, character_trope_votes (created_at) và reading_list_items
--      (added_at) cho client ghi thẳng qua PostgREST, kể cả cột thời gian →
--      có thể ghi lùi / ghi trước để rơi vào khung chấm. Trigger ép = now() khi
--      insert và giữ nguyên khi update. Không đổi hành vi app (không code nào
--      tự đặt các cột này).
--
-- Idempotent: add column if not exists, create or replace, drop trigger if exists.
-- Test: docs/supabase/tests/20260926_scoring_tracking.test.sql.

alter table public.reading_sessions
  add column if not exists words_reached integer;

do $$ begin
  alter table public.reading_sessions add constraint reading_sessions_words_reached_check
    check (words_reached is null or words_reached >= 0);
exception when duplicate_object then null; end $$;

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
  v_words integer;
  v_elapsed numeric;
  v_source text := case when p_source in ('contest', 'trending', 'search', 'profile', 'recommendation', 'other') then p_source else null end;
begin
  -- Số chữ tới hết đoạn p_paragraph (mảng 1-based; vượt số đoạn thì lấy hết chương).
  select ch.book_id,
         public.contest_word_count(array_to_string(
           (string_to_array(ch.content, E'\n\n'))[1 : greatest(coalesce(p_paragraph, 0), 0) + 1], E'\n'))
    into v_book, v_words
  from public.chapters ch where ch.id = p_chapter_id;
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
    insert into public.reading_sessions (user_id, chapter_id, book_id, start_time, end_time, last_heartbeat_at, max_paragraph, words_reached, source)
    values (p_user_id, p_chapter_id, v_book, now(), now(), now(), greatest(coalesce(p_paragraph, 0), 0), v_words, v_source)
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
         words_reached = greatest(coalesce(s.words_reached, 0), v_words),
         drop_off_offset = greatest(coalesce(p_paragraph, 0), 0),
         source = coalesce(s.source, v_source)
   where s.id = v_row.id
  returning * into v_row;
  return query select v_row.id, v_row.active_seconds;
end;
$$;

revoke execute on function public.record_reading_heartbeat(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_reading_heartbeat(uuid, uuid, uuid, integer, text) to service_role;

-- Thời gian sự kiện do server đặt: insert → now(); update → giữ giá trị cũ.
create or replace function public.force_server_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.force_server_added_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := now();
  else
    new.added_at := old.added_at;
  end if;
  return new;
end;
$$;

drop trigger if exists anchored_comments_server_time on public.anchored_comments;
create trigger anchored_comments_server_time
  before insert or update on public.anchored_comments
  for each row execute function public.force_server_created_at();

drop trigger if exists chapter_votes_server_time on public.chapter_votes;
create trigger chapter_votes_server_time
  before insert or update on public.chapter_votes
  for each row execute function public.force_server_created_at();

drop trigger if exists character_trope_votes_server_time on public.character_trope_votes;
create trigger character_trope_votes_server_time
  before insert or update on public.character_trope_votes
  for each row execute function public.force_server_created_at();

drop trigger if exists reading_list_items_server_time on public.reading_list_items;
create trigger reading_list_items_server_time
  before insert or update on public.reading_list_items
  for each row execute function public.force_server_added_at();

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: record_reading_heartbeat SỬA TẠI CHỖ (khối
--     Slice 2.1), cột words_reached + 2 hàm + 4 trigger thêm ở CUỐI file.
--   - src/lib/supabase/types.ts: reading_sessions.words_reached.
--   - docs/supabase/tests/20260926_contest_entry_stats.test.sql tắt tạm trigger
--     anchored_comments_server_time để dựng bình luận cũ (trong giao dịch test).
-- ---------------------------------------------------------------------
