-- Rollback for 000042_v2_linked_questions. Puts back the 000041 function bodies (answers validated by the sections
-- walk, section guard only, 000041 trigger), the original capacity check and the free-only question limit, and drops the
-- Linked Questions helpers and the results call. Data is untouched: logic lives in question settings (config), which
-- stays in place and is ignored. Note the 000041 validator it restores is the one with the weaker per-answer checks
-- that 000042 fixed; roll back only to re-run 000042 or if it must be withdrawn.
begin;

-- Resume-from-pause check goes back to draft-only.
create or replace function lv.campaign_rules_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_bad text;
begin
  if old.status = 'draft' and new.status <> 'draft' then
    v_bad := lv.section_rules_problem(new.id);
    if v_bad is not null then raise exception 'lv_invalid_input: %', v_bad using errcode = '22023'; end if;
  end if;
  return new;
end;
$$;

-- The 000041 validator (renamed core stays as it was).
create or replace function lv.validate_answers(p_campaign uuid, p_answers jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  v_val jsonb;
  v_seen int := 0;
  v_rule jsonb := null;
  v_shown boolean;
begin
  if (select c.mode from lv.campaigns c where c.id = p_campaign) = 'election'
     or not exists (select 1 from lv.campaign_questions x where x.campaign_id = p_campaign
                     and x.config ? 'section' and x.config->'section' <> 'null'::jsonb) then
    return lv.validate_answers_core(p_campaign, p_answers);
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return 'answers must be an array'; end if;

  for q in select * from lv.campaign_questions where campaign_id = p_campaign order by position loop
    -- A section starts at a question that carries one; its rule covers every question until the next section.
    if q.config ? 'section' and q.config->'section' <> 'null'::jsonb then
      v_rule := q.config->'section'->'show_if';
    end if;
    v_shown := lv.rule_met(v_rule, p_answers);

    select e->'value' into v_val
      from jsonb_array_elements(p_answers) e
     where (e->>'question_id')::uuid = q.id
     limit 1;

    if not v_shown then
      if v_val is not null and v_val <> 'null'::jsonb then return 'answer given for a question this person was not shown'; end if;
      continue;
    end if;

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
  v_bad := lv.section_write_guard(p_campaign, null, coalesce(p_config, '{}'::jsonb));
  if v_bad = 'ENTITLEMENT' then
    return lv.err_x('lv_entitlement_required', 'Sections and “show only if” rules start with Creator Plus or a Starter Hub.',
                    jsonb_build_object('product', 'creator_plus', 'feature', 'survey.branching'));
  end if;
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
  if q.id is not null and p_config is not null then
    v_bad := lv.section_write_guard(q.campaign_id, q.config, p_config);
    if v_bad = 'ENTITLEMENT' then
      return lv.err_x('lv_entitlement_required', 'Sections and “show only if” rules start with Creator Plus or a Starter Hub.',
                      jsonb_build_object('product', 'creator_plus', 'feature', 'survey.branching'));
    end if;
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
  v_hub uuid;
  v_account uuid := lv.current_account_id();
begin
  v := lv.campaign_get_base(p_campaign);
  if coalesce((v->>'ok')::boolean, false) and coalesce((v->>'can_manage')::boolean, false) then
    v := jsonb_set(v, '{campaign,has_responses}', to_jsonb(lv.campaign_has_responses(p_campaign)));
    v := jsonb_set(v, '{campaign,guest_names}', to_jsonb((select c.guest_names from lv.campaigns c where c.id = p_campaign)));
    select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
    v := v || jsonb_build_object('features', jsonb_build_object(
           'branching', lv.feature_allowed(v_hub, v_account, 'survey.branching'),
           'branding', lv.feature_allowed(v_hub, v_account, 'survey.branding')));
  end if;
  return v;
end;
$$;

-- The original question-limit guard (free family only).
create or replace function lv.quick_question_guard(p_campaign uuid, p_kind text, p_adding boolean) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_limit jsonb;
  v_used int;
  v_kinds jsonb;
begin
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.hub_kind(v_hub) <> 'personal' or lv.membership_of(lv.current_account_id(), v_hub) is null then return; end if;
  v_kinds := lv.plan_limit('free', 'quick.kinds');
  if p_kind is not null and (v_kinds is null or not (v_kinds ? p_kind)) then
    perform lv.fail('lv_invalid_input', 'Quick Surveys support rating, single choice, multi choice, yes/no and text questions.');
  end if;
  if p_adding then
    v_limit := lv.plan_limit('free', 'quick.max_questions');
    select count(*) into v_used from lv.campaign_questions q where q.campaign_id = p_campaign;
    if v_limit is null or v_used >= (v_limit)::int then
      perform lv.fail('lv_limit_reached', 'A Quick Survey can have at most ' || coalesce(v_limit::text, '0') || ' questions.',
                      jsonb_build_object('limit', (v_limit)::int, 'used', v_used));
    end if;
  end if;
end;
$$;

create or replace function lv_api.lv_quick_survey_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_quick_survey_list(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

drop function if exists lv.capacity_check(uuid);
alter function lv.capacity_check_core(uuid) rename to capacity_check;

drop function if exists lv_api.lv_analytics_question(uuid, uuid, jsonb);
drop function if exists lv.api_analytics_question(uuid, uuid, jsonb);
drop function if exists lv.campaign_has_logic(uuid);
drop function if exists lv.logic_walk(uuid, jsonb);
drop function if exists lv.condition_met(text, jsonb, jsonb);
drop function if exists lv.logic_rules_problem(uuid);
drop function if exists lv.logic_outline(uuid);
drop function if exists lv.logic_write_guard(uuid, text, text, jsonb, text, jsonb);
drop function if exists lv.logic_part(text, jsonb);
drop function if exists lv.question_pipe_refs(text, jsonb);
drop function if exists lv.pipe_refs(text);
drop function if exists lv.logic_config_problem(text, jsonb);
drop function if exists lv.check_answer_value(text, jsonb, jsonb);
drop function if exists lv.answer_matches(text, jsonb, jsonb);
drop function if exists lv.answer_empty(jsonb);
drop function if exists lv.scale_max(jsonb);
drop function if exists lv.scale_min(jsonb);
drop function if exists lv.kind_is_scale(text);
drop function if exists lv.kind_allows_jumps(text);
drop function if exists lv.kind_options(text, jsonb);
drop function if exists lv.quick_question_limit(uuid);
drop function if exists lv.quick_limit(uuid, text);


delete from lv.plan_limits where family in ('creator_plus', 'creator_pro') and key like 'quick.%';
commit;
