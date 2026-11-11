-- 32: lv.jobs_install() with a scheduler present (000032). A stand-in for pg_cron is created inside this transaction.
select set_config('t.file', '32_kernel_jobs_install', false);
begin;
select t.as_pg();
select t.check('install: with no scheduler it says pg_cron is missing', (lv.jobs_install() -> 'missing') @> '["pg_cron"]'::jsonb);

create schema cron;
create table cron.job (jobname text primary key, schedule text, command text, active boolean default true);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
$$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
   on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; select 1::bigint $$;
create function cron.unschedule(job_name text) returns boolean language sql as
$$ delete from cron.job where jobname = job_name; select true $$;

select t.put('i', lv.jobs_install()::text);
select t.check('install: with a scheduler present, pg_cron is no longer reported missing',
  not ((t.get('i')::jsonb -> 'missing') @> '["pg_cron"]'::jsonb));
select t.check('install: all five jobs are scheduled under lv- names',
  jsonb_array_length(t.get('i')::jsonb -> 'scheduled') = 5
  and t.q($$select string_agg(jobname, ',' order by jobname) from cron.job$$)
      = 'lv-counter-trim,lv-discord-dispatch,lv-email-dispatch,lv-retention,lv-webhook-dispatch');
select t.check('install: each job only ever calls lv.job_tick with its own name',
  t.q($$select count(*)::text from cron.job where command <> format('select lv.job_tick(%L)', substr(jobname, 4))$$) = '0'
  and t.q($$select schedule from cron.job where jobname = 'lv-retention'$$) = '17 3 * * *');
select t.check('install: running it again changes nothing', jsonb_array_length(lv.jobs_install() -> 'scheduled') = 5
  and t.q($$select count(*)::text from cron.job$$) = '5');
update lv.jobs set enabled = false where name = 'discord-dispatch';
select t.check('install: a disabled job is taken off the timer', jsonb_array_length(lv.jobs_install() -> 'scheduled') = 4
  and t.q($$select count(*)::text from cron.job where jobname = 'lv-discord-dispatch'$$) = '0');
select t.check('install: the command a timer runs works', (lv.job_tick('counter-trim') ->> 'ok') = 'true');

rollback;
