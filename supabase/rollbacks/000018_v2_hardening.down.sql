-- Rollback for 000018_v2_hardening. Drops the new objects and restores the 000001-000017 definitions of every
-- function 000018 replaced (captured with pg_get_functiondef from a fresh 000001-000017 install).
--
-- LOSSY by design (NEW-05): Campaign invite tokens are stored only as hashes after 000018, so the plaintext column
-- cannot be restored. Every Campaign invite comes back REVOKED with a placeholder token; managers create new
-- invites after a rollback. Pending ownership offers are discarded (nothing had moved). Role targeting, link
-- tokens, descriptions and the join-code counters are dropped.
begin;

-- New API functions
drop function if exists lv_api.lv_campaign_set_audience_roles(uuid, uuid[]);
drop function if exists lv_api.lv_campaign_invite_revoke_by_id(uuid);
drop function if exists lv_api.lv_hub_limits(uuid);
drop function if exists lv_api.lv_owner_transfer_accept(uuid);
drop function if exists lv_api.lv_owner_transfer_decline(uuid);
drop function if exists lv_api.lv_owner_transfer_cancel(uuid);
drop function if exists lv_api.lv_owner_transfer_status(uuid);
drop function if exists lv_api.lv_campaign_create(uuid, text, text, text, text);
drop function if exists lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean, text, text);

-- The plaintext token column comes back first: restored SQL functions are checked against it.
alter table lv.campaign_invites add column token text;
update lv.campaign_invites set token = 'ROLLEDBACK' || replace(id::text, '-', ''), revoked_at = coalesce(revoked_at, now());
alter table lv.campaign_invites alter column token set not null;
alter table lv.campaign_invites add constraint campaign_invites_token_key unique (token);

-- Restored definitions (000014-000017)
CREATE OR REPLACE FUNCTION lv.api_campaign_invite_create(p_campaign uuid, p_max_uses integer, p_expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_id uuid;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  perform lv.premium_guard(c.hub_id, true);
  if c.access <> 'invite' then
    return lv.err('lv_invalid_input', 'Only an invite-only Campaign uses Campaign invites; share the link or join code instead.');
  end if;
  if c.status in ('closed', 'archived') then return lv.err('lv_lifecycle_invalid', 'This Campaign is finished.'); end if;
  if p_expires_at is not null and p_expires_at <= now() then return lv.err('lv_invalid_input', 'The expiry must be in the future.'); end if;
  insert into lv.campaign_invites (campaign_id, token, created_by, max_uses, expires_at)
  values (c.id, upper(encode(lv.random_bytes(12), 'hex')), v_account, p_max_uses, p_expires_at)
  returning id into v_id;
  perform lv.audit(v_account, c.hub_id, 'campaign_invite.created', v_id::text, jsonb_build_object('campaign_id', c.id));
  return jsonb_build_object('ok', true, 'invite', lv.campaign_invite_json(v_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION lv.api_campaign_invite_redeem(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  i record;
  c record;
  v_new boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.token = upper(btrim(coalesce(p_token, ''))) for update;
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
$function$
;

CREATE OR REPLACE FUNCTION lv.api_campaign_invite_revoke(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  i record;
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.token = upper(btrim(coalesce(p_token, ''))) for update;
  if i.id is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = i.campaign_id;
  if lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  -- Revoking stops new redemptions; people already eligible stay eligible (their answers are not touched).
  update lv.campaign_invites set revoked_at = coalesce(revoked_at, now()) where id = i.id;
  perform lv.audit(v_account, v_hub, 'campaign_invite.revoked', i.id::text);
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION lv.api_guest_campaign_get(p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into c from lv.campaigns x where x.join_code = upper(btrim(coalesce(p_join_code, ''))) and x.status = 'active' and x.blocked_at is null;
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
    'campaign', jsonb_build_object('campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
                                   'phase', v_phase, 'opens_at', c.opens_at, 'closes_at', c.closes_at,
                                   'access', c.access, 'guests_allowed', v_guest_ok),
    -- A personal space is never named: the respondent sees LunchVoice, not "Personal space".
    'hub', jsonb_build_object('name', case when v_hub.kind = 'personal' then null else v_hub.display_name end),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), '[]'::jsonb),
    'signed_in', v_account is not null,
    'sign_in_required', not v_guest_ok and not v_signed_ok,
    'has_responded', v_responded,
    'can_respond', v_phase = 'open' and ((v_signed_ok and not v_responded) or (not v_signed_ok and v_guest_ok and not v_full)));
end;
$function$
;

CREATE OR REPLACE FUNCTION lv.api_my_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
               order by p.created_at desc limit 10) x), jsonb_build_array()));
