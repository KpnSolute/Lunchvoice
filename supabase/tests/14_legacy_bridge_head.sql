-- 14 (head): synthetic LionCafe legacy history for the bridge rehearsal. Everything is invented: no real student, session,
-- question or answer. The runner streams: this head, then supabase/bridge/legacy_inventory.sql (the standalone read-only script,
-- run against the synthetic legacy data BEFORE any bridge object is touched), then 14_legacy_bridge_tail.sql.
select set_config('t.file', '14_legacy_bridge', false);
begin;

create function t.L(p_n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8800-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- Templates: T1 = 3 valid questions; T2 = empty; T3 = one question whose scale is impossible.
insert into public.survey_templates (id, title, org_id) values (t.L(1), 'Template one', t.org_a()), (t.L(2), 'Empty template', t.org_a()), (t.L(3), 'Odd template', t.org_a());
insert into public.survey_questions (id, template_id, position, type, prompt, required, options, scale_min, scale_max, org_id) values
  (t.L(11), t.L(1), 1, 'rating', 'How was it?', true, '[]', 1, 5, t.org_a()),
  (t.L(12), t.L(1), 2, 'single_choice', 'Pick one', false, '["A","B","C"]', 1, 5, t.org_a()),
  (t.L(13), t.L(1), 3, 'text', 'Anything else?', false, '[]', 1, 5, t.org_a()),
  (t.L(31), t.L(3), 1, 'rating', 'Impossible scale', false, '[]', 5, 1, t.org_a());   -- the legacy CHECK forbids unknown types, so the bad record is a scale that cannot work

-- Sessions of LionCafe (S0 is the one created by legacy_seed.sql: active, no template).
insert into public.sessions (id, title, join_code, points_reward, is_active, opens_at, closes_at, template_id, menu_cycle_id, created_by, created_at, org_id) values
  (t.L(101), 'Historical one', 'hist1', 50, false, now() - interval '60 days', now() - interval '50 days', t.L(1), null, t.u(2), now() - interval '61 days', t.org_a()),
  (t.L(102), 'Historical two', 'HIST2', 50, false, now() - interval '40 days', now() - interval '30 days', t.L(1), null, t.u(2), now() - interval '41 days', t.org_a()),
  (t.L(103), 'Live now', 'LIVE1', 25, true, now() - interval '1 day', null, t.L(1), null, t.u(2), now() - interval '2 days', t.org_a()),
  (t.L(104), 'Menu rating day', 'menu1', 10, false, null, null, null, t.L(900), t.u(2), now() - interval '20 days', t.org_a()),
  (t.L(105), 'No template', 'nt1', 50, false, null, null, null, null, t.u(2), now() - interval '19 days', t.org_a()),
  (t.L(106), 'Dangling template', 'dt1', 50, false, null, null, t.L(999), null, t.u(2), now() - interval '18 days', t.org_a()),
  (t.L(107), 'Empty template session', 'et1', 50, false, null, null, t.L(2), null, t.u(2), now() - interval '17 days', t.org_a()),
  (t.L(108), 'Backwards window', 'bw1', 50, false, now() - interval '10 days', now() - interval '12 days', t.L(1), null, t.u(2), now() - interval '16 days', t.org_a()),
  (t.L(109), 'Duplicate code a', 'dup1', 50, false, null, null, t.L(1), null, t.u(2), now() - interval '15 days', t.org_a()),
  (t.L(110), 'Duplicate code b', 'DUP1 ', 50, false, null, null, t.L(1), null, t.u(2), now() - interval '14 days', t.org_a()),
  (t.L(111), 'Impossible scale session', 'oq1', 50, false, null, null, t.L(3), null, t.u(2), now() - interval '13 days', t.org_a()),
  (t.L(112), '   ', 'bt1', 50, false, null, null, t.L(1), null, t.u(2), now() - interval '12 days', t.org_a());

-- Responses. S1: four students. S2: u3, plus a student from ANOTHER organization (u11). S3 (live): u4. S4 (menu): u3.
insert into public.responses (id, session_id, student_id, points_awarded, submitted_at, feedback, org_id) values
  (t.L(201), t.L(101), t.u(3), 50, now() - interval '59 days', null, t.org_a()),
  (t.L(202), t.L(101), t.u(4), 50, now() - interval '58 days', 'free text that stays in the legacy table', t.org_a()),
  (t.L(203), t.L(101), t.u(5), 50, now() - interval '57 days', null, t.org_a()),
  (t.L(204), t.L(101), t.u(6), 50, now() - interval '56 days', null, t.org_a()),
  (t.L(205), t.L(102), t.u(3), 50, now() - interval '39 days', null, t.org_a()),
  (t.L(206), t.L(102), t.u(11), 50, now() - interval '38 days', null, t.org_a()),
  (t.L(207), t.L(103), t.u(4), 25, now() - interval '1 hour', null, t.org_a()),
  (t.L(208), t.L(104), t.u(3), 10, now() - interval '19 days', null, t.org_a());
insert into public.response_ratings (response_id, dish_name, rating, slot, org_id) values (t.L(208), 'Soup', 4, 'lunchEntree', t.org_a());

insert into public.survey_answers (id, response_id, question_id, value, org_id) values
  (t.L(301), t.L(201), t.L(11), '4', t.org_a()), (t.L(302), t.L(201), t.L(12), '"A"', t.org_a()), (t.L(303), t.L(201), t.L(13), '"fine"', t.org_a()),
  (t.L(304), t.L(202), t.L(11), '5', t.org_a()), (t.L(305), t.L(202), t.L(12), '"B"', t.org_a()),
  (t.L(306), t.L(203), t.L(11), '3', t.org_a()), (t.L(307), t.L(203), t.L(12), '"B"', t.org_a()),
  (t.L(308), t.L(204), t.L(11), '"five"', t.org_a()),                              -- unexpected value type: copied verbatim and flagged
  (t.L(309), t.L(205), t.L(11), '2', t.org_a()), (t.L(310), t.L(205), t.L(31), '"x"', t.org_a()),   -- second one: a question outside the template
  (t.L(311), t.L(206), t.L(11), '4', t.org_a()),
  (t.L(312), t.L(207), t.L(11), '5', t.org_a());

create function t.legacy_fp2() returns jsonb language sql stable security definer as $$
  select jsonb_build_object(
    'sessions', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.sessions x),
    'templates', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.survey_templates x),
    'questions', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.survey_questions x),
    'responses', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.responses x),
    'ratings', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.response_ratings x),
    'answers', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.survey_answers x),
    'members', (select md5(coalesce(string_agg(x::text, '|' order by x.session_id, x.student_id), '')) from public.session_members x),
    'orders', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.orders x),
    'profiles', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.profiles x),
    'orgs', (select md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.orgs x)) $$;
select t.put('fp_before', t.legacy_fp2()::text);

grant usage on schema public to public;
create temp table script_out as
