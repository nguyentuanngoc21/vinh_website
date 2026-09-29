-- Migration: admin duyệt/gỡ chương truyện + hệ thống Thông báo.
--
-- Bối cảnh: chapters trước giờ chỉ có `published` (không phân biệt được
-- "tác giả tự để nháp" với "admin gỡ vì vi phạm"). Không có bảng
-- notifications nào.
--
-- Người gửi tin nhắn khi gỡ chương LÀ chính admin thực hiện thao tác đó
-- (tài khoản thật của họ, không phải 1 tài khoản "hệ thống" ẩn danh
-- riêng) — xem api/admin/chapters/[chapterId]/route.ts +
-- migrations/20260908_add_direct_message_context.sql (context tách hòm
-- thư kiểm duyệt khỏi chat cá nhân với cùng admin đó, KHÔNG che danh
-- tính người gửi).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging trước.

BEGIN;

-- --- 1. Trạng thái gỡ/khôi phục chương (admin) ---
-- Tách biệt hẳn với `published` của tác giả — published=false do admin gỡ
-- PHẢI phân biệt được với published=false vì tác giả tự để nháp. Khi gỡ:
-- set published=false (để RLS/trang đọc ẩn ngay, không cần sửa RLS) +
-- 4 cột dưới đây ghi lại lý do. Khi khôi phục: published=true lại, 4 cột
-- này về null.
alter table public.chapters
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users (id),
  add column removed_reason_group text,
  add column removed_reason_detail text;

-- --- 2. Nhật ký hành động duyệt/gỡ (audit trail) ---
-- Giữ lại MỌI lần gỡ/khôi phục, kể cả sau khi chapters.removed_* đã bị ghi
-- đè bởi lần khôi phục/gỡ tiếp theo — tra cứu lịch sử đầy đủ, không chỉ
-- trạng thái hiện tại.
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

-- --- 3. Thông báo ("mục Thông báo") ---
-- Lớp (A) ngắn gọn trong đặc tả — chỉ có 1 dòng title + link điều hướng.
-- Nội dung đầy đủ (lớp B) nằm ở direct_messages, KHÔNG lặp lại ở đây.
-- `type` để mở rộng về sau (chưa có gì khác 'chapter_removed'/'chapter_restored'
-- lúc migration này chạy, nhưng không CHECK cứng để không phải sửa
-- migration mỗi khi thêm loại thông báo mới).
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

-- Đánh dấu đã đọc — cùng mức tin tưởng RLS đang áp cho direct_messages
-- (recipient tự UPDATE read_at qua policy, không qua RPC riêng).
create policy "users mark their own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at) where read_at is null;

COMMIT;

-- Notes:
-- 1. Không backfill — chương đã gỡ trước đây (nếu có, chỉ qua published=false
--    thủ công) sẽ không có removed_at/reason, hiện đúng thực tế là
--    "không có lịch sử ghi lại", không giả vờ có lý do.
-- 2. KHÔNG cần tạo tài khoản "hệ thống" nào — route gỡ chương dùng thẳng
--    tài khoản admin đang đăng nhập làm người gửi tin nhắn.
