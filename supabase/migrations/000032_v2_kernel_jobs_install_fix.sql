-- 000032 (module: kernel): lv.jobs_install() never saw pg_cron.
-- 000031 tested for the scheduler with to_regproc('cron.schedule(text,text,text)'). to_regproc takes a bare function
-- name, so with an argument list it always answers NULL and the install reported pg_cron as missing even when it was
-- enabled (found on production, 2026-11-11: the jobs ran when ticked by hand but were never put on a timer). The check
-- is now the same one lv.api_admin_jobs uses: the cron.job table. Nothing else changes. The test database has no
-- pg_cron, which is why 31_kernel_jobs did not catch it; 32 adds a stand-in scheduler so the scheduling path runs.
begin;

create or replace function lv.jobs_install() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  j record;
  v_missing text[] := '{}';
  v_done text[] := '{}';
begin
  if to_regclass('cron.job') is null then v_missing := array_append(v_missing, 'pg_cron'); end if;
  if to_regproc('net.http_post') is null then v_missing := array_append(v_missing, 'pg_net'); end if;
  if to_regclass('vault.decrypted_secrets') is null then v_missing := array_append(v_missing, 'vault'); end if;
  if coalesce(lv.policy_json('jobs.functions_base_url') #>> '{}', '') !~ '^https://[a-z0-9.-]+$' then
    v_missing := array_append(v_missing, 'policy jobs.functions_base_url');
  end if;
  if not ('pg_cron' = any (v_missing)) then
    for j in select name, schedule, enabled from lv.jobs order by name loop
      if j.enabled then
        execute 'select cron.schedule($1, $2, $3)' using 'lv-' || j.name, j.schedule, format('select lv.job_tick(%L)', j.name);
        v_done := array_append(v_done, j.name);
      else
        begin execute 'select cron.unschedule($1)' using 'lv-' || j.name; exception when others then null; end;
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'scheduled', to_jsonb(v_done), 'missing', to_jsonb(v_missing));
end;
$$;

commit;
