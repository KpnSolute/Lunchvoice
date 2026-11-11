-- Rollback for 000031_v2_kernel_jobs: the job registry goes. Unschedule first where pg_cron exists; outboxes keep
-- their rows, so nothing queued is lost.
begin;
do $$
declare j record;
begin
  if to_regclass('cron.job') is not null then
    for j in execute 'select jobname from cron.job where jobname like ''lv-%''' loop
      begin execute 'select cron.unschedule($1)' using j.jobname; exception when others then null; end;
    end loop;
  end if;
end $$;
drop function if exists lv_api.lv_admin_jobs();
drop function if exists lv.api_admin_jobs();
drop function if exists lv.jobs_install();
drop function if exists lv.job_tick(text);
drop function if exists lv.job_pending(text);
delete from lv.policy where key in ('jobs.functions_base_url', 'jobs.vault_secret_name');
drop table if exists lv.jobs;
commit;
