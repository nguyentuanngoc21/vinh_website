-- Migration: agreement_acceptances — lưu việc người dùng đã xác nhận
-- (hoặc chưa) từng văn bản trong tab "Cam kết & Thỏa thuận" (/ca-nhan).
-- Trước giờ hoàn toàn chưa có: LegalLink (footer, form đăng ký/đăng nhập)
-- chỉ HIỂN THỊ Điều khoản/Bảo mật, không ghi lại việc người dùng đã đồng ý
-- văn bản nào, lúc nào.
--
-- 1 dòng/(user, agreement) — KHÔNG phải log lịch sử mọi lần xác nhận, chỉ
-- giữ lần xác nhận GẦN NHẤT (đủ để trả lời "đã xác nhận bản mới nhất chưa").
-- accepted_version = "UTD" (yyyy-MM-dd) của văn bản tại thời điểm xác nhận —
-- xem src/lib/legal/registry.ts. Khi nội dung văn bản được cập nhật (UTD
-- đổi), accepted_version cũ không còn khớp AGREEMENTS[...].updatedAt nữa ->
-- ứng dụng tự coi là "Chưa xác nhận" mà không cần cột trạng thái riêng hay
-- lệnh UPDATE hàng loạt nào ở đây.
--
-- agreement_id là text tham chiếu tới AgreementId trong
-- src/lib/legal/registry.ts, KHÔNG có bảng "agreements" riêng ở DB (danh
-- sách văn bản là hằng số trong code, không phải dữ liệu do người dùng
-- tạo) — cùng tinh thần "không tạo bảng thừa" đã áp dụng cho
-- direct_messages (xem migrations/20260828_add_direct_messages.sql).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agreement_acceptances (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  agreement_id text NOT NULL CHECK (char_length(agreement_id) BETWEEN 1 AND 64),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  -- "UTD" (yyyy-MM-dd) của văn bản tại thời điểm xác nhận — so với
  -- AGREEMENTS[...].updatedAt hiện tại để biết còn hiệu lực hay đã bị một
  -- bản cập nhật mới hơn làm hết hiệu lực.
  accepted_version text NOT NULL,
  PRIMARY KEY (user_id, agreement_id)
);

ALTER TABLE public.agreement_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own agreement acceptances" ON public.agreement_acceptances;
CREATE POLICY "users manage their own agreement acceptances"
  ON public.agreement_acceptances FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- Notes:
-- 1. Idempotent: CÓ (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS rồi
--    tạo lại) — an toàn chạy lại nhiều lần.
-- 2. Cập nhật cùng lúc:
--    - docs/supabase/schema.sql — thêm bảng + policy này, đặt cạnh
--      identity_verifications (cùng nhóm "hồ sơ/tuân thủ của user").
--    - src/lib/supabase/types.ts — thêm Tables.agreement_acceptances
--      (Row/Insert/Update, cùng khuôn với book_progress: primary key kép,
--      Update = Partial<Insert>).
-- 3. Route thật:
--    - GET  /api/profile/agreements (src/app/api/profile/agreements/route.ts)
--    - POST /api/profile/agreements/[agreementId]/accept
--      (src/app/api/profile/agreements/[agreementId]/accept/route.ts)
--    dùng createClient() (RLS thật, không service-role) — user chỉ có thể
--    tự ghi nhận việc CHÍNH MÌNH xác nhận, giống pattern chapter_votes.
-- 4. Gating thật: src/lib/authoring/exclusivity-agreement.ts đọc bảng này để
--    chặn bật books.is_exclusive khi "Chính sách độc quyền xuất bản"
--    (agreement_id = 'chinh-sach-doc-quyen') chưa được xác nhận ở đúng
--    version hiện tại — gọi từ POST /api/authoring/books và
--    PATCH /api/authoring/books/[bookId].
-- 5. Không có RPC/trigger riêng — INSERT ... ON CONFLICT (user_id,
--    agreement_id) DO UPDATE thực hiện thẳng qua RLS ở route, không cần
--    security-definer function (khác quest system, bảng này không có cột
--    nhạy cảm dạng số dư/điểm cần khoá qua GRANT cột).
