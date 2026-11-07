-- Rollback for 000014_v2_entitlements. Restores the 000013 function bodies (captured with pg_get_functiondef),
-- drops entitlements, credits, waitlist, Campaign invites and the personal-space kind, and restores the retired
-- policies as NULL (fail closed). Canonical rehearsal only: it refuses to run while personal spaces exist,
-- because their Quick Surveys and answers have no place in the 000013 model.
do $$ begin
  if exists (select 1 from lv.hubs where kind = 'personal') then
    raise exception 'rollback 000014: personal spaces exist; remove them first (this rollback never deletes answers)';
  end if;
end $$;

CREATE OR REPLACE FUNCTION lv.api_error(p_message text, p_sqlstate text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text := substring(p_message from '^(lv_[a-z_]+):');
  v_text text := btrim(regexp_replace(p_message, '^lv_[a-z_]+:\s*', ''));
  v_err jsonb;
begin
  if v_code is not null then
    v_err := jsonb_build_object('code', v_code, 'message', v_text);
    -- Activation gate failures carry their reasons as data, not only as prose.
    if v_code = 'lv_gate_blocked' then
      v_err := v_err || jsonb_build_object('reasons', to_jsonb(string_to_array(v_text, ',')));
    end if;
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  -- Database-level rule violations that are the caller's doing, not a fault.
  if p_sqlstate in ('22023', '22P02', '23514', '22001', '22003') then
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'lv_invalid_input', 'message', 'That value is not allowed.'));
  end if;
  if p_sqlstate = '23505' then
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'lv_conflict', 'message', 'That already exists.'));
  end if;
  if p_sqlstate = '23503' then
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'lv_not_found', 'message', 'No such record.'));
  end if;

  -- Anything else is a real fault: log the detail server-side, show the caller nothing.
  raise log 'lv_server_error: % (%)', p_message, p_sqlstate;
  raise exception 'lv_server_error: unexpected fault' using errcode = 'XX000';
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.custom_role_limit(p_hub uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select (lv.policy_json('roles.max_custom_per_hub'))::int $function$

;

CREATE OR REPLACE FUNCTION lv.gate_evaluate(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c record;
  v_cap jsonb;
  v_active int;
  v_questions int;
  v_reasons jsonb := '[]'::jsonb;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('not_found')); end if;

  if c.status <> 'draft' then v_reasons := v_reasons || to_jsonb('not_draft'::text); end if;
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;

  select count(*) into v_questions from lv.campaign_questions q where q.campaign_id = c.id;
  if v_questions = 0 then v_reasons := v_reasons || to_jsonb('no_questions'::text); end if;

  v_cap := lv.policy_json('campaign.max_active_per_hub');
  if v_cap is null then
    v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
  else
    select count(*) into v_active from lv.campaigns x where x.hub_id = c.hub_id and x.status = 'active';
    if v_active >= (v_cap)::int then v_reasons := v_reasons || to_jsonb('limit_reached'::text); end if;
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons);
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.activate_campaign(p_campaign uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gate jsonb;
  c record;
begin
  -- Row lock first: two simultaneous activations cannot both pass the cap check.
  select * into c from lv.campaigns where id = p_campaign for update;
  if c is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  if c.status = 'active' then return; end if;  -- idempotent

  perform pg_advisory_xact_lock(hashtextextended('lv_activate:' || c.hub_id::text, 0));
  v_gate := lv.gate_evaluate(p_campaign);
  if not (v_gate->>'ok')::boolean then
    raise exception 'lv_gate_blocked: %', (select string_agg(r, ',') from jsonb_array_elements_text(v_gate->'reasons') r)
      using errcode = '42501';
  end if;

  update lv.campaigns
     set status = 'active', activated_at = now(), revision = revision + 1
   where id = p_campaign;
  perform lv.audit(c.created_by, c.hub_id, 'campaign.activated', p_campaign::text, v_gate);
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.api_campaign_resume(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_cap jsonb;
  v_active int;
  v_reasons jsonb := '[]'::jsonb;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status = 'active' then return jsonb_build_object('ok', true); end if;
  if c.status <> 'paused' then return lv.err('lv_lifecycle_invalid', 'Only a paused Campaign can be resumed.'); end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_activate:' || c.hub_id::text, 0));
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;
  v_cap := lv.policy_json('campaign.max_active_per_hub');
  if v_cap is null then
    v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
  else
    select count(*) into v_active from lv.campaigns x where x.hub_id = c.hub_id and x.status = 'active';
    if v_active >= (v_cap)::int then v_reasons := v_reasons || to_jsonb('limit_reached'::text); end if;
  end if;
  if jsonb_array_length(v_reasons) > 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_gate_blocked',
      'message', 'This Campaign cannot resume yet.', 'reasons', v_reasons));
  end if;

  update lv.campaigns set status = 'active', paused_at = null where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.resumed', c.id::text);
  return jsonb_build_object('ok', true);
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.snapshot_published_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status = 'draft' and new.status = 'active' then
    insert into lv.campaign_versions (campaign_id, version, published_by, settings, questions)
    values (new.id, new.revision, lv.current_account_id(),
      (to_jsonb(new) - 'join_code' - 'status' - 'activated_at' - 'closed_at' - 'paused_at' - 'archived_at' - 'revision')
        || jsonb_build_object('entitlement', jsonb_build_object(
             'campaign.max_active_per_hub', lv.policy_json('campaign.max_active_per_hub'))),
      coalesce((select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                                    'prompt', q.prompt, 'config', q.config) order by q.position)
                  from lv.campaign_questions q where q.campaign_id = new.id), '[]'::jsonb));
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.submit_response(p_campaign uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_bad text;
  v_sub uuid;
  v_part uuid;
  v_receipt uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;

  select * into c from lv.campaigns where id = p_campaign;
  if c is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;

  if c.status <> 'active'
     or (c.opens_at is not null and c.opens_at > now())
     or (c.closes_at is not null and c.closes_at <= now()) then
    raise exception 'lv_closed: this Campaign is not accepting responses' using errcode = '42501';
  end if;

  if not exists (select 1 from lv.hub_memberships m
                  where m.hub_id = c.hub_id and m.account_id = v_account and m.status = 'accepted') then
    raise exception 'lv_forbidden: only accepted members of this Hub may respond' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_submit:' || p_campaign::text || ':' || v_account::text, 0));

  -- Idempotent: a repeat submission returns the existing receipt instead of creating a second one.
  select p.id, p.receipt_id into v_part, v_receipt
    from lv.participation p
   where p.campaign_id = p_campaign and p.account_id = v_account;
  if v_part is not null then
    return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', true);
  end if;

  v_bad := lv.validate_answers(p_campaign, p_answers);
  if v_bad is not null then
    raise exception 'lv_invalid_input: %', v_bad using errcode = '22023';
  end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id)
  values (p_campaign, c.hub_id, c.revision, case when c.anonymity = 'anonymous' then null else v_account end)
  returning id into v_sub;

  insert into lv.answers (submission_id, question_id, value)
  select v_sub, (e->>'question_id')::uuid, e->'value'
    from jsonb_array_elements(p_answers) e
   where e->'value' is not null and e->'value' <> 'null'::jsonb;

  insert into lv.participation (campaign_id, hub_id, account_id, submission_id, campaign_revision, reward_state)
  values (p_campaign, c.hub_id, v_account,
          case when c.anonymity = 'anonymous' then null else v_sub end,
          c.revision, 'not_applicable')
  returning id, receipt_id into v_part, v_receipt;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', false);
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
     and c.status = 'active'
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
  v_hub_name text;
  v_phase text;
  v_full boolean;
