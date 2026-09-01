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

create policy "profiles are readable by their owner and admins"
  on public.profiles for select
  using (auth.uid() = id or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

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
  'order_refund'
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

create policy "users manage their own reading history"
  on public.reading_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
-- share_token. Đây là view app dùng để hiện danh sách công khai.
create view public.public_design_items as
  select id, illustrator_id, title, image_url, source, created_at, category, description, share_count
  from public.design_items;

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

-- security definer: tăng share_count an toàn dưới race condition, không
-- cho client tự set bằng bất kỳ số nào — chỉ +1 đúng 1 tác phẩm/lần gọi.
-- Không yêu cầu đăng nhập, giống increment_book_view_count.
create function public.increment_design_item_share_count(p_design_item_id uuid)
returns void as $$
  update public.design_items set share_count = share_count + 1 where id = p_design_item_id;
$$ language sql security definer set search_path = public;

grant execute on function public.increment_design_item_share_count(uuid) to anon, authenticated;

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
revoke update on public.books from authenticated, anon;
grant update (title, genre, tags, published, deleted_at, is_exclusive, finalized_at) on public.books to authenticated;

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

create index anchored_comments_chapter_id_idx on public.anchored_comments (chapter_id);
create index anchored_comments_quest_idx on public.anchored_comments (quest_id, quest_source) where quest_id is not null;

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
-- thân hàm.

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