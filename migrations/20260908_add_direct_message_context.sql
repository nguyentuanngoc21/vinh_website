-- Migration: tách "hòm thư" trong Hội thoại theo NGỮ CẢNH tin nhắn
-- (context), không phải theo tài khoản gửi — thay cho hướng ban đầu
-- (migrations/20260908_add_chapter_moderation_and_notifications.sql,
-- cờ profiles.is_system cố định trên 1 tài khoản).
--
-- Lý do đổi: admin muốn dùng THẲNG tài khoản super_admin THẬT của mình
-- làm người gửi (không tạo tài khoản giả riêng), nhưng:
--   - Khi gửi tin GỠ CHƯƠNG (hành động kiểm duyệt) -> phải hiện như tin
--     nhắn từ "Đội ngũ Vịnh" (ẩn danh tính cá nhân), VÀ dù nhiều admin
--     khác nhau cùng gỡ chương, tác giả vẫn chỉ thấy 1 kênh duy nhất.
--   - Khi CHÍNH tài khoản đó tự nhắn tin bình thường (không liên quan gỡ
--     chương) -> phải hiện như người dùng thật, không bị "dính" nhãn hệ
--     thống lên MỌI cuộc trò chuyện của họ.
-- -> is_system (cờ theo TÀI KHOẢN) không tách được 2 trường hợp trên vì
-- cùng 1 tài khoản. Cần 1 cờ theo TỪNG TIN NHẮN — context.
--
-- profiles.is_system (migration trước) VẪN GIỮ NGUYÊN, không đổi vai trò:
-- vẫn là "tài khoản nào đóng vai người gửi kiểm duyệt" — chỉ khác là giờ
-- gắn thêm context='moderation' lên tin nhắn CỤ THỂ nó gửi lúc gỡ chương,
-- thay vì mọi tin của nó đều bị coi là hệ thống.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging trước.

BEGIN;

alter table public.direct_messages
  add column context text not null default 'personal' check (context in ('personal', 'moderation'));

-- Đổi index thread hiện có (least/greatest + created_at) để gộp cả
-- context — 1 cặp (mình, tài khoản kiểm duyệt) giờ có THỂ có 2 hòm thư
-- tách biệt (cá nhân + kiểm duyệt), cần lọc theo context hiệu quả.
drop index if exists direct_messages_thread_idx;
create index direct_messages_thread_idx
  on public.direct_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    context,
    created_at
  );

COMMIT;

-- Notes:
-- 1. Idempotent theo kiểu "chạy 1 lần" — alter add column sẽ lỗi nếu
--    chạy lại khi cột đã tồn tại.
-- 2. Không backfill gì khác — mọi tin nhắn CŨ (trước migration này) mặc
--    định context='personal', đúng thực tế vì tính năng gỡ chương chưa
--    từng gửi tin nào trước đây.
-- 3. Bảo mật: KHÔNG cho client tự đặt context='moderation' tuỳ ý qua
--    POST /api/messages/:userId — route đó tự hạ về 'personal' trừ khi
--    recipientId đúng là tài khoản is_system=true (xem route đó), để
--    không ai giả mạo "tin nhắn từ Vịnh" gửi cho người khác.
