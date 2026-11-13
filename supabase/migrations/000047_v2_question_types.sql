-- 000047: the v2 question types (founder, "LunchVoice v2 - Survey Templates and Survey UI").
--
-- Free adds face_scale, dropdown, number, date. Plus (Starter Hub, Creator Plus) adds nps, agree_scale, ranking,
-- image_choice, slider, contact. Pro (Team Hub, Creator Pro) adds agree_grid, file_upload, consent, signature,
-- price_ladder, before_after, and quiz scoring on choice questions (config.quiz = {correct, points}).
-- Contact, file_upload, consent and signature collect who someone is, so they are refused on anonymous surveys.
--
-- Everything is additive and merge-safe: no lv_api wrapper is replaced. The hooks are the functions those wrappers
-- already call (lv.question_config_problem, lv.quick_question_guard), a before-insert trigger on lv.answers
-- (lv.check_answer_value, so every submit path, member or guest, is covered) and a trigger that refuses leaving
-- draft with an identity question on an anonymous survey. lv.question_cells now never turns a name, email,
-- signature or file into a chart bar. A private storage bucket `survey-uploads` holds uploads (signed-in people
-- only; managers of the survey read them).
-- Rollback: supabase/rollbacks/000047_v2_question_types.down.sql.
begin;

-- ---------------------------------------------------------------- 1. the kind list
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'lv.campaign_questions'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%single_choice%' loop
    execute format('alter table lv.campaign_questions drop constraint %I', r.conname);
  end loop;
end $$;
alter table lv.campaign_questions add constraint campaign_questions_kind_check check (kind in (
  'rating', 'single_choice', 'multi_choice', 'yes_no', 'text',
  'face_scale', 'dropdown', 'number', 'date',
  'nps', 'agree_scale', 'ranking', 'image_choice', 'slider', 'contact',
  'agree_grid', 'file_upload', 'consent', 'signature', 'price_ladder', 'before_after'));

-- ---------------------------------------------------------------- 2. plans
update lv.plan_limits set value = '["rating","single_choice","multi_choice","yes_no","text","face_scale","dropdown","number","date"]',
       note = 'Core question kinds plus face scale, dropdown, number and date (000047).' where key = 'quick.kinds';

insert into lv.plan_limits (family, key, value, note) values
  ('free', 'survey.kinds', '["rating","single_choice","multi_choice","yes_no","text","face_scale","dropdown","number","date"]', '000047: Free question types.'),
  ('starter', 'survey.kinds', '["nps","agree_scale","ranking","image_choice","slider","contact"]', '000047: Plus question types start at Starter Hub.'),
  ('creator_plus', 'survey.kinds', '["nps","agree_scale","ranking","image_choice","slider","contact"]', '000047: Plus question types start at Creator Plus.'),
  ('team', 'survey.kinds', '["nps","agree_scale","ranking","image_choice","slider","contact","agree_grid","file_upload","consent","signature","price_ladder","before_after"]', '000047: Pro question types start at Team Hub.'),
  ('creator_pro', 'survey.kinds', '["nps","agree_scale","ranking","image_choice","slider","contact","agree_grid","file_upload","consent","signature","price_ladder","before_after"]', '000047: Pro question types start at Creator Pro.'),
  ('team', 'survey.quiz', 'true', '000047: quiz scoring starts at Team Hub.'),
  ('creator_pro', 'survey.quiz', 'true', '000047: quiz scoring starts at Creator Pro.');

create function lv.kind_tier(p_kind text) returns text
language sql immutable set search_path = ''
as $$ select case
  when p_kind in ('rating','single_choice','multi_choice','yes_no','text','face_scale','dropdown','number','date') then 'free'
  when p_kind in ('nps','agree_scale','ranking','image_choice','slider','contact') then 'plus'
  else 'pro' end $$;