begin
  c := lv.guest_campaign(p_join_code);
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  select h.display_name into v_hub_name from lv.hubs h where h.id = c.hub_id;
  v_phase := lv.campaign_phase(c.status, c.opens_at, c.closes_at);
  v_full := c.guest_limit is not null
            and (select count(*) from lv.guest_participation g where g.campaign_id = c.id) >= c.guest_limit;
  return jsonb_build_object('ok', true,
    'campaign', jsonb_build_object('campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
                                   'phase', v_phase, 'opens_at', c.opens_at, 'closes_at', c.closes_at),
    'hub', jsonb_build_object('name', v_hub_name),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), '[]'::jsonb),
    'can_respond', v_phase = 'open' and not v_full);
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
  v_manage boolean;
  v_responded boolean;
  v_receipt uuid;
  v_open boolean;
  v_out jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(v_account, c.hub_id) is null then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  v_manage := lv.has_capability(v_account, c.hub_id, 'campaign.manage');
  if c.status = 'draft' and not v_manage then return lv.err('lv_not_found', 'No such Campaign.'); end if;

  select true, p.receipt_id into v_responded, v_receipt
    from lv.participation p where p.campaign_id = c.id and p.account_id = v_account;
  v_responded := coalesce(v_responded, false);
  v_open := c.status = 'active'
            and (c.opens_at is null or c.opens_at <= now())
            and (c.closes_at is null or c.closes_at > now());

  v_out := jsonb_build_object('ok', true,
    'campaign', jsonb_build_object(
      'campaign_id', c.id, 'hub_id', c.hub_id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
      'status', c.status, 'revision', c.revision, 'opens_at', c.opens_at, 'closes_at', c.closes_at),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), jsonb_build_array()),
    'has_responded', v_responded,
    'receipt_id', v_receipt,
    'can_respond', v_open and not v_responded,
    'can_manage', v_manage);

  if v_manage then
    v_out := v_out || jsonb_build_object('join_code', c.join_code, 'gate', lv.gate_evaluate(c.id));
  end if;
  return v_out;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.campaign_member_participation(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'participants', (select count(distinct p.account_id)
                       from lv.participation p
                       join lv.hub_memberships m on m.hub_id = p.hub_id and m.account_id = p.account_id and m.status = 'accepted'
                      where p.campaign_id = c.id),
    'eligible', (select count(*) from lv.hub_memberships m where m.hub_id = c.hub_id and m.status = 'accepted'))
    from lv.campaigns c where c.id = p_campaign
