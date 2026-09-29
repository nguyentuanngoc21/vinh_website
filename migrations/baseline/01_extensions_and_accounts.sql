-- =======================================================================
-- Baseline 01 — Extension + tài khoản  (01_extensions_and_accounts.sql)
-- =======================================================================
-- Phạm vi: Extension (vector, pgcrypto), enum vai trò/tag sáng tác,
-- profiles + view công khai, xác minh CCCD (identity_verifications + bucket
-- identity-documents), bucket avatars, chặn đổi role/cccd_verified trái
-- phép, kiểm tra đăng ký realtime, dọn đăng ký chưa xác nhận, nhật ký đổi
-- quyền (role_change_logs) + admin_set_user_role().
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     profiles, identity_verifications, role_change_logs
--   View:
--     author_public_profiles
--   Hàm:
--     current_user_is_admin, is_email_registered,
--     find_stale_unconfirmed_user_ids, enforce_role_change_authority,
--     enforce_cccd_verified_authority, admin_set_user_role
--   Kiểu (enum):
--     user_role, creator_tag, verification_status
--   Storage bucket:
--     identity-documents, avatars
--
-- Gộp từ migration (migrations/archive/):
--   20260826_add_profile_bank_info.sql, 20260827_add_profile_bio.sql,
--   20260827_restrict_profiles_column_grants.sql,
--   20260828_add_profile_cover_image.sql,
--   20260828_extend_author_public_profiles.sql,
--   20260829_add_author_contract_fields.sql,
--   20260901_add_blogger_creator_tag.sql,
--   20260914_raise_avatar_cover_size_limit.sql,
--   20260916_add_realtime_signup_checks.sql,
--   20260916_add_unconfirmed_registration_purge.sql,
--   20260926_fix_profiles_policy_recursion.sql,
--   20260928_add_role_change_logs.sql
--
-- Phụ thuộc (phải chạy trước): không có
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

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
-- migrations/archive/20260831_add_book_read_counts_daily.sql); the all-time board
-- still ranks by books.view_count directly. /audio and /thiet-ke are real
-- now too (src/lib/audio/get-audio-catalog.ts,
-- src/lib/design/get-design-gallery.ts) — design_items grew
-- category/description/share_count + a design_item_likes table
-- (migrations/archive/20260901_add_design_item_gallery_metadata.sql),
-- audio_narrations grew genre/play_count + an audio_progress table for
-- real "Nghe tiếp"/"Audio đang nghe" state
-- (migrations/archive/20260901_add_audio_narration_hub_metadata.sql), and both
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

-- Bật extension pgvector (Database → Extensions, hoặc chạy lệnh dưới nếu
-- role của bạn có quyền).
create extension if not exists vector;

-- Trên Supabase, pgcrypto thường được cài vào schema "extensions" (không
-- phải "public") — nên mọi lời gọi gen_random_bytes() bên dưới đều chỉ
-- rõ extensions.gen_random_bytes(...), tránh lỗi "function does not exist"
-- nếu search_path không tình cờ bao gồm schema đó.
create extension if not exists pgcrypto with schema extensions;

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
-- 'blogger' thêm bởi migrations/archive/20260901_add_blogger_creator_tag.sql — mục
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
  -- có không cần sửa. Xem migrations/archive/20260828_add_profile_cover_image.sql.
  cover_image_url text,
  role public.user_role not null default 'user',
  creator_tags public.creator_tag[] not null default '{}',
  real_name text,
  phone text,
  -- migrations/archive/20260829_add_author_contract_fields.sql — dùng để tự điền
  -- "BÊN A" trong Hợp đồng khai thác tác phẩm độc quyền (xem
  -- src/lib/legal/registry.ts) mà không cần tác giả gõ tay lại.
  date_of_birth date,
  address text,
  cccd_verified boolean not null default false,
  created_at timestamptz not null default now(),
  -- Mô tả bản thân + mốc lần đổi nickname gần nhất (tab "Thông tin cá nhân",
  -- src/components/profile/edit-profile-tab.tsx) — nickname_updated_at chỉ
  -- dùng để enforce cooldown 30 ngày ở tầng ứng dụng
  -- (src/app/api/profile/me/route.ts), không phải cột hiển thị. Khai báo
  -- ngay trong CREATE TABLE (không ALTER ở phần 6 như trước) vì view
  -- author_public_profiles ngay bên dưới đọc cột bio.
  bio text,
  nickname_updated_at timestamptz
);