create function lv.kind_identified_only(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind in ('contact', 'file_upload', 'consent', 'signature') $$;

-- Every kind this Hub family or this person's Creator family may add (a union; Free is always included).
create function lv.kinds_allowed(p_hub uuid, p_account uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(lv.plan_limit('free', 'survey.kinds'), '[]'::jsonb)
      || coalesce(lv.plan_limit(lv.hub_family(p_hub), 'survey.kinds'), '[]'::jsonb)
      || coalesce(lv.plan_limit(lv.account_creator_family(p_account), 'survey.kinds'), '[]'::jsonb)
$$;

-- ---------------------------------------------------------------- 3. settings rules
create function lv.opts_problem(p_opts jsonb, p_min int, p_max int, p_len int, p_what text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_n int;
begin
  if p_opts is null or jsonb_typeof(p_opts) <> 'array' then return p_what || ' needs ' || p_min || ' to ' || p_max || ' entries.'; end if;
  v_n := jsonb_array_length(p_opts);
  if v_n < p_min or v_n > p_max then return p_what || ' needs ' || p_min || ' to ' || p_max || ' entries.'; end if;
  if exists (select 1 from jsonb_array_elements(p_opts) e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '') then
    return 'Every entry in ' || lower(p_what) || ' needs text.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_opts) e where length(e #>> '{}') > p_len) then
    return 'Keep each entry to ' || p_len || ' characters.';
  end if;
  if (select count(distinct lower(btrim(e #>> '{}'))) from jsonb_array_elements(p_opts) e) < v_n then
    return p_what || ' must all be different.';
  end if;
  return null;
end;
$$;

create function lv.j_num(p jsonb) returns boolean language sql immutable set search_path = '' as $$ select jsonb_typeof(p) = 'number' $$;
create function lv.j_int(p jsonb) returns boolean language sql immutable set search_path = ''
as $$ select jsonb_typeof(p) = 'number' and (p)::numeric = floor((p)::numeric) $$;
create function lv.j_date(p jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
begin
  if jsonb_typeof(p) <> 'string' or (p #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char((p #>> '{}')::date, 'YYYY-MM-DD') = (p #>> '{}');
exception when others then return false;
end;
$$;

create function lv.scale_problem(c jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  p int := case when c->'points' = '7'::jsonb then 7 else 5 end;
begin
  if c ? 'points' and c->'points' <> 'null'::jsonb and c->'points' not in ('5'::jsonb, '7'::jsonb) then return 'An agree scale has 5 or 7 points.'; end if;
  if c ? 'labels' and c->'labels' <> 'null'::jsonb then
    if jsonb_typeof(c->'labels') <> 'array' or jsonb_array_length(c->'labels') <> p
       or exists (select 1 from jsonb_array_elements(c->'labels') e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '' or length(e #>> '{}') > 40) then
      return 'Give all ' || p || ' labels, up to 40 characters each.';
    end if;
  end if;
  return null;
end;
$$;

create function lv.label_ok(p jsonb, p_max int) returns boolean language sql immutable set search_path = ''
as $$ select p is null or p = 'null'::jsonb or (jsonb_typeof(p) = 'string' and length(p #>> '{}') <= p_max) $$;

create function lv.kind_config_problem(p_kind text, c jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_bad text;
  v_min jsonb; v_max jsonb; v_step jsonb;
  k text;
  v_correct jsonb;
begin
  case p_kind
  when 'single_choice', 'multi_choice' then
    if c ? 'quiz' and c->'quiz' <> 'null'::jsonb then
      if jsonb_typeof(c->'quiz') <> 'object' then return 'Quiz settings must be an object.'; end if;
      v_correct := c->'quiz'->'correct';
      if v_correct is null or jsonb_typeof(v_correct) <> 'array' or jsonb_array_length(v_correct) < 1
         or exists (select 1 from jsonb_array_elements(v_correct) e where jsonb_typeof(e) <> 'string' or not (c->'options' @> jsonb_build_array(e))) then
        return 'Mark at least one correct answer from the options.';
      end if;
      if p_kind = 'single_choice' and jsonb_array_length(v_correct) <> 1 then return 'A single choice quiz question has one correct answer.'; end if;
      if c->'quiz' ? 'points' and (not lv.j_int(c->'quiz'->'points') or (c->'quiz'->>'points')::int < 1 or (c->'quiz'->>'points')::int > 100) then
        return 'Points are a whole number from 1 to 100.';
      end if;
    end if;
  when 'dropdown' then return lv.opts_problem(c->'options', 2, 50, 200, 'Options');
  when 'ranking' then return lv.opts_problem(c->'options', 2, 10, 200, 'Options');
  when 'image_choice' then
    v_bad := lv.opts_problem(c->'options', 2, 6, 80, 'Options');
    if v_bad is not null then return v_bad; end if;
    if c ? 'images' and c->'images' <> 'null'::jsonb and c->'images' <> '[]'::jsonb then
      if jsonb_typeof(c->'images') <> 'array' or jsonb_array_length(c->'images') <> jsonb_array_length(c->'options') then
        return 'Give one picture per option, or none.';
      end if;
      if exists (select 1 from jsonb_array_elements(c->'images') e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^https://[^\s"''<>]{4,490}$') then
        return 'Each picture needs an https:// address.';
      end if;
    end if;
  when 'number' then
    foreach k in array array['min', 'max'] loop
      if c ? k and c->k <> 'null'::jsonb and (not lv.j_num(c->k) or abs((c->>k)::numeric) > 1000000000) then return 'Minimum and maximum must be numbers.'; end if;
    end loop;
    if lv.j_num(c->'min') and lv.j_num(c->'max') and (c->>'min')::numeric > (c->>'max')::numeric then return 'The minimum must not be above the maximum.'; end if;
    if c ? 'integer' and jsonb_typeof(c->'integer') <> 'boolean' then return 'Whole numbers only is on or off.'; end if;
    if not lv.label_ok(c->'unit', 20) then return 'Keep the unit to 20 characters.'; end if;
  when 'date' then
    foreach k in array array['min', 'max'] loop
      if c ? k and c->k <> 'null'::jsonb and not lv.j_date(c->k) then return 'Dates are written YYYY-MM-DD.'; end if;
    end loop;
    if lv.j_date(c->'min') and lv.j_date(c->'max') and (c->>'min') > (c->>'max') then return 'The earliest date must not be after the latest.'; end if;
  when 'nps' then
    if not (lv.label_ok(c->'low_label', 60) and lv.label_ok(c->'high_label', 60)) then return 'Keep each end label to 60 characters.'; end if;
  when 'agree_scale' then return lv.scale_problem(c);
  when 'agree_grid' then
    v_bad := lv.opts_problem(c->'rows', 2, 10, 200, 'Statements');
    return coalesce(v_bad, lv.scale_problem(c));
  when 'before_after' then
    v_bad := lv.scale_problem(c);
    if v_bad is not null then return v_bad; end if;
    if not (lv.label_ok(c->'before_label', 40) and lv.label_ok(c->'after_label', 40)) then return 'Keep each label to 40 characters.'; end if;
  when 'slider' then
    v_min := coalesce(nullif(c->'min', 'null'::jsonb), '0'::jsonb);
    v_max := coalesce(nullif(c->'max', 'null'::jsonb), '10'::jsonb);
    v_step := coalesce(nullif(c->'step', 'null'::jsonb), '1'::jsonb);
    if not (lv.j_num(v_min) and lv.j_num(v_max) and lv.j_num(v_step)) or abs((v_min)::numeric) > 1000000000 or abs((v_max)::numeric) > 1000000000 then
      return 'A slider needs a number for its start, end and step.';
    end if;
    if (v_min)::numeric >= (v_max)::numeric then return 'The slider''s end must be above its start.'; end if;
    if (v_step)::numeric <= 0 or ((v_max)::numeric - (v_min)::numeric) / (v_step)::numeric > 1000
       or ((v_max)::numeric - (v_min)::numeric) / (v_step)::numeric <> round(((v_max)::numeric - (v_min)::numeric) / (v_step)::numeric) then
      return 'The step must fit the range evenly, with at most 1000 steps.';
    end if;
    if not (lv.label_ok(c->'min_label', 40) and lv.label_ok(c->'max_label', 40)) then return 'Keep each end label to 40 characters.'; end if;
  when 'contact' then
    if jsonb_typeof(c->'fields') is distinct from 'array' or jsonb_array_length(c->'fields') < 1
       or exists (select 1 from jsonb_array_elements(c->'fields') e where (e #>> '{}') is null or jsonb_typeof(e) <> 'string' or (e #>> '{}') not in ('name', 'email', 'phone'))
       or (select count(distinct e #>> '{}') from jsonb_array_elements(c->'fields') e) <> jsonb_array_length(c->'fields') then
      return 'Ask for at least one of name, email and phone.';
    end if;
  when 'file_upload' then
    if c ? 'max_mb' and (not lv.j_int(c->'max_mb') or (c->>'max_mb')::int < 1 or (c->>'max_mb')::int > 10) then return 'The size limit is 1 to 10 MB.'; end if;
    if c ? 'types' and (jsonb_typeof(c->'types') <> 'array' or jsonb_array_length(c->'types') < 1
       or exists (select 1 from jsonb_array_elements(c->'types') e where jsonb_typeof(e) <> 'string' or (e #>> '{}') not in ('image', 'pdf', 'doc'))
       or (select count(distinct e #>> '{}') from jsonb_array_elements(c->'types') e) <> jsonb_array_length(c->'types')) then
      return 'Allow at least one of images, PDF and documents.';
    end if;
  when 'consent' then
    if jsonb_typeof(c->'statement') is distinct from 'string' or btrim(c->>'statement') = '' or length(c->>'statement') > 1000 then
      return 'Write the statement people agree to (up to 1000 characters).';
    end if;
  when 'price_ladder' then
    if jsonb_typeof(c->'prices') is distinct from 'array' or jsonb_array_length(c->'prices') < 2 or jsonb_array_length(c->'prices') > 10
       or exists (select 1 from jsonb_array_elements(c->'prices') e where jsonb_typeof(e) <> 'number' or (e)::numeric < 0 or (e)::numeric > 1000000000) then
      return 'A price ladder needs 2 to 10 prices.';
    end if;
    if exists (select 1 from (select (e)::numeric as v, lag((e)::numeric) over (order by o) as prev from jsonb_array_elements(c->'prices') with ordinality t(e, o)) x
                where x.prev is not null and x.v <= x.prev) then
      return 'Prices must go up from lowest to highest.';
    end if;
    if c ? 'currency' and (jsonb_typeof(c->'currency') <> 'string' or (c->>'currency') !~ '^[A-Z]{3}$') then return 'The currency is a three-letter code such as USD.'; end if;
  else null;
  end case;
  return null;
end;
$$;

-- Same signature as 000018: keeps the choice rule and adds the v2 kinds.
create or replace function lv.question_config_problem(p_kind text, p_config jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_opts jsonb;
  v_n int;
  v_distinct int;
  v_max jsonb;
begin
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then return 'Question settings must be an object.'; end if;
  if p_kind is null then return null; end if;
  if p_kind in ('single_choice', 'multi_choice') then
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
  end if;
  return lv.kind_config_problem(p_kind, coalesce(p_config, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- 4. who may add which kind
-- Same signature as 000042. Adds the plan gate and the identity rule for every Hub; the Quick Survey limits are 000042's.
create or replace function lv.quick_question_guard(p_campaign uuid, p_kind text, p_adding boolean) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_anon text;
  v_account uuid := lv.current_account_id();
  v_limit int;
  v_used int;
  v_tier text;
begin
  select c.hub_id, c.anonymity into v_hub, v_anon from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return; end if;
  if p_kind is not null then
    if p_kind not in ('rating','single_choice','multi_choice','yes_no','text','face_scale','dropdown','number','date',
                      'nps','agree_scale','ranking','image_choice','slider','contact','agree_grid','file_upload','consent',
                      'signature','price_ladder','before_after') then
      perform lv.fail('lv_invalid_input', 'That question type does not exist.');
    end if;
    if not (lv.kinds_allowed(v_hub, v_account) ? p_kind) then
      v_tier := lv.kind_tier(p_kind);
      perform lv.fail('lv_entitlement_required',
                      case v_tier when 'plus' then 'This question type starts with Creator Plus or a Starter Hub.'
                                  else 'This question type starts with Creator Pro or a Team Hub.' end,
                      jsonb_build_object('product', case v_tier when 'plus' then 'creator_plus' else 'creator_pro' end,
                                         'feature', 'survey.kinds', 'kind', p_kind));
    end if;
    if lv.kind_identified_only(p_kind) and v_anon = 'anonymous' then
      perform lv.fail('lv_invalid_input', 'This question type collects who someone is, so it needs an identified survey.');
    end if;
  end if;
  if lv.hub_kind(v_hub) <> 'personal' then return; end if;
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

-- Quiz scoring is a Pro setting on a choice question.
create function lv.quiz_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_hub uuid;
begin
  if new.kind in ('single_choice', 'multi_choice') and new.config ? 'quiz' and new.config->'quiz' <> 'null'::jsonb
     and (tg_op = 'INSERT' or (old.config->'quiz') is distinct from (new.config->'quiz')) then
    select c.hub_id into v_hub from lv.campaigns c where c.id = new.campaign_id;
    if not lv.feature_allowed(v_hub, lv.current_account_id(), 'survey.quiz') then
      perform lv.fail('lv_entitlement_required', 'Quiz scoring starts with Creator Pro or a Team Hub.',
                      jsonb_build_object('product', 'creator_pro', 'feature', 'survey.quiz'));
    end if;
  end if;
  return new;
end;
$$;
create trigger campaign_questions_quiz_guard before insert or update of config on lv.campaign_questions
  for each row execute function lv.quiz_guard();

-- Leaving draft, or switching to anonymous, with an identity question is refused.
create function lv.identity_questions_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.anonymity = 'anonymous') and (old.anonymity is distinct from new.anonymity or (old.status = 'draft' and new.status <> 'draft'))
     and exists (select 1 from lv.campaign_questions q where q.campaign_id = new.id and lv.kind_identified_only(q.kind)) then
    raise exception 'lv_invalid_input: Contact, file, consent and signature questions need an identified survey. Remove them or make the survey identified.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger campaigns_identity_questions_check before update of status, anonymity on lv.campaigns
  for each row execute function lv.identity_questions_check();

-- The activation gate (000014/000042) checks a Quick Survey's kinds against the Quick Survey list only. Wrap it: the kinds the
-- caller's own plan allows (Creator Plus/Pro) count too. 000042's is kept as lv.capacity_check_limits.
alter function lv.capacity_check(uuid) rename to capacity_check_limits;
revoke all on function lv.capacity_check_limits(uuid) from public;
create function lv.capacity_check(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb := lv.capacity_check_limits(p_campaign);
  v_hub uuid;
  v_allowed jsonb;
begin
  if not (v->'reasons' ? 'kind_not_allowed') then return v; end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  v_allowed := lv.kinds_allowed(v_hub, lv.current_account_id());
  if not exists (select 1 from lv.campaign_questions q where q.campaign_id = p_campaign and not (v_allowed ? q.kind)) then
    v := jsonb_set(v, '{reasons}', coalesce((select jsonb_agg(r) from jsonb_array_elements(v->'reasons') r where r <> '"kind_not_allowed"'::jsonb), '[]'::jsonb));
  end if;
  return v;
end;
$$;
revoke all on function lv.capacity_check(uuid) from public;

-- ---------------------------------------------------------------- 5. answers
create function lv.check_answer_value_v2(p_kind text, p_config jsonb, p_value jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  c jsonb := coalesce(p_config, '{}'::jsonb);
  v_opts jsonb := coalesce(c->'options', '[]'::jsonb);
  v_pts int := case when c->'points' = '7'::jsonb then 7 else 5 end;
  v_min numeric; v_max numeric; v_step numeric; v_num numeric;
  f text; s text; r text;
  v_types text[];
begin
  if p_value is null or p_value = 'null'::jsonb then return 'empty answer'; end if;
  case p_kind
  when 'face_scale' then
    if not lv.j_int(p_value) or (p_value)::int not between 1 and 5 then return 'Pick a face.'; end if;
  when 'dropdown', 'image_choice' then
    if jsonb_typeof(p_value) <> 'string' or not (v_opts @> jsonb_build_array(p_value)) then return 'Pick one of the options.'; end if;
  when 'number' then
    if not lv.j_num(p_value) then return 'Type a number.'; end if;
    v_num := (p_value)::numeric;
    if c->'integer' = 'true'::jsonb and v_num <> floor(v_num) then return 'Type a whole number.'; end if;
    if lv.j_num(c->'min') and v_num < (c->>'min')::numeric then return 'The lowest is ' || (c->>'min') || '.'; end if;
    if lv.j_num(c->'max') and v_num > (c->>'max')::numeric then return 'The highest is ' || (c->>'max') || '.'; end if;
  when 'date' then
    if not lv.j_date(p_value) then return 'Pick a date.'; end if;
    if lv.j_date(c->'min') and (p_value #>> '{}') < (c->>'min') then return 'The earliest is ' || (c->>'min') || '.'; end if;
    if lv.j_date(c->'max') and (p_value #>> '{}') > (c->>'max') then return 'The latest is ' || (c->>'max') || '.'; end if;
  when 'nps' then
    if not lv.j_int(p_value) or (p_value)::int not between 0 and 10 then return 'Pick a number from 0 to 10.'; end if;
  when 'agree_scale' then
    if not lv.j_int(p_value) or (p_value)::int not between 1 and v_pts then return 'Pick a point on the scale.'; end if;
  when 'ranking' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) <> jsonb_array_length(v_opts)
       or (select count(distinct e) from jsonb_array_elements(p_value) e) <> jsonb_array_length(p_value)
       or exists (select 1 from jsonb_array_elements(p_value) e where not (v_opts @> jsonb_build_array(e))) then
      return 'Put every option in order.';
    end if;
  when 'slider' then
    v_min := coalesce((c->>'min')::numeric, 0); v_max := coalesce((c->>'max')::numeric, 10); v_step := coalesce((c->>'step')::numeric, 1);
    if not lv.j_num(p_value) or (p_value)::numeric < v_min or (p_value)::numeric > v_max
       or ((p_value)::numeric - v_min) / v_step <> round(((p_value)::numeric - v_min) / v_step) then
      return 'Move the slider.';
    end if;
  when 'contact' then
    if jsonb_typeof(p_value) <> 'object' then return 'Fill in your details.'; end if;
    if exists (select 1 from jsonb_object_keys(p_value) k where not (coalesce(c->'fields', '[]'::jsonb) @> jsonb_build_array(k))) then
      return 'Only the details asked for.';
    end if;
    for f in select jsonb_array_elements_text(coalesce(c->'fields', '[]'::jsonb)) loop
      if jsonb_typeof(p_value->f) <> 'string' or btrim(p_value->>f) = '' then return 'Add your ' || f || '.'; end if;
      s := p_value->>f;
      if f = 'name' and length(s) > 100 then return 'Keep the name to 100 characters.'; end if;
      if f = 'email' and (length(s) > 254 or s !~ '^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$') then return 'That email address does not look right.'; end if;
      if f = 'phone' and s !~ '^[0-9+()\-. ]{6,20}$' then return 'That phone number does not look right.'; end if;
    end loop;
  when 'agree_grid' then
    if jsonb_typeof(p_value) <> 'object' or (select count(*) from jsonb_object_keys(p_value)) <> jsonb_array_length(coalesce(c->'rows', '[]'::jsonb)) then return 'Answer every statement.'; end if;
    for r in select jsonb_array_elements_text(coalesce(c->'rows', '[]'::jsonb)) loop
      if not lv.j_int(p_value->r) or (p_value->>r)::int not between 1 and v_pts then return 'Answer every statement.'; end if;
    end loop;
  when 'before_after' then
    if jsonb_typeof(p_value) <> 'object' or (select count(*) from jsonb_object_keys(p_value)) <> 2
       or not (lv.j_int(p_value->'before') and lv.j_int(p_value->'after'))
       or (p_value->>'before')::int not between 1 and v_pts or (p_value->>'after')::int not between 1 and v_pts then
      return 'Answer both before and now.';
    end if;
  when 'file_upload' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value->'path') is distinct from 'string' or jsonb_typeof(p_value->'name') is distinct from 'string'
       or not lv.j_int(p_value->'size') or jsonb_typeof(p_value->'type') is distinct from 'string' then
      return 'Attach a file.';
    end if;
    if (p_value->>'size')::bigint < 1 or (p_value->>'size')::bigint > coalesce((c->>'max_mb')::int, 5) * 1048576 then
      return 'Files can be up to ' || coalesce((c->>'max_mb')::int, 5) || ' MB.';
    end if;
    select array_agg(m) into v_types from (
      select unnest(case t when 'image' then array['image/png','image/jpeg','image/webp','image/heic']
                           when 'pdf' then array['application/pdf']
                           when 'doc' then array['application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
                           else array[]::text[] end) as m
        from jsonb_array_elements_text(coalesce(c->'types', '["image","pdf"]'::jsonb)) t) x;
    if v_types is null or not ((p_value->>'type') = any (v_types)) then return 'That kind of file is not allowed here.'; end if;
    if length(p_value->>'name') > 200 or length(p_value->>'path') > 400 then return 'That file name is too long.'; end if;
  when 'consent' then
    if p_value <> 'true'::jsonb then return 'Tick the box to agree.'; end if;
  when 'signature' then
    if jsonb_typeof(p_value) <> 'string' or length(btrim(p_value #>> '{}')) < 2 or length(p_value #>> '{}') > 100 then return 'Type your full name to sign.'; end if;
  when 'price_ladder' then
    if not (p_value = '"none"'::jsonb or (lv.j_num(p_value) and coalesce(c->'prices', '[]'::jsonb) @> jsonb_build_array(p_value))) then
      return 'Pick a price, or None of these.';
    end if;
  else null;
  end case;
  return null;
end;
$$;

-- 000042's check, every existing branch verbatim, plus the v2 kinds.
create or replace function lv.check_answer_value(p_kind text, p_config jsonb, p_value jsonb) returns text
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
  else
    return lv.check_answer_value_v2(p_kind, p_config, p_value);
  end if;
  return null;
end;
$$;

-- Logic helpers (000042): dropdown and image choice are one-pick option lists, like single choice; ranking offers its
-- options; a face scale is a 1-5 scale. Existing kinds answer exactly as before.
create or replace function lv.kind_options(p_kind text, p_config jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when p_kind = 'yes_no' then '["true", "false"]'::jsonb
              when p_kind in ('single_choice', 'multi_choice', 'dropdown', 'image_choice') then coalesce(p_config->'options', '[]'::jsonb)
              else null end
$$;
create or replace function lv.kind_allows_jumps(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind in ('single_choice', 'yes_no', 'dropdown', 'image_choice') $$;
create or replace function lv.kind_is_scale(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind in ('rating', 'face_scale') $$;

create function lv.answers_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  v_campaign uuid;
  v_bad text;
begin
  select * into q from lv.campaign_questions x where x.id = new.question_id;
  if q.id is null or q.kind in ('rating', 'single_choice', 'multi_choice', 'yes_no', 'text') then return new; end if;
  v_bad := lv.check_answer_value(q.kind, q.config, new.value);
  if v_bad is not null then raise exception 'lv_invalid_input: %', v_bad using errcode = '22023'; end if;
  if q.kind = 'file_upload' then
    select s.campaign_id into v_campaign from lv.submissions s where s.id = new.submission_id;
    if (new.value->>'path') not like v_campaign::text || '/%' then
      raise exception 'lv_invalid_input: That file was not uploaded for this survey.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger answers_check_value before insert or update of value on lv.answers
  for each row execute function lv.answers_check();

-- ---------------------------------------------------------------- 6. results
-- The keys one answer adds to its question's distribution. Identity-bearing kinds add none.
create function lv.answer_keys(p_kind text, p_value jsonb) returns setof text
language plpgsql immutable set search_path = ''
as $$
begin
  if p_value is null or p_value = 'null'::jsonb then return; end if;
  if p_kind in ('contact', 'file_upload', 'signature') then return; end if;
  if p_kind = 'ranking' then
    if jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0 then return next p_value->>0; end if;
    return;
  end if;
  if p_kind = 'agree_grid' then
    return query select k || ': ' || (p_value->>k) from jsonb_object_keys(p_value) k;
    return;
  end if;
  if p_kind = 'before_after' then
    return next 'before: ' || (p_value->>'before'); return next 'after: ' || (p_value->>'after'); return;
  end if;
  if jsonb_typeof(p_value) = 'array' then return query select jsonb_array_elements_text(p_value);
  elsif jsonb_typeof(p_value) = 'object' then return;
  else return next p_value #>> '{}'; end if;
end;
$$;

create or replace function lv.question_cells(p_campaign uuid, p_question uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb)
    from (select e.k, count(*) as cn
            from lv.answers a
            join lv.submissions s on s.id = a.submission_id
            join lv.campaign_questions q on q.id = a.question_id
            cross join lateral lv.answer_keys(q.kind, a.value) as e(k)
           where s.campaign_id = p_campaign and a.question_id = p_question
           group by e.k) x
$$;

-- ---------------------------------------------------------------- 7. what may I use?
-- The tier a person can build with: for one survey (its Hub family or the person's Creator plan), or overall.
create function lv_api.lv_kind_tier(p_campaign uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_kinds jsonb;
  v_tier text := 'free';
  v_h record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  if p_campaign is not null then
    select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
    if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such survey.'); end if;
    v_kinds := lv.kinds_allowed(v_hub, v_account);
  else
    v_kinds := lv.kinds_allowed(null, v_account);
    for v_h in select m.hub_id from lv.hub_memberships m where m.account_id = v_account and m.status = 'accepted' loop
      v_kinds := v_kinds || lv.kinds_allowed(v_h.hub_id, v_account);
    end loop;
  end if;
  if v_kinds ? 'agree_grid' then v_tier := 'pro'; elsif v_kinds ? 'nps' then v_tier := 'plus'; end if;
  return jsonb_build_object('ok', true, 'tier', v_tier, 'kinds', (select jsonb_agg(distinct e) from jsonb_array_elements_text(v_kinds) e),
                            'quiz', v_tier = 'pro');
end;
$$;

-- ---------------------------------------------------------------- 8. uploads: a private bucket
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('survey-uploads', 'survey-uploads', false, 10485760)
    on conflict (id) do update set public = false, file_size_limit = 10485760;
  end if;
end $$;

create schema if not exists lv_storage;
revoke all on schema lv_storage from public;

-- Who may read an upload: a manager of the survey it belongs to. Path: <campaign id>/<account id>/<file>.
create function lv_storage.upload_readable(p_path text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_campaign uuid;
  v_hub uuid;
begin
  begin v_campaign := split_part(p_path, '/', 1)::uuid; exception when others then return false; end;
  select c.hub_id into v_hub from lv.campaigns c where c.id = v_campaign;
  if v_hub is null then return false; end if;
  return coalesce((lv_api.lv_campaign_get(v_campaign) ->> 'can_manage')::boolean, false);
end;
$$;

-- Who may add one: a signed-in person, into their own folder, for an open identified survey that asks for a file.
create function lv_storage.upload_writable(p_path text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  if lv.current_account_id() is null then return false; end if;
  begin v_campaign := split_part(p_path, '/', 1)::uuid; exception when others then return false; end;
  if split_part(p_path, '/', 2) <> lv.current_account_id()::text then return false; end if;
  return exists (select 1 from lv.campaigns c
                  where c.id = v_campaign and c.status = 'active' and c.anonymity = 'identified'
                    and exists (select 1 from lv.campaign_questions q where q.campaign_id = c.id and q.kind = 'file_upload'));
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists survey_uploads_insert on storage.objects';
    execute 'drop policy if exists survey_uploads_read on storage.objects';
    execute $p$create policy survey_uploads_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'survey-uploads' and lv_storage.upload_writable(name))$p$;
    execute $p$create policy survey_uploads_read on storage.objects for select to authenticated
      using (bucket_id = 'survey-uploads' and lv_storage.upload_readable(name))$p$;
  end if;
end $$;

-- /templates is a public platform page now (the template gallery): no Hub may claim the name.
insert into lv.reserved_slugs (slug, reason) values ('templates', 'platform route') on conflict do nothing;

-- ---------------------------------------------------------------- grants
revoke all on function lv.kind_tier(text), lv.kind_identified_only(text), lv.kinds_allowed(uuid, uuid), lv.opts_problem(jsonb, int, int, int, text),
  lv.j_num(jsonb), lv.j_int(jsonb), lv.j_date(jsonb), lv.scale_problem(jsonb), lv.label_ok(jsonb, int), lv.kind_config_problem(text, jsonb),
  lv.quiz_guard(), lv.identity_questions_check(), lv.check_answer_value_v2(text, jsonb, jsonb),
  lv.answers_check(), lv.answer_keys(text, jsonb) from public;
revoke all on function lv_api.lv_kind_tier(uuid), lv_storage.upload_readable(text), lv_storage.upload_writable(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv_api.lv_kind_tier(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_kind_tier(uuid) to authenticated';
    execute 'grant usage on schema lv_storage to authenticated';
    execute 'grant execute on function lv_storage.upload_readable(text), lv_storage.upload_writable(text) to authenticated';
  end if;
end $$;

commit;
