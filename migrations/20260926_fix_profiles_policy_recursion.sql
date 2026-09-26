-- Migration: sửa đệ quy vô hạn trong policy SELECT của public.profiles.
--
-- Lỗi: policy "profiles are readable by their owner and admins" kiểm quyền
-- admin bằng một subquery trên CHÍNH public.profiles. Với mọi role chịu RLS
-- (anon, authenticated), Postgres áp lại policy đó cho subquery → lỗi
--   42P17 infinite recursion detected in policy for relation "profiles"
-- ngay khi truy vấn đụng tới profiles — kể cả gián tiếp qua policy của bảng
-- khác có `exists (select 1 from public.profiles p where p.id = auth.uid() ...)`
-- (vd "admins view book moderation actions"). Phát hiện khi chạy
-- docs/supabase/tests/20260926_contest_engine_core.test.sql (26/09/2026).
-- Route đọc profiles bằng service-role không bị ảnh hưởng (bỏ qua RLS); các
-- route đọc bằng phiên người dùng (vd api/profile/*) đang dính lỗi này — xem
-- ghi chú "Bug thật đã xảy ra" ở src/app/api/auth/login/route.ts.
--
-- Sửa: kiểm quyền admin qua hàm SECURITY DEFINER (chạy quyền owner, bỏ qua
-- RLS → không đệ quy). Chỉ đổi đúng policy gốc này. Các policy khác đang
-- hỏi profiles giữ nguyên: subquery của chúng chỉ cần thấy hàng của chính
-- người gọi (auth.uid() = id), nên hết lỗi ngay khi policy gốc hết đệ quy.
--
-- Không nhận tham số user id: hàm chỉ trả lời "người đang gọi có phải admin
-- không", nên không dùng được để dò role của người khác.
-- EXECUTE cấp cả cho anon vì policy được đánh giá dưới role của người gọi
-- (anon → auth.uid() null → false).
--
-- Idempotent: create or replace function + drop policy if exists.
-- Test: docs/supabase/tests/20260926_profiles_policy_recursion.test.sql.

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

revoke execute on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated, service_role;

drop policy if exists "profiles are readable by their owner and admins" on public.profiles;
create policy "profiles are readable by their owner and admins"
  on public.profiles for select
  using (auth.uid() = id or public.current_user_is_admin());

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm current_user_is_admin() ngay sau
--     `alter table public.profiles enable row level security;` và thay
--     using(...) của policy "profiles are readable by their owner and admins".
--   - src/lib/supabase/types.ts: Functions.current_user_is_admin.
--   - Không đổi code route. Hệ quả mong muốn: các route đọc profiles bằng
--     phiên người dùng (api/profile/*, messages, share…) hết lỗi 42P17 và
--     đọc được đúng hàng của chính mình (admin: mọi hàng) như thiết kế ban đầu.
-- ---------------------------------------------------------------------