alter table public.profiles enable row level security;

-- Kiểm quyền admin cho policy của profiles. SECURITY DEFINER (bỏ qua RLS) —
-- nếu policy tự subquery trên profiles, Postgres báo 42P17 "infinite
-- recursion detected in policy for relation profiles" cho mọi role chịu RLS,
-- kể cả gián tiếp qua policy bảng khác. Không nhận tham số: chỉ trả lời về
-- chính người gọi. Xem migrations/archive/20260926_fix_profiles_policy_recursion.sql.
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
-- lúc đó. Xem migrations/archive/20260827_restrict_profiles_column_grants.sql.
revoke update on public.profiles from authenticated, anon;

-- A separate public-facing view for author pages / by-lines, so the app
-- never needs to select from `profiles` directly for anything visitor-facing
-- (keeps phone/real_name/cccd_verified out of reach by construction).
-- Không lọc theo role — mọi user (kể cả role='user' thường, có gắn tag
-- creator_tags hay không) đều cần username/nickname/avatar hiện công khai.
create view public.author_public_profiles as
  select id, username, nickname, avatar_url, cover_image_url, bio, created_at, creator_tags
  from public.profiles;

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
-- migrations/archive/20260916_add_realtime_signup_checks.sql — partial unique index
-- (định nghĩa ngay dưới bảng, sau CREATE TABLE) chặn 1 số CCCD dùng cho
-- nhiều tài khoản. Bỏ qua status = 'rejected' để 1 lượt bị admin từ chối
-- không khoá vĩnh viễn số đó — vẫn nộp lại được sau.
create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cccd_number text not null,
  -- migrations/archive/20260829_add_author_contract_fields.sql — "cấp ngày" trong
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

-- migrations/archive/20260916_add_realtime_signup_checks.sql — email đã có tài
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

-- migrations/archive/20260916_add_unconfirmed_registration_purge.sql — id các tài
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
-- Data-retention note (Nghị định 13/2023/NĐ-CP): define how long a
-- rejected/expired verification's CCCD images are kept, then enforce it
-- with a scheduled job (Supabase Cron + Edge Function) that deletes the
-- storage objects and nulls out cccd_number for rows past that window —
-- RLS controls *who* can read this table, not *how long* the data lives.


-- ---------------------------------------------------------------------
-- 4. Storage buckets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('identity-documents', 'identity-documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
-- Avatar/ảnh bìa upload thẳng lên đây qua signed upload URL (bỏ qua giới
-- hạn ~4.5MB body của Vercel Serverless Functions) — xem
-- migrations/archive/20260914_raise_avatar_cover_size_limit.sql.
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
-- migrations/archive/20260826_add_profile_bank_info.sql.
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

-- --- Nhật ký đổi quyền + đổi quyền nguyên tử (chỉ super_admin). Xem
-- migrations/archive/20260928_add_role_change_logs.sql. ---
create table if not exists public.role_change_logs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  old_role public.user_role not null,
  new_role public.user_role not null,
  created_at timestamptz not null default now()
);

create index if not exists role_change_logs_target_idx
  on public.role_change_logs (target_id, created_at desc);

alter table public.role_change_logs enable row level security;
revoke all on public.role_change_logs from anon, authenticated;

-- Trả role sau khi đổi. Lỗi mang hint: actor_not_super_admin,
-- self_demotion, target_not_found.
create or replace function public.admin_set_user_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_role public.user_role
)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.user_role;
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'super_admin'
  ) then
    raise exception 'Only a super_admin can change a role' using hint = 'actor_not_super_admin';
  end if;

  if p_actor_id = p_target_id and p_role <> 'super_admin' then
    raise exception 'A super_admin cannot demote themselves' using hint = 'self_demotion';
  end if;

  select role into v_old from public.profiles where id = p_target_id for update;
  if v_old is null then
    raise exception 'Profile % not found', p_target_id using hint = 'target_not_found';
  end if;

  if v_old = p_role then
    return v_old;
  end if;

  update public.profiles set role = p_role where id = p_target_id;
  insert into public.role_change_logs (target_id, actor_id, old_role, new_role)
  values (p_target_id, p_actor_id, v_old, p_role);

  return p_role;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, uuid, public.user_role) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, uuid, public.user_role) to service_role;
