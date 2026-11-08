-- LunchVoice v2 canonical 22: FB-01, no role targeting on anonymous Campaigns (full-build compliance re-review).
--
-- Finding FB-01 (HIGH): with Team role targeting, two anonymous Campaigns sent to two roles that differ by one member
-- (e.g. GroupA of 10 and GroupA plus one target) give results whose difference is the target's answer, although
-- every cell passes the cohort and dominance rules. Rule from now on: an anonymous Campaign always goes to all
-- members; choosing participants by role is only for identified Campaigns, where the creator sees who answered
-- anyway. Enforced three ways:
--   1. a trigger refuses any campaigns row that is anonymous AND role-targeted, with a clear lv_not_available
--      message (covers lv_campaign_set_audience_roles on an anonymous draft and lv_campaign_update switching a
--      role-targeted draft to anonymous; the API wrappers turn it into the normal error envelope);
--   2. the activation gate adds the reason role_targeting_anonymous (defence in depth);
--   3. no existing data changes (production has no role-targeted Campaign; the trigger checks new writes only).
-- Role targeting on identified Campaigns is unchanged.

begin;

create function lv.forbid_anonymous_role_targeting() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.anonymity = 'anonymous' and new.audience_scope = 'roles' then
    raise exception 'lv_not_available: Choosing participants by role is only for identified Campaigns. An anonymous Campaign goes to all members, so no answer can be traced to one person.';
  end if;
  return new;
end;
$$;
revoke all on function lv.forbid_anonymous_role_targeting() from public;

create trigger campaigns_no_anonymous_role_targeting
  before insert or update of anonymity, audience_scope on lv.campaigns
  for each row execute function lv.forbid_anonymous_role_targeting();

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
  -- FB-01: role targeting is for identified Campaigns only (overlapping role audiences let anonymous answers be
  -- differenced back to one person).
  if c.audience_scope = 'roles' and c.anonymity = 'anonymous' then
    v_reasons := v_reasons || to_jsonb('role_targeting_anonymous'::text);
  end if;
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

commit;
