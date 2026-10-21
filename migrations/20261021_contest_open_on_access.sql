-- Open due contests atomically on access; cron remains a fallback.
BEGIN;
create or replace function public.open_due_contest(p_contest_id uuid)
returns setof public.contests
language plpgsql security definer set search_path = public
as $$
declare
  v_contest public.contests;
begin
  select * into v_contest from public.contests where id = p_contest_id for update;
  if not found then
    raise exception 'Contest not found' using hint = 'contest_not_found';
  end if;
  if v_contest.status = 'announced'
     and now() >= v_contest.submission_start and now() < v_contest.submission_end then
    v_contest := public.transition_contest_status(p_contest_id, 'submission_open', null, 'Automatic: scheduled opening on access');
    return next v_contest;
  end if;
  return;
end;
$$;
revoke execute on function public.open_due_contest(uuid) from public, anon, authenticated;
grant execute on function public.open_due_contest(uuid) to service_role;
COMMIT;
