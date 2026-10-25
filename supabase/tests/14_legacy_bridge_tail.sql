grant all on script_out to public;

-- ---- 1. the standalone read-only script and the in-database inventory agree, and describe the fixture exactly
select t.check('script inventory equals the in-database inventory', (select inventory from script_out) = lv_private.legacy_inventory(t.org_a()));
select t.check('13 sessions: 2 mappable, 1 live, 1 menu, 9 need a decision', (select inventory->'sessions'->'by_status' from script_out)
  = '{"ambiguous": 9, "live_not_mapped": 1, "mappable": 2, "menu_session_not_mapped": 1}'::jsonb and (select (inventory->'sessions'->>'total')::int from script_out) = 13);
select t.check('every ambiguity is named, nothing is silently folded away', (select inventory->'sessions'->'ambiguous_by_reason' from script_out)
  = '{"bad_time_window": 1, "join_code_collision_within_legacy": 2, "no_questions": 1, "no_template": 2, "template_missing": 1, "question_scale_invalid": 1, "title_length": 1}'::jsonb);
select t.check('responses are counted per class (6 mappable, 1 live, 1 menu, 1 ambiguous = 9)', (select inventory->'responses' from script_out)
  @> '{"total": 9, "in_mappable_sessions": 6, "in_live_sessions": 1, "in_menu_sessions": 1, "in_ambiguous_sessions": 1}'::jsonb);
select t.check('one response is by a student with no profile in this organization; one has free text that is not copied', (select inventory->'responses' from script_out)
  @> '{"in_mappable_sessions_without_a_profile_in_this_org": 1, "with_free_text_not_copied": 1}'::jsonb);
select t.check('answers: unexpected value type and out-of-template question are flagged up front', (select inventory->'answers' from script_out)
  @> '{"in_mappable_sessions": 11, "with_unexpected_value_type": 2, "for_questions_outside_the_session_template": 1}'::jsonb);
select t.check('points awarded in mappable sessions = 300', (select (inventory->'points'->>'awarded_in_mappable_sessions')::int from script_out) = 300);
select t.check('the inventory function is read-only (declared STABLE) and wrote nothing', (select provolatile from pg_proc where proname = 'legacy_inventory') = 's'
  and t.q('select count(*) from lv_private.campaigns') = '0');

-- ---- 2. nothing runs before the Hub exists, and the Owner is an explicit input
select t.check('sync refuses to run before the organization is a Hub (no Owner has been supplied)', t.raises($$select lv_private.legacy_sync_org(t.org_a())$$));
select t.check('the backfill still demands an explicit Owner', t.raises($$select lv_private.backfill_org_hub(t.org_a(), null)$$));
select lv_private.backfill_org_hub(t.org_a(), t.u(2));   -- u2 is a SYNTHETIC Owner for the rehearsal only
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'starter', 'synthetic');
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"window_days": 3650}'::jsonb where key = 'gate.measurement';   -- a window long enough that the old receipts WOULD count if they were not excluded
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": 100}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';

-- ---- 3. sync: mapping preserves ids, relationships, answers, receipts; the rest is left alone and listed
create temp table pre_counts as select
  (select count(*) from lv_private.hub_memberships) as memberships, (select count(*) from lv_private.accounts) as accounts;
grant all on pre_counts to public;
select t.put('sync1', lv_private.legacy_sync_org(t.org_a())::text);
select t.check('sync finished with no errors', ((t.get('sync1')::jsonb)->>'errors')::int = 0);
select t.check('exactly the two historical sessions became Campaigns', t.q('select count(*) from lv_private.campaigns where legacy_historical') = '2');
select t.check('archived Campaigns keep the legacy session id, the join code (normalized) and the title', t.q($$select string_agg(legacy_session_id::text || ':' || join_code || ':' || title, ',' order by join_code) from lv_private.campaigns where legacy_historical$$)
  = t.L(101)::text || ':HIST1:Historical one,' || t.L(102)::text || ':HIST2:Historical two');
