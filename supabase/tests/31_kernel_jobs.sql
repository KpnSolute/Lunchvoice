-- 31: scheduled jobs (000031). The test database has no pg_cron, pg_net or Vault, so the "not installed" paths are
-- real; the request path is exercised with stand-ins created inside this transaction.
select set_config('t.file', '31_kernel_jobs', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Staff'); select lv_api.lv_my_context();
select t.put('staff', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Member'); select lv_api.lv_my_context();
select t.as_pg();
insert into lv.platform_admins (account_id) values (t.id('staff'));

select t.check('jobs: five jobs are registered and enabled',
  t.q($$select string_agg(name || ':' || kind, ',' order by name) from lv.jobs where enabled$$)
  = 'counter-trim:sql,discord-dispatch:http,email-dispatch:http,retention:sql,webhook-dispatch:http');
select t.check('jobs: the registry cannot hold an unknown job', t.q($$select count(*)::text from pg_constraint where conname = 'jobs_name_check'$$) = '1');

-- ===== sql jobs ==========================================================================================
insert into lv.integration_rate_windows (scope, key, window_start, n) values ('guest_caller', repeat('a', 64), now() - interval '1 hour', 3);
select t.check('sql job: counter-trim runs and records success', (lv.job_tick('counter-trim') ->> 'ok') = 'true'
  and t.q($$select count(*)::text from lv.integration_rate_windows where window_start < now() - interval '10 minutes'$$) = '0'
  and t.q($$select (last_ok_at is not null and last_error is null and runs = 1)::text from lv.jobs where name = 'counter-trim'$$) = 'true');
select t.check('sql job: retention runs', (lv.job_tick('retention') ->> 'ok') = 'true');
select t.check('tick: an unknown job is skipped, never an error', (lv.job_tick('drop-everything') ->> 'skipped') is not null);
update lv.jobs set enabled = false where name = 'retention';
select t.check('tick: a disabled job does nothing', (lv.job_tick('retention') ->> 'skipped') = 'disabled'
  and t.q($$select runs::text from lv.jobs where name = 'retention'$$) = '1');

-- ===== http jobs, nothing installed ======================================================================
select t.check('http job: with no base URL it records why and calls nothing', (lv.job_tick('email-dispatch') ->> 'error') = 'jobs.functions_base_url is not set'
  and t.q($$select last_error from lv.jobs where name = 'email-dispatch'$$) = 'jobs.functions_base_url is not set');
update lv.policy set value = '"https://example.invalid"'::jsonb where key = 'jobs.functions_base_url';
select t.check('http job: without pg_net it says so', (lv.job_tick('email-dispatch') ->> 'error') = 'pg_net is not installed');
select t.check('install: reports what is missing and schedules nothing',
  (lv.jobs_install() -> 'missing') @> '["pg_cron", "pg_net", "vault"]'::jsonb and jsonb_array_length(lv.jobs_install() -> 'scheduled') = 0);

-- ===== http jobs, with stand-ins for pg_net and Vault ====================================================
create schema net;
create table net.calls (url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as
$$ insert into net.calls values (url, headers, body); select 1::bigint $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
select t.check('http job: without the secret in Vault it says so', (lv.job_tick('email-dispatch') ->> 'error') = 'the dispatch secret is not in Vault'
  and t.q($$select count(*)::text from net.calls$$) = '0');
insert into vault.decrypted_secrets values ('email_dispatch_secret', 'test-dispatch-secret-not-real');
select t.check('http job: the first tick calls the function with the bearer from Vault',
  (lv.job_tick('email-dispatch') ->> 'ok') = 'true'
  and t.q($$select url || '|' || (headers ->> 'authorization') from net.calls$$) = 'https://example.invalid/functions/v1/email-dispatch|Bearer test-dispatch-secret-not-real');
select t.check('http job: with nothing waiting, the next tick does not call out', (lv.job_tick('email-dispatch') ->> 'skipped') = 'nothing waiting'
  and t.q($$select count(*)::text from net.calls$$) = '1');
select lv.email_enqueue('staff_report', null, 'staff@example.invalid', '{"kind":"survey","reporters":1}'::jsonb, 'job-test');
select t.check('http job: a queued email makes the next tick call out at once', (lv.job_tick('email-dispatch') ->> 'ok') = 'true'
  and t.q($$select count(*)::text from net.calls$$) = '2');
select t.check('http job: the Discord job calls its own path', (lv.job_tick('discord-dispatch') ->> 'ok') = 'true'
  and t.q($$select count(*)::text from net.calls where url = 'https://example.invalid/functions/v1/discord/dispatch'$$) = '1');
select t.check('http job: the secret is stored nowhere in lv',
  t.q($$select count(*)::text from lv.jobs where coalesce(last_error, '') || note like '%test-dispatch-secret%'$$) = '0'
  and t.q($$select count(*)::text from lv.policy where value::text like '%test-dispatch-secret%'$$) = '0');

-- ===== staff view ========================================================================================
select t.as_kpn(1);
select t.put('jv', lv_api.lv_admin_jobs()::text);
select t.check('staff: every job is listed with its state and queue depth',
  jsonb_array_length(t.get('jv')::jsonb -> 'jobs') = 5
  and (select (j ->> 'pending') = '1' and (j ->> 'last_ok_at') is not null from jsonb_array_elements(t.get('jv')::jsonb -> 'jobs') j where j ->> 'name' = 'email-dispatch')
  and (t.get('jv')::jsonb #>> '{scheduler,pg_cron}') = 'false' and (t.get('jv')::jsonb #>> '{scheduler,base_url_set}') = 'true');
select t.check('staff: the view shows no secret, URL or address',
  t.get('jv') not like '%test-dispatch-secret%' and t.get('jv') not like '%example.invalid%' and t.get('jv') not like '%@%');
select t.as_kpn(2);
select t.check('staff: non-staff are refused', t.code(lv_api.lv_admin_jobs()) = 'lv_forbidden');
select t.as_pg();
select t.check('grants: only staff reach the view; nobody but the service role can tick or install',
  has_function_privilege('authenticated', 'lv_api.lv_admin_jobs()', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_admin_jobs()', 'execute')
  and not has_function_privilege('authenticated', 'lv.job_tick(text)', 'execute')
  and not has_function_privilege('authenticated', 'lv.jobs_install()', 'execute')
  and not has_function_privilege('anon', 'lv.job_tick(text)', 'execute'));

rollback;