$function$

;

CREATE OR REPLACE FUNCTION lv.api_hub_create(p_slug text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_app uuid;
  v_hub uuid;
  v_member uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;
  if v_slug is null or length(v_slug) not between 3 and 40
     or v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$' or v_slug like '%--%' then
    return lv.err('lv_invalid_input', 'Hub names are 3 to 40 characters: lowercase letters, numbers and single hyphens, not starting or ending with a hyphen.');
  end if;
  if v_name is null or v_name = '' then
    return lv.err('lv_invalid_input', 'A Hub needs a display name.');
  end if;
  if exists (select 1 from lv.reserved_slugs r where r.slug = v_slug) then
    return lv.err('lv_invalid_input', 'That name is reserved.');
  end if;

  -- Beta gate: an approved application is required to create a Hub. Fails closed when no application exists.
  -- (To be replaced by the entitlement check when entitlements are built.)
  select id into v_app from lv.beta_applications b
   where b.account_id = v_account and b.status = 'approved' for update;
  if v_app is null then
    return lv.err('lv_beta_required', 'Hub creation requires an approved beta application.');
  end if;

  insert into lv.hubs (slug, display_name, owner_account_id) values (v_slug, v_name, v_account) returning id into v_hub;
  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (v_hub, v_account, 'accepted', now()) returning id into v_member;
  perform lv.owner_bootstrap_roles(v_hub, v_account);

  update lv.beta_applications set status = 'consumed', decided_at = now() where id = v_app;
  perform lv.audit(v_account, v_hub, 'hub.created', v_slug);

  return jsonb_build_object('ok', true, 'hub_id', v_hub, 'slug', v_slug);
exception
  when unique_violation then
    return lv.err('lv_conflict', 'That Hub name is taken.');
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
begin
  if v_account is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_unauthenticated', 'message', 'Sign in with KpnIdentity first.'));
  end if;
  return jsonb_build_object('ok', true, 'account_id', v_account,
    'display_name', (select a.display_name from lv.accounts a where a.id = v_account),
    'email_verified', (select i.email_verified_at is not null from lv.account_identities i
                        where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject'),
    'is_platform_admin', lv.is_platform_admin(v_account),
    'beta_status', coalesce((select b.status from lv.beta_applications b where b.account_id = v_account), 'none'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hub_id', h.id, 'slug', h.slug, 'name', h.display_name,
               'is_owner', h.owner_account_id = v_account,
               'roles', lv.roles_of(v_account, h.id),
               'capabilities', lv.capabilities_of(v_account, h.id))
             order by h.display_name)
        from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
       where m.account_id = v_account and m.status = 'accepted'), jsonb_build_array()));
