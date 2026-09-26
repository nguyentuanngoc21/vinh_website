-- Vịnh — starter Supabase schema.
--
-- Scope: covers accounts/roles, identity verification (CCCD upload),
-- a minimal books/chapters model, token wallet + transaction history,
-- daily tasks, vector-based book recommendations, author follows, 1-1
-- direct messages, and the connect directory (all real now — the
-- directory's "Truyện chữ"/"Audio"/"Design" sections read
-- books/public_audio_narrations/public_design_items by real author id;
-- see author_follows/direct_messages/author_public_profiles). /rankings'
-- "Truyện chữ" tab is real too now (src/lib/rankings/get-book-rankings.ts):
-- week/month/quarter (+ ▲/▼ vs the equal-length window before it) come
-- from book_read_counts_daily, a day-bucketed public aggregate over
-- reading_history (see that view's comment, and
-- migrations/20260831_add_book_read_counts_daily.sql); the all-time board
-- still ranks by books.view_count directly. /audio and /thiet-ke are real
-- now too (src/lib/audio/get-audio-catalog.ts,
-- src/lib/design/get-design-gallery.ts) — design_items grew
-- category/description/share_count + a design_item_likes table
-- (migrations/20260901_add_design_item_gallery_metadata.sql),
-- audio_narrations grew genre/play_count + an audio_progress table for
-- real "Nghe tiếp"/"Audio đang nghe" state
-- (migrations/20260901_add_audio_narration_hub_metadata.sql), and both
-- gained independent-upload routes (/thiet-ke/new, /audio/new) since
-- neither table ever got a row outside the book-cover/story_upload flow
-- before that. Still NOT modeled: blog — src/lib/blog.ts and /rankings'
-- "Audio"/"Blog" tabs (src/lib/rankings-data.ts) remain mock data, and the
-- connect directory's "Blog" section stays removed from the UI rather than
-- shown with fabricated numbers (src/components/connect/connect-directory.tsx);
-- add a blog_posts table the same way as you wire that section up for
-- real.
--
-- Run with: supabase db push  (or paste into the SQL editor)

-- ---------------------------------------------------------------------
-- 1. Roles & profiles
-- ---------------------------------------------------------------------
-- Mirrors src/lib/auth.ts's Role type. "author" is new — the current
-- frontend only distinguishes reader/admin (see auth.ts); add it once you
-- Mirrors src/lib/auth.ts's Role type — cập nhật lại 3 cấp:
--   'user'        — mặc định cho mọi người mới đăng ký. Tác giả, họa sĩ,
--                    diễn viên lồng tiếng KHÔNG phải role riêng — đó chỉ
--                    là tag mô tả (cột creator_tags bên dưới), ai cũng tự
--                    gắn được cho mình, không cần ai duyệt, vì tag không
--                    mang quyền hạn gì (khác hẳn role).
--   'admin'        — quản trị nội dung/người dùng hàng ngày.
--   'super_admin'  — mọi quyền của admin, CỘNG THÊM quyền duy nhất được
--                    đổi role của bất kỳ ai (kể cả phong thêm admin khác).
--                    Không có super_admin, hệ thống rơi vào tình huống
--                    admin có thể tự phong admin khác vô hạn — xem trigger
--                    ở phần 5.
create type public.user_role as enum ('user', 'admin', 'super_admin');

-- Tag mô tả vai trò sáng tác — KHÔNG phải quyền hạn hệ thống, giống hệt
-- tag thể loại truyện: tự gắn, gắn nhiều cái cùng lúc, không ảnh hưởng gì
-- tới RLS hay quyền truy cập. Một user có thể vừa là tác giả vừa là diễn
-- viên lồng tiếng cùng lúc — mảng cho phép nhiều giá trị.
-- 'blogger' thêm bởi migrations/20260901_add_blogger_creator_tag.sql — mục
-- "Blog" ở Kết nối vẫn CHƯA làm (chưa có bảng blog_posts thật, xem ghi
-- chú đầu file); tag này chỉ để lọc, không kéo theo mục tác phẩm nào.
create type public.creator_tag as enum ('author', 'illustrator', 'narrator', 'blogger');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  nickname text not null,
  avatar_url text, -- công khai — path trong bucket "avatars" (thêm ở phần 4) hoặc URL ngoài
  -- Ảnh bìa trang cá nhân/tác giả — cùng bucket "avatars", khác filename
  -- prefix ("cover-" thay vì "avatar-"), cùng folder-per-user nên RLS sẵn
  -- có không cần sửa. Xem migrations/20260828_add_profile_cover_image.sql.
  cover_image_url text,
  role public.user_role not null default 'user',
  creator_tags public.creator_tag[] not null default '{}',
  real_name text,
  phone text,
  -- migrations/20260829_add_author_contract_fields.sql — dùng để tự điền
  -- "BÊN A" trong Hợp đồng khai thác tác phẩm độc quyền (xem
  -- src/lib/legal/registry.ts) mà không cần tác giả gõ tay lại.
  date_of_birth date,
  address text,
  cccd_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Kiểm quyền admin cho policy của profiles. SECURITY DEFINER (bỏ qua RLS) —
-- nếu policy tự subquery trên profiles, Postgres báo 42P17 "infinite
-- recursion detected in policy for relation profiles" cho mọi role chịu RLS,
-- kể cả gián tiếp qua policy bảng khác. Không nhận tham số: chỉ trả lời về
-- chính người gọi. Xem migrations/20260926_fix_profiles_policy_recursion.sql.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

revoke execute on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated, service_role;

create policy "profiles are readable by their owner and admins"
  on public.profiles for select
  using (auth.uid() = id or public.current_user_is_admin());

create policy "users can update their own profile (not their own role)"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
  -- creator_tags sửa thoải mái qua policy này (không mang quyền hạn gì).
  -- role thì KHÔNG — dù policy này về lý thuyết cho sửa mọi cột của hàng
  -- mình, cột role bị chặn riêng bằng trigger ở phần 5 (RLS không diễn tả
  -- được "cho sửa cột này, cấm sửa cột kia" trong cùng 1 policy).

-- Chặn dứt điểm ở tầng GRANT — policy trên chỉ kiểm được AI được sửa
-- hàng, không kiểm được cột nào. Toàn bộ write vào profiles trong code
-- hiện tại đều qua server route dùng service-role client (bypass GRANT/RLS
-- hoàn toàn) nên không cần re-grant cột nào cho authenticated — nếu sau
-- này có route thật cần client tự update 1 cột, thêm GRANT UPDATE (cột đó)
-- lúc đó. Xem migrations/20260827_restrict_profiles_column_grants.sql.
revoke update on public.profiles from authenticated, anon;

-- A separate public-facing view for author pages / by-lines, so the app
-- never needs to select from `profiles` directly for anything visitor-facing
-- (keeps phone/real_name/cccd_verified out of reach by construction).
-- Không lọc theo role — mọi user (kể cả role='user' thường, có gắn tag
-- creator_tags hay không) đều cần username/nickname/avatar hiện công khai.
create view public.author_public_profiles as
  select id, username, nickname, avatar_url, cover_image_url, bio, created_at, creator_tags
  from public.profiles;

-- --- Theo dõi tác giả, dạng toggle (nút Theo dõi/Đang theo dõi ở trang
-- đọc chương) — quan hệ profile-to-profile nên đặt ngay đây, không thuộc
-- phần 3 (books/chapters). Composite PK, giống book_progress, không có
-- bảng nào khác cần FK trỏ vào 1 dòng follow. Route API thật dùng
-- service-role + userId resolve qua getAuthedUserId() (src/lib/wallet/session.ts)
-- — RLS dưới đây chỉ là defense-in-depth. Xem
-- migrations/20260824_add_author_follows.sql. ---
create table public.author_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  constraint author_follows_no_self_follow check (follower_id <> author_id)
);

create index author_follows_author_id_idx on public.author_follows (author_id);

alter table public.author_follows enable row level security;

create policy "followers manage their own follow rows"
  on public.author_follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id and follower_id <> author_id);

-- --- Nhắn tin 1-1 (tab "Hội thoại" ở /ca-nhan, nút "Nhắn tin" ở
-- /ket-noi) — 1 bảng duy nhất, không tách conversations/participants
-- riêng vì đây chỉ là chat 1-1 (không có group chat), "cuộc hội thoại"
-- giữa 2 người suy ra trực tiếp từ cặp (sender_id, recipient_id). Route
-- thật dùng service-role (khớp pattern api/profile/cover, .../identity)
-- — RLS dưới đây chỉ là defense-in-depth. Xem
-- migrations/20260828_add_direct_messages.sql. ---
create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  -- null = người nhận chưa đọc. Chỉ có đọc/chưa đọc, không có trạng thái
  -- "đã gửi/đã nhận" như app chat thật.
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint direct_messages_no_self_message check (sender_id <> recipient_id)
);

-- Lọc theo least/greatest(sender_id, recipient_id) để 1 index dùng được
-- cho truy vấn "toàn bộ tin giữa tôi và người X" ở cả 2 chiều gửi/nhận.
create index direct_messages_thread_idx
  on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);

create index direct_messages_unread_idx
  on public.direct_messages (recipient_id, sender_id) where read_at is null;

-- Phục vụ GET /api/messages (danh sách hội thoại — "sender_id = :me OR
-- recipient_id = :me", không lọc theo 1 đối tác cụ thể nên
-- direct_messages_thread_idx ở trên không dùng được). Xem
-- migrations/20260912_add_direct_messages_participant_indexes.sql —
-- migration đó dùng CREATE INDEX CONCURRENTLY (production đã có
-- traffic), ở đây dùng cú pháp thường vì schema.sql chỉ dùng để dựng
-- project mới từ đầu (chưa có traffic, không cần CONCURRENTLY).
create index direct_messages_sender_created_idx
  on public.direct_messages (sender_id, created_at desc);

create index direct_messages_recipient_created_idx
  on public.direct_messages (recipient_id, created_at desc);

alter table public.direct_messages enable row level security;

create policy "participants read their own messages"
  on public.direct_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "users send messages as themselves"
  on public.direct_messages for insert
  with check (auth.uid() = sender_id);

create policy "recipients mark messages read"
  on public.direct_messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- ---------------------------------------------------------------------
-- 2. Identity verification (CCCD)
-- ---------------------------------------------------------------------
-- Deliberately NOT part of `profiles`. This table holds the sensitive
-- fields — keeping them separate means the much-more-frequently-queried
-- `profiles` table (used for every by-line, comment, session check) never
-- has sensitive columns to accidentally over-select.
--
-- cccd_number: store only if you have a real compliance reason to keep it
-- queryable (e.g. matching against a registry). Prefer hashing it
-- (e.g. hmac with a server-only pepper) over storing it in the clear —
-- swap the column for `cccd_number_hash text` if you don't need the raw
-- value after verification.
--
-- cccd_front_path / cccd_back_path: paths into a PRIVATE storage bucket
-- (see section 4), never a public one. The app should only ever generate
-- short-lived signed URLs for these, server-side, for an admin reviewing
-- a dispute — never expose them to the reading/browsing UI.
create type public.verification_status as enum ('pending', 'approved', 'rejected');

-- status mặc định 'pending', nhưng route server (register/route.ts,
-- api/profile/identity/route.ts) chủ động insert 'approved' ngay khi OCR
-- khớp ảnh với số CCCD nhập — xác minh tự động, KHÔNG có màn hình admin
-- duyệt tay ở bản này (reviewed_by/reviewed_at để null cho các dòng đó,
-- vì không có người duyệt). Cột status vẫn giữ nguyên 3 giá trị để dễ
-- thêm luồng admin duyệt tay sau này nếu cần (set 'pending' thay vì
-- 'approved' lúc insert, rồi admin tự đổi qua policy "admins can view and
-- review all verifications" bên dưới).
-- migrations/20260916_add_realtime_signup_checks.sql — partial unique index
-- (định nghĩa ngay dưới bảng, sau CREATE TABLE) chặn 1 số CCCD dùng cho
-- nhiều tài khoản. Bỏ qua status = 'rejected' để 1 lượt bị admin từ chối
-- không khoá vĩnh viễn số đó — vẫn nộp lại được sau.
create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cccd_number text not null,
  -- migrations/20260829_add_author_contract_fields.sql — "cấp ngày" trong
  -- Hợp đồng khai thác tác phẩm độc quyền, gắn cùng lúc xác minh CCCD.
  cccd_issued_at date,
  cccd_front_path text not null,
  cccd_back_path text not null,
  status public.verification_status not null default 'pending',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.identity_verifications enable row level security;

create policy "users can view their own verification status"
  on public.identity_verifications for select
  using (auth.uid() = user_id);

create policy "users can submit their own verification"
  on public.identity_verifications for insert
  with check (auth.uid() = user_id);

create policy "admins can view and review all verifications"
  on public.identity_verifications for all
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create unique index if not exists identity_verifications_cccd_number_active_idx
  on public.identity_verifications (cccd_number)
  where status <> 'rejected';

-- migrations/20260916_add_realtime_signup_checks.sql — email đã có tài
-- khoản (đã xác nhận) hay chưa, dùng cho check real-time ở form đăng ký
-- (src/app/api/auth/check-availability/route.ts) trước khi gọi
-- supabase.auth.signUp() thật. auth.users không được PostgREST expose qua
-- schema "public" nên cần SECURITY DEFINER đọc thẳng auth.users rồi chỉ trả
-- về đúng 1 boolean — không lộ thêm thông tin nào khác của tài khoản đó.
create or replace function public.is_email_registered(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(p_email)
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.is_email_registered(text) from public;
-- Chỉ gọi từ server (service-role client) — không cần grant cho
-- anon/authenticated.
grant execute on function public.is_email_registered(text) to service_role;

-- migrations/20260916_add_unconfirmed_registration_purge.sql — id các tài
-- khoản bỏ ngang đăng ký, chưa bao giờ xác nhận email, để cron
-- src/app/api/auth/cron/purge-unconfirmed-registrations xoá — không dọn thì
-- username/CCCD của những tài khoản đó khoá vĩnh viễn (xem precheck trong
-- src/app/api/auth/register/route.ts).
create or replace function public.find_stale_unconfirmed_user_ids(
  p_cutoff timestamptz,
  p_limit integer default 500
)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users
  where email_confirmed_at is null
    and created_at < p_cutoff
  order by created_at
  limit p_limit;
$$;

revoke all on function public.find_stale_unconfirmed_user_ids(timestamptz, integer) from public;
grant execute on function public.find_stale_unconfirmed_user_ids(timestamptz, integer) to service_role;

-- migrations/20260828_add_agreement_acceptances.sql — 1 dòng/(user, văn
-- bản) giữ lần xác nhận GẦN NHẤT cho tab "Cam kết & Thỏa thuận" (/ca-nhan).
-- agreement_id tham chiếu AgreementId trong src/lib/legal/registry.ts,
-- không có bảng "agreements" riêng — danh sách văn bản là hằng số trong
-- code. accepted_version = "UTD" (yyyy-MM-dd) của văn bản lúc xác nhận; khi
-- văn bản được cập nhật (updatedAt đổi), version cũ không còn khớp nữa và
-- ứng dụng tự coi là "Chưa xác nhận" — không cần cột trạng thái riêng.
create table public.agreement_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  agreement_id text not null check (char_length(agreement_id) between 1 and 64),
  accepted_at timestamptz not null default now(),
  accepted_version text not null,
  primary key (user_id, agreement_id)
);

alter table public.agreement_acceptances enable row level security;

create policy "users manage their own agreement acceptances"
  on public.agreement_acceptances for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Data-retention note (Nghị định 13/2023/NĐ-CP): define how long a
-- rejected/expired verification's CCCD images are kept, then enforce it
-- with a scheduled job (Supabase Cron + Edge Function) that deletes the
-- storage objects and nulls out cccd_number for rows past that window —
-- RLS controls *who* can read this table, not *how long* the data lives.

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
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

-- deleted_at is null: sách bị soft-delete (phần 3b, xem
-- migrations/20260826_add_book_soft_delete.sql) không còn hiện với khách
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
-- Xem migrations/20260820_add_chapter_price.sql. ---
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
-- migrations/20260909_add_chapter_audio_url_and_price.sql. ---
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
-- Xem migrations/20260824_add_chapter_is_last.sql. ---
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
-- danh mục cố định. Xem migrations/20260919_add_characters.sql. ---
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
-- xem. Xem migrations/20260824_add_book_tags_and_view_count.sql. ---
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

-- --- Soft-delete cho books — KHÔNG có DELETE thật/policy delete/GRANT
-- delete ở đâu cả. deleted_at is null = còn sống. Điều kiện được phép xoá
-- (chưa published, hoặc published nhưng không exclusive; và không có
-- purchase_transactions nào của chương thuộc sách) enforce ở API route
-- (src/app/api/authoring/books/[bookId]/route.ts, DELETE) — không ở DB,
-- vì purchase_transactions.chapter_id là uuid trần, không FK, và rule
-- phụ thuộc business logic. Xem migrations/20260826_add_book_soft_delete.sql. ---
alter table public.books
  add column deleted_at timestamptz;

-- --- Độc quyền chuyển lên cấp TRUYỆN (trước đây chỉ có chapters.is_exclusive
-- ở phần 3, không nhất quán giữa các chương cùng 1 sách). Cột
-- chapters.is_exclusive GIỮ NGUYÊN, không drop — app đã ngừng đọc/viết nó.
-- published_at: mốc để tính "khoá exclusivity 3 ngày sau khi publish" —
-- set đúng 1 lần bởi trigger dưới, KHÔNG có trong bất kỳ GRANT nào (tác
-- giả không được tự set/backdate). Rule 3-ngày enforce ở API route
-- (không phải CHECK/trigger — CHECK không re-evaluate theo now() khi
-- thời gian trôi qua, và admin override qua service-role phải bypass
-- được rule này mà service-role không bypass trigger/constraint).
-- Xem migrations/20260826_add_book_exclusivity.sql. ---
alter table public.books
  add column is_exclusive boolean not null default true;

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

-- ---------------------------------------------------------------------
-- 4. Storage buckets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('identity-documents', 'identity-documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
-- Avatar/ảnh bìa upload thẳng lên đây qua signed upload URL (bỏ qua giới
-- hạn ~4.5MB body của Vercel Serverless Functions) — xem
-- migrations/20260914_raise_avatar_cover_size_limit.sql.
update storage.buckets
set
  file_size_limit = 15728640, -- 15MB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
-- Không còn bucket 'book-covers' riêng — ảnh bìa giờ đi qua kho thiết kế
-- dùng chung (bucket 'design-images', tạo ở phần 9), vì bìa sách cũng chỉ
-- là 1 "design_item" như minh hoạ khác, được books.cover_design_item_id
-- trỏ tới.

create policy "users upload their own identity documents"
  on storage.objects for insert
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users and admins read identity documents appropriately"
  on storage.objects for select
  using (
    bucket_id = 'identity-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
    )
  );

create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload and replace their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- 5. Chỉ super_admin được đổi role của bất kỳ ai
-- ---------------------------------------------------------------------
-- Bản trước chỉ chặn "không tự đổi role của chính mình" — vẫn còn lỗ
-- hổng: 1 admin thường vẫn đổi được role của NGƯỜI KHÁC (kể cả tự phong
-- thêm admin khác, hoặc phong ai đó lên admin tùy ý). Giờ chặt hơn: đổi
-- role — của bất kỳ ai, kể cả role của chính mình — chỉ hợp lệ nếu người
-- thực hiện đang có role = 'super_admin'.
create function public.enforce_role_change_authority()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null nghĩa là câu lệnh chạy ngoài phiên người dùng
    -- thường (SQL Editor với quyền postgres, script dùng service role
    -- key, migration) — coi là ngữ cảnh tin cậy, cho qua. Đây cũng là
    -- cách duy nhất để tạo super_admin ĐẦU TIÊN (xem hướng dẫn cuối phần
    -- này), vì lúc đó chưa ai có role super_admin để tự cấp cho người
    -- khác qua app được.
    if auth.uid() is not null and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'
    ) then
      raise exception 'Only a super_admin can change a role';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger enforce_role_change_authority
  before update on public.profiles
  for each row execute function public.enforce_role_change_authority();

-- Bootstrap super_admin đầu tiên (chạy 1 lần, trong SQL Editor — auth.uid()
-- ở đó là null nên đi qua được trigger trên):
--   update public.profiles set role = 'super_admin' where id = '<uuid của bạn>';
-- Từ sau đó, mọi thay đổi role khác phải đi qua session đăng nhập thật
-- của 1 super_admin (ví dụ 1 trang admin panel gọi update bằng chính
-- phiên đăng nhập của họ) — không dùng SQL Editor cho việc thường xuyên,
-- chỉ dùng đúng 1 lần lúc khởi tạo.

-- cccd_verified giờ có thể được set true tự động khi OCR khớp ảnh CCCD —
-- không chỉ lúc đăng ký (register/route.ts) mà cả khi cập nhật sau này
-- trong Thông tin cá nhân (api/profile/identity/route.ts). Bảo vệ y hệt
-- role ở trên: policy "update own profile" (auth.uid() = id) không tự
-- chặn cột nào ngoài role, nên nếu thiếu trigger này thì user thường tự
-- UPDATE profiles set cccd_verified = true được — xem
-- migrations/20260826_add_profile_bank_info.sql.
create function public.enforce_cccd_verified_authority()
returns trigger as $$
begin
  if new.cccd_verified is distinct from old.cccd_verified then
    if auth.uid() is not null and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    ) then
      raise exception 'cccd_verified can only be set by a trusted server context or an admin';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger enforce_cccd_verified_authority
  before update on public.profiles
  for each row execute function public.enforce_cccd_verified_authority();

-- =======================================================================
-- Phần bổ sung: ví token & lịch sử giao dịch, nhiệm vụ hàng ngày, gợi ý
-- truyện. Ba phần độc lập, thêm phần nào cần trước cũng được.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 6. Ví token & lịch sử giao dịch
-- ---------------------------------------------------------------------
-- Thiết kế cố ý: KHÔNG cho user tự insert vào `transactions`. Nếu cho
-- phép insert trực tiếp (dù có RLS "chỉ insert cho chính mình"), user vẫn
-- có thể tự cộng token cho bản thân bằng cách gửi amount dương. Mọi thay
-- đổi số dư phải đi qua hàm `apply_transaction()` bên dưới — hàm này
-- security definer, chỉ gọi được từ code server tin cậy (route handler
-- dùng service role, hoặc từ trigger/hàm khác trong DB như
-- `claim_daily_task`), không bao giờ expose để client gọi RPC trực tiếp
-- với amount tự chọn.

alter table public.profiles add column token_balance integer not null default 0;
-- Doanh thu chia sẻ tác giả (purchase_credit) còn trong hold period — xem
-- phần 6b. Hiện ra cho user thấy, nhưng KHÔNG tiêu/rút được cho tới khi
-- settle_due_pending_transactions() chuyển sang token_balance.
alter table public.profiles add column token_balance_pending integer not null default 0 check (token_balance_pending >= 0);
alter table public.profiles add column screenshot_penalty_count integer not null default 0;
alter table public.profiles add column screenshot_penalty_expires_at timestamptz;
alter table public.profiles add column screenshot_penalty_banned boolean not null default false;
alter table public.profiles add column screenshot_penalty_last_offense_at timestamptz;

