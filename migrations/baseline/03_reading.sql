-- =======================================================================
-- Baseline 03 — Đọc truyện  (03_reading.sql)
-- =======================================================================
-- Phạm vi: Gợi ý (pgvector embedding + recommend_books), reading_history +
-- lượt đọc theo ngày, vote chương, tiến độ đọc, danh sách đọc, highlights,
-- reading_sessions + heartbeat phía server, comment neo đoạn văn, ranking
-- aggregates.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     reading_history, chapter_votes, book_progress, reading_lists,
--     reading_list_items, highlights, reading_sessions, anchored_comments
--   View:
--     book_read_counts_daily, chapter_vote_counts, book_chapter_stats
--   Hàm:
--     record_chapter_read, recommend_books, record_reading_heartbeat,
--     book_read_counts_between
--   Thêm cột vào bảng của file trước:
--     books.embedding
--
-- Gộp từ migration (migrations/archive/):
--   20260824_add_book_progress.sql, 20260824_add_chapter_votes.sql,
--   20260824_add_reading_lists.sql, 20260827_add_anchored_comments.sql,
--   20260827_add_reading_behavior_tables.sql,
--   20260831_add_book_read_counts_daily.sql,
--   20260910_add_anchored_comment_replies.sql,
--   20260910_add_book_progress_paragraph.sql,
--   20260917_add_reading_event_log.sql,
--   20260926_add_reading_session_tracking.sql,
--   20260926_add_scoring_tracking.sql
--   + migrations/20260929_add_hot_path_indexes.sql, migrations/20260929_add_ranking_aggregates.sql
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql,
--   02_books_and_chapters.sql
-- Tham chiếu tới file SAU chỉ nằm trong thân hàm plpgsql (bind lúc chạy,
-- không cần khi tạo): 11_contests.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 8. Gợi ý truyện (pgvector)
-- ---------------------------------------------------------------------

-- Kích thước vector tuỳ model embedding bạn dùng để sinh (ví dụ
-- text-embedding-3-small của OpenAI = 1536 chiều). Sinh embedding từ
-- title + synopsis (+ có thể vài chương đầu) mỗi khi sách được publish,
-- lưu vào cột này từ code server (không sinh trong SQL).
alter table public.books add column embedding vector(1536);

-- Lịch sử đọc — vừa là input để tính gợi ý, vừa là dữ liệu phân tích nói
-- chung (sách nào được đọc nhiều, bỏ dở ở đâu, v.v.).
create table public.reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete set null,
  read_at timestamptz not null default now()
);

alter table public.reading_history enable row level security;

-- SELECT-only cho chủ hàng — bảng này nuôi streak + achievement metric
-- (tiền thưởng thật) từ migrations/archive/20260917_add_reading_event_log.sql, nên
-- không còn cho phép user tự INSERT/UPDATE/DELETE thẳng qua Supabase
-- client nữa. Ghi DUY NHẤT qua record_chapter_read() (SECURITY DEFINER,
-- service_role) ở dưới.
create policy "users view their own reading history"
  on public.reading_history for select
  using (auth.uid() = user_id);

-- Gọi khi user thật sự đọc hết 1 chương (cuộn tới đoạn cuối cùng — xem
-- src/components/reading/reader.tsx +
-- src/app/api/books/[bookId]/reading-progress/route.ts). Dedupe theo
-- (user_id, chapter_id, NGÀY server/UTC) — trả NULL nếu đã ghi hôm nay, để
-- caller (TS) biết KHÔNG lặp lại side-effect (tăng tiến trình nhiệm vụ,
-- gọi streak) cho cùng 1 lần hoàn thành do client gửi lại. Xem
-- migrations/archive/20260917_add_reading_event_log.sql.
create function public.record_chapter_read(p_user_id uuid, p_book_id uuid, p_chapter_id uuid)
returns public.reading_history as $$
declare
  v_row public.reading_history;
begin
  if exists (
    select 1 from public.reading_history
    where user_id = p_user_id and chapter_id = p_chapter_id and read_at::date = current_date
  ) then
    return null;
  end if;

  insert into public.reading_history (user_id, book_id, chapter_id)
  values (p_user_id, p_book_id, p_chapter_id)
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- p_user_id trần — chỉ service_role gọi được, cùng lý do increment_task_progress.
revoke execute on function public.record_chapter_read from public, anon, authenticated;
grant execute on function public.record_chapter_read to service_role;

