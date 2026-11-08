-- LunchVoice v2 canonical 18: hardening and API gaps (build plan 2026-11-21, track A).
--
-- Binding sources: docs/v2/BUILD_PLAN_2026-11-21.md (track A), docs/v2/LAUNCH_PLAN.md (F-01..F-13),
-- docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md (LC-10, LC-12, LC-13, NEW-05). 000001-000017 are released as they
-- are; this file changes behaviour only through create-or-replace, new columns and new objects.
--
-- LC-10  Join codes. Every Campaign gets a separate 128-bit link token (campaigns.link_token, from the CSPRNG) for
--        links and QR codes; the 6-character join code stays for typing only. Join-code lookups (lv_guest_campaign_get,
--        lv_guest_submit) are rate limited in the database: failed lookups are counted per caller (account, or a
--        daily-rotated hash of the client IP that PostgREST forwards, never the IP itself) and across all signed-out
--        callers (policies joincode.misses_per_minute 10, joincode.global_misses_per_minute 300). Counters live 10
--        minutes. Unknown, closed and not-for-you codes still answer the same lv_not_found; a caller over the limit
--        gets lv_rate_limited even for a valid code, so a limited caller learns nothing. Link tokens are not limited.
-- LC-12  lv.caller_identity() accepts only LunchVoice sessions: aud = 'authenticated' (string, or an array holding it)
--        and session_kind = 'lunchvoice', exactly what the `session` Edge Function issues. A raw KpnIdentity ID token
--        or a token minted for another KpnSolute app is refused even if its issuer is trusted.
-- LC-13  lv.session_exchange_consume(key_hash, expires_at): single-use record of exchanged ID tokens for the
--        `session` Edge Function (service_role only). A replayed ID token is refused.
-- NEW-05 Campaign invite tokens are stored as SHA-256 hashes (lv.invite_hash, as Hub invites) with a 6-character
--        prefix for listing. The token is shown once, at creation. Redeem and revoke by token hash; revoke by id is
--        added for the list. Existing tokens are hashed in place, so existing invite links keep working.
-- Gaps   Campaign description; server-side validation of choice options (2-10, unique, non-empty, config.max within
--        1..option count) on question add/update; Quick Survey access change while draft (lv_campaign_update p_access,
--        personal space only; invite => no guests); Team role targeting (lv_campaign_set_audience_roles; Team family
--        via plan_limits 'campaigns.role_targeting'; eligibility and thresholds count only members holding a targeted
--        role; guests unaffected); plan limits and usage for any campaign manager (lv_hub_limits, no billing data);
--        owner transfer becomes a pending offer that the receiving member accepts or declines (the Owner stays
--        protected and unchanged until it is accepted).

begin;

