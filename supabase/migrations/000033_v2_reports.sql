-- 000033: reporting, Discord-style (founder direction 2026-11-11). A person or a Hub can be reported; a report about a person
-- attaches to that ACCOUNT's record and lands in the staff Reports queue. Reporters are never shown to the reported person or to
-- Hub owners, and the staff audit never names the reporter. Nothing is deleted by a report; staff act with the tools they
-- already have (dismiss, mark actioned, suspend the Hub or the account).
begin;

create table lv.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_account_id uuid references lv.accounts (id) on delete set null,
  target_kind text not null check (target_kind in ('account', 'hub')),
  target_account_id uuid references lv.accounts (id) on delete cascade,
  hub_id uuid references lv.hubs (id) on delete cascade,       -- the Hub reported, or the Hub where the person was met
  reason text not null check (reason in ('harassment', 'hate', 'threats', 'sexual_content', 'scam', 'impersonation', 'spam', 'privacy', 'other')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  staff_note text check (staff_note is null or length(staff_note) <= 500),
  decided_by uuid references lv.accounts (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_reports_target_shape check (
    (target_kind = 'account' and target_account_id is not null)
    or (target_kind = 'hub' and target_account_id is null and hub_id is not null))
);
alter table lv.user_reports enable row level security;
-- One open report per reporter per target: repeating it changes nothing (and cannot be used to spam staff).
create unique index user_reports_open_once on lv.user_reports (reporter_account_id, target_kind, coalesce(target_account_id, hub_id)) where status = 'open';
create index user_reports_queue_idx on lv.user_reports (status, created_at desc);
create index user_reports_target_idx on lv.user_reports (target_account_id) where target_account_id is not null;

create function lv.report_reason_ok(p_reason text) returns boolean
language sql immutable set search_path = ''
as $$ select p_reason in ('harassment', 'hate', 'threats', 'sexual_content', 'scam', 'impersonation', 'spam', 'privacy', 'other') $$;

-- Report a person you share a Hub with: by membership (member-admins see these) or by one of their comments.
create function lv.api_report_account(p_hub uuid, p_membership uuid, p_comment uuid, p_reason text, p_details text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_target uuid;
  v_details text := nullif(btrim(regexp_replace(coalesce(p_details, ''), '[[:cntrl:]]', ' ', 'g')), '');
  v_id uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if not lv.report_reason_ok(p_reason) then return lv.err('lv_invalid_input', 'Choose a reason.'); end if;
  if v_details is not null and length(v_details) > 1000 then return lv.err('lv_invalid_input', 'Keep the details to 1000 characters.'); end if;
  if (p_membership is null) = (p_comment is null) then return lv.err('lv_invalid_input', 'Say who you are reporting.'); end if;
  if p_hub is null or lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such person.'); end if;
  if p_membership is not null then
    select m.account_id into v_target from lv.hub_memberships m where m.id = p_membership and m.hub_id = p_hub and m.status in ('accepted', 'pending');
  else
    select c.author_account_id into v_target from lv.comments c where c.id = p_comment and c.hub_id = p_hub;
  end if;
  if v_target is null then return lv.err('lv_not_found', 'No such person.'); end if;
  if v_target = v_account then return lv.err('lv_invalid_input', 'You can''t report yourself.'); end if;
  if (select count(*) from lv.user_reports r where r.reporter_account_id = v_account and r.created_at > now() - interval '24 hours') >= 10 then
    return lv.err('lv_rate_limited', 'You''ve sent a lot of reports today. Staff will review them; try again tomorrow.');
  end if;
  insert into lv.user_reports (reporter_account_id, target_kind, target_account_id, hub_id, reason, details)
  values (v_account, 'account', v_target, p_hub, p_reason, v_details)
  on conflict (reporter_account_id, target_kind, coalesce(target_account_id, hub_id)) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  perform lv.audit(null, p_hub, 'report.account', v_id::text);   -- the reporter is never recorded in the audit
  return jsonb_build_object('ok', true, 'report_id', v_id, 'duplicate', false);
end;
$$;

-- Report a Hub by its address. Anyone signed in may; an owner cannot report their own Hub.
create function lv.api_report_hub(p_slug text, p_reason text, p_details text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h lv.hubs;
  v_details text := nullif(btrim(regexp_replace(coalesce(p_details, ''), '[[:cntrl:]]', ' ', 'g')), '');
  v_id uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if not lv.report_reason_ok(p_reason) then return lv.err('lv_invalid_input', 'Choose a reason.'); end if;
  if v_details is not null and length(v_details) > 1000 then return lv.err('lv_invalid_input', 'Keep the details to 1000 characters.'); end if;
  select * into h from lv.hubs x where x.slug = lower(btrim(coalesce(p_slug, ''))) and x.kind = 'community';
  if h.id is null then return lv.err('lv_not_found', 'No Hub lives at that address.'); end if;
  if h.owner_account_id = v_account then return lv.err('lv_invalid_input', 'You can''t report your own Hub.'); end if;
  if (select count(*) from lv.user_reports r where r.reporter_account_id = v_account and r.created_at > now() - interval '24 hours') >= 10 then
    return lv.err('lv_rate_limited', 'You''ve sent a lot of reports today. Staff will review them; try again tomorrow.');
  end if;
  insert into lv.user_reports (reporter_account_id, target_kind, hub_id, reason, details)
  values (v_account, 'hub', h.id, p_reason, v_details)
  on conflict (reporter_account_id, target_kind, coalesce(target_account_id, hub_id)) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  perform lv.audit(null, h.id, 'report.hub', v_id::text);
  return jsonb_build_object('ok', true, 'report_id', v_id, 'duplicate', false);
end;
$$;

-- What I reported and where it stands. Never who the target's other reporters were, never staff notes.
create function lv.api_my_reports() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  return jsonb_build_object('ok', true, 'reports', coalesce((
    select jsonb_agg(jsonb_build_object('report_id', r.id, 'kind', case r.target_kind when 'account' then 'person' else 'hub' end,
             'label', case r.target_kind when 'account' then coalesce(ta.display_name, 'A person') else h.display_name end,
             'reason', r.reason, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
      from lv.user_reports r left join lv.accounts ta on ta.id = r.target_account_id left join lv.hubs h on h.id = r.hub_id
     where r.reporter_account_id = v_account), '[]'::jsonb));
end;
$$;

-- Staff: the one queue now also carries reports about people and Hubs, and a person's open-report count shows on Accounts.
create or replace function lv.api_admin_reports(p_status text, p_type text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_status text := coalesce(nullif(p_status, ''), 'open');
  v_type text := coalesce(nullif(p_type, ''), 'all');
begin
  if v_denied is not null then return v_denied; end if;
  if v_status not in ('open', 'actioned', 'dismissed', 'all') or v_type not in ('survey', 'comment', 'person', 'hub', 'all') then
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
      select r.created_at as at, jsonb_build_object('type', case r.target_kind when 'account' then 'person' else 'hub' end, 'id', r.id,
               'status', r.status, 'reasons', jsonb_build_array(r.reason), 'report_count', 1, 'created_at', r.created_at,
               'hub_id', h.id, 'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug,
               'quick_survey', false, 'hub_suspended', lv.hub_suspended(h.id),
               'details', r.details, 'staff_note', r.staff_note,
               'target_account_id', r.target_account_id, 'target_name', ta.display_name,
               'target_suspended', case when r.target_account_id is not null then lv.account_suspended(r.target_account_id) end,
               'target_open_reports', case when r.target_account_id is not null
                  then (select count(*) from lv.user_reports o where o.target_account_id = r.target_account_id and o.status = 'open') end) as item
        from lv.user_reports r left join lv.hubs h on h.id = r.hub_id left join lv.accounts ta on ta.id = r.target_account_id
       where (v_type = 'all' or (v_type = 'person' and r.target_kind = 'account') or (v_type = 'hub' and r.target_kind = 'hub'))
         and (v_status = 'all' or r.status = v_status)
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

create or replace function lv.admin_account_row(p_account uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('account_id', a.id, 'display_name', a.display_name, 'created_at', a.created_at,
           'hubs_owned', (select count(*) from lv.hubs h where h.owner_account_id = a.id and h.kind = 'community'),
           'memberships', (select count(*) from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
                            where m.account_id = a.id and m.status = 'accepted' and h.kind = 'community'),
           'is_staff', lv.is_platform_admin(a.id),
           'open_reports', (select count(*) from lv.user_reports r where r.target_account_id = a.id and r.status = 'open'),
           'suspension', (select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at) from lv.account_suspensions s where s.account_id = a.id))
    from lv.accounts a where a.id = p_account
$$;

create function lv.api_admin_user_report_decide(p_report uuid, p_status text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  r lv.user_reports;
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), '');
begin
  if v_denied is not null then return v_denied; end if;
  if p_status not in ('actioned', 'dismissed') then return lv.err('lv_invalid_input', 'Choose actioned or dismissed.'); end if;
  if v_note is not null and length(v_note) > 500 then return lv.err('lv_invalid_input', 'Keep the note to 500 characters.'); end if;
  select * into r from lv.user_reports x where x.id = p_report for update;
  if r.id is null then return lv.err('lv_not_found', 'No such report.'); end if;
  update lv.user_reports set status = p_status, staff_note = v_note, decided_by = v_actor, decided_at = now() where id = r.id;
  perform lv.audit(v_actor, r.hub_id, 'report.' || p_status, r.id::text);
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- API wrappers and grants: signed-in callers only.
create function lv_api.lv_report_account(p_hub uuid, p_membership uuid default null, p_comment uuid default null, p_reason text default null, p_details text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_report_account(p_hub, p_membership, p_comment, p_reason, p_details); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_report_hub(p_slug text, p_reason text, p_details text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_report_hub(p_slug, p_reason, p_details); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_my_reports() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_my_reports(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_user_report_decide(p_report uuid, p_status text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_user_report_decide(p_report, p_status, p_note); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on function lv.report_reason_ok(text) from public;
revoke all on function lv.api_report_account(uuid, uuid, uuid, text, text) from public;
revoke all on function lv.api_report_hub(text, text, text) from public;
revoke all on function lv.api_my_reports() from public;
revoke all on function lv.api_admin_user_report_decide(uuid, text, text) from public;
revoke all on function lv_api.lv_report_account(uuid, uuid, uuid, text, text) from public;
revoke all on function lv_api.lv_report_hub(text, text, text) from public;
revoke all on function lv_api.lv_my_reports() from public;
revoke all on function lv_api.lv_admin_user_report_decide(uuid, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.report_reason_ok(text), lv.api_report_account(uuid, uuid, uuid, text, text), lv.api_report_hub(text, text, text), lv.api_my_reports(), lv.api_admin_user_report_decide(uuid, text, text) from anon';
    execute 'revoke all on function lv_api.lv_report_account(uuid, uuid, uuid, text, text), lv_api.lv_report_hub(text, text, text), lv_api.lv_my_reports(), lv_api.lv_admin_user_report_decide(uuid, text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.report_reason_ok(text), lv.api_report_account(uuid, uuid, uuid, text, text), lv.api_report_hub(text, text, text), lv.api_my_reports(), lv.api_admin_user_report_decide(uuid, text, text) from authenticated';
    execute 'grant execute on function lv_api.lv_report_account(uuid, uuid, uuid, text, text), lv_api.lv_report_hub(text, text, text), lv_api.lv_my_reports(), lv_api.lv_admin_user_report_decide(uuid, text, text) to authenticated';
  end if;
end $$;

commit;
