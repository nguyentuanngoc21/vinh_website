-- Hỗ trợ kiểm tra real-time lúc đăng ký (username/email đã dùng chưa, CCCD
-- có bị dùng lại không) — xem src/app/api/auth/check-availability/route.ts
-- và phần precheck CCCD trong src/app/api/auth/register/route.ts.
-- Idempotent: an toàn chạy lại nhiều lần.

-- 1) Chặn 1 CCCD dùng cho nhiều tài khoản. Partial index (bỏ qua status =
-- 'rejected') để 1 lượt xác minh bị admin từ chối không khoá vĩnh viễn số
-- CCCD đó — người đó (hoặc người khác) vẫn nộp lại được sau này.
create unique index if not exists identity_verifications_cccd_number_active_idx
  on public.identity_verifications (cccd_number)
  where status <> 'rejected';

-- 2) Email đã có tài khoản (đã xác nhận) hay chưa — form đăng ký cần biết
-- điều này TRƯỚC khi bấm "Tạo tài khoản" để không phải gọi
-- supabase.auth.signUp() (tốn 1 email + có thể tạo obfuscated user) chỉ để
-- biết email đã tồn tại. auth.users không được PostgREST expose qua schema
-- "public" nên cần 1 hàm SECURITY DEFINER đọc thẳng auth.users rồi chỉ trả
-- về đúng 1 boolean — không lộ thêm thông tin nào khác (id, thời gian tạo…)
-- của tài khoản đó.
create or replace function public.is_email_registered(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(p_email)
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.is_email_registered(text) from public;
-- Chỉ gọi từ server (service-role client trong check-availability/route.ts
-- và register/route.ts) — không cần grant cho anon/authenticated.
grant execute on function public.is_email_registered(text) to service_role;
