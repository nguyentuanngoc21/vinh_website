-- Migration: index cho truy vấn "danh sách hội thoại" (GET /api/messages)
-- — sửa lỗi 504 Gateway Timeout thật đã xảy ra trên production (Supabase
-- REST log: GET .../direct_messages?...&order=created_at.desc&limit=300
-- → 504, ứng với src/app/api/messages/route.ts báo
-- "[messages] list failed: { message: 'Gateway Timeout' }").
--
-- Nguyên nhân: route đó chạy
--   WHERE sender_id = :me OR recipient_id = :me
--   ORDER BY created_at DESC LIMIT 300
-- trên TOÀN BỘ bảng direct_messages (không lọc theo 1 đối tác cụ thể —
-- khác với truy vấn "xem 1 luồng" ở api/messages/[userId]). 2 index hiện
-- có (xem migrations/20260828_add_direct_messages.sql,
-- migrations/20260908_add_direct_message_context.sql) không phục vụ được
-- truy vấn này:
--   - direct_messages_thread_idx bắt đầu bằng LEAST/GREATEST(sender_id,
--     recipient_id) — biểu thức, không khớp cú pháp với điều kiện
--     "sender_id = :me OR recipient_id = :me" nên Postgres không dùng
--     được index này cho truy vấn trên.
--   - direct_messages_unread_idx là partial index (WHERE read_at IS
--     NULL) — chỉ phục vụ đúng nhánh tin CHƯA đọc, không phải toàn bộ.
-- Kết quả: Postgres phải seq scan + sort toàn bảng mỗi lần ai đó mở tab
-- "Hội thoại" — càng nhiều tin nhắn tích luỹ, càng chậm dần tới khi vượt
-- timeout của PostgREST/Kong (504).
--
-- Fix: thêm 2 index thường (sender_id, created_at) và (recipient_id,
-- created_at) — Postgres kết hợp bằng BitmapOr rồi chỉ sort đúng tập tin
-- nhắn CỦA NGƯỜI ĐÓ (rất nhỏ so với toàn bảng) thay vì sort toàn bảng.
--
-- Dùng CONCURRENTLY vì bảng đang có traffic ghi thật (tin nhắn mới liên
-- tục) — CREATE INDEX thường khoá SHARE, chặn INSERT/UPDATE/DELETE suốt
-- lúc build index trên bảng đã đủ lớn để gây 504; CONCURRENTLY không
-- chặn ghi (đánh đổi: build lâu hơn, và KHÔNG được chạy trong transaction
-- block).
--
-- QUAN TRỌNG — không chỉ là "không bọc BEGIN/COMMIT": Supabase SQL Editor
-- (và psql khi dán nhiều câu cùng lúc qua 1 lần gửi) tự coi TOÀN BỘ nội
-- dung 1 lần "Run" là 1 transaction ngầm, kể cả khi không có BEGIN tường
-- minh nào trong đó — dán 2 câu CREATE INDEX CONCURRENTLY bên dưới rồi
-- Run 1 lần sẽ vẫn báo lỗi 25001 "cannot run inside a transaction block"
-- (đã xảy ra thật). BẮT BUỘC chạy 2 câu CREATE INDEX riêng — xoá sạch ô
-- SQL Editor, dán ĐÚNG 1 câu, Run, đợi xong hẳn, rồi mới xoá ô dán câu
-- còn lại. Không dán cả 2 câu (dù không có BEGIN) vào cùng 1 lần Run.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

CREATE INDEX CONCURRENTLY IF NOT EXISTS direct_messages_sender_created_idx
  ON public.direct_messages (sender_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS direct_messages_recipient_created_idx
  ON public.direct_messages (recipient_id, created_at DESC);

-- Notes:
-- 1. Idempotent: CÓ — IF NOT EXISTS, an toàn chạy lại nếu lần trước bị
--    ngắt giữa chừng (CONCURRENTLY có thể để lại index INVALID nếu lỗi/bị
--    huỷ — nếu gặp, DROP INDEX CONCURRENTLY IF EXISTS index đó rồi chạy
--    lại câu CREATE tương ứng).
-- 2. Cập nhật docs/supabase/schema.sql — thêm 2 CREATE INDEX này ngay sau
--    direct_messages_thread_idx (giữ nguyên cú pháp không CONCURRENTLY ở
--    đó vì schema.sql dùng để dựng project MỚI TỪ ĐẦU, chưa có traffic
--    nên không cần CONCURRENTLY).
-- 3. Không đổi src/lib/supabase/types.ts — chỉ thêm index, không thêm
--    cột/bảng.
-- 4. Không đổi code route — index này chỉ tăng tốc truy vấn hiện có ở
--    src/app/api/messages/route.ts, không đổi hành vi/kết quả trả về.