select t.check('they are closed history: not active, not draft, guest access off, identified (respondent ids were retained)', t.q($$select string_agg(distinct state || anonymous::text || guest_access, ',') from lv_private.campaigns where legacy_historical$$) = 'closedfalseoff');
select t.check('times are copied as they were, none invented', t.q($$select count(*) from lv_private.campaigns c join public.sessions s on s.id = c.legacy_session_id where c.opens_at is not distinct from s.opens_at and c.closes_at is not distinct from s.closes_at$$) = '2');
select t.check('the question set is copied as revision 1, in order, with types and options', t.q($$select string_agg(q.position || q.type, ',' order by c.join_code, q.position) from lv_private.campaign_questions q join lv_private.campaigns c on c.id = q.campaign_id where c.legacy_historical$$)
  = '1rating,2single_choice,3text,1rating,2single_choice,3text');
select t.check('legacy question ids map to new ones per Campaign (a shared template stays usable)', t.q('select count(*) from lv_private.legacy_question_map') = '6');
select t.check('receipts: five (the other-organization student is held back, not discarded)', t.q('select count(*) from lv_private.campaign_participation p join lv_private.campaigns c on c.id = p.campaign_id where c.legacy_historical') = '5'
  and t.q($$select count(*) from lv_private.legacy_bridge_issues where kind = 'response_student_other_org'$$) = '1');
select t.check('receipts keep the original time and the points exactly as awarded', t.q($$select count(*) from lv_private.campaign_participation p join lv_private.legacy_response_map m on m.participation_id = p.id join public.responses r on r.id = m.response_id
  where p.created_at = r.submitted_at and p.points = r.points_awarded and p.reward_state = 'recorded'$$) = '5');
select t.check('answers are copied verbatim (jsonb) incl. the odd one, which is flagged', t.q('select count(*) from lv_private.campaign_answer_values v join lv_private.legacy_response_map m on m.answer_response_id = v.response_id') = '9'
  and t.q($$select count(*) from lv_private.legacy_bridge_issues where kind = 'answer_value_unexpected'$$) = '1'
  and t.q($$select count(*) from lv_private.campaign_answer_values v where v.value = '"five"'::jsonb$$) = '1');
select t.check('the answer outside the template is held back and listed', t.q($$select count(*) from lv_private.legacy_bridge_issues where kind = 'answer_question_not_in_template'$$) = '1');
select t.check('every ambiguous session is listed and unmapped', t.q($$select count(*) from lv_private.legacy_bridge_issues where kind = 'ambiguous_session'$$) = '9'
  and t.q($$select count(*) from lv_private.legacy_session_map where status = 'ambiguous' and campaign_id is null$$) = '9');
select t.check('the live session and the menu session are recorded as left alone', t.q($$select status from lv_private.legacy_session_map where session_id = $$ || quote_literal(t.L(103))) = 'live_not_mapped'
  and t.q($$select status from lv_private.legacy_session_map where session_id = $$ || quote_literal(t.L(104))) = 'menu_session_not_mapped');
select t.check('LEGACY IS UNTOUCHED: every legacy table is byte-identical after the sync', t.legacy_fp2() = t.get('fp_before')::jsonb);
select t.check('the bridge created no account and no membership (it uses the ones the backfill made)', (select accounts from pre_counts) = t.q('select count(*) from lv_private.accounts')::int
  and (select memberships from pre_counts) = t.q('select count(*) from lv_private.hub_memberships')::int);

