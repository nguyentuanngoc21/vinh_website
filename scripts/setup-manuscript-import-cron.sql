-- Run after queue migration and deployment. Reuses the publication cron Vault values.
-- publication_site_url = production HTTPS origin
-- publication_cron_secret = the same CRON_SECRET configured on Vercel
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function public.invoke_manuscript_import_worker()
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare site text; secret text;
begin
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
revoke all on function public.invoke_manuscript_import_worker() from public,anon,authenticated;
grant execute on function public.invoke_manuscript_import_worker() to service_role;
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='publication_site_url' and decrypted_secret ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$')
    or not exists(select 1 from vault.decrypted_secrets where name='publication_cron_secret' and length(decrypted_secret)>=16) then
    raise exception 'Configure the two Vault values before registering cron';
  end if;
end $$;
select cron.schedule('vinh-manuscript-imports','* * * * *','select public.invoke_manuscript_import_worker();');
commit;
-- One HTTP worker invocation per minute only while jobs/cleanup need work.
-- Cron success means HTTP queued; check net._http_response or Vercel logs for outcome.
