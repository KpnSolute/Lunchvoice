-- LunchVoice v2 canonical baseline 8: one error contract, Hub-creation audit, slug validation, anonymous timing.
--
-- 1. Error contract. Every lv_api write now answers an expected failure as
--      {ok:false, error:{code, message, ...}}
--    instead of raising a Postgres exception whose message starts with an lv_ code. The original function
--    bodies move to lv.api_* (internal, unchanged) and a thin wrapper keeps the lv_api name and signature.
--    Only unexpected faults stay exceptional, and they are reported as lv_server_error without leaking detail.
-- 2. lv_hub_create validates slug format itself (a bad slug no longer surfaces a raw constraint error) and
--    writes the audit event the spec requires for Hub creation.
-- 3. Anonymous timing. Submissions and answers for an anonymous Campaign no longer carry a precise timestamp
--    that equals the participation row's, which would have been a stored join path.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Error mapping
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_error(p_message text, p_sqlstate text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Move the existing bodies into lv.api_* and put wrappers under the original lv_api names
-- ---------------------------------------------------------------------------------------------------------
alter function lv_api.lv_my_context() set schema lv;
alter function lv.lv_my_context() rename to api_my_context;
alter function lv_api.lv_hub_create(text, text) set schema lv;
alter function lv.lv_hub_create(text, text) rename to api_hub_create;
alter function lv_api.lv_beta_apply(text) set schema lv;
alter function lv.lv_beta_apply(text) rename to api_beta_apply;
alter function lv_api.lv_beta_decide(uuid, boolean) set schema lv;
alter function lv.lv_beta_decide(uuid, boolean) rename to api_beta_decide;
alter function lv_api.lv_invite_create(uuid, int, timestamptz) set schema lv;
alter function lv.lv_invite_create(uuid, int, timestamptz) rename to api_invite_create;
alter function lv_api.lv_invite_redeem(text) set schema lv;
alter function lv.lv_invite_redeem(text) rename to api_invite_redeem;
alter function lv_api.lv_invite_revoke(uuid) set schema lv;
alter function lv.lv_invite_revoke(uuid) rename to api_invite_revoke;
alter function lv_api.lv_campaign_create(uuid, text, text, text) set schema lv;
alter function lv.lv_campaign_create(uuid, text, text, text) rename to api_campaign_create;
alter function lv_api.lv_campaign_question_add(uuid, int, text, text, jsonb) set schema lv;
alter function lv.lv_campaign_question_add(uuid, int, text, text, jsonb) rename to api_campaign_question_add;
alter function lv_api.lv_campaign_activate(uuid) set schema lv;
alter function lv.lv_campaign_activate(uuid) rename to api_campaign_activate;
alter function lv_api.lv_campaign_close(uuid) set schema lv;
alter function lv.lv_campaign_close(uuid) rename to api_campaign_close;
alter function lv_api.lv_submit_response(uuid, jsonb) set schema lv;
alter function lv.lv_submit_response(uuid, jsonb) rename to api_submit_response;
alter function lv_api.lv_analytics_query(uuid, text, uuid) set schema lv;
alter function lv.lv_analytics_query(uuid, text, uuid) rename to api_analytics_query;

create function lv_api.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_my_context(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_create(p_slug text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_hub_create(p_slug, p_name); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_beta_apply(p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_beta_apply(p_note); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_beta_decide(p_application uuid, p_approve boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_beta_decide(p_application, p_approve); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_invite_create(p_hub uuid, p_max_uses int default null, p_expires_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_invite_create(p_hub, p_max_uses, p_expires_at); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_invite_redeem(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_invite_redeem(p_code); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_invite_revoke(p_invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_invite_revoke(p_invite); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_create(p_hub uuid, p_title text, p_mode text, p_anonymity text default 'anonymous')
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_create(p_hub, p_title, p_mode, p_anonymity); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_question_add(p_campaign uuid, p_position int, p_kind text, p_prompt text, p_config jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_question_add(p_campaign, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_activate(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_activate(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_close(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_close(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_submit_response(p_campaign uuid, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_submit_response(p_campaign, p_answers); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_analytics_query(p_campaign uuid, p_metric text, p_question uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_analytics_query(p_campaign, p_metric, p_question); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- Hub creation: validated slug, audit event, same atomic claim
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.api_hub_create(p_slug text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Anonymous timing: coarse the timestamp that would otherwise equal participation.created_at exactly
-- ---------------------------------------------------------------------------------------------------------
create function lv.coarsen_submission_time() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from lv.campaigns c where c.id = new.campaign_id and c.anonymity = 'anonymous') then
    new.created_at := date_trunc('day', new.created_at);
  end if;
  return new;
end;
$$;
create trigger submissions_coarsen_time before insert on lv.submissions
  for each row execute function lv.coarsen_submission_time();

create function lv.answers_follow_submission_time() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_at := coalesce((select s.created_at from lv.submissions s where s.id = new.submission_id), new.created_at);
  return new;
end;
$$;
create trigger answers_follow_submission_time before insert on lv.answers
  for each row execute function lv.answers_follow_submission_time();

-- Internal functions stay unreachable from the API roles; only lv_api is exposed.
grant execute on all functions in schema lv_api to public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema lv from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all functions in schema lv from authenticated';
  end if;
end $$;

commit;
