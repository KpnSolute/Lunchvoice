-- 000031 (module: kernel): scheduled jobs (review B-3, backend architecture §4; founder 2026-11-11).
--
-- The email, webhook and Discord outboxes and the retention sweep each need a caller, and until now nothing called
-- them. This adds a small job registry and ONE entry point, lv.job_tick(name), that pg_cron calls.
--   * http jobs ask an Edge Function to drain its outbox through pg_net, with the dispatch bearer read from Vault
--     at run time (never stored in a job, a table or this file). To avoid waking a function for nothing, a tick only
--     calls out when its outbox has due rows, when its last run failed, or when the job's idle interval has passed (the functions also do
--     housekeeping: reservation reminders, time-closed Campaigns, expired Discord codes).
--   * sql jobs run a fixed database function (retention, counter trimming).
-- What a job does is decided by its NAME in code below, never by text stored in the table, so no row can make the
-- scheduler run arbitrary SQL or call an arbitrary URL.
-- lv.jobs_install() registers the enabled jobs with pg_cron and reports what is missing (pg_cron, pg_net, the
-- functions base URL policy, the Vault secret). It is service-role only and safe to run again. On a database without
-- pg_cron (the canonical test database) everything installs and jobs simply are not scheduled.
-- lv_admin_jobs() shows staff each job's last run, last error, queue depth and oldest waiting item.
begin;

create table lv.jobs (
  name text primary key check (name in ('email-dispatch', 'webhook-dispatch', 'discord-dispatch', 'retention', 'counter-trim')),
  kind text not null check (kind in ('http', 'sql')),
  schedule text not null check (length(schedule) between 9 and 40),
  idle_minutes int not null default 15 check (idle_minutes between 1 and 1440),
  enabled boolean not null default true,
  last_tick_at timestamptz,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 300),
  runs bigint not null default 0,
  note text not null
);
alter table lv.jobs enable row level security;

insert into lv.jobs (name, kind, schedule, idle_minutes, note) values
  ('email-dispatch', 'http', '* * * * *', 15, 'Sends queued email through the email-dispatch function; also queues reservation reminders.'),
  ('webhook-dispatch', 'http', '* * * * *', 5, 'Delivers queued webhooks; also closes Campaigns whose end time has passed and trims delivery logs.'),
  ('discord-dispatch', 'http', '*/2 * * * *', 15, 'Sends queued Discord posts and role changes; also removes expired link codes.'),
  ('retention', 'sql', '17 3 * * *', 1440, 'L-13: trims audit and analytics query logs after 12 months and unlinks guest hashes after 7 days.'),
  ('counter-trim', 'sql', '*/10 * * * *', 10, 'Deletes expired rate-limit windows and join-code misses.');

insert into lv.policy (key, value, note) values
  ('jobs.functions_base_url', null,
   'Base URL of this project''s Edge Functions, e.g. "https://<ref>.supabase.co". NULL: http jobs record an error and call nothing.'),
  ('jobs.vault_secret_name', '"email_dispatch_secret"'::jsonb,
   'Name of the Vault secret holding the dispatch bearer (same value as the EMAIL_DISPATCH_SECRET function secret).');

