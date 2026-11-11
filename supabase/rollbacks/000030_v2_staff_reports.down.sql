-- Rollback for 000030_v2_staff_reports: reports lose their category and decision stamp, the queue lists survey
-- reports one by one again, and staff are no longer emailed. Reports themselves are kept.
begin;
drop trigger if exists abuse_reports_notify on lv.abuse_reports;
drop trigger if exists comment_reports_notify on lv.comment_reports;
drop trigger if exists abuse_reports_decision on lv.abuse_reports;
drop function if exists lv_api.lv_admin_campaign_reports_dismiss(uuid);
drop function if exists lv.api_admin_campaign_reports_dismiss(uuid);
drop function if exists lv_api.lv_report_abuse(text, text, text);

create or replace function lv.api_report_abuse(p_join_code text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reason text := btrim(p_reason);
  v_campaign uuid;
  v_recent int;
begin
  if v_reason is null or v_reason = '' or length(v_reason) > 1000 then
    return lv.err('lv_invalid_input', 'Tell us briefly what is wrong (up to 1000 characters).');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_abuse', 0));
  select count(*) into v_recent from lv.abuse_reports r where r.created_at > now() - interval '1 minute';
  if v_recent >= coalesce((lv.policy_json('abuse.reports_per_minute'))::int, 0) then
    return lv.err('lv_rate_limited', 'Too many reports right now. Try again in a minute.');
  end if;
  select c.id into v_campaign from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, '')));
  if v_campaign is not null then
    insert into lv.abuse_reports (campaign_id, reason, reporter_account_id) values (v_campaign, v_reason, lv.current_account_id());
  end if;
  return jsonb_build_object('ok', true, 'received', true);
end;
$$;

drop function if exists lv.api_report_abuse(text, text, text);
drop function if exists lv.abuse_report_after_insert();
drop function if exists lv.comment_report_after_insert();
drop function if exists lv.abuse_report_stamp_decision();
drop function if exists lv.abuse_report_reporters(uuid);
drop function if exists lv.staff_report_notify(text, uuid, text, text, text, int);

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
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(x.item order by x.at desc) from (
      select r.created_at as at, jsonb_build_object('type', 'survey', 'id', r.id, 'status', r.status,
               'reasons', jsonb_build_array(r.reason), 'report_count', 1, 'created_at', r.created_at,
               'hub_id', h.id, 'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug,
               'quick_survey', h.kind = 'personal', 'hub_suspended', lv.hub_suspended(h.id),
               'campaign_id', c.id, 'campaign_title', c.title, 'join_code', c.join_code, 'blocked', c.blocked_at is not null) as item
        from lv.abuse_reports r left join lv.campaigns c on c.id = r.campaign_id left join lv.hubs h on h.id = c.hub_id
       where v_type in ('survey', 'all') and (v_status = 'all' or r.status = v_status)
      union all
      select max(cr.created_at), jsonb_build_object('type', 'comment', 'id', cm.id,
               'status', coalesce(rv.status, 'open'),
               'reasons', (select jsonb_agg(y.reason order by y.created_at desc) from (select z.reason, z.created_at from lv.comment_reports z
                             where z.comment_id = cm.id order by z.created_at desc limit 5) y),
               'report_count', count(*), 'created_at', max(cr.created_at),
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

delete from lv.email_outbox where template = 'staff_report';
alter table lv.email_outbox drop constraint email_outbox_template_check;
alter table lv.email_outbox add constraint email_outbox_template_check
  check (template in ('waitlist_joined', 'hub_created', 'hub_invite', 'reservation_confirmed', 'reservation_expiring',
                      'reservation_grace', 'participation_receipt', 'shop_order'));

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
                        'reservation_grace', 'participation_receipt', 'shop_order') then return null; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 4096 then return null; end if;
  insert into lv.email_outbox (template, account_id, to_address, payload, dedupe_key)
  values (p_template, p_account, v_to, jsonb_strip_nulls(p_payload), p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

delete from lv.integration_rate_windows where scope = 'report_caller';
alter table lv.integration_rate_windows drop constraint integration_rate_windows_scope_check;
alter table lv.integration_rate_windows add constraint integration_rate_windows_scope_check
  check (scope in ('api_key', 'discord_user', 'discord_guild', 'guest_caller'));
delete from lv.policy where key in ('abuse.reports_per_caller_per_minute', 'abuse.notify_email');
update lv.policy set value = '20'::jsonb,
       note = 'Maximum abuse reports accepted per minute across the platform (signed-out reporting is allowed).'
 where key = 'abuse.reports_per_minute';
drop index if exists lv.abuse_reports_open_idx;
alter table lv.abuse_reports drop column category, drop column caller_hash, drop column decided_at, drop column decided_by;
commit;