-- View công khai, đã ẩn danh (không có user_id) — số lượt đọc mỗi SÁCH
-- theo TỪNG NGÀY, dùng để tính bảng xếp hạng tuần/tháng/quý thật ở
-- /rankings (src/lib/rankings/get-book-rankings.ts). Cùng lý do
-- chapter_vote_counts ở dưới không bị RLS bảng gốc chặn: view chạy với
-- quyền OWNER. Xem migrations/archive/20260831_add_book_read_counts_daily.sql.
create view public.book_read_counts_daily as
  select book_id, date_trunc('day', read_at)::date as read_date, count(*)::integer as read_count
  from public.reading_history
  group by book_id, date_trunc('day', read_at)::date;

-- --- Vote theo-chương, dạng toggle (bấm lại = bỏ vote) — nút "Bình chọn"
-- trên trang đọc CHƯA được xây (phase sau); schema này chuẩn bị trước để
-- trang giới thiệu truyện có cột số để hiển thị (sẽ luôn là 0 cho tới khi
-- nút vote thật ra mắt). Bảng gốc chỉ chủ vote xem được dòng của mình
-- (giống reading_history) — aggregate công khai đi qua view riêng, giống
-- pattern public_design_items ở phần 9. Xem
-- migrations/archive/20260824_add_chapter_votes.sql. ---
create table public.chapter_votes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (chapter_id, user_id)
);

create index chapter_votes_chapter_id_idx on public.chapter_votes (chapter_id);

alter table public.chapter_votes enable row level security;

create policy "users manage their own chapter votes"
  on public.chapter_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.chapter_vote_counts as
  select chapter_id, count(*)::integer as vote_count
  from public.chapter_votes
  group by chapter_id;

-- Tổng vote của 1 SÁCH = SUM(vote_count) mọi chương thuộc sách đó, tính ở
-- tầng app — không cần view/cột riêng ở cấp books.

-- --- "Chương đọc gần nhất" cho nút "Tiếp tục đọc" — 1 dòng/cặp (user,
-- sách), tra O(1). Cố ý là bảng RIÊNG, không thêm unique vào
-- reading_history ở trên (bảng đó là log đầy đủ cho recommend_books() và
-- phân tích, không được rút gọn). Xem
-- migrations/archive/20260824_add_book_progress.sql. ---
create table public.book_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- Nhớ ĐOẠN VĂN cụ thể trong chapter_id ở trên — null = chưa có/chưa cuộn
-- qua đoạn nào, reader.tsx coi như "bắt đầu từ đầu chương". Chỉ áp dụng
-- khi mở LẠI đúng chapter_id này — route reading-progress luôn ghi đè cả
-- 2 cột cùng lúc để không lệch nhau. Xem
-- migrations/archive/20260910_add_book_progress_paragraph.sql.
alter table public.book_progress
  add column last_paragraph_index integer check (last_paragraph_index is null or last_paragraph_index >= 0);

alter table public.book_progress enable row level security;

create policy "users manage their own book progress"
  on public.book_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- "Đang nghe dở" cho Audio hub (audio_progress): đã chuyển xuống phần 9,
-- ngay sau bảng audio_narrations mà nó tham chiếu FK. ---

-- --- "Danh sách đọc" kiểu playlist YouTube — mỗi danh sách chứa nguyên
-- SÁCH (không phải chương lẻ), 1 user có nhiều danh sách. 2 bảng, giống
-- quan hệ books/chapters: 1 bảng cha (metadata danh sách) + 1 bảng con FK
-- vào cha (sách nào nằm trong danh sách nào). Route API thật (add/remove
-- item) dùng service-role + tự kiểm reading_lists.user_id = userId trước
-- khi ghi — RLS dưới đây chỉ defense-in-depth. Xem
-- migrations/archive/20260824_add_reading_lists.sql. ---
create table public.reading_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create index reading_lists_user_id_idx on public.reading_lists (user_id);

alter table public.reading_lists enable row level security;

create policy "users manage their own reading lists"
  on public.reading_lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.reading_list_items (
  list_id uuid not null references public.reading_lists (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, book_id)
);

create index reading_list_items_book_id_idx on public.reading_list_items (book_id);

alter table public.reading_list_items enable row level security;

-- Không có user_id trực tiếp trên bảng này — ownership đi qua
-- list_id -> reading_lists.user_id, giống pattern "chapters" join tới
-- "books.author_id" ở phần 3.
create policy "users manage items in their own reading lists"
  on public.reading_list_items for all
  using (exists (select 1 from public.reading_lists rl where rl.id = list_id and rl.user_id = auth.uid()))
  with check (exists (select 1 from public.reading_lists rl where rl.id = list_id and rl.user_id = auth.uid()));

-- Index gần-đúng cho tìm kiếm vector nhanh trên tập sách lớn (bỏ qua nếu
-- catalog còn nhỏ — dưới ~10k sách thì quét tuần tự vẫn đủ nhanh).
-- create index on public.books using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Gợi ý = sách có embedding gần với "vector trung bình" các sách user đã
-- đọc gần đây, loại trừ sách đã đọc, chỉ lấy sách đã publish.
create function public.recommend_books(p_user_id uuid, p_limit integer default 10)
returns setof public.books as $$
declare
  v_profile_vector vector(1536);
