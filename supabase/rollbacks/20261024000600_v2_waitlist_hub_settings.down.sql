-- Rollback for 20261024000600_v2_waitlist_hub_settings.sql. NOT a migration: never applied automatically.
-- Run deliberately, in one transaction, BEFORE rolling back migrations 5 to 1.
--
-- Effect: DELETES the waitlist (email addresses) and the throttle ledger, the settings audit trail and every Hub display
-- name; restores the previous Hub name behaviour (the legacy organization name) in lv_hub_public and lv_my_context.
-- Export lv_private.waitlist first if the sign-ups matter. No legacy table is touched.

begin;

drop function if exists public.lv_waitlist_join(text, text);
drop function if exists public.lv_hub_settings_update(uuid, text, text, text);

create or replace function public.lv_hub_public(slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_acc uuid := lv_private.current_account_id(); v_status text; v_viewer text; v_count bigint;
begin
  if slug is null or length(slug) < 2 or length(slug) > 40 then
    return lv_private.fail('lv_invalid_input', 'Check the Hub address.');
  end if;
  select h.id, h.visibility, h.membership_mode, o.name, o.slug into r
  from lv_private.hubs h join public.orgs o on o.id = h.id
  where lower(o.slug) = lower(lv_hub_public.slug);
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  v_status := case when v_acc is null then null else lv_private.membership_status(r.id, v_acc) end;
  v_viewer := case when v_status in ('accepted', 'pending', 'invited', 'suspended') then v_status else 'none' end;
  select count(*) into v_count from lv_private.hub_memberships m where m.hub_id = r.id and m.status = 'accepted';

  return lv_private.ok(jsonb_build_object(
    'hub_id', r.id, 'slug', lower(r.slug), 'name', r.name,
    'visibility', r.visibility, 'membership_mode', r.membership_mode,
    'member_count', case when r.visibility = 'public' or v_viewer = 'accepted' then to_jsonb(v_count) else 'null'::jsonb end,
    'viewer', jsonb_build_object('status', v_viewer,
      'can_join', (v_viewer = 'none' and r.membership_mode <> 'invite_only') or v_viewer = 'invited')));
end;
$$;

create or replace function public.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_acc uuid; v_name text; v_mem jsonb; v_pen jsonb;
begin
  if auth.uid() is null then
    return lv_private.fail('lv_unauthenticated', 'Sign in to continue.');
  end if;
  v_acc := lv_private.ensure_account();
  select a.display_name into v_name from lv_private.accounts a where a.id = v_acc;

  select coalesce(jsonb_agg(jsonb_build_object(
      'hub_id', h.id, 'slug', lower(o.slug), 'name', o.name, 'status', 'accepted',
      'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon', r.icon) order by r.name, r.id)
                         from lv_private.role_assignments ra join lv_private.roles r on r.id = ra.role_id
                         where ra.hub_id = h.id and ra.account_id = m.account_id), '[]'::jsonb),
      'capabilities', to_jsonb(lv_private.held_capabilities(h.id, m.account_id)),
      'is_owner', h.owner_account_id = m.account_id)
      order by o.name, h.id), '[]'::jsonb)
    into v_mem
  from lv_private.hub_memberships m
  join lv_private.hubs h on h.id = m.hub_id
  join public.orgs o on o.id = h.id
  where m.account_id = v_acc and m.status = 'accepted';

  select coalesce(jsonb_agg(jsonb_build_object(
      'hub_id', h.id, 'slug', lower(o.slug), 'name', o.name, 'status', m.status)
      order by o.name, h.id), '[]'::jsonb)
    into v_pen
  from lv_private.hub_memberships m
  join lv_private.hubs h on h.id = m.hub_id
  join public.orgs o on o.id = h.id
  where m.account_id = v_acc and m.status in ('pending', 'invited');

  return lv_private.ok(jsonb_build_object(
    'account', jsonb_build_object('id', v_acc, 'display_name', v_name),
    'memberships', v_mem, 'pending', v_pen));
end;
$$;

alter table lv_private.hubs drop column if exists display_name;
drop table if exists lv_private.hub_settings_events;
drop table if exists lv_private.waitlist_attempts;
drop table if exists lv_private.waitlist;
drop table if exists lv_private.secrets;
delete from lv_private.policy where key = 'waitlist.open';
drop function if exists lv_private.clean_text(text, int);

commit;