-- Ngân hàng thụ hưởng để rút token (src/components/profile/bank-info-form.tsx)
-- + 4 chữ số cuối CCCD để hiện dạng che bớt trong Thông tin cá nhân, không
-- cần SELECT bảng identity_verifications nhạy cảm hơn cho việc đó — xem
-- migrations/20260826_add_profile_bank_info.sql. Rút token
-- (create_withdrawal_request bên dưới, cùng phần 6) chỉ dùng được khi
-- cccd_verified = true VÀ đủ 3 cột ngân hàng — xem
-- WithdrawalService.requestWithdrawal.
alter table public.profiles add column cccd_last4 text;
alter table public.profiles add column bank_code text;
alter table public.profiles add column bank_name text;
alter table public.profiles add column bank_account_number text;

-- Tên chủ tài khoản ngân hàng — người dùng TỰ NHẬP, KHÔNG ép = real_name
-- nữa (xem migrations/20260827_add_bank_account_name.sql: chủ tài khoản
-- có thể khác người lập hồ sơ — mượn tài khoản người thân — và nhiều
-- ngân hàng in tên không dấu, so khớp cứng với real_name có dấu sẽ sai
-- dù đúng người). Thông tin do người dùng khai, sai thì trách nhiệm
-- thuộc về người dùng.
alter table public.profiles add column bank_account_name text;

-- Mô tả bản thân + mốc lần đổi nickname gần nhất (tab "Thông tin cá nhân",
-- src/components/profile/edit-profile-tab.tsx) — nickname_updated_at chỉ
-- dùng để enforce cooldown 30 ngày ở tầng ứng dụng
-- (src/app/api/profile/me/route.ts), không phải cột hiển thị.
alter table public.profiles add column bio text;
alter table public.profiles add column nickname_updated_at timestamptz;

create type public.transaction_type as enum (
  'signup_bonus', 'daily_task_reward', 'purchase_chapter', 'topup', 'refund', 'admin_adjustment', 'screenshot_penalty',
  -- 'purchase_chapter' ở trên là vế trừ của người mua; 'purchase_credit' là
  -- vế cộng (pending) cho tác giả — xem phần 6e — tách riêng để không bao
  -- giờ lẫn 2 chiều của 1 giao dịch khi rà lịch sử.
  'purchase_credit', 'withdrawal', 'platform_bonus',
  -- Thêm bởi migrations/20260827_add_quest_reward_transaction_type.sql,
  -- 20260827_add_streak_bonus_transaction_type.sql,
  -- 20260827_add_streak_rescue_transaction_type.sql.
  'quest_reward', 'streak_bonus', 'streak_rescue',
  -- Hệ thống giao dịch commission (phần 12) — 'order_payment' là vế trừ
  -- ngay của buyer khi đặt cọc/thanh toán; 'order_earning' là vế cộng
  -- (pending, hold period) của seller tại thời điểm buyer_confirmed/
  -- auto_confirmed — xem phần 12b, KHÔNG ghi lúc đặt cọc. Thêm bởi
  -- migrations/20260901_add_order_payment_transaction_type.sql,
  -- 20260901_add_order_earning_transaction_type.sql.
  'order_payment', 'order_earning',
  -- Hoàn tiền khi hủy Order (Mục 5.1) — cộng ngay (status='completed'),
  -- không qua hold period. Thêm bởi
  -- migrations/20260901_add_order_refund_transaction_type.sql.
  'order_refund',
  -- Thưởng thành tựu (author/narrator/designer) — reference_type =
  -- 'achievement', reference_id = achievement_templates.id. Chỉ ghi khi
  -- achievement_templates.reward_tokens > 0. Thêm bởi
  -- migrations/20260908_add_achievement_bonus_transaction_type.sql.
  'achievement_bonus'
);

create type public.transaction_status as enum (
  'pending',    -- đã cộng vào token_balance_pending, chưa tiêu/rút được
  'processing', -- đã trừ/cộng token_balance rồi, đang chờ xác nhận từ bên ngoài (payout)
  'available',  -- 1 entry pending đã tới hạn và được settle
  'completed',  -- trạng thái cuối, bình thường cho mọi entry ngay-lập-tức
  'failed',     -- lời gọi ngoài (payout) thất bại, đã hoàn tiền
  'reversed'    -- entry bị đảo ngược sau đó bởi 1 refund/tranh chấp
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.transaction_type not null,
  amount integer not null, -- dương = cộng, âm = trừ
  penalty_percent numeric not null default 0,
  balance_after integer not null, -- snapshot token_balance sau giao dịch, phục vụ đối soát
  -- snapshot token_balance_pending sau giao dịch — null trừ khi status='pending'.
  pending_balance_after integer,
  status public.transaction_status not null default 'completed',
  available_at timestamptz, -- khi nào 1 entry 'pending' được settle — null nếu available ngay
  -- liên kết 2 chiều: vế purchase_chapter <-> purchase_credit của 1 giao
  -- dịch mua, hoặc vế withdrawal <-> refund nếu payout thất bại.
  related_transaction_id uuid references public.transactions (id),
  reference_type text, -- 'chapter' | 'daily_task' | 'topup_order' | 'withdrawal_request' | 'platform_bonus' | null
  reference_id uuid,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "users view their own transaction history"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "admins view all transactions"
  on public.transactions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index transactions_pending_due_idx on public.transactions (available_at) where status = 'pending';

-- Không có policy insert/update cho role "authenticated" — mặc định deny.
-- Chỉ service role (bypass RLS) hoặc hàm security definer dưới đây được ghi.

-- p_status/p_available_at/p_related_transaction_id đều có default nên mọi
-- lời gọi cũ (signup_bonus lúc đăng ký, claim_daily_task, penalty route)
-- không cần đổi gì. p_status='pending' rẽ nhánh sang token_balance_pending
-- thay vì token_balance, và bỏ qua kiểm tra "đủ số dư" — 1 entry pending
-- luôn là 1 khoản cộng (doanh thu tác giả), không bao giờ là khoản trừ.
create function public.apply_transaction(
  p_user_id uuid,
  p_type public.transaction_type,
  p_amount integer,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_penalty_percent numeric default 0,
  p_status public.transaction_status default 'completed',
  p_available_at timestamptz default null,
  p_related_transaction_id uuid default null
) returns public.transactions as $$
declare
  v_new_balance integer;
  v_new_pending integer;
  v_row public.transactions;
begin
  if p_status = 'pending' then
    if p_amount <= 0 then
      raise exception 'Pending entries must be credits (amount > 0), got %', p_amount;
    end if;
    if p_available_at is null then
      raise exception 'p_available_at is required when p_status = pending';
    end if;

    update public.profiles
      set token_balance_pending = token_balance_pending + p_amount
      where id = p_user_id
      returning token_balance_pending into v_new_pending;

    if v_new_pending is null then
      raise exception 'User % not found', p_user_id;
    end if;

    select token_balance into v_new_balance from public.profiles where id = p_user_id;

    insert into public.transactions (
      user_id, type, amount, penalty_percent, balance_after, pending_balance_after,
      reference_type, reference_id, status, available_at, related_transaction_id
    )
    values (
      p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance, v_new_pending,
      p_reference_type, p_reference_id, p_status, p_available_at, p_related_transaction_id
    )
    returning * into v_row;

    return v_row;
  end if;

  update public.profiles
    set token_balance = token_balance + p_amount
    where id = p_user_id
    returning token_balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'User % not found', p_user_id;
  end if;
  if v_new_balance < 0 then
    raise exception 'Insufficient balance for user %', p_user_id;
  end if;

  insert into public.transactions (
    user_id, type, amount, penalty_percent, balance_after,
    reference_type, reference_id, status, related_transaction_id
  )
  values (
    p_user_id, p_type, p_amount, p_penalty_percent, v_new_balance,
    p_reference_type, p_reference_id, p_status, p_related_transaction_id
  )
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- p_user_id/p_type/p_amount trần, không tự kiểm auth.uid() — hàm ghi số
-- dư DUY NHẤT của toàn hệ thống, nghiêm trọng nhất nếu bị gọi trực tiếp.
-- Chỉ service_role gọi được. KHÔNG ghi danh sách tham số (chỉ tên hàm) —
-- an toàn vì tên này không bị overload, và tránh lệch chữ ký nếu chạy
-- migration ở project chưa cập nhật hết. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.apply_transaction from public, anon, authenticated;
grant execute on function public.apply_transaction to service_role;

-- Ví dụ gọi từ route /api/auth/register sau khi tạo user (dùng service role client):
--   await supabase.rpc('apply_transaction', {
--     p_user_id: newUser.id, p_type: 'signup_bonus', p_amount: 100,
--   });

-- ---------------------------------------------------------------------
-- 6b. Job chuyển pending -> available (chạy định kỳ, xem vercel.json +
-- src/app/api/wallet/cron/settle-pending)
-- ---------------------------------------------------------------------
-- Settle đúng 1 row, có row lock — 1 request đọc/hoàn tiền đúng entry này
-- (xem refund trong mark_withdrawal_result, phần 6d) không thể đụng job
-- này cùng lúc. Trả về null (không raise) nếu row hết hạn 'due' ngay lúc
-- lấy được lock, để hàm gọi theo batch dưới đây bỏ qua thay vì abort batch.
create function public.settle_pending_transaction(p_transaction_id uuid)
returns public.transactions as $$
declare
  v_txn public.transactions;
begin
  select * into v_txn from public.transactions where id = p_transaction_id for update;

  if v_txn is null or v_txn.status <> 'pending' or v_txn.available_at > now() then
    return null;
  end if;

  update public.profiles
    set token_balance = token_balance + v_txn.amount,
        token_balance_pending = token_balance_pending - v_txn.amount
    where id = v_txn.user_id;

  update public.transactions set status = 'available' where id = v_txn.id returning * into v_txn;

  return v_txn;
end;
$$ language plpgsql security definer;

create function public.settle_due_pending_transactions(p_limit integer default 500)
returns setof public.transactions as $$
declare
  v_id uuid;
  v_result public.transactions;
begin
  for v_id in
    select id from public.transactions
    where status = 'pending' and available_at <= now()
    order by available_at
    limit p_limit
  loop
    v_result := public.settle_pending_transaction(v_id);
    if v_result is not null then
      return next v_result;
    end if;
  end loop;
  return;
end;
$$ language plpgsql security definer;

-- Hàm nội bộ của cron (vercel.json + api/wallet/cron/settle-pending) —
-- không cần/không nên gọi từ client. Chỉ service_role gọi được. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.settle_pending_transaction from public, anon, authenticated;
revoke execute on function public.settle_due_pending_transactions from public, anon, authenticated;
grant execute on function public.settle_pending_transaction to service_role;
grant execute on function public.settle_due_pending_transactions to service_role;

-- ---------------------------------------------------------------------
-- 6c. Nạp tiền — gateway-agnostic (chưa gắn cổng thanh toán thật)
-- ---------------------------------------------------------------------
create type public.deposit_status as enum ('pending', 'success', 'failed');

create table public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_gateway text not null, -- 'zalopay' | 'vnpay' | 'payos' | 'momo' | 'stub' — xem src/lib/wallet/deposit-service.ts
  gateway_order_id text not null,
  amount_vnd integer not null check (amount_vnd > 0),
  token_amount integer not null check (token_amount > 0),
  status public.deposit_status not null default 'pending',
  raw_payload jsonb,
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (payment_gateway, gateway_order_id)
);

alter table public.deposit_transactions enable row level security;

create policy "users view their own deposits"
  on public.deposit_transactions for select
  using (auth.uid() = user_id);

create policy "admins view all deposits"
  on public.deposit_transactions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update — webhook handler ghi hoàn toàn qua service role.

-- ---------------------------------------------------------------------
-- 6d. Rút tiền
-- ---------------------------------------------------------------------
create type public.withdrawal_status as enum ('pending', 'processing', 'success', 'failed');

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_tokens integer not null check (amount_tokens > 0),
  amount_vnd integer not null check (amount_vnd > 0), -- amount_tokens * TOKEN_TO_VND_RATE lúc tạo request
  bank_account_number text not null,
  bank_account_name text not null,
  bank_code text not null,
  status public.withdrawal_status not null default 'pending',
  payout_gateway_ref text,
  failure_reason text,
  transaction_id uuid not null references public.transactions (id),
  refund_transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.withdrawal_requests enable row level security;

create policy "users view their own withdrawal requests"
  on public.withdrawal_requests for select
  using (auth.uid() = user_id);

create policy "admins view all withdrawal requests"
  on public.withdrawal_requests for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index withdrawal_requests_user_month_idx on public.withdrawal_requests (user_id, created_at);

-- Atomic: trừ token_balance (status='processing' — tiền đã ra khỏi số dư
-- khả dụng nhưng payout API chưa xác nhận) + tạo request, trong 1 lời gọi.
create function public.create_withdrawal_request(
  p_user_id uuid,
  p_amount_tokens integer,
  p_amount_vnd integer,
  p_bank_account_number text,
  p_bank_account_name text,
  p_bank_code text
) returns public.withdrawal_requests as $$
declare
  v_txn public.transactions;
  v_request public.withdrawal_requests;
begin
  v_txn := public.apply_transaction(
    p_user_id, 'withdrawal', -p_amount_tokens,
    'withdrawal_request', null, 0, 'processing'
  );

  insert into public.withdrawal_requests (
    user_id, amount_tokens, amount_vnd, bank_account_number, bank_account_name, bank_code, transaction_id, status
  )
  values (p_user_id, p_amount_tokens, p_amount_vnd, p_bank_account_number, p_bank_account_name, p_bank_code, v_txn.id, 'processing')
  returning * into v_request;

  update public.transactions set reference_id = v_request.id where id = v_txn.id;

  return v_request;
end;
$$ language plpgsql security definer;

-- p_user_id trần — nếu gọi được trực tiếp, user tự tạo yêu cầu rút tiền
-- TRỪ số dư NGƯỜI KHÁC, chuyển vào ngân hàng do MÌNH chỉ định. Chỉ
-- service_role gọi được. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.create_withdrawal_request from public, anon, authenticated;
grant execute on function public.create_withdrawal_request to service_role;

-- Idempotent — no-op nếu request không còn 'processing' (đã được 1 lời
-- gọi callback trước đó xử lý), nhờ row lock + kiểm tra status ngay sau.
create function public.mark_withdrawal_result(
  p_request_id uuid,
  p_success boolean,
  p_gateway_ref text default null,
  p_failure_reason text default null
) returns public.withdrawal_requests as $$
declare
  v_request public.withdrawal_requests;
  v_refund public.transactions;
begin
  select * into v_request from public.withdrawal_requests where id = p_request_id for update;
  if v_request is null then
    raise exception 'Withdrawal request % not found', p_request_id;
  end if;

  if v_request.status <> 'processing' then
    return v_request;
  end if;

  if p_success then
    update public.transactions set status = 'completed' where id = v_request.transaction_id;
    update public.withdrawal_requests
      set status = 'success', payout_gateway_ref = p_gateway_ref, processed_at = now()
      where id = p_request_id
      returning * into v_request;
  else
    update public.transactions set status = 'failed' where id = v_request.transaction_id;

    -- Hoàn tiền = 1 entry ledger mới (append-only), không sửa entry gốc.
    v_refund := public.apply_transaction(
      v_request.user_id, 'refund', v_request.amount_tokens,
      'withdrawal_request', p_request_id, 0, 'completed', null, v_request.transaction_id
    );

    update public.withdrawal_requests
      set status = 'failed', failure_reason = p_failure_reason, refund_transaction_id = v_refund.id, processed_at = now()
      where id = p_request_id
      returning * into v_request;
  end if;

  return v_request;
end;
$$ language plpgsql security definer;

-- Idempotent theo status, nhưng KHÔNG kiểm người gọi có phải chủ request
-- hay không — nếu gọi được trực tiếp, user tự gọi p_success=false trên
-- request CỦA CHÍNH MÌNH (id tự xem được qua policy select) để tự tạo
-- hoàn tiền giả trong khi giao dịch rút tiền thật vẫn có thể được xử lý
-- song song ở gateway thật (double-dip). Chỉ service_role gọi được. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.mark_withdrawal_result from public, anon, authenticated;
grant execute on function public.mark_withdrawal_result to service_role;

-- ---------------------------------------------------------------------
-- 6e. Mua chương (chia sẻ doanh thu tác giả) & thưởng nền tảng
-- ---------------------------------------------------------------------
create table public.purchase_transactions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  chapter_id uuid not null,
  amount integer not null check (amount > 0),
  author_share integer not null check (author_share >= 0),
  platform_share integer not null check (platform_share >= 0),
  debit_transaction_id uuid not null references public.transactions (id),
  credit_transaction_id uuid not null references public.transactions (id),
  created_at timestamptz not null default now(),
  check (author_share + platform_share = amount)
);

-- Chặn mua trùng 1 chương (2 request gần như đồng thời cùng qua được check
-- "đã mua chưa" ở tầng app) — xem
-- migrations/20260909_add_purchase_transactions_unique_buyer_chapter.sql +
-- POST /api/chapters/[chapterId]/purchase (bắt lỗi 23505, coi như đã sở hữu).
create unique index if not exists purchase_transactions_buyer_chapter_key
  on public.purchase_transactions (buyer_id, chapter_id);

alter table public.purchase_transactions enable row level security;

create policy "buyers view their own purchases"
  on public.purchase_transactions for select
  using (auth.uid() = buyer_id);

create policy "authors view sales of their own content"
  on public.purchase_transactions for select
  using (auth.uid() = author_id);

create policy "admins view all purchases"
  on public.purchase_transactions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Platform commission không đi qua ví ai — nó đã nằm trong tài khoản ngân
-- hàng công ty từ lúc buyer nạp tiền. Bảng này chỉ để báo cáo doanh thu.
create table public.platform_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  purchase_transaction_id uuid not null references public.purchase_transactions (id),
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.platform_revenue_entries enable row level security;

create policy "admins view platform revenue"
  on public.platform_revenue_entries for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- 1 lời gọi, 1 DB transaction: trừ buyer, cộng pending cho author (bắt đầu
-- tính hold period), ghi platform commission, link 2 chiều.
create function public.create_purchase(
  p_buyer_id uuid,
  p_author_id uuid,
  p_chapter_id uuid,
  p_amount integer,
  p_author_share integer,
  p_platform_share integer,
  p_hold_days integer
) returns public.purchase_transactions as $$
declare
  v_debit public.transactions;
  v_credit public.transactions;
  v_purchase public.purchase_transactions;
  v_available_at timestamptz := now() + (p_hold_days || ' days')::interval;
begin
  if p_author_share + p_platform_share <> p_amount then
    raise exception 'author_share (%) + platform_share (%) must equal amount (%)', p_author_share, p_platform_share, p_amount;
  end if;

  v_debit := public.apply_transaction(p_buyer_id, 'purchase_chapter', -p_amount, 'chapter', p_chapter_id);

  v_credit := public.apply_transaction(
    p_author_id, 'purchase_credit', p_author_share, 'chapter', p_chapter_id,
    0, 'pending', v_available_at, v_debit.id
  );

  update public.transactions set related_transaction_id = v_credit.id where id = v_debit.id;

  insert into public.purchase_transactions (
    buyer_id, author_id, chapter_id, amount, author_share, platform_share,
    debit_transaction_id, credit_transaction_id
  )
  values (p_buyer_id, p_author_id, p_chapter_id, p_amount, p_author_share, p_platform_share, v_debit.id, v_credit.id)
  returning * into v_purchase;

  insert into public.platform_revenue_entries (purchase_transaction_id, amount)
  values (v_purchase.id, p_platform_share);

  return v_purchase;
end;
$$ language plpgsql security definer;

-- buyer_id/author_id trần, không tự kiểm auth.uid() — nếu gọi được trực
-- tiếp, user tự đặt author_id = mình, buyer_id = NGƯỜI KHÁC để trừ tiền
-- người khác, cộng doanh thu cho mình mà không cần mua gì. Chỉ
-- service_role gọi được. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.create_purchase from public, anon, authenticated;
grant execute on function public.create_purchase to service_role;

-- Thưởng cuộc thi / bonus công ty — quỹ công ty, không hold, không trừ
-- token của ai. Audit trail (ai duyệt, vì sao) nằm ở bảng riêng dưới đây,
-- không lẫn vào doanh thu chia sẻ tác giả khi báo cáo tài chính.
create table public.platform_bonus_grants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid not null references auth.users (id),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_bonus_grants enable row level security;

create policy "recipients view their own bonus grants"
  on public.platform_bonus_grants for select
  using (auth.uid() = recipient_id);

create policy "admins view all bonus grants"
  on public.platform_bonus_grants for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- p_admin_id được kiểm tra role NGAY TRONG hàm (defense in depth) — route
-- handler phải gate theo session trước, nhưng vì đây là security definer
-- và gọi được qua service role (bypass RLS hoàn toàn), check không thể chỉ
-- nằm ở RLS.
create function public.grant_platform_bonus(
  p_admin_id uuid,
  p_recipient_id uuid,
  p_amount integer,
  p_reason text
) returns public.transactions as $$
declare
  v_txn public.transactions;
begin
  if p_amount <= 0 then
    raise exception 'Bonus amount must be positive, got %', p_amount;
  end if;
  if not exists (select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')) then
    raise exception 'User % is not authorized to grant platform bonuses', p_admin_id;
  end if;

  v_txn := public.apply_transaction(p_recipient_id, 'platform_bonus', p_amount, 'platform_bonus', null);

  insert into public.platform_bonus_grants (transaction_id, recipient_id, granted_by, reason)
  values (v_txn.id, p_recipient_id, p_admin_id, p_reason);

  update public.transactions set reference_id = (
    select id from public.platform_bonus_grants where transaction_id = v_txn.id
  ) where id = v_txn.id;

  return v_txn;
end;
$$ language plpgsql security definer;

-- Check role bên trong hàm dựa vào p_admin_id (THAM SỐ), KHÔNG dựa vào
-- auth.uid() của người gọi thật — nếu gọi được trực tiếp, truyền
-- p_admin_id = id của 1 admin thật (tra được qua author_public_profiles/
-- byline) là qua được check, tự thưởng bất kỳ số token cho bất kỳ ai.
-- REVOKE dưới đây chặn được đường gọi trực tiếp; check lỗi thiết kế dựa
-- theo tham số vẫn còn nếu sau này có endpoint khác gọi hàm này mà không
-- tự resolve p_admin_id từ session — xem note trong migration. Chỉ
-- service_role gọi được. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.grant_platform_bonus from public, anon, authenticated;
grant execute on function public.grant_platform_bonus to service_role;

-- ---------------------------------------------------------------------
-- 7. Nhiệm vụ hàng ngày
-- ---------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, -- vd 'read_3_chapters', dùng để logic app nhận diện
  title text not null,
  description text,
  target_count integer not null default 1,
  reward_tokens integer not null default 0,
  active boolean not null default true
);

alter table public.task_templates enable row level security;

