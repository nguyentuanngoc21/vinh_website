-- Dọn tài khoản đăng ký rồi nhưng KHÔNG BAO GIỜ xác nhận email (bỏ ngang,
-- mã/link OTP hết hạn) — xem src/app/api/auth/cron/purge-unconfirmed-registrations
-- (chạy hàng ngày qua vercel.json, giống settle-pending/auto-confirm).
--
-- Không có cron này, các profile/CCCD của những tài khoản bỏ ngang đó khoá
-- vĩnh viễn username/CCCD tương ứng (xem precheck trong
-- src/app/api/auth/register/route.ts) — kể cả chính người đó cũng không
-- đăng ký lại được username cũ bằng email khác. Idempotent: an toàn chạy
-- lại nhiều lần.

-- auth.users không được PostgREST expose qua schema "public" nên cần
-- SECURITY DEFINER đọc thẳng auth.users, chỉ trả về id (không lộ email/
-- thông tin khác) của các tài khoản email_confirmed_at IS NULL quá cũ.
-- limit mặc định 500/lần chạy — cùng kiểu giới hạn batch với
-- settle_due_pending_transactions (docs/supabase/schema.sql).
create or replace function public.find_stale_unconfirmed_user_ids(
  p_cutoff timestamptz,
  p_limit integer default 500
)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users
  where email_confirmed_at is null
    and created_at < p_cutoff
  order by created_at
  limit p_limit;
$$;

revoke all on function public.find_stale_unconfirmed_user_ids(timestamptz, integer) from public;
-- Chỉ gọi từ cron route (service-role client) — không cần grant cho
-- anon/authenticated.
grant execute on function public.find_stale_unconfirmed_user_ids(timestamptz, integer) to service_role;
