-- Rollback for 000047_v2_question_types. Restores the 000042/000018/000016 function bodies and the original kind list.
-- Refuses (raises) while any question of a v2 kind exists: a rollback never deletes a customer's survey.
begin;
do $$ begin
  if exists (select 1 from lv.campaign_questions where kind not in ('rating','single_choice','multi_choice','yes_no','text')) then
    raise exception 'Questions of a v2 kind exist; remove them before rolling back 000047.';
  end if;
  if exists (select 1 from lv.campaign_questions where config ? 'quiz' and config->'quiz' <> 'null'::jsonb) then
    raise exception 'Quiz questions exist; remove their quiz settings before rolling back 000047.';
  end if;
end $$;

drop trigger if exists answers_check_value on lv.answers;
drop trigger if exists campaigns_identity_questions_check on lv.campaigns;
drop trigger if exists campaign_questions_quiz_guard on lv.campaign_questions;
do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists survey_uploads_insert on storage.objects;
    drop policy if exists survey_uploads_read on storage.objects;
  end if;
end $$;

drop function lv.capacity_check(uuid);
alter function lv.capacity_check_limits(uuid) rename to capacity_check;

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
  end if;
  return null;
end;
$$;

create or replace function lv.kind_options(p_kind text, p_config jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when p_kind = 'yes_no' then '["true", "false"]'::jsonb
              when p_kind in ('single_choice', 'multi_choice') then coalesce(p_config->'options', '[]'::jsonb)
              else null end
$$;

create or replace function lv.kind_allows_jumps(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind in ('single_choice', 'yes_no') $$;

create or replace function lv.kind_is_scale(p_kind text) returns boolean
language sql immutable set search_path = ''
as $$ select p_kind = 'rating' $$;

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
  if p_kind is null or p_kind not in ('single_choice', 'multi_choice') then return null; end if;
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
  return null;
end;
$$;

create or replace function lv.question_cells(p_campaign uuid, p_question uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb)
    from (select e.k, count(*) as cn
            from lv.answers a
            join lv.submissions s on s.id = a.submission_id
            cross join lateral jsonb_array_elements_text(
              case when jsonb_typeof(a.value) = 'array' then a.value else jsonb_build_array(a.value) end) as e(k)
           where s.campaign_id = p_campaign and a.question_id = p_question
           group by e.k) x
$$;


drop function lv_api.lv_kind_tier(uuid), lv_storage.upload_readable(text), lv_storage.upload_writable(text);
drop function lv.answers_check(), lv.identity_questions_check(), lv.quiz_guard(), lv.answer_keys(text, jsonb), lv.check_answer_value_v2(text, jsonb, jsonb),
  lv.kind_config_problem(text, jsonb), lv.label_ok(jsonb, int), lv.scale_problem(jsonb), lv.j_date(jsonb), lv.j_int(jsonb), lv.j_num(jsonb),
  lv.opts_problem(jsonb, int, int, int, text), lv.kinds_allowed(uuid, uuid), lv.kind_identified_only(text), lv.kind_tier(text);

delete from lv.reserved_slugs where slug = 'templates' and reason = 'platform route';
delete from lv.plan_limits where key in ('survey.kinds', 'survey.quiz');
update lv.plan_limits set value = '["rating","single_choice","multi_choice","yes_no","text"]', note = 'Core question kinds.' where key = 'quick.kinds';

alter table lv.campaign_questions drop constraint campaign_questions_kind_check;
alter table lv.campaign_questions add constraint campaign_questions_kind_check check (kind in ('rating', 'single_choice', 'multi_choice', 'yes_no', 'text'));
-- The private bucket survey-uploads is left in place: it may hold customers' files.
commit;
