-- Rollback for 000041_v2_sections_and_creator_plans. Restores the 000017/000018/000028 function bodies and the original
-- family checks. Refuses (raises) while any Creator entitlement exists: a rollback never deletes a customer's plan.
begin;
do $$ begin
  if exists (select 1 from lv.entitlements where family in ('creator_plus', 'creator_pro')) then
    raise exception 'Creator entitlements exist; resolve them before rolling back 000041.';
  end if;
end $$;

drop trigger if exists campaigns_rules_check on lv.campaigns;

create or replace function lv.validate_answers(p_campaign uuid, p_answers jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  v_val jsonb;
  v_seen int := 0;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return 'answers must be an array'; end if;

  for q in select * from lv.campaign_questions where campaign_id = p_campaign loop
    select e->'value' into v_val
      from jsonb_array_elements(p_answers) e
     where (e->>'question_id')::uuid = q.id
     limit 1;

    if v_val is null or v_val = 'null'::jsonb then
      if coalesce(q.config->>'optional', 'false') = 'true' then continue; end if;
      return 'missing answer for question ' || q.position;
    end if;

    if q.kind = 'rating' then
      if jsonb_typeof(v_val) <> 'number' then return 'rating must be a number'; end if;
      if (v_val)::numeric < 1 or (v_val)::numeric > 5 then return 'rating out of range'; end if;
    end if;
    v_seen := v_seen + 1;
  end loop;

  if v_seen = 0 then return 'answer at least one question'; end if;
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

create or replace function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  v := lv.campaign_get_base(p_campaign);
  if coalesce((v->>'ok')::boolean, false) and coalesce((v->>'can_manage')::boolean, false) then
    v := jsonb_set(v, '{campaign,has_responses}', to_jsonb(lv.campaign_has_responses(p_campaign)));
    v := jsonb_set(v, '{campaign,guest_names}', to_jsonb((select c.guest_names from lv.campaigns c where c.id = p_campaign)));
  end if;
  return v;
end;
$$;

drop function if exists lv.section_write_guard(uuid, jsonb, jsonb);
drop function if exists lv.campaign_rules_check();
drop function if exists lv.section_rules_problem(uuid);
drop function if exists lv.rule_met(jsonb, jsonb);
drop function if exists lv.section_config_problem(jsonb);
drop function if exists lv.feature_allowed(uuid, uuid, text);
drop function if exists lv.account_creator_family(uuid);

delete from lv.plan_limits where key in ('survey.branching', 'survey.branding');
delete from lv.plan_limits where family in ('creator_plus', 'creator_pro');
delete from lv.products where product in ('creator_plus', 'creator_pro');

alter table lv.entitlements drop constraint if exists entitlements_creator_is_account;
alter table lv.entitlements drop constraint if exists entitlements_family_check;
alter table lv.entitlements add constraint entitlements_family_check check (family in ('free', 'starter', 'team'));
alter table lv.products drop constraint if exists products_family_check;
alter table lv.products add constraint products_family_check check (family is null or family in ('free', 'starter', 'team'));
alter table lv.plan_limits drop constraint if exists plan_limits_family_check;
alter table lv.plan_limits add constraint plan_limits_family_check check (family in ('free', 'starter', 'team'));
commit;
