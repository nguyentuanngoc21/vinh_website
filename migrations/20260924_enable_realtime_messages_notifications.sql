-- Migration: bật Supabase Realtime cho tin nhắn và thông báo (app mobile, Phase 5b).
--
-- Trước đây không bảng nào được thêm vào publication `supabase_realtime`; web
-- chat/chuông thông báo tự tải lại theo chu kỳ (5–30 giây). App mobile đăng ký
-- postgres_changes để nhận tin/thông báo mới ngay.
--
-- Bảo mật: Realtime postgres_changes áp dụng RLS SELECT của bảng cho từng người
-- đăng ký (JWT của phiên), nên mỗi người chỉ nhận đúng hàng mình được đọc:
--   - direct_messages: "participants read their own messages"
--     (auth.uid() = sender_id OR auth.uid() = recipient_id);
--   - notifications: "users view their own notifications" (auth.uid() = user_id).
-- Không đổi policy nào. Không có DELETE trên 2 bảng này (không có DELETE policy),
-- nên không có sự kiện xoá nào cần lọc.
--
-- Idempotent: chỉ ADD TABLE khi bảng chưa nằm trong publication; bỏ qua nếu
-- publication không tồn tại (dự án không bật Realtime).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime không tồn tại — bỏ qua';
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

-- Notes:
-- - Chạy trên ĐÚNG dự án Supabase mà app mobile dùng (EXPO_PUBLIC_SUPABASE_URL /
--   MOBILE_SUPABASE_URL) — có thể khác database web local.
-- - docs/supabase/schema.sql: đã thêm cùng khối này sau bảng notifications.
-- - src/lib/supabase/types.ts: không đổi (không đổi bảng/cột).
-- - Kiểm tra sau khi chạy:
--     select tablename from pg_publication_tables
--     where pubname = 'supabase_realtime' and schemaname = 'public'
--       and tablename in ('direct_messages', 'notifications');   -- phải ra 2 dòng