end;
$function$
;

CREATE OR REPLACE FUNCTION lv.api_owner_transfer(p_hub uuid, p_membership uuid, p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  h record;
  m record;
  v_role uuid;
  v_old_member uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub for update;
  if h.id is null or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if h.owner_account_id <> v_account then return lv.err('lv_forbidden', 'Only the Owner can transfer ownership.'); end if;
  perform lv.require_recent_auth();
  if p_confirm is distinct from h.slug then
    return lv.err('lv_confirmation_mismatch', 'Type the Hub''s address name exactly to confirm.');
  end if;
  select * into m from lv.hub_memberships x where x.id = p_membership and x.hub_id = h.id for update;
  if m.id is null then return lv.err('lv_not_found', 'No such member.'); end if;
  if m.account_id = v_account then return lv.err('lv_invalid_input', 'You are already the Owner.'); end if;
  if m.status <> 'accepted' then return lv.err('lv_not_accepted', 'Only an accepted member can become the Owner.'); end if;

  select r.id into v_role from lv.roles r where r.hub_id = h.id and r.is_owner;
  v_old_member := lv.membership_of(v_account, h.id);
  perform set_config('lv.owner_transfer', h.id::text, true);
  update lv.hubs set owner_account_id = m.account_id where id = h.id;
  perform set_config('lv.owner_transfer', '', true);
  -- The Owner role moves with the ownership: the old Owner keeps a plain accepted membership.
  update lv.membership_roles set membership_id = m.id where role_id = v_role and membership_id = v_old_member;
  insert into lv.membership_roles (membership_id, role_id) values (m.id, v_role) on conflict do nothing;
  perform lv.audit(v_account, h.id, 'hub.owner_transferred', m.account_id::text,
                   jsonb_build_object('from', v_account, 'to', m.account_id));
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION lv.caller_identity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_claims jsonb;
  v_trusted jsonb;
  v_iss text;
  v_sub text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_claims is null or jsonb_typeof(v_claims) <> 'object' then return null; end if;

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
$function$
;

CREATE OR REPLACE FUNCTION lv.campaign_invite_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('invite_id', i.id, 'token', i.token, 'max_uses', i.max_uses, 'uses', i.uses,
           'expires_at', i.expires_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at,
           'state', case when i.revoked_at is not null then 'revoked'
                         when i.expires_at is not null and i.expires_at <= now() then 'expired'
                         when i.max_uses is not null and i.uses >= i.max_uses then 'exhausted'
                         else 'active' end)
    from lv.campaign_invites i where i.id = p_id
$function$
;

CREATE OR REPLACE FUNCTION lv.campaign_member_participation(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                        where p.campaign_id = c.id),
      'eligible', (select count(*) from lv.hub_memberships m where m.hub_id = c.hub_id and m.status = 'accepted'))
    end
    from lv.campaigns c where c.id = p_campaign
$function$
;

CREATE OR REPLACE FUNCTION lv.campaign_summary(p_campaign uuid, p_manage boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
           'campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity, 'status', c.status,
           'phase', lv.campaign_phase(c.status, c.opens_at, c.closes_at), 'access', c.access,
           'guests', c.audience = 'members_and_guests', 'opens_at', c.opens_at, 'closes_at', c.closes_at,
           'created_at', c.created_at, 'blocked', c.blocked_at is not null,
           'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
           'join_code', case when p_manage then c.join_code end)
    from lv.campaigns c where c.id = p_campaign
