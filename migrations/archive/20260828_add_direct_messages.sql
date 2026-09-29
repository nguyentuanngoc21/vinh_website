-- Migration: direct_messages — nhắn tin 1-1 thật giữa 2 người dùng, dùng
-- cho tab "Hội thoại" (/ca-nhan) và nút "Nhắn tin" ở "Kết nối" (/ket-noi).
-- Trước giờ hoàn toàn mock (CONVERSATIONS/THREADS ở src/lib/profile.ts,
-- ô soạn tin còn chưa có onChange) — bảng này KHÔNG có tương đương cũ.
--
-- Thiết kế tối giản 1 bảng (không tách conversations/participants riêng)
-- vì đây chỉ là chat 1-1, không có group chat — "cuộc hội thoại" giữa 2
-- người suy ra được trực tiếp từ cặp (sender_id, recipient_id), không cần
-- bảng riêng để định danh nó. Cùng tinh thần "không tạo bảng thừa" đã áp
-- dụng cho Quest System (xem migrations/20260827_extend_task_templates_for_quests.sql).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- NULL = người nhận chưa đọc. Chỉ recipient tự đánh dấu đọc (route
  -- GET /api/messages/[userId] tự làm khi mở 1 luồng) — không có khái
  -- niệm "đã gửi/đã nhận" (delivery status) như app chat thật, chỉ có
  -- đọc/chưa đọc.
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_messages_no_self_message CHECK (sender_id <> recipient_id)
);

-- Truy vấn chính: "lấy toàn bộ tin nhắn giữa tôi và người X" — lọc theo
-- least/greatest(sender_id, recipient_id) để 1 index dùng được cho cả 2
-- chiều gửi/nhận thay vì cần 2 index riêng.
CREATE INDEX direct_messages_thread_idx
  ON public.direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at);

-- Truy vấn phụ: đếm tin chưa đọc gửi TỚI tôi, theo từng người gửi (dùng
-- ở danh sách hội thoại).
CREATE INDEX direct_messages_unread_idx
  ON public.direct_messages (recipient_id, sender_id) WHERE read_at IS NULL;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Chỉ người gửi/người nhận thấy được tin — không có policy "public
-- select" nào cả, khác hẳn author_public_profiles.
CREATE POLICY "participants read their own messages"
  ON public.direct_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "users send messages as themselves"
  ON public.direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Chỉ người NHẬN được sửa (đánh dấu đọc) — RLS không phân biệt được cột
-- (chỉ read_at được đổi trong thực tế), chốt chặn cột nằm ở route server
-- (dùng service-role, chỉ set đúng read_at) như phần lớn bảng khác trong
-- repo.
CREATE POLICY "recipients mark messages read"
  ON public.direct_messages FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

COMMIT;

-- Notes:
-- 1. Idempotent: KHÔNG — bảng mới hoàn toàn, chạy 2 lần sẽ lỗi "already
--    exists". An toàn để chạy 1 lần trên môi trường chưa có bảng này.
-- 2. Cập nhật docs/supabase/schema.sql (thêm bảng + policy, đặt cạnh
--    author_follows ở phần "Theo dõi tác giả" vì cùng nhóm tính năng
--    profile-to-profile) + src/lib/supabase/types.ts
--    (Tables.direct_messages).
-- 3. Route thật (src/app/api/messages/...) dùng service-role client cho
--    mọi write (khớp pattern api/profile/cover, api/profile/identity...),
--    RLS ở đây chỉ là defense-in-depth, không phải chốt chặn chính.
-- 4. Không giới hạn rate/spam ở tầng DB (không trigger đếm số tin/phút) —
--    ngoài phạm vi "nối thật DB nhắn tin" lần này, thêm sau nếu cần.
