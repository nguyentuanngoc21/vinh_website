-- =======================================================================
-- Baseline 02 — Truyện & chương  (02_books_and_chapters.sql)
-- =======================================================================
-- Phạm vi: books/chapters, giá + độc quyền, chương cuối, nhân vật, tags +
-- lượt xem, soft-delete, genre, GRANT cột của books, kiểm duyệt cấp
-- chương/truyện, xoá chương nháp + sắp xếp chương.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     books, chapters, character_follows, character_trope_votes,
--     chapter_moderation_actions, book_moderation_actions,
--     book_exclusivity_events, character_book_links,
--     character_chapter_reviews, story_terms
--   Hàm:
--     increment_book_view_count, set_book_published_at,
--     reorder_book_chapters, log_book_exclusivity_event,
--     admin_set_book_exclusive, review_character_appearances,
--     public_character_appearances, check_chapter_background_path,
--     bump_chapter_content_version, touch_story_term
--
-- Gộp từ migration (migrations/archive/):
--   20260819_add_book_genre.sql, 20260820_add_chapter_price.sql,
--   20260824_add_book_tags_and_view_count.sql,
--   20260824_add_chapter_is_last.sql,
--   20260825_restrict_books_column_grants.sql,
--   20260826_add_book_exclusivity.sql, 20260826_add_book_soft_delete.sql,
--   20260901_add_manuscript_share.sql, 20260906_add_book_synopsis_grant.sql,
--   20260908_add_book_moderation.sql,
--   20260908_add_chapter_moderation_and_notifications.sql,
--   20260909_add_chapter_audio_url_and_price.sql,
--   20260919_add_characters.sql, 20260925_add_chapter_delete_and_reorder.sql
--   + migrations/20260929_add_hot_path_indexes.sql (phần của file này)
--   + migrations/20260930_book_exclusivity_default_and_history.sql
--   + migrations/20261009_character_appearance_reviews.sql
--   + migrations/20261009_chapter_background_image.sql
--   + migrations/20261009_chapter_content_version.sql
--   + migrations/20261009_story_terms.sql
--
-- Phụ thuộc (phải chạy trước): 01_extensions_and_accounts.sql
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 3. Books & chapters (minimal starting model for author + reading flows)
-- ---------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  slug text unique not null,
  synopsis text,
  -- Không có cột ảnh bìa ở đây — cột `cover_design_item_id` được thêm
  -- bằng ALTER TABLE ở phần 9, sau khi bảng design_items tồn tại (không
  -- thể tham chiếu forward tới 1 bảng chưa được tạo).
  published boolean not null default false,
  created_at timestamptz not null default now(),
  -- --- Soft-delete cho books — KHÔNG có DELETE thật/policy delete/GRANT
  -- delete ở đâu cả. deleted_at is null = còn sống. Điều kiện được phép xoá
  -- (chưa published, hoặc published nhưng không exclusive; và không có
  -- purchase_transactions nào của chương thuộc sách) enforce ở API route
  -- (src/app/api/authoring/books/[bookId]/route.ts, DELETE) — không ở DB,
  -- vì purchase_transactions.chapter_id là uuid trần, không FK, và rule
  -- phụ thuộc business logic. Xem migrations/archive/20260826_add_book_soft_delete.sql.
  -- Khai báo ngay trong CREATE TABLE (không ALTER ở cuối phần 3 như trước)
  -- vì policy "published books are public" + policy của chapters/characters
  -- ngay bên dưới đọc cột này. ---
  deleted_at timestamptz,
  -- "Hoàn thiện" — xem phần 12e (prevent_unfinalize_book +
  -- lock_manuscript_grants_on_finalize) và
  -- migrations/archive/20260901_add_manuscript_share.sql. Khai báo ở đây (không
  -- ALTER ở phần 12e như trước) vì GRANT UPDATE cột của books (ngay trước
  -- phần 9) có finalized_at.
  finalized_at timestamptz
);

alter table public.books enable row level security;

-- deleted_at is null: sách bị soft-delete (phần 3b, xem
-- migrations/archive/20260826_add_book_soft_delete.sql) không còn hiện với khách
-- công khai, dù published vẫn true. Tác giả (auth.uid() = author_id) vẫn
-- thấy được để khôi phục.
create policy "published books are public"
  on public.books for select
  using ((published and deleted_at is null) or auth.uid() = author_id);

create policy "authors manage their own books"
  on public.books for insert
  with check (auth.uid() = author_id);

create policy "authors update their own books"
  on public.books for update
  using (auth.uid() = author_id);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  title text not null,
  content text not null,
  order_index integer not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.chapters enable row level security;

create policy "published chapters follow their book's visibility"
  on public.chapters for select
  using (
    published and exists (
      select 1 from public.books b where b.id = book_id and b.published and b.deleted_at is null
    )
    or exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid())
  );

create policy "authors manage chapters on their own books"
  on public.chapters for insert
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()));

create policy "authors update chapters on their own books"
  on public.chapters for update
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()));

-- --- Giá + độc quyền — panel xuất bản (src/components/author/publish-panel.tsx).
-- price: số token đọc chương, 0 = miễn phí (không CHECK > 0 như
-- purchase_transactions.amount — đó là số tiền 1 giao dịch thật, đây là
-- giá niêm yết). is_exclusive: mặc định true, khớp UI mock cũ. Không cần
-- RLS/trigger riêng — 2 cột thường, đã được policy update ở trên cover.
-- Xem migrations/archive/20260820_add_chapter_price.sql. ---
alter table public.chapters
  add column price integer not null default 0;