$function$
;

CREATE OR REPLACE FUNCTION lv.can_participate(p_campaign uuid, p_account uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_account is not null and exists (
    select 1 from lv.campaigns c
     where c.id = p_campaign
       and (lv.membership_of(p_account, c.hub_id) is not null
            or c.access = 'link'
            or (c.access = 'invite' and exists (select 1 from lv.campaign_eligibility e
                                                 where e.campaign_id = c.id and e.account_id = p_account))))
$function$
;

CREATE OR REPLACE FUNCTION lv.gate_evaluate(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_cap := lv.capacity_check(p_campaign);
  v_reasons := v_reasons || (v_cap->'reasons');
  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons) || (v_cap - 'reasons');
end;
$function$
;

CREATE OR REPLACE FUNCTION lv.guest_campaign(p_join_code text)
 RETURNS lv.campaigns
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.* from lv.campaigns c
   where c.join_code = upper(btrim(coalesce(p_join_code, '')))
     and c.audience = 'members_and_guests'
     and c.access <> 'invite'
     and c.status = 'active'
     and c.blocked_at is null
$function$
;

CREATE OR REPLACE FUNCTION lv.snapshot_published_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan jsonb := lv.hub_plan(new.hub_id);
begin
  if old.status = 'draft' and new.status = 'active' then
    insert into lv.campaign_versions (campaign_id, version, published_by, settings, questions)
    values (new.id, new.revision, lv.current_account_id(),
      (to_jsonb(new) - 'join_code' - 'status' - 'activated_at' - 'closed_at' - 'paused_at' - 'archived_at' - 'revision')
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
$function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_create(p_hub uuid, p_title text, p_mode text, p_anonymity text DEFAULT 'anonymous'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if lv.hub_kind(p_hub) = 'personal' and lv.membership_of(lv.current_account_id(), p_hub) is not null then
    return lv.err('lv_not_available', 'Use lv_quick_survey_create for your personal space.');
  end if;
  return lv.api_campaign_create(p_hub, p_title, p_mode, p_anonymity);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_get(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not v_member and not (c.status = 'active' and lv.can_participate(c.id, v_account)) then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  v_manage := v_member and lv.has_capability(v_account, c.hub_id, 'campaign.manage');
  if (c.status = 'draft' or c.blocked_at is not null) and not v_manage then return lv.err('lv_not_found', 'No such Campaign.'); end if;

  select true, p.receipt_id into v_responded, v_receipt
    from lv.participation p where p.campaign_id = c.id and p.account_id = v_account;
  v_responded := coalesce(v_responded, false);
  v_open := c.status = 'active'
            and (c.opens_at is null or c.opens_at <= now())
            and (c.closes_at is null or c.closes_at > now());

  v_out := jsonb_build_object('ok', true,
    'campaign', jsonb_build_object(
      'campaign_id', c.id, 'hub_id', case when v_member then c.hub_id end, 'title', c.title, 'mode', c.mode,
      'anonymity', c.anonymity, 'status', c.status, 'revision', c.revision, 'opens_at', c.opens_at,
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
    v_out := v_out || jsonb_build_object('join_code', c.join_code, 'gate', lv.gate_evaluate(c.id),
                                         'blocked', c.blocked_at is not null, 'blocked_reason', c.blocked_reason);
  end if;
  return v_out;
end;
$function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_list(p_hub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.current_account_id();
  v_manage boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  v_manage := lv.has_capability(v_account, p_hub, 'campaign.manage');

  return jsonb_build_object('ok', true, 'campaigns', coalesce((
    select jsonb_agg(jsonb_build_object(
             'campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
             'status', c.status, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'created_at', c.created_at,
             'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
             'has_responded', exists (select 1 from lv.participation p where p.campaign_id = c.id and p.account_id = v_account),
             'join_code', case when v_manage then c.join_code else null end)
           order by c.created_at desc)
      from lv.campaigns c
     where c.hub_id = p_hub and (v_manage or c.status <> 'draft')), jsonb_build_array()));
end;
$function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_question_add(p_campaign uuid, p_position integer, p_kind text, p_prompt text, p_config jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin perform lv.quick_question_guard(p_campaign, p_kind, true); return lv.api_campaign_question_add(p_campaign, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_question_update(p_question uuid, p_position integer DEFAULT NULL::integer, p_kind text DEFAULT NULL::text, p_prompt text DEFAULT NULL::text, p_config jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin perform lv.quick_question_guard((select q.campaign_id from lv.campaign_questions q where q.id = p_question), p_kind, false); return lv.api_campaign_question_update(p_question, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_update(p_campaign uuid, p_title text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_anonymity text DEFAULT NULL::text, p_opens_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_clear_schedule boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_mode is not null and p_mode <> 'survey'
     and lv.hub_kind((select c.hub_id from lv.campaigns c where c.id = p_campaign)) = 'personal' then
    return lv.err('lv_invalid_input', 'A Quick Survey is always a survey.');
  end if;
  return lv.api_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_guest_campaign_get(p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_guest_campaign_get(p_join_code); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$
;

CREATE OR REPLACE FUNCTION lv_api.lv_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_guest_submit(p_join_code, p_guest_key, p_answers); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$
;


-- The two recreated signatures get their 000014 grants back.
revoke all on function lv_api.lv_campaign_create(uuid, text, text, text),
  lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv_api.lv_campaign_create(uuid, text, text, text),
      lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_campaign_create(uuid, text, text, text),
      lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean) to authenticated';
  end if;
end $$;

-- New lv functions
drop function if exists lv.api_campaign_set_audience_roles(uuid, uuid[]);
drop function if exists lv.api_campaign_invite_revoke_by_id(uuid);
drop function if exists lv.api_hub_limits(uuid);
drop function if exists lv.api_owner_transfer_decide(uuid, boolean);
drop function if exists lv.api_owner_transfer_cancel(uuid);
drop function if exists lv.api_owner_transfer_status(uuid);
drop function if exists lv.owner_offer_json(uuid);
drop function if exists lv.question_config_problem(text, jsonb);
drop function if exists lv.campaign_audience_json(uuid, boolean);
drop function if exists lv.in_campaign_audience(uuid, uuid);
drop function if exists lv.code_lookup_miss(text);
drop function if exists lv.code_lookup_blocked(text);
drop function if exists lv.request_caller_key();
drop function if exists lv.campaign_id_by_code(text);
drop function if exists lv.is_link_token(text);
drop function if exists lv.session_exchange_consume(text, timestamptz);

-- Tables and columns
drop table if exists lv.owner_transfer_offers;
drop table if exists lv.campaign_audience_roles;
drop table if exists lv.join_code_misses;
drop table if exists lv.session_exchanges;

alter table lv.campaign_invites drop constraint if exists campaign_invites_token_hash_format;
alter table lv.campaign_invites drop constraint if exists campaign_invites_token_hash_key;
alter table lv.campaign_invites drop column token_hash;
alter table lv.campaign_invites drop column token_prefix;

alter table lv.campaigns drop column audience_scope;
alter table lv.campaigns drop column description;
alter table lv.campaigns drop constraint if exists campaigns_link_token_format;
alter table lv.campaigns drop constraint if exists campaigns_link_token_key;
alter table lv.campaigns drop column link_token;
drop function if exists lv.new_link_token();

delete from lv.plan_limits where key = 'campaigns.role_targeting';
delete from lv.policy where key in ('joincode.misses_per_minute', 'joincode.global_misses_per_minute', 'hub.owner_offer_days');

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
end $$;

commit;
