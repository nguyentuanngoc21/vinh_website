-- Migration: xoá 2 overload "chết" của apply_transaction — phát hiện lúc
-- soát lỗ hổng RPC (migrations/20260827_restrict_sensitive_rpc_execute_grants.sql):
-- mỗi lần 1 migration mở rộng apply_transaction bằng CREATE OR REPLACE
-- thêm tham số cuối, Postgres KHÔNG ghi đè được (đổi danh sách kiểu tham
-- số = hàm khác về mặt định danh), nên tạo thêm 1 overload MỚI, giữ
-- nguyên bản CŨ — trên staging hiện có ĐÚNG 3 bản cùng tồn tại:
--
--   1. apply_transaction(uuid, transaction_type, integer, text, uuid)
--      — bản gốc, 5 tham số, không có penalty_percent/status/...
--   2. apply_transaction(uuid, transaction_type, integer, text, uuid, numeric)
--      — thêm p_penalty_percent (từ 20260806_add_penalty_percent.sql)
--   3. apply_transaction(uuid, transaction_type, integer, text, uuid,
--      numeric, transaction_status, timestamptz, uuid)
--      — bản đầy đủ (từ 20260807_wallet_ledger_extension.sql), 9 tham số.
--
-- Migration này XOÁ (1) và (2), CHỈ GIỮ (3). An toàn vì (3) có đúng 5
-- tham số đầu CÙNG THỨ TỰ, CÙNG KIỂU với (1), và đúng 6 tham số đầu cùng
-- thứ tự/kiểu với (2) — mọi tham số (3) thêm vào đều có DEFAULT. Đối
-- chiếu toàn bộ chỗ gọi thực tế trong code (ledger-service.ts,
-- penalty/route.ts, claim_daily_task, grant_platform_bonus,
-- create_purchase nhánh debit — đều gọi với 5 hoặc 6 tham số, hiện đang
-- trúng (1)/(2) theo quy tắc "Postgres chọn overload cần default ít
-- nhất") — sau khi xoá (1)/(2), các chỗ gọi này tự động chuyển sang (3),
-- dùng default cho phần tham số còn thiếu, hành vi tương đương.
--
-- KHÔNG chạy migration này nếu chưa test kỹ trên staging trước — đây là
-- hàm ghi số dư DUY NHẤT của toàn hệ thống. Sau khi chạy trên staging,
-- test thủ công tối thiểu: đăng ký user mới (signup_bonus), bị phạt chụp
-- màn hình (screenshot_penalty), nhận thưởng nhiệm vụ hàng ngày
-- (claim_daily_task), admin cấp bonus (grant_platform_bonus), mua 1
-- chương (create_purchase) — đúng các đường đang gọi (1)/(2)/(3).
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

drop function if exists public.apply_transaction(uuid, public.transaction_type, integer, text, uuid);
drop function if exists public.apply_transaction(uuid, public.transaction_type, integer, text, uuid, numeric);

COMMIT;

-- Verify sau khi chạy — phải ra ĐÚNG 1 dòng (9 tham số):
--   select p.oid::regprocedure, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'apply_transaction';
--
-- Notes:
-- 1. Không cần chạy lại migrations/20260827_restrict_sensitive_rpc_execute_grants.sql
--    sau file này — REVOKE/GRANT đã áp cho overload (3) từ lúc chạy file
--    đó (DO block dò theo proname, tự khoá mọi overload tìm được, kể cả
--    (3) vẫn còn sau khi xoá (1)/(2)).
-- 2. Nếu DROP báo lỗi vì có object khác phụ thuộc (không nên xảy ra —
--    apply_transaction không có gì phụ thuộc kiểu view/trigger vào đúng
--    1 overload cụ thể) — dừng lại, không CASCADE, báo lại để xem trước.
-- 3. drop function không lỗi nếu overload đó không tồn tại trên project
--    của bạn (production, theo audit trước, chỉ có thể còn 1-2 bản khác
--    staging) — IF NOT EXISTS-style qua `if exists`, an toàn chạy trên
--    môi trường khác dù trạng thái khác staging.
-- 4. Cập nhật docs/supabase/schema.sql — không cần đổi gì (schema.sql chỉ
--    định nghĩa apply_transaction 1 lần, đúng bản 9 tham số — tài liệu
--    "fresh install" không có khái niệm overload thừa để dọn).
