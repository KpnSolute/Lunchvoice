-- LunchVoice v2 canonical 24: the public LunchVoice API (Team family), webhooks and the official Discord bot.
-- Spec: docs/v2/API_AND_DISCORD_PLAN.md (founder direction 2026-11-08), privacy decision D-01.
--
-- Nothing here weakens anonymity, suppression, guest rules or entitlements, and nothing special-cases a customer.
--
-- API keys
--   * A key belongs to one Hub and ACTS AS THE PERSON WHO CREATED IT, narrowed by its scopes. Every operation runs
--     the same lv_api function the app uses, under that person's identity (lv.integration_act_as sets a
--     transaction-local LunchVoice session claim with iat 0, so anything that needs a recent sign-in fails closed).
--     So a key can never do more than its creator may do in that Hub, and stops the moment the creator loses
--     api.manage, leaves the Hub or is deleted.
--   * Stored as a SHA-256 hash (the Edge Function hashes the presented key; the database never sees it on use).
--     The prefix is shown; the secret is shown once at creation. Revocable; last-used time; per-key rate limit.
--   * Team family only (lv.plan_limits 'api.enabled'). While the Hub has no active Team-family entitlement, or the
--     Hub or the creator is suspended (hook lv.integration_blocked), keys answer lv_entitlement_required /
--     lv_forbidden and webhooks pause. Nothing is deleted.
--   * Results come only from lv_api.lv_analytics_overview (the strict suppression engine); the API strips free-text
--     lists, so no individual answer ever leaves through the API, and the overview carries no identities.
--
-- Webhooks
--   * Endpoints per Hub (https only, no IP literals or internal names), per-endpoint secret shown once,
--     events campaign.published, campaign.closed, campaign.responses_milestone (released counts only: anonymous
--     Campaigns never emit milestones, because their counts are not released while live).
--   * Outbox with retries and exponential backoff; the payload is emptied once delivered or failed; the delivery
--     log holds status codes and timings, never bodies. Service role only.
--
-- Discord (D-01)
--   * Account link: one-time 10-minute code from /lunchvoice link, confirmed signed in at /connect/discord. Stores
--     the Discord user id as a linked handle (never an identity key), the consent version and whether the person
--     lets servers use role facts. Unlink from Discord or Account Settings; account deletion cascades the link,
--     and a trigger queues removal of every role the bot granted.
--   * Server <-> Hub connection: /lunchvoice connect by a server admin, confirmed in LunchVoice by a Hub manager.
--   * Anonymous Campaigns are answered only in the LunchVoice player (enforced here: lv.discord_interaction refuses
--     an in-Discord answer for an anonymous Campaign). Identified one-question polls may be answered with buttons,
--     recorded through lv_api.lv_submit_response as the linked person (one answer rule unchanged).
--   * Role rules per server: waitlist Founding member, member of a Hub the configuring person manages, has a Team
--     Hub. Facts are computed only for linked people who consented, and only the facts a rule asks about.
--   * Per-user and per-server command rate limits; staff can disable a server (lv_admin_discord_guild_disable).

begin;

-- =========================================================================================================
-- Entitlement map, policies, capability, reserved routes
-- =========================================================================================================
insert into lv.plan_limits (family, key, value, note) values
  ('team', 'api.enabled', 'true', 'API and Discord plan 2026-11-08: the LunchVoice API and webhooks are Team family only.'),
  ('team', 'api.rate_per_minute', '60', 'Requests per minute per API key.'),
  ('team', 'api.max_keys', '10', 'Active API keys per Hub.'),
  ('team', 'webhooks.max_endpoints', '5', 'Webhook endpoints per Hub.');

insert into lv.policy (key, value, note) values
  ('discord.user_commands_per_minute', '10'::jsonb, 'Discord bot: commands and button clicks one Discord user may make per minute.'),
  ('discord.guild_commands_per_minute', '60'::jsonb, 'Discord bot: commands and button clicks per Discord server per minute.'),
  ('discord.code_minutes', '10'::jsonb, 'Lifetime of a one-time Discord link or connect code.'),
  ('discord.consent_version', '"2026-11-08"'::jsonb, 'Version of the Discord link notice a person accepts.'),
  ('webhook.max_attempts', '8'::jsonb, 'Delivery attempts per webhook event before it is marked failed.');

insert into lv.capabilities (capability, cap_group, label) values
  ('api.manage', 'api', 'Manage API keys, webhooks and Discord');
insert into lv.role_capabilities (role_id, capability)
select r.id, 'api.manage' from lv.roles r where r.is_owner
on conflict do nothing;

insert into lv.reserved_slugs (slug, reason) values
  ('developers', 'ui route (000024)'), ('connect', 'ui route (000024)'), ('webhooks', 'ui route (000024)')
on conflict (slug) do nothing;

-- =========================================================================================================
-- Shared helpers
-- =========================================================================================================

-- Suspension hook. The staff panel (000023, which precedes this migration in the canonical chain) owns
-- suspensions; a suspended Hub's keys, webhooks and Discord connections stop, as do a suspended account's.
create function lv.integration_blocked(p_hub uuid, p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select lv.hub_suspended(p_hub) or lv.account_suspended(p_account) $$;

-- Fixed-window counters for API keys and Discord commands.
create table lv.integration_rate_windows (
  scope text not null check (scope in ('api_key', 'discord_user', 'discord_guild')),
  key text not null check (length(key) <= 80),
  window_start timestamptz not null,
  n int not null default 0,
  primary key (scope, key, window_start)
);
alter table lv.integration_rate_windows enable row level security;

-- NULL when allowed, otherwise the seconds until the window resets.
create function lv.integration_rate_hit(p_scope text, p_key text, p_limit int) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('minute', now());
  v_n int;
begin
  delete from lv.integration_rate_windows w where w.scope = p_scope and w.key = p_key and w.window_start < v_start;
  insert into lv.integration_rate_windows as w (scope, key, window_start, n) values (p_scope, p_key, v_start, 1)
  on conflict (scope, key, window_start) do update set n = w.n + 1
  returning n into v_n;
  if v_n > greatest(coalesce(p_limit, 0), 0) then
    return greatest(1, ceil(extract(epoch from (v_start + interval '1 minute' - now())))::int);
  end if;
  return null;
end;
$$;

-- Act as an account for the rest of the current transaction: a LunchVoice session claim for its (issuer, subject),
-- with iat 0 so lv.require_recent_auth always refuses. Returns the previous claims so the caller restores them.
-- Never granted to any API role; only the service-role entry points below call it.
create function lv.integration_act_as(p_account uuid, p_via text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_prev text := current_setting('request.jwt.claims', true);
  i record;
begin
  select x.identity_issuer, x.identity_subject into i
    from lv.account_identities x where x.account_id = p_account order by x.created_at, x.id limit 1;
  if i.identity_subject is null then
    perform lv.fail('lv_forbidden', 'The account behind this request no longer exists.');
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'iss', i.identity_issuer, 'sub', i.identity_subject, 'aud', 'authenticated', 'role', 'authenticated',
    'session_kind', 'lunchvoice', 'iat', 0, 'via', p_via)::text, true);
  return coalesce(v_prev, '');
end;
$$;

create function lv.integration_restore(p_prev text) returns void
language sql volatile security definer set search_path = ''
as $$ select set_config('request.jwt.claims', coalesce(p_prev, ''), true) $$;