-- =========================================================================================================
-- LC-12: only LunchVoice sessions are identities
-- =========================================================================================================
create or replace function lv.caller_identity() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_claims jsonb;
  v_trusted jsonb;
  v_iss text;
  v_sub text;
  v_aud jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_claims is null or jsonb_typeof(v_claims) <> 'object' then return null; end if;

  -- LC-12: the token must be a LunchVoice session (the `session` Edge Function's output), never a raw KpnIdentity
  -- ID token or a token another KpnSolute application minted with the same issuer.
  v_aud := v_claims->'aud';
  if not coalesce(case jsonb_typeof(v_aud)
                    when 'string' then (v_aud #>> '{}') = 'authenticated'
                    when 'array' then v_aud ? 'authenticated'
                    else false end, false) then
    return null;
  end if;
  if coalesce(v_claims->>'session_kind', '') <> 'lunchvoice' then return null; end if;

  v_iss := nullif(btrim(v_claims->>'iss'), '');
  v_sub := nullif(btrim(v_claims->>'sub'), '');
  -- A UUID subject is required today (IDENTITY_CONTRACT §2). Non-UUID subjects are refused, not coerced.
  if v_iss is null or v_sub is null then return null; end if;
  if v_sub !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null; end if;

  v_trusted := lv.policy_json('identity.trusted_issuers');
  if v_trusted is null or jsonb_typeof(v_trusted) <> 'array' then return null; end if;
  if not (v_trusted ? v_iss) then return null; end if;

  return jsonb_build_object(
    'issuer', v_iss,
    'subject', lower(v_sub),
    'email', nullif(btrim(v_claims->>'email'), ''),
    'name', nullif(btrim(v_claims->>'name'), ''),
    'picture', nullif(btrim(v_claims->>'picture'), ''),
    'email_verified', coalesce(v_claims->>'email_verified', 'false') = 'true'
  );
end;
$$;

-- =========================================================================================================
-- LC-13: single-use ID-token exchanges (service_role only, called by the `session` Edge Function)
-- =========================================================================================================
create table lv.session_exchanges (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index session_exchanges_expiry_idx on lv.session_exchanges (expires_at);
alter table lv.session_exchanges enable row level security;

-- TRUE the first time a key is seen (the exchange may proceed), FALSE for a replay. The key is a SHA-256 of the
-- ID token's issuer, subject and nonce/jti computed by the function: no token, email or name is stored.
create function lv.session_exchange_consume(p_key_hash text, p_expires_at timestamptz) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_new boolean;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'lv_invalid_input: key_hash must be a lowercase sha256 hex digest' using errcode = '22023';
  end if;
  delete from lv.session_exchanges where expires_at < now();
  insert into lv.session_exchanges (key_hash, expires_at)
  values (p_key_hash, least(greatest(coalesce(p_expires_at, now() + interval '1 hour'), now() + interval '1 minute'), now() + interval '1 day'))
  on conflict (key_hash) do nothing
  returning true into v_new;
  return coalesce(v_new, false);
end;
$$;

-- =========================================================================================================
-- LC-10: link tokens and join-code rate limits
-- =========================================================================================================
create function lv.new_link_token() returns text
language sql volatile set search_path = ''
as $$ select encode(lv.random_bytes(16), 'hex') $$;

alter table lv.campaigns add column link_token text not null default lv.new_link_token();
alter table lv.campaigns add constraint campaigns_link_token_key unique (link_token);
alter table lv.campaigns add constraint campaigns_link_token_format check (link_token ~ '^[0-9a-f]{32}$');

create function lv.is_link_token(p_code text) returns boolean
language sql immutable set search_path = ''
as $$ select btrim(coalesce(p_code, '')) ~ '^[0-9a-fA-F]{32}$' $$;

-- A Campaign by its typed join code or its link token. No status filter: callers decide what may be shown.
create function lv.campaign_id_by_code(p_code text) returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.id from lv.campaigns c
   where case when lv.is_link_token(p_code) then c.link_token = lower(btrim(p_code))
              else c.join_code = upper(btrim(coalesce(p_code, ''))) end
$$;

insert into lv.policy (key, value, note) values
  ('joincode.misses_per_minute', '10'::jsonb,
   'LC-10: failed join-code lookups one caller (account or hashed client IP) may make per minute. Link tokens are not limited.'),
  ('joincode.global_misses_per_minute', '300'::jsonb,
   'LC-10: failed join-code lookups per minute across all signed-out callers together.');

-- Failed lookups only (never the code, never an IP: the caller key is an account id or a daily-rotated IP hash).
create table lv.join_code_misses (
  id bigserial primary key,
  caller_key text not null,
  signed_in boolean not null,
  at timestamptz not null default now()
);
create index join_code_misses_caller_idx on lv.join_code_misses (caller_key, at);
create index join_code_misses_at_idx on lv.join_code_misses (at);
alter table lv.join_code_misses enable row level security;

create function lv.request_caller_key() returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_headers jsonb;
  v_ip text;
begin
  if v_account is not null then return 'a:' || v_account::text; end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  if v_headers is not null and jsonb_typeof(v_headers) = 'object' then
    v_ip := nullif(btrim(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip',
                                  split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1))), '');
  end if;
  if v_ip is null then return 'anon'; end if;
  return 'ip:' || lv.sha256_hex('lv-joincode:' || v_ip || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
end;
$$;

-- NULL when the lookup may proceed, else the lv_rate_limited envelope.
create function lv.code_lookup_blocked(p_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_key text;
  v_mine int;
  v_all int;
begin
  if lv.is_link_token(p_code) then return null; end if;
  v_key := lv.request_caller_key();
  select count(*) into v_mine from lv.join_code_misses m where m.caller_key = v_key and m.at > now() - interval '1 minute';
  if v_mine >= coalesce((lv.policy_json('joincode.misses_per_minute'))::int, 0) then
    return lv.err('lv_rate_limited', 'Too many codes tried. Wait a minute and try again.');
  end if;
  if v_key not like 'a:%' then
    select count(*) into v_all from lv.join_code_misses m where not m.signed_in and m.at > now() - interval '1 minute';
    if v_all >= coalesce((lv.policy_json('joincode.global_misses_per_minute'))::int, 0) then
      return lv.err('lv_rate_limited', 'Too many codes tried. Wait a minute and try again.');
    end if;
  end if;
  return null;
end;
$$;

create function lv.code_lookup_miss(p_code text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_key text;
begin
  if lv.is_link_token(p_code) then return; end if;
  v_key := lv.request_caller_key();
  insert into lv.join_code_misses (caller_key, signed_in) values (v_key, v_key like 'a:%');
  delete from lv.join_code_misses where at < now() - interval '10 minutes';
end;
$$;

-- =========================================================================================================
-- Campaign description (gap) and role targeting (gap): columns and tables
-- =========================================================================================================
alter table lv.campaigns add column description text check (description is null or length(description) <= 2000);
alter table lv.campaigns add column audience_scope text not null default 'all_members'
  check (audience_scope in ('all_members', 'roles'));

-- The Hub roles a role-targeted Campaign is for. Deleting a role removes it here; a Campaign left with no role
-- keeps audience_scope 'roles' and so reaches nobody (it never widens to every member) until it is edited.
create table lv.campaign_audience_roles (
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  role_id uuid not null references lv.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, role_id)
);
create index campaign_audience_roles_role_idx on lv.campaign_audience_roles (role_id);
alter table lv.campaign_audience_roles enable row level security;

insert into lv.plan_limits (family, key, value, note) values
  ('starter', 'campaigns.role_targeting', 'false', 'Build plan track A: audience by Hub role is a Team feature.'),
  ('team', 'campaigns.role_targeting', 'true', 'Canonical: advanced role targeting on Team.')
on conflict (family, key) do nothing;

-- Is this account in the Campaign's member audience? Every member for 'all_members'; for 'roles', an accepted
-- member holding at least one targeted role. Says nothing about guests, link or invite access.
create function lv.in_campaign_audience(p_campaign uuid, p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when c.audience_scope = 'all_members' then true
                else exists (select 1 from lv.campaign_audience_roles ar
                               join lv.membership_roles mr on mr.role_id = ar.role_id
                               join lv.hub_memberships m on m.id = mr.membership_id
                              where ar.campaign_id = c.id and m.hub_id = c.hub_id and m.account_id = p_account
                                and m.status = 'accepted') end
      from lv.campaigns c where c.id = p_campaign), false)
$$;

create function lv.campaign_audience_json(p_campaign uuid, p_with_options boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'scope', c.audience_scope,
           'roles', coalesce((select jsonb_agg(jsonb_build_object('role_id', r.id, 'name', r.name) order by lower(r.name))
                                from lv.campaign_audience_roles ar join lv.roles r on r.id = ar.role_id
                               where ar.campaign_id = c.id), '[]'::jsonb),
           'role_targeting', coalesce(lv.hub_limit(c.hub_id, 'campaigns.role_targeting') = 'true'::jsonb, false))
         || case when p_with_options then jsonb_build_object('available_roles', coalesce((
                select jsonb_agg(jsonb_build_object('role_id', r.id, 'name', r.name, 'is_owner', r.is_owner)
                                 order by r.is_owner desc, lower(r.name))
                  from lv.roles r where r.hub_id = c.hub_id), '[]'::jsonb))
              else '{}'::jsonb end
    from lv.campaigns c where c.id = p_campaign
$$;

-- Members answer only when they are in the audience; link and invite access are unchanged.
create or replace function lv.can_participate(p_campaign uuid, p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_account is not null and exists (
    select 1 from lv.campaigns c
     where c.id = p_campaign
       and ((lv.membership_of(p_account, c.hub_id) is not null and lv.in_campaign_audience(c.id, p_account))
            or c.access = 'link'
            or (c.access = 'invite' and exists (select 1 from lv.campaign_eligibility e
                                                 where e.campaign_id = c.id and e.account_id = p_account))))
$$;

-- Thresholds and participation rates count only members holding a targeted role (all accepted members otherwise).
create or replace function lv.campaign_member_participation(p_campaign uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case c.access
    when 'invite' then jsonb_build_object(
      'participants', (select count(distinct p.account_id) from lv.participation p
                         join lv.campaign_eligibility e on e.campaign_id = p.campaign_id and e.account_id = p.account_id
                        where p.campaign_id = c.id),
      'eligible', (select count(*) from lv.campaign_eligibility e where e.campaign_id = c.id))
    when 'link' then jsonb_build_object(
      'participants', (select count(distinct p.account_id) from lv.participation p where p.campaign_id = c.id),
      'eligible', null)
    else jsonb_build_object(
      'participants', (select count(distinct p.account_id)
                         from lv.participation p
                         join lv.hub_memberships m on m.hub_id = p.hub_id and m.account_id = p.account_id and m.status = 'accepted'
                        where p.campaign_id = c.id
                          and (c.audience_scope = 'all_members'
                               or exists (select 1 from lv.membership_roles mr
                                            join lv.campaign_audience_roles ar on ar.role_id = mr.role_id and ar.campaign_id = c.id
                                           where mr.membership_id = m.id))),
      'eligible', (select count(*) from lv.hub_memberships m
                    where m.hub_id = c.hub_id and m.status = 'accepted'
                      and (c.audience_scope = 'all_members'
                           or exists (select 1 from lv.membership_roles mr
                                        join lv.campaign_audience_roles ar on ar.role_id = mr.role_id and ar.campaign_id = c.id
                                       where mr.membership_id = m.id))))
    end
    from lv.campaigns c where c.id = p_campaign
$$;

-- The gate adds two reasons for a role-targeted Campaign: role_targeting_unavailable (the Hub's plan does not
-- include it, e.g. after a downgrade) and audience_empty (every targeted role was deleted).
create or replace function lv.gate_evaluate(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c record;
  v_questions int;
  v_reasons jsonb := '[]'::jsonb;
  v_cap jsonb;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('not_found')); end if;

  if c.status <> 'draft' then v_reasons := v_reasons || to_jsonb('not_draft'::text); end if;
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;
  select count(*) into v_questions from lv.campaign_questions q where q.campaign_id = c.id;
  if v_questions = 0 then v_reasons := v_reasons || to_jsonb('no_questions'::text); end if;
  if c.audience_scope = 'roles' then
    if not coalesce(lv.hub_limit(c.hub_id, 'campaigns.role_targeting') = 'true'::jsonb, false) then
      v_reasons := v_reasons || to_jsonb('role_targeting_unavailable'::text);
    end if;
    if not exists (select 1 from lv.campaign_audience_roles ar where ar.campaign_id = c.id) then
      v_reasons := v_reasons || to_jsonb('audience_empty'::text);
    end if;
  end if;

  v_cap := lv.capacity_check(p_campaign);
  v_reasons := v_reasons || (v_cap->'reasons');
  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons) || (v_cap - 'reasons');
end;
$$;

-- The published version records the targeted roles and never the link token.
create or replace function lv.snapshot_published_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan jsonb := lv.hub_plan(new.hub_id);
begin
  if old.status = 'draft' and new.status = 'active' then
    insert into lv.campaign_versions (campaign_id, version, published_by, settings, questions)
    values (new.id, new.revision, lv.current_account_id(),
      (to_jsonb(new) - 'join_code' - 'link_token' - 'status' - 'activated_at' - 'closed_at' - 'paused_at' - 'archived_at' - 'revision')
        || jsonb_build_object('audience_roles', coalesce((select jsonb_agg(ar.role_id order by ar.role_id)
                                                            from lv.campaign_audience_roles ar where ar.campaign_id = new.id), '[]'::jsonb))
        || jsonb_build_object('entitlement', jsonb_build_object(
             'family', v_plan->>'family', 'product', v_plan->>'product',
             'limits', coalesce((select jsonb_object_agg(l.key, l.value) from lv.plan_limits l
                                  where l.family = v_plan->>'family'), '{}'::jsonb))),
      coalesce((select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                                    'prompt', q.prompt, 'config', q.config) order by q.position)
                  from lv.campaign_questions q where q.campaign_id = new.id), '[]'::jsonb));
  end if;
  return new;
end;
$$;

create function lv.api_campaign_set_audience_roles(p_campaign uuid, p_roles uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_roles uuid[] := (select array_agg(distinct x) from unnest(coalesce(p_roles, '{}'::uuid[])) x where x is not null);
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if lv.hub_kind(c.hub_id) = 'personal' then
    return lv.err('lv_not_available', 'Quick Surveys are answered by link or invite, not by Hub role.');
  end if;
  if c.status <> 'draft' then return lv.err('lv_locked', 'The audience is part of the published version and can only change in a draft.'); end if;

  if v_roles is null or cardinality(v_roles) = 0 then
    delete from lv.campaign_audience_roles where campaign_id = c.id;
    update lv.campaigns set audience_scope = 'all_members' where id = c.id;
    perform lv.audit(v_account, c.hub_id, 'campaign.audience_set', c.id::text, jsonb_build_object('scope', 'all_members'));
    return jsonb_build_object('ok', true, 'audience', lv.campaign_audience_json(c.id, false));
  end if;

  if not coalesce(lv.hub_limit(c.hub_id, 'campaigns.role_targeting') = 'true'::jsonb, false) then
    return lv.err_x('lv_entitlement_required', 'Choosing Campaign participants by role comes with the Team plan.',
                    jsonb_build_object('product', 'team_hub'));
  end if;
  if cardinality(v_roles) > 20 then return lv.err('lv_invalid_input', 'Pick at most 20 roles.'); end if;
  if exists (select 1 from unnest(v_roles) x where not exists (select 1 from lv.roles r where r.id = x and r.hub_id = c.hub_id)) then
    return lv.err('lv_invalid_input', 'Every role must belong to this Hub.');
  end if;

  delete from lv.campaign_audience_roles where campaign_id = c.id and not (role_id = any (v_roles));
  insert into lv.campaign_audience_roles (campaign_id, role_id) select c.id, x from unnest(v_roles) x on conflict do nothing;
  update lv.campaigns set audience_scope = 'roles' where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.audience_set', c.id::text,
                   jsonb_build_object('scope', 'roles', 'roles', to_jsonb(v_roles)));
  return jsonb_build_object('ok', true, 'audience', lv.campaign_audience_json(c.id, false));
end;
$$;

-- =========================================================================================================
-- Server-side validation of choice options (gap)
-- =========================================================================================================
create function lv.question_config_problem(p_kind text, p_config jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_opts jsonb;
  v_n int;
  v_distinct int;
  v_max jsonb;
begin
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then return 'Question settings must be an object.'; end if;
  if p_kind is null or p_kind not in ('single_choice', 'multi_choice') then return null; end if;
  v_opts := p_config->'options';
  if v_opts is null or jsonb_typeof(v_opts) <> 'array' then return 'A choice question needs 2 to 10 options.'; end if;
  v_n := jsonb_array_length(v_opts);
  if v_n < 2 or v_n > 10 then return 'A choice question needs 2 to 10 options.'; end if;
  if exists (select 1 from jsonb_array_elements(v_opts) e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '') then
    return 'Every option needs text.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_opts) e where length(e #>> '{}') > 200) then
    return 'Keep each option to 200 characters.';
  end if;
  select count(distinct lower(btrim(e #>> '{}'))) into v_distinct from jsonb_array_elements(v_opts) e;
  if v_distinct < v_n then return 'Options must all be different.'; end if;
  v_max := p_config->'max';
  if v_max is not null and v_max <> 'null'::jsonb then
    if jsonb_typeof(v_max) <> 'number' or (v_max)::numeric <> floor((v_max)::numeric)
       or (v_max)::numeric < 1 or (v_max)::numeric > v_n then
      return 'The most choices a person can pick must be between 1 and the number of options.';
    end if;
  end if;
  return null;
end;
$$;

create or replace function lv_api.lv_campaign_question_add(p_campaign uuid, p_position int, p_kind text, p_prompt text, p_config jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_bad text;
begin
  perform lv.quick_question_guard(p_campaign, p_kind, true);
  v_bad := lv.question_config_problem(p_kind, coalesce(p_config, '{}'::jsonb));
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;
  return lv.api_campaign_question_add(p_campaign, p_position, p_kind, p_prompt, p_config);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create or replace function lv_api.lv_campaign_question_update(p_question uuid, p_position int default null, p_kind text default null,
                                                              p_prompt text default null, p_config jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  q record;
  v_bad text;
begin
  select * into q from lv.campaign_questions x where x.id = p_question;
  perform lv.quick_question_guard(q.campaign_id, p_kind, false);
  if q.id is not null and (p_kind is not null or p_config is not null) then
    v_bad := lv.question_config_problem(coalesce(p_kind, q.kind), coalesce(p_config, q.config));
    if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;
  end if;
  return lv.api_campaign_question_update(p_question, p_position, p_kind, p_prompt, p_config);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- =========================================================================================================
-- Campaign create / update: description, Quick Survey access (gaps)
-- =========================================================================================================
drop function lv_api.lv_campaign_create(uuid, text, text, text);
create function lv_api.lv_campaign_create(p_hub uuid, p_title text, p_mode text, p_anonymity text default 'anonymous',
                                          p_description text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
  v_desc text := nullif(btrim(p_description), '');
begin
  if lv.hub_kind(p_hub) = 'personal' and lv.membership_of(lv.current_account_id(), p_hub) is not null then
    return lv.err('lv_not_available', 'Use lv_quick_survey_create for your personal space.');
  end if;
  if v_desc is not null and length(v_desc) > 2000 then return lv.err('lv_invalid_input', 'Keep the description to 2000 characters.'); end if;
  v_out := lv.api_campaign_create(p_hub, p_title, p_mode, p_anonymity);
  if (v_out->>'ok')::boolean and v_desc is not null then
    update lv.campaigns set description = v_desc where id = (v_out->>'campaign_id')::uuid;
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- p_description: NULL leaves it, '' clears it. p_access (Quick Surveys only, draft only): 'link' or 'invite';
-- switching to invite turns guests off (an invite-only survey never admits guests).
drop function lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean);
create function lv_api.lv_campaign_update(p_campaign uuid, p_title text default null, p_mode text default null,
                                          p_anonymity text default null, p_opens_at timestamptz default null,
                                          p_closes_at timestamptz default null, p_clear_schedule boolean default false,
                                          p_description text default null, p_access text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid := (select c.hub_id from lv.campaigns c where c.id = p_campaign);
  v_out jsonb;
begin
  if p_mode is not null and p_mode <> 'survey' and lv.hub_kind(v_hub) = 'personal' then
    return lv.err('lv_invalid_input', 'A Quick Survey is always a survey.');
  end if;
  if p_description is not null and length(btrim(p_description)) > 2000 then
    return lv.err('lv_invalid_input', 'Keep the description to 2000 characters.');
  end if;
  if p_access is not null and p_access not in ('link', 'invite') then
    return lv.err('lv_invalid_input', 'Access is link or invite.');
  end if;

  v_out := lv.api_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule);
  if not (v_out->>'ok')::boolean then return v_out; end if;

  if p_access is not null then
    -- After the manager and draft checks above, so the Hub kind is never revealed to anyone else. Raising undoes
    -- the update made above (this block is one subtransaction).
    if lv.hub_kind(v_hub) <> 'personal' then
      perform lv.fail('lv_invalid_input', 'Only a Quick Survey chooses link or invite access; Hub Campaigns are for members.');
    end if;
    update lv.campaigns
       set access = p_access,
           audience = case when p_access = 'invite' then 'members' else audience end
     where id = p_campaign;
  end if;
  if p_description is not null then
    update lv.campaigns set description = nullif(btrim(p_description), '') where id = p_campaign;
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- Quick Survey summaries carry the description.
create or replace function lv.campaign_summary(p_campaign uuid, p_manage boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'campaign_id', c.id, 'title', c.title, 'description', c.description, 'mode', c.mode, 'anonymity', c.anonymity,
           'status', c.status, 'phase', lv.campaign_phase(c.status, c.opens_at, c.closes_at), 'access', c.access,
           'guests', c.audience = 'members_and_guests', 'opens_at', c.opens_at, 'closes_at', c.closes_at,
           'created_at', c.created_at, 'blocked', c.blocked_at is not null,
           'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
           'join_code', case when p_manage then c.join_code end,
           'link_token', case when p_manage then c.link_token end)
    from lv.campaigns c where c.id = p_campaign
$$;

-- =========================================================================================================
-- Reads: list, get and the join-code entry point
-- =========================================================================================================
create or replace function lv_api.lv_campaign_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_manage boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  v_manage := lv.has_capability(v_account, p_hub, 'campaign.manage');

  return jsonb_build_object('ok', true, 'campaigns', coalesce((
    select jsonb_agg(jsonb_build_object(
             'campaign_id', c.id, 'title', c.title, 'description', c.description, 'mode', c.mode, 'anonymity', c.anonymity,
             'status', c.status, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'created_at', c.created_at,
             'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
             'has_responded', exists (select 1 from lv.participation p where p.campaign_id = c.id and p.account_id = v_account),
             'audience_scope', case when v_manage then c.audience_scope end,
             'join_code', case when v_manage then c.join_code else null end)
           order by c.created_at desc)
      from lv.campaigns c
     -- Members see published Campaigns meant for them; a role-targeted Campaign is invisible to other roles.
     where c.hub_id = p_hub and (v_manage or (c.status <> 'draft' and lv.in_campaign_audience(c.id, v_account)))), jsonb_build_array()));
end;
$$;

create or replace function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_member boolean;
  v_manage boolean;
  v_responded boolean;
  v_receipt uuid;
  v_open boolean;
  v_out jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  v_member := lv.membership_of(v_account, c.hub_id) is not null;
  v_manage := v_member and lv.has_capability(v_account, c.hub_id, 'campaign.manage');
  if not v_manage then
    if v_member and not lv.in_campaign_audience(c.id, v_account) then return lv.err('lv_not_found', 'No such Campaign.'); end if;
    if not v_member and not (c.status = 'active' and lv.can_participate(c.id, v_account)) then
      return lv.err('lv_not_found', 'No such Campaign.');
    end if;
    if c.status = 'draft' or c.blocked_at is not null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  end if;

  select true, p.receipt_id into v_responded, v_receipt
    from lv.participation p where p.campaign_id = c.id and p.account_id = v_account;
  v_responded := coalesce(v_responded, false);
  v_open := c.status = 'active'
            and (c.opens_at is null or c.opens_at <= now())
            and (c.closes_at is null or c.closes_at > now());

  v_out := jsonb_build_object('ok', true,
    'campaign', jsonb_build_object(
      'campaign_id', c.id, 'hub_id', case when v_member then c.hub_id end, 'title', c.title, 'description', c.description,
      'mode', c.mode, 'anonymity', c.anonymity, 'status', c.status, 'revision', c.revision, 'opens_at', c.opens_at,
      'closes_at', c.closes_at, 'access', c.access, 'audience', c.audience),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), jsonb_build_array()),
    'has_responded', v_responded,
    'receipt_id', v_receipt,
    'can_respond', v_open and c.blocked_at is null and not v_responded and lv.can_participate(c.id, v_account),
    'can_manage', v_manage);

  if v_manage then
    v_out := v_out || jsonb_build_object('join_code', c.join_code, 'link_token', c.link_token, 'gate', lv.gate_evaluate(c.id),
                                         'blocked', c.blocked_at is not null, 'blocked_reason', c.blocked_reason,
                                         'audience', lv.campaign_audience_json(c.id, lv.hub_kind(c.hub_id) = 'community'));
  end if;
  return v_out;
end;
$$;

-- Guests never reach an invite-only Campaign. Found by the typed code or the link token.
create or replace function lv.guest_campaign(p_join_code text) returns lv.campaigns
language sql stable security definer set search_path = ''
as $$
  select c.* from lv.campaigns c
   where c.id = lv.campaign_id_by_code(p_join_code)
     and c.audience = 'members_and_guests'
     and c.access <> 'invite'
     and c.status = 'active'
     and c.blocked_at is null
$$;

create or replace function lv.api_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_account uuid := lv.current_account_id();
  v_hub record;
  v_phase text;
  v_full boolean;
  v_guest_ok boolean;
  v_signed_ok boolean;
  v_responded boolean := false;
begin
  select * into c from lv.campaigns x where x.id = lv.campaign_id_by_code(p_join_code) and x.status = 'active' and x.blocked_at is null;
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  v_guest_ok := c.audience = 'members_and_guests' and c.access <> 'invite';
  v_signed_ok := v_account is not null and lv.can_participate(c.id, v_account);
  if not (v_guest_ok or v_signed_ok or (c.access = 'link' and v_account is null)) then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;

  select h.display_name, h.kind into v_hub from lv.hubs h where h.id = c.hub_id;
  v_phase := lv.campaign_phase(c.status, c.opens_at, c.closes_at);
  v_full := c.guest_limit is not null
            and (select count(*) from lv.guest_participation g where g.campaign_id = c.id) >= c.guest_limit;
  if v_signed_ok then
    v_responded := exists (select 1 from lv.participation p where p.campaign_id = c.id and p.account_id = v_account);
  end if;
  return jsonb_build_object('ok', true,
    'campaign', jsonb_build_object('campaign_id', c.id, 'title', c.title, 'description', c.description, 'mode', c.mode,
                                   'anonymity', c.anonymity, 'phase', v_phase, 'opens_at', c.opens_at, 'closes_at', c.closes_at,
                                   'access', c.access, 'guests_allowed', v_guest_ok),
    -- A personal space is never named: the respondent sees LunchVoice, not "Personal space".
    'hub', jsonb_build_object('name', case when v_hub.kind = 'personal' then null else v_hub.display_name end),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), '[]'::jsonb),
    -- The typed code, so a respondent who came by link can report the survey or tell someone the code.
    'join_code', c.join_code,
    'signed_in', v_account is not null,
    'sign_in_required', not v_guest_ok and not v_signed_ok,
    'has_responded', v_responded,
    'can_respond', v_phase = 'open' and ((v_signed_ok and not v_responded) or (not v_signed_ok and v_guest_ok and not v_full)));
end;
$$;

-- The join-code entry points count failed lookups (volatile now: PostgREST runs it read-write).
create or replace function lv_api.lv_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  v_out := lv.api_guest_campaign_get(p_join_code);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create or replace function lv_api.lv_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  v_out := lv.api_guest_submit(p_join_code, p_guest_key, p_answers);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- =========================================================================================================
-- NEW-05: Campaign invite tokens are stored hashed
-- =========================================================================================================
alter table lv.campaign_invites add column token_hash text;
alter table lv.campaign_invites add column token_prefix text;
update lv.campaign_invites set token_hash = lv.invite_hash(token), token_prefix = left(upper(btrim(token)), 6);
alter table lv.campaign_invites alter column token_hash set not null;
alter table lv.campaign_invites alter column token_prefix set not null;
alter table lv.campaign_invites add constraint campaign_invites_token_hash_key unique (token_hash);
alter table lv.campaign_invites add constraint campaign_invites_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$');
alter table lv.campaign_invites drop constraint campaign_invites_token_key;
alter table lv.campaign_invites drop column token;

create or replace function lv.campaign_invite_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('invite_id', i.id, 'prefix', i.token_prefix, 'max_uses', i.max_uses, 'uses', i.uses,
           'expires_at', i.expires_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at,
           'state', case when i.revoked_at is not null then 'revoked'
                         when i.expires_at is not null and i.expires_at <= now() then 'expired'
                         when i.max_uses is not null and i.uses >= i.max_uses then 'exhausted'
                         else 'active' end)
    from lv.campaign_invites i where i.id = p_id
$$;

-- The token is returned here once and never again.
create or replace function lv.api_campaign_invite_create(p_campaign uuid, p_max_uses int, p_expires_at timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_id uuid;
  v_token text := upper(encode(lv.random_bytes(12), 'hex'));
begin
  c := lv.managed_campaign(p_campaign, v_account);
  perform lv.premium_guard(c.hub_id, true);
  if c.access <> 'invite' then
    return lv.err('lv_invalid_input', 'Only an invite-only Campaign uses Campaign invites; share the link or join code instead.');
  end if;
  if c.status in ('closed', 'archived') then return lv.err('lv_lifecycle_invalid', 'This Campaign is finished.'); end if;
  if p_expires_at is not null and p_expires_at <= now() then return lv.err('lv_invalid_input', 'The expiry must be in the future.'); end if;
  insert into lv.campaign_invites (campaign_id, token_hash, token_prefix, created_by, max_uses, expires_at)
  values (c.id, lv.invite_hash(v_token), left(v_token, 6), v_account, p_max_uses, p_expires_at)
  returning id into v_id;
  perform lv.audit(v_account, c.hub_id, 'campaign_invite.created', v_id::text, jsonb_build_object('campaign_id', c.id));
  return jsonb_build_object('ok', true, 'invite', lv.campaign_invite_json(v_id) || jsonb_build_object('token', v_token, 'shown_once', true));
end;
$$;

create or replace function lv.api_campaign_invite_revoke(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  i record;
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.token_hash = lv.invite_hash(coalesce(p_token, '')) for update;
  if i.id is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = i.campaign_id;
  if lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  -- Revoking stops new redemptions; people already eligible stay eligible (their answers are not touched).
  update lv.campaign_invites set revoked_at = coalesce(revoked_at, now()) where id = i.id;
  perform lv.audit(v_account, v_hub, 'campaign_invite.revoked', i.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_campaign_invite_revoke_by_id(p_invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  i record;
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.id = p_invite for update;
  if i.id is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = i.campaign_id;
  if lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  update lv.campaign_invites set revoked_at = coalesce(revoked_at, now()) where id = i.id;
  perform lv.audit(v_account, v_hub, 'campaign_invite.revoked', i.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function lv.api_campaign_invite_redeem(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  i record;
  c record;
  v_new boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.token_hash = lv.invite_hash(coalesce(p_token, '')) for update;
  select * into c from lv.campaigns x where x.id = i.campaign_id;
  -- Unknown, revoked, expired, exhausted and finished all answer identically.
  if i.id is null or c.id is null
     or i.revoked_at is not null
     or (i.expires_at is not null and i.expires_at <= now())
     or c.status in ('closed', 'archived') or c.access <> 'invite' then
    return lv.err('lv_invalid_code', 'That invite is not valid.');
  end if;
  if exists (select 1 from lv.campaign_eligibility e where e.campaign_id = c.id and e.account_id = v_account) then
    return jsonb_build_object('ok', true, 'campaign_id', c.id, 'join_code', c.join_code, 'already_eligible', true);
  end if;
  if i.max_uses is not null and i.uses >= i.max_uses then
    return lv.err('lv_invalid_code', 'That invite is not valid.');
  end if;
  insert into lv.campaign_eligibility (campaign_id, account_id, invite_id) values (c.id, v_account, i.id)
  on conflict do nothing
  returning true into v_new;
  if coalesce(v_new, false) then update lv.campaign_invites set uses = uses + 1 where id = i.id; end if;
  perform lv.audit(v_account, c.hub_id, 'campaign_invite.redeemed', i.id::text);
  return jsonb_build_object('ok', true, 'campaign_id', c.id, 'join_code', c.join_code, 'already_eligible', false);
end;
$$;

-- =========================================================================================================
-- Plan limits and usage for campaign managers (gap). No product, dates, reservation or billing state.
-- =========================================================================================================
create function lv.api_hub_limits(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h record;
  v_plan jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  if h.id is null or h.kind <> 'community' or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.has_capability(v_account, h.id, 'campaign.manage') then
    return lv.err('lv_forbidden', 'Plan limits are shown to people who manage Campaigns.');
  end if;
  v_plan := lv.hub_plan(h.id);
  return jsonb_build_object('ok', true,
    'plan', jsonb_build_object('family', v_plan->'family', 'state', v_plan->'state'),
    'limits', coalesce((select jsonb_object_agg(l.key, l.value) from lv.plan_limits l where l.family = v_plan->>'family'), '{}'::jsonb),
    'usage', jsonb_build_object(
      'custom_roles', (select count(*) from lv.roles x where x.hub_id = h.id and not x.is_owner and not x.is_system),
      'custom_pages', (select count(*) from lv.hub_pages x where x.hub_id = h.id and x.kind = 'custom'),
      'active_campaigns', (select count(*) from lv.campaigns x where x.hub_id = h.id and x.status = 'active'),
      'active_surveys', (select count(*) from lv.campaigns x where x.hub_id = h.id and x.status = 'active' and x.mode = 'survey'),
      'active_surveys_below_threshold', (select count(*) from lv.campaigns x
                                          where x.hub_id = h.id and x.status = 'active' and x.mode = 'survey'
                                            and not lv.survey_threshold_met(x.id, lv.plan_limit(v_plan->>'family', 'surveys.threshold')))));
end;
$$;

-- =========================================================================================================
-- Owner transfer acceptance (gap): the transfer is an offer; nothing changes until the receiving member accepts.
-- =========================================================================================================
insert into lv.policy (key, value, note) values
  ('hub.owner_offer_days', '7'::jsonb, 'Days an ownership transfer offer stays open for the receiving member.');

create table lv.owner_transfer_offers (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  from_account_id uuid not null references lv.accounts (id) on delete cascade,
  to_membership_id uuid not null references lv.hub_memberships (id) on delete cascade,
  to_account_id uuid not null references lv.accounts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  constraint owner_transfer_offers_decided check ((status = 'pending') = (decided_at is null))
);
create unique index owner_transfer_offers_one_pending on lv.owner_transfer_offers (hub_id) where status = 'pending';
create index owner_transfer_offers_to_idx on lv.owner_transfer_offers (to_account_id) where status = 'pending';
alter table lv.owner_transfer_offers enable row level security;

create function lv.owner_offer_json(p_offer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('offer_id', o.id, 'hub_id', o.hub_id, 'hub_slug', h.slug, 'hub_name', h.display_name,
           'membership_id', o.to_membership_id,
           'to_display_name', (select a.display_name from lv.accounts a where a.id = o.to_account_id),
           'from_display_name', (select a.display_name from lv.accounts a where a.id = o.from_account_id),
           'created_at', o.created_at, 'expires_at', o.expires_at,
           'state', case when o.status = 'pending' and o.expires_at <= now() then 'expired' else o.status end)
    from lv.owner_transfer_offers o join lv.hubs h on h.id = o.hub_id where o.id = p_offer
$$;

-- Same checks as 000015 (Owner only, recent sign-in, typed slug, accepted target). It now records an offer and
-- replaces any earlier pending offer for the Hub. The Owner, the Owner role and every membership stay as they are.
create or replace function lv.api_owner_transfer(p_hub uuid, p_membership uuid, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  h record;
  m record;
  v_offer uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub for update;
  if h.id is null or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if h.owner_account_id <> v_account then return lv.err('lv_forbidden', 'Only the Owner can transfer ownership.'); end if;
  perform lv.require_recent_auth();
  if p_confirm is distinct from h.slug then
    return lv.err('lv_confirmation_mismatch', 'Type the Hub''s address name exactly to confirm.');
  end if;
  select * into m from lv.hub_memberships x where x.id = p_membership and x.hub_id = h.id;
  if m.id is null then return lv.err('lv_not_found', 'No such member.'); end if;
  if m.account_id = v_account then return lv.err('lv_invalid_input', 'You are already the Owner.'); end if;
  if m.status <> 'accepted' then return lv.err('lv_not_accepted', 'Only an accepted member can become the Owner.'); end if;

  update lv.owner_transfer_offers set status = 'cancelled', decided_at = now() where hub_id = h.id and status = 'pending';
  insert into lv.owner_transfer_offers (hub_id, from_account_id, to_membership_id, to_account_id, expires_at)
  values (h.id, v_account, m.id, m.account_id,
          now() + make_interval(days => greatest(coalesce((lv.policy_json('hub.owner_offer_days'))::int, 7), 1)))
  returning id into v_offer;
  perform lv.audit(v_account, h.id, 'hub.owner_transfer_offered', m.account_id::text,
                   jsonb_build_object('offer', v_offer, 'to', m.account_id));
  return jsonb_build_object('ok', true, 'pending', true, 'offer', lv.owner_offer_json(v_offer));
end;
$$;

create function lv.api_owner_transfer_decide(p_offer uuid, p_accept boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  o record;
  h record;
  m record;
  v_role uuid;
  v_old_member uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into o from lv.owner_transfer_offers x where x.id = p_offer for update;
  if o.id is null or o.to_account_id <> v_account then return lv.err('lv_not_found', 'No such offer.'); end if;
  if o.status <> 'pending' or o.expires_at <= now() then
    return lv.err('lv_lifecycle_invalid', 'This ownership offer is no longer open.');
  end if;
  select * into h from lv.hubs x where x.id = o.hub_id for update;
  if h.owner_account_id <> o.from_account_id then
    update lv.owner_transfer_offers set status = 'cancelled', decided_at = now() where id = o.id;
    return lv.err('lv_lifecycle_invalid', 'This ownership offer is no longer open.');
  end if;

  if not coalesce(p_accept, false) then
    update lv.owner_transfer_offers set status = 'declined', decided_at = now() where id = o.id;
    perform lv.audit(v_account, h.id, 'hub.owner_transfer_declined', o.id::text);
    return jsonb_build_object('ok', true, 'accepted', false);
  end if;

  select * into m from lv.hub_memberships x where x.id = o.to_membership_id and x.hub_id = h.id for update;
  if m.id is null or m.account_id <> v_account or m.status <> 'accepted' then
    return lv.err('lv_not_accepted', 'Only an accepted member can become the Owner.');
  end if;

  select r.id into v_role from lv.roles r where r.hub_id = h.id and r.is_owner;
  v_old_member := lv.membership_of(o.from_account_id, h.id);
  perform set_config('lv.owner_transfer', h.id::text, true);
  update lv.hubs set owner_account_id = m.account_id where id = h.id;
  perform set_config('lv.owner_transfer', '', true);
  -- The Owner role moves with the ownership: the old Owner keeps a plain accepted membership.
  update lv.membership_roles set membership_id = m.id where role_id = v_role and membership_id = v_old_member;
  insert into lv.membership_roles (membership_id, role_id) values (m.id, v_role) on conflict do nothing;
  update lv.owner_transfer_offers set status = 'accepted', decided_at = now() where id = o.id;
  perform lv.audit(v_account, h.id, 'hub.owner_transferred', m.account_id::text,
                   jsonb_build_object('from', o.from_account_id, 'to', m.account_id, 'offer', o.id));
  return jsonb_build_object('ok', true, 'accepted', true, 'hub_id', h.id, 'slug', h.slug);
end;
$$;

create function lv.api_owner_transfer_cancel(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  h record;
  v_n int;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  if h.id is null or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if h.owner_account_id <> v_account then return lv.err('lv_forbidden', 'Only the Owner can cancel a transfer.'); end if;
  update lv.owner_transfer_offers set status = 'cancelled', decided_at = now() where hub_id = h.id and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n > 0 then perform lv.audit(v_account, h.id, 'hub.owner_transfer_cancelled', h.id::text); end if;
  return jsonb_build_object('ok', true, 'cancelled', v_n > 0);
end;
$$;

create function lv.api_owner_transfer_status(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  if h.id is null or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if h.owner_account_id <> v_account then return lv.err('lv_forbidden', 'Only the Owner sees a pending transfer.'); end if;
  return jsonb_build_object('ok', true, 'offer', (
    select lv.owner_offer_json(o.id) from lv.owner_transfer_offers o
     where o.hub_id = h.id and o.status = 'pending' and o.expires_at > now()));
end;
$$;

-- =========================================================================================================
-- lv_my_context: incoming ownership offers (everything else unchanged from 000014)
-- =========================================================================================================
create or replace function lv.api_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_ci jsonb := lv.caller_identity();
  v_personal uuid;
begin
  if v_account is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_unauthenticated', 'message', 'Sign in with KpnIdentity first.'));
  end if;
  v_personal := lv.personal_space_of(v_account);
  return jsonb_build_object('ok', true, 'account_id', v_account,
    'display_name', (select a.display_name from lv.accounts a where a.id = v_account),
    'email_verified', (select i.email_verified_at is not null from lv.account_identities i
                        where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject'),
    'is_platform_admin', lv.is_platform_admin(v_account),
    'beta_status', coalesce((select b.status from lv.beta_applications b where b.account_id = v_account), 'none'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hub_id', h.id, 'slug', h.slug, 'name', h.display_name, 'kind', h.kind,
               'is_owner', h.owner_account_id = v_account,
               'roles', lv.roles_of(v_account, h.id),
               'capabilities', lv.capabilities_of(v_account, h.id),
               'plan', lv.hub_plan(h.id) - 'entitlement_id')
             order by h.display_name)
        from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
       where m.account_id = v_account and m.status = 'accepted' and h.kind = 'community'), jsonb_build_array()),
    'entitlements', coalesce((
      select jsonb_agg(lv.entitlement_json(e.id) order by e.created_at)
        from lv.entitlements e where e.account_id = v_account), jsonb_build_array()),
    'hub_credits', (select count(*) from lv.hub_credits c
                     where c.account_id = v_account and c.consumed_at is null
                       and (lv.effective_end(c.product, c.ends_at) is null or lv.effective_end(c.product, c.ends_at) > now())),
    'quick_surveys', jsonb_build_object(
      'active', (select count(*) from lv.campaigns c where c.hub_id = v_personal and c.status in ('active', 'paused')),
      'limit', (lv.plan_limit('free', 'quick.max_active'))::int,
      'question_limit', (lv.plan_limit('free', 'quick.max_questions'))::int),
    'waitlist', lv.waitlist_me(v_account),
    -- The caller's own recent answers: titles and dates only, never answers.
    'recent_participation', coalesce((
      select jsonb_agg(jsonb_build_object('campaign_title', x.title, 'hub_display_name', x.hub_name,
                                          'answered_on', x.answered_on, 'kind', x.kind) order by x.at desc)
        from (select c.title, case when h.kind = 'personal' then null else h.display_name end as hub_name,
                     (p.created_at at time zone 'UTC')::date as answered_on,
                     case when h.kind = 'personal' then 'quick' else 'hub' end as kind, p.created_at as at
                from lv.participation p join lv.campaigns c on c.id = p.campaign_id join lv.hubs h on h.id = c.hub_id
               where p.account_id = v_account
               order by p.created_at desc limit 10) x), jsonb_build_array()),
    -- Track A: ownership offers waiting for this account's answer.
    'owner_transfer_offers', coalesce((
      select jsonb_agg(lv.owner_offer_json(o.id) order by o.created_at)
        from lv.owner_transfer_offers o
       where o.to_account_id = v_account and o.status = 'pending' and o.expires_at > now()), jsonb_build_array()));
end;
$$;

-- =========================================================================================================
-- API wrappers for the new operations
-- =========================================================================================================
create function lv_api.lv_campaign_set_audience_roles(p_campaign uuid, p_roles uuid[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard((select c.hub_id from lv.campaigns c where c.id = p_campaign), true); return lv.api_campaign_set_audience_roles(p_campaign, p_roles); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_invite_revoke_by_id(p_invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_invite_revoke_by_id(p_invite); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_limits(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_limits(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_owner_transfer_accept(p_offer uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_owner_transfer_decide(p_offer, true); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_owner_transfer_decline(p_offer uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_owner_transfer_decide(p_offer, false); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_owner_transfer_cancel(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_owner_transfer_cancel(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_owner_transfer_status(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_owner_transfer_status(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- =========================================================================================================
-- Grants: explicit, never PUBLIC (LC-05). The anon allow-list is unchanged: lv_guest_campaign_get and
-- lv_guest_submit keep their anon grant (replaced in place); every new function is for signed-in callers only.
-- =========================================================================================================
revoke all on function
  lv_api.lv_campaign_create(uuid, text, text, text, text),
  lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean, text, text),
  lv_api.lv_campaign_set_audience_roles(uuid, uuid[]),
  lv_api.lv_campaign_invite_revoke_by_id(uuid),
  lv_api.lv_hub_limits(uuid),
  lv_api.lv_owner_transfer_accept(uuid),
  lv_api.lv_owner_transfer_decline(uuid),
  lv_api.lv_owner_transfer_cancel(uuid),
  lv_api.lv_owner_transfer_status(uuid)
from public;

revoke all on all tables in schema lv from public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema lv from anon';
    execute 'revoke all on all functions in schema lv from anon';
    execute 'revoke all on function lv_api.lv_campaign_create(uuid, text, text, text, text),
      lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean, text, text),
      lv_api.lv_campaign_set_audience_roles(uuid, uuid[]), lv_api.lv_campaign_invite_revoke_by_id(uuid),
      lv_api.lv_hub_limits(uuid), lv_api.lv_owner_transfer_accept(uuid), lv_api.lv_owner_transfer_decline(uuid),
      lv_api.lv_owner_transfer_cancel(uuid), lv_api.lv_owner_transfer_status(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema lv from authenticated';
    execute 'revoke all on all functions in schema lv from authenticated';
    execute 'grant execute on function lv_api.lv_campaign_create(uuid, text, text, text, text),
      lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean, text, text),
      lv_api.lv_campaign_set_audience_roles(uuid, uuid[]), lv_api.lv_campaign_invite_revoke_by_id(uuid),
      lv_api.lv_hub_limits(uuid), lv_api.lv_owner_transfer_accept(uuid), lv_api.lv_owner_transfer_decline(uuid),
      lv_api.lv_owner_transfer_cancel(uuid), lv_api.lv_owner_transfer_status(uuid) to authenticated';
  end if;
  -- LC-13: the session Edge Function records each ID-token exchange once. Service role only, no table access.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema lv to service_role';
    execute 'grant execute on function lv.session_exchange_consume(text, timestamptz) to service_role';
  end if;
end $$;

commit;
