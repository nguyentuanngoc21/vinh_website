-- Migration: author contract fields — 3 cột còn thiếu để tự động điền
-- "BÊN A" (tác giả) trong "Hợp đồng khai thác tác phẩm độc quyền"
-- (docs/Hợp đồng khai thác tác phẩm độc quyền - UTD 29082026.docx, xem
-- src/lib/legal/registry.ts id 'chinh-sach-doc-quyen') mà không cần tác
-- giả gõ tay lại: Ngày sinh, Địa chỉ (profiles — chưa có cột nào trước
-- đây), Ngày cấp CCCD (identity_verifications — đã có cccd_number nhưng
-- chưa có ngày cấp).
--
-- Họ và tên (real_name), Điện thoại (phone), CCCD số (cccd_number), Bút
-- danh (nickname), Email (auth.users.email) đã có sẵn từ trước — KHÔNG
-- lặp lại ở đây.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS cccd_issued_at date;

COMMIT;

-- Notes:
-- 1. Idempotent: CÓ (ADD COLUMN IF NOT EXISTS) — an toàn chạy lại nhiều lần.
-- 2. Cập nhật cùng lúc:
--    - docs/supabase/schema.sql — thêm 3 cột này thẳng vào 2 câu
--      `create table` gốc (profiles, identity_verifications), theo đúng
--      cách các cột thêm sau đã làm (vd cover_image_url) — KHÔNG append
--      ALTER TABLE riêng ở cuối file.
--    - src/lib/supabase/types.ts — Tables.profiles và
--      Tables.identity_verifications (Row/Insert/Update).
-- 3. Route thật:
--    - POST /api/profile/me (src/app/api/profile/me/route.ts) — nhận
--      thêm realName/phone/dateOfBirth/address, không cooldown (khác
--      nickname) vì đây là dữ kiện thật, không phải danh xưng công khai.
--    - GET/POST /api/profile/identity — nhận thêm cccdIssuedAt cùng lúc
--      với cccd_number (chỉ gắn được ngày cấp lúc XÁC MINH CCCD, không
--      sửa rời sau đó).
--    - GET /api/profile/contract-info (route MỚI) — gộp toàn bộ field
--      "BÊN A" (profiles + identity_verifications + auth.users.email)
--      thành 1 response duy nhất cho modal hợp đồng độc quyền đọc, trả
--      SỐ CCCD ĐẦY ĐỦ (không mask) vì đây là chủ tài khoản tự xem lại
--      thông tin của chính mình để điền hợp đồng, khác hẳn
--      /api/profile/identity (mask cho các luồng hiển thị chung khác).
-- 4. Không có cột nhạy cảm mới nào cần khoá riêng qua GRANT cột — 2 cột
--    profiles mới cùng nhóm với real_name/phone (chỉ chủ hồ sơ và admin
--    đọc được qua policy "profiles are readable by their owner and
--    admins" đã có sẵn, không cần policy mới); cccd_issued_at đi kèm
--    cùng RLS với cccd_number đã có.