-- Đây là định nghĩa nhiệm vụ (không phải dữ liệu riêng tư của ai), nên cho
-- mọi người đã đăng nhập đọc — cần thiết để hiện danh sách nhiệm vụ trong
-- app. Chỉ admin mới được thêm/sửa/xoá loại nhiệm vụ.
create policy "authenticated users can view active task templates"
  on public.task_templates for select
  to authenticated
  using (active);

create policy "admins manage task templates"
  on public.task_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.task_templates (id) on delete cascade,
  task_date date not null default current_date,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, template_id, task_date)
);

alter table public.user_daily_tasks enable row level security;

create policy "users view their own daily tasks"
  on public.user_daily_tasks for select
  using (auth.uid() = user_id);

-- Không cho user tự update completed/claimed trực tiếp — đi qua 2 hàm dưới.

-- Gọi khi user có hành động liên quan (đọc xong 1 chương, v.v.) — tự tạo
-- dòng nhiệm vụ hôm nay nếu chưa có (lazy-create, không cần chờ cron),
-- cộng dồn progress, tự đánh dấu completed khi đủ target_count.
create function public.increment_task_progress(p_user_id uuid, p_task_code text, p_amount integer default 1)
returns public.user_daily_tasks as $$
declare
  v_template public.task_templates;
  v_row public.user_daily_tasks;
begin
  select * into v_template from public.task_templates where code = p_task_code and active;
  if v_template is null then
    raise exception 'Unknown or inactive task code: %', p_task_code;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, current_date)
  on conflict (user_id, template_id, task_date) do nothing;

  update public.user_daily_tasks
    set progress = least(progress + p_amount, v_template.target_count),
        completed = (progress + p_amount) >= v_template.target_count
    where user_id = p_user_id and template_id = v_template.id and task_date = current_date
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- p_user_id trần — nếu gọi được trực tiếp, user tự ghi/hoàn thành tiến
-- trình nhiệm vụ hàng ngày của NGƯỜI KHÁC. Chỉ service_role gọi được. Xem
-- migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.increment_task_progress from public, anon, authenticated;
grant execute on function public.increment_task_progress to service_role;

-- Gọi khi "tiến trình" thật ra là 1 trạng thái ngoài (vd streak hiện tại),
-- không phải số lần hành động trong ngày — GHI ĐÈ progress thay vì cộng
-- dồn như increment_task_progress ở trên. An toàn overwrite trong cùng 1
-- ngày vì nguồn trạng thái (sync_reading_streak) không giảm giữa ngày. Xem
-- migrations/20260918_add_streak_quests_and_time_windows.sql.
create function public.set_task_progress(p_user_id uuid, p_task_code text, p_progress integer)
returns public.user_daily_tasks as $$
declare
  v_template public.task_templates;
  v_row public.user_daily_tasks;
begin
  select * into v_template from public.task_templates where code = p_task_code and active;
  if v_template is null then
    raise exception 'Unknown or inactive task code: %', p_task_code;
  end if;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
  values (p_user_id, v_template.id, current_date)
  on conflict (user_id, template_id, task_date) do nothing;

  update public.user_daily_tasks
    set progress = least(greatest(p_progress, 0), v_template.target_count),
        completed = p_progress >= v_template.target_count
    where user_id = p_user_id and template_id = v_template.id and task_date = current_date
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.set_task_progress from public, anon, authenticated;
grant execute on function public.set_task_progress to service_role;

-- Gọi khi user bấm "nhận thưởng" trên UI — kiểm tra đã hoàn thành & chưa
-- nhận trước khi cộng token, tránh nhận thưởng 2 lần.
create function public.claim_daily_task(p_user_id uuid, p_task_id uuid)
returns public.transactions as $$
declare
  v_task public.user_daily_tasks;
  v_template public.task_templates;
begin
  select * into v_task from public.user_daily_tasks where id = p_task_id and user_id = p_user_id;
  if v_task is null then
    raise exception 'Task not found';
  end if;
  if not v_task.completed then
    raise exception 'Task not completed yet';
  end if;
  if v_task.claimed then
    raise exception 'Task already claimed';
  end if;

  select * into v_template from public.task_templates where id = v_task.template_id;

  update public.user_daily_tasks set claimed = true where id = p_task_id;

  return public.apply_transaction(p_user_id, 'daily_task_reward', v_template.reward_tokens, 'daily_task', p_task_id);
end;
$$ language plpgsql security definer;

-- p_user_id trần — mức hại thấp hơn các hàm khác ở trên (chỉ cho phép
-- ép claim thưởng CỦA NGƯỜI KHÁC, tiền vẫn về đúng người đó, không bị
-- cướp), nhưng vẫn không nên gọi trực tiếp từ client. Chỉ service_role
-- gọi được. Xem migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
revoke execute on function public.claim_daily_task from public, anon, authenticated;
grant execute on function public.claim_daily_task to service_role;

-- Tuỳ chọn: nếu muốn nhiệm vụ được TẠO SẴN cho mọi user lúc 0h (thay vì
-- lazy-create ở lần hành động đầu tiên trong ngày — cách trên đã đủ dùng,
-- phần này chỉ cần nếu bạn muốn hiện danh sách nhiệm vụ "trống, chưa làm"
-- ngay khi user mở app buổi sáng mà chưa hành động gì):
--
-- select cron.schedule('generate-daily-tasks', '0 0 * * *', $$
--   insert into public.user_daily_tasks (user_id, template_id, task_date)
--   select p.id, t.id, current_date
--   from public.profiles p cross join public.task_templates t
--   where t.active
--   on conflict (user_id, template_id, task_date) do nothing;
-- $$);
--
-- Cần bật extension pg_cron trước (Database → Extensions trong Supabase
-- dashboard), và cân nhắc chi phí insert nếu số lượng user lớn.

-- ---------------------------------------------------------------------
-- 8. Gợi ý truyện (pgvector)
-- ---------------------------------------------------------------------
-- Bật extension pgvector (Database → Extensions, hoặc chạy lệnh dưới nếu
-- role của bạn có quyền).
create extension if not exists vector;

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
-- (tiền thưởng thật) từ migrations/20260917_add_reading_event_log.sql, nên
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
-- migrations/20260917_add_reading_event_log.sql.
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
-- quyền OWNER. Xem migrations/20260831_add_book_read_counts_daily.sql.
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
-- migrations/20260824_add_chapter_votes.sql. ---
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
-- migrations/20260824_add_book_progress.sql. ---
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
-- migrations/20260910_add_book_progress_paragraph.sql.
alter table public.book_progress
  add column last_paragraph_index integer check (last_paragraph_index is null or last_paragraph_index >= 0);

alter table public.book_progress enable row level security;

create policy "users manage their own book progress"
  on public.book_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- "Đang nghe dở" cho Audio hub — cùng shape/lý do với book_progress ở
-- trên, nhưng cho audio_narrations thay vì books/chapters: 1 dòng/(user,
-- audio), upsert khi lưu (không phải log append-only). Powers "Audio đang
-- nghe" (dòng updated_at mới nhất) và "Nghe tiếp" (vài dòng kế tiếp) trên
-- /audio bằng dữ liệu thật — không có dòng nào thì không hiện gì, không
-- bịa số. Xem migrations/20260901_add_audio_narration_hub_metadata.sql. ---
create table public.audio_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  position_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, audio_narration_id),
  constraint audio_progress_position_seconds_check check (position_seconds >= 0)
);

alter table public.audio_progress enable row level security;

create policy "users manage their own audio progress"
  on public.audio_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- "Danh sách đọc" kiểu playlist YouTube — mỗi danh sách chứa nguyên
-- SÁCH (không phải chương lẻ), 1 user có nhiều danh sách. 2 bảng, giống
-- quan hệ books/chapters: 1 bảng cha (metadata danh sách) + 1 bảng con FK
-- vào cha (sách nào nằm trong danh sách nào). Route API thật (add/remove
-- item) dùng service-role + tự kiểm reading_lists.user_id = userId trước
-- khi ghi — RLS dưới đây chỉ defense-in-depth. Xem
-- migrations/20260824_add_reading_lists.sql. ---
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

-- ---------------------------------------------------------------------
-- 9. Audio & Thiết kế — kho độc lập, liên kết vào truyện qua SHARE LINK
-- ---------------------------------------------------------------------
-- Mô hình (bản sửa — thêm cơ chế share-token, giống Google Drive):
--
--   • Diễn viên lồng tiếng / họa sĩ upload TỰ DO vào kho Audio / Thiết kế
--     — độc lập, không cần thuộc về chương/truyện nào cả lúc tạo.
--   • Kho này CÓ trang duyệt công khai (ai cũng xem/nghe được, giống
--     browse file "chỉ xem" trên Drive) — nhưng xem công khai KHÔNG đồng
--     nghĩa với việc ai cũng link được vào truyện của họ.
--   • Muốn link, tác giả cần đúng "share link" — một chuỗi bí mật
--     (`share_token`) do chủ sở hữu tạo ra và tự tay gửi cho tác giả sau
--     khi thoả thuận ngoài nền tảng. `share_token` KHÔNG xuất hiện ở
--     trang duyệt công khai — chỉ chủ sở hữu xem được token của chính
--     mình để copy đi chia sẻ, y hệt nút "Get link" của Google Drive.
--   • Copy id/URL từ vị trí người nghe/xem (trang duyệt công khai) sẽ
--     KHÔNG link được — vì hàm liên kết bắt buộc kiểm tra token đúng,
--     không chỉ id đúng.
--   • Tác giả tự upload từ máy (không qua ai khác): app tạo hộ 1 dòng
--     audio_narrations/design_items với narrator_id/illustrator_id =
--     chính tác giả, lấy luôn token vừa tạo (họ đang sở hữu, không cần ai
--     cho phép) để tự link cho mình trong cùng 1 thao tác.

-- Trên Supabase, pgcrypto thường được cài vào schema "extensions" (không
-- phải "public") — nên mọi lời gọi gen_random_bytes() bên dưới đều chỉ
-- rõ extensions.gen_random_bytes(...), tránh lỗi "function does not exist"
-- nếu search_path không tình cờ bao gồm schema đó.
create extension if not exists pgcrypto with schema extensions;

create type public.content_source as enum ('independent', 'story_upload');

-- --- Kho Thiết kế (ảnh bìa, minh hoạ) ---
create table public.design_items (
  id uuid primary key default gen_random_uuid(),
  illustrator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  image_url text not null, -- path trong bucket 'design-images'
  -- Nullable: ảnh bìa tạo tự động qua luồng story_upload không hỏi họa sĩ
  -- điền gì — chỉ nội dung đăng độc lập ở /thiet-ke/new mới bắt buộc chọn.
  -- Xem migrations/20260901_add_design_item_gallery_metadata.sql.
  category text,
  description text,
  share_count integer not null default 0,
  source public.content_source not null default 'independent',
  -- Chuỗi bí mật để chia sẻ quyền link — 48 ký tự hex (192 bit), không
  -- đoán được. Đừng lộ cột này ra bất kỳ view/API công khai nào.
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  constraint design_items_share_count_check check (share_count >= 0),
  constraint design_items_category_check
    check (category is null or category in ('bia_truyen', 'minh_hoa', 'fan_art', 'poster_audio'))
);

alter table public.design_items enable row level security;

-- CHỈ chủ sở hữu xem được toàn bộ dòng (bao gồm share_token, để họ copy
-- đi chia sẻ) — KHÔNG có policy "public select" trên bảng gốc này.
create policy "illustrators view their own design items (incl. share token)"
  on public.design_items for select
  using (auth.uid() = illustrator_id);

create policy "illustrators insert their own design items"
  on public.design_items for insert
  with check (auth.uid() = illustrator_id);

create policy "illustrators update their own design items"
  on public.design_items for update
  using (auth.uid() = illustrator_id);

create policy "illustrators delete their own design items"
  on public.design_items for delete
  using (auth.uid() = illustrator_id);

-- View công khai cho trang "duyệt kho Thiết kế" — CỐ Ý không có
-- share_token. Đây là view app dùng để hiện danh sách công khai. Lọc
-- deleted_at is null ngay ở đây (xem
-- migrations/20260919_add_design_albums_and_multi_upload.sql) — MỌI nơi
-- đọc công khai (gallery/search/comments/likes) đi qua view này, không
-- đọc bảng gốc, nên chỉ cần lọc 1 chỗ.
create view public.public_design_items as
  select id, illustrator_id, title, image_url, source, created_at, category, description, share_count,
         album_id, alt_text, published_at
  from public.design_items
  where deleted_at is null and published_at is not null;

-- Bảng riêng cho lượt thích (toggle, 1 dòng/(tác phẩm, người thích)) —
-- cùng pattern "aggregate qua view riêng, bảng gốc owner-only RLS" như
-- chapter_votes/chapter_vote_counts. Xem
-- migrations/20260901_add_design_item_gallery_metadata.sql.
create table public.design_item_likes (
  design_item_id uuid not null references public.design_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (design_item_id, user_id)
);

create index design_item_likes_design_item_id_idx on public.design_item_likes (design_item_id);

alter table public.design_item_likes enable row level security;

create policy "users manage their own design item likes"
  on public.design_item_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.design_item_like_counts as
  select design_item_id, count(*)::integer as like_count
  from public.design_item_likes
  group by design_item_id;

-- --- Albums ("board") — long-lived grouping of design_items, shared name
-- + art_style across every item in it (xem
-- migrations/20260919_add_design_albums_and_multi_upload.sql). Hiện ở cả
-- form đăng /thiet-ke/new VÀ trang duyệt công khai /thiet-ke (khác nhãn
-- nội bộ chỉ dùng lúc đăng) — không có cột bí mật nào nên select công khai
-- thẳng trên bảng gốc, không cần view public_* riêng như design_items. ---
create table public.design_albums (
  id uuid primary key default gen_random_uuid(),
  illustrator_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- 10 giá trị lấy từ cột "Phong cách nghệ thuật" của mega-menu
  -- (nav-strip-links.tsx) — xem src/lib/design/art-styles.ts.
  art_style text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_albums_art_style_check
    check (art_style in (
      'anime_manga', 'ban_ta_thuc', 'ta_thuc', 'chibi', 'flat_vector',
      'co_trang', 'dark_fantasy', 'pixel_art', 'painterly', 'render_3d'
    ))
);

create index design_albums_illustrator_id_idx on public.design_albums (illustrator_id);

alter table public.design_albums enable row level security;

create policy "anyone can view design albums"
  on public.design_albums for select
  using (true);

create policy "illustrators insert their own design albums"
  on public.design_albums for insert
  with check (auth.uid() = illustrator_id);

create policy "illustrators update their own design albums"
  on public.design_albums for update
  using (auth.uid() = illustrator_id);

create policy "illustrators delete their own design albums"
  on public.design_albums for delete
  using (auth.uid() = illustrator_id);

-- --- design_items: album_id/alt_text/deleted_at (mở rộng theo cùng
-- migration ở trên) — category_check mở rộng 4 → 14 giá trị, CỘNG THÊM
-- không remap: 'bia_truyen'/'fan_art' giữ nguyên slug (chỉ đổi nhãn hiện ở
-- UI thành "Bìa truyện/sách"/"Fanart"), 'minh_hoa'/'poster_audio' giữ
-- nguyên không đổi, 10 slug mới cho các mục mega-menu chưa có tương đương.
-- Xem src/lib/design/get-design-gallery.ts (DESIGN_CATEGORIES). ---
alter table public.design_items
  add column album_id uuid references public.design_albums (id) on delete set null,
  add column alt_text text,
  add column deleted_at timestamptz;

create index design_items_album_id_idx on public.design_items (album_id) where album_id is not null;

alter table public.design_items drop constraint design_items_category_check;
alter table public.design_items
  add constraint design_items_category_check
  check (category is null or category in (
    'bia_truyen', 'nhan_vat_don', 'nhan_vat_nhom', 'vu_khi_trang_bi',
    'boi_canh_phong_canh', 'linh_vat', 'trang_phuc', 'chibi_deform',
    'emote_pack', 'logo_icon', 'fan_art', 'tranh_doi', 'minh_hoa', 'poster_audio'
  ));

-- Cột-cấp GRANT — policy "illustrators update their own design items" ở
-- trên chỉ chặn theo HÀNG, không theo CỘT, nên nếu không có REVOKE/GRANT
-- này, client tự PATCH thẳng share_token/image_url qua Supabase REST API
-- được, bỏ qua regenerate_design_share_token() và route upload. Cùng
-- pattern books (20260825_restrict_books_column_grants.sql).
revoke update on public.design_items from authenticated;
grant update (title, description, category, alt_text, album_id, deleted_at) on public.design_items to authenticated;

-- --- design_items: published_at (xem
-- migrations/20260921_add_design_item_publish_state.sql) — null = draft
-- riêng của họa sĩ (chưa hiện qua public_design_items ở trên), có giá trị
-- = đã công khai. POST /api/design (đăng ảnh) không set cột này, mặc
-- định NULL; POST /api/design/publish (bấm "Hoàn tất") là nơi duy nhất
-- set = now(). ---
alter table public.design_items
  add column published_at timestamptz;

grant update (published_at) on public.design_items to authenticated;

-- security definer: tăng share_count an toàn dưới race condition, không
-- cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 tác phẩm/lần gọi.
-- Không yêu cầu đăng nhập, giống increment_book_view_count.
create function public.increment_design_item_share_count(p_design_item_id uuid)
returns void as $$
  update public.design_items set share_count = share_count + 1 where id = p_design_item_id;
$$ language sql security definer set search_path = public;

grant execute on function public.increment_design_item_share_count(uuid) to anon, authenticated;