-- ---- 4. history is not the Winter Survey: no slot, no gate, no activation, no analytics, no new responses
select t.as_user(t.u(2));
select t.check('archived Campaigns consume no quota slot', public.lv_entitlements(t.org_a())->'data'->'limits'->'active_total'->>'used' = '0' and public.lv_entitlements(t.org_a())->'data'->'limits'->'active_survey'->>'used' = '0');
select t.as_pg();
select t.put('hist1c', t.q($$select id from lv_private.campaigns where join_code = 'HIST1'$$));
select t.as_user(t.u(2));
select t.check('activation of an archived Campaign: lv_lifecycle_invalid, reason legacy_historical', public.lv_campaign_activate(t.id('hist1c'), gen_random_uuid())->'error'->'details'->>'reason' = 'legacy_historical');
select t.check('the status endpoint says the same', public.lv_campaign_activation_status(t.id('hist1c'))->'data'->'blockers'->0->'details'->>'reason' = 'legacy_historical');
select t.check('they appear in the list as closed, flagged legacy_historical, carrying legacy_session_id', public.lv_campaign_list(t.org_a(), 'closed')->'data'->'campaigns' @> jsonb_build_array(jsonb_build_object('id', t.id('hist1c'), 'legacy_historical', true, 'state', 'closed', 'legacy_session_id', t.L(101))));
select t.as_pg();
update lv_private.policy set value = '3'::jsonb where key = 'analytics.min_cohort';
update lv_private.policy set value = '5'::jsonb where key = 'analytics.min_participants';
update lv_private.policy set value = '{"complementary_suppression": true}'::jsonb where key = 'analytics.disclosure_controls';
select t.as_user(t.u(2));
select t.check('analytics for legacy history is policy-pending even with every analytics value set', public.lv_analytics_query(t.id('hist1c'), 'participation')->'error'->'details'->>'reason' = 'legacy_record_policy_pending');
select t.as_user(t.u(2));
select t.check('no new v2 response can be added to history (not open)', public.lv_submit_response(t.id('hist1c'), '[]'::jsonb, gen_random_uuid())->'error'->'details'->>'reason' = 'not_active');
select t.as_pg();
select t.check('guest access cannot be used on archived Campaigns', (lv_private.submit_guest(gen_random_uuid(), '[]'::jsonb, gen_random_uuid()))->'error'->>'code' = 'lv_forbidden');
select t.check('legacy participation does not count toward the participation gate (5 receipts inside a 10-year window, numerator still 0)', (lv_private.gate_evaluate(t.org_a(), null)->>'numerator')::int = 0
  and t.q('select count(*) from lv_private.campaign_participation where created_at > now() - interval ''3650 days''')::int >= 5);

select t.as_user(t.u(3));
select t.check('a member sees their legacy receipts in lv_my_receipts, with the legacy points', jsonb_array_length(public.lv_my_receipts()->'data'->'receipts') = 2
  and (select bool_and(r->>'reward_state' = 'recorded' and (r->>'points')::int = 50) from jsonb_array_elements(public.lv_my_receipts()->'data'->'receipts') r));
select t.check('the legacy join code resolves to the archived Campaign (deep link preserved), closed', public.lv_campaign_resolve('hist1')->'data'->>'campaign_id' = t.id('hist1c')::text
  and public.lv_campaign_resolve('HIST1')->'data'->>'state' = 'closed');
select t.as_pg();

-- a native Winter-Survey-style Campaign still has every slot available
select t.put('native', t.pubcamp('NATIVE', t.org_a(), false)::text);
select t.check('a native Campaign activates normally alongside the archive (slots untouched)', t.q(format('select state from lv_private.campaigns where id = %L', t.id('native'))) = 'active');

-- ---- 5. the legacy app keeps working through the transition; new records are picked up by the next sync
select t.as_user(t.u(5));
select t.check('legacy join_session still works for the LIVE session', public.join_session('LIVE1')::text = t.L(103)::text);
select t.check('legacy submit_response still works and awards the legacy points', public.submit_response(t.L(103), '[]'::jsonb, null, null, jsonb_build_array(jsonb_build_object('question_id', t.L(11), 'value', 4))) = 25);
select t.as_pg();
select t.check('the live session is still not mapped after the legacy write (left to the legacy app)', t.q($$select count(*) from lv_private.campaigns where legacy_session_id = $$ || quote_literal(t.L(103))) = '0');
select t.check('reconciliation is clean after the first sync', (lv_private.legacy_reconcile(t.org_a())->>'ok')::boolean
  and lv_private.legacy_reconcile(t.org_a())->'responses'->>'not_yet_mapped_and_unexplained' = '0'
  and lv_private.legacy_reconcile(t.org_a())->'points'->>'difference' = '0'
  and lv_private.legacy_reconcile(t.org_a())->'answers'->>'unexplained_gap' = '0');
select t.check('reconciliation lists the 9 ambiguous sessions with reasons', jsonb_array_length(lv_private.legacy_reconcile(t.org_a())->'ambiguous') = 9);