alter table public.chapters
  add constraint chapters_price_check check (price >= 0);

alter table public.chapters
  add column is_exclusive boolean not null default true;

-- --- Link audio + giá audio riêng — panel xuất bản, hàng "Truyện audio"
-- chỉ hiện khi audio_url có giá trị (src/components/author/publish-panel.tsx).
-- Link đơn giản do tác giả tự dán, KHÔNG qua cơ chế "share link nội bộ
-- id&token" của chapter_audio_links/audio_narrations (ChapterAudioPanel) —
-- 2 cơ chế song song, không đụng nhau. audio_price CHƯA enforce chặn nghe,
-- chỉ lưu giá niêm yết — xem
-- migrations/archive/20260909_add_chapter_audio_url_and_price.sql. ---
alter table public.chapters
  add column audio_url text;

alter table public.chapters
  add column audio_price integer not null default 0;

alter table public.chapters
  add constraint chapters_audio_price_check check (audio_price >= 0);

-- --- Chương cuối — checkbox 1 chiều ở chapter-editor.tsx, dùng để tính
-- trạng thái "Đã hoàn thành" ở trang giới thiệu truyện (/truyen/[slug]).
-- Tối đa 1 chương/sách được true, và KHÔNG được đổi lại false (trigger
-- dưới đây chặn ở mức DB, áp dụng cả với service-role key).
-- Xem migrations/archive/20260824_add_chapter_is_last.sql. ---
alter table public.chapters
  add column is_last_chapter boolean not null default false;

create unique index chapters_one_last_chapter_per_book_idx
  on public.chapters (book_id) where is_last_chapter;

create function public.prevent_unset_last_chapter()
returns trigger as $$
begin
  if old.is_last_chapter = true and new.is_last_chapter = false then
    raise exception 'is_last_chapter is irreversible once set to true (chapter %)', old.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger prevent_unset_last_chapter
  before update on public.chapters
  for each row execute function public.prevent_unset_last_chapter();

-- --- Hệ thống Nhân vật — công cụ THẬT cho tác giả quản lý nhân vật
-- trong truyện (không chỉ để mở khoá quest/thành tựu). role phân loại
-- rộng (chính diện/phản diện/trung lập); trope là free-text tác giả tự
-- gõ (vd "Ma vương", "Trượng nghĩa"), cùng tinh thần books.tags — không
-- danh mục cố định. Xem migrations/archive/20260919_add_characters.sql. ---
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  role text not null default 'neutral' check (role in ('hero', 'villain', 'neutral')),
  trope text,
  created_at timestamptz not null default now()
);

create index characters_book_id_idx on public.characters (book_id);

alter table public.characters enable row level security;

-- Cùng 2 nhánh với "published chapters follow their book's visibility" ở
-- trên — công khai nếu sách đã publish, tác giả luôn xem được sách của
-- chính mình.
create policy "characters follow their book's visibility"
  on public.characters for select
  using (
    exists (select 1 from public.books b where b.id = book_id and b.published and b.deleted_at is null)
    or exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid())
  );

create policy "authors manage characters in their own books"
  on public.characters for all
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()))
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()));

-- Nhân vật nào xuất hiện ở chương nào (n-n) — tác giả tự gắn khi soạn
-- chương (src/components/author/chapter-characters-panel.tsx).
create table public.chapter_characters (
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  primary key (chapter_id, character_id)
);

create index chapter_characters_character_id_idx on public.chapter_characters (character_id);

alter table public.chapter_characters enable row level security;

create policy "chapter_characters follow their chapter's visibility"
  on public.chapter_characters for select
  using (
    exists (
      select 1 from public.chapters c join public.books b on b.id = c.book_id
      where c.id = chapter_id and c.published and b.published and b.deleted_at is null
    )
    or exists (
      select 1 from public.chapters c join public.books b on b.id = c.book_id
      where c.id = chapter_id and b.author_id = auth.uid()
    )
  );

create policy "authors tag characters in their own chapters"
  on public.chapter_characters for all
  using (
    exists (
      select 1 from public.chapters c join public.books b on b.id = c.book_id
      where c.id = chapter_id and b.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chapters c join public.books b on b.id = c.book_id
      where c.id = chapter_id and b.author_id = auth.uid()
    )
  );

-- Độc giả follow 1 nhân vật — toggle, cùng pattern author_follows (phần 4).
create table public.character_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, character_id)
);

create index character_follows_character_id_idx on public.character_follows (character_id);

alter table public.character_follows enable row level security;

create policy "users manage their own character follows"
  on public.character_follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

-- Bình chọn "mẫu hình nhân vật yêu thích" trong 1 chương cụ thể — 1
-- vote/chương/user (unique), đổi ý thì UPDATE, không insert thêm.
create table public.character_trope_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, chapter_id)
);

create index character_trope_votes_character_id_idx on public.character_trope_votes (character_id);

alter table public.character_trope_votes enable row level security;

create policy "users manage their own trope votes"
  on public.character_trope_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- Tags tự do (KHÁC genre — 1 sách vẫn 1 genre, xem phần 9) + lượt
-- xem. Xem migrations/archive/20260824_add_book_tags_and_view_count.sql. ---
alter table public.books
  add column tags text[] not null default '{}';

