-- =======================================================================
-- Baseline 06 — Mạng xã hội & tin nhắn  (06_social_and_messaging.sql)
-- =======================================================================
-- Phạm vi: Theo dõi tác giả, tin nhắn 1-1 (direct_messages + ngữ cảnh),
-- thông báo, realtime publication.
--
-- Đối tượng tạo trong file này:
--   Bảng:
--     author_follows, direct_messages, notifications
--
-- Gộp từ migration (migrations/archive/):
--   20260824_add_author_follows.sql, 20260828_add_direct_messages.sql,
--   20260908_add_chapter_moderation_and_notifications.sql,
--   20260908_add_direct_message_context.sql,
--   20260912_add_direct_messages_participant_indexes.sql,
--   20260914_add_notifications_user_created_idx.sql,
--   20260924_enable_realtime_messages_notifications.sql
--
-- Phụ thuộc (phải chạy trước): không có
-- Chỉ dùng cho project MỚI, TRỐNG — xem migrations/baseline/README.md.
-- =======================================================================

-- --- Theo dõi tác giả, dạng toggle (nút Theo dõi/Đang theo dõi ở trang
-- đọc chương) — quan hệ profile-to-profile nên đặt ngay đây, không thuộc
-- phần 3 (books/chapters). Composite PK, giống book_progress, không có
-- bảng nào khác cần FK trỏ vào 1 dòng follow. Route API thật dùng
-- service-role + userId resolve qua getAuthedUserId() (src/lib/wallet/session.ts)
-- — RLS dưới đây chỉ là defense-in-depth. Xem
-- migrations/archive/20260824_add_author_follows.sql. ---
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
-- migrations/archive/20260828_add_direct_messages.sql. ---
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
-- migrations/archive/20260912_add_direct_messages_participant_indexes.sql —
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
-- migrations/archive/20260914_add_notifications_user_created_idx.sql.
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Realtime cho tin nhắn + thông báo (app mobile đăng ký postgres_changes; RLS
-- SELECT ở trên quyết định ai nhận hàng nào) — xem
-- migrations/archive/20260924_enable_realtime_messages_notifications.sql. Đặt sau khi cả
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
-- xem migrations/archive/20260908_add_direct_message_context.sql. ---
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
