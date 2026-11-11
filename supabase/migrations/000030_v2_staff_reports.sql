-- 000030 (module: staff): the reporting system, step 1 (docs/strategy/05_STAFF_AND_REPORTING.md, founder 2026-11-11).
--
-- R-1 Staff are told. The first open report about a survey or a comment, and again at 3 and 10 distinct reporters,
--     queues ONE email (template staff_report) to policy 'abuse.notify_email'. It carries what was reported, the
--     category and the count. Never the reporter, never the reporter's text.
-- R-2 Reporting cannot be silenced by one caller. A per-caller limit ('abuse.reports_per_caller_per_minute', 5) is
--     counted in lv.integration_rate_windows under a hash; the platform-wide number ('abuse.reports_per_minute') stays
--     as a database safeguard and is raised from 20 to 300. One caller holds at most one open report per survey: a
--     repeat answers "received" and stores nothing. Known and unknown codes still answer identically.
-- R-3 The category the form already collects is a real column (harmful, scam, private_info, spam, other).
--     lv_report_abuse gains p_category; the two-argument call keeps working and files under 'other'.
-- R-4 The staff queue groups survey reports per survey: distinct reporters, categories with counts, first and latest
--     report, the newest three texts; phishing and private-information reports sort first. One call dismisses a
--     survey's open reports.
-- R-10 Every decision records when and by whom (decided_at, decided_by), and the queue reports the median hours to a
--     decision over the last 7 days.
-- Reporters are never returned to anyone. Nothing here deletes data.
begin;

alter table lv.abuse_reports
  add column category text not null default 'other' check (category in ('harmful', 'scam', 'private_info', 'spam', 'other')),
  add column caller_hash text check (caller_hash is null or caller_hash ~ '^[0-9a-f]{64}$'),
  add column decided_at timestamptz,
  add column decided_by uuid references lv.accounts (id) on delete set null;
create index abuse_reports_open_idx on lv.abuse_reports (campaign_id) where status = 'open';

alter table lv.integration_rate_windows drop constraint integration_rate_windows_scope_check;
alter table lv.integration_rate_windows add constraint integration_rate_windows_scope_check
  check (scope in ('api_key', 'discord_user', 'discord_guild', 'guest_caller', 'report_caller'));

insert into lv.policy (key, value, note) values
  ('abuse.reports_per_caller_per_minute', '5'::jsonb,
   'Abuse reports accepted per minute from one caller (hashed network address, or account). NULL: not enforced.'),
  ('abuse.notify_email', '"admin@lunchvoice.com"'::jsonb,
   'Where the "something was reported" email goes (first report, then at 3 and 10 distinct reporters). NULL: no email.');
update lv.policy
   set value = '300'::jsonb,
       note = 'Database safeguard: abuse reports accepted per minute across the platform. The per-caller limit is the abuse control.'
 where key = 'abuse.reports_per_minute';

-- ---------------------------------------------------------------------------------------------------------
-- Email: one more template
-- ---------------------------------------------------------------------------------------------------------
alter table lv.email_outbox drop constraint email_outbox_template_check;
alter table lv.email_outbox add constraint email_outbox_template_check
  check (template in ('waitlist_joined', 'hub_created', 'hub_invite', 'reservation_confirmed', 'reservation_expiring',
                      'reservation_grace', 'participation_receipt', 'shop_order', 'staff_report'));