alter table public.books
  add constraint books_tags_length_check check (cardinality(tags) <= 20);

alter table public.books
  add column view_count integer not null default 0;

alter table public.books
  add constraint books_view_count_check check (view_count >= 0);

-- security definer: tăng view an toàn dưới race condition, và không cho
-- client tự set view_count bằng bất kỳ số nào — chỉ +1 đúng 1 sách
-- published/lần gọi. Escape hatch DUY NHẤT để đổi cột này.
create function public.increment_book_view_count(p_book_id uuid)
returns void as $$
  update public.books set view_count = view_count + 1
  where id = p_book_id and published;
$$ language sql security definer set search_path = public;

grant execute on function public.increment_book_view_count(uuid) to anon, authenticated;

-- --- Soft-delete cho books: cột deleted_at đã chuyển vào CREATE TABLE
-- public.books (đầu phần 3) — xem ghi chú ở đó. ---

-- --- Độc quyền chuyển lên cấp TRUYỆN (trước đây chỉ có chapters.is_exclusive
-- ở phần 3, không nhất quán giữa các chương cùng 1 sách). Cột
-- chapters.is_exclusive GIỮ NGUYÊN, không drop — app đã ngừng đọc/viết nó.
-- published_at: mốc để tính "khoá exclusivity 3 ngày sau khi publish" —
-- set đúng 1 lần bởi trigger dưới, KHÔNG có trong bất kỳ GRANT nào (tác
-- giả không được tự set/backdate). Rule 3-ngày enforce ở API route
-- (không phải CHECK/trigger — CHECK không re-evaluate theo now() khi
-- thời gian trôi qua, và admin override qua service-role phải bypass
-- được rule này mà service-role không bypass trigger/constraint).
-- Xem migrations/archive/20260826_add_book_exclusivity.sql.
-- Mặc định false (Tự do) từ migrations/20260930_book_exclusivity_default_and_history.sql
-- — chỉ độc quyền khi tác giả chủ động chọn. ---
alter table public.books
  add column is_exclusive boolean not null default false;

alter table public.books
  add column published_at timestamptz;

create function public.set_book_published_at()
returns trigger as $$
begin
  if old.published = false and new.published = true and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger set_book_published_at
  before update on public.books
  for each row execute function public.set_book_published_at();