-- --- Bình luận cho 1 tác phẩm thiết kế — mirror anchored_comments nhưng bỏ
-- paragraph_index/char_start/char_end/quest_id (không có khái niệm "đoạn
-- văn" hay "quest neo comment" ở đây). Reply 1 cấp duy nhất, enforce ở API
-- route, không phải CHECK DB. Xem migrations/20260917_add_design_audio_comments.sql. ---
create table public.design_comments (
  id uuid primary key default gen_random_uuid(),
  design_item_id uuid not null references public.design_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  parent_comment_id uuid references public.design_comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index design_comments_design_item_id_idx on public.design_comments (design_item_id);
create index design_comments_parent_idx on public.design_comments (parent_comment_id) where parent_comment_id is not null;

alter table public.design_comments enable row level security;

create policy "design comments are publicly readable"
  on public.design_comments for select
  using (true);

create policy "users write their own design comments"
  on public.design_comments for insert
  with check (auth.uid() = user_id);

create policy "users delete their own design comments"
  on public.design_comments for delete
  using (auth.uid() = user_id);

create policy "admins moderate design comments"
  on public.design_comments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Toggle thích 1 bình luận — cùng pattern design_item_likes (aggregate qua
-- view riêng, bảng gốc owner-only RLS).
create table public.design_comment_likes (
  comment_id uuid not null references public.design_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index design_comment_likes_comment_id_idx on public.design_comment_likes (comment_id);

alter table public.design_comment_likes enable row level security;

create policy "users manage their own design comment likes"
  on public.design_comment_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.design_comment_like_counts as
  select comment_id, count(*)::integer as like_count
  from public.design_comment_likes
  group by comment_id;

-- --- Kho Audio ---
create table public.audio_narrations (
  id uuid primary key default gen_random_uuid(),
  narrator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  audio_url text not null, -- path trong bucket 'audio-narrations'
  duration_seconds integer,
  -- Người nghe chọn ở /audio/new; với audio gắn vào chương sách qua
  -- chapter_audio_links, app tự điền lại từ genre của sách đó thay vì hỏi
  -- 2 lần — xem src/lib/audio/get-audio-catalog.ts. Cùng danh sách giá trị
  -- với books.genre (không dùng chung constraint vì khác bảng).
  genre text,
  play_count integer not null default 0,
  source public.content_source not null default 'independent',
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  constraint audio_narrations_play_count_check check (play_count >= 0),
  constraint audio_narrations_genre_check
    check (genre is null or genre in (
      'Linh dị', 'Cổ tích & Thần thoại', 'Dã sử', 'Trinh thám',
      'Tâm lý - tội phạm', 'Tình cảm', 'Đời sống - Xã hội',
      'Khoa học viễn tưởng', 'Tiên hiệp/ kiếm hiệp', 'Kỳ ảo'
    ))
);

alter table public.audio_narrations enable row level security;

create policy "narrators view their own audio narrations (incl. share token)"
  on public.audio_narrations for select
  using (auth.uid() = narrator_id);

create policy "narrators insert their own audio narrations"
  on public.audio_narrations for insert
  with check (auth.uid() = narrator_id);

create policy "narrators update their own audio narrations"
  on public.audio_narrations for update
  using (auth.uid() = narrator_id);

create policy "narrators delete their own audio narrations"
  on public.audio_narrations for delete
  using (auth.uid() = narrator_id);

create view public.public_audio_narrations as
  select id, narrator_id, title, audio_url, duration_seconds, source, created_at, genre, play_count
  from public.audio_narrations;

-- security definer: tăng play_count an toàn dưới race condition, không
-- cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 bản ghi/lần gọi.
-- Không yêu cầu đăng nhập, giống increment_book_view_count.
create function public.increment_audio_play_count(p_audio_narration_id uuid)
returns void as $$
  update public.audio_narrations set play_count = play_count + 1 where id = p_audio_narration_id;
$$ language sql security definer set search_path = public;

grant execute on function public.increment_audio_play_count(uuid) to anon, authenticated;

-- --- Bình luận cho 1 bản thu audio — cùng cấu trúc design_comments ở
-- trên, khác bảng gốc tham chiếu. Xem
-- migrations/20260917_add_design_audio_comments.sql. ---
create table public.audio_comments (
  id uuid primary key default gen_random_uuid(),
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  parent_comment_id uuid references public.audio_comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index audio_comments_audio_narration_id_idx on public.audio_comments (audio_narration_id);
create index audio_comments_parent_idx on public.audio_comments (parent_comment_id) where parent_comment_id is not null;

alter table public.audio_comments enable row level security;

create policy "audio comments are publicly readable"
  on public.audio_comments for select
  using (true);

create policy "users write their own audio comments"
  on public.audio_comments for insert
  with check (auth.uid() = user_id);

create policy "users delete their own audio comments"
  on public.audio_comments for delete
  using (auth.uid() = user_id);

create policy "admins moderate audio comments"
  on public.audio_comments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.audio_comment_likes (
  comment_id uuid not null references public.audio_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index audio_comment_likes_comment_id_idx on public.audio_comment_likes (comment_id);

alter table public.audio_comment_likes enable row level security;

create policy "users manage their own audio comment likes"
  on public.audio_comment_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create view public.audio_comment_like_counts as
  select comment_id, count(*)::integer as like_count
  from public.audio_comment_likes
  group by comment_id;

-- --- Liên kết chương ↔ audio (nhiều-nhiều) ---
-- Bảng này TỰ NÓ không nhạy cảm (không có share_token), nên select công
-- khai được — vấn đề nằm ở việc TẠO dòng mới, không phải xem dòng đã có.
create table public.chapter_audio_links (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  audio_narration_id uuid not null references public.audio_narrations (id) on delete cascade,
  linked_by uuid not null references auth.users (id),
  linked_at timestamptz not null default now(),
  unique (chapter_id, audio_narration_id)
);

alter table public.chapter_audio_links enable row level security;

create policy "audio links are publicly viewable"
  on public.chapter_audio_links for select
  using (true);

-- KHÔNG có policy insert nào ở đây — cố ý. Tạo liên kết chỉ được phép
-- qua hàm link_audio_to_chapter() bên dưới, hàm đó mới là nơi kiểm tra
-- share_token. Nếu chỉ dùng RLS "book author sở hữu chapter" như bản
-- trước, tác giả copy được id công khai là link được luôn — không kiểm
-- tra được liệu diễn viên có thật sự đồng ý hay không.

-- Gỡ liên kết thì không cần xin phép diễn viên (đây là quyền của tác giả
-- với truyện của họ), nên vẫn cho phép DELETE trực tiếp.
create policy "book authors unlink audio from their own chapters"
  on public.chapter_audio_links for delete
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = chapter_id and b.author_id = auth.uid()
  ));

-- Hàm DUY NHẤT được phép tạo liên kết — kiểm tra CẢ 2 điều kiện:
-- (1) người gọi sở hữu sách chứa chương này, VÀ
-- (2) share_token khớp đúng với audio_narration đó (chứng minh chủ sở
--     hữu audio đã chủ động chia sẻ link, không phải tác giả tự đoán id).
create function public.link_audio_to_chapter(
  p_chapter_id uuid,
  p_audio_narration_id uuid,
  p_share_token text
) returns public.chapter_audio_links as $$
declare
  v_row public.chapter_audio_links;
begin
  if not exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = p_chapter_id and b.author_id = auth.uid()
  ) then
    raise exception 'Bạn không sở hữu sách chứa chương này';
  end if;

  if not exists (
    select 1 from public.audio_narrations
    where id = p_audio_narration_id and share_token = p_share_token
  ) then
    raise exception 'Share link không đúng hoặc đã bị thu hồi';
  end if;

  insert into public.chapter_audio_links (chapter_id, audio_narration_id, linked_by)
  values (p_chapter_id, p_audio_narration_id, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- Cho diễn viên "thu hồi link" nếu lỡ chia sẻ nhầm, hoặc tác giả không
-- còn hợp tác nữa — sinh token mới, mọi link cũ vẫn hiển thị bình thường
-- (link đã tạo không tự mất) nhưng token cũ không dùng để link thêm được
-- nữa. Giống nút "Get new link" của Google Drive.
create function public.regenerate_audio_share_token(p_audio_narration_id uuid)
returns text as $$
declare
  v_new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.audio_narrations
    set share_token = v_new_token
    where id = p_audio_narration_id and narrator_id = auth.uid();
  if not found then
    raise exception 'Không tìm thấy, hoặc bạn không phải chủ sở hữu';
  end if;
  return v_new_token;
end;
$$ language plpgsql security definer;

-- --- Ảnh bìa sách — cùng cơ chế token, nhưng gắn thẳng vào cột
-- books.cover_design_item_id thay vì 1 bảng liên kết riêng (1 sách chỉ
-- có 1 bìa tại 1 thời điểm, khác audio có thể nhiều bản cùng lúc). ---
alter table public.books
  add column cover_design_item_id uuid references public.design_items (id) on delete set null;

-- Chặn việc UPDATE trực tiếp cột này qua policy "authors update their own
-- books" ở phần 3 (policy đó cho sửa TOÀN BỘ cột, không phân biệt được
-- "sửa title" với "sửa cover" — RLS không làm được điều này). Trigger này
-- chặn khi giá trị mới KHÁC NULL và bị đổi trực tiếp — cho phép xoá bìa
-- (set về null) thoải mái vì việc đó không cần ai cho phép, chỉ chặn việc
-- ĐẶT bìa mới ngoài hàm link_cover_to_book().
create function public.prevent_direct_cover_change()
returns trigger as $$
begin
  if new.cover_design_item_id is distinct from old.cover_design_item_id
     and new.cover_design_item_id is not null
     and coalesce(current_setting('vinh.allow_cover_change', true), 'false') <> 'true' then
    raise exception 'Dùng link_cover_to_book() để đổi bìa — không update trực tiếp được';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_cover_via_function
  before update on public.books
  for each row execute function public.prevent_direct_cover_change();

create function public.link_cover_to_book(
  p_book_id uuid,
  p_design_item_id uuid,
  p_share_token text
) returns public.books as $$
declare
  v_row public.books;
begin
  if not exists (select 1 from public.books where id = p_book_id and author_id = auth.uid()) then
    raise exception 'Bạn không sở hữu sách này';
  end if;

  if not exists (
    select 1 from public.design_items
    where id = p_design_item_id and share_token = p_share_token
  ) then
    raise exception 'Share link không đúng hoặc đã bị thu hồi';
  end if;

  -- Cờ tạm trong transaction hiện tại (true ở tham số cuối = local, tự
  -- hết hiệu lực khi transaction kết thúc) — cho phép chính update ngay
  -- dưới đây đi qua được trigger enforce_cover_via_function ở trên.
  perform set_config('vinh.allow_cover_change', 'true', true);

  update public.books set cover_design_item_id = p_design_item_id
    where id = p_book_id
    returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- --- Genre — dùng bởi hệ thống sinh bìa tự động (src/lib/covers/*) khi
-- sách chưa có cover_design_item_id. text + CHECK, không phải enum, để sửa
-- 1 giá trị sai hay thêm thể loại chỉ cần đổi constraint, không phải mổ
-- lại type — đã đúng như vậy: 10 giá trị dưới đây là taxonomy CHÍNH THỨC
-- của nền tảng, thay thế 8 giá trị tạm ban đầu (xem
-- migrations/20260825_update_book_genres.sql). Nullable: sách cũ chưa có
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
-- Xem migrations/20260825_restrict_books_column_grants.sql. Danh sách
-- cột được mở rộng thêm deleted_at (soft-delete) và is_exclusive (độc
-- quyền cấp truyện) bởi migrations/20260826_add_book_soft_delete.sql và
-- 20260826_add_book_exclusivity.sql, rồi finalized_at ("Hoàn thiện" —
-- Share bản thảo, phần 12e) bởi migrations/20260901_add_manuscript_share.sql
-- — published_at CỐ Ý không có trong danh sách này, xem comment ở phần 3.
-- Cột `synopsis` được cộng thêm bởi migrations/20260906_add_book_synopsis_grant.sql
-- — tác giả sửa tóm tắt truyện qua PATCH /api/authoring/books/[bookId].
revoke update on public.books from authenticated, anon;
grant update (title, genre, tags, published, deleted_at, is_exclusive, finalized_at, synopsis) on public.books to authenticated;

create function public.regenerate_design_share_token(p_design_item_id uuid)
returns text as $$
declare
  v_new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.design_items
    set share_token = v_new_token
    where id = p_design_item_id and illustrator_id = auth.uid();
  if not found then
    raise exception 'Không tìm thấy, hoặc bạn không phải chủ sở hữu';
  end if;
  return v_new_token;
end;
$$ language plpgsql security definer;

-- --- Storage buckets ---
insert into storage.buckets (id, name, public) values ('design-images', 'design-images', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('audio-narrations', 'audio-narrations', true)
  on conflict (id) do nothing;

create policy "design images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'design-images');

create policy "illustrators upload their own design images"
  on storage.objects for insert
  with check (
    bucket_id = 'design-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "illustrators update their own design images"
  on storage.objects for update
  using (
    bucket_id = 'design-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio narrations are publicly readable"
  on storage.objects for select
  using (bucket_id = 'audio-narrations');

create policy "narrators upload their own audio files"
  on storage.objects for insert
  with check (
    bucket_id = 'audio-narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "narrators update their own audio files"
  on storage.objects for update
  using (
    bucket_id = 'audio-narrations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- Cách app dùng (gợi ý luồng, không phải SQL bắt buộc) ---
--
-- Diễn viên upload độc lập, lấy link để chia sẻ:
--   const { data } = await supabase.from('audio_narrations')
--     .insert({ narrator_id: user.id, title, audio_url, duration_seconds })
--     .select('id, share_token').single();
--   → hiện cho họ: vinh.vn/lien-ket-audio?id=${data.id}&token=${data.share_token}
--   → họ tự copy link này gửi cho tác giả (kênh nào cũng được — chat, email...).
--
-- Tác giả dán link (app tự parse id + token từ URL họ paste vào):
--   const { data, error } = await supabase.rpc('link_audio_to_chapter', {
--     p_chapter_id: chapterId,
--     p_audio_narration_id: parsedId,
--     p_share_token: parsedToken,
--   });
--   // error nếu token sai/đã bị thu hồi, hoặc tác giả không sở hữu chương này.
--
-- Tác giả tự upload từ máy (không qua ai khác) — app làm 2 bước liền
-- nhau trong 1 lần bấm, TỰ CÓ token vì vừa tạo xong nên không cần ai gửi:
--   const { data: item } = await supabase.from('audio_narrations')
--     .insert({ narrator_id: user.id, title, audio_url, source: 'story_upload' })
--     .select('id, share_token').single();
--   await supabase.rpc('link_audio_to_chapter', {
--     p_chapter_id: chapterId,
--     p_audio_narration_id: item.id,
--     p_share_token: item.share_token, // họ vừa tạo, tự có sẵn, không cần dán tay
--   });
--
-- Ảnh bìa dùng đúng logic tương tự với link_cover_to_book().
--
-- Lấy danh sách audio đã link cho 1 chương (để hiện "chọn giọng đọc") —
-- LƯU Ý: join qua view public_audio_narrations, không phải bảng gốc, vì
-- bảng gốc chỉ chủ sở hữu mới select được:
--   select an.*, p.nickname as narrator_name, p.avatar_url
--   from public.chapter_audio_links cal
--   join public.public_audio_narrations an on an.id = cal.audio_narration_id
--   join public.author_public_profiles p on p.id = an.narrator_id
--   where cal.chapter_id = :chapter_id
--   order by cal.linked_at asc;

-- =======================================================================
-- Nếu bạn ĐÃ CHẠY 1 trong 2 bản audio_narrations trước đó (bản có cột
-- chapter_id/status, HOẶC bản không-token vừa rồi) — chạy dọn dẹp sau
-- TRƯỚC khi chạy phần 9 ở trên. An toàn dù bản nào bạn từng chạy, vì
-- toàn bộ dùng IF EXISTS:
--
--   drop trigger if exists enforce_narration_column_ownership on public.audio_narrations;
--   drop trigger if exists enforce_cover_via_function on public.books;
--   drop function if exists public.enforce_narration_column_ownership cascade;
--   drop function if exists public.prevent_direct_cover_change cascade;
--   drop function if exists public.link_audio_to_chapter cascade;
--   drop function if exists public.link_cover_to_book cascade;
--   drop function if exists public.regenerate_audio_share_token cascade;
--   drop function if exists public.regenerate_design_share_token cascade;
--   drop view if exists public.public_audio_narrations cascade;
--   drop view if exists public.public_design_items cascade;
--   drop table if exists public.chapter_audio_links cascade;
--   drop table if exists public.audio_narrations cascade;
--   drop table if exists public.design_items cascade;
--   drop table if exists public.design_albums cascade;
--   drop type if exists public.narration_status cascade;
--   alter table public.books drop column if exists cover_design_item_id;
--   -- book-covers bucket cũ (nếu có) không còn dùng, để nguyên vô hại
--   -- hoặc xoá thủ công qua Dashboard → Storage nếu muốn dọn sạch.
-- =======================================================================

-- ---------------------------------------------------------------------
-- 10. Hệ thống Nhiệm vụ Vịnh (Quest System)
-- ---------------------------------------------------------------------
-- Quest system KHÔNG tạo bảng system_quests/user_quest_progress riêng —
-- task_templates + user_daily_tasks (phần 7) đã làm đúng việc đó. Chỉ mở
-- rộng cặp bảng cũ + apply_transaction() (phần 6) làm đường ghi thưởng
-- duy nhất, KHÔNG có ledger riêng cho quest.

-- --- 10a. Mở rộng task_templates cho taxonomy quest. quest_type NULL =
-- nhiệm vụ hàng ngày cũ, không thuộc Quest System. Xem
-- migrations/20260827_extend_task_templates_for_quests.sql. ---
alter table public.task_templates add column quest_type text;

alter table public.task_templates
  add constraint task_templates_quest_type_check
  check (quest_type is null or quest_type in (
    'discovery', 'engagement', 'lore_hunt', 'cross_compare', 'prediction', 'topup'
  ));

-- Vị trí neo trong chương — {chapter_id, paragraph_index, char_start,
-- char_end}. paragraph_index KHÔNG phải FK (chapters.content là 1 cột
-- text, không có bảng paragraph) — chỉ số tính phía client lúc render.
alter table public.task_templates add column chapter_ref jsonb;

alter table public.task_templates add column genre text;

alter table public.task_templates add column author_id uuid references auth.users (id);

alter table public.task_templates add column generated_by text not null default 'manual';

alter table public.task_templates add column quality_flag text;

alter table public.task_templates add column similarity_to_pool_score double precision;

alter table public.task_templates
  add constraint task_templates_similarity_score_check
  check (similarity_to_pool_score is null or similarity_to_pool_score between 0 and 1);

alter table public.task_templates add column auto_flag_reason text;

-- Track lượt reset — lịch sử chi tiết ở quest_reset_events (10e).
alter table public.user_daily_tasks add column reset_count integer not null default 0;

alter table public.user_daily_tasks
  add constraint user_daily_tasks_reset_count_check check (reset_count >= 0);

-- --- 10b. quest_examples_pool — pool mẫu thủ công, few-shot cho AI sinh
-- quest (Phase 2+). Bảng mới, không có tương đương cũ. Xem
-- migrations/20260827_add_quest_examples_pool.sql. ---
create table public.quest_examples_pool (
  id uuid primary key default gen_random_uuid(),
  quest_type text not null check (quest_type in (
    'discovery', 'engagement', 'lore_hunt', 'cross_compare', 'prediction', 'topup'
  )),
  content text not null,
  genre text,
  -- 'good' | 'bad_counterexample' — pool phải có cả 2 loại cho mỗi
  -- (quest_type, genre), enforce ở quy trình soạn pool, không phải CHECK.
  example_quality text not null check (example_quality in ('good', 'bad_counterexample')),
  spoiler_risk text not null default 'low' check (spoiler_risk in ('low', 'medium', 'high')),
  version integer not null default 1,
  added_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index quest_examples_pool_type_genre_idx
  on public.quest_examples_pool (quest_type, genre);

alter table public.quest_examples_pool enable row level security;

-- Admin-only — Python service đọc qua service role, client không cần
-- SELECT trực tiếp.
create policy "admins manage quest examples pool"
  on public.quest_examples_pool for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- --- 10c. hidden_quests — nhiệm vụ ẩn theo campaign, KHÔNG nằm trong
-- random pool hàng ngày. reward_tokens là số CỐ ĐỊNH admin tự nhập lúc
-- soạn campaign — KHÔNG qua 1 bảng "reward_rules" chung, và KHÔNG cộng
-- streak bonus (streak bonus tách bạch hoàn toàn, xem 10i/10j). Kèm
-- user_hidden_quest_progress riêng (KHÔNG dùng chung user_daily_tasks —
-- campaign theo khoảng thời gian, không theo nhịp ngày). Xem
-- migrations/20260827_add_hidden_quests.sql. ---
create table public.hidden_quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Điều kiện mở khoá tự định nghĩa theo campaign — kiểm ở tầng app, shape
  -- thay đổi theo từng campaign nên không CHECK cứng.
  unlock_condition jsonb not null,
  reward_tokens integer not null check (reward_tokens >= 0),
  campaign_name text not null,
  active_from timestamptz not null,
  active_to timestamptz not null check (active_to > active_from),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index hidden_quests_active_window_idx on public.hidden_quests (active_from, active_to);

alter table public.hidden_quests enable row level security;

-- Admin-only select — client chỉ biết hidden_quests đã mở khoá qua 1 API
-- route (service role, kiểm unlock_condition ở tầng app), không query
-- thẳng bảng gốc bằng anon key.
create policy "admins manage hidden quests"
  on public.hidden_quests for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_hidden_quest_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hidden_quest_id uuid not null references public.hidden_quests (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, hidden_quest_id)
);

alter table public.user_hidden_quest_progress enable row level security;

create policy "users view their own hidden quest progress"
  on public.user_hidden_quest_progress for select
  using (auth.uid() = user_id);

create policy "admins view all hidden quest progress"
  on public.user_hidden_quest_progress for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — hoàn thành phải đi
-- qua hàm dưới đây (reward engine tự kiểm unlock_condition ở tầng app
-- TRƯỚC khi gọi — hàm này không tự validate shape jsonb đó, chỉ đảm bảo
-- atomic + chống thưởng 2 lần).
create function public.complete_hidden_quest(p_user_id uuid, p_hidden_quest_id uuid)
returns public.transactions as $$
declare
  v_quest public.hidden_quests;
  v_txn public.transactions;
  v_row_id uuid;
begin
  select * into v_quest from public.hidden_quests where id = p_hidden_quest_id;
  if v_quest is null then
    raise exception 'Hidden quest not found';
  end if;

  if now() < v_quest.active_from or now() > v_quest.active_to then
    raise exception 'Hidden quest % is not currently active', p_hidden_quest_id;
  end if;

  insert into public.user_hidden_quest_progress (user_id, hidden_quest_id, status, completed_at)
  values (p_user_id, p_hidden_quest_id, 'completed', now())
  on conflict (user_id, hidden_quest_id) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    update public.user_hidden_quest_progress
      set status = 'completed', completed_at = now()
      where user_id = p_user_id and hidden_quest_id = p_hidden_quest_id and status <> 'completed'
      returning id into v_row_id;

    if v_row_id is null then
      raise exception 'Hidden quest already completed';
    end if;
  end if;

  v_txn := public.apply_transaction(p_user_id, 'quest_reward', v_quest.reward_tokens, 'quest', p_hidden_quest_id);
  return v_txn;
end;
$$ language plpgsql security definer;

-- p_user_id là tham số trần — chỉ service_role gọi được (xem lý do đầy
-- đủ ở 10k).
revoke execute on function public.complete_hidden_quest from public, anon, authenticated;
grant execute on function public.complete_hidden_quest to service_role;

-- --- 10d. quest_reset_events — lịch sử chi tiết reset (loại quest bị
-- reset, quest thay thế, tần suất theo user) — hành vi né tránh cũng là
-- dữ liệu cần track, không chỉ hành vi hoàn thành. Xem
-- migrations/20260827_add_quest_reset_events.sql. ---
create table public.quest_reset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Polymorphic: task_templates.id hoặc hidden_quests.id, phân biệt qua
  -- quest_source. Không FK — cùng pattern purchase_transactions.chapter_id
  -- (phần 6e).
  quest_id uuid not null,
  quest_source text not null check (quest_source in ('task_template', 'hidden_quest')),
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

-- --- 10e. highlights + reading_sessions — dữ liệu hành vi đọc nền tảng,
-- công trình PHẢI XÂY MỚI (không có sẵn trước Quest System). Passive
-- signal — không gắn KPI ép buộc. Xem
-- migrations/20260827_add_reading_behavior_tables.sql. ---
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

create policy "users manage their own reading sessions"
  on public.reading_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- 10f. anchored_comments — comment neo vị trí, cơ chế trả lời DUY
-- NHẤT cho quest cần "câu trả lời" (không trắc nghiệm/điền text tự do).
-- Dùng chung vị trí neo với highlights. Xem
-- migrations/20260827_add_anchored_comments.sql. ---
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
-- ghi. Xem migrations/20260910_add_anchored_comment_replies.sql.
alter table public.anchored_comments
  add column parent_comment_id uuid references public.anchored_comments (id) on delete cascade;

create index anchored_comments_chapter_id_idx on public.anchored_comments (chapter_id);
create index anchored_comments_quest_idx on public.anchored_comments (quest_id, quest_source) where quest_id is not null;
create index anchored_comments_parent_idx on public.anchored_comments (parent_comment_id) where parent_comment_id is not null;

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

-- --- 10g. Thưởng quest — thêm loại giao dịch, KHÔNG có ledger riêng.
-- Reward engine (service layer) đọc trực tiếp task_templates.reward_tokens
-- (nhiệm vụ hàng ngày/rotate, mức cố định) hoặc hidden_quests.reward_tokens
-- (campaign, admin tự nhập) rồi gọi apply_transaction() — reference_type =
-- 'quest', reference_id = task_templates.id hoặc hidden_quests.id. KHÔNG
-- có bảng "reward_rules" chung — cả 2 nguồn đều tự giữ số token cố định
-- ngay trên bảng định nghĩa quest của mình, không tra qua bảng nào khác,
-- và KHÔNG cộng streak bonus (streak bonus tách bạch hoàn toàn, xem 10i).
-- Xem migrations/20260827_add_quest_reward_transaction_type.sql. ---
alter type public.transaction_type add value if not exists 'quest_reward';

-- --- 10h. Streak — lưu sẵn trên profiles (đọc thường xuyên, ghi ít),
-- bảo vệ trigger giống role/cccd_verified (phần 5). Kèm 2 cột phục vụ
-- luật nghỉ/cứu streak (chốt qua trao đổi trực tiếp, không có trong bản
-- phác spec gốc) — chi tiết luật ở 10l. Xem
-- migrations/20260827_add_quest_streak_to_profiles.sql. ---
alter table public.profiles add column current_quest_streak integer not null default 0;
alter table public.profiles add column streak_updated_at date;
-- Kho "thẻ nghỉ" tích lũy — xem công thức tích luỹ/trần ở sync_reading_streak() (10l).
alter table public.profiles add column streak_rest_days_banked integer not null default 0;
-- Mốc bắt đầu ân hạn khi lỡ 1 ngày và hết thẻ nghỉ — NULL = đang khoẻ mạnh.
alter table public.profiles add column streak_at_risk_since timestamptz;

alter table public.profiles
  add constraint profiles_current_quest_streak_check check (current_quest_streak >= 0);

alter table public.profiles
  add constraint profiles_streak_rest_days_banked_check check (streak_rest_days_banked >= 0);

create function public.enforce_quest_streak_authority()
returns trigger as $$
begin
  if new.current_quest_streak is distinct from old.current_quest_streak
     or new.streak_updated_at is distinct from old.streak_updated_at
     or new.streak_rest_days_banked is distinct from old.streak_rest_days_banked
     or new.streak_at_risk_since is distinct from old.streak_at_risk_since then
    if auth.uid() is not null and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    ) then
      raise exception 'streak columns can only be set by a trusted server context or an admin';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger enforce_quest_streak_authority
  before update on public.profiles
  for each row execute function public.enforce_quest_streak_authority();

-- --- 10i. streak_bonus — loại giao dịch riêng cho thưởng mốc streak,
-- TÁCH khỏi 'quest_reward' (10g) vì bản chất khác: không gắn với 1 quest
-- cụ thể nào, chỉ gắn với chuỗi ngày đọc liên tục. Xem
-- migrations/20260827_add_streak_bonus_transaction_type.sql. ---
alter type public.transaction_type add value if not exists 'streak_bonus';

-- --- 10j. streak_milestones — mốc thưởng đọc-liên-tục kiểu Duolingo,
-- định nghĩa 1 lần (7/14/30/60 ngày...), thưởng CỐ ĐỊNH của riêng mốc đó
-- — KHÔNG liên quan/không cộng-nhân vào công thức thưởng của task_template
-- hay hidden_quest (10c, 10g). profiles.current_quest_streak (10h) chỉ
-- lưu số ngày hiện tại — bảng này định nghĩa CÁC MỐC, không lưu tiến
-- trình. Xem migrations/20260827_add_streak_milestones.sql. ---
create table public.streak_milestones (
  id uuid primary key default gen_random_uuid(),
  streak_days integer not null unique check (streak_days > 0),
  reward_token integer not null check (reward_token >= 0),
  -- Chưa có bảng badges trong schema hiện tại — cột giữ chỗ, KHÔNG có FK
  -- ở đây. Thêm FK bằng 1 migration riêng sau khi bảng badges tồn tại.
  badge_id uuid,
  created_at timestamptz not null default now()
);

alter table public.streak_milestones enable row level security;

create policy "authenticated users can view streak milestones"
  on public.streak_milestones for select
  to authenticated
  using (true);

create policy "admins manage streak milestones"
  on public.streak_milestones for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Chống nhận thưởng 1 mốc nhiều lần — current_quest_streak chỉ là 1 số
-- hiện tại (có thể tụt về 0 rồi lên lại), không tự nói mốc nào đã thưởng.
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

-- Duy nhất đường ghi — kiểm streak hiện tại đã tới mốc chưa, kiểm chưa
-- claim mốc này lần nào, rồi gọi apply_transaction() giống mọi đường
-- thưởng khác — không có ledger riêng.
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

-- p_user_id là tham số trần — chỉ service_role gọi được (xem lý do đầy
-- đủ ở 10l).
revoke execute on function public.claim_streak_milestone from public, anon, authenticated;
grant execute on function public.claim_streak_milestone to service_role;

-- --- 10k. streak_rescue — loại giao dịch TRỪ token khi user trả token
-- cứu streak (rescue_streak_with_tokens(), 10l) — tách khỏi 'streak_bonus'
-- (10i, khoản CỘNG) để báo cáo/đối soát đọc trực quan hơn, giống
-- purchase_chapter/purchase_credit. Xem
-- migrations/20260827_add_streak_rescue_transaction_type.sql. ---
alter type public.transaction_type add value if not exists 'streak_rescue';

-- --- 10l. sync_reading_streak() + rescue_streak_with_tokens() — state
-- machine đầy đủ cho streak, chốt qua trao đổi trực tiếp:
--   - Kho thẻ nghỉ (streak_rest_days_banked, 10h): +1 thẻ mỗi 7 ngày
--     streak liên tục, TRẦN = min(31, 1 + floor(streak_days / 100)) —
--     trần tăng theo mốc streak (100 ngày -> trần 2, ..., 3000 ngày ->
--     trần tối đa 31). "31 ngày nghỉ" là TRẦN CỦA KHO, không phải
--     quota/tuần.
--   - Lỡ ĐÚNG 1 ngày: có thẻ -> tự trừ 1, streak KHÔNG tăng cho ngày đó
--     (giống streak freeze — "vô hình") nhưng KHÔNG reset. Hết thẻ ->
--     "at risk" (streak_at_risk_since), ĐÓNG BĂNG streak, chờ trả token
--     cứu trong 48h — hết hạn không cứu thì reset thật.
--   - Lỡ ≥ 2 ngày liên tiếp mà kho không đủ bù hết: KHÔNG có cứu (rescue
--     chỉ áp dụng lỡ đúng 1 ngày) — reset ngay, không ân hạn.
-- Xem migrations/20260827_add_streak_sync_functions.sql. ---
create function public.sync_reading_streak(p_user_id uuid, p_activity_date date default current_date)
returns public.profiles as $$
declare
  v_profile public.profiles;
  v_gap integer;
  v_needed integer;
  v_cap integer;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then
    raise exception 'User % not found', p_user_id;
  end if;

  if v_profile.streak_updated_at is null then
    update public.profiles set
      current_quest_streak = 1, streak_updated_at = p_activity_date,
      streak_rest_days_banked = 0, streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  -- Event trễ/trùng với ngày CŨ HƠN ngày đã ghi nhận — no-op, không lùi
  -- lại tính lại (tránh undo tiến trình do retry/lệch giờ client).
  if p_activity_date < v_profile.streak_updated_at then
    return v_profile;
  end if;

  v_gap := p_activity_date - v_profile.streak_updated_at;

  if v_gap = 0 then
    if v_profile.streak_at_risk_since is not null then
      update public.profiles set streak_at_risk_since = null where id = p_user_id returning * into v_profile;
    end if;
    return v_profile;
  end if;

  if v_gap = 1 then
    v_profile.current_quest_streak := v_profile.current_quest_streak + 1;
    v_cap := least(31, 1 + (v_profile.current_quest_streak / 100));
    if v_profile.current_quest_streak % 7 = 0 then
      v_profile.streak_rest_days_banked := least(v_cap, v_profile.streak_rest_days_banked + 1);
    end if;
    update public.profiles set
      current_quest_streak = v_profile.current_quest_streak, streak_updated_at = p_activity_date,
      streak_rest_days_banked = v_profile.streak_rest_days_banked, streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  v_needed := v_gap - 1;

  if v_profile.streak_rest_days_banked >= v_needed then
    update public.profiles set
      current_quest_streak = current_quest_streak + 1,
      streak_rest_days_banked = streak_rest_days_banked - v_needed,
      streak_updated_at = p_activity_date, streak_at_risk_since = null
    where id = p_user_id
    returning * into v_profile;
    return v_profile;
  end if;

  if v_needed = 1 then
    if v_profile.streak_at_risk_since is null then
      update public.profiles set streak_at_risk_since = now() where id = p_user_id returning * into v_profile;
    end if;
    return v_profile;
  end if;

  update public.profiles set
    current_quest_streak = 1, streak_updated_at = p_activity_date,
    streak_rest_days_banked = 0, streak_at_risk_since = null
  where id = p_user_id
  returning * into v_profile;
  return v_profile;
end;
$$ language plpgsql security definer;

revoke execute on function public.sync_reading_streak from public, anon, authenticated;
grant execute on function public.sync_reading_streak to service_role;

-- p_token_cost do caller (TS, src/lib/quests/config.ts) truyền vào —
-- KHÔNG hardcode số ở đây, giống create_withdrawal_request() nhận
-- p_amount_vnd đã tính sẵn từ tokensToVnd() thay vì tự tính lại trong SQL.
create function public.rescue_streak_with_tokens(p_user_id uuid, p_token_cost integer)
returns public.profiles as $$
declare
  v_profile public.profiles;
begin
  if p_token_cost <= 0 then
    raise exception 'p_token_cost must be positive, got %', p_token_cost;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then
    raise exception 'User % not found', p_user_id;
  end if;

  if v_profile.streak_at_risk_since is null then
    raise exception 'Streak is not at risk — nothing to rescue';
  end if;

  if now() > v_profile.streak_at_risk_since + interval '48 hours' then
    update public.profiles set
      current_quest_streak = 0, streak_rest_days_banked = 0,
      streak_at_risk_since = null, streak_updated_at = null
    where id = p_user_id;
    raise exception 'Grace period expired — streak already reset';
  end if;

  perform public.apply_transaction(p_user_id, 'streak_rescue', -p_token_cost, 'streak_rescue', null);

  update public.profiles set
    streak_updated_at = current_date - 1, streak_at_risk_since = null
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$ language plpgsql security definer;

revoke execute on function public.rescue_streak_with_tokens from public, anon, authenticated;
grant execute on function public.rescue_streak_with_tokens to service_role;

-- "Không giới hạn số lần rescue" là quyết định chủ động (đã hỏi lại) —
-- hệ quả: current_quest_streak KHÔNG còn phản ánh hành vi đọc thật 100%
-- nếu user đủ token trả liên tục. Dùng streak cho chân dung độc giả thì
-- cân nhắc lọc riêng theo transactions.type = 'streak_rescue'.
--
-- 2 lỗ hổng phát hiện lúc soát schema cho Quest System (ngoài phạm vi
-- quest, đã VÁ và verify trên cả staging + production):
--   1. User tự PATCH token_balance/screenshot_penalty_*/... qua REST API
--      bằng anon key — vá ở phần 1 (revoke update on public.profiles) —
--      xem migrations/20260827_restrict_profiles_column_grants.sql.
--   2. Các hàm reward cũ (apply_transaction, claim_daily_task,
--      create_withdrawal_request, grant_platform_bonus, settle_*,
--      increment_task_progress) không có REVOKE EXECUTE FROM PUBLIC
--      tường minh — Postgres mặc định cấp PUBLIC execute khi tạo hàm
--      mới, cho phép gọi thẳng RPC bằng anon key, tự chọn p_user_id là
--      người khác — vá ở đúng vị trí định nghĩa mỗi hàm (phần 6/6b/6c/
--      6d/6e/7 ở trên) — xem
--      migrations/20260827_restrict_sensitive_rpc_execute_grants.sql.
--      Đi kèm: apply_transaction từng có 3 overload cùng tồn tại (mỗi
--      lần CREATE OR REPLACE đổi chữ ký lại tạo thêm bản mới, không ghi
--      đè được bản cũ) — dọn về đúng 1 bản, xem
--      migrations/20260827_drop_stale_apply_transaction_overloads.sql.

-- ---------------------------------------------------------------------
-- 10m. user_quest_pool — random pool hàng ngày (mục 1.3), chốt qua trao
-- đổi trực tiếp (không có trong bản phác spec gốc). Khoảng trống thiết
-- kế: task_templates/user_daily_tasks (phần 7) là mô hình LAZY-PULL,
-- spec mục 1.3 cần mô hình PUSH (chốt sẵn N quest/ngày, cho reset đổi) —
-- cần bảng mới, KHÔNG dùng chung user_daily_tasks (vẫn giữ vai trò track
-- progress cũ). Xem migrations/20260828_add_user_quest_pool.sql.
-- ---------------------------------------------------------------------
create table public.user_quest_pool (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pool_date date not null default current_date,
  task_template_id uuid not null references public.task_templates (id),
  -- 0-based, ổn định qua reset — reset chỉ đổi task_template_id của
  -- đúng 1 dòng, không xáo lại vị trí các dòng khác trong ngày.
  slot_index integer not null check (slot_index >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, pool_date, slot_index),
  unique (user_id, pool_date, task_template_id)
);

create index user_quest_pool_user_date_idx on public.user_quest_pool (user_id, pool_date);

alter table public.user_quest_pool enable row level security;

create policy "users view their own quest pool"
  on public.user_quest_pool for select
  using (auth.uid() = user_id);

create policy "admins view all quest pools"
  on public.user_quest_pool for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Chốt pool hôm nay — TS layer (QuestPoolService.generateTodayPool) tự
-- tính danh sách task_template_id (trọng số theo quest_type + cooldown +
-- ràng buộc tối thiểu discovery/engagement/khác), hàm này chỉ ghi ATOMIC.
-- pg_advisory_xact_lock chống race 2 lời gọi đồng thời cùng user+ngày.
create function public.create_quest_pool_for_today(
  p_user_id uuid,
  p_pool_date date,
  p_task_template_ids uuid[]
) returns setof public.user_quest_pool as $$
declare
  v_existing_count integer;
  v_id uuid;
  v_idx integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_pool_date::text, 0));

  select count(*) into v_existing_count
    from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date;

  if v_existing_count > 0 then
    return query
      select * from public.user_quest_pool
      where user_id = p_user_id and pool_date = p_pool_date
      order by slot_index;
    return;
  end if;

  if p_task_template_ids is null or array_length(p_task_template_ids, 1) is null then
    raise exception 'p_task_template_ids must not be empty';
  end if;

  foreach v_id in array p_task_template_ids loop
    insert into public.user_quest_pool (user_id, pool_date, task_template_id, slot_index)
    values (p_user_id, p_pool_date, v_id, v_idx);

    insert into public.user_daily_tasks (user_id, template_id, task_date)
      values (p_user_id, v_id, p_pool_date)
      on conflict (user_id, template_id, task_date) do nothing;

    v_idx := v_idx + 1;
  end loop;

  return query
    select * from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date
    order by slot_index;
end;
$$ language plpgsql security definer;

revoke execute on function public.create_quest_pool_for_today from public, anon, authenticated;
grant execute on function public.create_quest_pool_for_today to service_role;

-- Đổi 1 quest trong pool hôm nay — p_replacement_template_id do TS layer
-- chọn sẵn (CÙNG quest_type với quest bị thay ra — bắt buộc, không thì
-- reset có thể phá ràng buộc tối thiểu discovery/engagement/khác của
-- ngày đó). Ngân sách reset CHUNG 3 lần/ngày cho cả pool (không phải mỗi
-- quest riêng) — đếm trực tiếp quest_reset_events, không cột counter
-- riêng nào (tránh lệch nguồn sự thật).
create function public.reset_quest_pool_slot(
  p_user_id uuid,
  p_pool_date date,
  p_task_template_id uuid,
  p_replacement_template_id uuid,
  p_max_resets_per_day integer
) returns public.user_quest_pool as $$
declare
  v_pool_row public.user_quest_pool;
  v_resets_today integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_pool_date::text, 0));

  select * into v_pool_row
    from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date and task_template_id = p_task_template_id
    for update;
  if v_pool_row is null then
    raise exception 'Quest % not found in % pool for user %', p_task_template_id, p_pool_date, p_user_id;
  end if;

  if p_task_template_id = p_replacement_template_id then
    raise exception 'Replacement quest must differ from the quest being reset';
  end if;

  if exists (
    select 1 from public.user_quest_pool
    where user_id = p_user_id and pool_date = p_pool_date and task_template_id = p_replacement_template_id
  ) then
    raise exception 'Replacement quest is already in today''s pool';
  end if;

  if exists (
    select 1 from public.user_daily_tasks
    where user_id = p_user_id and template_id = p_task_template_id and task_date = p_pool_date and completed
  ) then
    raise exception 'Cannot reset a quest already completed today';
  end if;

  select count(*) into v_resets_today
    from public.quest_reset_events
    where user_id = p_user_id and quest_source = 'task_template' and created_at::date = p_pool_date;
  if v_resets_today >= p_max_resets_per_day then
    raise exception 'Daily reset limit (%) reached', p_max_resets_per_day;
  end if;

  update public.user_quest_pool
    set task_template_id = p_replacement_template_id
    where id = v_pool_row.id
    returning * into v_pool_row;

  insert into public.user_daily_tasks (user_id, template_id, task_date)
    values (p_user_id, p_replacement_template_id, p_pool_date)
    on conflict (user_id, template_id, task_date) do nothing;

  insert into public.quest_reset_events (user_id, quest_id, quest_source, replaced_by_quest_id)
    values (p_user_id, p_task_template_id, 'task_template', p_replacement_template_id);

  update public.user_daily_tasks
    set reset_count = reset_count + 1
    where user_id = p_user_id and template_id = p_task_template_id and task_date = p_pool_date;

  return v_pool_row;
