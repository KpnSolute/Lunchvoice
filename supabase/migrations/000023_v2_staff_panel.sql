-- LunchVoice v2 canonical 23: the staff panel (founder request, 2026-11-08).
--
-- 1. Staff management. Platform admins ("staff") are listed, added by a VERIFIED email (never a display name) and
--    revoked from the UI. Adding and revoking need a recent sign-in (LC-22, lv_reauth_required). Nobody revokes
--    themselves, and the last active admin can never be removed (lv_conflict). Audit: staff.added, staff.revoked.
-- 2. Suspension. A suspended Hub is hidden from Discover, its Campaigns stop accepting responses (lv_closed), nobody
--    can join it, and nothing new can be created or published in it (lv_suspended); lv_hub_get carries the state
--    (the reason only for the Owner). A suspended account can sign in, read, leave and delete its data, and answer
--    Campaigns, but cannot create or publish anything, post, comment, order or buy (lv_suspended). Nothing is ever
--    deleted. Staff never suspend themselves or another active admin. Enforcement is ONE helper,
--    lv.assert_not_suspended(account, hub), called from row triggers on every content table, so every write path
--    (current and future functions) is covered without replacing them. Deletes are never guarded.
-- 3. One reports queue: survey abuse reports and community comment reports (grouped per comment), with dismiss,
--    block survey, hide comment and suspend Hub. Reporters are never returned.
-- 4. Lookup: Hubs by slug or name; accounts by exact verified email. An email is shown only after a deliberate,
--    audited reveal (admin.email_revealed).
-- 5. Audit viewer: actor display name, action, target, time. Never the detail payload.
-- Every lv_admin_* function refuses non-admins with lv_forbidden and is granted to authenticated only.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Suspension state
-- ---------------------------------------------------------------------------------------------------------
create table lv.hub_suspensions (
  hub_id uuid primary key references lv.hubs (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  suspended_by uuid references lv.accounts (id) on delete set null,
  suspended_at timestamptz not null default now()
);
alter table lv.hub_suspensions enable row level security;

create table lv.account_suspensions (
  account_id uuid primary key references lv.accounts (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  suspended_by uuid references lv.accounts (id) on delete set null,
  suspended_at timestamptz not null default now()
);
alter table lv.account_suspensions enable row level security;

-- Comment reports have no status of their own (000020); staff decisions live here, one per reported comment.
create table lv.comment_report_reviews (
  comment_id uuid primary key references lv.comments (id) on delete cascade,
  status text not null check (status in ('actioned', 'dismissed')),
  decided_by uuid references lv.accounts (id) on delete set null,
  decided_at timestamptz not null default now()
);
alter table lv.comment_report_reviews enable row level security;

create function lv.hub_suspended(p_hub uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_hub is not null and exists (select 1 from lv.hub_suspensions s where s.hub_id = p_hub) $$;

create function lv.account_suspended(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_account is not null and exists (select 1 from lv.account_suspensions s where s.account_id = p_account) $$;

-- THE helper. Raises lv_suspended (mapped to the envelope by lv.api_error) when the account or the Hub is suspended.
create function lv.assert_not_suspended(p_account uuid, p_hub uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if lv.account_suspended(p_account) then
    raise exception 'lv_suspended: Your account is suspended, so you can''t create or publish anything. You can still read, leave and delete your data.'
      using errcode = '42501';
  end if;
  if lv.hub_suspended(p_hub) then
    raise exception 'lv_suspended: This Hub is suspended, so nothing new can be created or published in it.' using errcode = '42501';
  end if;
end;
$$;

-- Row trigger. TG_ARGV[0] says where the Hub comes from: 'hub_id', 'id' (lv.hubs), 'campaign' (campaign_id),
-- 'none' (account only). TG_ARGV[1] = 'responses' answers lv_closed instead (a suspended Hub takes no responses,
-- while a suspended account may still answer).
create function lv.suspension_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_row jsonb := to_jsonb(new);
begin
  v_hub := case tg_argv[0]
             when 'hub_id' then (v_row->>'hub_id')::uuid
             when 'id' then case when tg_op = 'UPDATE' then (v_row->>'id')::uuid end
             when 'campaign' then (select c.hub_id from lv.campaigns c where c.id = (v_row->>'campaign_id')::uuid)
             else null end;

  if tg_argv[1] = 'responses' then
    if lv.hub_suspended(v_hub) then
      raise exception 'lv_closed: This Campaign isn''t accepting responses right now.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Only creating or publishing is refused; closing, pausing, hiding, unpublishing, fulfilling and staff
    -- moderation stay possible.
    if tg_table_name = 'campaigns' and not ((v_row->>'status' = 'active' and to_jsonb(old)->>'status' is distinct from 'active')
         or (v_row->>'title', v_row->>'mode', v_row->>'anonymity') is distinct from (to_jsonb(old)->>'title', to_jsonb(old)->>'mode', to_jsonb(old)->>'anonymity')) then
      return new;
    end if;
    if tg_table_name = 'hubs' and (v_row->>'display_name', v_row->>'about', v_row->>'accent')
         is not distinct from (to_jsonb(old)->>'display_name', to_jsonb(old)->>'about', to_jsonb(old)->>'accent') then
      return new;
    end if;
    if tg_table_name = 'news_posts' and not ((v_row->>'status' = 'published' and to_jsonb(old)->>'status' is distinct from 'published')
         or (v_row->>'title', v_row->>'body') is distinct from (to_jsonb(old)->>'title', to_jsonb(old)->>'body')) then
      return new;
    end if;
    if tg_table_name = 'shop_items' and not coalesce((v_row->>'active')::boolean, false) then
      return new;
    end if;
  end if;

  perform lv.assert_not_suspended(case when tg_table_name = 'hub_memberships' then null else lv.current_account_id() end, v_hub);
  return new;
end;
$$;

create trigger hubs_suspension_guard before insert or update on lv.hubs for each row execute function lv.suspension_guard('id');
create trigger campaigns_suspension_guard before insert or update on lv.campaigns for each row execute function lv.suspension_guard('hub_id');
create trigger campaign_questions_suspension_guard before insert or update on lv.campaign_questions for each row execute function lv.suspension_guard('campaign');
create trigger campaign_invites_suspension_guard before insert on lv.campaign_invites for each row execute function lv.suspension_guard('campaign');
create trigger hub_invites_suspension_guard before insert on lv.hub_invites for each row execute function lv.suspension_guard('hub_id');
create trigger hub_pages_suspension_guard before insert or update on lv.hub_pages for each row execute function lv.suspension_guard('hub_id');
create trigger roles_suspension_guard before insert on lv.roles for each row execute function lv.suspension_guard('hub_id');
create trigger hub_memberships_suspension_guard before insert on lv.hub_memberships for each row execute function lv.suspension_guard('hub_id');
create trigger hub_community_suspension_guard before insert or update on lv.hub_community for each row execute function lv.suspension_guard('hub_id');
create trigger news_posts_suspension_guard before insert or update on lv.news_posts for each row execute function lv.suspension_guard('hub_id');
create trigger comments_suspension_guard before insert on lv.comments for each row execute function lv.suspension_guard('hub_id');
create trigger shop_items_suspension_guard before insert or update on lv.shop_items for each row execute function lv.suspension_guard('hub_id');
create trigger shop_orders_suspension_guard before insert on lv.shop_orders for each row execute function lv.suspension_guard('hub_id');
create trigger checkout_intents_suspension_guard before insert on lv.checkout_intents for each row execute function lv.suspension_guard('hub_id');
create trigger discover_applications_suspension_guard before insert on lv.discover_applications for each row execute function lv.suspension_guard('hub_id');
create trigger participation_suspension_guard before insert on lv.participation for each row execute function lv.suspension_guard('hub_id', 'responses');
create trigger guest_participation_suspension_guard before insert on lv.guest_participation for each row execute function lv.suspension_guard('hub_id', 'responses');

-- The state a reader may see. The reason only for the Owner and staff.
create function lv.hub_suspension_json(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when s.hub_id is null then null else jsonb_build_object('suspended', true, 'suspended_at', s.suspended_at)
    || case when lv.is_owner(lv.current_account_id(), p_hub) or lv.is_platform_admin(lv.current_account_id())
            then jsonb_build_object('reason', s.reason) else '{}'::jsonb end end
    from (select 1) one left join lv.hub_suspensions s on s.hub_id = p_hub
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Read paths that show the suspension (wrappers only; the underlying functions are unchanged)
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv_api.lv_hub_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_out jsonb;
  v_sus jsonb;
begin
  v_out := lv.api_hub_get(p_slug);
  if coalesce((v_out->>'ok')::boolean, false) then
    v_sus := lv.hub_suspension_json((v_out #>> '{hub,hub_id}')::uuid);
    if v_sus is not null then v_out := jsonb_set(v_out, '{hub,suspension}', v_sus); end if;
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create or replace function lv_api.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
  s record;
begin
  v_out := lv.api_my_context();
  if coalesce((v_out->>'ok')::boolean, false) then
    select x.* into s from lv.account_suspensions x where x.account_id = lv.current_account_id();
    v_out := v_out || jsonb_build_object('suspension', case when s.account_id is null then null
               else jsonb_build_object('suspended', true, 'reason', s.reason, 'suspended_at', s.suspended_at) end);
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- A suspended Hub's Campaign answers like a closed one to respondents.
create or replace function lv_api.lv_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  if exists (select 1 from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, ''))) and lv.hub_suspended(c.hub_id)) then
    return lv.err('lv_closed', 'This Campaign isn''t accepting responses right now.');
  end if;
  v_out := lv.api_guest_campaign_get(p_join_code);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- Discover (000020) with one added condition: a suspended Hub is never listed.
create or replace function lv.api_discover_list(p_query text, p_category text, p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_q is not null and length(v_q) > 80 then return lv.err('lv_invalid_input', 'Search is at most 80 characters.'); end if;
  if p_category is not null and p_category <> '' and not exists (
       select 1 from jsonb_array_elements(lv.discover_categories()) c where c->>'key' = p_category) then
    return lv.err('lv_invalid_input', 'Unknown category.');
  end if;
  return jsonb_build_object('ok', true, 'categories', lv.discover_categories(),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('slug', x.slug, 'name', x.display_name, 'about', x.about, 'accent', x.accent,
                                          'category', x.discover_category, 'membership_mode', x.membership_mode,
                                          'members_rounded', (x.genuine / 100) * 100)
                       order by x.genuine desc, lower(x.display_name))
        from (select h.slug, h.display_name, left(h.about, 280) as about, h.accent, hc.discover_category, h.membership_mode,
                     lv.genuine_active_members(h.id) as genuine
                from lv.hubs h
                join lv.discover_applications d on d.hub_id = h.id and d.status = 'approved'
                left join lv.hub_community hc on hc.hub_id = h.id
               where h.kind = 'community' and h.visibility = 'public' and lv.hub_family(h.id) = 'team'
                 and not lv.hub_suspended(h.id)
                 and (p_category is null or p_category = '' or hc.discover_category = p_category)
                 and (v_q is null or h.display_name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or h.slug ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or coalesce(h.about, '') ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
               order by lv.genuine_active_members(h.id) desc, lower(h.display_name)
               limit v_limit offset v_offset) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Staff management
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_admin_staff_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true, 'staff', coalesce((
    select jsonb_agg(jsonb_build_object('account_id', a.account_id, 'display_name', acc.display_name, 'granted_at', a.granted_at,
                                        'granted_by_name', g.display_name, 'is_me', a.account_id = lv.current_account_id())
                     order by a.granted_at)
      from lv.platform_admins a join lv.accounts acc on acc.id = a.account_id
      left join lv.accounts g on g.id = a.granted_by
     where a.revoked_at is null), '[]'::jsonb));
end;
$$;

-- Add by a verified email only. Email is never an identity key: it only finds the account to grant.
create function lv.api_admin_staff_add(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  v_email text := lower(btrim(p_email));
  v_accounts uuid[];
  v_target uuid;
begin
  if v_denied is not null then return v_denied; end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return lv.err('lv_invalid_input', 'Enter the email address they sign in with.');
  end if;
  perform lv.require_recent_auth();
  select array_agg(distinct i.account_id) into v_accounts
    from lv.account_identities i where lower(i.email) = v_email and i.email_verified_at is not null;
  if v_accounts is null then
    return lv.err('lv_not_found', 'No account has verified that email. They need to sign in to LunchVoice once first.');
  end if;
  if array_length(v_accounts, 1) > 1 then
    return lv.err('lv_conflict', 'More than one account has verified that email. Ask the person to sign in and share their account, then try again with support.');
  end if;
  v_target := v_accounts[1];
  if lv.is_platform_admin(v_target) then
    return jsonb_build_object('ok', true, 'account_id', v_target, 'already_staff', true);
  end if;
  perform lv.grant_platform_admin(v_target, v_actor);
  perform lv.audit(v_actor, null, 'staff.added', v_target::text);
  return jsonb_build_object('ok', true, 'account_id', v_target, 'already_staff', false,
                            'display_name', (select a.display_name from lv.accounts a where a.id = v_target));
end;
$$;

create function lv.api_admin_staff_revoke(p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
begin
  if v_denied is not null then return v_denied; end if;
  if p_account = v_actor then return lv.err('lv_conflict', 'You can''t remove yourself. Ask another staff member.'); end if;
  if not lv.is_platform_admin(p_account) then return lv.err('lv_not_found', 'That account is not staff.'); end if;
  perform lv.require_recent_auth();
  -- Serialise revocations so two staff cannot remove each other at once and leave nobody.
  perform pg_advisory_xact_lock(hashtextextended('lv_staff', 0));
  if (select count(*) from lv.platform_admins a where a.revoked_at is null) <= 1 then
    return lv.err('lv_conflict', 'The last staff member can''t be removed.');
  end if;
  perform lv.revoke_platform_admin(p_account, v_actor);
  perform lv.audit(v_actor, null, 'staff.revoked', p_account::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Suspension (staff)
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_admin_hub_suspend(p_hub uuid, p_reason text, p_suspend boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  h record;
begin
  if v_denied is not null then return v_denied; end if;
  select * into h from lv.hubs x where x.id = p_hub and x.kind = 'community';
  if h.id is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if p_suspend then
    if btrim(coalesce(p_reason, '')) = '' or length(p_reason) > 500 then
      return lv.err('lv_invalid_input', 'A suspension needs a reason of up to 500 characters. The Owner sees it.');
    end if;
    insert into lv.hub_suspensions (hub_id, reason, suspended_by) values (h.id, btrim(p_reason), v_actor)
    on conflict (hub_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now();
  else
    delete from lv.hub_suspensions where hub_id = h.id;
    if not found then return lv.err('lv_not_found', 'That Hub is not suspended.'); end if;
  end if;
  perform lv.audit(v_actor, h.id, case when p_suspend then 'hub.suspended' else 'hub.unsuspended' end, h.id::text);
  return jsonb_build_object('ok', true, 'suspended', p_suspend);
end;
$$;

create function lv.api_admin_account_suspend(p_account uuid, p_reason text, p_suspend boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
begin
  if v_denied is not null then return v_denied; end if;
  if not exists (select 1 from lv.accounts a where a.id = p_account) then return lv.err('lv_not_found', 'No such account.'); end if;
  if p_suspend then
    if p_account = v_actor then return lv.err('lv_conflict', 'You can''t suspend yourself.'); end if;
    if lv.is_platform_admin(p_account) then return lv.err('lv_conflict', 'Remove them from staff before suspending the account.'); end if;
    if btrim(coalesce(p_reason, '')) = '' or length(p_reason) > 500 then
      return lv.err('lv_invalid_input', 'A suspension needs a reason of up to 500 characters. The person sees it.');
    end if;
    insert into lv.account_suspensions (account_id, reason, suspended_by) values (p_account, btrim(p_reason), v_actor)
    on conflict (account_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now();
  else
    delete from lv.account_suspensions where account_id = p_account;
    if not found then return lv.err('lv_not_found', 'That account is not suspended.'); end if;
  end if;
  perform lv.audit(v_actor, null, case when p_suspend then 'account.suspended' else 'account.unsuspended' end, p_account::text);
  return jsonb_build_object('ok', true, 'suspended', p_suspend);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- One reports queue
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_admin_reports(p_status text, p_type text) returns jsonb
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

-- Hide (or show) a reported comment as staff; hiding marks its reports actioned. Nothing is deleted.
create function lv.api_admin_comment_hide(p_comment uuid, p_hidden boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  cm record;
begin
  if v_denied is not null then return v_denied; end if;
  select * into cm from lv.comments x where x.id = p_comment for update;
  if cm.id is null then return lv.err('lv_not_found', 'No such comment.'); end if;
  update lv.comments set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
                         hidden_by = case when p_hidden then v_actor end
   where id = cm.id;
  if p_hidden and exists (select 1 from lv.comment_reports r where r.comment_id = cm.id) then
    insert into lv.comment_report_reviews (comment_id, status, decided_by) values (cm.id, 'actioned', v_actor)
    on conflict (comment_id) do update set status = 'actioned', decided_by = excluded.decided_by, decided_at = now();
  end if;
  perform lv.audit(v_actor, cm.hub_id, case when p_hidden then 'comment.hidden_by_staff' else 'comment.shown_by_staff' end, cm.id::text);
  return jsonb_build_object('ok', true, 'hidden', p_hidden);
end;
$$;

create function lv.api_admin_comment_reports_dismiss(p_comment uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  v_hub uuid;
begin
  if v_denied is not null then return v_denied; end if;
  select cm.hub_id into v_hub from lv.comments cm where cm.id = p_comment
     and exists (select 1 from lv.comment_reports r where r.comment_id = cm.id)
     and not exists (select 1 from lv.comment_report_reviews v where v.comment_id = cm.id);
  if v_hub is null then return lv.err('lv_not_found', 'No open report for that comment.'); end if;
  insert into lv.comment_report_reviews (comment_id, status, decided_by) values (p_comment, 'dismissed', v_actor);
  perform lv.audit(v_actor, v_hub, 'comment_report.dismissed', p_comment::text);
  return jsonb_build_object('ok', true, 'status', 'dismissed');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Lookup
-- ---------------------------------------------------------------------------------------------------------
create function lv.admin_hub_row(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name, 'created_at', h.created_at,
           'visibility', h.visibility, 'membership_mode', h.membership_mode,
           'plan', lv.hub_plan(h.id) - 'entitlement_id',
           'member_count', (select count(*) from lv.hub_memberships m where m.hub_id = h.id and m.status = 'accepted'),
           'owner_account_id', h.owner_account_id, 'owner_name', (select a.display_name from lv.accounts a where a.id = h.owner_account_id),
           'suspension', (select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at) from lv.hub_suspensions s where s.hub_id = h.id),
           'open_reports', (select count(*) from lv.abuse_reports r join lv.campaigns c on c.id = r.campaign_id where c.hub_id = h.id and r.status = 'open'))
    from lv.hubs h where h.id = p_hub
$$;

create function lv.api_admin_hub_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_q text := nullif(lower(btrim(p_query)), '');
  v_like text;
begin
  if v_denied is not null then return v_denied; end if;
  if v_q is null or length(v_q) > 80 then return lv.err('lv_invalid_input', 'Search with 1 to 80 characters of a slug or name.'); end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object('ok', true, 'hubs', coalesce((
    select jsonb_agg(lv.admin_hub_row(x.id) order by x.exact desc, x.slug)
      from (select h.id, h.slug, (h.slug = v_q) as exact from lv.hubs h
             where h.kind = 'community' and (h.slug ilike v_like or h.display_name ilike v_like)
             order by (h.slug = v_q) desc, h.slug limit 25) x), '[]'::jsonb));
end;
$$;

create function lv.admin_account_row(p_account uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('account_id', a.id, 'display_name', a.display_name, 'created_at', a.created_at,
           'hubs_owned', (select count(*) from lv.hubs h where h.owner_account_id = a.id and h.kind = 'community'),
           'memberships', (select count(*) from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
                            where m.account_id = a.id and m.status = 'accepted' and h.kind = 'community'),
           'is_staff', lv.is_platform_admin(a.id),
           'suspension', (select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at) from lv.account_suspensions s where s.account_id = a.id))
    from lv.accounts a where a.id = p_account
$$;

-- Exact verified email only (no prefix search, so the console cannot be used to enumerate addresses). The email
-- itself is not echoed; staff reveal it deliberately with lv_admin_account_email_reveal.
create function lv.api_admin_account_search(p_email text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_email text := lower(btrim(p_email));
begin
  if v_denied is not null then return v_denied; end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return lv.err('lv_invalid_input', 'Search with a full email address.');
  end if;
  return jsonb_build_object('ok', true, 'accounts', coalesce((
    select jsonb_agg(lv.admin_account_row(x.account_id))
      from (select distinct i.account_id from lv.account_identities i
             where lower(i.email) = v_email and i.email_verified_at is not null) x), '[]'::jsonb));
end;
$$;

create function lv.api_admin_account_email_reveal(p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  if not exists (select 1 from lv.accounts a where a.id = p_account) then return lv.err('lv_not_found', 'No such account.'); end if;
  perform lv.audit(lv.current_account_id(), null, 'admin.email_revealed', p_account::text);
  return jsonb_build_object('ok', true, 'account_id', p_account, 'emails', coalesce((
    select jsonb_agg(distinct i.email) from lv.account_identities i where i.account_id = p_account and i.email_verified_at is not null), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Audit viewer
-- ---------------------------------------------------------------------------------------------------------
create function lv.staff_action(p_action text) returns boolean
language sql immutable set search_path = ''
as $$ select p_action like 'staff.%' or p_action like 'admin.%' or p_action like 'platform_admin.%'
          or p_action in ('hub.suspended', 'hub.unsuspended', 'account.suspended', 'account.unsuspended',
                          'campaign.blocked', 'campaign.unblocked', 'discover.approved', 'discover.rejected',
                          'abuse.dismissed', 'comment.hidden_by_staff', 'comment.shown_by_staff', 'comment_report.dismissed') $$;

-- Recent actions: actor display name, action, target, time. Never the detail (it can hold reasons and ids).
create function lv.api_admin_audit(p_scope text, p_action text, p_actor uuid, p_limit int, p_before bigint) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_scope text := coalesce(nullif(p_scope, ''), 'staff');
  v_action text := nullif(btrim(p_action), '');
begin
  if v_denied is not null then return v_denied; end if;
  if v_scope not in ('staff', 'all') or (v_action is not null and length(v_action) > 60) then
    return lv.err('lv_invalid_input', 'Unknown scope or filter.');
  end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'occurred_at', e.occurred_at, 'actor_account_id', e.actor_account_id,
                                        'actor_name', a.display_name, 'action', e.action, 'target', e.target,
                                        'hub_slug', h.slug) order by e.id desc)
      from (select * from lv.audit_events x
             where (v_scope = 'all' or lv.staff_action(x.action))
               and (v_action is null or x.action like replace(replace(v_action, '%', ''), '_', '\_') || '%')
               and (p_actor is null or x.actor_account_id = p_actor)
               and (p_before is null or x.id < p_before)
             order by x.id desc limit greatest(least(coalesce(p_limit, 100), 500), 1)) e
      left join lv.accounts a on a.id = e.actor_account_id
      left join lv.hubs h on h.id = e.hub_id), '[]'::jsonb));
end;
$$;

-- Overview (000019) plus staff, suspensions and comment reports.
create or replace function lv.api_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true,
    'waitlist', jsonb_build_object(
      'seats_total', lv.waitlist_seats(),
      'seats_taken', least((select c.admitted_issued from lv.waitlist_counters c where c.id), lv.waitlist_seats()),
      'admitted', (select count(*) from lv.waitlist_entries w where w.status = 'admitted'),
      'waitlisted', (select count(*) from lv.waitlist_entries w where w.status = 'waitlisted'),
      'with_contact', (select count(*) from lv.waitlist_entries w where w.contact_email is not null)),
    'reports_open', (select count(*) from lv.abuse_reports r where r.status = 'open'),
    'comment_reports_open', (select count(distinct r.comment_id) from lv.comment_reports r
                              where not exists (select 1 from lv.comment_report_reviews v where v.comment_id = r.comment_id)),
    'campaigns_blocked', (select count(*) from lv.campaigns c where c.blocked_at is not null),
    'hubs_suspended', (select count(*) from lv.hub_suspensions),
    'accounts_suspended', (select count(*) from lv.account_suspensions),
    'staff', (select count(*) from lv.platform_admins a where a.revoked_at is null),
    'discover_pending', (select count(*) from lv.discover_applications d where d.status = 'submitted'),
    'billing', jsonb_build_object(
      'provider_ready', coalesce((lv.policy_json('billing.provider_ready'))::boolean, false),
      'events_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days'),
      'rejected_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days' and b.outcome = 'rejected')),
    'email', (select jsonb_build_object(
      'queued', count(*) filter (where o.status in ('queued', 'sending')),
      'sent', count(*) filter (where o.status = 'sent'),
      'failed', count(*) filter (where o.status = 'failed')) from lv.email_outbox o));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_admin_staff_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_staff_list(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_staff_add(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_staff_add(p_email); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_staff_revoke(p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_staff_revoke(p_account); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_hub_suspend(p_hub uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_hub_suspend(p_hub, p_reason, true); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_hub_unsuspend(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_hub_suspend(p_hub, null, false); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_account_suspend(p_account uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_account_suspend(p_account, p_reason, true); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_account_unsuspend(p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_account_suspend(p_account, null, false); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_reports(p_status text default 'open', p_type text default 'all') returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_reports(p_status, p_type); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_comment_hide(p_comment uuid, p_hidden boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_comment_hide(p_comment, p_hidden); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_comment_reports_dismiss(p_comment uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_comment_reports_dismiss(p_comment); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_hub_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_hub_search(p_query); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_account_search(p_email text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_account_search(p_email); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_account_email_reveal(p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_account_email_reveal(p_account); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_audit(p_scope text default 'staff', p_action text default null, p_actor uuid default null,
                                      p_limit int default 100, p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_audit(p_scope, p_action, p_actor, p_limit, p_before); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- Grants: explicit, authenticated only, never PUBLIC or anon (LC-05). Replaced wrappers keep their grants.
-- ---------------------------------------------------------------------------------------------------------
revoke all on function lv_api.lv_admin_staff_list(), lv_api.lv_admin_staff_add(text), lv_api.lv_admin_staff_revoke(uuid),
  lv_api.lv_admin_hub_suspend(uuid, text), lv_api.lv_admin_hub_unsuspend(uuid), lv_api.lv_admin_account_suspend(uuid, text),
  lv_api.lv_admin_account_unsuspend(uuid), lv_api.lv_admin_reports(text, text), lv_api.lv_admin_comment_hide(uuid, boolean),
  lv_api.lv_admin_comment_reports_dismiss(uuid), lv_api.lv_admin_hub_search(text), lv_api.lv_admin_account_search(text),
  lv_api.lv_admin_account_email_reveal(uuid), lv_api.lv_admin_audit(text, text, uuid, int, bigint) from public;

revoke all on all tables in schema lv from public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema lv from anon';
    execute 'revoke all on all functions in schema lv from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema lv from authenticated';
    execute 'revoke all on all functions in schema lv from authenticated';
    execute 'grant execute on function lv_api.lv_admin_staff_list(), lv_api.lv_admin_staff_add(text), lv_api.lv_admin_staff_revoke(uuid),
      lv_api.lv_admin_hub_suspend(uuid, text), lv_api.lv_admin_hub_unsuspend(uuid), lv_api.lv_admin_account_suspend(uuid, text),
      lv_api.lv_admin_account_unsuspend(uuid), lv_api.lv_admin_reports(text, text), lv_api.lv_admin_comment_hide(uuid, boolean),
      lv_api.lv_admin_comment_reports_dismiss(uuid), lv_api.lv_admin_hub_search(text), lv_api.lv_admin_account_search(text),
      lv_api.lv_admin_account_email_reveal(uuid), lv_api.lv_admin_audit(text, text, uuid, int, bigint) to authenticated';
  end if;
end $$;

commit;
