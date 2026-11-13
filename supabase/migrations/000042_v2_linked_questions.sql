-- 000042: Linked Questions, full survey logic (founder 2026-11-13: "Full SurveyMonkey logic", Creator Plus and
-- Starter Hub and above through the existing survey.branching entitlement, enforced here).
--
-- All logic lives in question settings (lv.campaign_questions.config), next to the 000041 sections:
--   config.show_if   = {match: 'all'|'any', conditions: [{question_id, op, values?, min?, max?}]}
--                      op any_of/none_of (choice, yes/no "true"/"false"), at_least/at_most/between (rating).
--   config.jumps     = [{when: <option or "true"/"false">, to: <later question id> | 'end'}] (single choice, yes/no)
--   config.shuffle   = true (options in random order per person), config.keep_last = true (pin "Other"/"None")
--   config.section.shuffle = true (questions of that section in random order)
--   {{q:<question id>}} or {{q:<id>|fallback}} in a prompt or an option pipes an earlier answer in. Piping is display
--   only in the respondent's own browser: nothing piped is ever sent, stored or shown to anyone else.
--
-- 1. Shape checks on write and the plan gate (survey.branching) for any new or changed logic; elections refuse logic.
-- 2. Publishing (draft -> live, and paused -> active) refuses broken logic: rules that look forward, missing targets,
--    deleted options, wrong kinds, skips backwards, and logic inside a random-order section.
-- 3. lv.validate_answers walks the path exactly like src/lib/logic.ts (visible set, skips, end survey). Answers to
--    hidden questions are refused; a required question is required only when shown.
--    SECURITY (review of 000041, live in production): the 000041 wrapper skipped every per-answer check except the
--    rating range for Campaigns with sections. Now every shown answer is checked by ONE per-kind function,
--    lv.check_answer_value(kind, config, value) (choice in options, multi choice distinct/in options/within max,
--    yes/no boolean, rating number in range, text string up to 280 characters), and EVERY path (elections, Campaigns
--    without logic) refuses malformed entries, unknown question ids (which could otherwise land answers on another
--    Campaign's questions) and a question answered twice. Elections and Campaigns without logic otherwise still go
--    through lv.validate_answers_core unchanged.
-- 4. lv_api.lv_analytics_question: per question how many people's paths showed it (seen) and answered it, and the
--    distribution, optionally only for respondents with an earlier answer (filter). Anonymous surveys keep the
--    minimum cohort: a seen/answered count, a filter group or the people outside it under the cohort is withheld.
-- 5. Quick Survey limits from the entitlement map for Creator accounts (the install only defined free's):
--    Creator Plus 30 questions / 15 active, Creator Pro 100 / 100, kinds and modes as free. The question guard, the
--    activation gate (lv.capacity_check, wrapped not replaced) and the Quick Surveys list all resolve the owner's
--    Creator family and fall back to free.
-- Rollback: supabase/rollbacks/000042_v2_linked_questions.down.sql.
begin;

-- ---------------------------------------------------------------- 5. Quick Survey limits from the map
-- Production defines the quick.* keys for the free family only, so a Creator account stayed capped at the free numbers.
-- These are the founder's proposed perks (Project Profile doc): change them with one UPDATE of lv.plan_limits.
-- Numbers: the larger of the free value and the owner's Creator family value. Kinds and modes: the Creator family's
-- when it has one, else free's.
insert into lv.plan_limits (family, key, value, note) values
  ('creator_plus', 'quick.max_questions', '30', 'Linked Questions 2026-11-13: Creator Plus, up to 30 questions per Quick Survey (founder perk, easy to change).'),
  ('creator_plus', 'quick.max_active', '15', 'Linked Questions 2026-11-13: Creator Plus, up to 15 active Quick Surveys (founder perk, easy to change).'),
  ('creator_pro', 'quick.max_questions', '100', 'Linked Questions 2026-11-13: Creator Pro, 100 questions per Quick Survey, effectively unlimited (founder perk, easy to change).'),
  ('creator_pro', 'quick.max_active', '100', 'Linked Questions 2026-11-13: Creator Pro, 100 active Quick Surveys, effectively unlimited (founder perk, easy to change).')
on conflict (family, key) do nothing;
-- Kinds (and modes, where the install defines them) start the same as free.
insert into lv.plan_limits (family, key, value, note)
select f.family, l.key, l.value, 'Linked Questions 2026-11-13: same as free for now.'
  from lv.plan_limits l cross join (values ('creator_plus'), ('creator_pro')) f(family)
 where l.family = 'free' and l.key in ('quick.kinds', 'quick.modes')
on conflict (family, key) do nothing;

-- One limit for a personal space: numbers take the larger of free and the owner's Creator family; other values
-- (kinds, modes) the Creator family's own when it has one.
create function lv.quick_limit(p_hub uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_free jsonb := lv.plan_limit('free', p_key);
  v_creator jsonb;
begin
  select lv.plan_limit(lv.account_creator_family(h.owner_account_id), p_key) into v_creator from lv.hubs h where h.id = p_hub;
  if v_creator is null or v_creator = 'null'::jsonb then return v_free; end if;
  if jsonb_typeof(v_creator) = 'number' and jsonb_typeof(v_free) = 'number' then
    return case when (v_creator)::numeric > (v_free)::numeric then v_creator else v_free end;
  end if;
  return v_creator;
end;
$$;

create function lv.quick_question_limit(p_hub uuid) returns int
language sql stable security definer set search_path = ''
as $$ select (lv.quick_limit(p_hub, 'quick.max_questions'))::int $$;

create or replace function lv.quick_question_guard(p_campaign uuid, p_kind text, p_adding boolean) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_limit int;
  v_used int;
  v_kinds jsonb;
begin
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.hub_kind(v_hub) <> 'personal' or lv.membership_of(lv.current_account_id(), v_hub) is null then return; end if;
  v_kinds := lv.quick_limit(v_hub, 'quick.kinds');
  if p_kind is not null and (v_kinds is null or not (v_kinds ? p_kind)) then
    perform lv.fail('lv_invalid_input', 'Quick Surveys support rating, single choice, multi choice, yes/no and text questions.');
  end if;
  if p_adding then
    v_limit := lv.quick_question_limit(v_hub);
    select count(*) into v_used from lv.campaign_questions q where q.campaign_id = p_campaign;
    if v_limit is null or v_limit = 0 or v_used >= v_limit then
      perform lv.fail('lv_limit_reached', 'A Quick Survey can have at most ' || coalesce(v_limit, 0)::text || ' questions.',
                      jsonb_build_object('limit', v_limit, 'used', v_used));
    end if;
  end if;
end;
$$;

-- Merge-safe: the original body (which reads the free numbers for a personal space) is kept as the core. For a
-- personal space the three Quick Survey checks are redone with the Creator-aware limits.
alter function lv.capacity_check(uuid) rename to capacity_check_core;
revoke all on function lv.capacity_check_core(uuid) from public;
create function lv.capacity_check(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb := lv.capacity_check_core(p_campaign);
  c record;
  v_reasons jsonb;
  v_limit jsonb;
  v_used int;
  v_kinds jsonb;
  v_detail jsonb := '{}'::jsonb;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c.id is null or lv.hub_kind(c.hub_id) <> 'personal' or (v->'reasons') ? 'entitlement_required' then return v; end if;
  v_reasons := (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(v->'reasons') r
                 where r not in ('"limit_reached"'::jsonb, '"too_many_questions"'::jsonb, '"kind_not_allowed"'::jsonb, '"limit_undefined"'::jsonb));
  v_limit := lv.quick_limit(c.hub_id, 'quick.max_active');
  select count(*) into v_used from lv.campaigns x where x.hub_id = c.hub_id and x.status in ('active', 'paused') and x.id <> c.id;
  if v_limit is null then v_reasons := v_reasons || '"limit_undefined"'::jsonb;
  elsif v_used >= (v_limit)::int then
    v_reasons := v_reasons || '"limit_reached"'::jsonb;
    v_detail := jsonb_build_object('limit', (v_limit)::int, 'used', v_used, 'limit_key', 'quick.max_active');
  end if;
  v_limit := lv.quick_limit(c.hub_id, 'quick.max_questions');
  select count(*) into v_used from lv.campaign_questions q where q.campaign_id = c.id;
  if v_limit is null or v_used > (v_limit)::int then
    v_reasons := v_reasons || '"too_many_questions"'::jsonb;
    if v_detail = '{}'::jsonb and v_limit is not null then
      v_detail := jsonb_build_object('limit', (v_limit)::int, 'used', v_used, 'limit_key', 'quick.max_questions');
    end if;
  end if;
  v_kinds := lv.quick_limit(c.hub_id, 'quick.kinds');
  if v_kinds is null or exists (select 1 from lv.campaign_questions q where q.campaign_id = c.id and not (v_kinds ? q.kind)) then
    v_reasons := v_reasons || '"kind_not_allowed"'::jsonb;
  end if;
  return (v - 'reasons' - 'limit' - 'used' - 'limit_key') || jsonb_build_object('reasons', v_reasons) || v_detail;
end;
$$;

-- The Quick Surveys page shows the person's own limits.
create or replace function lv_api.lv_quick_survey_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_hub uuid;
begin
  v := lv.api_quick_survey_list();
  if coalesce((v->>'ok')::boolean, false) then
    v_hub := lv.personal_space_of(lv.current_account_id());
    v := v || jsonb_build_object('limit', (lv.quick_limit(v_hub, 'quick.max_active'))::int, 'question_limit', lv.quick_question_limit(v_hub));
  end if;
  return v;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- ---------------------------------------------------------------- per-kind helpers (extended by new kinds, 000046)
-- Answer keys a rule or skip can match: the options for kinds with discrete options, true/false for yes/no, else NULL.
create function lv.kind_options(p_kind text, p_config jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when p_kind = 'yes_no' then '["true", "false"]'::jsonb
              when p_kind in ('single_choice', 'multi_choice') then coalesce(p_config->'options', '[]'::jsonb)
              else null end
$$;
-- Kinds whose one answer can drive a skip.
create function lv.kind_allows_jumps(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind in ('single_choice', 'yes_no') $$;
-- Kinds compared as numbers (at_least / at_most / between), with their range (config min/max, default 1 to 5).
create function lv.kind_is_scale(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind = 'rating' $$;
create function lv.scale_min(p_config jsonb) returns numeric
language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(p_config->'min') = 'number' then (p_config->>'min')::numeric else 1 end $$;
-- config.max on a choice question is the most picks, not a scale end: only read it when there are no options.
create function lv.scale_max(p_config jsonb) returns numeric
language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(p_config->'max') = 'number' and not (p_config ? 'options') then (p_config->>'max')::numeric else 5 end $$;

create function lv.answer_empty(p_value jsonb) returns boolean
language sql immutable set search_path = ''
as $$ select p_value is null or p_value = 'null'::jsonb or p_value = '""'::jsonb or p_value = '[]'::jsonb $$;

-- Does an answer hit any of these keys? Arrays match on any element; true/false compare as "true"/"false".
-- p_kind is unused today and lets new kinds map their stored value to keys.
create function lv.answer_matches(p_kind text, p_value jsonb, p_any_of jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when lv.answer_empty(p_value) or jsonb_typeof(p_any_of) is distinct from 'array' then false
    when jsonb_typeof(p_value) = 'array' then exists (select 1 from jsonb_array_elements(p_value) a, jsonb_array_elements_text(p_any_of) m where a #>> '{}' = m)
    else exists (select 1 from jsonb_array_elements_text(p_any_of) m where m = p_value #>> '{}')
  end
$$;

-- ONE per-answer value check per kind. Returns a reason or NULL. Today's kinds; 000046 adds more.
create function lv.check_answer_value(p_kind text, p_config jsonb, p_value jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_opts jsonb := coalesce(p_config->'options', '[]'::jsonb);
begin
  if p_kind = 'rating' then
    if jsonb_typeof(p_value) <> 'number' then return 'rating must be a number'; end if;
    if (p_value)::numeric < lv.scale_min(p_config) or (p_value)::numeric > lv.scale_max(p_config) then return 'rating out of range'; end if;
  elsif p_kind = 'single_choice' then
    if jsonb_typeof(p_value) <> 'string' or not (v_opts @> jsonb_build_array(p_value)) then return 'choose one of the options'; end if;
  elsif p_kind = 'multi_choice' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) = 0 then return 'choose at least one option'; end if;
    if exists (select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x) <> 'string' or not (v_opts @> jsonb_build_array(x))) then
      return 'choose only from the options';
    end if;
    if (select count(distinct x) from jsonb_array_elements(p_value) x) <> jsonb_array_length(p_value) then return 'choose each option once'; end if;
    if jsonb_typeof(p_config->'max') = 'number' and jsonb_array_length(p_value) > (p_config->>'max')::int then
      return 'choose at most ' || (p_config->>'max') || ' options';
    end if;
  elsif p_kind = 'yes_no' then
    if jsonb_typeof(p_value) <> 'boolean' then return 'answer yes or no'; end if;
  elsif p_kind = 'text' then
    if jsonb_typeof(p_value) <> 'string' then return 'a text answer must be text'; end if;
    if length(p_value #>> '{}') > 280 then return 'keep a text answer to 280 characters'; end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------- 1. logic shape (write time)
create function lv.logic_config_problem(p_kind text, p_config jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  r jsonb := p_config->'show_if';
  c jsonb;
  j jsonb;
  v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_shuffle boolean;
begin
  if p_config is null then return null; end if;
  if r is not null and r <> 'null'::jsonb then
    if jsonb_typeof(r) <> 'object' or coalesce(r->>'match', '') not in ('all', 'any') then return 'A rule needs to match all or any of its conditions.'; end if;
    if jsonb_typeof(r->'conditions') is distinct from 'array' or jsonb_array_length(r->'conditions') not between 1 and 10 then
      return 'A rule needs 1 to 10 conditions.';
    end if;
    for c in select * from jsonb_array_elements(r->'conditions') loop
      if jsonb_typeof(c) <> 'object' or jsonb_typeof(c->'question_id') is distinct from 'string' or (c->>'question_id') !~ v_uuid then
        return 'Each condition needs the question it depends on.';
      end if;
      if c->>'op' in ('any_of', 'none_of') then
        if jsonb_typeof(c->'values') is distinct from 'array' or jsonb_array_length(c->'values') not between 1 and 10
           or exists (select 1 from jsonb_array_elements(c->'values') e where jsonb_typeof(e) <> 'string') then
          return 'A condition needs 1 to 10 answers to match.';
        end if;
      elsif c->>'op' in ('at_least', 'at_most', 'between') then
        if (c->>'op' <> 'at_most' and jsonb_typeof(c->'min') is distinct from 'number')
           or (c->>'op' <> 'at_least' and jsonb_typeof(c->'max') is distinct from 'number') then
          return 'A rating condition needs its number.';
        end if;
        if c->>'op' = 'between' and (c->>'min')::numeric > (c->>'max')::numeric then return 'In “between”, the lower rating comes first.'; end if;
      else
        return 'A condition is “is any of”, “is none of”, “at least”, “at most” or “between”.';
      end if;
    end loop;
  end if;

  if p_config ? 'jumps' and p_config->'jumps' <> 'null'::jsonb then
    if jsonb_typeof(p_config->'jumps') <> 'array' or jsonb_array_length(p_config->'jumps') > 30 then return 'Skip logic must be a list.'; end if;
    if jsonb_array_length(p_config->'jumps') > 0 and not lv.kind_allows_jumps(p_kind) then
      return 'Skip logic works on single choice and yes/no questions.';
    end if;
    for j in select * from jsonb_array_elements(p_config->'jumps') loop
      if jsonb_typeof(j) <> 'object' or jsonb_typeof(j->'when') is distinct from 'string' or jsonb_typeof(j->'to') is distinct from 'string'
         or (j->>'to') <> 'end' then
        -- First release: a matching answer can only END the survey. Skipping forward to a question ships later.
        return 'A skip can end the survey on a chosen answer.';
      end if;
    end loop;
    if (select count(distinct x->>'when') from jsonb_array_elements(p_config->'jumps') x) <> jsonb_array_length(p_config->'jumps') then
      return 'Each answer can skip to one place.';
    end if;
  end if;

  if (p_config ? 'shuffle' and jsonb_typeof(p_config->'shuffle') <> 'boolean')
     or (p_config ? 'keep_last' and jsonb_typeof(p_config->'keep_last') <> 'boolean')
     or (jsonb_typeof(p_config->'section') = 'object' and (p_config->'section') ? 'shuffle' and jsonb_typeof(p_config->'section'->'shuffle') <> 'boolean') then
    return 'Random order is on or off.';
  end if;
  v_shuffle := coalesce((p_config->>'shuffle')::boolean, false);
  if v_shuffle and (p_kind = 'yes_no' or lv.kind_options(p_kind, p_config) is null) then
    return 'Only choice questions can show their options in random order.';
  end if;
  if coalesce((p_config->>'keep_last')::boolean, false) and not v_shuffle then
    return 'Keeping the last option fixed needs random order on.';
  end if;
  return null;
end;
$$;

-- Question ids piped into a text ({{q:<id>}} or {{q:<id>|fallback}}).
create function lv.pipe_refs(p_text text) returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}'::text[])
    from regexp_matches(coalesce(p_text, ''), '\{\{q:([0-9a-fA-F-]{36})(\|[^}]*)?\}\}', 'g') as m
$$;
create function lv.question_pipe_refs(p_prompt text, p_config jsonb) returns text[]
language sql immutable set search_path = ''
as $$
  select lv.pipe_refs(coalesce(p_prompt, '') || ' ' ||
    coalesce((select string_agg(o, ' ') from jsonb_array_elements_text(case when jsonb_typeof(p_config->'options') = 'array' then p_config->'options' else '[]'::jsonb end) o), ''))
$$;

-- The logic part of a question, for "did the logic change?" (removing logic is always allowed).
create function lv.logic_part(p_prompt text, p_config jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'show_if', nullif(p_config->'show_if', 'null'::jsonb),
    'jumps', case when jsonb_typeof(p_config->'jumps') = 'array' and jsonb_array_length(p_config->'jumps') > 0 then p_config->'jumps' end,
    'shuffle', case when (p_config->>'shuffle') = 'true' then true end,
    'keep_last', case when (p_config->>'keep_last') = 'true' then true end,
    'section_shuffle', case when (p_config->'section'->>'shuffle') = 'true' then true end,
    'pipes', case when cardinality(lv.question_pipe_refs(p_prompt, p_config)) > 0 then to_jsonb(lv.question_pipe_refs(p_prompt, p_config)) end))
$$;

create function lv.logic_write_guard(p_campaign uuid, p_kind text, p_old_prompt text, p_old jsonb, p_new_prompt text, p_new jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_new jsonb := lv.logic_part(p_new_prompt, p_new);
  v_bad text := lv.logic_config_problem(p_kind, p_new);
begin
  if v_bad is not null then return v_bad; end if;
  if v_new = '{}'::jsonb then return null; end if;
  if p_old is not null and lv.logic_part(p_old_prompt, p_old) = v_new then return null; end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null then return null; end if;   -- the body answers lv_not_found
  if (select c.mode from lv.campaigns c where c.id = p_campaign) = 'election' then
    return 'An election has no question logic: every voter sees every race in the same order.';
  end if;
  if not lv.feature_allowed(v_hub, lv.current_account_id(), 'survey.branching') then return 'ENTITLEMENT'; end if;
  return null;
end;
$$;

-- 000041 bodies plus the logic guard.
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
  v_bad := lv.logic_write_guard(p_campaign, p_kind, null, null, p_prompt, coalesce(p_config, '{}'::jsonb));
  if v_bad = 'ENTITLEMENT' then
    return lv.err_x('lv_entitlement_required', 'Question logic (show only if, skip to, piping and random order) starts with Creator Plus or a Starter Hub.',
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
  if q.id is not null and (p_kind is not null or p_config is not null or p_prompt is not null) then
    v_bad := lv.logic_write_guard(q.campaign_id, coalesce(p_kind, q.kind), q.prompt, q.config, coalesce(p_prompt, q.prompt), coalesce(p_config, q.config));
    if v_bad = 'ENTITLEMENT' then
      return lv.err_x('lv_entitlement_required', 'Question logic (show only if, skip to, piping and random order) starts with Creator Plus or a Starter Hub.',
                      jsonb_build_object('product', 'creator_plus', 'feature', 'survey.branching'));
    end if;
    if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;
  end if;
  return lv.api_campaign_question_update(p_question, p_position, p_kind, p_prompt, p_config);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- ---------------------------------------------------------------- 2. publish checks
-- Questions with their number, section index (a running count of section starts) and position, as one jsonb list.
create function lv.logic_outline(p_campaign uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'n', x.n, 'sec', x.sec, 'position', x.position, 'kind', x.kind,
                                               'prompt', x.prompt, 'config', x.config, 'first_in_sec', x.first_in_sec) order by x.position), '[]'::jsonb)
    from (select y.*, y.position = min(y.position) over (partition by y.sec) as first_in_sec
            from (select cq.id, row_number() over (order by cq.position)::int as n,
                         (count(*) filter (where jsonb_typeof(cq.config->'section') = 'object') over (order by cq.position))::int as sec,
                         cq.position, cq.kind, cq.prompt, cq.config
                    from lv.campaign_questions cq where cq.campaign_id = p_campaign) y) x
$$;

create function lv.logic_rules_problem(p_campaign uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_all jsonb := lv.logic_outline(p_campaign);
  q jsonb;
  t jsonb;
  c jsonb;
  j jsonb;
  v_id text;
  v_name text;
  v_keys jsonb;
  v_shuffled int[];
  v_in_shuffled boolean;
begin
  select coalesce(array_agg((x->>'sec')::int), '{}') into v_shuffled from jsonb_array_elements(v_all) x where (x->'config'->'section'->>'shuffle') = 'true';
  for q in select * from jsonb_array_elements(v_all) loop
    v_name := 'Question ' || (q->>'n');
    v_in_shuffled := (q->>'sec')::int = any(v_shuffled);

    if jsonb_typeof(q->'config'->'show_if') = 'object' then
      for c in select * from jsonb_array_elements(q->'config'->'show_if'->'conditions') loop
        select x into t from jsonb_array_elements(v_all) x where x->>'id' = lower(c->>'question_id');
        if t is null then return v_name || ' depends on a question that no longer exists.'; end if;
        if (t->>'position')::int >= (q->>'position')::int then return v_name || ' depends on a later question. Logic can only look back.'; end if;
        if v_in_shuffled and t->>'sec' = q->>'sec' then
          return v_name || ' depends on a question in the same random-order section. Turn off random order or move one of them.';
        end if;
        if c->>'op' in ('any_of', 'none_of') then
          v_keys := lv.kind_options(t->>'kind', t->'config');
          if v_keys is null then return v_name || ' depends on a question people cannot pick an answer for.'; end if;
          if exists (select 1 from jsonb_array_elements(c->'values') m where not (v_keys @> jsonb_build_array(m))) then
            return v_name || ' matches an answer that is not an option any more.';
          end if;
        else
          if not lv.kind_is_scale(t->>'kind') then return v_name || ' compares a number on a question that is not a rating.'; end if;
          if exists (select 1 from (values (c->'min'), (c->'max')) v(x) where jsonb_typeof(v.x) = 'number'
                       and ((v.x)::numeric <> trunc((v.x)::numeric) or (v.x)::numeric < lv.scale_min(t->'config') or (v.x)::numeric > lv.scale_max(t->'config'))) then
            return v_name || ' compares with a rating outside its scale.';
          end if;
        end if;
        t := null;
      end loop;
    end if;

    if jsonb_typeof(q->'config'->'jumps') = 'array' and jsonb_array_length(q->'config'->'jumps') > 0 then
      if not lv.kind_allows_jumps(q->>'kind') then return v_name || ' can only skip on a single-choice or yes/no answer.'; end if;
      if v_in_shuffled then return v_name || ' is in a random-order section, which cannot have skip logic inside it.'; end if;
      v_keys := lv.kind_options(q->>'kind', q->'config');
      for j in select * from jsonb_array_elements(q->'config'->'jumps') loop
        if not (v_keys @> jsonb_build_array(j->'when')) then return v_name || ' skips on an answer that is not an option any more.'; end if;
        continue when j->>'to' = 'end';
        select x into t from jsonb_array_elements(v_all) x where x->>'id' = lower(j->>'to');
        if t is null then return v_name || ' skips to a question that no longer exists.'; end if;
        if (t->>'position')::int <= (q->>'position')::int then return v_name || ' can only skip forward.'; end if;
        if (t->>'sec')::int = any(v_shuffled) and not (t->>'first_in_sec')::boolean then
          return v_name || ' skips into the middle of a random-order section. Skip to its first question.';
        end if;
        t := null;
      end loop;
    end if;

    foreach v_id in array lv.question_pipe_refs(q->>'prompt', q->'config') loop
      select x into t from jsonb_array_elements(v_all) x where x->>'id' = v_id;
      if t is null then return v_name || ' pipes in an answer from a question that no longer exists.'; end if;
      if (t->>'position')::int >= (q->>'position')::int then return v_name || ' pipes in an answer from a later question. Logic can only look back.'; end if;
      if v_in_shuffled and t->>'sec' = q->>'sec' then
        return v_name || ' pipes in an answer from a question in the same random-order section. Turn off random order or move one of them.';
      end if;
      t := null;
    end loop;
  end loop;
  return null;
end;
$$;

-- 000041's trigger, now with question logic, and also when a paused Campaign (edited while nobody had answered) resumes.
create or replace function lv.campaign_rules_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_bad text;
begin
  if (old.status = 'draft' and new.status <> 'draft') or (old.status = 'paused' and new.status = 'active') then
    v_bad := coalesce(lv.section_rules_problem(new.id), lv.logic_rules_problem(new.id));
    if v_bad is not null then raise exception 'lv_invalid_input: %', v_bad using errcode = '22023'; end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 3. the path and the validator
create function lv.condition_met(p_kind text, p_cond jsonb, p_answers jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v jsonb := p_answers -> lower(p_cond->>'question_id');
begin
  if lv.answer_empty(v) then return false; end if;
  case p_cond->>'op'
    when 'any_of' then return lv.answer_matches(p_kind, v, p_cond->'values');
    when 'none_of' then return not lv.answer_matches(p_kind, v, p_cond->'values');
    when 'at_least' then return jsonb_typeof(v) = 'number' and (v)::numeric >= (p_cond->>'min')::numeric;
    when 'at_most' then return jsonb_typeof(v) = 'number' and (v)::numeric <= (p_cond->>'max')::numeric;
    when 'between' then return jsonb_typeof(v) = 'number' and (v)::numeric between (p_cond->>'min')::numeric and (p_cond->>'max')::numeric;
    else return false;
  end case;
end;
$$;

-- The questions one person is shown, in position order, given {question_id: value}. Mirrors walk() in src/lib/logic.ts.
create function lv.logic_walk(p_campaign uuid, p_answers jsonb) returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  v_eff jsonb := '{}'::jsonb;     -- answers to questions already shown: the only ones a rule may read
  v_sec jsonb := null;
  v_skip int := null;
  v_end boolean := false;
  v_vis uuid[] := '{}';
  v_val jsonb;
  v_to text;
  v_tpos int;
  v_ok boolean;
begin
  for q in select cq.id, cq.position, cq.kind, cq.config from lv.campaign_questions cq where cq.campaign_id = p_campaign order by cq.position loop
    if jsonb_typeof(q.config->'section') = 'object' then v_sec := nullif(q.config->'section'->'show_if', 'null'::jsonb); end if;
    continue when v_end;
    continue when v_skip is not null and q.position < v_skip;
    v_skip := null;
    if v_sec is not null and not lv.answer_matches(null, v_eff -> lower(v_sec->>'question_id'), v_sec->'any_of') then continue; end if;
    if jsonb_typeof(q.config->'show_if') = 'object' then
      if q.config->'show_if'->>'match' = 'any' then
        select coalesce(bool_or(lv.condition_met(t.kind, c, v_eff)), false) into v_ok
          from jsonb_array_elements(q.config->'show_if'->'conditions') c left join lv.campaign_questions t on t.id::text = lower(c->>'question_id');
      else
        select coalesce(bool_and(lv.condition_met(t.kind, c, v_eff)), true) into v_ok
          from jsonb_array_elements(q.config->'show_if'->'conditions') c left join lv.campaign_questions t on t.id::text = lower(c->>'question_id');
      end if;
      continue when not v_ok;
    end if;
    v_vis := v_vis || q.id;
    v_val := p_answers -> q.id::text;
    continue when lv.answer_empty(v_val);
    v_eff := v_eff || jsonb_build_object(q.id::text, v_val);
    continue when jsonb_typeof(v_val) in ('array', 'object');
    v_to := null;
    select x->>'to' into v_to from jsonb_array_elements(case when jsonb_typeof(q.config->'jumps') = 'array' then q.config->'jumps' else '[]'::jsonb end) x
     where x->>'when' = v_val #>> '{}' limit 1;
    if v_to = 'end' then v_end := true;
    elsif v_to is not null then
      v_tpos := null;
      select t.position into v_tpos from lv.campaign_questions t where t.campaign_id = p_campaign and t.id::text = lower(v_to);
      if v_tpos > q.position then v_skip := v_tpos; end if;
    end if;
  end loop;
  return v_vis;
end;
$$;

-- Logic (rules or skips) or 000041 sections: the answers must follow the path.
create function lv.campaign_has_logic(p_campaign uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from lv.campaign_questions x where x.campaign_id = p_campaign
                   and (jsonb_typeof(x.config->'section') = 'object' or jsonb_typeof(x.config->'show_if') = 'object'
                        or (jsonb_typeof(x.config->'jumps') = 'array' and jsonb_array_length(x.config->'jumps') > 0)))
$$;

create or replace function lv.validate_answers(p_campaign uuid, p_answers jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  v_obj jsonb;
  v_vis uuid[];
  v_val jsonb;
  v_bad text;
  v_seen int := 0;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return 'answers must be an array'; end if;
  -- Every path (000042 security fix): well-formed entries, questions of THIS Campaign only, each at most once.
  if exists (select 1 from jsonb_array_elements(p_answers) e
              where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'question_id') is distinct from 'string'
                 or (e->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    return 'every answer needs a question_id';
  end if;
  if exists (select 1 from jsonb_array_elements(p_answers) e
              where not exists (select 1 from lv.campaign_questions x where x.campaign_id = p_campaign and x.id = (e->>'question_id')::uuid)) then
    return 'answer given for a question that is not in this survey';
  end if;
  if (select count(distinct (e->>'question_id')::uuid) from jsonb_array_elements(p_answers) e) <> jsonb_array_length(p_answers) then
    return 'each question can be answered once';
  end if;

  -- Elections and Campaigns without logic or sections: the installed validator, unchanged.
  if (select c.mode from lv.campaigns c where c.id = p_campaign) = 'election' or not lv.campaign_has_logic(p_campaign) then
    return lv.validate_answers_core(p_campaign, p_answers);
  end if;

  select coalesce(jsonb_object_agg(lower(e->>'question_id'), e->'value'), '{}'::jsonb) into v_obj from jsonb_array_elements(p_answers) e;
  v_vis := lv.logic_walk(p_campaign, v_obj);
  for q in select * from lv.campaign_questions where campaign_id = p_campaign order by position loop
    v_val := v_obj -> q.id::text;
    if not (q.id = any(v_vis)) then
      if v_val is not null and v_val <> 'null'::jsonb then return 'answer given for a question this person was not shown'; end if;
      continue;
    end if;
    if lv.answer_empty(v_val) then
      if coalesce(q.config->>'optional', 'false') = 'true' then continue; end if;
      return 'missing answer for question ' || q.position;
    end if;
    v_bad := lv.check_answer_value(q.kind, q.config, v_val);
    if v_bad is not null then return v_bad || ' (question ' || q.position || ')'; end if;
    v_seen := v_seen + 1;
  end loop;
  if v_seen = 0 then return 'answer at least one question'; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------- 5b. what a manager may use here (000041 + limit)
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
    if lv.hub_kind(v_hub) = 'personal' then
      v := jsonb_set(v, '{campaign,question_limit}', to_jsonb(lv.quick_question_limit(v_hub)));
    end if;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------- 4. results on a survey with logic
create function lv.api_analytics_question(p_campaign uuid, p_question uuid, p_filter jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  q record;
  f record;
  v_gate jsonb;
  v_min int;
  v_text_min int;
  v_sensitive boolean;
  v_filter jsonb := nullif(p_filter, 'null'::jsonb);
  v_subs jsonb;
  v_all bigint;
  v_group bigint;
  v_seen bigint;
  v_answered bigint;
  v_seen_w boolean;
  v_ans_w boolean;
  v_cells jsonb;
  v_safe jsonb;
  v_out jsonb;
  v_qid text := p_question::text;
  v_fkind text;
begin
  if v_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;
  select * into c from lv.campaigns where id = p_campaign;
  if c.id is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, c.hub_id, 'analytics.read');
  -- The same gates as every results call (policy set, anonymous only after finishing, frozen population), logged.
  v_gate := lv.analytics_core(p_campaign, v_account, 'participant_count', null);
  if not coalesce((v_gate->>'ok')::boolean, false) then return v_gate; end if;

  select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
  if q.id is null then return lv.err('lv_invalid_input', 'Choose a question of this Campaign.'); end if;
  if v_filter is not null then
    if jsonb_typeof(v_filter) <> 'object' or jsonb_typeof(v_filter->'question_id') is distinct from 'string'
       or (v_filter->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_filter->'any_of') is distinct from 'array' or jsonb_array_length(v_filter->'any_of') not between 1 and 10 then
      return lv.err('lv_invalid_input', 'A filter needs a question and 1 to 10 answers.');
    end if;
    select * into f from lv.campaign_questions cq where cq.id = (v_filter->>'question_id')::uuid and cq.campaign_id = p_campaign;
    if f.id is null or lv.kind_options(f.kind, f.config) is null then
      return lv.err('lv_invalid_input', 'Filter by a choice or yes/no question of this Campaign.');
    end if;
    v_fkind := f.kind;
    v_filter := jsonb_build_object('question_id', f.id, 'any_of', v_filter->'any_of');
  end if;

  v_sensitive := c.anonymity = 'anonymous';
  v_text_min := coalesce((lv.policy_json('campaign.min_cohort'))::int, 5);
  v_min := case when v_sensitive then v_text_min else 1 end;

  -- One entry per response: its answers as {question_id: value}, whether it is in the filter group, and whether its
  -- path showed this question. Never leaves this function.
  select coalesce(jsonb_agg(jsonb_build_object('ans', x.ans, 'in', x.in_group,
                                               'saw', x.in_group and p_question = any(lv.logic_walk(p_campaign, x.ans)))), '[]'::jsonb)
    into v_subs
    from (select s.ans, v_filter is null or lv.answer_matches(v_fkind, s.ans -> (v_filter->>'question_id'), v_filter->'any_of') as in_group
            from (select coalesce((select jsonb_object_agg(a.question_id::text, a.value) from lv.answers a where a.submission_id = sb.id), '{}'::jsonb) as ans
                    from lv.submissions sb where sb.campaign_id = p_campaign) s) x;

  select count(*), count(*) filter (where (x->>'in')::boolean), count(*) filter (where (x->>'saw')::boolean),
         count(*) filter (where (x->>'in')::boolean and not lv.answer_empty(x->'ans'->v_qid))
    into v_all, v_group, v_seen, v_answered from jsonb_array_elements(v_subs) x;

  v_out := jsonb_build_object('ok', true, 'metric', 'question_logic', 'question_id', p_question, 'filter', v_filter);
  -- A filter group under the cohort, or one that leaves fewer than the cohort outside it, could single people out.
  if v_sensitive and v_filter is not null and (v_group < v_min or (v_all - v_group) between 1 and v_min - 1) then
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, v_account, 'question_logic', p_question, 'suppressed');
    return v_out || jsonb_build_object('filter_withheld', true, 'seen', null, 'answered', null, 'seen_withheld', true,
                                       'cells', '[]'::jsonb, 'withheld', true, 'reason', 'below_min_cohort');
  end if;
  -- Seen and answered counts follow the same rule: neither the group nor what is left of it may be under the cohort.
  v_seen_w := v_sensitive and (v_seen between 1 and v_min - 1 or (v_group - v_seen) between 1 and v_min - 1);
  v_ans_w := v_seen_w or (v_sensitive and (v_answered between 1 and v_min - 1 or (v_seen - v_answered) between 1 and v_min - 1));
  v_out := v_out || jsonb_build_object('filter_withheld', false,
    'seen', case when v_seen_w then null else v_seen end, 'answered', case when v_ans_w then null else v_answered end, 'seen_withheld', v_seen_w);

  if q.kind = 'text' then
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, v_account, 'question_logic', p_question, case when v_answered < v_text_min then 'suppressed' else 'published' end);
    if v_answered < v_text_min then return v_out || jsonb_build_object('cells', '[]'::jsonb, 'texts', null, 'texts_withheld', true); end if;
    return v_out || jsonb_build_object('cells', '[]'::jsonb, 'texts_withheld', false,
      'texts', (select coalesce(jsonb_agg(x->'ans'->>v_qid order by random()), '[]'::jsonb)
                  from jsonb_array_elements(v_subs) x where (x->>'in')::boolean and not lv.answer_empty(x->'ans'->v_qid)));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb) into v_cells
    from (select e.k, count(*) as cn from jsonb_array_elements(v_subs) x
            cross join lateral jsonb_array_elements_text(case when jsonb_typeof(x->'ans'->v_qid) = 'array' then x->'ans'->v_qid
                                                              else jsonb_build_array(x->'ans'->v_qid) end) e(k)
           where (x->>'in')::boolean and not lv.answer_empty(x->'ans'->v_qid) group by e.k) y;
  if v_sensitive then
    v_safe := lv.safe_cells(v_cells, v_min, v_answered);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, v_account, 'question_logic', p_question, case when (v_safe->>'withheld')::boolean then 'suppressed' else 'published' end);
    return v_out || jsonb_build_object('cells', v_safe->'cells', 'withheld', (v_safe->>'withheld')::boolean, 'reason', v_safe->'reason');
  end if;
  insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, v_account, 'question_logic', p_question, 'published');
  return v_out || jsonb_build_object('cells', lv.suppress_cells(v_cells, 1, false), 'withheld', false, 'reason', null);
end;
$$;

create function lv_api.lv_analytics_question(p_campaign uuid, p_question uuid, p_filter jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_analytics_question(p_campaign, p_question, p_filter); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------- grants: lv stays private; one new lv_api entry point
revoke all on function lv.quick_limit(uuid, text), lv.quick_question_limit(uuid), lv.capacity_check(uuid), lv.kind_options(text, jsonb), lv.kind_allows_jumps(text),
  lv.kind_is_scale(text), lv.scale_min(jsonb), lv.scale_max(jsonb), lv.answer_empty(jsonb), lv.answer_matches(text, jsonb, jsonb),
  lv.check_answer_value(text, jsonb, jsonb), lv.logic_config_problem(text, jsonb), lv.pipe_refs(text), lv.question_pipe_refs(text, jsonb),
  lv.logic_part(text, jsonb), lv.logic_write_guard(uuid, text, text, jsonb, text, jsonb), lv.logic_outline(uuid), lv.logic_rules_problem(uuid),
  lv.condition_met(text, jsonb, jsonb), lv.logic_walk(uuid, jsonb), lv.campaign_has_logic(uuid), lv.api_analytics_question(uuid, uuid, jsonb)
  from public;
revoke all on function lv_api.lv_analytics_question(uuid, uuid, jsonb), lv_api.lv_quick_survey_list() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv_api.lv_analytics_question(uuid, uuid, jsonb), lv_api.lv_quick_survey_list() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_analytics_question(uuid, uuid, jsonb), lv_api.lv_quick_survey_list() to authenticated';
  end if;
end $$;

commit;