end;
$$ language plpgsql security definer;

revoke execute on function public.reset_quest_pool_slot from public, anon, authenticated;
grant execute on function public.reset_quest_pool_slot to service_role;

-- ---------------------------------------------------------------------
-- 11. Hạ tầng Python — quest_generation_jobs (Phase 2, xem prompt triển
-- khai Quest System, mục "Hạ tầng Python server"). Postgres table làm
-- queue (poll định kỳ), KHÔNG dùng Redis/RabbitMQ — đúng khuyến nghị
-- "đơn giản, không cần thêm hạ tầng ở giai đoạn này". Chưa wire route
-- publish chương của Next.js tự insert job (quyết định chủ động, test
-- tay trước) — xem python-service/. Xem
-- migrations/20260828_add_quest_generation_jobs.sql.
-- ---------------------------------------------------------------------
create table public.quest_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quest_generation_jobs_poll_idx
  on public.quest_generation_jobs (created_at)
  where status = 'queued';

alter table public.quest_generation_jobs enable row level security;

create policy "admins view quest generation jobs"
  on public.quest_generation_jobs for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — bảng hoàn toàn nội
-- bộ, chỉ Python worker (service role key RIÊNG, không dùng chung anon
-- key với frontend) và (sau này) route publish chương viết.

-- ---------------------------------------------------------------------
-- 12. Hệ thống giao dịch commission (Order/Escrow) — xem
-- migrations/20260901_add_order_payment_transaction_type.sql,
-- 20260901_add_order_earning_transaction_type.sql,
-- 20260901_add_order_system_core.sql. Phase 1: order_events (nhật ký bất
-- biến) + máy trạng thái Order cơ bản + service_listings/service_samples
-- (Mục 2 đặc tả — tạo cùng lúc cho FK, API/UI quản lý là việc phase sau).
-- CHƯA gồm: hoàn tiền tự động, mất liên lạc, bàn giao chi tiết theo loại
-- hình (Share bản thảo ghostwriting), đứng tên tác giả thay,
-- is_ghostwritten, trust score, phát hiện giao dịch ngoài nền tảng,
-- dispute — các phase sau sẽ thêm section con 12d, 12e, ... nối tiếp.
-- ---------------------------------------------------------------------

create type public.service_type as enum ('illustration', 'voice', 'ghostwriting');

-- 11 trường bắt buộc của Mục 2 đặc tả ánh xạ vào các cột dưới đây: 1 name,
-- 2 scope_description, 3 price_tiers, 4 deposit_pct, 5 delivery_days, 6
-- revisions_max, 7 tags (nhóm theo loại hình, chọn từ danh mục cố định do
-- Nền tảng quản lý — validate ở tầng service, KHÔNG ở DB), 8
-- default_usage_scope, 9 refund_policy, 10 lost_contact_days, 11
-- is_private. is_accepting_orders CHỈ được service layer bật khi đủ
-- 11/11 — xem src/lib/orders/service-listing-service.ts (phase sau).
create table public.service_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  service_type public.service_type not null,
  name text not null default '',
  scope_description text not null default '',
  price_tiers jsonb not null default '[]'::jsonb,
  deposit_pct integer,
  delivery_days integer,
  revisions_max integer,
  tags jsonb not null default '{}'::jsonb,
  default_usage_scope text,
  -- null = seller CHƯA tự khai — calculate_refund() (phase sau) dùng bảng
  -- % tối thiểu của Nền tảng làm fallback; số liệu bảng đó CHƯA có.
  refund_policy jsonb,
  lost_contact_days integer not null default 7,
  accepted_content text,
  rejected_content text,
  is_private boolean not null default false,
  is_accepting_orders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deposit_pct is null or deposit_pct between 0 and 100)
);

-- Trạng thái "nhận comm" — ĐỘC LẬP với is_accepting_orders (không nằm
-- trong 11 mục bắt buộc để publish). monthly_commission_limit null = seller
-- chưa đặt hạn mức (khi đó is_accepting_commissions không có ý nghĩa gì,
-- route chặn bật). Đếm "đang nhận bao nhiêu comm" theo TỪNG gói riêng —
-- count(*) orders where listing_id=this and status='in_progress', tính
-- trực tiếp lúc đọc, không cache cột riêng. Xem
-- migrations/20260910_add_service_commission_status.sql.
alter table public.service_listings
  add column monthly_commission_limit integer,
  add column is_accepting_commissions boolean not null default false,
  add constraint service_listings_monthly_commission_limit_check
    check (monthly_commission_limit is null or monthly_commission_limit > 0);

alter table public.service_listings enable row level security;

create policy "public can view listings accepting orders"
  on public.service_listings for select
  using (is_accepting_orders = true);

create policy "sellers manage their own listings"
  on public.service_listings for all
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "admins view all listings"
  on public.service_listings for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index service_listings_seller_idx on public.service_listings (seller_id);

create table public.service_samples (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.service_listings (id) on delete cascade,
  source text not null default 'upload' check (source in ('upload', 'auto', 'external')),
  file_url text not null,
  unverified_external boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.service_samples enable row level security;

create policy "public can view samples of listings accepting orders"
  on public.service_samples for select
  using (exists (select 1 from public.service_listings l where l.id = listing_id and l.is_accepting_orders = true));

create policy "sellers manage samples of their own listings"
  on public.service_samples for all
  using (exists (select 1 from public.service_listings l where l.id = listing_id and l.seller_id = auth.uid()))
  with check (exists (select 1 from public.service_listings l where l.id = listing_id and l.seller_id = auth.uid()));

create index service_samples_listing_idx on public.service_samples (listing_id);

-- Giữ đủ 8 trạng thái đúng sơ đồ đặc tả (kể cả 'brief_confirmed' và
-- 'deposit_paid' dù thực tế chỉ dừng lại rất ngắn — xem
-- record_order_payment() bên dưới).
create type public.order_status as enum (
  'draft', 'brief_confirmed', 'deposit_paid', 'in_progress', 'delivered', 'completed', 'cancelled', 'disputed'
);

create sequence public.order_code_seq start 2000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DH-' || nextval('public.order_code_seq')),
  buyer_id uuid not null references auth.users (id) on delete restrict,
  seller_id uuid not null references auth.users (id) on delete restrict,
  listing_id uuid not null references public.service_listings (id) on delete restrict,
  status public.order_status not null default 'draft',
  usage_scope text,
  scope_note text,
  brief text not null default '',
  brief_locked_at timestamptz,
  price integer not null,
  paid integer not null default 0,
  deposit_pct integer not null,
  revisions_max integer not null default 2,
  revisions_used integer not null default 0,
  draft_number integer not null default 0,
  drafts_approved integer not null default 0,
  delivered_at timestamptz,
  -- delivered_at + 7 ngày — cron (src/app/api/orders/cron/auto-confirm)
  -- quét cột này.
  auto_confirm_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Nội dung TOS của seller TẠI THỜI ĐIỂM "Bắt đầu giao dịch" — snapshot
  -- thật, không chỉ id.
  tos_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (price >= 0 and paid >= 0),
  check (deposit_pct between 0 and 100),
  check (usage_scope is null or usage_scope in ('personal', 'commercial_limited', 'commercial_full'))
);

alter table public.orders enable row level security;

create policy "order parties view their own orders"
  on public.orders for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "admins view all orders"
  on public.orders for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- Không có policy insert/update cho "authenticated" — mọi thay đổi trạng
-- thái qua các hàm security definer bên dưới, giống public.transactions.

create index orders_buyer_idx on public.orders (buyer_id);
create index orders_seller_idx on public.orders (seller_id);
create index orders_auto_confirm_idx on public.orders (auto_confirm_at) where status = 'delivered';

