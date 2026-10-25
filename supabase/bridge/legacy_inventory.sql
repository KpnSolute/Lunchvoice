-- LunchVoice legacy bridge: READ-ONLY inventory of what would be mapped, left alone, or needs a human decision.
-- Touches only the legacy tables (orgs, sessions, survey_*, responses, profiles, orders, ...). Writes nothing. Needs no v2 objects,
-- so it can be run against the current production database through a read-only connection BEFORE any v2 migration exists.
-- The organization is LionCafe (resolved by slug). Copy the single result row (column "inventory") into the migration rehearsal notes.
-- Classes: mappable = historical survey session that can become an archived v2 record; live_not_mapped = still live in the
-- legacy app (left alone until a separately authorized cutover); menu_session_not_mapped = dish-rating session (stays legacy);
-- ambiguous = needs a human decision (reason given); nothing is ever discarded or reinterpreted.
-- Production inventory has NOT been run by the author of this file (no read-only production connection was available); the same
-- query is exercised against synthetic data by supabase/tests/14_legacy_bridge_*.sql.
with cls as (
with s as (select * from public.sessions where org_id = (select id from public.orgs where slug = 'LionCafe')),
q as (
  select qq.template_id, count(*) as n,
    bool_or(qq.type not in ('rating', 'text', 'single_choice', 'multi_choice', 'yes_no', 'flame', 'slider')) as bad_type,
    bool_or(jsonb_typeof(qq.options) is distinct from 'array') as bad_options,
    bool_or(qq.type in ('rating', 'slider', 'flame') and qq.scale_min >= qq.scale_max) as bad_scale,
    bool_or(length(btrim(qq.prompt)) not between 1 and 500) as bad_prompt
  from public.survey_questions qq group by qq.template_id),
codes as (select upper(btrim(s.join_code)) as code, count(*) as n from s group by 1)
select s.id as session_id, split_part(x.v, '|', 1) as status, split_part(x.v, '|', 2) as reason
from s
left join q on q.template_id = s.template_id
left join codes on codes.code = upper(btrim(s.join_code))
cross join lateral (select case
    when s.menu_cycle_id is not null then 'menu_session_not_mapped|menu_rating_session_stays_in_legacy_tables'
    when s.template_id is null then 'ambiguous|no_template'
    when not exists (select 1 from public.survey_templates t where t.id = s.template_id) then 'ambiguous|template_missing'
    when s.is_active and (s.closes_at is null or s.closes_at > now()) then 'live_not_mapped|session_is_still_live_in_the_legacy_app'
    when coalesce(q.n, 0) = 0 then 'ambiguous|no_questions'
    when q.bad_type then 'ambiguous|unknown_question_type'
    when q.bad_options then 'ambiguous|question_options_not_an_array'
    when q.bad_scale then 'ambiguous|question_scale_invalid'
    when q.bad_prompt then 'ambiguous|question_prompt_length'
    when length(btrim(s.title)) not between 1 and 120 then 'ambiguous|title_length'
    when s.opens_at is not null and s.closes_at is not null and s.closes_at <= s.opens_at then 'ambiguous|bad_time_window'
    when length(btrim(s.join_code)) = 0 then 'ambiguous|join_code_empty'
    when codes.n > 1 then 'ambiguous|join_code_collision_within_legacy'
    else 'mappable|'
  end as v) x
)
select jsonb_build_object(
  'org_id', (select id from public.orgs where slug = 'LionCafe'),
  'sessions', jsonb_build_object(
     'total', (select count(*) from cls),
     'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from cls group by 1) z), '{}'::jsonb),
     'ambiguous_by_reason', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) as n from cls where status = 'ambiguous' group by 1) z), '{}'::jsonb),
     'ambiguous', coalesce((select jsonb_agg(jsonb_build_object('session_id', session_id, 'reason', reason) order by session_id) from cls where status = 'ambiguous'), '[]'::jsonb)),
  'responses', jsonb_build_object(
     'total', (select count(*) from public.responses r join public.sessions s on s.id = r.session_id where s.org_id = (select id from public.orgs where slug = 'LionCafe')),
     'in_mappable_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable'),
     'in_live_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'live_not_mapped'),
     'in_menu_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'menu_session_not_mapped'),
     'in_ambiguous_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'ambiguous'),
     'in_mappable_sessions_without_a_profile_in_this_org', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         where not exists (select 1 from public.profiles p where p.id = r.student_id and p.org_id = (select id from public.orgs where slug = 'LionCafe'))),
     'with_free_text_not_copied', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable' where nullif(btrim(coalesce(r.feedback, '') || coalesce(r.idea, '')), '') is not null)),
  'answers', jsonb_build_object(
     'in_mappable_sessions', (select count(*) from public.survey_answers a join public.responses r on r.id = a.response_id join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         where a.value is not null and a.value <> 'null'::jsonb),
     'with_unexpected_value_type', (select count(*) from public.survey_answers a join public.responses r on r.id = a.response_id join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         join public.survey_questions qq on qq.id = a.question_id
         where a.value is not null and a.value <> 'null'::jsonb and not (
           (qq.type in ('rating', 'slider', 'flame') and jsonb_typeof(a.value) = 'number')
           or (qq.type = 'yes_no' and jsonb_typeof(a.value) = 'boolean')
           or (qq.type in ('single_choice', 'text') and jsonb_typeof(a.value) = 'string')
           or (qq.type = 'multi_choice' and jsonb_typeof(a.value) = 'array'))),
     'for_questions_outside_the_session_template', (select count(*) from public.survey_answers a join public.responses r on r.id = a.response_id join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         join public.sessions s on s.id = r.session_id
         where a.value is not null and not exists (select 1 from public.survey_questions qq where qq.id = a.question_id and qq.template_id = s.template_id))),
  'points', jsonb_build_object(
     'awarded_in_mappable_sessions', (select coalesce(sum(r.points_awarded), 0) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable'),
     'awarded_in_all_sessions', (select coalesce(sum(r.points_awarded), 0) from public.responses r join public.sessions s on s.id = r.session_id where s.org_id = (select id from public.orgs where slug = 'LionCafe')),
     'profile_balances_total', (select coalesce(sum(p.points), 0) from public.profiles p where p.org_id = (select id from public.orgs where slug = 'LionCafe'))),
  'untouched_by_the_bridge', jsonb_build_object(
     'profiles', (select count(*) from public.profiles p where p.org_id = (select id from public.orgs where slug = 'LionCafe')),
     'orders', (select count(*) from public.orders o where o.org_id = (select id from public.orgs where slug = 'LionCafe')),
     'session_members', (select count(*) from public.session_members m join public.sessions s on s.id = m.session_id where s.org_id = (select id from public.orgs where slug = 'LionCafe')),
     'dish_ratings', (select count(*) from public.dish_ratings d where d.org_id = (select id from public.orgs where slug = 'LionCafe')),
     'voice_notes', (select count(*) from public.voice_notes v where v.org_id = (select id from public.orgs where slug = 'LionCafe')))
) as inventory
;