create or replace function lv.email_enqueue(p_template text, p_account uuid, p_to text, p_payload jsonb, p_dedupe text default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_to text := lower(btrim(p_to));
begin
  if v_to is null or length(v_to) > 254 or v_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  if p_template not in ('waitlist_joined', 'hub_created', 'hub_invite', 'reservation_confirmed', 'reservation_expiring',
                        'reservation_grace', 'participation_receipt', 'shop_order', 'staff_report') then return null; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 4096 then return null; end if;
  insert into lv.email_outbox (template, account_id, to_address, payload, dedupe_key)
  values (p_template, p_account, v_to, jsonb_strip_nulls(p_payload), p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Tell staff at 1, 3 and 10 distinct reporters. Never raises: a failed notice must not lose a report.
create function lv.staff_report_notify(p_kind text, p_target uuid, p_title text, p_hub_name text, p_category text, p_reporters int)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_to text;
begin
  if p_reporters not in (1, 3, 10) then return; end if;
  v_to := lv.policy_json('abuse.notify_email') #>> '{}';
  if v_to is null then return; end if;
  perform lv.email_enqueue('staff_report', null, v_to,
    jsonb_build_object('kind', p_kind, 'title', left(coalesce(p_title, ''), 120), 'hub_name', left(coalesce(p_hub_name, ''), 120),
                       'category', p_category, 'reporters', p_reporters),
    'staff_report:' || p_kind || ':' || p_target::text || ':' || p_reporters::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
exception when others then
  return;
end;
$$;

create function lv.abuse_report_reporters(p_campaign uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(distinct coalesce(r.reporter_account_id::text, r.caller_hash, r.id::text))::int
    from lv.abuse_reports r where r.campaign_id = p_campaign and r.status = 'open'
$$;

create function lv.abuse_report_after_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  select x.title, h.display_name, h.kind into c from lv.campaigns x join lv.hubs h on h.id = x.hub_id where x.id = new.campaign_id;
  perform lv.staff_report_notify('survey', new.campaign_id, c.title, case when c.kind = 'community' then c.display_name end,
                                 new.category, lv.abuse_report_reporters(new.campaign_id));
  return new;
end;
$$;
create trigger abuse_reports_notify after insert on lv.abuse_reports
  for each row when (new.campaign_id is not null) execute function lv.abuse_report_after_insert();

create function lv.comment_report_after_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  if exists (select 1 from lv.comment_report_reviews rv where rv.comment_id = new.comment_id) then return new; end if;
  select h.display_name into c from lv.comments cm join lv.hubs h on h.id = cm.hub_id where cm.id = new.comment_id;
  perform lv.staff_report_notify('comment', new.comment_id, 'A comment', c.display_name, 'other',
                                 (select count(*)::int from lv.comment_reports r where r.comment_id = new.comment_id));
  return new;
end;
$$;
create trigger comment_reports_notify after insert on lv.comment_reports
  for each row execute function lv.comment_report_after_insert();

-- Every decision is stamped, whichever function makes it (block, dismiss, or a later one).
create function lv.abuse_report_stamp_decision() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'open' and old.status = 'open' then
    new.decided_at := now();
    new.decided_by := lv.current_account_id();
  elsif new.status = 'open' then
    new.decided_at := null;
    new.decided_by := null;
  end if;
  return new;
end;
$$;
create trigger abuse_reports_decision before update of status on lv.abuse_reports
  for each row execute function lv.abuse_report_stamp_decision();

-- ---------------------------------------------------------------------------------------------------------
-- Reporting (signed out allowed)
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_report_abuse(p_join_code text, p_reason text, p_category text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reason text := btrim(p_reason);
  v_category text := coalesce(nullif(btrim(p_category), ''), 'other');
  v_campaign uuid;
  v_recent int;
  v_caller text := lv.request_caller_key();
  v_limit int := (lv.policy_json('abuse.reports_per_caller_per_minute'))::int;
  v_hash text;
  v_account uuid := lv.current_account_id();
begin
  if v_reason is null or v_reason = '' or length(v_reason) > 1000 then
    return lv.err('lv_invalid_input', 'Tell us briefly what is wrong (up to 1000 characters).');
  end if;
  if v_category not in ('harmful', 'scam', 'private_info', 'spam', 'other') then
    return lv.err('lv_invalid_input', 'Unknown report category.');
  end if;
  if v_caller <> 'anon' and v_limit is not null
     and lv.integration_rate_hit('report_caller', lv.sha256_hex('report:' || v_caller), v_limit) is not null then
    return lv.err('lv_rate_limited', 'Too many reports from this connection. Try again in a minute.');
  end if;
  select count(*) into v_recent from lv.abuse_reports r where r.created_at > now() - interval '1 minute';
  if v_recent >= coalesce((lv.policy_json('abuse.reports_per_minute'))::int, 0) then
    return lv.err('lv_rate_limited', 'Too many reports right now. Try again in a minute.');
  end if;
  select c.id into v_campaign from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, '')));
  if v_campaign is not null then
    if v_caller <> 'anon' then v_hash := lv.sha256_hex(v_campaign::text || ':' || v_caller); end if;
    -- One open report per caller per survey; the answer is the same either way.
    if not exists (select 1 from lv.abuse_reports r
                    where r.campaign_id = v_campaign and r.status = 'open'
                      and ((v_account is not null and r.reporter_account_id = v_account) or (v_hash is not null and r.caller_hash = v_hash))) then
      insert into lv.abuse_reports (campaign_id, reason, reporter_account_id, category, caller_hash)
      values (v_campaign, v_reason, v_account, v_category, v_hash);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'received', true);
end;
$$;

create or replace function lv.api_report_abuse(p_join_code text, p_reason text) returns jsonb
language sql volatile security definer set search_path = ''
as $$ select lv.api_report_abuse(p_join_code, p_reason, 'other') $$;

create function lv_api.lv_report_abuse(p_join_code text, p_reason text, p_category text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_report_abuse(p_join_code, p_reason, p_category); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- The staff queue: survey reports grouped per survey
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.api_admin_reports(p_status text, p_type text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_status text := coalesce(nullif(p_status, ''), 'open');
  v_type text := coalesce(nullif(p_type, ''), 'all');
begin
  if v_denied is not null then return v_denied; end if;
  if v_status not in ('open', 'actioned', 'dismissed', 'all') or v_type not in ('survey', 'comment', 'all') then
    return lv.err('lv_invalid_input', 'Unknown status or type.');
  end if;
  return jsonb_build_object('ok', true,
    'median_decision_hours', (select round((percentile_cont(0.5) within group (order by extract(epoch from (r.decided_at - r.created_at)) / 3600.0))::numeric, 1)
                                from lv.abuse_reports r where r.decided_at is not null and r.decided_at > now() - interval '7 days'),
    'items', coalesce((
    select jsonb_agg(x.item order by x.urgent desc, x.reporters desc, x.at desc) from (
      select max(r.created_at) as at,
             bool_or(r.category in ('scam', 'private_info')) as urgent,
             count(distinct coalesce(r.reporter_account_id::text, r.caller_hash, r.id::text)) as reporters,
             jsonb_build_object('type', 'survey', 'id', c.id, 'status', r.status,
               'reasons', (select jsonb_agg(y.reason order by y.created_at desc) from (select z.reason, z.created_at from lv.abuse_reports z
                             where z.campaign_id = c.id and z.status = r.status order by z.created_at desc limit 3) y),
               'report_count', count(*),
               'distinct_count', count(distinct coalesce(r.reporter_account_id::text, r.caller_hash, r.id::text)),
               'categories', (select jsonb_object_agg(k.category, k.n) from (select z.category, count(*) as n from lv.abuse_reports z
                               where z.campaign_id = c.id and z.status = r.status group by z.category) k),
               'created_at', max(r.created_at), 'first_at', min(r.created_at), 'decided_at', max(r.decided_at),
               'hub_id', h.id, 'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug,
               'quick_survey', h.kind = 'personal', 'hub_suspended', lv.hub_suspended(h.id),
               'campaign_id', c.id, 'campaign_title', c.title, 'join_code', c.join_code, 'blocked', c.blocked_at is not null) as item
        from lv.abuse_reports r join lv.campaigns c on c.id = r.campaign_id join lv.hubs h on h.id = c.hub_id
       where v_type in ('survey', 'all') and (v_status = 'all' or r.status = v_status)
       group by c.id, r.status, h.id
      union all
      select max(cr.created_at), false, count(*),
             jsonb_build_object('type', 'comment', 'id', cm.id,
               'status', coalesce(rv.status, 'open'),
               'reasons', (select jsonb_agg(y.reason order by y.created_at desc) from (select z.reason, z.created_at from lv.comment_reports z
                             where z.comment_id = cm.id order by z.created_at desc limit 5) y),
               'report_count', count(*), 'distinct_count', count(*), 'categories', jsonb_build_object('other', count(*)),
               'created_at', max(cr.created_at), 'first_at', min(cr.created_at), 'decided_at', max(rv.decided_at),
               'hub_id', h.id, 'hub_name', h.display_name, 'hub_slug', h.slug, 'quick_survey', false, 'hub_suspended', lv.hub_suspended(h.id),
               'comment_id', cm.id, 'post_id', cm.post_id, 'excerpt', left(cm.body, 280), 'hidden', cm.hidden_at is not null,
               'author_suspended', lv.account_suspended(cm.author_account_id), 'author_account_id', cm.author_account_id)
        from lv.comment_reports cr join lv.comments cm on cm.id = cr.comment_id join lv.hubs h on h.id = cm.hub_id
        left join lv.comment_report_reviews rv on rv.comment_id = cm.id
       where v_type in ('comment', 'all') and (v_status = 'all' or coalesce(rv.status, 'open') = v_status)
       group by cm.id, rv.status, h.id
       order by 1 desc limit 300) x), '[]'::jsonb));
end;
$$;

create function lv.api_admin_campaign_reports_dismiss(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_n int;
begin
  if v_denied is not null then return v_denied; end if;
  update lv.abuse_reports set status = 'dismissed' where campaign_id = p_campaign and status = 'open';
  get diagnostics v_n = row_count;
  if v_n = 0 then return lv.err('lv_not_found', 'No open reports for that survey.'); end if;
  perform lv.audit(lv.current_account_id(), null, 'abuse.dismissed', p_campaign::text, jsonb_build_object('reports', v_n));
  return jsonb_build_object('ok', true, 'status', 'dismissed', 'reports', v_n);
end;
$$;

create function lv_api.lv_admin_campaign_reports_dismiss(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_campaign_reports_dismiss(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Grants: explicit. Reporting is open to signed-out callers; the queue is for signed-in staff (checked inside).
revoke all on function lv.staff_report_notify(text, uuid, text, text, text, int) from public;
revoke all on function lv.abuse_report_reporters(uuid) from public;
revoke all on function lv.abuse_report_after_insert() from public;
revoke all on function lv.comment_report_after_insert() from public;
revoke all on function lv.abuse_report_stamp_decision() from public;
revoke all on function lv.api_report_abuse(text, text, text) from public;
revoke all on function lv.api_admin_campaign_reports_dismiss(uuid) from public;
revoke all on function lv_api.lv_report_abuse(text, text, text) from public;
revoke all on function lv_api.lv_admin_campaign_reports_dismiss(uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function lv.staff_report_notify(text, uuid, text, text, text, int) from %I', r);
      execute format('revoke all on function lv.abuse_report_reporters(uuid) from %I', r);
      execute format('revoke all on function lv.abuse_report_after_insert() from %I', r);
      execute format('revoke all on function lv.comment_report_after_insert() from %I', r);
      execute format('revoke all on function lv.abuse_report_stamp_decision() from %I', r);
      execute format('revoke all on function lv.api_report_abuse(text, text, text) from %I', r);
      execute format('revoke all on function lv.api_admin_campaign_reports_dismiss(uuid) from %I', r);
      execute format('grant execute on function lv_api.lv_report_abuse(text, text, text) to %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv_api.lv_admin_campaign_reports_dismiss(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_admin_campaign_reports_dismiss(uuid) to authenticated';
  end if;
end $$;

commit;