-- a response accepted AFTER the initial sync lands on an already mapped session (for example a re-opened legacy session)
insert into public.responses (id, session_id, student_id, points_awarded, submitted_at, org_id) values (t.L(250), t.L(102), t.u(4), 50, now() - interval '1 minute', t.org_a());
insert into public.survey_answers (id, response_id, question_id, value, org_id) values (t.L(350), t.L(250), t.L(11), '3', t.org_a());
select t.check('reconciliation notices the late response (not ok, 1 unexplained)', not (lv_private.legacy_reconcile(t.org_a())->>'ok')::boolean and lv_private.legacy_reconcile(t.org_a())->'responses'->>'not_yet_mapped_and_unexplained' = '1');
select lv_private.legacy_sync_org(t.org_a());
select t.check('the next sync maps it exactly once; reconciliation is clean again', (lv_private.legacy_reconcile(t.org_a())->>'ok')::boolean
  and t.q($$select count(*) from lv_private.legacy_response_map where response_id = $$ || quote_literal(t.L(250))) = '1');
select lv_private.legacy_sync_org(t.org_a());
select lv_private.legacy_sync_org(t.org_a());
select t.check('re-running the sync changes nothing (idempotent)', t.q('select count(*) from lv_private.campaign_participation p join lv_private.campaigns c on c.id = p.campaign_id where c.legacy_historical') = '6'
  and t.q('select count(*) from lv_private.legacy_response_map') = '6');
update public.sessions set is_active = true, closes_at = null where id = t.L(101);   -- a legacy admin re-opens the session
select t.check('drift is reported: a mapped session that is live again in the legacy app', lv_private.legacy_reconcile(t.org_a())->'drift'->'mapped_sessions_active_again_in_legacy' = jsonb_build_array(t.L(101))
  and not (lv_private.legacy_reconcile(t.org_a())->>'ok')::boolean);
update public.sessions set is_active = false, closes_at = now() - interval '50 days' where id = t.L(101);

-- ---- 6. interruption safety: one session fails halfway; nothing partial remains; a re-run completes it
insert into public.sessions (id, title, join_code, points_reward, is_active, template_id, created_by, created_at, org_id) values (t.L(120), 'Interrupted session', 'int1', 50, false, t.L(1), t.u(2), now() - interval '9 days', t.org_a());
insert into public.responses (id, session_id, student_id, points_awarded, submitted_at, org_id) values
  (t.L(261), t.L(120), t.u(3), 50, now() - interval '8 days', t.org_a()), (t.L(262), t.L(120), t.u(4), 50, now() - interval '8 days', t.org_a()), (t.L(263), t.L(120), t.u(5), 50, now() - interval '8 days', t.org_a());
create function t.crash() returns trigger language plpgsql as $$ begin
  if (select count(*) from lv_private.campaign_participation where campaign_id = new.campaign_id) >= 1 then raise exception 'simulated crash mid-session'; end if; return new; end $$;
create trigger t_crash before insert on lv_private.campaign_participation for each row execute function t.crash();
create temp table pre_crash as select
  (select count(*) from lv_private.campaigns) as c, (select count(*) from lv_private.campaign_participation) as p, (select count(*) from lv_private.campaign_answers) as a, (select count(*) from lv_private.campaign_questions) as q;
grant all on pre_crash to public;
select t.put('sync_crash', lv_private.legacy_sync_org(t.org_a())::text);
select t.check('the failed session is reported as an error, the run itself completes', ((t.get('sync_crash')::jsonb)->>'errors')::int = 1
  and t.q($$select count(*) from lv_private.legacy_bridge_issues where kind = 'sync_error'$$) = '1');
select t.check('nothing partial remains: no Campaign, question, answer or receipt from the interrupted session', (select c from pre_crash) = t.q('select count(*) from lv_private.campaigns')::int
  and (select p from pre_crash) = t.q('select count(*) from lv_private.campaign_participation')::int and (select a from pre_crash) = t.q('select count(*) from lv_private.campaign_answers')::int
  and (select q from pre_crash) = t.q('select count(*) from lv_private.campaign_questions')::int);
