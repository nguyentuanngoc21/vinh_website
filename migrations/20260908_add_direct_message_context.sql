-- Migration: tách "hòm thư" trong Hội thoại theo NGỮ CẢNH tin nhắn
-- (context) — cho phép 1 admin vừa gửi tin GỠ CHƯƠNG (kiểm duyệt) vừa tự
-- chat bình thường với CÙNG 1 tác giả, mà 2 luồng đó không bị trộn lẫn
-- vào chung 1 hòm thư.
--
-- Người gửi tin gỡ chương LÀ chính tài khoản admin thực hiện thao tác đó
-- (danh tính thật — tên/avatar thật, không che giấu) — xem
-- api/admin/chapters/[chapterId]/route.ts. context chỉ dùng để ĐỊNH
-- TUYẾN (routing) tin nhắn vào đúng hòm thư, không dùng để đổi cách hiển
-- thị danh tính người gửi.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging trước.

BEGIN;

alter table public.direct_messages
  add column context text not null default 'personal' check (context in ('personal', 'moderation'));

-- Đổi index thread hiện có (least/greatest + created_at) để gộp cả
-- context — 1 cặp (tác giả, admin) giờ có THỂ có 2 hòm thư tách biệt
-- (cá nhân + kiểm duyệt), cần lọc theo context hiệu quả.
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
--    POST /api/messages/:userId. Route đó chỉ chấp nhận khi: người nhận
--    có role admin/super_admin VÀ đã từng có ít nhất 1 tin
--    context='moderation' TỪ chính người nhận đó GỬI cho người đang gửi
--    request (tức đang trả lời 1 thông báo có thật, không phải tự bịa ra
--    1 cuộc "kiểm duyệt" với ai đó) — ngược lại tự hạ về 'personal'. Xem
--    route đó để biết chi tiết.