begin
  -- Lưu ý: KHÔNG viết `select avg(embedding) ... order by ... limit 20`
  -- trực tiếp — vì avg() là aggregate nên toàn bộ hàng khớp điều kiện sẽ
  -- được gộp trước, ORDER BY/LIMIT ở ngoài chỉ tác dụng lên 1 dòng kết quả
  -- cuối cùng (vô nghĩa). Phải giới hạn 20 lượt đọc gần nhất trong subquery
  -- TRƯỚC, rồi mới avg() trên tập đã giới hạn đó.
  select avg(embedding) into v_profile_vector
  from (
    select b.embedding
    from public.reading_history rh
    join public.books b on b.id = rh.book_id
    where rh.user_id = p_user_id and b.embedding is not null
    order by rh.read_at desc
    limit 20 -- chỉ lấy 20 lượt đọc gần nhất, tránh gu đọc cũ kéo lệch gợi ý
  ) recent_reads;

  if v_profile_vector is null then
    -- Chưa có lịch sử đọc (user mới) — fallback: trả sách publish gần đây
    -- nhất thay vì rỗng. Cân nhắc đổi thành "sách trending" nếu có bảng đó.
    return query
      select * from public.books
      where published
      order by created_at desc
      limit p_limit;
  else
    return query
      select b.* from public.books b
      where b.published
        and b.embedding is not null
        and b.id not in (select book_id from public.reading_history where user_id = p_user_id)
      order by b.embedding <=> v_profile_vector -- cosine distance, càng nhỏ càng giống
      limit p_limit;
  end if;
end;
$$ language plpgsql stable;

-- Gọi từ Next.js: const { data } = await supabase.rpc('recommend_books', { p_user_id: userId });
-- `security invoker` mặc định (không thêm security definer) — hàm chạy
-- với quyền của người gọi, RLS của `books`/`reading_history` vẫn áp dụng
-- bình thường, không cần lo hàm này lộ dữ liệu ngoài phạm vi cho phép.


-- --- 10e. highlights + reading_sessions — dữ liệu hành vi đọc nền tảng,
-- công trình PHẢI XÂY MỚI (không có sẵn trước Quest System). Passive
-- signal — không gắn KPI ép buộc. Xem
-- migrations/archive/20260827_add_reading_behavior_tables.sql. ---
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
  drop_off_offset integer,
  check (end_time is null or end_time >= start_time),
  check (drop_off_offset is null or drop_off_offset >= 0)
);

create index reading_sessions_chapter_id_idx on public.reading_sessions (chapter_id);
create index reading_sessions_user_id_idx on public.reading_sessions (user_id, start_time);

alter table public.reading_sessions enable row level security;

-- Chỉ SELECT của chủ hàng — client KHÔNG tự ghi (trước đây policy "for all"
-- cho tự khai thời gian đọc qua PostgREST). Ghi duy nhất qua
-- record_reading_heartbeat() (service-role) ở cuối file — xem
-- migrations/archive/20260926_add_reading_session_tracking.sql.
create policy "users view their own reading sessions"
  on public.reading_sessions for select
  using (auth.uid() = user_id);
revoke insert, update, delete, truncate on public.reading_sessions from anon, authenticated;

-- --- 10f. anchored_comments — comment neo vị trí, cơ chế trả lời DUY
-- NHẤT cho quest cần "câu trả lời" (không trắc nghiệm/điền text tự do).
-- Dùng chung vị trí neo với highlights. Xem
-- migrations/archive/20260827_add_anchored_comments.sql. ---
create table public.anchored_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  paragraph_index integer,
  char_start integer not null check (char_start >= 0),
  char_end integer not null check (char_end > char_start),
  content text not null check (char_length(trim(content)) > 0),
  -- Polymorphic, giống quest_reset_events.quest_id — NULL cho comment
  -- thường (không trả lời quest nào).
  quest_id uuid,
  quest_source text check (quest_source is null or quest_source in ('task_template', 'hidden_quest')),
  created_at timestamptz not null default now(),
  check ((quest_id is null) = (quest_source is null))
);

-- Reply lồng 1 CẤP DUY NHẤT (không cho reply-vào-reply) — enforce ở API
-- route (api/chapters/[chapterId]/comments), không phải CHECK DB. Reply
-- copy chapter_id/paragraph_index/char_start/char_end từ hàng cha khi
-- ghi. Xem migrations/archive/20260910_add_anchored_comment_replies.sql.
alter table public.anchored_comments
  add column parent_comment_id uuid references public.anchored_comments (id) on delete cascade;