-- Nhật ký bất biến — created_at do server sinh, không nhận timestamp từ
-- client.
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users (id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_events enable row level security;

create policy "order parties view their own order events"
  on public.order_events for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create policy "admins view all order events"
  on public.order_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index order_events_order_idx on public.order_events (order_id, created_at);

-- Hàm máy trạng thái — mỗi hành động 1 hàm riêng, không có hàm "update
-- status trần" nào được phép gọi trực tiếp từ route. Nội dung đầy đủ 10
-- hàm (create_order, set_order_scope, set_order_brief,
-- confirm_order_brief, record_order_payment, submit_order_draft,
-- approve_order_draft, request_order_revision, deliver_order,
-- confirm_order_received) xem
-- migrations/20260901_add_order_system_core.sql — không lặp lại ở đây để
-- tránh 2 bản dễ lệch nhau; file migration đó LÀ nguồn sự thật cho phần
-- thân hàm. Ngoại lệ: record_order_payment() được thay bởi
-- migrations/20260924_enforce_order_payment_amounts.sql (lần trả đầu phải
-- >= round(price * deposit_pct / 100), tổng đã trả không vượt price).

-- 12d. Danh mục tag cố định cho service_listings (Mục 2.2 đặc tả) — xem
-- migrations/20260901_add_service_tag_catalog.sql,
-- scripts/seed_service_tag_options.sql (dữ liệu seed). tier/rule/multi/
-- optional/warn_text thêm bởi migrations/20260901_add_service_tag_option_metadata.sql
-- (đối chiếu lại TAG_GROUPS/VOICE_GROUPS trong Vịnh Cá nhân.dc.html).
create table public.service_tag_options (
  id uuid primary key default gen_random_uuid(),
  service_type public.service_type not null,
  group_key text not null,
  group_label text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  tier text,
  rule text,
  multi boolean not null default true,
  optional boolean not null default false,
  warn_text text,
  unique (service_type, group_key, label)
);

alter table public.service_tag_options enable row level security;

create policy "public can view tag options"
  on public.service_tag_options for select
  using (true);

create index service_tag_options_lookup_idx on public.service_tag_options (service_type, group_key, sort_order);

create table public.service_tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  service_type public.service_type not null,
  group_key text not null,
  label text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.service_tag_suggestions enable row level security;

create policy "users view their own tag suggestions"
  on public.service_tag_suggestions for select
  using (auth.uid() = submitted_by);

create policy "admins view all tag suggestions"
  on public.service_tag_suggestions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index service_tag_suggestions_status_idx on public.service_tag_suggestions (status, created_at);

-- Cờ riêng-tư MỖI ĐƠN (khác is_private của service_listings) — 1 đơn đã
-- completed có được dùng làm sample tự động (Mục 2.2 sample_source='auto')
-- hay không. Mặc định false.
alter table public.orders add column is_private boolean not null default false;

-- 12e. Share bản thảo kiểu Drive (tổng quát cho MỌI truyện ở "Viết
-- truyện", không chỉ ghostwriting) + "Hoàn thiện" — xem
-- migrations/20260901_add_manuscript_share.sql. finalized_at đã gộp vào
-- GRANT UPDATE của books ở trên (phần 3).
alter table public.books add column finalized_at timestamptz;

create function public.prevent_unfinalize_book()
returns trigger as $$
begin
  if old.finalized_at is not null and new.finalized_at is null then
    raise exception 'Không thể bỏ trạng thái Hoàn thiện của một truyện đã hoàn thiện.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger prevent_unfinalize_book_trigger
  before update on public.books
  for each row execute function public.prevent_unfinalize_book();

-- Tối đa 1 grant ĐANG HOẠT ĐỘNG/book — ép ở tầng DB qua partial unique
-- index, đúng ràng buộc "chỉ 1 tài khoản". order_id chỉ có giá trị khi
-- share phát sinh từ 1 đơn ghostwriting (route attach-book).
create table public.manuscript_access_grants (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  order_id uuid references public.orders (id),
  granted_to_user_id uuid not null references auth.users (id) on delete cascade,
  granted_by_user_id uuid not null references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  locked_at timestamptz,
  check (granted_to_user_id <> granted_by_user_id)
);

create unique index manuscript_access_grants_one_active_idx
  on public.manuscript_access_grants (book_id)
  where revoked_at is null and locked_at is null;

alter table public.manuscript_access_grants enable row level security;

create policy "granter and grantee view their own grants"
  on public.manuscript_access_grants for select
  using (auth.uid() = granted_by_user_id or auth.uid() = granted_to_user_id);

create policy "book owner grants access"
  on public.manuscript_access_grants for insert
  with check (
    auth.uid() = granted_by_user_id
    and exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid() and b.finalized_at is null)
  );

create policy "book owner revokes access before finalized"
  on public.manuscript_access_grants for update
  using (auth.uid() = granted_by_user_id and locked_at is null)
  with check (auth.uid() = granted_by_user_id and locked_at is null);

grant update (revoked_at) on public.manuscript_access_grants to authenticated;

create index manuscript_access_grants_book_idx on public.manuscript_access_grants (book_id);
create index manuscript_access_grants_grantee_idx on public.manuscript_access_grants (granted_to_user_id) where revoked_at is null;

-- Tự động khóa TOÀN BỘ grant đang hoạt động của 1 book khi "Hoàn thiện" —
-- không route nào tự set locked_at trực tiếp được (không nằm trong GRANT
-- ở trên).
create function public.lock_manuscript_grants_on_finalize()
returns trigger as $$
begin
  if new.finalized_at is not null and old.finalized_at is null then
    update public.manuscript_access_grants
      set locked_at = now()
      where book_id = new.id and revoked_at is null and locked_at is null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger lock_manuscript_grants_on_finalize_trigger
  after update on public.books
  for each row execute function public.lock_manuscript_grants_on_finalize();

-- Order biết đang viết cho truyện nào — chỉ đơn ghostwriting mới gắn.
alter table public.orders add column book_id uuid references public.books (id);

-- attach_order_book(): xem migrations/20260901_add_manuscript_share.sql —
-- không lặp lại thân hàm ở đây.

-- 12f. Bàn giao illustration/voice (Mục 4.1-4.2 đặc tả) — xem
-- migrations/20260901_add_order_delivery_assets.sql. ghostwriting đã
-- xong ở phần 12e (manuscript_access_grants).
insert into storage.buckets (id, name, public)
values ('order-deliverables', 'order-deliverables', false)
on conflict (id) do nothing;

create policy "order parties read their deliverables"
  on storage.objects for select
  using (
    bucket_id = 'order-deliverables'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
    )
  );

create table public.order_delivered_assets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('illustration_preview', 'illustration_original', 'voice_stream', 'voice_original')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.order_delivered_assets enable row level security;

create policy "order parties view their delivered assets"
  on public.order_delivered_assets for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create policy "admins view all delivered assets"
  on public.order_delivered_assets for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index order_delivered_assets_order_idx on public.order_delivered_assets (order_id);

create table public.order_file_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.order_file_requests enable row level security;

create policy "order parties view their file requests"
  on public.order_file_requests for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create index order_file_requests_order_idx on public.order_file_requests (order_id, status);

-- request_order_file()/resolve_order_file_request(): xem
-- migrations/20260901_add_order_delivery_assets.sql — không lặp lại thân
-- hàm ở đây.

-- 12g. Tính hoàn tiền + Mất liên lạc (Mục 5.1, 5.4 đặc tả) — xem
-- migrations/20260901_add_order_refund_transaction_type.sql,
-- 20260901_add_order_cancel_system.sql. QUAN TRỌNG: từ đây
-- service_listings.refund_policy PHẢI là object 4 key cố định
-- ({"before_draft":70,"draft_pending":40,"draft_approved":15,"delivered":0})
-- thay vì mảng tự do đã mô tả ở phần 12d — xem ghi chú đầu file migration
-- 20260901_add_order_cancel_system.sql. calculate_refund() sau đó được
-- CREATE OR REPLACE bởi migrations/20260901_add_order_refund_minimum_table.sql
-- để thêm bảng % SÀN của Nền tảng khi seller chưa tự khai — vế
-- seller-fault KHÔNG còn là hằng số 100% (bảng sàn thật: 100/90/70/100
-- theo mốc), sửa lại giả định ban đầu chưa được xác nhận.
create table public.order_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  cancelled_by text not null check (cancelled_by in ('buyer', 'seller')),
  refund_amount integer not null,
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.order_cancel_requests enable row level security;

create policy "order parties view their cancel requests"
  on public.order_cancel_requests for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create index order_cancel_requests_order_idx on public.order_cancel_requests (order_id, status);

-- calculate_refund()/request_order_cancel()/resolve_order_cancel_request()/
-- record_order_reminder()/record_lost_contact_report(): xem
-- migrations/20260901_add_order_cancel_system.sql — không lặp lại thân
-- hàm ở đây.

-- 12h. Đứng tên tác giả thay + is_ghostwritten/author_display (Module 5+6
-- đặc tả, yêu cầu bổ sung #2) — xem
-- migrations/20260901_add_ghostwriting_authorship.sql.
alter table public.books
  add column is_ghostwritten boolean not null default false,
  add column author_display text not null default 'pen_name'
    check (author_display in ('pen_name', 'anonymous', 'customer_name', 'co_authorship'));

-- 2 cột này KHÔNG nằm trong GRANT UPDATE của books (phần 3) — chỉ đổi
-- được qua confirm_author_name_agreement()/attach_order_book() (security
-- definer), không client nào PATCH thẳng qua REST API.

-- Mỗi Order ghostwriting tối đa 1 thỏa thuận — 2 bên xác nhận ĐỘC LẬP
-- (không phải request/resolve), bất biến sau khi đủ 2 xác nhận.
create table public.author_name_agreements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  book_id uuid not null references public.books (id),
  ghostwriter_id uuid not null references auth.users (id),
  ghostwriter_confirmed_at timestamptz,
  ghostwriter_statement_text text,
  customer_id uuid not null references auth.users (id),
  customer_confirmed_at timestamptz,
  customer_statement_text text,
  author_display_choice text not null check (author_display_choice in ('customer_name', 'co_authorship')),
  ghostwriter_sample_visible boolean not null default false,
  customer_profile_visible boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.author_name_agreements enable row level security;

create policy "ghostwriter and customer view their own agreement"
  on public.author_name_agreements for select
  using (auth.uid() = ghostwriter_id or auth.uid() = customer_id);

create index author_name_agreements_book_idx on public.author_name_agreements (book_id);

-- initiate_author_name_agreement()/confirm_author_name_agreement(): xem
-- migrations/20260901_add_ghostwriting_authorship.sql — không lặp lại
-- thân hàm ở đây. attach_order_book() (phần 12e) được CREATE OR REPLACE
-- trong migration đó để thêm dòng set is_ghostwritten=true.

-- 12i. Độ uy tín + phát hiện giao dịch ngoài nền tảng + Tranh chấp
-- (Module 7, 8, 9 đặc tả) — xem migrations/20260901_add_trust_and_disputes.sql.
alter table public.profiles
  add column trust_orders_completed integer not null default 0,
  add column trust_orders_cancelled_at_fault integer not null default 0,
  add column trust_off_platform_flags integer not null default 0,
  add column trust_violations_resolved integer not null default 0;

alter table public.direct_messages add column flagged_off_platform boolean not null default false;

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  reporter_id uuid not null references auth.users (id),
  reason_category text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  evidence_snapshot jsonb not null default '{}'::jsonb,
  resolution_note text,
  at_fault_user_id uuid references auth.users (id),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.disputes enable row level security;

create policy "order parties view their disputes"
  on public.disputes for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (auth.uid() = o.buyer_id or auth.uid() = o.seller_id)
  ));

create policy "admins view all disputes"
  on public.disputes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index disputes_order_idx on public.disputes (order_id);
create index disputes_status_idx on public.disputes (status, created_at);

-- recalculate_trust_score()/open_dispute()/resolve_dispute(): xem
-- migrations/20260901_add_trust_and_disputes.sql — không lặp lại thân hàm
-- ở đây. confirm_order_received() (phần 12c) và
-- resolve_order_cancel_request() (phần 12g) được CREATE OR REPLACE trong
-- migration đó để gọi thêm recalculate_trust_score() tường minh.

-- --- Trạng thái bảo hộ bản quyền/"không cho AI huấn luyện" thật cho nội
-- dung công khai (ảnh Thiết kế, audio) — xem
-- migrations/20260907_add_content_protection_status.sql để biết vì sao
-- "chapter" (truyện chữ) không có dòng riêng ở bảng này. ---
create table public.content_protection_status (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('audio', 'design')),
  content_id uuid not null,
  protected boolean not null default true,
  method text not null,
  applied_at timestamptz not null default now(),
  unique (content_type, content_id)
);

alter table public.content_protection_status enable row level security;

create policy "admins view content protection status"
  on public.content_protection_status for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

create index content_protection_status_type_idx
  on public.content_protection_status (content_type);

-- --- Admin duyệt/gỡ chương + Thông báo — xem
-- migrations/20260908_add_chapter_moderation_and_notifications.sql.
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

-- "Mục Thông báo" — lớp (A) ngắn gọn (title + link). Nội dung đầy đủ (lớp
-- B) nằm ở direct_messages, không lặp lại ở đây. `type` không CHECK cứng
-- để thêm loại thông báo mới sau này không cần sửa migration.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "users view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "users mark their own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at) where read_at is null;

-- Phục vụ GET /api/notifications (mọi thông báo, không chỉ chưa đọc) — xem
-- migrations/20260914_add_notifications_user_created_idx.sql.
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Realtime cho tin nhắn + thông báo (app mobile đăng ký postgres_changes; RLS
-- SELECT ở trên quyết định ai nhận hàng nào) — xem
-- migrations/20260924_enable_realtime_messages_notifications.sql. Đặt sau khi cả
-- direct_messages và notifications đã được tạo.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- --- Tách "hòm thư" trong Hội thoại theo NGỮ CẢNH tin nhắn (context) —
-- cho phép 1 admin vừa gửi tin gỡ chương (kiểm duyệt) vừa tự chat bình
-- thường với CÙNG 1 tác giả mà không bị trộn vào chung 1 hòm thư. Danh
-- tính người gửi LUÔN hiển thị thật (context không dùng để che giấu) —
-- xem migrations/20260908_add_direct_message_context.sql. ---
alter table public.direct_messages
  add column context text not null default 'personal' check (context in ('personal', 'moderation'));

drop index if exists direct_messages_thread_idx;
create index direct_messages_thread_idx
  on public.direct_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    context,
    created_at
  );

-- --- Kiểm duyệt CẤP TRUYỆN (book-level) — dùng chung kiến trúc với
-- kiểm duyệt cấp chương ở trên (bắt buộc lý do, audit trail, thông báo +
-- tin nhắn hệ thống từ chính admin thực hiện). books.deleted_at đã có sẵn
-- từ phần soft-delete phía trên — dùng lại, chỉ thêm 3 cột lý do. Xem
-- migrations/20260908_add_book_moderation.sql. ---
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

-- --- Dọn NỘI DUNG NẶNG (không xoá hàng) của truyện/chương đã xoá quá 30
-- ngày — tối ưu dung lượng, giữ hàng metadata vĩnh viễn cho audit trail.
-- KHÔNG xoá thật (orders.book_id/author_name_agreements.book_id tham
-- chiếu books không có ON DELETE CASCADE). Xem
-- migrations/20260908_add_content_purge_retention.sql +
-- api/admin/cron/purge-deleted-content/route.ts. ---
alter table public.chapters
  add column content_purged_at timestamptz;

alter table public.books
  add column content_purged_at timestamptz;

-- --- Gate nhiệm vụ ngày theo "for_role" (tác giả/người thu âm/thiết kế) —
-- NULL = áp dụng chung (mặc định đọc giả), cùng convention với quest_type
-- NULL. Unlock role tính bằng EXISTS trên books/audio_narrations/
-- design_items (src/lib/quests/creator-roles.ts), KHÔNG cache trên
-- profiles — hệ thống không xoá hàng thật nên EXISTS đã tự vĩnh viễn.
-- KHÔNG dùng profiles.creator_tags (tự khai, chưa có UI set, không mang
-- quyền hạn theo thiết kế gốc — xem phần 1). Xem
-- migrations/20260908_add_task_template_role_gating.sql. ---
alter table public.task_templates add column for_role text;

alter table public.task_templates
  add constraint task_templates_for_role_check
  check (for_role is null or for_role in ('author', 'narrator', 'designer'));

-- --- Hệ thống Thành tựu (Achievements) — 1 khung chung cho mọi role, lọc +
-- tô màu theo for_role ở UI (NULL = chung/đọc giả, cùng convention
-- task_templates.for_role). Ghép nối với streak_milestones.badge_id
-- (placeholder từ migrations/20260827_add_streak_milestones.sql) — mốc
-- streak dùng 1 hàng ở đây (metric NULL) chỉ để cấp metadata hiển thị,
-- unlock/claim streak vẫn qua claim_streak_milestone(), KHÔNG đổi. Chỉ 3
-- role sản phẩm dùng metric+threshold+sync_user_achievements(). Xem
-- migrations/20260908_add_achievement_bonus_transaction_type.sql +
-- migrations/20260908_add_achievements.sql. ---
alter type public.transaction_type add value if not exists 'achievement_bonus';

create table public.achievement_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  for_role text,
  title text not null,
  description text,
  icon text,
  color_token text not null,
  metric text,
  threshold integer,
  reward_tokens integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint achievement_templates_for_role_check
    check (for_role is null or for_role in ('author', 'narrator', 'designer')),
  constraint achievement_templates_metric_check
    check (metric is null or metric in (
      'books_published', 'audio_published', 'design_published',
      'chapters_read', 'genres_read_count', 'night_reads_count',
      'finished_stories_count', 'longest_consecutive_chapters',
      'distinct_reading_days_count', 'max_reading_sessions_per_day',
      'max_gap_days_same_book', 'weekend_both_days_read',
      'max_books_read_same_genre', 'max_genres_within_15_days', 'topup_count',
      'sad_ending_finished_count', 'underrated_finished_count',
      'bookmarked_books_count', 'max_bookmarked_books_same_genre',
      'saved_highlights_count',
      'villain_followed_count', 'hero_followed_count', 'character_guardian_achieved'
    )),
  constraint achievement_templates_metric_threshold_check
    check ((metric is null) = (threshold is null)),
  constraint achievement_templates_threshold_check check (threshold is null or threshold > 0),
  constraint achievement_templates_reward_tokens_check check (reward_tokens >= 0)
);

alter table public.achievement_templates enable row level security;

create policy "authenticated users can view active achievement templates"
  on public.achievement_templates for select
  to authenticated
  using (active);

create policy "admins manage achievement templates"
  on public.achievement_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievement_templates (id) on delete cascade,
  transaction_id uuid references public.transactions (id),
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;

create policy "users view their own achievements"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "admins view all user achievements"
  on public.user_achievements for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

create index user_achievements_user_idx on public.user_achievements (user_id);

alter table public.streak_milestones
  add constraint streak_milestones_badge_id_fkey
  foreign key (badge_id) references public.achievement_templates (id);

create function public.sync_user_achievements(p_user_id uuid)
returns setof public.user_achievements as $$
declare
  v_template public.achievement_templates;
  v_count integer;
  v_txn public.transactions;
  v_row public.user_achievements;
begin
  for v_template in
    select * from public.achievement_templates
    where active and metric is not null
      and id not in (
        select achievement_id from public.user_achievements where user_id = p_user_id
      )
  loop
    v_count := case v_template.metric
      when 'books_published' then
        (select count(*) from public.books where author_id = p_user_id and published)
      when 'audio_published' then
        (select count(*) from public.audio_narrations where narrator_id = p_user_id)
      when 'design_published' then
        (select count(*) from public.design_items where illustrator_id = p_user_id)
      when 'chapters_read' then
        (select count(distinct chapter_id) from public.reading_history
           where user_id = p_user_id and chapter_id is not null)
      when 'genres_read_count' then
        (select count(distinct b.genre) from public.reading_history rh
           join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and b.genre is not null)
      when 'night_reads_count' then
        -- Giờ server/UTC thống nhất, không theo timezone từng user — cùng
        -- quyết định đã có cho ranh giới "1 ngày" của quest pool.
        (select count(*) from public.reading_history
           where user_id = p_user_id
             and (extract(hour from timezone('utc', read_at)) >= 22
                  or extract(hour from timezone('utc', read_at)) < 2))
      when 'finished_stories_count' then
        (select count(distinct rh.book_id) from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           where rh.user_id = p_user_id and c.is_last_chapter = true)
      when 'longest_consecutive_chapters' then
        (with read_chapters as (
           select distinct c.book_id, c.order_index
           from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           where rh.user_id = p_user_id
         ), grp as (
           select book_id, order_index - row_number() over (partition by book_id order by order_index) as g
           from read_chapters
         )
         select coalesce(max(run_length), 0) from (
           select book_id, g, count(*) as run_length from grp group by book_id, g
         ) runs)
      when 'distinct_reading_days_count' then
        (select count(distinct read_at::date) from public.reading_history where user_id = p_user_id)
      when 'max_reading_sessions_per_day' then
        (with events as (
           select read_at::date as d, read_at,
                  read_at - lag(read_at) over (partition by read_at::date order by read_at) as gap
           from public.reading_history where user_id = p_user_id
         )
         select coalesce(max(session_count), 0) from (
           select d, count(*) filter (where gap is null or gap > interval '30 minutes') as session_count
           from events group by d
         ) s)
      when 'max_gap_days_same_book' then
        (with book_events as (
           select book_id, read_at - lag(read_at) over (partition by book_id order by read_at) as gap
           from public.reading_history where user_id = p_user_id
         )
         select coalesce(max(extract(day from gap)::integer), 0) from book_events)
      when 'weekend_both_days_read' then
        (select case when
           exists(select 1 from public.reading_history where user_id = p_user_id and extract(dow from read_at) = 6)
           and exists(select 1 from public.reading_history where user_id = p_user_id and extract(dow from read_at) = 0)
         then 1 else 0 end)
      when 'max_books_read_same_genre' then
        (select coalesce(max(cnt), 0) from (
           select b.genre, count(distinct rh.book_id) as cnt
           from public.reading_history rh join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and b.genre is not null
           group by b.genre
         ) t)
      when 'max_genres_within_15_days' then
        (with first_genre_read as (
           select b.genre, min(rh.read_at) as first_read
           from public.reading_history rh join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and b.genre is not null
           group by b.genre
         )
         select coalesce(max(cnt), 0) from (
           select o1.genre, count(*) as cnt
           from first_genre_read o1
           join first_genre_read o2 on o2.first_read between o1.first_read and o1.first_read + interval '15 days'
           group by o1.genre
         ) t)
      when 'topup_count' then
        (select count(*) from public.transactions
           where user_id = p_user_id and type = 'topup' and status <> 'reversed')
      when 'sad_ending_finished_count' then
        (select count(distinct rh.book_id) from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and c.is_last_chapter = true
             and exists (select 1 from unnest(b.tags) tg where lower(trim(tg)) = 'kết buồn'))
      when 'underrated_finished_count' then
        (select count(distinct rh.book_id) from public.reading_history rh
           join public.chapters c on c.id = rh.chapter_id
           join public.books b on b.id = rh.book_id
           where rh.user_id = p_user_id and c.is_last_chapter = true and b.view_count < 50)
      when 'bookmarked_books_count' then
        (select count(distinct rli.book_id) from public.reading_list_items rli
           join public.reading_lists rl on rl.id = rli.list_id
           where rl.user_id = p_user_id)
      when 'max_bookmarked_books_same_genre' then
        (select coalesce(max(cnt), 0) from (
           select b.genre, count(distinct rli.book_id) as cnt
           from public.reading_list_items rli
           join public.reading_lists rl on rl.id = rli.list_id
           join public.books b on b.id = rli.book_id
           where rl.user_id = p_user_id and b.genre is not null
           group by b.genre
         ) t)
      when 'saved_highlights_count' then
        (select count(*) from public.highlights where user_id = p_user_id)
      when 'villain_followed_count' then
        (select count(*) from public.character_follows cf
           join public.characters ch on ch.id = cf.character_id
           where cf.follower_id = p_user_id and ch.role = 'villain')
      when 'hero_followed_count' then
        (select count(*) from public.character_follows cf
           join public.characters ch on ch.id = cf.character_id
           where cf.follower_id = p_user_id and ch.role = 'hero')
      when 'character_guardian_achieved' then
        (select case when exists (
           select 1 from public.character_follows cf
           where cf.follower_id = p_user_id
             and not exists (
               select 1 from public.chapter_characters cc
               join public.chapters c on c.id = cc.chapter_id
               where cc.character_id = cf.character_id and c.published
                 and not exists (
                   select 1 from public.reading_history rh
                   where rh.user_id = p_user_id and rh.chapter_id = c.id
                 )
             )
             and exists (
               select 1 from public.chapter_characters cc
               join public.chapters c on c.id = cc.chapter_id
               where cc.character_id = cf.character_id and c.published
             )
         ) then 1 else 0 end)
      else 0
    end;

    if v_count >= v_template.threshold then
      v_txn := null;
      if v_template.reward_tokens > 0 then
        v_txn := public.apply_transaction(
          p_user_id, 'achievement_bonus', v_template.reward_tokens,
          'achievement', v_template.id
        );
      end if;

      insert into public.user_achievements (user_id, achievement_id, transaction_id)
      values (p_user_id, v_template.id, v_txn.id)
      returning * into v_row;

      return next v_row;
    end if;
  end loop;

  return;
