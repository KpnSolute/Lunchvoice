-- 000041: survey sections with "show only if" rules, and the Creator plans (founder decisions 2026-11-12/13).
--
-- 1. Creator Plus ($5/month) and Creator Pro ($15/month) are per-person plans: an ACCOUNT-scoped entitlement whose
--    perks go with the person into their personal space and every Hub they edit. New families 'creator_plus' and
--    'creator_pro' in plan_limits, products and entitlements. Not purchasable until their Stripe products exist.
--    Only the keys decided so far are set; the rest of the proposed perks wait for the founder.
-- 2. Feature keys: 'survey.branching' (sections and conditional sections) and 'survey.branding' start at Creator
--    Plus and Starter Hub (founder 2026-11-13), so starter, team, creator_plus and creator_pro all get them.
--    lv.feature_allowed(hub, account, key): the Hub's active family OR the person's active Creator family.
--    A lapsed plan never breaks a published survey: rules keep working for respondents; only new edits are gated.
-- 3. Sections live in question settings, so every reader (Studio, players, mock, export) already receives them:
--    config.section = {title, description?, show_if?} on the FIRST question of a section. Questions up to the next
--    section start belong to it. show_if = {question_id, any_of: [...]}: show the section only when that earlier
--    single choice, multiple choice or yes/no answer is one of any_of ("true"/"false" for yes/no).
-- 4. lv.validate_answers walks the sections: a hidden question must have no answer (refused), and a required question
--    is only required when its section is shown. Publishing (leaving draft) refuses a rule that points at a later,
--    missing or non-choice question, or at an option that does not exist.
-- 5. lv_campaign_get tells managers which survey features they may use here (features.branching/branding).
-- Rollback: supabase/rollbacks/000041_v2_sections_and_creator_plans.down.sql.
begin;

-- ---------------------------------------------------------------- 1. families
do $$
declare r record;
begin
  for r in select conrelid::regclass::text as tbl, conname from pg_constraint
            where contype = 'c' and conrelid in ('lv.plan_limits'::regclass, 'lv.products'::regclass, 'lv.entitlements'::regclass)
              and pg_get_constraintdef(oid) like '%family%' and pg_get_constraintdef(oid) like '%team%' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table lv.plan_limits add constraint plan_limits_family_check
  check (family in ('free', 'starter', 'team', 'creator_plus', 'creator_pro'));
alter table lv.products add constraint products_family_check
  check (family is null or family in ('free', 'starter', 'team', 'creator_plus', 'creator_pro'));
alter table lv.entitlements add constraint entitlements_family_check
  check (family in ('free', 'starter', 'team', 'creator_plus', 'creator_pro'));
-- A Creator plan belongs to a person, never to a Hub.
alter table lv.entitlements add constraint entitlements_creator_is_account
  check (family not in ('creator_plus', 'creator_pro') or scope = 'account');

insert into lv.products (product, family, price_cents, interval, purchasable, note) values
  ('creator_plus', 'creator_plus', 500, 'month', false, 'Creator Plus: $5/month, per person (founder 2026-11-12). Not on sale until its Stripe product exists.'),
  ('creator_pro', 'creator_pro', 1500, 'month', false, 'Creator Pro: $15/month, per person (founder 2026-11-12). Not on sale until its Stripe product exists.');

insert into lv.plan_limits (family, key, value, note) values
  ('starter', 'survey.branching', 'true', 'Founder 2026-11-13: sections and conditional sections start at Starter Hub.'),
  ('team', 'survey.branching', 'true', 'Founder 2026-11-13: included in every plan above Starter Hub.'),
  ('creator_plus', 'survey.branching', 'true', 'Founder 2026-11-13: sections and conditional sections start at Creator Plus.'),
  ('creator_pro', 'survey.branching', 'true', 'Founder 2026-11-13: included above Creator Plus.'),
  ('starter', 'survey.branding', 'true', 'Founder 2026-11-13: logo, cover, color and thank-you message start at Starter Hub.'),
  ('team', 'survey.branding', 'true', 'Founder 2026-11-13: included above Starter Hub.'),
  ('creator_plus', 'survey.branding', 'true', 'Founder 2026-11-13: branding starts at Creator Plus.'),
  ('creator_pro', 'survey.branding', 'true', 'Founder 2026-11-13: included above Creator Plus.');

