-- Migration: chặn UPDATE trực tiếp trên `profiles` từ client (anon/
-- authenticated) — cùng lỗ hổng đã vá cho `books`
-- (migrations/20260825_restrict_books_column_grants.sql), phát hiện lúc
-- soát schema cho Quest System.
--
-- Policy "users can update their own profile (not their own role)"
-- (schema.sql phần 1, using auth.uid() = id) chỉ kiểm được AI được sửa
-- hàng, KHÔNG kiểm được CỘT NÀO — RLS của Postgres vốn không làm được
-- việc đó ở cấp cột. role và cccd_verified đã có trigger riêng chặn
-- (enforce_role_change_authority, enforce_cccd_verified_authority — phần
-- 5), current_quest_streak/streak_updated_at cũng vậy (xem
-- migrations/20260827_add_quest_streak_to_profiles.sql) — nhưng
-- token_balance, token_balance_pending, screenshot_penalty_*, bank_*,
-- real_name, phone... thì KHÔNG, vì chưa từng có GRANT hạn chế cột nào
-- trên bảng này. Bất kỳ user đã đăng nhập nào cũng gọi thẳng REST API của
-- Supabase (anon key vốn công khai trong bundle JS + JWT session của
-- chính họ) để PATCH profiles set token_balance = 999999 where id = auth.uid()
-- — vượt qua hoàn toàn mọi route Next.js.
--
-- Khác `books` (vẫn còn vài cột client sửa được qua route thật —
-- title/genre/tags/published): đối chiếu toàn bộ code hiện tại
-- (`grep "from(\"profiles\")"`) — MỌI write vào `profiles` đều đi qua
-- server route dùng createServiceRoleClient() (bypass RLS/GRANT hoàn
-- toàn), không có route/component nào dùng client anon-key để
-- .update()/.upsert() bảng này. Vì vậy không có cột nào cần re-grant lại
-- cho `authenticated` — REVOKE dứt điểm, không GRANT lại cột nào.
--
-- Run in the Supabase SQL editor (or via psql). Test in staging first.

BEGIN;

REVOKE UPDATE ON public.profiles FROM authenticated, anon;

COMMIT;

-- Notes:
-- 1. Idempotent — REVOKE không lỗi nếu privilege chưa từng được cấp. An
--    toàn chạy lại nhiều lần.
-- 2. Nếu SAU NÀY có route thật cần client (anon key) tự UPDATE 1 cột nào
--    đó của profiles trực tiếp (không qua service-role route) — PHẢI
--    thêm GRANT UPDATE (cột đó) ON public.profiles TO authenticated
--    trong 1 migration mới, không re-run migration này với cột thêm vào,
--    để giữ lịch sử rõ ràng như books.
-- 3. Không đổi RLS/trigger nào — policy "users can update their own
--    profile" và các trigger role/cccd_verified/quest_streak vẫn giữ
--    nguyên, làm lớp chặn bổ sung (defense-in-depth) nếu sau này có cột
--    được re-grant.
-- 4. Không cần đổi src/lib/supabase/types.ts — không có cột mới, chỉ đổi
--    quyền; các route hiện tại (đều dùng service-role client, không bị
--    ảnh hưởng bởi GRANT/REVOKE cấp bảng) tiếp tục hoạt động như cũ.
-- 5. Cập nhật docs/supabase/schema.sql — thêm đoạn REVOKE này ngay sau
--    policy "users can update their own profile" (phần 1).
