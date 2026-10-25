-- Rollback for 20261024000800_v2_identity_first.sql. NOT a migration: never applied automatically.
-- Effect: restores the Supabase-user identity model and Hub names from the legacy organization table. Hubs created with their own slug
-- (no organization row) cannot be restored and make this rollback fail on purpose: delete or migrate them first. Platform administrator
-- records and the identity allow-list are discarded.

begin;

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
      'hub_id', h.id, 'slug', lower(o.slug), 'name', coalesce(h.display_name, o.name), 'status', 'accepted',
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
      'hub_id', h.id, 'slug', lower(o.slug), 'name', coalesce(h.display_name, o.name), 'status', m.status)
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

create or replace function public.lv_hub_public(slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_acc uuid := lv_private.current_account_id(); v_status text; v_viewer text; v_count bigint;
begin
  if slug is null or length(slug) < 2 or length(slug) > 40 then
    return lv_private.fail('lv_invalid_input', 'Check the Hub address.');
  end if;
  select h.id, h.visibility, h.membership_mode, coalesce(h.display_name, o.name) as name, o.slug into r
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

create or replace function public.lv_hub_settings_update(hub_id uuid, name text default null, visibility text default null, membership_mode text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_name text := lv_private.clean_text(name, 80); h record; v_changes jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.settings.edit') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if (name is null and visibility is null and membership_mode is null)
     or (name is not null and v_name is null)
     or (visibility is not null and visibility not in ('public', 'private'))
     or (membership_mode is not null and membership_mode not in ('open', 'approval', 'invite_only')) then
    return lv_private.fail('lv_invalid_input', 'Check the settings.');
  end if;
  perform 1 from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id for update;
  select x.display_name, x.visibility, x.membership_mode into h from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id;
  if v_name is not null and v_name is distinct from h.display_name then v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('from', h.display_name, 'to', v_name)); end if;
  if visibility is not null and visibility <> h.visibility then v_changes := v_changes || jsonb_build_object('visibility', jsonb_build_object('from', h.visibility, 'to', visibility)); end if;
  if membership_mode is not null and membership_mode <> h.membership_mode then v_changes := v_changes || jsonb_build_object('membership_mode', jsonb_build_object('from', h.membership_mode, 'to', membership_mode)); end if;
  if v_changes <> '{}'::jsonb then
    update lv_private.hubs x set display_name = coalesce(v_name, x.display_name),
      visibility = coalesce(lv_hub_settings_update.visibility, x.visibility),
      membership_mode = coalesce(lv_hub_settings_update.membership_mode, x.membership_mode)
    where x.id = lv_hub_settings_update.hub_id;
    insert into lv_private.hub_settings_events (hub_id, actor_account_id, changes) values (hub_id, v_caller, v_changes);
  end if;
  return lv_private.ok((select jsonb_build_object('hub_id', x.id, 'name', coalesce(x.display_name, o.name), 'visibility', x.visibility, 'membership_mode', x.membership_mode)
                        from lv_private.hubs x join public.orgs o on o.id = x.id where x.id = lv_hub_settings_update.hub_id));
end;
$$;

create or replace function public.lv_campaign_resolve(code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_caller uuid := lv_private.current_account_id();
begin
  if code is null or length(btrim(code)) < 1 or length(code) > 64 then return lv_private.fail('lv_invalid_input', 'Enter a code.'); end if;
  select c.id, c.title, c.anonymous, c.state, c.closes_at, h.id as hub_id, h.visibility, o.slug into r
  from lv_private.campaigns c join lv_private.hubs h on h.id = c.hub_id join public.orgs o on o.id = h.id
  where c.join_code = upper(btrim(code)) and c.state in ('active', 'closed', 'expired');
  if not found or (r.visibility = 'private' and (v_caller is null or lv_private.membership_status(r.hub_id, v_caller) is distinct from 'accepted')) then
    return lv_private.fail('lv_not_found', 'No Campaign matches that code.');
  end if;
  return lv_private.ok(jsonb_build_object('campaign_id', r.id, 'hub_id', r.hub_id, 'hub_slug', lower(r.slug), 'title', r.title,
    'state', lv_private.campaign_effective_state(r.state, r.closes_at), 'anonymous', r.anonymous, 'requires_account', true));
end;
$$;

drop trigger if exists account_identities_fill on lv_private.account_identities;
drop function if exists lv_private.fill_identity_columns();
drop function if exists lv_private.grant_platform_admin(uuid, text, text);
drop function if exists lv_private.revoke_platform_admin(uuid, text, text);
drop function if exists lv_private.is_platform_admin(uuid);
drop table if exists lv_private.platform_admin_events;
drop table if exists lv_private.platform_admins;
drop function if exists lv_private.hub_slug(uuid);
drop function if exists lv_private.hub_name(uuid);
drop function if exists lv_private.caller_identity();

drop index if exists lv_private.hubs_slug_idx;
alter table lv_private.hubs drop column if exists slug;
alter table lv_private.hubs add constraint hubs_id_fkey foreign key (id) references public.orgs (id) on delete restrict;

delete from lv_private.account_identities where auth_user_id is null;
drop index if exists lv_private.account_identities_issuer_subject_idx;
alter table lv_private.account_identities drop constraint if exists account_identities_auth_user_id_key;
alter table lv_private.account_identities drop column if exists email_verified_at, drop column if exists issuer, drop column if exists subject;
alter table lv_private.account_identities drop constraint if exists account_identities_pkey;
alter table lv_private.account_identities drop column if exists id;
alter table lv_private.account_identities alter column auth_user_id set not null;
alter table lv_private.account_identities add primary key (auth_user_id);
alter table lv_private.account_identities add foreign key (auth_user_id) references auth.users (id) on delete cascade;
delete from lv_private.policy where key = 'identity.trusted_issuers';

create or replace function lv_private.current_account_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select i.account_id from lv_private.account_identities i where i.auth_user_id = auth.uid() $$;

-- Account of the signed-in identity, creating it on first use. The account id is the auth user id when free, so
-- legacy users keep their existing id. Never matches or merges on email.
create or replace function lv_private.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_acc uuid;
  v_name text;
begin
  if v_uid is null then return null; end if;
  select i.account_id into v_acc from lv_private.account_identities i where i.auth_user_id = v_uid;
  if v_acc is not null then return v_acc; end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_account:' || v_uid::text, 0));
  select i.account_id into v_acc from lv_private.account_identities i where i.auth_user_id = v_uid;
  if v_acc is not null then return v_acc; end if;

  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(split_part(p.email, '@', 1)), ''))
    into v_name from public.profiles p where p.id = v_uid;
  v_name := coalesce(v_name, 'Member');

  if exists (select 1 from lv_private.accounts a where a.id = v_uid) then
    insert into lv_private.accounts (display_name) values (v_name) returning id into v_acc;
  else
    insert into lv_private.accounts (id, display_name) values (v_uid, v_name) returning id into v_acc;
  end if;
  insert into lv_private.account_identities (auth_user_id, account_id, provider) values (v_uid, v_acc, 'supabase_auth');
  return v_acc;
