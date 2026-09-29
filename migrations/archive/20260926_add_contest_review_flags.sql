-- Migration: Contest Engine — cờ "Cần bổ sung" (Q2) cho bài dự thi (Slice 1.3).
-- Phụ thuộc migrations/20260926_add_contest_engine_core.sql.
--
-- contest_submissions.review_flags là mảng jsonb (cấu trúc ở XIX.6 của
-- docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md). Hai RPC dưới đây là đường ghi duy
-- nhất có kiểm quyền: khoá dòng bài dự thi (2 admin thao tác cùng lúc không
-- ghi đè mảng của nhau), kiểm quyền admin trong DB (service-role bỏ qua RLS).
-- Cờ KHÔNG đổi status bài (D4) — nhãn "Cần bổ sung" được suy ra: còn cờ
-- visible_to_author chưa resolved_at. p_admin_id null = hệ thống (kiểm lại
-- lúc đóng cổng, Slice 1.6).
--
-- Idempotent: create or replace function.
-- Test: docs/supabase/tests/20260926_contest_review_flags.test.sql.

create or replace function public.add_contest_review_flag(
  p_submission_id uuid,
  p_admin_id uuid,
  p_code text,
  p_message text,
  p_fix_by timestamptz,
  p_visible_to_author boolean default true
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
begin
  if p_admin_id is not null and not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if coalesce(p_code, '') !~ '^[a-z0-9_]+$' then
    raise exception 'Flag code must be snake_case' using hint = 'invalid_flag';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'A message is required' using hint = 'reason_required';
  end if;

  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;
  if v_sub.status not in ('submitted', 'eligible', 'shortlisted') then
    raise exception 'Only active entries can be flagged' using hint = 'not_allowed';
  end if;
  -- Không gắn trùng một mã đang mở (hệ thống kiểm lại nhiều lần vẫn chỉ 1 cờ).
  if exists (
    select 1 from jsonb_array_elements(v_sub.review_flags) f
    where f ->> 'code' = p_code and f -> 'resolved_at' = 'null'::jsonb
  ) then
    raise exception 'An open flag with this code already exists' using hint = 'flag_exists';
  end if;

  update public.contest_submissions
     set review_flags = review_flags || jsonb_build_array(jsonb_build_object(
           'id', gen_random_uuid(),
           'code', p_code,
           'source', case when p_admin_id is null then 'system' else 'admin' end,
           'message', btrim(p_message),
           'visible_to_author', coalesce(p_visible_to_author, true),
           'fix_by', p_fix_by,
           'created_at', now(),
           'created_by', p_admin_id,
           'resolved_at', null,
           'resolved_by', null,
           'resolution', null))
   where id = p_submission_id
  returning * into v_sub;
  return v_sub;
end;
$$;

revoke execute on function public.add_contest_review_flag(uuid, uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.add_contest_review_flag(uuid, uuid, text, text, timestamptz, boolean) to service_role;

-- fixed = tác giả đã sửa; dismissed = cờ không còn đúng; escalated = chuyển
-- sang xử lý loại bài (admin đổi status riêng bằng set_contest_submission_status).
create or replace function public.resolve_contest_review_flag(
  p_submission_id uuid,
  p_flag_id uuid,
  p_admin_id uuid,
  p_resolution text
) returns public.contest_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.contest_submissions;
  v_found boolean;
begin
  if p_admin_id is not null and not exists (
    select 1 from public.profiles where id = p_admin_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Actor is not an admin' using hint = 'not_admin';
  end if;
  if p_resolution is null or p_resolution not in ('fixed', 'dismissed', 'escalated') then
    raise exception 'Unknown resolution %', p_resolution using hint = 'invalid_flag';
  end if;

  select * into v_sub from public.contest_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission % not found', p_submission_id using hint = 'submission_not_found';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_sub.review_flags) f
    where f ->> 'id' = p_flag_id::text and f -> 'resolved_at' = 'null'::jsonb
  ) into v_found;
  if not v_found then
    raise exception 'Open flag % not found', p_flag_id using hint = 'flag_not_found';
  end if;

  update public.contest_submissions
     set review_flags = (
       select coalesce(jsonb_agg(
         case when f ->> 'id' = p_flag_id::text
              then f || jsonb_build_object('resolved_at', now(), 'resolved_by', p_admin_id, 'resolution', p_resolution)
              else f end
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(v_sub.review_flags) with ordinality as t(f, ord)
     )
   where id = p_submission_id
  returning * into v_sub;
  return v_sub;
end;
$$;

revoke execute on function public.resolve_contest_review_flag(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_contest_review_flag(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Notes — cập nhật cùng thay đổi này:
--   - docs/supabase/schema.sql: thêm nguyên khối này ở CUỐI file.
--   - src/lib/supabase/types.ts: Functions add_contest_review_flag,
--     resolve_contest_review_flag.
--   - src/lib/contests/errors.ts: mã invalid_flag, flag_exists, flag_not_found.
--   - Dùng bởi src/lib/contests/admin-service.ts
--     (POST/PATCH /api/admin/contests/[contestId]/submissions/[submissionId]/flags).
-- ---------------------------------------------------------------------
