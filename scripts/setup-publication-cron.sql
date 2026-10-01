-- Run in the Production project's Supabase SQL Editor AFTER deploying the code.
-- First create these two values in Supabase Vault (Dashboard, not in Git):
-- publication_site_url: exact https:// Production origin, without a path
-- publication_cron_secret: same value as Vercel Production CRON_SECRET
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_publication_worker()
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_secret text; v_request bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'publication_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'publication_cron_secret';
  if v_url is null or v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$' then
    raise exception 'Set publication_site_url to the Production HTTPS origin in Vault.';
  end if;
  if v_secret is null or length(v_secret) < 16 then
    raise exception 'Set publication_cron_secret in Vault to match Vercel CRON_SECRET.';
  end if;
  -- No HTTP request when there are no due schedules. The job still runs every minute.
  if not exists(select 1 from public.chapter_publication_schedules
    where status = 'pending' and starts_at + (next_index * interval_days) * interval '24 hours' <= now()) then
    return null;
  end if;
  select net.http_get(
    url := rtrim(v_url, '/') || '/api/authoring/cron/publish-scheduled',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  ) into v_request;
  return v_request;
end $$;
revoke all on function public.invoke_publication_worker() from public, anon, authenticated;
grant execute on function public.invoke_publication_worker() to service_role;

-- Fail before registering an active job if either Vault value is missing.
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='publication_site_url' and decrypted_secret ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$')
    or not exists(select 1 from vault.decrypted_secrets where name='publication_cron_secret' and length(decrypted_secret)>=16) then
    raise exception 'Create both publication_site_url and publication_cron_secret in Vault first.';
  end if;
end $$;

-- The stable job name makes rerunning setup update the existing job.
select cron.schedule('vinh-publish-scheduled', '* * * * *', 'select public.invoke_publication_worker();');
commit;

select jobid, jobname, schedule, active from cron.job where jobname='vinh-publish-scheduled';

-- Inspect execution without exposing secrets:
-- select status, return_message, start_time, end_time
-- from cron.job_run_details where jobid = (select jobid from cron.job where jobname='vinh-publish-scheduled')
-- order by start_time desc limit 10;
-- A successful pg_cron run means the HTTP request was queued, not necessarily HTTP 200.
-- select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
-- Pause: select cron.unschedule('vinh-publish-scheduled');