end;
$$;

create or replace function lv_private.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_acc uuid;
  v_name text;
begin
  if v_uid is null then return null; end if;
  select i.account_id into v_acc from lv_private.account_identities i where i.auth_user_id = v_uid;
  if v_acc is not null then return v_acc; end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_account:' || v_uid::text, 0));
  select i.account_id into v_acc from lv_private.account_identities i where i.auth_user_id = v_uid;
  if v_acc is not null then return v_acc; end if;

  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(split_part(p.email, '@', 1)), ''))
    into v_name from public.profiles p where p.id = v_uid;
  v_name := coalesce(v_name, 'Member');

  if exists (select 1 from lv_private.accounts a where a.id = v_uid) then
    insert into lv_private.accounts (display_name) values (v_name) returning id into v_acc;
  else
    insert into lv_private.accounts (id, display_name) values (v_uid, v_name) returning id into v_acc;
  end if;
  insert into lv_private.account_identities (auth_user_id, account_id, provider) values (v_uid, v_acc, 'supabase_auth');
  return v_acc;
end;
$$;

create or replace function public.lv_join_hub(hub_id uuid, invite_code text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record; v_acc uuid; v_status text; v_new text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  -- Code redemption does not exist yet. A supplied code is refused loudly instead of being ignored, so a caller
  -- never believes a code worked. Account-bound invitations (status 'invited') are a different mechanism and
  -- are accepted by calling this function WITHOUT a code. Checked before any lookup or write: no side effects.
  if invite_code is not null and btrim(invite_code) <> '' then
    return lv_private.fail('lv_policy_undecided', 'Invite codes are not supported yet.',
      jsonb_build_object('reason', 'invite_code_unsupported'));
  end if;
  select h.id, h.membership_mode into r from lv_private.hubs h where h.id = lv_join_hub.hub_id;
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  v_acc := lv_private.ensure_account();
  perform pg_advisory_xact_lock(hashtextextended('lv_join:' || r.id::text || v_acc::text, 0));
  v_status := lv_private.membership_status(r.id, v_acc);

  if v_status in ('accepted', 'pending') then
    return lv_private.ok(jsonb_build_object('status', v_status));
  elsif v_status in ('suspended', 'removed') then
    return lv_private.fail('lv_forbidden', 'You cannot join this Hub.');
  elsif v_status = 'invited' then
    v_new := 'accepted';
  elsif r.membership_mode = 'open' then
    v_new := 'accepted';
  elsif r.membership_mode = 'approval' then
    v_new := 'pending';
  else
    -- invite_only without an invitation. Invite codes are not implemented yet (provisional).
    return lv_private.fail('lv_forbidden', 'This Hub is invite only.');
  end if;

  insert into lv_private.hub_memberships (hub_id, account_id, status, joined_at)
  values (r.id, v_acc, v_new, case when v_new = 'accepted' then now() end)
  on conflict on constraint hub_memberships_pkey do update
    set status = excluded.status,
        joined_at = case when excluded.status = 'accepted' then now() else lv_private.hub_memberships.joined_at end;
  return lv_private.ok(jsonb_build_object('status', v_new));
end;
$$;

create trigger profiles_sync_v2 after insert on public.profiles for each row execute function lv_private.sync_profile();

commit;