-- The person's active Creator family, or NULL.
create function lv.account_creator_family(p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select e.family from lv.entitlements e
   where e.scope = 'account' and e.account_id = p_account and e.family in ('creator_plus', 'creator_pro')
     and e.starts_at <= now() and (lv.effective_end(e.product, e.ends_at) is null or lv.effective_end(e.product, e.ends_at) > now())
   order by case e.family when 'creator_pro' then 2 else 1 end desc
   limit 1
$$;

create function lv.feature_allowed(p_hub uuid, p_account uuid, p_key text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((lv.plan_limit(lv.hub_family(p_hub), p_key))::text = 'true', false)
      or coalesce((lv.plan_limit(lv.account_creator_family(p_account), p_key))::text = 'true', false)
$$;

-- ---------------------------------------------------------------- 3. section shape
create function lv.section_config_problem(p_config jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  s jsonb := p_config->'section';
  r jsonb;
begin
  if s is null or s = 'null'::jsonb then return null; end if;
  if jsonb_typeof(s) <> 'object' then return 'A section must be an object.'; end if;
  if jsonb_typeof(s->'title') is distinct from 'string' or btrim(s->>'title') = '' or length(s->>'title') > 120 then
    return 'A section needs a title of 1 to 120 characters.';
  end if;
  if s ? 'description' and s->'description' <> 'null'::jsonb
     and (jsonb_typeof(s->'description') <> 'string' or length(s->>'description') > 500) then
    return 'Keep a section description to 500 characters.';
  end if;
  r := s->'show_if';
  if r is null or r = 'null'::jsonb then return null; end if;
  if jsonb_typeof(r) <> 'object' or jsonb_typeof(r->'question_id') is distinct from 'string'
     or (r->>'question_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'A rule needs the question it depends on.';
  end if;
  if jsonb_typeof(r->'any_of') is distinct from 'array' or jsonb_array_length(r->'any_of') < 1 or jsonb_array_length(r->'any_of') > 10
     or exists (select 1 from jsonb_array_elements(r->'any_of') e where jsonb_typeof(e) <> 'string') then
    return 'A rule needs 1 to 10 answers to match.';
  end if;
  return null;
end;
$$;

-- Is a section rule met by these answers? NULL rule = always shown.
create function lv.rule_met(p_rule jsonb, p_answers jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_rule is null or p_rule = 'null'::jsonb then return true; end if;
  select e->'value' into v from jsonb_array_elements(p_answers) e where e->>'question_id' = p_rule->>'question_id' limit 1;
  if v is null or v = 'null'::jsonb then return false; end if;
  if jsonb_typeof(v) = 'array' then
    return exists (select 1 from jsonb_array_elements(v) a, jsonb_array_elements_text(p_rule->'any_of') m where a #>> '{}' = m);
  end if;
  return exists (select 1 from jsonb_array_elements_text(p_rule->'any_of') m where m = v #>> '{}');
end;
$$;

-- Rules must point backwards at a choice question and name options that exist. NULL = fine.
create function lv.section_rules_problem(p_campaign uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  t record;
  r jsonb;
  m text;
begin
  for q in select * from lv.campaign_questions where campaign_id = p_campaign and config->'section'->'show_if' is not null
                                                 and config->'section'->'show_if' <> 'null'::jsonb order by position loop
    r := q.config->'section'->'show_if';
    select * into t from lv.campaign_questions where campaign_id = p_campaign and id::text = r->>'question_id';
    if t.id is null then return format('Section "%s" depends on a question that no longer exists.', q.config->'section'->>'title'); end if;
    if t.position >= q.position then return format('Section "%s" depends on a later question. Rules can only look back.', q.config->'section'->>'title'); end if;
    if t.kind not in ('single_choice', 'multi_choice', 'yes_no') then
      return format('Section "%s" depends on a question people cannot pick an answer for.', q.config->'section'->>'title');
    end if;
    for m in select jsonb_array_elements_text(r->'any_of') loop
      if (t.kind = 'yes_no' and m not in ('true', 'false'))
         or (t.kind <> 'yes_no' and not exists (select 1 from jsonb_array_elements_text(t.config->'options') o where o = m)) then
        return format('Section "%s" matches an answer that is not an option any more.', q.config->'section'->>'title');
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

create function lv.campaign_rules_check() returns trigger
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
create trigger campaigns_rules_check before update of status on lv.campaigns
  for each row execute function lv.campaign_rules_check();

-- ---------------------------------------------------------------- 4. answers follow the sections
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

-- ---------------------------------------------------------------- gated writes
create function lv.section_write_guard(p_campaign uuid, p_old jsonb, p_new jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_bad text := lv.section_config_problem(p_new);
begin
  if v_bad is not null then return v_bad; end if;
  if p_new is null or not (p_new ? 'section') or p_new->'section' = 'null'::jsonb then return null; end if;
  if (p_old->'section') is not distinct from (p_new->'section') then return null; end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null then return null; end if;   -- the body answers lv_not_found
  if not lv.feature_allowed(v_hub, lv.current_account_id(), 'survey.branching') then
    return 'ENTITLEMENT';
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

-- ---------------------------------------------------------------- 5. what a manager may use here
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

revoke all on function lv.account_creator_family(uuid), lv.feature_allowed(uuid, uuid, text), lv.section_config_problem(jsonb),
  lv.rule_met(jsonb, jsonb), lv.section_rules_problem(uuid), lv.campaign_rules_check(), lv.section_write_guard(uuid, jsonb, jsonb)
  from public;

commit;