end;
$$ language plpgsql security definer;

revoke execute on function public.sync_user_achievements from public, anon, authenticated;
grant execute on function public.sync_user_achievements to service_role;
-- --- Xoá chương nháp + sắp xếp thứ tự chương (tác giả, web + mobile).
-- Xem migrations/20260925_add_chapter_delete_and_reorder.sql. ---
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

-- --- Contest Engine — lõi Phase 1 (cuộc thi viết). Contest ─< contest_submissions
-- >─ Book (n–n); books vẫn là nguồn chân lý, không thêm cột nào vào books/
-- chapters. Mọi ghi qua service-role + RPC; client không có quyền ghi bảng
-- contest. Hai trigger mới trên bảng có sẵn: chapters_block_paid_during_contest
-- (D8) và books_block_exclusive_off_during_contest (D11). Thiết kế:
-- docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md. Xem
-- migrations/20260926_add_contest_engine_core.sql. ---

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.contest_status as enum (
    'draft', 'announced', 'submission_open', 'submission_closed',
    'community_voting', 'judging', 'results', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contest_submission_status as enum (
    'submitted', 'eligible', 'ineligible', 'withdrawn', 'disqualified', 'shortlisted'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Hàm thuần (không phụ thuộc bảng contest)
-- ---------------------------------------------------------------------

-- Cùng định nghĩa với countWords() ở src/lib/authoring/split-chapters.ts
-- (/\S+/g). JS coi NBSP và các khoảng trắng Unicode là khoảng trắng, còn
-- [:space:] của Postgres thì không → đổi chúng thành dấu cách trước khi đếm.
create or replace function public.contest_word_count(p text)
returns integer
language sql
immutable
parallel safe
as $$
  select count(*)::integer
  from regexp_matches(
    regexp_replace(coalesce(p, ''), '[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]', ' ', 'g'),
    '\S+', 'g'
  );
$$;

-- Ma trận chuyển trạng thái cuộc thi (mục VI.1): chỉ đi tiến.
create or replace function public.contest_status_transition_allowed(
  p_from public.contest_status, p_to public.contest_status
) returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft'::public.contest_status, 'announced'::public.contest_status),
    ('announced', 'submission_open'),
    ('submission_open', 'submission_closed'),
    ('submission_closed', 'community_voting'),
    ('submission_closed', 'judging'),
    ('submission_closed', 'results'),
    ('community_voting', 'judging'),
    ('community_voting', 'results'),
    ('judging', 'results'),
    ('results', 'archived')
  );
$$;

-- Ma trận chuyển trạng thái bài dự thi (mục IV.4) — phần không phụ thuộc
-- người thực hiện. Ai được làm gì kiểm ở set_contest_submission_status().
create or replace function public.contest_submission_transition_allowed(
  p_from public.contest_submission_status, p_to public.contest_submission_status
) returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('submitted'::public.contest_submission_status, 'eligible'::public.contest_submission_status),
    ('submitted', 'ineligible'),
    ('submitted', 'withdrawn'),
    ('submitted', 'disqualified'),
    ('eligible', 'ineligible'),
    ('eligible', 'withdrawn'),
    ('eligible', 'shortlisted'),
    ('eligible', 'disqualified'),
    ('ineligible', 'eligible'),
    ('ineligible', 'disqualified'),
    ('withdrawn', 'eligible'),      -- nộp lại, chỉ qua submit_contest_entry()
    ('shortlisted', 'disqualified')
  );
$$;

-- Trả tên khoá thiếu/sai kiểu đầu tiên, hoặc null nếu cấu hình đủ.
create or replace function public.contest_config_missing_key(
  p_eligibility jsonb, p_vote jsonb
) returns text
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_eligibility -> 'allow_resubmit_after_withdraw') is distinct from 'boolean'
      then 'eligibility_rules.allow_resubmit_after_withdraw'
    when jsonb_typeof(p_eligibility -> 'require_exclusive') is distinct from 'boolean'
      then 'eligibility_rules.require_exclusive'
    when jsonb_typeof(p_eligibility -> 'allow_multi_contest') is distinct from 'boolean'
      then 'eligibility_rules.allow_multi_contest'
    when coalesce(jsonb_typeof(p_eligibility -> 'max_entries_per_author'), 'missing') not in ('number', 'null')
      then 'eligibility_rules.max_entries_per_author'
    when jsonb_typeof(p_vote -> 'min_account_age_days') is distinct from 'number'
      then 'vote_rules.min_account_age_days'
    when jsonb_typeof(p_vote -> 'require_completed_chapter') is distinct from 'boolean'
      then 'vote_rules.require_completed_chapter'
    else null
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. contests
-- ---------------------------------------------------------------------
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  short_description text not null default '',
  description text not null default '',
  key_visual_url text,
  banner_url text,
  status public.contest_status not null default 'draft',
  is_featured boolean not null default false,

  submission_start timestamptz not null,
  submission_end timestamptz not null,
  voting_start timestamptz,
  voting_end timestamptz,
  judging_start timestamptz,
  judging_end timestamptz,
  result_at timestamptz,
  results_published_at timestamptz,   -- null = kết quả chưa công bố

  rules_content text not null default '',
  rules_version text not null default '1',   -- Q5: khoá cùng thể lệ khi rời draft
  prizes_summary jsonb not null default '[]'::jsonb,
  eligibility_rules jsonb not null default '{}'::jsonb,
  vote_rules jsonb not null default '{}'::jsonb,
  scoring_config jsonb not null default '{}'::jsonb,
  legacy_stats jsonb,                  -- thống kê mùa thi, chụp khi chuyển 'archived' (XIX.2)

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint contests_submission_window check (submission_start < submission_end),
  constraint contests_voting_window check (
    voting_start is null or voting_end is null or voting_start < voting_end),
  constraint contests_voting_after_open check (
    voting_start is null or voting_start >= submission_start),
  constraint contests_judging_window check (
    judging_start is null or judging_end is null or judging_start < judging_end),
  constraint contests_config_objects check (
    jsonb_typeof(eligibility_rules) = 'object' and jsonb_typeof(vote_rules) = 'object'
    and jsonb_typeof(scoring_config) = 'object' and jsonb_typeof(prizes_summary) = 'array')
);

create index if not exists contests_status_idx
  on public.contests (status, submission_end);
create index if not exists contests_featured_idx
  on public.contests (is_featured) where is_featured;

-- Nhật ký chuyển trạng thái (actor null = cron hệ thống).
create table if not exists public.contest_status_events (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  from_status public.contest_status,
  to_status public.contest_status not null,
  actor_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists contest_status_events_contest_idx
  on public.contest_status_events (contest_id, created_at);

-- Chèn: luôn bắt đầu ở 'draft'.
-- Sửa: kiểm ma trận trạng thái, cấu hình đủ khoá khi rời draft, khung bình
-- chọn khi vào community_voting; khoá thể lệ/slug sau draft (Q5), khoá
-- scoring_config từ lúc mở bình chọn; tự cập nhật updated_at.
create or replace function public.contests_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new contest must start as draft' using hint = 'contest_must_start_draft';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.contest_status_transition_allowed(old.status, new.status) then
      raise exception 'Contest status cannot go from % to %', old.status, new.status
        using hint = 'invalid_status_transition';
    end if;
    if old.status = 'draft' then
      v_missing := public.contest_config_missing_key(new.eligibility_rules, new.vote_rules);
      if v_missing is not null then
        raise exception 'Contest config is incomplete: %', v_missing using hint = 'config_incomplete';
      end if;
    end if;
    if new.status = 'community_voting' and (new.voting_start is null or new.voting_end is null) then
      raise exception 'Voting window must be set before community voting' using hint = 'voting_window_missing';
    end if;
  end if;

  if old.status <> 'draft' and (
       new.slug is distinct from old.slug
    or new.rules_content is distinct from old.rules_content
    or new.rules_version is distinct from old.rules_version
    or new.eligibility_rules is distinct from old.eligibility_rules
    or new.vote_rules is distinct from old.vote_rules
    or new.prizes_summary is distinct from old.prizes_summary
  ) then
    raise exception 'Contest rules are locked once the contest is public' using hint = 'rules_locked';
  end if;

  if new.scoring_config is distinct from old.scoring_config and (
       old.status in ('community_voting', 'judging', 'results', 'archived')
    or (old.voting_start is not null and now() >= old.voting_start)
  ) then
    raise exception 'Scoring formula is locked once voting has opened' using hint = 'scoring_locked';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contests_guard_write on public.contests;
create trigger contests_guard_write
  before insert or update on public.contests
  for each row execute function public.contests_guard_write();

-- Cuộc thi đã công khai không bao giờ bị hard-delete (X).
create or replace function public.contests_prevent_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft contests can be deleted' using hint = 'contest_not_deletable';
  end if;
  return old;
end;
$$;

drop trigger if exists contests_prevent_delete on public.contests;
create trigger contests_prevent_delete
  before delete on public.contests
  for each row execute function public.contests_prevent_delete();

-- ---------------------------------------------------------------------
-- 4. contest_submissions
-- ---------------------------------------------------------------------
create table if not exists public.contest_submissions (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete restrict,
  book_id uuid not null references public.books (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,  -- trigger ghi từ books
  -- D2: đạt điều kiện → 'eligible' ngay khi nộp. 'submitted' dành cho duyệt tay sau này.
  status public.contest_submission_status not null default 'eligible',
  status_reason text,                 -- lý do ineligible/disqualified hiển thị cho tác giả
  -- D4 + Q2 ("Cần bổ sung"): mảng cờ, cấu trúc ở XIX.6 của tài liệu thiết kế.
  -- Không tự đổi status. "Cần bổ sung" = còn cờ visible_to_author chưa resolved_at.
  review_flags jsonb not null default '[]'::jsonb,
  status_changed_by uuid references auth.users (id),
  status_changed_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),   -- đặt lại khi nộp lại sau khi rút
  rules_version_accepted text not null,
  rules_accepted_at timestamptz not null,
  eligibility_result jsonb not null default '[]'::jsonb,  -- kết quả engine lúc nộp, làm bằng chứng
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contest_submissions_contest_book_key unique (contest_id, book_id),
  constraint contest_submissions_id_contest_key unique (id, contest_id),  -- đích FK tổng hợp
  constraint contest_submissions_json_arrays check (
    jsonb_typeof(review_flags) = 'array' and jsonb_typeof(eligibility_result) = 'array')
);

create index if not exists contest_submissions_contest_status_idx
  on public.contest_submissions (contest_id, status, submitted_at desc, id);
create index if not exists contest_submissions_book_idx on public.contest_submissions (book_id);
create index if not exists contest_submissions_author_idx on public.contest_submissions (author_id);
create index if not exists contest_submissions_flagged_idx
  on public.contest_submissions (contest_id) where review_flags <> '[]'::jsonb;

-- author_id luôn lấy từ books, không bao giờ từ input; kiểm ma trận trạng
-- thái cho mọi đường ghi; tự cập nhật updated_at.
create or replace function public.contest_submissions_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select b.author_id into new.author_id from public.books b where b.id = new.book_id;
  if new.author_id is null then
    raise exception 'Book % not found', new.book_id using hint = 'book_not_found';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('submitted', 'eligible') then
      raise exception 'A new submission must be submitted or eligible' using hint = 'invalid_status_transition';
    end if;
  else
    if new.contest_id is distinct from old.contest_id or new.book_id is distinct from old.book_id then
      raise exception 'Submission contest/book cannot change' using hint = 'submission_immutable';
    end if;
    if new.status is distinct from old.status
       and not public.contest_submission_transition_allowed(old.status, new.status) then
      raise exception 'Submission status cannot go from % to %', old.status, new.status
        using hint = 'invalid_status_transition';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists contest_submissions_guard_write on public.contest_submissions;
create trigger contest_submissions_guard_write
  before insert or update on public.contest_submissions
  for each row execute function public.contest_submissions_guard_write();

-- Nhật ký chuyển trạng thái bài dự thi (giống book_moderation_actions).
create table if not exists public.contest_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.contest_submissions (id) on delete cascade,
  from_status public.contest_submission_status,
  to_status public.contest_submission_status not null,
  actor_id uuid references auth.users (id),
  actor_kind text not null check (actor_kind in ('author', 'admin', 'system')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists contest_submission_events_submission_idx
  on public.contest_submission_events (submission_id, created_at);

-- ---------------------------------------------------------------------
-- 5. contest_votes, contest_awards, contest_reminders
-- ---------------------------------------------------------------------
create table if not exists public.contest_votes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- FK tổng hợp: contest_id của vote không thể lệch với contest của bài.
  constraint contest_votes_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_votes_submission_user_key unique (submission_id, user_id)
);

create index if not exists contest_votes_contest_user_idx on public.contest_votes (contest_id, user_id);
create index if not exists contest_votes_submission_created_idx
  on public.contest_votes (submission_id, created_at);

-- Provenance: award -> submission (FK tổng hợp với contest) -> book -> author.
-- Không lưu lặp book_id/author_id; view contest_award_details join sẵn.
create table if not exists public.contest_awards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null,
  submission_id uuid not null,
  award_code text not null check (award_code ~ '^[a-z0-9_]+$'),  -- 'first_prize', 'readers_choice'
  award_name text not null,
  award_rank integer check (award_rank is null or award_rank > 0),
  category text,
  -- D10: công bố bằng VND, quy đổi sang token; lưu tỷ giá lúc trao vì
  -- TOKEN_TO_VND_RATE (src/lib/wallet/config.ts) còn là giá trị tạm.
  prize_vnd bigint not null default 0 check (prize_vnd >= 0),
  token_vnd_rate integer check (token_vnd_rate is null or token_vnd_rate > 0),
  prize_tokens integer not null default 0 check (prize_tokens >= 0),
  prize_extras text,                  -- quà kèm không quy đổi: hợp đồng xuất bản, banner…
  -- Q6: admin chi thủ công qua pay_contest_award() → grant_platform_bonus() (Slice 1.7).
  payout_transaction_id uuid,
  paid_at timestamptz,
  -- Truyện bị gỡ/loại sau khi có giải → giữ award, nhãn "Đã thu hồi".
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  revoked_reason text,
  badge_icon_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint contest_awards_submission_fk foreign key (submission_id, contest_id)
    references public.contest_submissions (id, contest_id) on delete restrict,
  constraint contest_awards_unique unique (contest_id, award_code, submission_id),
  constraint contest_awards_paid_consistent check ((payout_transaction_id is null) = (paid_at is null)),
  constraint contest_awards_revoked_reason check (revoked_at is null or coalesce(btrim(revoked_reason), '') <> '')
);

create index if not exists contest_awards_submission_idx on public.contest_awards (submission_id);

-- Q4: "Nhắc tôi khi mở" — gửi qua notifications khi cuộc thi sang submission_open.
create table if not exists public.contest_reminders (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (contest_id, user_id)
);

create index if not exists contest_reminders_pending_idx
  on public.contest_reminders (contest_id) where notified_at is null;