-- --- Genre — dùng bởi hệ thống sinh bìa tự động (src/lib/covers/*) khi
-- sách chưa có cover_design_item_id. text + CHECK, không phải enum, để sửa
-- 1 giá trị sai hay thêm thể loại chỉ cần đổi constraint, không phải mổ
-- lại type — đã đúng như vậy: 10 giá trị dưới đây là taxonomy CHÍNH THỨC
-- của nền tảng, thay thế 8 giá trị tạm ban đầu (xem
-- migrations/archive/20260825_update_book_genres.sql). Nullable: sách cũ chưa có
-- genre, code sinh bìa có nhánh fallback riêng cho null, không cần
-- database nói dối bằng default giả. Không cần RLS/trigger riêng — genre
-- là cột thường, đã được policy "authors update their own books" ở phần 3
-- cover sẵn (khác cover_design_item_id, không phải link chéo bảng cần
-- xác thực share_token). ---
alter table public.books
  add column genre text;

alter table public.books
  add constraint books_genre_check
  check (genre is null or genre in (
    'Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám',
    'Tâm lý - tội phạm', 'Tình cảm', 'Đời sống - Xã hội',
    'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'
  ));

create index books_genre_idx
  on public.books (genre) where genre is not null;

-- RLS ("authors update their own books", phần 3) chỉ kiểm AI được sửa
-- hàng, không kiểm CỘT NÀO — Postgres RLS không làm được việc đó ở cấp
-- cột. GRANT cấp cột dưới đây là lớp chặn bổ sung: dù đúng là chủ sách,
-- client chỉ sửa được đúng các cột đang thật sự có đường update từ code
-- (title/genre/tags qua PATCH /api/authoring/books/[bookId], published tự
-- flip khi publish chương đầu tiên) — không tự PATCH thẳng
-- view_count/author_id/... qua REST API của Supabase (anon key + JWT của
-- chính họ) để bỏ qua route app. Đặt ở đây (không phải ngay sau policy ở
-- phần 3) vì genre/tags chỉ vừa tồn tại tới điểm này trong file.
-- Xem migrations/archive/20260825_restrict_books_column_grants.sql. Danh sách
-- cột được mở rộng thêm deleted_at (soft-delete) và is_exclusive (độc
-- quyền cấp truyện) bởi migrations/archive/20260826_add_book_soft_delete.sql và
-- 20260826_add_book_exclusivity.sql, rồi finalized_at ("Hoàn thiện" —
-- Share bản thảo, phần 12e) bởi migrations/archive/20260901_add_manuscript_share.sql
-- — published_at CỐ Ý không có trong danh sách này, xem comment ở phần 3.
-- Cột `synopsis` được cộng thêm bởi migrations/archive/20260906_add_book_synopsis_grant.sql
-- — tác giả sửa tóm tắt truyện qua PATCH /api/authoring/books/[bookId].
revoke update on public.books from authenticated, anon;
grant update (title, genre, tags, published, deleted_at, is_exclusive, finalized_at, synopsis) on public.books to authenticated;

-- --- Admin duyệt/gỡ chương + Thông báo — xem
-- migrations/archive/20260908_add_chapter_moderation_and_notifications.sql.
-- Người gửi tin nhắn khi gỡ chương LÀ chính admin thực hiện thao tác đó
-- (tài khoản thật, không phải 1 tài khoản "hệ thống" ẩn danh riêng) — xem
-- api/admin/chapters/[chapterId]/route.ts. ---

-- Trạng thái gỡ/khôi phục chương của ADMIN — tách biệt hẳn với `published`
-- (published=false do admin gỡ phải phân biệt được với published=false vì
-- tác giả tự để nháp).
alter table public.chapters
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users (id),
  add column removed_reason_group text,
  add column removed_reason_detail text;

-- Nhật ký MỌI lần gỡ/khôi phục (audit trail) — giữ lại lịch sử đầy đủ,
-- không chỉ trạng thái hiện tại ở chapters.removed_*.
create table public.chapter_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  admin_id uuid not null references auth.users (id),
  action text not null check (action in ('removed', 'restored')),
  reason_group text,
  reason_detail text,
  created_at timestamptz not null default now()
);

alter table public.chapter_moderation_actions enable row level security;

create policy "admins view chapter moderation actions"
  on public.chapter_moderation_actions for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create index chapter_moderation_actions_chapter_idx
  on public.chapter_moderation_actions (chapter_id, created_at);

-- --- Kiểm duyệt CẤP TRUYỆN (book-level) — dùng chung kiến trúc với
-- kiểm duyệt cấp chương ở trên (bắt buộc lý do, audit trail, thông báo +
-- tin nhắn hệ thống từ chính admin thực hiện). books.deleted_at đã có sẵn
-- từ phần soft-delete phía trên — dùng lại, chỉ thêm 3 cột lý do. Xem
-- migrations/archive/20260908_add_book_moderation.sql. ---
alter table public.books
  add column removed_by uuid references auth.users (id),
  add column removed_reason_group text,
  add column removed_reason_detail text;

create table public.book_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  admin_id uuid not null references auth.users (id),
  action text not null check (action in ('removed', 'restored')),
  reason_group text,
  reason_detail text,
  created_at timestamptz not null default now()
);

alter table public.book_moderation_actions enable row level security;

create policy "admins view book moderation actions"
  on public.book_moderation_actions for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create index book_moderation_actions_book_idx
  on public.book_moderation_actions (book_id, created_at);

-- --- Lịch sử độc quyền: trigger ghi mọi lần tạo truyện + đổi is_exclusive;
-- admin đổi qua RPC admin_set_book_exclusive (bắt buộc lý do, đặt biến phiên
-- vinh.exclusivity_actor/_reason cho trigger đọc). Xem
-- migrations/20260930_book_exclusivity_default_and_history.sql. ---
create table public.book_exclusivity_events (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  -- null = sự kiện tạo truyện (trạng thái ban đầu).
  from_exclusive boolean,
  to_exclusive boolean not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_kind text not null check (actor_kind in ('author', 'admin', 'system')),
  reason text,
  created_at timestamptz not null default now()
);

create index book_exclusivity_events_book_idx
  on public.book_exclusivity_events (book_id, created_at);

alter table public.book_exclusivity_events enable row level security;

create policy "admins view book exclusivity events"
  on public.book_exclusivity_events for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

revoke insert, update, delete on public.book_exclusivity_events from anon, authenticated;

create function public.log_book_exclusivity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting text := nullif(current_setting('vinh.exclusivity_actor', true), '');
  v_actor uuid;
  v_kind text;
  v_reason text := nullif(current_setting('vinh.exclusivity_reason', true), '');
begin
  if tg_op = 'UPDATE' and old.is_exclusive is not distinct from new.is_exclusive then
    return new;
  end if;

  if v_setting is not null and exists (
    select 1 from public.profiles where id = v_setting::uuid and role in ('admin', 'super_admin')
  ) then
    v_actor := v_setting::uuid;
    v_kind := 'admin';
  elsif auth.uid() is not null and auth.uid() = new.author_id then
    v_actor := auth.uid();
    v_kind := 'author';
    v_reason := null;
  else
    v_actor := auth.uid();
    v_kind := 'system';
    v_reason := null;
  end if;

  insert into public.book_exclusivity_events (book_id, from_exclusive, to_exclusive, actor_id, actor_kind, reason)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.is_exclusive end,
    new.is_exclusive,
    v_actor,
    v_kind,
    v_reason
  );
  return new;
end;
$$;

revoke execute on function public.log_book_exclusivity_event() from public, anon, authenticated;

create trigger log_book_exclusivity_event
  after insert or update of is_exclusive on public.books
  for each row execute function public.log_book_exclusivity_event();

create function public.admin_set_book_exclusive(
  p_book_id uuid,
  p_admin_id uuid,
  p_exclusive boolean,
  p_reason text
) returns public.books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_book public.books;
begin
  -- Kiểm lại ở DB vì service-role bỏ qua RLS.
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'Not an admin' using errcode = 'insufficient_privilege';
  end if;
  if v_reason is null then
    raise exception 'Reason is required' using errcode = 'check_violation', hint = 'exclusivity_reason_required';
  end if;

  perform set_config('vinh.exclusivity_actor', p_admin_id::text, true);
  perform set_config('vinh.exclusivity_reason', left(v_reason, 500), true);

  update public.books set is_exclusive = p_exclusive where id = p_book_id returning * into v_book;

  -- Xoá biến phiên ngay — không để lọt sang câu lệnh khác cùng transaction.
  perform set_config('vinh.exclusivity_actor', '', true);
  perform set_config('vinh.exclusivity_reason', '', true);

  return v_book; -- null nếu không có truyện
end;
$$;

revoke execute on function public.admin_set_book_exclusive(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_book_exclusive(uuid, uuid, boolean, text) to service_role;
-- --- Xoá chương nháp + sắp xếp thứ tự chương (tác giả, web + mobile).
-- Xem migrations/archive/20260925_add_chapter_delete_and_reorder.sql. ---
drop policy if exists "authors delete draft chapters on their own books" on public.chapters;
create policy "authors delete draft chapters on their own books"
  on public.chapters for delete
  using (
    not published
    and removed_at is null
    and not is_last_chapter
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null
    )
  );

create or replace function public.reorder_book_chapters(p_book_id uuid, p_chapter_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_last uuid;
begin
  if not exists (
    select 1 from public.books
    where id = p_book_id and author_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'Book % not found or not owned by caller', p_book_id;
  end if;

  -- Khoá các chương của sách: 2 lần sắp xếp song song không ghi đè lẫn nhau.
  perform 1 from public.chapters where book_id = p_book_id for update;
  select count(*) into v_total from public.chapters where book_id = p_book_id;

  if coalesce(array_length(p_chapter_ids, 1), 0) <> v_total
     or (select count(distinct x) from unnest(p_chapter_ids) as x) <> v_total
     or exists (
       select 1 from unnest(p_chapter_ids) as x
       where not exists (select 1 from public.chapters c where c.id = x and c.book_id = p_book_id)
     ) then
    raise exception 'Chapter list must contain every chapter of the book exactly once';
  end if;

  select id into v_last from public.chapters where book_id = p_book_id and is_last_chapter;
  if v_last is not null and p_chapter_ids[v_total] <> v_last then
    raise exception 'The last chapter must stay last';
  end if;

  update public.chapters c
     set order_index = t.ord
    from unnest(p_chapter_ids) with ordinality as t(id, ord)
   where c.id = t.id and c.book_id = p_book_id and c.order_index is distinct from t.ord::integer;
end;
$$;

revoke execute on function public.reorder_book_chapters(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_book_chapters(uuid, uuid[]) to authenticated;

create index if not exists chapters_book_order_idx
  on public.chapters (book_id, order_index);

create index if not exists books_author_created_idx
  on public.books (author_id, created_at desc) where deleted_at is null;

-- Character management: 20260930_character_management.sql
alter table public.characters
  add column if not exists archived_at timestamptz,
  add column if not exists is_public boolean not null default true,
  add column if not exists show_role boolean not null default true,
  add column if not exists story_role text not null default 'supporting',
  add column if not exists aliases text,
  add column if not exists avatar_url text,
  add column if not exists description text,
  add column if not exists private_notes text;
-- Existing characters keep their previous visibility; new ones are private.
alter table public.characters alter column is_public set default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.characters'::regclass and conname = 'characters_profile_valid') then
    alter table public.characters add constraint characters_profile_valid check (
      char_length(name) <= 60 and char_length(trope) <= 40
      and story_role in ('main', 'supporting', 'cameo')
      and char_length(aliases) <= 200 and char_length(description) <= 2000
      and char_length(private_notes) <= 5000
      and (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://[^[:space:]]+$'))
    ) not valid;
  end if;
end $$;

-- Base table is author-only, including all private fields. The public view
-- deliberately runs with its owner's rights and exposes a fixed safe projection.
drop policy if exists "characters follow their book's visibility" on public.characters;
drop policy if exists "authors manage characters in their own books" on public.characters;
create policy "authors manage characters in their own books" on public.characters for all
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null))
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null));
revoke delete, truncate, references, trigger on public.characters from public, anon, authenticated;

create or replace view public.public_characters with (security_barrier = true) as
select c.id, c.book_id, c.name,
  case when c.show_role then c.role else null::text end as role,
  c.trope, c.story_role, c.aliases, c.avatar_url, c.description, c.created_at
from public.characters c join public.books b on b.id = c.book_id
where c.is_public and c.archived_at is null and b.published and b.deleted_at is null;
revoke all on public.public_characters from public, anon, authenticated;
grant select on public.public_characters to anon, authenticated, service_role;

-- Only the transactional RPC may change chapter associations. Interactions
-- go through server endpoints, which verify visibility and chapter access.
revoke insert, update, delete, truncate, references, trigger on public.chapter_characters from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.character_trope_votes from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.character_follows from public, anon, authenticated;

create or replace function public.check_character_book() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'characters' then
    if new.book_id is distinct from old.book_id then
      raise exception 'Cannot move a character to another book' using errcode = '23514';
    end if;
  elsif tg_table_name = 'chapters' then
    if new.book_id is distinct from old.book_id and exists (
      select 1 from public.chapter_characters cc where cc.chapter_id = old.id
    ) then
      raise exception 'Cannot move a chapter with character tags' using errcode = '23514';
    end if;
  elsif not exists (
    select 1 from public.chapters ch join public.characters c on c.book_id = ch.book_id
    where ch.id = new.chapter_id and c.id = new.character_id
  ) then
    raise exception 'Character must belong to the chapter book' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists character_book_immutable on public.characters;
create trigger character_book_immutable before update of book_id on public.characters
for each row execute function public.check_character_book();
drop trigger if exists tagged_chapter_book_immutable on public.chapters;
create trigger tagged_chapter_book_immutable before update of book_id on public.chapters
for each row execute function public.check_character_book();
drop trigger if exists chapter_character_same_book on public.chapter_characters;
create trigger chapter_character_same_book before insert or update on public.chapter_characters
for each row execute function public.check_character_book();
drop trigger if exists trope_vote_same_book on public.character_trope_votes;
create trigger trope_vote_same_book before insert or update on public.character_trope_votes
for each row execute function public.check_character_book();

create or replace function public.set_chapter_characters(
  p_chapter_id uuid, p_character_ids uuid[], p_expected_character_ids uuid[] default null
) returns uuid[] language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book_id uuid;
  v_current uuid[];
  v_next uuid[];
  v_expected uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_character_ids is null or array_position(p_character_ids, null) is not null
    or cardinality(p_character_ids) > 500 or array_position(p_expected_character_ids, null) is not null then
    raise exception 'Invalid character list' using errcode = '22023';
  end if;
  -- Serialize all writers of the same chapter, including legacy clients.
  select ch.book_id into v_book_id from public.chapters ch
    join public.books b on b.id = ch.book_id
    where ch.id = p_chapter_id and b.author_id = auth.uid() and b.deleted_at is null
    for update of ch;
  if not found then raise exception 'Chapter not found or forbidden' using errcode = '42501'; end if;

  select coalesce(array_agg(character_id order by character_id), '{}'::uuid[]) into v_current
    from public.chapter_characters where chapter_id = p_chapter_id;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_next from unnest(p_character_ids) x;
  if p_expected_character_ids is not null then
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_expected from unnest(p_expected_character_ids) x;
    if v_expected is distinct from v_current then
      raise exception 'Character list changed; reload before saving' using errcode = '40001';
    end if;
  end if;

  -- Lock referenced profiles until commit, so archive/move cannot race this check.
  perform 1 from public.characters where id = any(v_next) order by id for share;
  if exists (
    select 1 from unnest(v_next) x left join public.characters c on c.id = x
    where c.id is null or c.book_id <> v_book_id
      or (c.archived_at is not null and not (c.id = any(v_current)))
  ) then raise exception 'Invalid, archived or foreign character' using errcode = '22023'; end if;

  delete from public.chapter_characters where chapter_id = p_chapter_id and not (character_id = any(v_next));
  insert into public.chapter_characters(chapter_id, character_id)
    select p_chapter_id, x from unnest(v_next) x on conflict do nothing;
  return v_next;
end $$;
revoke all on function public.set_chapter_characters(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.set_chapter_characters(uuid, uuid[], uuid[]) to authenticated;

-- Character delete window: 20260930_character_delete_recent.sql
-- created_at is the delete window's clock, so clients must not set or move it
-- (the author RLS policy otherwise allows direct inserts/updates).
create or replace function public.guard_character_created_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  elsif new.created_at is distinct from old.created_at then
    raise exception 'created_at is read-only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists character_created_at_guard on public.characters;
create trigger character_created_at_guard before insert or update of created_at on public.characters
for each row execute function public.guard_character_created_at();

create or replace function public.delete_recent_character(p_book_id uuid, p_character_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Row lock: waits for in-flight chapter tagging (FOR SHARE) and blocks new tags.
  select c.created_at into v_created_at from public.characters c
    join public.books b on b.id = c.book_id
    where c.id = p_character_id and c.book_id = p_book_id
      and b.author_id = auth.uid() and b.deleted_at is null
    for update of c;
  if not found then raise exception 'Character not found or forbidden' using errcode = '42501'; end if;
  if v_created_at < now() - interval '15 minutes' then
    raise exception 'Delete window expired' using errcode = '55000', hint = 'expired';
  end if;
  if exists (select 1 from public.character_follows where character_id = p_character_id)
    or exists (select 1 from public.character_trope_votes where character_id = p_character_id) then
    raise exception 'Character has reader activity' using errcode = '55000', hint = 'reader_activity';
  end if;
  -- chapter_characters rows cascade.
  delete from public.characters where id = p_character_id;
end $$;
revoke all on function public.delete_recent_character(uuid, uuid) from public, anon;
grant execute on function public.delete_recent_character(uuid, uuid) to authenticated;


-- Character appearance scan reviews: 20261009_character_appearance_reviews.sql

-- How a character appears in ANOTHER book of the same author: 'main' lists
-- confirmed chapters, 'cameo' lists only the book title, 'dismissed' hides it
-- from future scans. The character's own book never has a row.
create table if not exists public.character_book_links (
  character_id uuid not null references public.characters (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  appearance text not null check (appearance in ('main', 'cameo', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, book_id)
);
create index if not exists character_book_links_book_id_idx on public.character_book_links (book_id);

-- Per-chapter decisions. Own-book chapters only ever hold 'dismissed'
-- (confirmed ones live in chapter_characters); other books' chapters hold both.
create table if not exists public.character_chapter_reviews (
  character_id uuid not null references public.characters (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  decision text not null check (decision in ('confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (character_id, chapter_id)
);
create index if not exists character_chapter_reviews_chapter_id_idx on public.character_chapter_reviews (chapter_id);

alter table public.character_book_links enable row level security;
alter table public.character_chapter_reviews enable row level security;

drop policy if exists "authors read their characters' book links" on public.character_book_links;
create policy "authors read their characters' book links" on public.character_book_links for select
  using (exists (select 1 from public.characters c join public.books b on b.id = c.book_id
    where c.id = character_id and b.author_id = auth.uid() and b.deleted_at is null));
drop policy if exists "authors read their characters' chapter reviews" on public.character_chapter_reviews;
create policy "authors read their characters' chapter reviews" on public.character_chapter_reviews for select
  using (exists (select 1 from public.characters c join public.books b on b.id = c.book_id
    where c.id = character_id and b.author_id = auth.uid() and b.deleted_at is null));

-- Writes only through review_character_appearances.
revoke insert, update, delete, truncate, references, trigger on public.character_book_links from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.character_chapter_reviews from public, anon, authenticated;
revoke all on public.character_book_links from anon;
revoke all on public.character_chapter_reviews from anon;
grant select on public.character_book_links, public.character_chapter_reviews to authenticated;
grant all on public.character_book_links, public.character_chapter_reviews to service_role;

create or replace function public.review_character_appearances(
  p_character_id uuid,
  p_confirm_chapter_ids uuid[] default '{}',
  p_dismiss_chapter_ids uuid[] default '{}',
  p_reset_chapter_ids uuid[] default '{}',
  p_main_book_ids uuid[] default '{}',
  p_cameo_book_ids uuid[] default '{}',
  p_dismiss_book_ids uuid[] default '{}',
  p_reset_book_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book_id uuid;
  v_chapters uuid[];
  v_books uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_confirm_chapter_ids is null or p_dismiss_chapter_ids is null or p_reset_chapter_ids is null
    or p_main_book_ids is null or p_cameo_book_ids is null or p_dismiss_book_ids is null or p_reset_book_ids is null
    or array_position(p_confirm_chapter_ids || p_dismiss_chapter_ids || p_reset_chapter_ids, null) is not null
    or array_position(p_main_book_ids || p_cameo_book_ids || p_dismiss_book_ids || p_reset_book_ids, null) is not null
    or cardinality(p_confirm_chapter_ids || p_dismiss_chapter_ids || p_reset_chapter_ids) > 5000
    or cardinality(p_main_book_ids || p_cameo_book_ids || p_dismiss_book_ids || p_reset_book_ids) > 500 then
    raise exception 'Invalid review list' using errcode = '22023';
  end if;
  v_chapters := p_confirm_chapter_ids || p_dismiss_chapter_ids || p_reset_chapter_ids;
  v_books := p_main_book_ids || p_cameo_book_ids || p_dismiss_book_ids || p_reset_book_ids;
  -- One decision per chapter/book per call.
  if (select count(distinct x) from unnest(v_chapters) x) <> cardinality(v_chapters)
    or (select count(distinct x) from unnest(v_books) x) <> cardinality(v_books) then
    raise exception 'Conflicting decisions' using errcode = '22023';
  end if;

  -- Lock like set_chapter_characters, so archive/delete cannot race this.
  select c.book_id into v_book_id from public.characters c join public.books b on b.id = c.book_id
    where c.id = p_character_id and b.author_id = auth.uid() and b.deleted_at is null and c.archived_at is null
    for share of c;
  if not found then raise exception 'Character not found, archived or forbidden' using errcode = '42501'; end if;

  if exists (
    select 1 from unnest(v_books) x left join public.books b on b.id = x
    where b.id is null or b.author_id <> auth.uid() or b.deleted_at is not null or b.id = v_book_id
  ) then raise exception 'Invalid or foreign book' using errcode = '22023'; end if;
  -- Serialize with set_chapter_characters on the same chapters.
  perform 1 from public.chapters where id = any(v_chapters) order by id for update;
  if exists (
    select 1 from unnest(v_chapters) x left join public.chapters ch on ch.id = x
      left join public.books b on b.id = ch.book_id
    where ch.id is null or b.author_id <> auth.uid() or b.deleted_at is not null
  ) or exists (
    select 1 from public.chapters ch where ch.id = any(p_confirm_chapter_ids) and ch.removed_at is not null
  ) then raise exception 'Invalid or foreign chapter' using errcode = '22023'; end if;

  delete from public.character_book_links where character_id = p_character_id and book_id = any(p_reset_book_ids);
  insert into public.character_book_links (character_id, book_id, appearance)
    select p_character_id, x, 'main' from unnest(p_main_book_ids) x
    union all select p_character_id, x, 'cameo' from unnest(p_cameo_book_ids) x
    union all select p_character_id, x, 'dismissed' from unnest(p_dismiss_book_ids) x
  on conflict (character_id, book_id) do update set appearance = excluded.appearance, updated_at = now();

  -- Another book's chapters can only be confirmed while that book is 'main'.
  if exists (
    select 1 from public.chapters ch where ch.id = any(p_confirm_chapter_ids) and ch.book_id <> v_book_id
      and not exists (select 1 from public.character_book_links l
        where l.character_id = p_character_id and l.book_id = ch.book_id and l.appearance = 'main')
  ) then raise exception 'Book is not a main appearance' using errcode = '22023'; end if;

  delete from public.character_chapter_reviews where character_id = p_character_id
    and chapter_id = any(p_reset_chapter_ids || p_confirm_chapter_ids);
  insert into public.chapter_characters (chapter_id, character_id)
    select ch.id, p_character_id from public.chapters ch
    where ch.id = any(p_confirm_chapter_ids) and ch.book_id = v_book_id
  on conflict do nothing;
  insert into public.character_chapter_reviews (character_id, chapter_id, decision)
    select p_character_id, ch.id, 'confirmed' from public.chapters ch
    where ch.id = any(p_confirm_chapter_ids) and ch.book_id <> v_book_id
    union all
    -- An already tagged own-book chapter is untagged from the chapter panel, not here.
    select p_character_id, ch.id, 'dismissed' from public.chapters ch
    where ch.id = any(p_dismiss_chapter_ids) and not (ch.book_id = v_book_id and exists (
      select 1 from public.chapter_characters cc where cc.chapter_id = ch.id and cc.character_id = p_character_id))
  on conflict (character_id, chapter_id) do update set decision = excluded.decision, created_at = now();
end $$;
revoke all on function public.review_character_appearances(uuid, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.review_character_appearances(uuid, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]) to authenticated;

-- Reader-facing list behind the hover popover: only public, unarchived
-- characters of a published book, and only published, unremoved chapters of
-- published books. chapter_id is null for a cameo book.
create or replace function public.public_character_appearances(p_character_id uuid)
returns table (book_id uuid, book_title text, appearance text, chapter_id uuid, chapter_title text, order_index integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with ch as (
    select c.id, c.book_id from public.characters c join public.books b on b.id = c.book_id
    where c.id = p_character_id and c.is_public and c.archived_at is null and b.published and b.deleted_at is null
  )
  select b.id, b.title, 'own'::text, x.id, x.title, x.order_index
    from ch join public.chapter_characters cc on cc.character_id = ch.id
    join public.chapters x on x.id = cc.chapter_id and x.book_id = ch.book_id
    join public.books b on b.id = x.book_id
    where x.published and x.removed_at is null
  union all
  select b.id, b.title, 'main'::text, x.id, x.title, x.order_index
    from ch join public.character_book_links l on l.character_id = ch.id and l.appearance = 'main'
    join public.books b on b.id = l.book_id and b.published and b.deleted_at is null
    join public.character_chapter_reviews r on r.character_id = ch.id and r.decision = 'confirmed'
    join public.chapters x on x.id = r.chapter_id and x.book_id = b.id
    where x.published and x.removed_at is null
  union all
  select b.id, b.title, 'cameo'::text, null::uuid, null::text, null::integer
    from ch join public.character_book_links l on l.character_id = ch.id and l.appearance = 'cameo'
    join public.books b on b.id = l.book_id and b.published and b.deleted_at is null
  order by 3, 2, 6;
$$;
revoke all on function public.public_character_appearances(uuid) from public;
grant execute on function public.public_character_appearances(uuid) to anon, authenticated, service_role;


-- Chapter background image: 20261009_chapter_background_image.sql

alter table public.chapters add column if not exists background_image_path text;

-- Authors may update their chapters directly (RLS), so pin the path to the
-- book author's own upload folder and the route's file-name pattern: a chapter
-- can never point at someone else's image.
create or replace function public.check_chapter_background_path() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_author uuid;
begin
  if new.background_image_path is null then return new; end if;
  select author_id into v_author from public.books where id = new.book_id;
  if v_author is null or new.background_image_path !~ ('^' || v_author::text || '/chapter-bg-' || new.id::text || '-[0-9]{1,16}\.(webp|png)$') then
    raise exception 'Invalid chapter background path' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists chapter_background_path_check on public.chapters;
create trigger chapter_background_path_check before insert or update of background_image_path on public.chapters
for each row execute function public.check_chapter_background_path();


-- Chapter content version (editor conflict check): 20261009_chapter_content_version.sql

alter table public.chapters add column if not exists content_version integer not null default 0;

-- Clients cannot set the counter: the trigger always derives it.
create or replace function public.bump_chapter_content_version() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 0;
  elsif new.content is distinct from old.content or new.title is distinct from old.title then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end $$;
drop trigger if exists chapter_content_version_bump on public.chapters;
create trigger chapter_content_version_bump before insert or update on public.chapters
for each row execute function public.bump_chapter_content_version();


-- Story terms (editor quick insert): 20261009_story_terms.sql

create table if not exists public.story_terms (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  kind text not null default 'other' check (kind in ('place', 'item', 'skill', 'organization', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  aliases text check (char_length(aliases) <= 200),
  description text check (char_length(description) <= 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, name)
);
create index if not exists story_terms_book_id_idx on public.story_terms (book_id);

alter table public.story_terms enable row level security;
drop policy if exists "authors manage terms in their own books" on public.story_terms;
create policy "authors manage terms in their own books" on public.story_terms for all
  using (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null))
  with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.deleted_at is null));

revoke all on public.story_terms from anon;
revoke truncate, references, trigger on public.story_terms from public, authenticated;
grant select, insert, delete on public.story_terms to authenticated;
-- A term never moves to another book; only these columns are editable.
revoke update on public.story_terms from authenticated;
grant update (kind, name, aliases, description, pinned) on public.story_terms to authenticated;
grant all on public.story_terms to service_role;

create or replace function public.touch_story_term() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists story_terms_touch on public.story_terms;
create trigger story_terms_touch before update on public.story_terms
for each row execute function public.touch_story_term();

