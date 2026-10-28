-- Sleep when empty; new work wakes the existing per-minute jobs transactionally.
begin;
create or replace function public.sync_background_cron_activity(p_worker text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare wanted boolean; task_name text; task_command text; task_id bigint; task_active boolean;
begin
  if p_worker='publication' then
    task_name := 'vinh-publish-scheduled'; task_command := 'select public.invoke_publication_worker();';
  elsif p_worker='manuscript' then
    task_name := 'vinh-manuscript-imports'; task_command := 'select public.invoke_manuscript_import_worker();';
  else raise exception 'Unknown background worker'; end if;
  -- Serialize idle checks with wakes, without locking or updating cron.job directly.
  -- Only the official cron.alter_job API changes scheduler state.
  perform pg_advisory_xact_lock(hashtextextended('vinh-background-cron-activity',0));
  if to_regclass('cron.job') is not null then
    select jobid,active into task_id,task_active from cron.job where jobname=task_name
      and database=current_database() and command=task_command limit 1;
  end if;
  if p_worker='publication' then
    if to_regclass('public.chapter_publication_schedules') is null then return false; end if;
    select exists(select 1 from public.chapter_publication_schedules where status='pending') into wanted;
  else
    -- Finished results must remain eligible for eventual Storage expiry cleanup.
    select exists(select 1 from public.manuscript_import_jobs) into wanted;
  end if;
  if task_id is not null and task_active is distinct from wanted then
    perform cron.alter_job(job_id:=task_id,active:=wanted);
  end if;
  return wanted;
end $$;
revoke all on function public.sync_background_cron_activity(text) from public,anon,authenticated,service_role;

create or replace function public.wake_background_cron_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare task_name text; task_command text; task record;
begin
  if tg_table_schema<>'public' then raise exception 'Unexpected worker table'; end if;
  if tg_table_name='chapter_publication_schedules' then
    if new.status<>'pending' then return new; end if;
    if tg_op='UPDATE' and old.status='pending' then return new; end if;
    task_name := 'vinh-publish-scheduled'; task_command := 'select public.invoke_publication_worker();';
  elsif tg_table_name='manuscript_import_jobs' then
    task_name := 'vinh-manuscript-imports'; task_command := 'select public.invoke_manuscript_import_worker();';
  else raise exception 'Unexpected worker table'; end if;
  if to_regclass('cron.job') is null then return new; end if;
  -- Wait for an in-flight idle check before deciding whether to wake the job.
  -- This trigger never inspects or modifies other queue rows under the lock.
  perform pg_advisory_xact_lock(hashtextextended('vinh-background-cron-activity',0));
  for task in select jobid,active from cron.job where jobname=task_name
    and database=current_database() and command=task_command
  loop
    if not task.active then perform cron.alter_job(job_id:=task.jobid,active:=true); end if;
  end loop;
  return new;
end $$;
revoke all on function public.wake_background_cron_trigger() from public,anon,authenticated,service_role;

drop trigger if exists manuscript_cron_wake on public.manuscript_import_jobs;
create trigger manuscript_cron_wake after insert on public.manuscript_import_jobs
  for each row execute function public.wake_background_cron_trigger();
do $$ begin
  if to_regclass('public.chapter_publication_schedules') is not null then
    drop trigger if exists publication_cron_wake on public.chapter_publication_schedules;
    create trigger publication_cron_wake after insert or update of status on public.chapter_publication_schedules
      for each row execute function public.wake_background_cron_trigger();
  end if;
end $$;
-- Worker definitions and initial state synchronization are appended below.

create or replace function public.invoke_publication_worker()
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_secret text; v_request bigint;
begin
  if to_regprocedure('public.sync_background_cron_activity(text)') is not null then
    if not public.sync_background_cron_activity('publication') then return null; end if;
  end if;
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

create or replace function public.invoke_manuscript_import_worker()
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare site text; secret text;
begin
  if to_regprocedure('public.sync_background_cron_activity(text)') is not null then
    if not public.sync_background_cron_activity('manuscript') then return null; end if;
  end if;
  if not exists(select 1 from public.manuscript_import_jobs
    where status in ('uploading','queued','processing') or expires_at<=now()) then return null; end if;
  select decrypted_secret into site from vault.decrypted_secrets where name='publication_site_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='publication_cron_secret';
  if site is null or site !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$' or secret is null or length(secret)<16 then
    raise exception 'Configure publication_site_url and publication_cron_secret in Vault';
  end if;
  return net.http_get(url:=rtrim(site,'/')||'/api/authoring/cron/process-imports',
    headers:=jsonb_build_object('Authorization','Bearer '||secret), timeout_milliseconds:=60000);
end $$;

revoke all on function public.invoke_publication_worker() from public,anon,authenticated;
revoke all on function public.invoke_manuscript_import_worker() from public,anon,authenticated;
grant execute on function public.invoke_publication_worker() to service_role;
grant execute on function public.invoke_manuscript_import_worker() to service_role;
select public.sync_background_cron_activity('publication');
select public.sync_background_cron_activity('manuscript');
commit;
-- Notes: mirror in baseline/20_background_cron_activity.sql; regenerate docs/supabase/schema.sql.
-- Setup scripts call the same guard; worker functions retain their existing execute grants.
