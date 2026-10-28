-- DEV ONLY, after the migration. All queue changes and cron fixtures roll back.
begin;
create extension if not exists pg_cron;
do $$
declare publication_job bigint; manuscript_job bigint; unrelated_job bigint;
  actor uuid := gen_random_uuid(); book uuid := gen_random_uuid(); chapter uuid := gen_random_uuid();
  schedule_id uuid := gen_random_uuid(); import_id uuid := gen_random_uuid();
begin
  publication_job := cron.schedule('vinh-publish-scheduled','* * * * *','select public.invoke_publication_worker();');
  manuscript_job := cron.schedule('vinh-manuscript-imports','* * * * *','select public.invoke_manuscript_import_worker();');
  unrelated_job := cron.schedule('idle-cron-unrelated-fixture','* * * * *','select 1;');
  delete from public.chapter_publication_schedules;
  delete from public.manuscript_import_jobs;
  assert public.invoke_publication_worker() is null, 'Idle publication tick must not make HTTP';
  assert public.invoke_manuscript_import_worker() is null, 'Idle import tick must not make HTTP';
  assert not (select active from cron.job where jobid=publication_job), 'Empty publication job must sleep';
  assert not (select active from cron.job where jobid=manuscript_job), 'Empty import job must sleep';
  assert (select active from cron.job where jobid=unrelated_job), 'Unrelated cron must stay unchanged';

  insert into auth.users(id) values(actor);
  insert into public.profiles(id,username,nickname) values(actor,'cron_'||replace(actor::text,'-',''),'Cron fixture');
  insert into public.books(id,author_id,title,slug) values(book,actor,'Cron fixture','cron-'||book);
  insert into public.chapters(id,book_id,title,content,order_index) values(chapter,book,'Fixture','text',1);
  insert into public.chapter_publication_schedules(id,book_id,author_id,chapter_ids,starts_at)
    values(schedule_id,book,actor,array[chapter],now()+interval '1 day');
  assert (select active from cron.job where jobid=publication_job), 'Future schedule must wake minute cron';
  update public.chapter_publication_schedules set status='completed' where id=schedule_id;
  perform public.invoke_publication_worker();
  assert not (select active from cron.job where jobid=publication_job), 'Last completed schedule must sleep';
  update public.chapter_publication_schedules set status='pending' where id=schedule_id;
  assert (select active from cron.job where jobid=publication_job), 'Reactivated schedule must wake cron';
  delete from public.chapter_publication_schedules where id=schedule_id;
  perform public.invoke_publication_worker();
  assert not (select active from cron.job where jobid=publication_job), 'Deleting last schedule must sleep';

  -- The actual application calls the reserve RPC as service_role.
  set local role service_role;
  perform public.reserve_manuscript_import(import_id,actor);
  reset role;
  assert (select active from cron.job where jobid=manuscript_job), 'Uploading job must wake cron';
  update public.manuscript_import_jobs set status='succeeded' where id=import_id;
  assert (select active from cron.job where jobid=manuscript_job), 'Finished result must retain expiry cleanup';
  delete from public.manuscript_import_jobs where id=import_id;
  perform public.invoke_manuscript_import_worker();
  assert not (select active from cron.job where jobid=manuscript_job), 'Last cleanup must sleep';
  assert not has_function_privilege('authenticated','public.sync_background_cron_activity(text)','EXECUTE'), 'Members must not control cron';
  assert not has_function_privilege('anon','public.wake_background_cron_trigger()','EXECUTE'), 'Trigger helper must not be exposed';
end $$;
rollback;