drop trigger t_crash on lv_private.campaign_participation;
select t.check('after the fault is gone the re-run completes the session with all three responses', ((lv_private.legacy_sync_org(t.org_a()))->>'errors')::int = 0
  and t.q($$select count(*) from lv_private.legacy_response_map where response_id in ($$ || quote_literal(t.L(261)) || ',' || quote_literal(t.L(262)) || ',' || quote_literal(t.L(263)) || ')') = '3');

-- ---- 7. rollback of the bridge: derived data only; legacy and native v2 data survive; the sync is repeatable
select t.as_user(t.u(4));
select t.check('a native v2 response exists before the rollback', t.code(public.lv_submit_response(t.id('native'), jsonb_build_array(jsonb_build_object('question_id', t.get('NATIVE.q1'), 'value', 3), jsonb_build_object('question_id', t.get('NATIVE.q2'), 'value', 'A')), gen_random_uuid())) = 'ok');
select t.as_pg();
select t.put('fp_pre_unmap', t.legacy_fp2()::text);
select t.put('native_rows', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('native'))));
select t.put('arch_counts', t.q($$select (select count(*) from lv_private.campaigns where legacy_historical)::text || ',' || (select count(*) from lv_private.campaign_participation p join lv_private.campaigns c on c.id = p.campaign_id where c.legacy_historical)::text || ',' || (select count(*) from lv_private.campaign_answer_values v join lv_private.legacy_response_map m on m.answer_response_id = v.response_id)::text$$));
select t.check('rollback removes only the derived archive', (lv_private.legacy_unmap_org(t.org_a())->>'campaigns_removed')::int = 3
  and t.q('select count(*) from lv_private.campaigns where legacy_historical') = '0' and t.q('select count(*) from lv_private.legacy_response_map') = '0');
select t.check('...every legacy row, including the response accepted after the first sync, is exactly as the legacy app left it', t.legacy_fp2() = t.get('fp_pre_unmap')::jsonb
  and t.q($$select count(*) from public.responses where id = $$ || quote_literal(t.L(250))) = '1');
select t.check('...native v2 Campaigns, receipts and answers are untouched', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('native'))) = t.get('native_rows')
  and t.q(format('select state from lv_private.campaigns where id = %L', t.id('native'))) = 'active');
select t.check('...the archived Campaigns are gone from v2', t.q('select count(*) from lv_private.campaigns') = '1');
select lv_private.legacy_sync_org(t.org_a());
select t.check('re-applying the bridge rebuilds the identical archive (repeatable)', t.q($$select (select count(*) from lv_private.campaigns where legacy_historical)::text || ',' || (select count(*) from lv_private.campaign_participation p join lv_private.campaigns c on c.id = p.campaign_id where c.legacy_historical)::text || ',' || (select count(*) from lv_private.campaign_answer_values v join lv_private.legacy_response_map m on m.answer_response_id = v.response_id)::text$$) = t.get('arch_counts')
  and (lv_private.legacy_reconcile(t.org_a())->>'ok')::boolean);
select t.check('legacy is still byte-identical after the rebuild', t.legacy_fp2() = t.get('fp_pre_unmap')::jsonb);

-- ---- 8. the Hub is LionCafe: display name on test data only; the legacy organization name stays
select t.as_user(t.u(2));
select t.check('rehearsal: the Owner sets the Hub display name to LionCafe on this synthetic copy', public.lv_hub_settings_update(t.org_a(), 'LionCafe')->'data'->>'name' = 'LionCafe');
select t.as_anon();
select t.check('...the card shows LionCafe and the slug/id are the legacy ones', public.lv_hub_public('lioncafe')->'data'->>'name' = 'LionCafe' and (public.lv_hub_public('LionCafe')->'data'->>'hub_id')::uuid = t.org_a());
select t.as_pg();
select t.check('...while the legacy organization row is unchanged', (select name from public.orgs where id = t.org_a()) = 'Miami Job Corps Cafeteria');

-- ---- 9. boundaries
select t.as_user(t.u(2));
select t.check('the Owner cannot read the bridge tables', t.raises('select * from lv_private.legacy_session_map', '42501') and t.raises('select * from lv_private.legacy_bridge_issues', '42501')
  and t.raises('select * from lv_private.legacy_response_map', '42501') and t.raises('select * from lv_private.legacy_question_map', '42501'));
select t.check('the Owner cannot run the bridge', t.raises($$select lv_private.legacy_sync_org(t.org_a())$$, '42501') and t.raises($$select lv_private.legacy_unmap_org(t.org_a())$$, '42501')
  and t.raises($$select lv_private.legacy_inventory(t.org_a())$$, '42501'));
select t.as_pg();
select t.check('no public function references the bridge', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ilike '%legacy_session_map%'));

rollback;