end;
$function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_role_create(p_hub uuid, p_name text, p_icon text DEFAULT NULL::text, p_capabilities text[] DEFAULT NULL::text[], p_groups text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_role_create(p_hub, p_name, p_icon, p_capabilities, p_groups); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_role_update(p_role uuid, p_name text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_capabilities text[] DEFAULT NULL::text[], p_groups text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_role_update(p_role, p_name, p_icon, p_capabilities, p_groups); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_member_role_assign(p_membership uuid, p_role uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_member_role_assign(p_membership, p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_invite_create(p_hub uuid, p_max_uses integer DEFAULT NULL::integer, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_invite_create(p_hub, p_max_uses, p_expires_at); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_create(p_hub uuid, p_title text, p_mode text, p_anonymity text DEFAULT 'anonymous'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_campaign_create(p_hub, p_title, p_mode, p_anonymity); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_question_add(p_campaign uuid, p_position integer, p_kind text, p_prompt text, p_config jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_campaign_question_add(p_campaign, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_question_update(p_question uuid, p_position integer DEFAULT NULL::integer, p_kind text DEFAULT NULL::text, p_prompt text DEFAULT NULL::text, p_config jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_campaign_question_update(p_question, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_update(p_campaign uuid, p_title text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_anonymity text DEFAULT NULL::text, p_opens_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_clear_schedule boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_campaign_set_participation(p_campaign uuid, p_audience text DEFAULT NULL::text, p_guest_limit integer DEFAULT NULL::integer, p_clear_guest_limit boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_campaign_set_participation(p_campaign, p_audience, p_guest_limit, p_clear_guest_limit); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_hub_join(p_hub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_hub_join(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_member_leave(p_hub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_member_leave(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_member_admit(p_membership uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_member_admit(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_member_reject(p_membership uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_member_reject(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_member_remove(p_membership uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_member_remove(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_member_role_unassign(p_membership uuid, p_role uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_member_role_unassign(p_membership, p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_role_delete(p_role uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_role_delete(p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_role_list(p_hub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_role_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv_api.lv_invite_revoke(p_invite uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return lv.api_invite_revoke(p_invite); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $function$

;

CREATE OR REPLACE FUNCTION lv.new_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no ambiguous characters
  v_out text := '';
  i int;
begin
  for i in 1..6 loop
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_out;
end;
$function$

;

create or replace function lv_api.lv_campaign_archive(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_archive(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

drop function if exists lv_api.lv_member_list(uuid);
drop function if exists lv_api.lv_invite_list(uuid);
alter function lv.api_member_list(uuid) rename to lv_member_list;
alter function lv.lv_member_list(uuid) set schema lv_api;
alter function lv.api_invite_list(uuid) rename to lv_invite_list;
alter function lv.lv_invite_list(uuid) set schema lv_api;

drop trigger if exists participation_coarsen_time on lv.participation;
drop function if exists lv.coarsen_participation_time();
drop function if exists lv.require_community(uuid);

-- RLS back off on the pre-000014 tables (the new tables are dropped below).
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'lv' and c.relkind = 'r' loop
    execute format('alter table lv.%I disable row level security', r.relname);
  end loop;
end $$;

-- The 000006-000013 grant posture.
grant execute on all functions in schema lv_api to public;

drop function if exists lv_api.lv_report_abuse(text, text);
drop function if exists lv_api.lv_admin_campaign_block(uuid, text);
drop function if exists lv_api.lv_admin_campaign_unblock(uuid);
drop function if exists lv.api_report_abuse(text, text);
drop function if exists lv.api_admin_campaign_block(uuid, text, boolean);
drop table if exists lv.abuse_reports;
drop function if exists lv_api.lv_plan_limits();
drop function if exists lv_api.lv_waitlist_status();
drop function if exists lv_api.lv_waitlist_join(text, text, text);
drop function if exists lv_api.lv_quick_survey_create(text, text, text, boolean);
drop function if exists lv_api.lv_quick_survey_list();
drop function if exists lv_api.lv_campaign_invite_create(uuid, int, timestamptz);
drop function if exists lv_api.lv_campaign_invite_list(uuid);
drop function if exists lv_api.lv_campaign_invite_revoke(text);
drop function if exists lv_api.lv_campaign_invite_redeem(text);
drop function if exists lv.quick_question_guard(uuid, text, boolean);
drop function if exists lv.api_campaign_invite_redeem(text);
drop function if exists lv.api_campaign_invite_revoke(text);
drop function if exists lv.api_campaign_invite_list(uuid);
drop function if exists lv.api_campaign_invite_create(uuid, int, timestamptz);
drop function if exists lv.campaign_invite_json(uuid);
drop function if exists lv.api_quick_survey_list();
drop function if exists lv.api_quick_survey_create(text, text, text, boolean);
drop function if exists lv.api_plan_limits();
drop function if exists lv.api_waitlist_join(text, text, text);
drop function if exists lv.api_waitlist_status();
drop function if exists lv.waitlist_me(uuid);
drop function if exists lv.waitlist_seats();
drop function if exists lv.valid_credit(uuid);
drop function if exists lv.slug_claim_blocked(text, uuid);
drop function if exists lv.campaign_summary(uuid, boolean);
drop function if exists lv.ensure_personal_space(uuid);
drop function if exists lv.personal_space_of(uuid);
drop function if exists lv.raise_gate(uuid, jsonb);
drop function if exists lv.capacity_check(uuid);
drop function if exists lv.survey_threshold_met(uuid, jsonb);
drop function if exists lv.can_participate(uuid, uuid);
drop function if exists lv.hub_kind(uuid);
drop function if exists lv.premium_guard(uuid, boolean);
drop function if exists lv.hub_limit(uuid, text);
drop function if exists lv.hub_family(uuid);
drop function if exists lv.hub_plan(uuid);
drop function if exists lv.entitlement_json(uuid);
drop function if exists lv.entitlement_state(timestamptz, timestamptz);
drop function if exists lv.effective_end(text, timestamptz);
drop function if exists lv.family_rank(text);
drop function if exists lv.plan_limit(text, text);
drop function if exists lv.err_x(text, text, jsonb);
drop function if exists lv.fail(text, text, jsonb);

drop table if exists lv.waitlist_entries;
drop table if exists lv.campaign_eligibility;
drop table if exists lv.campaign_invites;
drop table if exists lv.hub_credits;
drop table if exists lv.entitlements;
drop table if exists lv.products;
drop table if exists lv.plan_limits;

alter table lv.campaigns drop constraint if exists campaigns_invite_no_guests;
alter table lv.campaigns drop column if exists access;
alter table lv.campaigns drop column if exists blocked_reason;
alter table lv.campaigns drop column if exists blocked_at;

drop index if exists lv.hubs_one_personal_idx;
alter table lv.hubs drop constraint if exists hubs_personal_closed;
alter table lv.hubs drop constraint if exists hubs_kind_slug;
alter table lv.hubs drop constraint if exists hubs_slug_format;
alter table lv.hubs drop constraint if exists hubs_slug_length;
alter table lv.hubs drop constraint if exists hubs_slug_no_double_hyphen;
alter table lv.hubs drop column if exists kind;
alter table lv.hubs alter column slug set not null;
alter table lv.hubs add constraint hubs_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$');
alter table lv.hubs add constraint hubs_slug_length check (length(slug) between 3 and 40);
alter table lv.hubs add constraint hubs_slug_no_double_hyphen check (slug !~ '--');

delete from lv.reserved_slugs where reason in ('ui route', 'launch route');
delete from lv.policy where key in ('billing.launched_at', 'waitlist.seats', 'abuse.reports_per_minute', 'waitlist.consent_version', 'quick.create_per_hour');
insert into lv.policy (key, value, note) values
  ('campaign.max_active_per_hub', null,
   'Maximum simultaneously active Campaigns per Hub. NULL means activation is refused until an owner sets it (no invented plan numbers).'),
  ('roles.max_custom_per_hub', null,
   'Custom role slots per Hub until entitlements exist. NULL means creating a custom role is refused (fail closed). Replaced by the entitlement map in roadmap slice 9.')
on conflict (key) do nothing;
update lv.policy set value = null,
  note = 'Minimum cohort size before any analytics cell is published. NULL means no results are published (fail closed).'
 where key = 'campaign.min_cohort';
update lv.policy set value = null,
  note = 'Maximum guest submissions accepted per Campaign per minute. NULL means guest submissions are refused (fail closed).'
 where key = 'participation.guest_rate_per_minute';
