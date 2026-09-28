-- Nhật ký đổi quyền (role) của tài khoản + đổi quyền nguyên tử.
--
--   - role_change_logs: mỗi lần role thật sự đổi → 1 dòng (ai đổi, đổi cho
--     ai, từ gì sang gì, lúc nào). Chỉ service-role đọc/ghi.
--   - admin_set_user_role(): kiểm người đổi là super_admin (đọc role mới
--     nhất từ profiles, không tin cookie), chặn super_admin tự hạ quyền
--     mình, khoá dòng profiles của người bị đổi, cập nhật role và ghi nhật
--     ký TRONG CÙNG 1 transaction — không thể có đổi role mà thiếu nhật ký.
--     Role không đổi thì không ghi. Gọi từ PATCH /api/admin/users/:userId.
--   - auth.uid() là null khi gọi bằng service-role nên trigger
--     enforce_role_change_authority cho qua; kiểm quyền nằm trong hàm này.
--
-- Idempotent: if not exists, create or replace.
-- Test: docs/supabase/tests/20260928_role_change_logs.test.sql.

create table if not exists public.role_change_logs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  old_role public.user_role not null,
  new_role public.user_role not null,
  created_at timestamptz not null default now()
);

create index if not exists role_change_logs_target_idx
  on public.role_change_logs (target_id, created_at desc);

alter table public.role_change_logs enable row level security;
revoke all on public.role_change_logs from anon, authenticated;

-- Trả role sau khi đổi. Lỗi mang hint: actor_not_super_admin,
-- self_demotion, target_not_found.
create or replace function public.admin_set_user_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_role public.user_role
)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.user_role;
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'super_admin'
  ) then
    raise exception 'Only a super_admin can change a role' using hint = 'actor_not_super_admin';
  end if;

  if p_actor_id = p_target_id and p_role <> 'super_admin' then
    raise exception 'A super_admin cannot demote themselves' using hint = 'self_demotion';
  end if;

  select role into v_old from public.profiles where id = p_target_id for update;
  if v_old is null then
    raise exception 'Profile % not found', p_target_id using hint = 'target_not_found';
  end if;

  if v_old = p_role then
    return v_old;
  end if;

  update public.profiles set role = p_role where id = p_target_id;
  insert into public.role_change_logs (target_id, actor_id, old_role, new_role)
  values (p_target_id, p_actor_id, v_old, p_role);

  return p_role;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, uuid, public.user_role) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, uuid, public.user_role) to service_role;