-- Due rows waiting in a job's outbox, and the age in minutes of the oldest one.
create function lv.job_pending(p_name text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_n bigint := 0;
  v_oldest timestamptz;
begin
  if p_name = 'email-dispatch' then
    select count(*), min(next_attempt_at) into v_n, v_oldest from lv.email_outbox where status = 'queued' and next_attempt_at <= now();
  elsif p_name = 'webhook-dispatch' then
    select count(*), min(next_attempt_at) into v_n, v_oldest from lv.webhook_outbox where status = 'queued' and next_attempt_at <= now();
  elsif p_name = 'discord-dispatch' then
    select count(*), min(next_attempt_at) into v_n, v_oldest from lv.discord_outbox where status = 'queued' and next_attempt_at <= now();
  end if;
  return jsonb_build_object('pending', v_n,
    'oldest_minutes', case when v_oldest is null then null else greatest(0, floor(extract(epoch from (now() - v_oldest)) / 60))::int end);
end;
$$;

-- The one entry point pg_cron calls. Never raises: a failing job records its error and the next tick tries again.
create function lv.job_tick(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  j lv.jobs;
  v_path text;
  v_base text;
  v_secret_name text;
  v_secret text;
  v_err text;
begin
  select * into j from lv.jobs where name = p_name for update skip locked;
  if j.name is null then return jsonb_build_object('ok', false, 'skipped', 'unknown or busy'); end if;
  update lv.jobs set last_tick_at = now() where name = j.name;
  if not j.enabled then return jsonb_build_object('ok', true, 'skipped', 'disabled'); end if;

  if j.kind = 'http' then
    if (lv.job_pending(j.name) ->> 'pending')::bigint = 0
       and j.last_error is null and j.last_ok_at is not null and j.last_ok_at > now() - make_interval(mins => j.idle_minutes) then
      return jsonb_build_object('ok', true, 'skipped', 'nothing waiting');
    end if;
    v_path := case j.name when 'email-dispatch' then 'email-dispatch' when 'webhook-dispatch' then 'webhook-dispatch'
                          when 'discord-dispatch' then 'discord/dispatch' end;
    v_base := rtrim(coalesce(lv.policy_json('jobs.functions_base_url') #>> '{}', ''), '/');
    v_secret_name := lv.policy_json('jobs.vault_secret_name') #>> '{}';
    begin
      if v_base !~ '^https://[a-z0-9.-]+$' then
        v_err := 'jobs.functions_base_url is not set';
      elsif to_regproc('net.http_post') is null then
        v_err := 'pg_net is not installed';
      elsif to_regclass('vault.decrypted_secrets') is null then
        v_err := 'Vault is not available';
      else
        execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using v_secret_name;
        if v_secret is null or length(v_secret) < 16 then
          v_err := 'the dispatch secret is not in Vault';
        else
          execute 'select net.http_post(url := $1, headers := $2, body := $3)'
            using v_base || '/functions/v1/' || v_path,
                  jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
                  '{}'::jsonb;
        end if;
      end if;
    exception when others then
      v_err := left('request failed: ' || sqlerrm, 300);
    end;
  else
    begin
      if j.name = 'retention' then
        perform lv.retention_sweep();
      elsif j.name = 'counter-trim' then
        delete from lv.integration_rate_windows where window_start < now() - interval '10 minutes';
        delete from lv.join_code_misses where at < now() - interval '10 minutes';
      end if;
    exception when others then
      v_err := left(sqlerrm, 300);
    end;
  end if;

  update lv.jobs
     set last_run_at = now(), runs = runs + 1, last_error = v_err,
         last_ok_at = case when v_err is null then now() else last_ok_at end
   where name = j.name;
  return jsonb_build_object('ok', v_err is null, 'error', v_err);
end;
$$;

-- Register the enabled jobs with pg_cron (and remove disabled ones). Service role only. Safe to run again.
create function lv.jobs_install() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  j record;
  v_missing text[] := '{}';
  v_done text[] := '{}';
begin
  if to_regproc('cron.schedule(text,text,text)') is null then v_missing := array_append(v_missing, 'pg_cron'); end if;
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

-- Staff view. Never returns a secret, a URL or an address.
create function lv.api_admin_jobs() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_cron boolean := to_regclass('cron.job') is not null;
  v_scheduled text[] := '{}';
begin
  if v_denied is not null then return v_denied; end if;
  if v_cron then
    execute 'select coalesce(array_agg(jobname), ''{}'') from cron.job where jobname like ''lv-%'' and active' into v_scheduled;
  end if;
  return jsonb_build_object('ok', true,
    'scheduler', jsonb_build_object('pg_cron', v_cron, 'pg_net', to_regproc('net.http_post') is not null,
      'base_url_set', coalesce(lv.policy_json('jobs.functions_base_url') #>> '{}', '') ~ '^https://[a-z0-9.-]+$'),
    'jobs', (select jsonb_agg(jsonb_build_object('name', j.name, 'kind', j.kind, 'schedule', j.schedule, 'enabled', j.enabled,
               'scheduled', ('lv-' || j.name) = any (v_scheduled), 'note', j.note,
               'last_run_at', j.last_run_at, 'last_ok_at', j.last_ok_at, 'last_error', j.last_error, 'runs', j.runs)
               || lv.job_pending(j.name) order by j.name) from lv.jobs j));
end;
$$;

create function lv_api.lv_admin_jobs() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_jobs(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on function lv.job_pending(text) from public;
revoke all on function lv.job_tick(text) from public;
revoke all on function lv.jobs_install() from public;
revoke all on function lv.api_admin_jobs() from public;
revoke all on function lv_api.lv_admin_jobs() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function lv.job_pending(text) from %I', r);
      execute format('revoke all on function lv.job_tick(text) from %I', r);
      execute format('revoke all on function lv.jobs_install() from %I', r);
      execute format('revoke all on function lv.api_admin_jobs() from %I', r);
      execute format('revoke all on function lv_api.lv_admin_jobs() from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_admin_jobs() to authenticated';
  end if;
end $$;

commit;
