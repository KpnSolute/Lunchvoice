-- Rollback for 000008_v2_error_envelope: drop the wrappers, put the original bodies back under lv_api.
drop trigger if exists answers_follow_submission_time on lv.answers;
drop function if exists lv.answers_follow_submission_time();
drop trigger if exists submissions_coarsen_time on lv.submissions;
drop function if exists lv.coarsen_submission_time();

-- Restore the 000006 body of hub_create (no slug validation, no audit event).
create or replace function lv.api_hub_create(p_slug text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_slug text := lower(btrim(p_slug));
  v_app uuid;
  v_hub uuid;
  v_member uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from lv.reserved_slugs r where r.slug = v_slug) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'That name is reserved.'));
  end if;
  select id into v_app from lv.beta_applications b
   where b.account_id = v_account and b.status = 'approved';
  if v_app is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_beta_required', 'message', 'Hub creation requires an approved beta application.'));
  end if;
  insert into lv.hubs (slug, display_name, owner_account_id) values (v_slug, btrim(p_name), v_account) returning id into v_hub;
  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (v_hub, v_account, 'accepted', now()) returning id into v_member;
  perform lv.owner_bootstrap_roles(v_hub, v_account);
  update lv.beta_applications set status = 'consumed', decided_at = now() where id = v_app;
  return jsonb_build_object('ok', true, 'hub_id', v_hub, 'slug', v_slug);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_conflict', 'message', 'That Hub name is taken.'));
end;
$$;

drop function if exists lv_api.lv_analytics_query(uuid, text, uuid);
drop function if exists lv_api.lv_submit_response(uuid, jsonb);
drop function if exists lv_api.lv_campaign_close(uuid);
drop function if exists lv_api.lv_campaign_activate(uuid);
drop function if exists lv_api.lv_campaign_question_add(uuid, int, text, text, jsonb);
drop function if exists lv_api.lv_campaign_create(uuid, text, text, text);
drop function if exists lv_api.lv_invite_revoke(uuid);
drop function if exists lv_api.lv_invite_redeem(text);
drop function if exists lv_api.lv_invite_create(uuid, int, timestamptz);
drop function if exists lv_api.lv_beta_decide(uuid, boolean);
drop function if exists lv_api.lv_beta_apply(text);
drop function if exists lv_api.lv_hub_create(text, text);
drop function if exists lv_api.lv_my_context();

alter function lv.api_my_context() rename to lv_my_context;
alter function lv.lv_my_context() set schema lv_api;
alter function lv.api_hub_create(text, text) rename to lv_hub_create;
alter function lv.lv_hub_create(text, text) set schema lv_api;
alter function lv.api_beta_apply(text) rename to lv_beta_apply;
alter function lv.lv_beta_apply(text) set schema lv_api;
alter function lv.api_beta_decide(uuid, boolean) rename to lv_beta_decide;
alter function lv.lv_beta_decide(uuid, boolean) set schema lv_api;
alter function lv.api_invite_create(uuid, int, timestamptz) rename to lv_invite_create;
alter function lv.lv_invite_create(uuid, int, timestamptz) set schema lv_api;
alter function lv.api_invite_redeem(text) rename to lv_invite_redeem;
alter function lv.lv_invite_redeem(text) set schema lv_api;
alter function lv.api_invite_revoke(uuid) rename to lv_invite_revoke;
alter function lv.lv_invite_revoke(uuid) set schema lv_api;
alter function lv.api_campaign_create(uuid, text, text, text) rename to lv_campaign_create;
alter function lv.lv_campaign_create(uuid, text, text, text) set schema lv_api;
alter function lv.api_campaign_question_add(uuid, int, text, text, jsonb) rename to lv_campaign_question_add;
alter function lv.lv_campaign_question_add(uuid, int, text, text, jsonb) set schema lv_api;
alter function lv.api_campaign_activate(uuid) rename to lv_campaign_activate;
alter function lv.lv_campaign_activate(uuid) set schema lv_api;
alter function lv.api_campaign_close(uuid) rename to lv_campaign_close;
alter function lv.lv_campaign_close(uuid) set schema lv_api;
alter function lv.api_submit_response(uuid, jsonb) rename to lv_submit_response;
alter function lv.lv_submit_response(uuid, jsonb) set schema lv_api;
alter function lv.api_analytics_query(uuid, text, uuid) rename to lv_analytics_query;
alter function lv.lv_analytics_query(uuid, text, uuid) set schema lv_api;

drop function if exists lv.api_error(text, text);