create index anchored_comments_chapter_id_idx on public.anchored_comments (chapter_id);
create index anchored_comments_quest_idx on public.anchored_comments (quest_id, quest_source) where quest_id is not null;
create index anchored_comments_parent_idx on public.anchored_comments (parent_comment_id) where parent_comment_id is not null;

-- Tác giả ghim TỐI ĐA 1 bình luận chương (paragraph_index NULL) mỗi chương —
-- chỉ server (service-role) ghi được cột này, trigger chặn anon/authenticated.
-- Xem migrations/20261006_chapter_pinned_comment.sql.
alter table public.anchored_comments add column pinned_at timestamptz;

create unique index anchored_comments_one_pin_per_chapter
  on public.anchored_comments (chapter_id)
  where pinned_at is not null;

create or replace function public.anchored_comments_guard_pin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.pinned_at is distinct from (case when tg_op = 'UPDATE' then old.pinned_at else null end) then
    raise exception 'pinned_at chỉ được ghi qua server' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger anchored_comments_guard_pin
  before insert or update on public.anchored_comments
  for each row execute function public.anchored_comments_guard_pin();

alter table public.anchored_comments enable row level security;

-- Nội dung công khai dưới chương — ai cũng xem được, không cần đăng nhập.
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

-- --- Phiên đọc ghi ở server (Contest Engine Phase 2, P1): cột thời gian đọc
-- thật (active_seconds do server cộng theo khoảng thật giữa 2 nhịp 60 giây),
-- nguồn truy cập, đoạn xa nhất; record_reading_heartbeat() là đường ghi duy
-- nhất. Policy ở phần 10e chỉ còn SELECT. Xem
-- migrations/archive/20260926_add_reading_session_tracking.sql. ---

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

-- Trả id phiên (mới hoặc cũ) + active_seconds hiện tại.
-- p_session_id null / không khớp (người khác, chương khác, đã nguội > 30 phút)
-- → mở phiên mới.
alter table public.reading_sessions
  add column if not exists words_reached integer;

do $$ begin
  alter table public.reading_sessions add constraint reading_sessions_words_reached_check
    check (words_reached is null or words_reached >= 0);
exception when duplicate_object then null; end $$;

-- Slice 2.5a (migrations/archive/20260926_add_scoring_tracking.sql): thêm words_reached.
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

-- ===========================================================================
-- Hot-path indexes — migrations/20260929_add_hot_path_indexes.sql
-- ===========================================================================
create index if not exists reading_history_user_chapter_read_idx
  on public.reading_history (user_id, chapter_id, read_at);
create index if not exists reading_history_user_read_at_idx
  on public.reading_history (user_id, read_at desc) include (book_id);

-- ===========================================================================
-- Ranking aggregates — migrations/20260929_add_ranking_aggregates.sql
-- ===========================================================================
create index if not exists reading_history_read_at_idx
  on public.reading_history (read_at) include (book_id);

create or replace function public.book_read_counts_between(p_from timestamptz, p_to timestamptz)
returns table (book_id uuid, read_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select rh.book_id, count(*)::integer as read_count
  from public.reading_history rh
  where rh.read_at >= p_from and rh.read_at < p_to
  group by rh.book_id;
$$;

revoke execute on function public.book_read_counts_between(timestamptz, timestamptz) from public;
grant execute on function public.book_read_counts_between(timestamptz, timestamptz) to anon, authenticated, service_role;

-- 2. Thống kê chương đã publish theo sách — thay cho việc tải mọi hàng
-- chapters để đếm (home, rankings, thẻ truyện). Chạy với quyền owner nên
-- lọc ĐÚNG điều kiện công khai của policy "published chapters follow their
-- book's visibility": chương published của sách published, chưa xoá.
-- Track first publication, rather than draft creation or metadata edits.
alter table public.chapters add column if not exists published_at timestamptz;

-- Historical publication times were not recorded; created_at is the fallback.
update public.chapters set published_at = created_at
where published and published_at is null;

create or replace function public.set_chapter_published_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := case when new.published then now() else null end;
  else
    new.published_at := old.published_at;
    if new.published and not old.published and old.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_chapter_published_at on public.chapters;
create trigger set_chapter_published_at
before insert or update on public.chapters
for each row execute function public.set_chapter_published_at();

create or replace view public.book_chapter_stats as
  select c.book_id,
         count(*)::integer as published_chapter_count,
         bool_or(c.is_last_chapter) as has_published_last_chapter,
         max(coalesce(c.published_at, c.created_at)) as latest_published_chapter_at
  from public.chapters c
  join public.books b on b.id = c.book_id
  where c.published and b.published and b.deleted_at is null
  group by c.book_id;

grant select on public.book_chapter_stats to anon, authenticated, service_role;