-- Team family gate for the API and webhooks.
create function lv.api_enabled(p_hub uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select lv.hub_kind(p_hub) = 'community' and coalesce(lv.hub_limit(p_hub, 'api.enabled') = 'true'::jsonb, false) $$;

-- Who may manage the API of a Hub: the Owner or a holder of api.manage (the Owner role holds every capability).
create function lv.api_manager(p_account uuid, p_hub uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_account is not null and lv.hub_kind(p_hub) = 'community'
             and (lv.is_owner(p_account, p_hub) or lv.has_capability(p_account, p_hub, 'api.manage')) $$;

create function lv.random_hex(p_bytes int) returns text
language sql volatile set search_path = ''
as $$ select encode(lv.random_bytes(p_bytes), 'hex') $$;

-- =========================================================================================================
-- API keys
-- =========================================================================================================
create table lv.api_keys (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  -- The key acts as this person; deleting the account deletes its keys.
  created_by uuid not null references lv.accounts (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  prefix text not null check (prefix ~ '^lvk_[0-9a-f]{12}$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) between 1 and 5
    and scopes <@ array['campaigns:read', 'campaigns:write', 'invites:write', 'results:read', 'webhooks:manage']::text[]),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references lv.accounts (id) on delete set null,
  constraint api_keys_prefix_key unique (prefix),
  constraint api_keys_hash_key unique (secret_hash)
);
create index api_keys_hub_idx on lv.api_keys (hub_id);
alter table lv.api_keys enable row level security;

create function lv.api_scope_catalog() returns jsonb
language sql immutable set search_path = ''
as $$ select jsonb_build_array(
  jsonb_build_object('scope', 'campaigns:read', 'label', 'Read Campaigns and their questions'),
  jsonb_build_object('scope', 'campaigns:write', 'label', 'Create drafts, add questions, schedule, publish and close'),
  jsonb_build_object('scope', 'invites:write', 'label', 'Create Hub and Campaign invites'),
  jsonb_build_object('scope', 'results:read', 'label', 'Read released aggregate results'),
  jsonb_build_object('scope', 'webhooks:manage', 'label', 'Manage webhook endpoints')) $$;

create function lv.api_key_json(k lv.api_keys) returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('key_id', k.id, 'name', k.name, 'prefix', k.prefix, 'scopes', to_jsonb(k.scopes),
  'created_at', k.created_at, 'last_used_at', k.last_used_at, 'revoked_at', k.revoked_at,
  'created_by_name', (select a.display_name from lv.accounts a where a.id = k.created_by),
  'active', k.revoked_at is null) $$;

create function lv.api_keys_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null or lv.hub_kind(p_hub) <> 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.api_manager(v_account, p_hub) then return lv.err('lv_forbidden', 'Managing the API requires api.manage.'); end if;
  return jsonb_build_object('ok', true,
    'enabled', lv.api_enabled(p_hub),
    'rate_per_minute', (lv.hub_limit(p_hub, 'api.rate_per_minute'))::int,
    'max_keys', (lv.hub_limit(p_hub, 'api.max_keys'))::int,
    'scopes', lv.api_scope_catalog(),
    'keys', coalesce((select jsonb_agg(lv.api_key_json(k) order by k.revoked_at nulls first, k.created_at desc)
                        from lv.api_keys k where k.hub_id = p_hub), '[]'::jsonb));
end;
$$;

create function lv.api_key_create(p_hub uuid, p_name text, p_scopes text[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_prefix text;
  v_secret text;
  v_max int;
  v_used int;
  k lv.api_keys;
  v_scopes text[];
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null or lv.hub_kind(p_hub) <> 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.api_manager(v_account, p_hub) then return lv.err('lv_forbidden', 'Managing the API requires api.manage.'); end if;
  if not lv.api_enabled(p_hub) then
    return lv.err_x('lv_entitlement_required', 'The LunchVoice API is part of the Team plan.', jsonb_build_object('product', 'team_hub'));
  end if;
  if lv.integration_blocked(p_hub, v_account) then return lv.err('lv_forbidden', 'This Hub is suspended.'); end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 60 then return lv.err('lv_invalid_input', 'Give the key a name of up to 60 characters.'); end if;
  select array_agg(distinct s order by s) into v_scopes from unnest(coalesce(p_scopes, '{}'::text[])) s;
  if v_scopes is null or not (v_scopes <@ array['campaigns:read', 'campaigns:write', 'invites:write', 'results:read', 'webhooks:manage']::text[]) then
    return lv.err('lv_invalid_input', 'Choose one or more known scopes.');
  end if;
  v_max := coalesce((lv.hub_limit(p_hub, 'api.max_keys'))::int, 0);
  perform pg_advisory_xact_lock(hashtextextended('lv_api_keys:' || p_hub::text, 0));
  select count(*) into v_used from lv.api_keys x where x.hub_id = p_hub and x.revoked_at is null;
  if v_used >= v_max then
    return lv.err_x('lv_limit_reached', 'This Hub has reached its active API key limit. Revoke one first.',
                    jsonb_build_object('limit', v_max, 'used', v_used));
  end if;

  v_prefix := 'lvk_' || lv.random_hex(6);
  v_secret := v_prefix || '_' || lv.random_hex(24);
  insert into lv.api_keys (hub_id, created_by, name, prefix, secret_hash, scopes)
  values (p_hub, v_account, btrim(p_name), v_prefix, lv.sha256_hex(v_secret), v_scopes)
  returning * into k;
  perform lv.audit(v_account, p_hub, 'api_key.created', k.id::text, jsonb_build_object('scopes', to_jsonb(v_scopes)));
  return jsonb_build_object('ok', true, 'key', lv.api_key_json(k), 'secret', v_secret, 'shown_once', true);
end;
$$;

create function lv.api_key_revoke(p_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  k lv.api_keys;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into k from lv.api_keys x where x.id = p_key;
  if k.id is null or lv.membership_of(v_account, k.hub_id) is null then return lv.err('lv_not_found', 'No such key.'); end if;
  if not lv.api_manager(v_account, k.hub_id) then return lv.err('lv_forbidden', 'Managing the API requires api.manage.'); end if;
  if k.revoked_at is null then
    update lv.api_keys set revoked_at = now(), revoked_by = v_account where id = k.id returning * into k;
    perform lv.audit(v_account, k.hub_id, 'api_key.revoked', k.id::text);
  end if;
  return jsonb_build_object('ok', true, 'key', lv.api_key_json(k));
end;
$$;

-- The scope each API operation needs. NULL = unknown operation.
create function lv.api_op_scope(p_op text) returns text
language sql immutable set search_path = ''
as $$ select case p_op
  when 'campaigns.list' then 'campaigns:read'
  when 'campaigns.get' then 'campaigns:read'
  when 'campaigns.create' then 'campaigns:write'
  when 'campaigns.update' then 'campaigns:write'
  when 'campaigns.questions.add' then 'campaigns:write'
  when 'campaigns.schedule' then 'campaigns:write'
  when 'campaigns.publish' then 'campaigns:write'
  when 'campaigns.close' then 'campaigns:write'
  when 'invites.create' then 'invites:write'
  when 'campaigns.invites.create' then 'invites:write'
  when 'results.get' then 'results:read'
  when 'webhooks.list' then 'webhooks:manage'
  when 'webhooks.create' then 'webhooks:manage'
  when 'webhooks.update' then 'webhooks:manage'
  when 'webhooks.delete' then 'webhooks:manage'
  when 'hub.get' then 'campaigns:read'
end $$;

-- Results for the API: the strict overview, with every free-text list removed (no individual answer leaves).
create function lv.api_results_public(p_overview jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when not coalesce((p_overview->>'ok')::boolean, false) then p_overview else
    (p_overview - 'questions') || jsonb_build_object('questions', coalesce((
      select jsonb_agg(case when q->>'kind' = 'text'
                            then (q - 'result') || jsonb_build_object('result', jsonb_build_object(
                                   'ok', coalesce(q #> '{result,ok}', 'false'::jsonb), 'kind', 'text', 'texts_omitted', true,
                                   'withheld', coalesce(q #> '{result,texts_withheld}', q #> '{result,withheld}', 'true'::jsonb)))
                            else q end order by (q->>'position')::int)
        from jsonb_array_elements(p_overview->'questions') q), '[]'::jsonb))
  end
$$;

-- The single entry point of the `api` Edge Function (service role only). p_key_hash is the SHA-256 hex of the
-- presented key. Authenticates, checks the plan, suspension, the creator's standing and the scope, applies the
-- rate limit, then runs the operation as the key's creator, confined to the key's Hub.
create function lv.api_key_call(p_key_hash text, p_op text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  k lv.api_keys;
  v_scope text := lv.api_op_scope(p_op);
  v_retry int;
  v_prev text;
  v_out jsonb;
  v_campaign uuid;
  v_endpoint uuid;
  a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then return lv.err('lv_unauthenticated', 'Invalid API key.'); end if;
  select * into k from lv.api_keys x where x.secret_hash = p_key_hash and x.revoked_at is null;
  if k.id is null then return lv.err('lv_unauthenticated', 'Invalid API key.'); end if;
  if v_scope is null then return lv.err('lv_not_found', 'No such operation.'); end if;
  if not lv.api_enabled(k.hub_id) then
    return lv.err_x('lv_entitlement_required', 'The LunchVoice API needs an active Team plan on this Hub. Your data and keys are kept.',
                    jsonb_build_object('product', 'team_hub'));
  end if;
  if lv.integration_blocked(k.hub_id, k.created_by) then return lv.err('lv_forbidden', 'This Hub is suspended.'); end if;
  if not lv.api_manager(k.created_by, k.hub_id) then
    return lv.err('lv_forbidden', 'The person who created this key no longer manages the API of this Hub.');
  end if;
  if not (v_scope = any(k.scopes)) then
    return lv.err_x('lv_forbidden', 'This key lacks the scope ' || v_scope || '.', jsonb_build_object('missing', jsonb_build_array(v_scope)));
  end if;
  v_retry := lv.integration_rate_hit('api_key', k.id::text, coalesce((lv.hub_limit(k.hub_id, 'api.rate_per_minute'))::int, 0));
  if v_retry is not null then
    return lv.err_x('lv_rate_limited', 'Too many requests for this key. Slow down.', jsonb_build_object('retry_after', v_retry));
  end if;
  update lv.api_keys set last_used_at = now() where id = k.id;

  -- Confine every Campaign- and endpoint-addressed operation to the key's Hub.
  if a ? 'campaign_id' then
    begin
      v_campaign := (a->>'campaign_id')::uuid;
    exception when others then
      return lv.err('lv_invalid_input', 'campaign_id must be a UUID.');
    end;
    if not exists (select 1 from lv.campaigns c where c.id = v_campaign and c.hub_id = k.hub_id) then
      return lv.err('lv_not_found', 'No such Campaign.');
    end if;
  end if;
  if a ? 'endpoint_id' then
    begin
      v_endpoint := (a->>'endpoint_id')::uuid;
    exception when others then
      return lv.err('lv_invalid_input', 'endpoint_id must be a UUID.');
    end;
  end if;

  v_prev := lv.integration_act_as(k.created_by, 'api_key');
  begin
    v_out := case p_op
      when 'hub.get' then jsonb_build_object('ok', true, 'hub', (select jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name)
                                                                  from lv.hubs h where h.id = k.hub_id),
                                             'key', jsonb_build_object('prefix', k.prefix, 'scopes', to_jsonb(k.scopes)))
      when 'campaigns.list' then lv_api.lv_campaign_list(k.hub_id)
      when 'campaigns.get' then lv_api.lv_campaign_get(v_campaign)
      when 'campaigns.create' then lv_api.lv_campaign_create(k.hub_id, a->>'title', coalesce(a->>'mode', 'survey'),
                                                             coalesce(a->>'anonymity', 'anonymous'), a->>'description')
      when 'campaigns.update' then lv_api.lv_campaign_update(v_campaign, p_title => a->>'title', p_description => a->>'description')
      when 'campaigns.questions.add' then lv_api.lv_campaign_question_add(v_campaign, (a->>'position')::int, a->>'kind', a->>'prompt',
                                                                         coalesce(a->'config', '{}'::jsonb))
      when 'campaigns.schedule' then lv_api.lv_campaign_schedule(v_campaign, (a->>'opens_at')::timestamptz, (a->>'closes_at')::timestamptz)
      when 'campaigns.publish' then lv_api.lv_campaign_activate(v_campaign)
      when 'campaigns.close' then lv_api.lv_campaign_close(v_campaign)
      when 'invites.create' then lv_api.lv_invite_create(k.hub_id, (a->>'max_uses')::int, (a->>'expires_at')::timestamptz)
      when 'campaigns.invites.create' then lv_api.lv_campaign_invite_create(v_campaign, (a->>'max_uses')::int, (a->>'expires_at')::timestamptz)
      when 'results.get' then lv.api_results_public(lv_api.lv_analytics_overview(v_campaign))
      when 'webhooks.list' then lv_api.lv_webhook_list(k.hub_id)
      when 'webhooks.create' then lv_api.lv_webhook_create(k.hub_id, a->>'url',
                                    case when a ? 'events' then array(select jsonb_array_elements_text(a->'events')) end)
      when 'webhooks.update' then lv.webhook_update_in_hub(k.hub_id, v_endpoint,
                                    case when a ? 'events' then array(select jsonb_array_elements_text(a->'events')) end,
                                    (a->>'enabled')::boolean)
      when 'webhooks.delete' then lv.webhook_delete_in_hub(k.hub_id, v_endpoint)
    end;
  exception when others then
    perform lv.integration_restore(v_prev);
    if sqlstate in ('22P02', '22007', '22008', '22003') then return lv.err('lv_invalid_input', 'A value in the request is not valid.'); end if;
    return lv.api_error(sqlerrm, sqlstate);
  end;
  perform lv.integration_restore(v_prev);
  if v_scope <> 'campaigns:read' and v_scope <> 'results:read' then
    perform lv.audit(k.created_by, k.hub_id, 'api.call', p_op, jsonb_build_object('key_id', k.id, 'ok', coalesce((v_out->>'ok')::boolean, false)));
  end if;
  return coalesce(v_out, lv.err('lv_not_found', 'No such operation.'));
end;
$$;

-- =========================================================================================================
-- Webhooks
-- =========================================================================================================
create function lv.webhook_url_problem(p_url text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_host text;
begin
  if p_url is null or length(p_url) > 500 then return 'Give an https URL of up to 500 characters.'; end if;
  if p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?(/[^\s]*)?$' then return 'The URL must start with https:// and name a host.'; end if;
  v_host := lower(substring(p_url from '^https://([A-Za-z0-9.-]+)'));
  if v_host ~ '^[0-9.]+$' or v_host !~ '\.' or v_host ~ '(^|\.)(localhost|local|internal|localdomain|lan|home|arpa|test|invalid|example)$'
     or v_host ~ '(^|\.)supabase\.(co|in|net)$' then
    return 'Use a public host name, not an IP address or an internal name.';
  end if;
  return null;
end;
$$;

create table lv.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  created_by uuid references lv.accounts (id) on delete set null,
  url text not null check (lv.webhook_url_problem(url) is null),
  -- Needed to sign deliveries, so it cannot be hashed. Never exposed: lv is not an API schema, RLS on, no grants.
  secret text not null check (secret ~ '^lvwh_[0-9a-f]{48}$'),
  events text[] not null check (cardinality(events) between 1 and 3
    and events <@ array['campaign.published', 'campaign.closed', 'campaign.responses_milestone']::text[]),
  enabled boolean not null default true,
  consecutive_failures int not null default 0,
  disabled_reason text check (disabled_reason is null or length(disabled_reason) <= 200),
  created_at timestamptz not null default now()
);
create index webhook_endpoints_hub_idx on lv.webhook_endpoints (hub_id);
alter table lv.webhook_endpoints enable row level security;

create table lv.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references lv.webhook_endpoints (id) on delete cascade,
  event text not null,
  event_id uuid not null default gen_random_uuid(),
  dedupe_key text not null check (length(dedupe_key) <= 200),
  -- Emptied once delivered or failed. Only Campaign metadata and released counts, never an answer or a person.
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8192),
  status text not null default 'queued' check (status in ('queued', 'sending', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint webhook_outbox_dedupe unique (endpoint_id, dedupe_key)
);
create index webhook_outbox_due_idx on lv.webhook_outbox (next_attempt_at) where status in ('queued', 'sending');
alter table lv.webhook_outbox enable row level security;

-- Delivery log: outcome and timing only, never a body.
create table lv.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references lv.webhook_endpoints (id) on delete cascade,
  outbox_id uuid references lv.webhook_outbox (id) on delete set null,
  event text not null,
  attempt int not null,
  status_code int,
  outcome text not null check (outcome in ('delivered', 'retry', 'failed')),
  duration_ms int,
  error text check (error is null or length(error) <= 120),
  created_at timestamptz not null default now()
);
create index webhook_deliveries_endpoint_idx on lv.webhook_deliveries (endpoint_id, created_at desc);
alter table lv.webhook_deliveries enable row level security;

create function lv.webhook_json(e lv.webhook_endpoints) returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('endpoint_id', e.id, 'url', e.url, 'events', to_jsonb(e.events), 'enabled', e.enabled,
  'disabled_reason', e.disabled_reason, 'created_at', e.created_at, 'consecutive_failures', e.consecutive_failures,
  'recent_deliveries', coalesce((select jsonb_agg(jsonb_build_object('event', d.event, 'attempt', d.attempt, 'status_code', d.status_code,
                                                              'outcome', d.outcome, 'duration_ms', d.duration_ms, 'at', d.created_at)
                                                  order by d.created_at desc)
                                   from (select * from lv.webhook_deliveries x where x.endpoint_id = e.id order by x.created_at desc limit 10) d), '[]'::jsonb)) $$;

create function lv.webhook_guard(p_hub uuid, p_write boolean) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_hub is null or lv.membership_of(v_account, p_hub) is null or lv.hub_kind(p_hub) <> 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.api_manager(v_account, p_hub) then return lv.err('lv_forbidden', 'Managing webhooks requires api.manage.'); end if;
  if p_write and not lv.api_enabled(p_hub) then
    return lv.err_x('lv_entitlement_required', 'Webhooks are part of the Team plan.', jsonb_build_object('product', 'team_hub'));
  end if;
  return null;
end;
$$;

create function lv.webhook_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_bad jsonb := lv.webhook_guard(p_hub, false);
begin
  if v_bad is not null then return v_bad; end if;
  return jsonb_build_object('ok', true, 'enabled', lv.api_enabled(p_hub),
    'events', jsonb_build_array('campaign.published', 'campaign.closed', 'campaign.responses_milestone'),
    'max_endpoints', (lv.hub_limit(p_hub, 'webhooks.max_endpoints'))::int,
    'endpoints', coalesce((select jsonb_agg(lv.webhook_json(e) order by e.created_at) from lv.webhook_endpoints e where e.hub_id = p_hub), '[]'::jsonb));
end;
$$;

create function lv.webhook_create(p_hub uuid, p_url text, p_events text[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_bad jsonb := lv.webhook_guard(p_hub, true);
  v_problem text;
  v_events text[];
  v_max int;
  v_used int;
  e lv.webhook_endpoints;
  v_secret text := 'lvwh_' || lv.random_hex(24);
begin
  if v_bad is not null then return v_bad; end if;
  if lv.integration_blocked(p_hub, v_account) then return lv.err('lv_forbidden', 'This Hub is suspended.'); end if;
  v_problem := lv.webhook_url_problem(btrim(p_url));
  if v_problem is not null then return lv.err('lv_invalid_input', v_problem); end if;
  select array_agg(distinct x order by x) into v_events
    from unnest(coalesce(p_events, array['campaign.published', 'campaign.closed', 'campaign.responses_milestone'])) x;
  if v_events is null or not (v_events <@ array['campaign.published', 'campaign.closed', 'campaign.responses_milestone']::text[]) then
    return lv.err('lv_invalid_input', 'Choose one or more of campaign.published, campaign.closed, campaign.responses_milestone.');
  end if;
  v_max := coalesce((lv.hub_limit(p_hub, 'webhooks.max_endpoints'))::int, 0);
  perform pg_advisory_xact_lock(hashtextextended('lv_webhooks:' || p_hub::text, 0));
  select count(*) into v_used from lv.webhook_endpoints x where x.hub_id = p_hub;
  if v_used >= v_max then
    return lv.err_x('lv_limit_reached', 'This Hub has reached its webhook endpoint limit.', jsonb_build_object('limit', v_max, 'used', v_used));
  end if;
  insert into lv.webhook_endpoints (hub_id, created_by, url, secret, events)
  values (p_hub, v_account, btrim(p_url), v_secret, v_events) returning * into e;
  perform lv.audit(v_account, p_hub, 'webhook.created', e.id::text);
  return jsonb_build_object('ok', true, 'endpoint', lv.webhook_json(e), 'secret', v_secret, 'shown_once', true);
end;
$$;

create function lv.webhook_update_in_hub(p_hub uuid, p_endpoint uuid, p_events text[], p_enabled boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  e lv.webhook_endpoints;
  v_bad jsonb;
  v_events text[];
begin
  select * into e from lv.webhook_endpoints x where x.id = p_endpoint and (p_hub is null or x.hub_id = p_hub);
  if e.id is null then return lv.err('lv_not_found', 'No such webhook endpoint.'); end if;
  v_bad := lv.webhook_guard(e.hub_id, true);
  if v_bad is not null then return v_bad; end if;
  if p_events is not null then
    select array_agg(distinct x order by x) into v_events from unnest(p_events) x;
    if v_events is null or not (v_events <@ array['campaign.published', 'campaign.closed', 'campaign.responses_milestone']::text[]) then
      return lv.err('lv_invalid_input', 'Choose one or more known events.');
    end if;
  end if;
  update lv.webhook_endpoints
     set events = coalesce(v_events, events),
         enabled = coalesce(p_enabled, enabled),
         consecutive_failures = case when p_enabled then 0 else consecutive_failures end,
         disabled_reason = case when p_enabled then null when p_enabled = false then 'Turned off by a manager.' else disabled_reason end
   where id = e.id returning * into e;
  perform lv.audit(v_account, e.hub_id, 'webhook.updated', e.id::text);
  return jsonb_build_object('ok', true, 'endpoint', lv.webhook_json(e));
end;
$$;

create function lv.webhook_delete_in_hub(p_hub uuid, p_endpoint uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  e lv.webhook_endpoints;
  v_bad jsonb;
begin
  select * into e from lv.webhook_endpoints x where x.id = p_endpoint and (p_hub is null or x.hub_id = p_hub);
  if e.id is null then return lv.err('lv_not_found', 'No such webhook endpoint.'); end if;
  v_bad := lv.webhook_guard(e.hub_id, false);
  if v_bad is not null then return v_bad; end if;
  delete from lv.webhook_endpoints where id = e.id;
  perform lv.audit(v_account, e.hub_id, 'webhook.deleted', e.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Released participant count via the suppression engine (NULL while withheld). Identified: always released.
-- Anonymous: only after the Campaign has finished (lv.analytics_core refuses live anonymous results).
create function lv.released_participants(p_campaign uuid) returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v jsonb;
  v_owner uuid;
begin
  select h.owner_account_id into v_owner from lv.campaigns c join lv.hubs h on h.id = c.hub_id where c.id = p_campaign;
  v := lv.analytics_core(p_campaign, v_owner, 'participant_count', null);
  if not coalesce((v->>'ok')::boolean, false) or coalesce((v->>'suppressed')::boolean, true) then return null; end if;
  return (v->>'n')::bigint;
end;
$$;

create function lv.webhook_campaign_data(p_campaign uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
  'status', c.status, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'join_code', c.join_code)
  from lv.campaigns c where c.id = p_campaign $$;

-- One outbox row per enabled endpoint of the Hub that subscribes to the event (Team Hubs only; idempotent).
create function lv.webhook_enqueue(p_hub uuid, p_event text, p_dedupe text, p_data jsonb) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if not lv.api_enabled(p_hub) then return 0; end if;
  with ins as (
    insert into lv.webhook_outbox (endpoint_id, event, dedupe_key, payload)
    select e.id, p_event, p_dedupe, jsonb_build_object('type', p_event, 'hub_id', p_hub, 'data', coalesce(p_data, '{}'::jsonb))
      from lv.webhook_endpoints e
     where e.hub_id = p_hub and e.enabled and p_event = any(e.events)
    on conflict (endpoint_id, dedupe_key) do nothing
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end;
$$;

create function lv.webhook_milestones() returns int[]
language sql immutable set search_path = ''
as $$ select array[10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] $$;

-- Campaign lifecycle -> webhooks and Discord auto-post.
create function lv.integration_on_campaign_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lv.hub_kind(new.hub_id) <> 'community' then return new; end if;
  if new.status = 'active' and old.status = 'draft' then
    perform lv.webhook_enqueue(new.hub_id, 'campaign.published', 'published:' || new.id, lv.webhook_campaign_data(new.id));
    insert into lv.discord_outbox (kind, guild_id, channel_id, campaign_id)
    select 'post', dc.guild_id, dc.channel_id, new.id
      from lv.discord_connections dc join lv.discord_guilds g on g.guild_id = dc.guild_id
     where dc.hub_id = new.hub_id and dc.status = 'active' and dc.auto_post and g.disabled_at is null and dc.channel_id is not null;
  elsif new.status = 'closed' and old.status in ('active', 'paused') then
    perform lv.webhook_enqueue(new.hub_id, 'campaign.closed', 'closed:' || new.id,
      lv.webhook_campaign_data(new.id) || jsonb_build_object('released_participants', lv.released_participants(new.id)));
  end if;
  return new;
end;
$$;
revoke all on function lv.integration_on_campaign_status() from public;

-- Responses milestone: identified Campaigns only (anonymous counts are never released while live).
create function lv.integration_on_participation() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  v_n bigint;
begin
  select x.id, x.hub_id, x.anonymity into c from lv.campaigns x where x.id = new.campaign_id;
  if c.id is null or c.anonymity <> 'identified' or lv.hub_kind(c.hub_id) <> 'community' then return new; end if;
  if not exists (select 1 from lv.webhook_endpoints e where e.hub_id = c.hub_id and e.enabled and 'campaign.responses_milestone' = any(e.events)) then
    return new;
  end if;
  v_n := lv.released_participants(c.id);
  if v_n is not null and v_n = any(lv.webhook_milestones()) then
    perform lv.webhook_enqueue(c.hub_id, 'campaign.responses_milestone', 'milestone:' || c.id || ':' || v_n,
      lv.webhook_campaign_data(c.id) || jsonb_build_object('milestone', v_n, 'released_participants', v_n));
  end if;
  return new;
end;
$$;
revoke all on function lv.integration_on_participation() from public;

-- Campaigns that finished by time (closes_at passed) emit campaign.closed on the next dispatcher sweep.
create function lv.webhook_sweep() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record;
  v_n int := 0;
begin
  for c in select x.id, x.hub_id from lv.campaigns x join lv.hubs h on h.id = x.hub_id
            where h.kind = 'community' and x.status in ('active', 'paused') and x.closes_at is not null
              and x.closes_at <= now() and x.closes_at > now() - interval '7 days'
              and exists (select 1 from lv.webhook_endpoints e where e.hub_id = x.hub_id and e.enabled and 'campaign.closed' = any(e.events)
                             and not exists (select 1 from lv.webhook_outbox o where o.endpoint_id = e.id and o.dedupe_key = 'closed:' || x.id)) loop
    v_n := v_n + lv.webhook_enqueue(c.hub_id, 'campaign.closed', 'closed:' || c.id,
      lv.webhook_campaign_data(c.id) || jsonb_build_object('released_participants', lv.released_participants(c.id)));
  end loop;
  -- Housekeeping: delivery logs 12 months (F-04), finished outbox rows 30 days, rate windows and stale codes.
  delete from lv.webhook_deliveries where created_at < now() - interval '12 months';
  delete from lv.webhook_outbox where status in ('delivered', 'failed') and created_at < now() - interval '30 days';
  delete from lv.integration_rate_windows where window_start < now() - interval '10 minutes';
  delete from lv.discord_codes where expires_at < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'queued', v_n);
end;
$$;

-- Dispatcher claim: due rows of enabled endpoints whose Hub still has the API (others stay queued = paused).
create function lv.webhook_claim(p_limit int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  with c as (
    select o.id from lv.webhook_outbox o join lv.webhook_endpoints e on e.id = o.endpoint_id
     where e.enabled and lv.api_enabled(e.hub_id) and not lv.integration_blocked(e.hub_id, null)
       and ((o.status = 'queued' and o.next_attempt_at <= now())
            or (o.status = 'sending' and o.locked_at < now() - interval '15 minutes'))
     order by o.created_at
     limit greatest(least(coalesce(p_limit, 20), 100), 1)
     for update of o skip locked),
  u as (
    update lv.webhook_outbox o set status = 'sending', locked_at = now(), attempts = o.attempts + 1
      from c where o.id = c.id
    returning o.id, o.endpoint_id, o.event, o.event_id, o.payload, o.attempts, o.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'url', e.url, 'secret', e.secret, 'event', u.event,
           'body', jsonb_build_object('id', u.event_id, 'type', u.event, 'created_at', u.created_at,
                                      'hub_id', u.payload->'hub_id', 'data', u.payload->'data'),
           'attempts', u.attempts)), '[]'::jsonb)
    into v from u join lv.webhook_endpoints e on e.id = u.endpoint_id;
  return jsonb_build_object('ok', true, 'deliveries', v);
end;
$$;

create function lv.webhook_mark(p_id uuid, p_result text, p_status_code int default null, p_duration_ms int default null,
                                p_error text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  o lv.webhook_outbox;
  v_max int := lv.policy_int('webhook.max_attempts', 8);
  v_outcome text;
begin
  select * into o from lv.webhook_outbox x where x.id = p_id for update;
  if o.id is null then return lv.err('lv_not_found', 'No such delivery.'); end if;
  if o.status <> 'sending' then return lv.err('lv_lifecycle_invalid', 'That delivery is not in flight.'); end if;
  if p_result = 'delivered' then
    update lv.webhook_outbox set status = 'delivered', delivered_at = now(), locked_at = null, payload = '{}'::jsonb where id = p_id;
    update lv.webhook_endpoints set consecutive_failures = 0 where id = o.endpoint_id;
    v_outcome := 'delivered';
  elsif p_result = 'retry' and o.attempts < v_max then
    update lv.webhook_outbox set status = 'queued', locked_at = null,
           next_attempt_at = now() + make_interval(secs => 30 * power(2, least(o.attempts, 10))::int) where id = p_id;
    v_outcome := 'retry';
  elsif p_result in ('retry', 'failed') then
    update lv.webhook_outbox set status = 'failed', locked_at = null, payload = '{}'::jsonb where id = p_id;
    update lv.webhook_endpoints set consecutive_failures = consecutive_failures + 1,
           enabled = case when consecutive_failures + 1 >= 20 then false else enabled end,
           disabled_reason = case when consecutive_failures + 1 >= 20 then 'Turned off after 20 failed deliveries in a row.' else disabled_reason end
     where id = o.endpoint_id;
    v_outcome := 'failed';
  else
    return lv.err('lv_invalid_input', 'Result must be delivered, retry or failed.');
  end if;
  insert into lv.webhook_deliveries (endpoint_id, outbox_id, event, attempt, status_code, outcome, duration_ms, error)
  values (o.endpoint_id, o.id, o.event, o.attempts, p_status_code, v_outcome, p_duration_ms, left(p_error, 120));
  return jsonb_build_object('ok', true, 'outcome', v_outcome);
end;
$$;

-- =========================================================================================================
-- Discord
-- =========================================================================================================
create table lv.discord_guilds (
  guild_id text primary key check (guild_id ~ '^[0-9]{5,25}$'),
  guild_name text check (guild_name is null or length(guild_name) <= 100),
  disabled_at timestamptz,
  disabled_reason text check (disabled_reason is null or length(disabled_reason) <= 200),
  created_at timestamptz not null default now()
);
alter table lv.discord_guilds enable row level security;

-- The Discord user id is a linked handle, never an identity key: LunchVoice identity stays (issuer, subject).
create table lv.discord_links (
  account_id uuid primary key references lv.accounts (id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{5,25}$'),
  discord_username text check (discord_username is null or length(discord_username) <= 64),
  consent_version text not null check (length(consent_version) <= 40),
  role_facts_consent boolean not null default false,
  linked_at timestamptz not null default now(),
  constraint discord_links_user_key unique (discord_user_id)
);
alter table lv.discord_links enable row level security;

-- One-time codes for /lunchvoice link (kind link) and /lunchvoice connect (kind connect). Stored hashed.
create table lv.discord_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('link', 'connect')),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{5,25}$'),
  discord_username text check (discord_username is null or length(discord_username) <= 64),
  guild_id text check (guild_id is null or guild_id ~ '^[0-9]{5,25}$'),
  channel_id text check (channel_id is null or channel_id ~ '^[0-9]{5,25}$'),
  hub_slug text check (hub_slug is null or length(hub_slug) <= 40),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table lv.discord_codes enable row level security;

create table lv.discord_connections (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references lv.discord_guilds (guild_id) on delete cascade,
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  channel_id text check (channel_id is null or channel_id ~ '^[0-9]{5,25}$'),
  status text not null default 'active' check (status in ('active')),
  auto_post boolean not null default false,
  confirmed_by uuid references lv.accounts (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  constraint discord_connections_pair unique (guild_id, hub_id)
);
create index discord_connections_hub_idx on lv.discord_connections (hub_id);
alter table lv.discord_connections enable row level security;

create table lv.discord_role_rules (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references lv.discord_guilds (guild_id) on delete cascade,
  fact text not null check (fact in ('waitlist_founding', 'hub_member', 'team_hub')),
  hub_id uuid references lv.hubs (id) on delete cascade,
  role_id text not null check (role_id ~ '^[0-9]{5,25}$'),
  created_by uuid references lv.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint discord_role_rules_shape check ((fact = 'hub_member') = (hub_id is not null))
);
create unique index discord_role_rules_unique on lv.discord_role_rules (guild_id, fact, coalesce(hub_id, '00000000-0000-0000-0000-000000000000'::uuid), role_id);
alter table lv.discord_role_rules enable row level security;

-- Roles the bot granted, so it can remove exactly those (and only those) when a fact stops being true.
create table lv.discord_role_grants (
  guild_id text not null references lv.discord_guilds (guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{5,25}$'),
  role_id text not null check (role_id ~ '^[0-9]{5,25}$'),
  granted_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, role_id)
);
alter table lv.discord_role_grants enable row level security;

create table lv.discord_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('role_sync', 'post')),
  guild_id text not null references lv.discord_guilds (guild_id) on delete cascade,
  channel_id text,
  discord_user_id text,
  campaign_id uuid references lv.campaigns (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'done', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 120),
  created_at timestamptz not null default now(),
  constraint discord_outbox_shape check ((kind = 'role_sync') = (discord_user_id is not null) and (kind = 'post') = (campaign_id is not null))
);
create index discord_outbox_due_idx on lv.discord_outbox (next_attempt_at) where status in ('queued', 'sending');
alter table lv.discord_outbox enable row level security;

create trigger campaigns_integration_status
  after update of status on lv.campaigns
  for each row when (old.status is distinct from new.status)
  execute function lv.integration_on_campaign_status();

create trigger participation_integration_milestone
  after insert on lv.participation
  for each row execute function lv.integration_on_participation();

-- Unlinking (Discord, Account Settings or account deletion) queues removal of every role the bot granted.
create function lv.discord_on_unlink() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into lv.discord_outbox (kind, guild_id, discord_user_id)
  select distinct 'role_sync', g.guild_id, g.discord_user_id from lv.discord_role_grants g where g.discord_user_id = old.discord_user_id;
  return old;
end;
$$;
revoke all on function lv.discord_on_unlink() from public;
create trigger discord_links_unlink after delete on lv.discord_links for each row execute function lv.discord_on_unlink();

create function lv.discord_link_json(l lv.discord_links) returns jsonb
language sql immutable set search_path = ''
as $$ select case when l.account_id is null then null else jsonb_build_object('discord_username', l.discord_username,
  'linked_at', l.linked_at, 'consent_version', l.consent_version, 'role_facts_consent', l.role_facts_consent) end $$;

-- The facts a rule asks about, for one linked account.
create function lv.discord_fact(p_account uuid, p_fact text, p_hub uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select case p_fact
  when 'waitlist_founding' then exists (select 1 from lv.waitlist_entries w where w.account_id = p_account and w.status = 'admitted')
  when 'hub_member' then lv.membership_of(p_account, p_hub) is not null
  when 'team_hub' then exists (select 1 from lv.hubs h where h.owner_account_id = p_account and h.kind = 'community' and lv.hub_family(h.id) = 'team')
  else false end $$;

-- Which managed roles a Discord user should have in a guild (add) and which granted roles must go (remove).
-- Facts are evaluated only for a linked person who consented to role facts, in a guild that is not disabled.
create function lv.discord_role_plan(p_guild text, p_user text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  l lv.discord_links;
  v_should text[] := '{}';
  v_granted text[];
  v_ok boolean;
begin
  select * into l from lv.discord_links x where x.discord_user_id = p_user;
  v_ok := l.account_id is not null and l.role_facts_consent
          and exists (select 1 from lv.discord_guilds g where g.guild_id = p_guild and g.disabled_at is null)
          and not lv.integration_blocked(null, l.account_id);
  if v_ok then
    select coalesce(array_agg(distinct r.role_id order by r.role_id), '{}') into v_should
      from lv.discord_role_rules r where r.guild_id = p_guild and lv.discord_fact(l.account_id, r.fact, r.hub_id);
  end if;
  select coalesce(array_agg(g.role_id order by g.role_id), '{}') into v_granted
    from lv.discord_role_grants g where g.guild_id = p_guild and g.discord_user_id = p_user;
  return jsonb_build_object('ok', true, 'guild_id', p_guild, 'user_id', p_user, 'linked', l.account_id is not null,
    'consented', coalesce(l.role_facts_consent, false),
    'add', to_jsonb(v_should),
    'remove', to_jsonb(array(select x from unnest(v_granted) x where not (x = any(v_should)))));
end;
$$;

-- The bot reports what it actually changed at Discord.
create function lv.discord_roles_applied(p_guild text, p_user text, p_added text[], p_removed text[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not exists (select 1 from lv.discord_guilds g where g.guild_id = p_guild) then return lv.err('lv_not_found', 'Unknown server.'); end if;
  delete from lv.discord_role_grants g where g.guild_id = p_guild and g.discord_user_id = p_user and g.role_id = any(coalesce(p_removed, '{}'));
  -- Never record a grant for someone who is no longer linked (the removal already queued would miss it).
  if exists (select 1 from lv.discord_links l where l.discord_user_id = p_user) then
    insert into lv.discord_role_grants (guild_id, discord_user_id, role_id)
    select p_guild, p_user, r from unnest(coalesce(p_added, '{}')) r where r ~ '^[0-9]{5,25}$'
    on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Card data for posting a Campaign. answer_in_discord only for identified one-question polls (D-01).
create function lv.discord_card(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  q record;
  v_opts jsonb := null;
  v_prompt text;
  v_count int;
begin
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null then return null; end if;
  select count(*) into v_count from lv.campaign_questions x where x.campaign_id = c.id;
  if c.anonymity = 'identified' and c.mode = 'poll' and v_count = 1 then
    select * into q from lv.campaign_questions x where x.campaign_id = c.id;
    v_prompt := q.prompt;
    if q.kind = 'yes_no' then v_opts := '["Yes","No"]'::jsonb;
    elsif q.kind = 'single_choice' and jsonb_array_length(coalesce(q.config->'options', '[]'::jsonb)) between 1 and 5 then v_opts := q.config->'options';
    end if;
  end if;
  return jsonb_build_object('campaign_id', c.id, 'title', c.title, 'description', c.description, 'anonymity', c.anonymity,
    'mode', c.mode, 'join_code', c.join_code, 'closes_at', c.closes_at,
    'prompt', case when v_opts is not null then v_prompt end,
    'answer_in_discord', v_opts is not null, 'options', v_opts);
end;
$$;

create function lv.discord_new_code(p_kind text, p_ctx jsonb, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := upper(lv.random_hex(10));
  v_exp timestamptz := now() + make_interval(mins => lv.policy_int('discord.code_minutes', 10));
begin
  -- One live code per person and kind: a new one replaces the old.
  delete from lv.discord_codes d where d.discord_user_id = p_ctx->>'user_id' and d.kind = p_kind and d.consumed_at is null;
  insert into lv.discord_codes (code_hash, kind, discord_user_id, discord_username, guild_id, channel_id, hub_slug, expires_at)
  values (lv.sha256_hex(v_code), p_kind, p_ctx->>'user_id', left(p_ctx->>'username', 64), nullif(p_ctx->>'guild_id', ''),
          nullif(p_ctx->>'channel_id', ''), lower(left(p_slug, 40)), v_exp);
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_exp);
end;
$$;

-- The single entry point of the `discord` Edge Function (service role only), after the Ed25519 signature check.
-- p_ctx: { guild_id, guild_name, channel_id, user_id, username, is_admin (from member.permissions), options{} }.
create function lv.discord_interaction(p_command text, p_ctx jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  ctx jsonb := coalesce(p_ctx, '{}'::jsonb);
  o jsonb := coalesce(p_ctx->'options', '{}'::jsonb);
  v_user text := ctx->>'user_id';
  v_guild text := nullif(ctx->>'guild_id', '');
  v_retry int;
  l lv.discord_links;
  g lv.discord_guilds;
  dc lv.discord_connections;
  c lv.campaigns;
  v_hub uuid;
  v_prev text;
  v_out jsonb;
  v_card jsonb;
  v_val jsonb;
  v_q uuid;
  v_idx int;
begin
  if v_user is null or v_user !~ '^[0-9]{5,25}$' then return lv.err('lv_invalid_input', 'Unknown Discord user.'); end if;
  if v_guild is not null and v_guild !~ '^[0-9]{5,25}$' then return lv.err('lv_invalid_input', 'Unknown Discord server.'); end if;

  v_retry := lv.integration_rate_hit('discord_user', v_user, lv.policy_int('discord.user_commands_per_minute', 10));
  if v_retry is null and v_guild is not null then
    v_retry := lv.integration_rate_hit('discord_guild', v_guild, lv.policy_int('discord.guild_commands_per_minute', 60));
  end if;
  if v_retry is not null then
    return lv.err_x('lv_rate_limited', 'Slow down a little and try again in a minute.', jsonb_build_object('retry_after', v_retry));
  end if;

  if v_guild is not null then
    insert into lv.discord_guilds (guild_id, guild_name) values (v_guild, left(ctx->>'guild_name', 100))
    on conflict (guild_id) do update set guild_name = coalesce(excluded.guild_name, lv.discord_guilds.guild_name);
    select * into g from lv.discord_guilds x where x.guild_id = v_guild;
    if g.disabled_at is not null and p_command <> 'unlink' then
      return lv.err('lv_not_available', 'LunchVoice is turned off for this server.');
    end if;
  end if;
  select * into l from lv.discord_links x where x.discord_user_id = v_user;

  if p_command = 'link' then
    if l.account_id is not null then return lv.err('lv_conflict', 'Your Discord account is already linked. Use /lunchvoice unlink first.'); end if;
    return lv.discord_new_code('link', ctx, null);

  elsif p_command = 'unlink' then
    if l.account_id is null then return jsonb_build_object('ok', true, 'unlinked', false); end if;
    delete from lv.discord_links where account_id = l.account_id;
    perform lv.audit(l.account_id, null, 'discord.unlinked', null);
    return jsonb_build_object('ok', true, 'unlinked', true,
      'plan', case when v_guild is not null then lv.discord_role_plan(v_guild, v_user) end);

  elsif p_command = 'verify' then
    if v_guild is null then return lv.err('lv_invalid_input', 'Run this in a server.'); end if;
    if l.account_id is null then return lv.err('lv_not_found', 'Link your LunchVoice account first with /lunchvoice link.'); end if;
    return lv.discord_role_plan(v_guild, v_user);

  elsif p_command = 'connect' then
    if v_guild is null then return lv.err('lv_invalid_input', 'Run this in a server.'); end if;
    if not coalesce((ctx->>'is_admin')::boolean, false) then return lv.err('lv_forbidden', 'Only server admins can connect a Hub.'); end if;
    if coalesce(btrim(o->>'hub'), '') = '' then return lv.err('lv_invalid_input', 'Name the Hub address, for example northside-running.'); end if;
    -- Always issue a code: whether the Hub exists is only revealed to a manager who signs in to confirm.
    return lv.discord_new_code('connect', ctx, btrim(o->>'hub'));

  elsif p_command = 'setup' then
    if v_guild is null then return lv.err('lv_invalid_input', 'Run this in a server.'); end if;
    if not coalesce((ctx->>'is_admin')::boolean, false) then return lv.err('lv_forbidden', 'Only server admins can set up role rules.'); end if;
    if coalesce(o->>'role', '') !~ '^[0-9]{5,25}$' then return lv.err('lv_invalid_input', 'Choose a role.'); end if;
    if o->>'fact' not in ('waitlist_founding', 'hub_member', 'team_hub') then return lv.err('lv_invalid_input', 'Choose a rule.'); end if;
    if o->>'fact' = 'hub_member' then
      -- Only a Hub the configuring person manages, so a server can never probe another Hub's membership.
      if l.account_id is null then return lv.err('lv_forbidden', 'Link your LunchVoice account first; only a manager of that Hub can add this rule.'); end if;
      select h.id into v_hub from lv.hubs h where h.slug = lower(btrim(coalesce(o->>'hub', ''))) and h.kind = 'community';
      if v_hub is null or not (lv.is_owner(l.account_id, v_hub) or lv.has_capability(l.account_id, v_hub, 'hub.settings.manage')) then
        return lv.err('lv_forbidden', 'You can only add a membership rule for a Hub you manage.');
      end if;
    end if;
    if coalesce((o->>'remove')::boolean, false) then
      delete from lv.discord_role_rules r where r.guild_id = v_guild and r.fact = o->>'fact' and r.role_id = o->>'role'
        and r.hub_id is not distinct from v_hub;
      return jsonb_build_object('ok', true, 'removed', true);
    end if;
    insert into lv.discord_role_rules (guild_id, fact, hub_id, role_id, created_by)
    values (v_guild, o->>'fact', v_hub, o->>'role', l.account_id) on conflict do nothing;
    return jsonb_build_object('ok', true, 'rules', (select count(*) from lv.discord_role_rules r where r.guild_id = v_guild));

  elsif p_command = 'post' then
    if v_guild is null then return lv.err('lv_invalid_input', 'Run this in a server.'); end if;
    if l.account_id is null then return lv.err('lv_forbidden', 'Link your LunchVoice account first with /lunchvoice link.'); end if;
    select x.* into c from lv.campaigns x
      join lv.discord_connections d on d.hub_id = x.hub_id and d.guild_id = v_guild and d.status = 'active'
     where x.join_code = upper(btrim(coalesce(o->>'campaign', ''))) limit 1;
    if c.id is null or not lv.has_capability(l.account_id, c.hub_id, 'campaign.manage') then
      return lv.err('lv_not_found', 'No such Campaign in a Hub connected to this server.');
    end if;
    if c.status <> 'active' or c.blocked_at is not null then return lv.err('lv_lifecycle_invalid', 'Only a published Campaign can be posted.'); end if;
    perform lv.audit(l.account_id, c.hub_id, 'discord.posted', c.id::text, jsonb_build_object('guild_id', v_guild));
    return jsonb_build_object('ok', true, 'card', lv.discord_card(c.id));

  elsif p_command = 'answer' then
    -- A button click on a posted card. D-01: an anonymous Campaign is never answered inside Discord.
    begin
      select * into c from lv.campaigns x where x.id = (o->>'campaign_id')::uuid;
      v_idx := (o->>'option')::int;
    exception when others then
      return lv.err('lv_invalid_input', 'That button is not valid.');
    end;
    if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
    if c.anonymity <> 'identified' then
      return lv.err('lv_not_available', 'Anonymous Campaigns are answered only in LunchVoice, so Discord never sees your answer.');
    end if;
    v_card := lv.discord_card(c.id);
    if not coalesce((v_card->>'answer_in_discord')::boolean, false) then
      return lv.err('lv_not_available', 'Answer this Campaign in LunchVoice.');
    end if;
    if l.account_id is null then return lv.err('lv_forbidden', 'Link your LunchVoice account first with /lunchvoice link.'); end if;
    if v_idx is null or v_idx < 0 or v_idx >= jsonb_array_length(v_card->'options') then return lv.err('lv_invalid_input', 'That option does not exist.'); end if;
    select x.id, case x.kind when 'yes_no' then to_jsonb(v_idx = 0) else x.config->'options'->v_idx end into v_q, v_val
      from lv.campaign_questions x where x.campaign_id = c.id;
    v_prev := lv.integration_act_as(l.account_id, 'discord');
    begin
      v_out := lv_api.lv_submit_response(c.id, jsonb_build_array(jsonb_build_object('question_id', v_q, 'value', v_val)));
    exception when others then
      perform lv.integration_restore(v_prev);
      return lv.api_error(sqlerrm, sqlstate);
    end;
    perform lv.integration_restore(v_prev);
    return v_out;
  end if;

  return lv.err('lv_not_found', 'Unknown command.');
end;
$$;

-- Dispatcher for queued Discord work (role removals after unlink or account deletion, auto-posts).
create function lv.discord_claim(p_limit int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  with c as (
    select o.id from lv.discord_outbox o
     where (o.status = 'queued' and o.next_attempt_at <= now()) or (o.status = 'sending' and o.locked_at < now() - interval '15 minutes')
     order by o.created_at limit greatest(least(coalesce(p_limit, 20), 100), 1)
     for update skip locked),
  u as (
    update lv.discord_outbox o set status = 'sending', locked_at = now(), attempts = o.attempts + 1 from c where o.id = c.id
    returning o.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'guild_id', u.guild_id, 'channel_id', u.channel_id,
           'user_id', u.discord_user_id,
           'plan', case when u.kind = 'role_sync' then lv.discord_role_plan(u.guild_id, u.discord_user_id) end,
           'card', case when u.kind = 'post' then lv.discord_card(u.campaign_id) end)), '[]'::jsonb)
    into v from u;
  return jsonb_build_object('ok', true, 'jobs', v);
end;
$$;

create function lv.discord_mark(p_id uuid, p_result text, p_error text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  o lv.discord_outbox;
begin
  select * into o from lv.discord_outbox x where x.id = p_id for update;
  if o.id is null then return lv.err('lv_not_found', 'No such job.'); end if;
  if p_result = 'done' then
    update lv.discord_outbox set status = 'done', locked_at = null where id = p_id;
  elsif p_result = 'retry' and o.attempts < 6 then
    update lv.discord_outbox set status = 'queued', locked_at = null, last_error = left(p_error, 120),
           next_attempt_at = now() + make_interval(mins => power(2, least(o.attempts, 8))::int) where id = p_id;
  else
    update lv.discord_outbox set status = 'failed', locked_at = null, last_error = left(p_error, 120) where id = p_id;
  end if;
  delete from lv.discord_outbox where status in ('done', 'failed') and created_at < now() - interval '30 days';
  return jsonb_build_object('ok', true);
end;
$$;

-- Signed-in side (lv_api).
create function lv.discord_code_row(p_code text) returns lv.discord_codes
language sql stable security definer set search_path = ''
as $$ select * from lv.discord_codes d where d.code_hash = lv.sha256_hex(upper(btrim(coalesce(p_code, ''))))
           and d.consumed_at is null and d.expires_at > now() $$;

create function lv.api_discord_code_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  d lv.discord_codes;
  v_hub jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  d := lv.discord_code_row(p_code);
  if d.code_hash is null then return lv.err('lv_invalid_code', 'This link has expired or was already used. Run the command in Discord again.'); end if;
  if d.kind = 'connect' then
    select jsonb_build_object('hub_id', h.id, 'name', h.display_name, 'slug', h.slug) into v_hub from lv.hubs h where h.slug = d.hub_slug and h.kind = 'community';
    if v_hub is null or not (lv.is_owner(v_account, (v_hub->>'hub_id')::uuid) or lv.has_capability(v_account, (v_hub->>'hub_id')::uuid, 'hub.settings.manage')) then
      return lv.err('lv_not_found', 'Only a manager of that Hub can confirm this connection.');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'kind', d.kind, 'discord_username', d.discord_username, 'expires_at', d.expires_at,
    'guild_name', (select g.guild_name from lv.discord_guilds g where g.guild_id = d.guild_id),
    'hub', case when d.kind = 'connect' then v_hub end,
    'consent_version', lv.policy_json('discord.consent_version') #>> '{}',
    'already_linked', exists (select 1 from lv.discord_links x where x.account_id = v_account));
end;
$$;

create function lv.api_discord_link_confirm(p_code text, p_consent_version text, p_role_facts boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  d lv.discord_codes;
  l lv.discord_links;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_consent_version is distinct from (lv.policy_json('discord.consent_version') #>> '{}') then
    return lv.err('lv_invalid_input', 'Please read and accept the current notice.');
  end if;
  select * into d from lv.discord_codes x
   where x.code_hash = lv.sha256_hex(upper(btrim(coalesce(p_code, '')))) and x.kind = 'link' for update;
  if d.code_hash is null or d.consumed_at is not null or d.expires_at <= now() then
    return lv.err('lv_invalid_code', 'This link has expired or was already used. Run /lunchvoice link again.');
  end if;
  if exists (select 1 from lv.discord_links x where x.account_id = v_account) then
    return lv.err('lv_conflict', 'Your LunchVoice account is already linked to a Discord account. Unlink it first.');
  end if;
  if exists (select 1 from lv.discord_links x where x.discord_user_id = d.discord_user_id) then
    return lv.err('lv_conflict', 'That Discord account is already linked to another LunchVoice account.');
  end if;
  update lv.discord_codes set consumed_at = now() where code_hash = d.code_hash;
  insert into lv.discord_links (account_id, discord_user_id, discord_username, consent_version, role_facts_consent)
  values (v_account, d.discord_user_id, d.discord_username, p_consent_version, coalesce(p_role_facts, false)) returning * into l;
  -- Apply role rules in the server the link was started from.
  if d.guild_id is not null and exists (select 1 from lv.discord_role_rules r where r.guild_id = d.guild_id) then
    insert into lv.discord_outbox (kind, guild_id, discord_user_id) values ('role_sync', d.guild_id, d.discord_user_id);
  end if;
  perform lv.audit(v_account, null, 'discord.linked', null, jsonb_build_object('consent_version', p_consent_version));
  return jsonb_build_object('ok', true, 'link', lv.discord_link_json(l));
end;
$$;

create function lv.api_discord_connect_confirm(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  d lv.discord_codes;
  v_hub uuid;
  dc lv.discord_connections;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into d from lv.discord_codes x
   where x.code_hash = lv.sha256_hex(upper(btrim(coalesce(p_code, '')))) and x.kind = 'connect' for update;
  if d.code_hash is null or d.consumed_at is not null or d.expires_at <= now() then
    return lv.err('lv_invalid_code', 'This link has expired or was already used. Run /lunchvoice connect again.');
  end if;
  select h.id into v_hub from lv.hubs h where h.slug = d.hub_slug and h.kind = 'community';
  if v_hub is null or not (lv.is_owner(v_account, v_hub) or lv.has_capability(v_account, v_hub, 'hub.settings.manage')) then
    return lv.err('lv_not_found', 'Only a manager of that Hub can confirm this connection.');
  end if;
  if lv.integration_blocked(v_hub, v_account) then return lv.err('lv_forbidden', 'This Hub is suspended.'); end if;
  update lv.discord_codes set consumed_at = now() where code_hash = d.code_hash;
  insert into lv.discord_connections (guild_id, hub_id, channel_id, confirmed_by)
  values (d.guild_id, v_hub, d.channel_id, v_account)
  on conflict (guild_id, hub_id) do update set channel_id = excluded.channel_id, confirmed_by = excluded.confirmed_by, confirmed_at = now()
  returning * into dc;
  perform lv.audit(v_account, v_hub, 'discord.connected', dc.id::text, jsonb_build_object('guild_id', d.guild_id));
  return jsonb_build_object('ok', true, 'connection_id', dc.id, 'hub_id', v_hub);
end;
$$;

create function lv.api_discord_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  l lv.discord_links;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into l from lv.discord_links x where x.account_id = v_account;
  return jsonb_build_object('ok', true, 'link', lv.discord_link_json(l));
end;
$$;

create function lv.api_discord_unlink() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_n int;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  delete from lv.discord_links where account_id = v_account;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform lv.audit(v_account, null, 'discord.unlinked', null); end if;
  return jsonb_build_object('ok', true, 'unlinked', v_n > 0);
end;
$$;

create function lv.api_discord_connections(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null or lv.hub_kind(p_hub) <> 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not (lv.is_owner(v_account, p_hub) or lv.has_capability(v_account, p_hub, 'hub.settings.manage')) then
    return lv.err('lv_forbidden', 'Managing Discord requires hub.settings.manage.');
  end if;
  return jsonb_build_object('ok', true, 'connections', coalesce((
    select jsonb_agg(jsonb_build_object('connection_id', d.id, 'guild_name', g.guild_name, 'channel_id', d.channel_id,
             'auto_post', d.auto_post, 'confirmed_at', d.confirmed_at, 'disabled', g.disabled_at is not null,
             'role_rules', (select count(*) from lv.discord_role_rules r where r.guild_id = d.guild_id and r.hub_id = p_hub))
           order by d.confirmed_at)
      from lv.discord_connections d join lv.discord_guilds g on g.guild_id = d.guild_id where d.hub_id = p_hub), '[]'::jsonb));
end;
$$;

create function lv.api_discord_connection_update(p_connection uuid, p_auto_post boolean, p_remove boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  d lv.discord_connections;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into d from lv.discord_connections x where x.id = p_connection;
  if d.id is null or lv.membership_of(v_account, d.hub_id) is null then return lv.err('lv_not_found', 'No such connection.'); end if;
  if not (lv.is_owner(v_account, d.hub_id) or lv.has_capability(v_account, d.hub_id, 'hub.settings.manage')) then
    return lv.err('lv_forbidden', 'Managing Discord requires hub.settings.manage.');
  end if;
  if coalesce(p_remove, false) then
    delete from lv.discord_connections where id = d.id;
    delete from lv.discord_role_rules where guild_id = d.guild_id and hub_id = d.hub_id;
    perform lv.audit(v_account, d.hub_id, 'discord.disconnected', d.id::text);
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  update lv.discord_connections set auto_post = coalesce(p_auto_post, auto_post) where id = d.id;
  return jsonb_build_object('ok', true, 'removed', false);
end;
$$;

create function lv.api_admin_discord_guilds() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not lv.is_platform_admin(lv.current_account_id()) then return lv.err('lv_forbidden', 'Staff only.'); end if;
  return jsonb_build_object('ok', true, 'guilds', coalesce((select jsonb_agg(jsonb_build_object('guild_id', g.guild_id,
    'guild_name', g.guild_name, 'disabled', g.disabled_at is not null, 'disabled_reason', g.disabled_reason, 'created_at', g.created_at,
    'connections', (select count(*) from lv.discord_connections d where d.guild_id = g.guild_id)) order by g.created_at desc)
    from lv.discord_guilds g), '[]'::jsonb));
end;
$$;

create function lv.api_admin_discord_guild_disable(p_guild text, p_disabled boolean, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if not lv.is_platform_admin(v_account) then return lv.err('lv_forbidden', 'Staff only.'); end if;
  update lv.discord_guilds set disabled_at = case when p_disabled then coalesce(disabled_at, now()) end,
         disabled_reason = case when p_disabled then left(p_reason, 200) end
   where guild_id = p_guild;
  if not found then return lv.err('lv_not_found', 'No such server.'); end if;
  perform lv.audit(v_account, null, case when p_disabled then 'discord.guild_disabled' else 'discord.guild_enabled' end, p_guild);
  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================================================================
-- lv_api wrappers
-- =========================================================================================================
create function lv_api.lv_api_keys_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_keys_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_api_key_create(p_hub uuid, p_name text, p_scopes text[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_key_create(p_hub, p_name, p_scopes); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_api_key_revoke(p_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_key_revoke(p_key); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_webhook_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.webhook_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_webhook_create(p_hub uuid, p_url text, p_events text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.webhook_create(p_hub, p_url, p_events); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_webhook_update(p_endpoint uuid, p_events text[] default null, p_enabled boolean default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.webhook_update_in_hub(null, p_endpoint, p_events, p_enabled); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_webhook_delete(p_endpoint uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.webhook_delete_in_hub(null, p_endpoint); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_code_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_discord_code_preview(p_code); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_link_confirm(p_code text, p_consent_version text, p_role_facts boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_discord_link_confirm(p_code, p_consent_version, p_role_facts); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_connect_confirm(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_discord_connect_confirm(p_code); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_discord_me(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_unlink() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_discord_unlink(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_connections(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_discord_connections(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_discord_connection_update(p_connection uuid, p_auto_post boolean default null, p_remove boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_discord_connection_update(p_connection, p_auto_post, p_remove); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_discord_guilds() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_discord_guilds(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_discord_guild_disable(p_guild text, p_disabled boolean, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_discord_guild_disable(p_guild, p_disabled, p_reason); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- =========================================================================================================
-- Grants: explicit, never PUBLIC (LC-05). Signed-in only; nothing for anon. Service role: the three entry points
-- plus the dispatcher functions. lv tables stay unexposed.
-- =========================================================================================================
do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'lv_api'
              and p.proname in ('lv_api_keys_list', 'lv_api_key_create', 'lv_api_key_revoke', 'lv_webhook_list', 'lv_webhook_create',
                                'lv_webhook_update', 'lv_webhook_delete', 'lv_discord_code_preview', 'lv_discord_link_confirm',
                                'lv_discord_connect_confirm', 'lv_discord_me', 'lv_discord_unlink', 'lv_discord_connections',
                                'lv_discord_connection_update', 'lv_admin_discord_guilds', 'lv_admin_discord_guild_disable') loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', r.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', r.sig); end if;
  end loop;
end $$;

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
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema lv to service_role';
    execute 'grant execute on function lv.api_key_call(text, text, jsonb), lv.webhook_claim(int),
      lv.webhook_mark(uuid, text, int, int, text), lv.webhook_sweep(), lv.discord_interaction(text, jsonb),
      lv.discord_role_plan(text, text), lv.discord_roles_applied(text, text, text[], text[]), lv.discord_claim(int),
      lv.discord_mark(uuid, text, text) to service_role';
  end if;
end $$;

commit;