-- ---------------------------------------------------------------------
-- 6. Thống kê sách cho eligibility (tính trong DB, không kéo content về Node)
-- ---------------------------------------------------------------------
-- Nhận mảng book id để engine nạp context theo lô (không N+1).
create or replace function public.get_books_contest_stats(p_book_ids uuid[])
returns table (
  book_id uuid,
  published_chapter_count integer,
  total_words integer,
  priced_chapter_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         (count(c.id) filter (where c.published and c.removed_at is null))::integer,
         coalesce(sum(public.contest_word_count(c.content)) filter (where c.published and c.removed_at is null), 0)::integer,
         (count(c.id) filter (where c.removed_at is null and (c.price > 0 or c.audio_price > 0)))::integer
  from unnest(p_book_ids) as b(id)
  left join public.chapters c on c.book_id = b.id
  group by b.id;
$$;

revoke execute on function public.get_books_contest_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.get_books_contest_stats(uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- 7. D8 + D11 — trigger trên bảng có sẵn
-- ---------------------------------------------------------------------
-- "Đang dự thi" = bài submitted/eligible/shortlisted và cuộc thi chưa sang
-- results/archived. Hết hạn chế tự động — không cần job gỡ khoá.
-- plpgsql (volatile) chứ không phải sql stable: mỗi lần gọi lấy snapshot mới,
-- nên UPDATE đang chờ khoá dòng của submit_contest_entry() sẽ thấy bài vừa commit.
create or replace function public.book_has_active_contest_entry(p_book_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.contest_submissions cs
    join public.contests c on c.id = cs.contest_id
    where cs.book_id = p_book_id
      and cs.status in ('submitted', 'eligible', 'shortlisted')
      and c.status not in ('results', 'archived')
  );
end;
$$;

create or replace function public.book_has_active_exclusive_contest_entry(p_book_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.contest_submissions cs
    join public.contests c on c.id = cs.contest_id
    where cs.book_id = p_book_id
      and cs.status in ('submitted', 'eligible', 'shortlisted')
      and c.status not in ('results', 'archived')
      and (c.eligibility_rules ->> 'require_exclusive')::boolean
  );
end;
$$;

-- authenticated cần EXECUTE vì trigger dưới chạy dưới role của người ghi.
revoke execute on function public.book_has_active_contest_entry(uuid) from public, anon;
grant execute on function public.book_has_active_contest_entry(uuid) to authenticated, service_role;
revoke execute on function public.book_has_active_exclusive_contest_entry(uuid) from public, anon;
grant execute on function public.book_has_active_exclusive_contest_entry(uuid) to authenticated, service_role;

-- D8. Bắt cả removed_at: admin khôi phục một chương có giá trong lúc thi cũng bị chặn.
create or replace function public.chapters_block_paid_during_contest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.price > 0 or new.audio_price > 0)
     and new.removed_at is null
     and public.book_has_active_contest_entry(new.book_id) then
    raise exception 'Chapter of a book in an active contest must be free'
      using errcode = 'check_violation', hint = 'contest_paid_chapter';
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_block_paid_during_contest on public.chapters;
create trigger chapters_block_paid_during_contest
  before insert or update of price, audio_price, book_id, removed_at on public.chapters
  for each row execute function public.chapters_block_paid_during_contest();

-- D11. Cần trigger vì authenticated có GRANT UPDATE (is_exclusive) trên books.
create or replace function public.books_block_exclusive_off_during_contest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_exclusive and not new.is_exclusive
     and public.book_has_active_exclusive_contest_entry(new.id) then
    raise exception 'Book in an exclusive-only contest must stay exclusive'
      using errcode = 'check_violation', hint = 'contest_exclusive_lock';
  end if;
  return new;
end;
$$;

drop trigger if exists books_block_exclusive_off_during_contest on public.books;
create trigger books_block_exclusive_off_during_contest
  before update of is_exclusive on public.books
  for each row execute function public.books_block_exclusive_off_during_contest();

-- ---------------------------------------------------------------------
-- 8. RPC (service_role)
-- ---------------------------------------------------------------------

-- Chuyển trạng thái cuộc thi. p_actor_id null = cron hệ thống; khác null thì
-- phải là admin/super_admin (kiểm lại ở DB vì service-role bỏ qua RLS).
create or replace function public.transition_contest_status(
  p_contest_id uuid,
  p_to public.contest_status,
  p_actor_id uuid,
  p_reason text default null
) returns public.contests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_from public.contest_status;
begin
  if p_actor_id is not null and not exists (
    select 1 from public.profiles where id = p_actor_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;

  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  v_from := v_contest.status;

  update public.contests
     set status = p_to,
         archived_at = case when p_to = 'archived' then coalesce(archived_at, now()) else archived_at end,
         results_published_at = case when p_to = 'results' then coalesce(results_published_at, now()) else results_published_at end
   where id = p_contest_id
  returning * into v_contest;

  insert into public.contest_status_events (contest_id, from_status, to_status, actor_id, reason)
  values (p_contest_id, v_from, p_to, p_actor_id, p_reason);

  return v_contest;
end;
$$;

revoke execute on function public.transition_contest_status(uuid, public.contest_status, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_contest_status(uuid, public.contest_status, uuid, text) to service_role;

-- Nộp bài (và nộp lại sau khi rút). TS đã chạy đủ eligibility engine trước;
-- RPC kiểm lại DƯỚI KHOÁ các bất biến có tranh chấp:
--   - khoá dòng contest → tuần tự hoá mọi lần nộp vào cùng cuộc thi
--     (max_entries_per_author không bị vượt khi nộp song song);
--   - khoá dòng sách + mọi chương → không có UPDATE giá / tắt độc quyền chen
--     vào giữa (D8, D11), và 2 lần nộp cùng sách vào 2 cuộc thi khác nhau
--     được tuần tự hoá (allow_multi_contest kiểm đúng cả 2 chiều).
create or replace function public.submit_contest_entry(
  p_contest_id uuid,
  p_book_id uuid,
  p_user_id uuid,
  p_rules_version text,
  p_eligibility_result jsonb
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_book public.books;
  v_existing public.contest_submissions;
  v_result public.contest_submissions;
  v_max integer;
begin
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest % not found', p_contest_id using hint = 'contest_not_found';
  end if;
  if v_contest.status <> 'submission_open'
     or now() < v_contest.submission_start or now() >= v_contest.submission_end then
    raise exception 'Contest is not accepting submissions' using hint = 'submission_closed';
  end if;
  if p_rules_version is distinct from v_contest.rules_version then
    raise exception 'Accepted rules version does not match' using hint = 'rules_version_mismatch';
  end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then
    raise exception 'Book % not found', p_book_id using hint = 'book_not_found';
  end if;
  if v_book.author_id is distinct from p_user_id then
    raise exception 'Book is not owned by caller' using hint = 'not_owner';
  end if;
  if not v_book.published or v_book.deleted_at is not null then
    raise exception 'Book is not visible' using hint = 'book_not_visible';
  end if;

  perform 1 from public.chapters where book_id = p_book_id for update;
  if exists (
    select 1 from public.chapters
    where book_id = p_book_id and removed_at is null and (price > 0 or audio_price > 0)
  ) then
    raise exception 'Every chapter must be free to enter a contest' using hint = 'paid_chapters';
  end if;

  if (v_contest.eligibility_rules ->> 'require_exclusive')::boolean and not v_book.is_exclusive then
    raise exception 'Contest requires an exclusive book' using hint = 'not_exclusive';
  end if;

  if exists (
    select 1 from public.contest_submissions s
    join public.contests oc on oc.id = s.contest_id
    where s.book_id = p_book_id
      and s.contest_id <> p_contest_id
      and s.status in ('submitted', 'eligible', 'shortlisted')
      and oc.status not in ('results', 'archived')
      and (not (v_contest.eligibility_rules ->> 'allow_multi_contest')::boolean
           or not (oc.eligibility_rules ->> 'allow_multi_contest')::boolean)
  ) then
    raise exception 'Book is in another contest that does not allow multiple entries'
      using hint = 'multi_contest_conflict';
  end if;

  if jsonb_typeof(v_contest.eligibility_rules -> 'max_entries_per_author') = 'number' then
    v_max := (v_contest.eligibility_rules ->> 'max_entries_per_author')::integer;
    if (
      select count(*) from public.contest_submissions
      where contest_id = p_contest_id and author_id = p_user_id and book_id <> p_book_id
        and status in ('submitted', 'eligible', 'shortlisted')
    ) >= v_max then
      raise exception 'Author reached the entry limit for this contest' using hint = 'max_entries_reached';
    end if;
  end if;

  select * into v_existing from public.contest_submissions
  where contest_id = p_contest_id and book_id = p_book_id for update;

  if found then
    if v_existing.status = 'withdrawn'
       and (v_contest.eligibility_rules ->> 'allow_resubmit_after_withdraw')::boolean then
      update public.contest_submissions
         set status = 'eligible',
             status_reason = null,
             status_changed_by = p_user_id,
             status_changed_at = now(),
             submitted_at = now(),
             rules_version_accepted = p_rules_version,
             rules_accepted_at = now(),
             eligibility_result = coalesce(p_eligibility_result, '[]'::jsonb)
       where id = v_existing.id
      returning * into v_result;

      insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
      values (v_result.id, 'withdrawn', 'eligible', p_user_id, 'author', 'resubmit');
      return v_result;
    end if;
    raise exception 'Book is already entered in this contest'
      using errcode = 'unique_violation', hint = 'already_submitted';
  end if;

  insert into public.contest_submissions (
    contest_id, book_id, author_id, status, status_changed_by,
    rules_version_accepted, rules_accepted_at, eligibility_result
  ) values (
    p_contest_id, p_book_id, p_user_id, 'eligible', p_user_id,
    p_rules_version, now(), coalesce(p_eligibility_result, '[]'::jsonb)
  )
  returning * into v_result;

  insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
  values (v_result.id, null, 'eligible', p_user_id, 'author', 'submit');
  return v_result;
end;
$$;

revoke execute on function public.submit_contest_entry(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_contest_entry(uuid, uuid, uuid, text, jsonb) to service_role;

-- Đổi trạng thái bài dự thi — ai được làm gì (IV.4, D6):
--   author: chỉ rút (→ withdrawn) bài của chính mình, từ submitted/eligible,
--           trước submission_end;
--   admin:  mọi chuyển hợp lệ trong ma trận trừ withdrawn; ineligible/
--           disqualified bắt buộc lý do (hiển thị cho tác giả);
--   system: submitted → eligible/ineligible (duyệt tự động).
create or replace function public.set_contest_submission_status(
  p_submission_id uuid,
  p_to public.contest_submission_status,
  p_actor_id uuid,
  p_actor_kind text,
  p_reason text default null
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_result public.contest_submissions;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select * into v_contest from public.contests where id = v_sub.contest_id;

  if v_sub.status = p_to then
    raise exception 'Submission is already %', p_to using hint = 'no_change';
  end if;

  if p_actor_kind = 'author' then
    if p_to <> 'withdrawn' then
      raise exception 'Authors can only withdraw' using hint = 'not_allowed';
    end if;
    if v_sub.author_id is distinct from p_actor_id then
      raise exception 'Submission is not owned by caller' using hint = 'not_owner';
    end if;
    if v_sub.status not in ('submitted', 'eligible') or now() >= v_contest.submission_end then
      raise exception 'Submission can no longer be withdrawn' using hint = 'withdraw_closed';
    end if;
  elsif p_actor_kind = 'admin' then
    if not exists (
      select 1 from public.profiles where id = p_actor_id and role in ('admin', 'super_admin')
    ) then
      raise exception 'Actor is not an admin' using hint = 'not_admin';
    end if;
    if p_to = 'withdrawn' then
      raise exception 'Only the author can withdraw' using hint = 'not_allowed';
    end if;
    if p_to in ('ineligible', 'disqualified') and coalesce(btrim(p_reason), '') = '' then
      raise exception 'A reason is required' using hint = 'reason_required';
    end if;
  elsif p_actor_kind = 'system' then
    if p_actor_id is not null or v_sub.status <> 'submitted' or p_to not in ('eligible', 'ineligible') then
      raise exception 'System can only review submitted entries' using hint = 'not_allowed';
    end if;
  else
    raise exception 'Unknown actor kind %', p_actor_kind using hint = 'not_allowed';
  end if;

  -- Ma trận (không phụ thuộc người thực hiện) được trigger guard kiểm.
  update public.contest_submissions
     set status = p_to,
         status_reason = case when p_to in ('ineligible', 'disqualified') then btrim(p_reason) else null end,
         status_changed_by = p_actor_id,
         status_changed_at = now()
   where id = p_submission_id
  returning * into v_result;

  insert into public.contest_submission_events (submission_id, from_status, to_status, actor_id, actor_kind, reason)
  values (p_submission_id, v_sub.status, p_to, p_actor_id, p_actor_kind, nullif(btrim(p_reason), ''));

  return v_result;
end;
$$;

revoke execute on function public.set_contest_submission_status(uuid, public.contest_submission_status, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_contest_submission_status(uuid, public.contest_submission_status, uuid, text, text) to service_role;

-- Bình chọn (D5): 1 phiếu / bài / tài khoản, không giới hạn số bài; đã đọc
-- hết ≥ 1 chương đang hiển thị của truyện (reading_history chỉ có dòng khi
-- tới đoạn cuối chương, qua kiểm quyền đọc ở server); tài khoản đủ tuổi.
create or replace function public.cast_contest_vote(
  p_user_id uuid,
  p_submission_id uuid
) returns public.contest_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_contest public.contests;
  v_user_created timestamptz;
  v_vote public.contest_votes;
begin
  select * into v_sub from public.contest_submissions where id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  select * into v_contest from public.contests where id = v_sub.contest_id;

  if v_contest.status <> 'community_voting'
     or v_contest.voting_start is null or v_contest.voting_end is null
     or now() < v_contest.voting_start or now() >= v_contest.voting_end then
    raise exception 'Voting is not open' using hint = 'voting_closed';
  end if;

  if v_sub.status not in ('eligible', 'shortlisted') or not exists (
    select 1 from public.books b where b.id = v_sub.book_id and b.published and b.deleted_at is null
  ) then
    raise exception 'Entry cannot receive votes' using hint = 'entry_not_votable';
  end if;

  if v_sub.author_id = p_user_id then
    raise exception 'Authors cannot vote for their own entry' using hint = 'own_entry';
  end if;

  select created_at into v_user_created from auth.users where id = p_user_id;
  if v_user_created is null then
    raise exception 'User % not found', p_user_id using hint = 'user_not_found';
  end if;
  if v_user_created > now() - make_interval(days => (v_contest.vote_rules ->> 'min_account_age_days')::integer) then
    raise exception 'Account is too new to vote' using hint = 'account_too_new';
  end if;

  if (v_contest.vote_rules ->> 'require_completed_chapter')::boolean and not exists (
    select 1 from public.reading_history rh
    join public.chapters ch on ch.id = rh.chapter_id
    where rh.user_id = p_user_id
      and ch.book_id = v_sub.book_id
      and ch.published and ch.removed_at is null
  ) then
    raise exception 'Read at least one chapter before voting' using hint = 'no_completed_chapter';
  end if;

  insert into public.contest_votes (contest_id, submission_id, user_id)
  values (v_sub.contest_id, p_submission_id, p_user_id)
  on conflict (submission_id, user_id) do nothing
  returning * into v_vote;

  if v_vote.id is null then
    raise exception 'Already voted for this entry' using hint = 'already_voted';
  end if;
  return v_vote;
end;
$$;

revoke execute on function public.cast_contest_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cast_contest_vote(uuid, uuid) to service_role;

-- Bỏ phiếu — chỉ trong khung bình chọn. Trả true nếu có phiếu để bỏ.
create or replace function public.retract_contest_vote(
  p_user_id uuid,
  p_submission_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest public.contests;
  v_deleted integer;
begin
  select c.* into v_contest
  from public.contest_submissions s join public.contests c on c.id = s.contest_id
  where s.id = p_submission_id;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;

  if v_contest.status <> 'community_voting'
     or v_contest.voting_start is null or v_contest.voting_end is null
     or now() < v_contest.voting_start or now() >= v_contest.voting_end then
    raise exception 'Voting is not open' using hint = 'voting_closed';
  end if;

  delete from public.contest_votes where submission_id = p_submission_id and user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke execute on function public.retract_contest_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retract_contest_vote(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 9. RLS + GRANT
-- ---------------------------------------------------------------------
alter table public.contests enable row level security;
alter table public.contest_status_events enable row level security;
alter table public.contest_submissions enable row level security;
alter table public.contest_submission_events enable row level security;
alter table public.contest_votes enable row level security;
alter table public.contest_awards enable row level security;
alter table public.contest_reminders enable row level security;

-- Không có đường ghi nào cho client: bỏ luôn quyền ghi mặc định của Supabase.
revoke insert, update, delete, truncate on
  public.contests, public.contest_status_events, public.contest_submissions,
  public.contest_submission_events, public.contest_votes, public.contest_awards,
  public.contest_reminders
from anon, authenticated;

-- contests: công khai trừ nháp. Admin đọc nháp qua route service-role (bỏ
-- qua RLS) — KHÔNG hỏi public.profiles ở đây: policy SELECT của profiles tự
-- truy vấn lại profiles, nên mọi policy khác tham chiếu profiles đều gây
-- "infinite recursion detected in policy for relation profiles" (42P17) khi
-- anon/authenticated đọc bảng này.
drop policy if exists "public contests are readable" on public.contests;
create policy "public contests are readable"
  on public.contests for select
  using (status <> 'draft');

-- contest_submissions: công khai chỉ khi bài hợp lệ, cuộc thi không nháp VÀ
-- sách còn hiển thị (tôn trọng moderation); tác giả thấy bài của mình.
-- Archive hiển thị bài của sách đã gỡ qua API service-role (placeholder), không qua policy này.
drop policy if exists "public contest submissions are readable" on public.contest_submissions;
create policy "public contest submissions are readable"
  on public.contest_submissions for select
  using (
    auth.uid() = author_id
    or (
      status in ('eligible', 'shortlisted')
      and exists (select 1 from public.contests c where c.id = contest_id and c.status <> 'draft')
      and exists (select 1 from public.books b where b.id = book_id and b.published and b.deleted_at is null)
    )
  );

-- contest_votes: chỉ thấy phiếu của chính mình (không lộ ai bầu cho ai).
drop policy if exists "users view their own contest votes" on public.contest_votes;
create policy "users view their own contest votes"
  on public.contest_votes for select
  using (auth.uid() = user_id);

-- contest_awards: chỉ công khai khi kết quả đã công bố.
drop policy if exists "published contest awards are readable" on public.contest_awards;
create policy "published contest awards are readable"
  on public.contest_awards for select
  using (exists (
    select 1 from public.contests c
    where c.id = contest_id and c.status in ('results', 'archived')
      and c.results_published_at is not null and c.results_published_at <= now()
  ));

drop policy if exists "users view their own contest reminders" on public.contest_reminders;
create policy "users view their own contest reminders"
  on public.contest_reminders for select
  using (auth.uid() = user_id);

-- contest_status_events / contest_submission_events: không có policy select
-- → chỉ service-role đọc; API trả phần tác giả được xem.

-- security_invoker: view chạy RLS của người gọi → không lộ award chưa công
-- bố (view mặc định chạy quyền OWNER, bỏ qua RLS của contest_awards).
create or replace view public.contest_award_details
  with (security_invoker = true) as
  select a.*, s.book_id, s.author_id, c.slug as contest_slug, c.title as contest_title
  from public.contest_awards a
  join public.contest_submissions s on s.id = a.submission_id
  join public.contests c on c.id = a.contest_id;

revoke insert, update, delete, truncate on public.contest_award_details from anon, authenticated;
grant select on public.contest_award_details to anon, authenticated;

-- --- Contest Engine — xếp hạng + feed (đọc, service_role): BXH Độc giả yêu
-- thích (popular-v1 = số phiếu hợp lệ, rank() toàn cục, keyset), feed
-- new/discover/az có trạng thái bình chọn của người xem theo lô, số bài/tác
-- giả cho thẻ cuộc thi. Xem migrations/20260926_add_contest_ranking_and_feeds.sql. ---

create or replace function public.get_contest_ranking(
  p_contest_id uuid,
  p_limit integer,
  p_after_rank integer default null,
  p_after_submitted_at timestamptz default null,
  p_after_id uuid default null
) returns table (
  submission_id uuid,
  book_id uuid,
  author_id uuid,
  value integer,
  submitted_at timestamptz,
  rank integer,
  tied boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with entries as (
    select s.id, s.book_id, s.author_id, s.submitted_at
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id and c.status <> 'draft'
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.contest_id = p_contest_id
      and s.status in ('eligible', 'shortlisted')
  ),
  votes as (
    select v.submission_id, count(*)::integer as n
    from public.contest_votes v
    where v.contest_id = p_contest_id
    group by v.submission_id
  ),
  ranked as (
    select e.id, e.book_id, e.author_id, e.submitted_at,
           coalesce(v.n, 0) as value,
           (rank() over (order by coalesce(v.n, 0) desc))::integer as rank,
           count(*) over (partition by coalesce(v.n, 0)) > 1 as tied
    from entries e
    left join votes v on v.submission_id = e.id
  )
  select r.id, r.book_id, r.author_id, r.value, r.submitted_at, r.rank, r.tied
  from ranked r
  where p_after_id is null
     or r.rank > p_after_rank
     or (r.rank = p_after_rank and (r.submitted_at, r.id) > (p_after_submitted_at, p_after_id))
  order by r.value desc, r.submitted_at asc, r.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.get_contest_ranking(uuid, integer, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_contest_ranking(uuid, integer, integer, timestamptz, uuid) to service_role;

create or replace function public.get_contest_entries(
  p_contest_id uuid,              -- null = mọi cuộc thi công khai đang diễn ra (hub)
  p_sort text,                    -- 'new' | 'discover' | 'az'
  p_seed text,                    -- chỉ dùng cho 'discover'
  p_genre text,                   -- null = mọi thể loại
  p_limit integer,
  p_after_key text default null,  -- sort_key của dòng cuối trang trước
  p_after_id uuid default null,
  p_viewer_id uuid default null
) returns table (
  submission_id uuid,
  contest_id uuid,
  book_id uuid,
  author_id uuid,
  status public.contest_submission_status,
  submitted_at timestamptz,
  sort_key text,
  viewer_has_voted boolean,
  viewer_completed_chapter boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_after_ts timestamptz;
begin
  if p_sort not in ('new', 'discover', 'az') then
    raise exception 'Unknown sort %', p_sort using hint = 'invalid_sort';
  end if;
  if p_sort = 'discover' and coalesce(p_seed, '') = '' then
    raise exception 'Discover feed needs a seed' using hint = 'invalid_sort';
  end if;
  -- Ép kiểu cursor TRƯỚC truy vấn: OR trong SQL không đảm bảo đánh giá ngắn
  -- mạch, nên không được để p_after_key::timestamptz chạy trên cursor md5/tựa.
  if p_sort = 'new' and p_after_id is not null then
    begin
      v_after_ts := p_after_key::timestamptz;
    exception when others then
      raise exception 'Invalid cursor' using hint = 'invalid_cursor';
    end;
  end if;

  return query
  with entries as (
    select s.id, s.contest_id, s.book_id, s.author_id, s.status, s.submitted_at,
           case p_sort
             when 'new' then to_char(s.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             when 'discover' then md5(s.id::text || p_seed)
             else lower(b.title)
           end as sort_key
    from public.contest_submissions s
    join public.contests c on c.id = s.contest_id
    join public.books b on b.id = s.book_id and b.published and b.deleted_at is null
    where s.status in ('eligible', 'shortlisted')
      and (
        (p_contest_id is not null and s.contest_id = p_contest_id and c.status <> 'draft')
        or (p_contest_id is null and c.status in ('submission_open', 'submission_closed', 'community_voting', 'judging'))
      )
      and (p_genre is null or b.genre = p_genre)
  ),
  page as (
    select e.* from entries e
    where p_after_id is null
       or (p_sort = 'new' and (e.submitted_at, e.id) < (v_after_ts, p_after_id))
       or (p_sort <> 'new' and (e.sort_key, e.id) > (p_after_key, p_after_id))
    order by
      case when p_sort = 'new' then e.submitted_at end desc,
      case when p_sort = 'new' then e.id end desc,
      case when p_sort <> 'new' then e.sort_key end asc,
      case when p_sort <> 'new' then e.id end asc
    limit v_limit
  )
  select p.id, p.contest_id, p.book_id, p.author_id, p.status, p.submitted_at, p.sort_key,
         p_viewer_id is not null and exists (
           select 1 from public.contest_votes v where v.submission_id = p.id and v.user_id = p_viewer_id
         ),
         p_viewer_id is not null and exists (
           select 1 from public.reading_history rh
           join public.chapters ch on ch.id = rh.chapter_id
           where rh.user_id = p_viewer_id and ch.book_id = p.book_id and ch.published and ch.removed_at is null
         )
  from page p
  order by
    case when p_sort = 'new' then p.submitted_at end desc,
    case when p_sort = 'new' then p.id end desc,
    case when p_sort <> 'new' then p.sort_key end asc,
    case when p_sort <> 'new' then p.id end asc;
end;
$$;

revoke execute on function public.get_contest_entries(uuid, text, text, text, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_contest_entries(uuid, text, text, text, integer, text, uuid, uuid) to service_role;

create or replace function public.get_contest_summaries(p_contest_ids uuid[])
returns table (contest_id uuid, entry_count integer, author_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         count(s.id)::integer,
         count(distinct s.author_id)::integer
  from unnest(p_contest_ids) as c(id)
  left join public.contest_submissions s
    on s.contest_id = c.id
   and s.status in ('eligible', 'shortlisted')
   and exists (select 1 from public.books b where b.id = s.book_id and b.published and b.deleted_at is null)
  group by c.id;
$$;

revoke execute on function public.get_contest_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.get_contest_summaries(uuid[]) to service_role;

-- --- Contest Engine — cờ "Cần bổ sung" (Q2): gắn / xử lý cờ trong
-- contest_submissions.review_flags, khoá dòng + kiểm admin trong DB, không
-- đổi status bài (D4). Xem migrations/20260926_add_contest_review_flags.sql. ---

create or replace function public.add_contest_review_flag(
  p_submission_id uuid,
  p_admin_id uuid,
  p_code text,
  p_message text,
  p_fix_by timestamptz,
  p_visible_to_author boolean default true
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
begin
  if p_admin_id is not null and not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if coalesce(p_code, '') !~ '^[a-z0-9_]+$' then
    raise exception 'Flag code must be snake_case' using hint = 'invalid_flag';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'A message is required' using hint = 'reason_required';
  end if;

  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  if v_sub.status not in ('submitted', 'eligible', 'shortlisted') then
    raise exception 'Only active entries can be flagged' using hint = 'not_allowed';
  end if;
  -- Không gắn trùng một mã đang mở (hệ thống kiểm lại nhiều lần vẫn chỉ 1 cờ).
  if exists (
    select 1 from jsonb_array_elements(v_sub.review_flags) f
    where f ->> 'code' = p_code and f -> 'resolved_at' = 'null'::jsonb
  ) then
    raise exception 'An open flag with this code already exists' using hint = 'flag_exists';
  end if;

  update public.contest_submissions
     set review_flags = review_flags || jsonb_build_array(jsonb_build_object(
           'id', gen_random_uuid(),
           'code', p_code,
           'source', case when p_admin_id is null then 'system' else 'admin' end,
           'message', btrim(p_message),
           'visible_to_author', coalesce(p_visible_to_author, true),
           'fix_by', p_fix_by,
           'created_at', now(),
           'created_by', p_admin_id,
           'resolved_at', null,
           'resolved_by', null,
           'resolution', null))
   where id = p_submission_id
  returning * into v_sub;
  return v_sub;
end;
$$;

revoke execute on function public.add_contest_review_flag(uuid, uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.add_contest_review_flag(uuid, uuid, text, text, timestamptz, boolean) to service_role;

-- fixed = tác giả đã sửa; dismissed = cờ không còn đúng; escalated = chuyển
-- sang xử lý loại bài (admin đổi status riêng bằng set_contest_submission_status).
create or replace function public.resolve_contest_review_flag(
  p_submission_id uuid,
  p_flag_id uuid,
  p_admin_id uuid,
  p_resolution text
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_found boolean;
begin
  if p_admin_id is not null and not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if p_resolution is null or p_resolution not in ('fixed', 'dismissed', 'escalated') then
    raise exception 'Unknown resolution %', p_resolution using hint = 'invalid_flag';
  end if;

  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_sub.review_flags) f
    where f ->> 'id' = p_flag_id::text and f -> 'resolved_at' = 'null'::jsonb
  ) into v_found;
  if not v_found then
    raise exception 'Open flag % not found', p_flag_id using hint = 'flag_not_found';
  end if;

  update public.contest_submissions
     set review_flags = (
       select coalesce(jsonb_agg(
         case when f ->> 'id' = p_flag_id::text
              then f || jsonb_build_object('resolved_at', now(), 'resolved_by', p_admin_id, 'resolution', p_resolution)
              else f end
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(v_sub.review_flags) with ordinality as t(f, ord)
     )
   where id = p_submission_id
  returning * into v_sub;
  return v_sub;
end;
$$;

revoke execute on function public.resolve_contest_review_flag(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_contest_review_flag(uuid, uuid, uuid, text) to service_role;
