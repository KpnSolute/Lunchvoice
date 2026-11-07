-- 16: BILLING-READY, RESERVATIONS, STRICT ANONYMOUS ANALYTICS, EXPORT, DISCOVER, RETENTION (000016).
select set_config('t.file', '16_billing_analytics', false);
begin;

select t.trust_test_issuer();
create function t.ans1(p_campaign uuid, p_question uuid, p_value jsonb) returns jsonb language sql as $$
  select lv_api.lv_submit_response(p_campaign, jsonb_build_array(jsonb_build_object('question_id', p_question, 'value', p_value)))
$$;
grant execute on function t.ans1(uuid, uuid, jsonb) to public;
-- A campaign with one question, activated, answered by persons p_from..p_to with p_values[i], then closed.
create function t.run_campaign(p_hub uuid, p_anon text, p_kind text, p_values jsonb[], p_first int) returns uuid
language plpgsql as $$
declare
  v_c uuid;
  v_q uuid;
  i int;
begin
  perform t.as_kpn(1);
  v_c := (lv_api.lv_campaign_create(p_hub, 'Run ' || p_kind || ' ' || p_first, 'poll', p_anon) ->> 'campaign_id')::uuid;
  v_q := (lv_api.lv_campaign_question_add(v_c, 1, p_kind, 'Q') ->> 'question_id')::uuid;
  perform t.put('q_' || v_c::text, v_q::text);
  perform lv_api.lv_campaign_activate(v_c);
  for i in 1 .. coalesce(array_length(p_values, 1), 0) loop
    perform t.as_kpn(p_first + i - 1);
    perform t.ans1(v_c, v_q, p_values[i]);
  end loop;
  perform t.as_kpn(1);
  perform lv_api.lv_campaign_close(v_c);
  return v_c;
end $$;
grant execute on function t.run_campaign(uuid, text, text, jsonb[], int) to public;

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'));
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('results-hub', 'Results Hub') ->> 'hub_id'));
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(n) || lv_api.lv_my_context()::text || lv_api.lv_invite_redeem(t.get('code'))::text from generate_series(2, 13) n;
select t.as_kpn(1);
select t.check('setup: 13 accepted members, cohort 5', t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid and status = 'accepted'$q$, t.get('hub'))) = '13');
select t.as_pg();
select t.set_limit('campaigns.max_active', '50'::jsonb);

-- ===== (a) LC-01: 5 x "5" + 1 x "1" =======================================================================
select t.put('ca', t.run_campaign(t.id('hub'), 'anonymous', 'rating', array['5','5','5','5','5','1']::jsonb[], 2)::text);
select t.as_kpn(1);
select t.put('ov', lv_api.lv_analytics_overview(t.id('ca'))::text);
select t.check('LC-01: the participant count is published (6 >= 5)', (t.get('ov')::jsonb #>> '{participant_count,n}') = '6');
select t.check('LC-01: the question is withheld as a whole (no cells, no keys)',
  (t.get('ov')::jsonb #>> '{questions,0,result,withheld}') = 'true'
  and jsonb_array_length(t.get('ov')::jsonb #> '{questions,0,result,cells}') = 0);
select t.check('LC-01: the rating mean and n are withheld', (t.get('ov')::jsonb #>> '{questions,0,result,summary,mean}') is null
  and (t.get('ov')::jsonb #>> '{questions,0,result,summary,n}') is null);
select t.check('LC-01: no option value appears anywhere in the result',
  (t.get('ov')::jsonb #> '{questions,0,result}')::text !~ '"key": "[15]"');
select t.check('LC-01: lv_analytics_query answers the same as the overview',
  (lv_api.lv_analytics_query(t.id('ca'), 'answer_distribution', t.get('q_' || t.get('ca'))::uuid) ->> 'withheld') = 'true'
  and (lv_api.lv_analytics_query(t.id('ca'), 'rating_summary', t.get('q_' || t.get('ca'))::uuid) ->> 'mean') is null);

-- Engine unit cases
select t.as_pg();
select t.check('engine: 6 and 1 with cohort 5 withholds the question', (lv.safe_cells('[{"key":"5","n":6},{"key":"1","n":1}]', 5, 7) ->> 'withheld') = 'true');
select t.check('engine: one small cell grows into a bucket of at least the cohort, keyless',
  lv.safe_cells('[{"key":"a","n":9},{"key":"b","n":6},{"key":"c","n":2}]', 5, 17) -> 'cells'
  = '[{"n": 9, "key": "a", "reason": null, "suppressed": false}, {"n": null, "key": null, "reason": "withheld", "suppressed": true}]'::jsonb);
select t.check('engine: small cells that already reach the cohort together stay merged and keyless',
  lv.safe_cells('[{"key":"a","n":9},{"key":"b","n":3},{"key":"c","n":3}]', 5, 15) -> 'cells'
  = '[{"n": 9, "key": "a", "reason": null, "suppressed": false}, {"n": null, "key": null, "reason": "withheld", "suppressed": true}]'::jsonb);
select t.check('engine: all cells above the cohort are all published',
  jsonb_array_length(lv.safe_cells('[{"key":"a","n":5},{"key":"b","n":6}]', 5, 11) -> 'cells') = 2
  and (lv.safe_cells('[{"key":"a","n":5},{"key":"b","n":6}]', 5, 11) ->> 'any_withheld') = 'false');

-- ===== (b) LC-02: unanimous small and large cohorts ======================================================
select t.put('cus', t.run_campaign(t.id('hub'), 'anonymous', 'yes_no', array['"no"','"no"','"no"']::jsonb[], 2)::text);
select t.put('cul', t.run_campaign(t.id('hub'), 'anonymous', 'yes_no', array['"no"','"no"','"no"','"no"','"no"','"no"','"no"']::jsonb[], 2)::text);
select t.as_kpn(1);
select t.check('LC-02: a unanimous small cohort (3) is withheld',
  (lv_api.lv_analytics_query(t.id('cus'), 'answer_distribution', t.get('q_' || t.get('cus'))::uuid) ->> 'withheld') = 'true'
  and (lv_api.lv_analytics_query(t.id('cus'), 'participant_count') ->> 'n') is null);
select t.check('LC-02: a unanimous large cohort (7) is withheld by the dominance rule',
  (lv_api.lv_analytics_query(t.id('cul'), 'answer_distribution', t.get('q_' || t.get('cul'))::uuid) ->> 'reason') = 'dominance'
  and jsonb_array_length(lv_api.lv_analytics_query(t.id('cul'), 'answer_distribution', t.get('q_' || t.get('cul'))::uuid) -> 'cells') = 0);

-- ===== (c) LC-02: 100% and near-full turnout ==============================================================
select t.put('cft', t.run_campaign(t.id('hub'), 'anonymous', 'yes_no',
  array['"yes"','"yes"','"yes"','"yes"','"yes"','"yes"','"no"','"no"','"no"','"no"','"no"','"no"']::jsonb[], 2)::text);
select t.as_kpn(1);
select t.q(format($q$select lv_api.lv_submit_response(%L::uuid, '[]'::jsonb)::text$q$, t.get('cft')));
select t.check('LC-02: participation rate is withheld when eligible minus respondents is below the cohort (12 of 13)',
  (lv_api.lv_analytics_query(t.id('cft'), 'participation_rate') ->> 'rate') is null
  and (lv_api.lv_analytics_query(t.id('cft'), 'participation_rate') ->> 'reason') = 'near_full_turnout'
  and (lv_api.lv_analytics_query(t.id('cft'), 'participation_rate') ->> 'eligible_n') is null);
select t.as_pg();
-- Make it 100%: the 13th member (the owner) answers too, through a new campaign of the same shape.
select t.put('c100', t.run_campaign(t.id('hub'), 'anonymous', 'yes_no',
  array['"yes"','"yes"','"yes"','"yes"','"yes"','"yes"','"no"','"no"','"no"','"no"','"no"','"no"','"no"']::jsonb[], 1)::text);
select t.as_kpn(1);
select t.check('LC-02: participation rate is withheld at 100% turnout',
  (lv_api.lv_analytics_query(t.id('c100'), 'participation_rate') ->> 'suppressed') = 'true');
select t.check('LC-02: a balanced distribution at full turnout is still published (6 / 7, no dominance)',
  jsonb_array_length(lv_api.lv_analytics_query(t.id('c100'), 'answer_distribution', t.get('q_' || t.get('c100'))::uuid) -> 'cells') = 2);
select t.put('chalf', t.run_campaign(t.id('hub'), 'anonymous', 'yes_no', array['"yes"','"yes"','"yes"','"no"','"no"','"no"']::jsonb[], 2)::text);
select t.as_kpn(1);
select t.check('rate: 6 of 13 is published (7 non-respondents)', (lv_api.lv_analytics_query(t.id('chalf'), 'participation_rate') ->> 'rate') = '0.4615');

-- ===== (d) differencing: export vs query vs overview ======================================================
select t.as_kpn(1);
select t.put('ex', lv_api.lv_analytics_export(t.id('ca'))::text);
select t.check('export: the Owner exports released aggregates', t.code(t.get('ex')::jsonb) = 'ok');
select t.check('LC-01/export: the export of the 5+1 case holds no option key, no count and no mean for the question',
  not exists (select 1 from jsonb_array_elements(t.get('ex')::jsonb -> 'rows') r
               where r->>'question_position' = '1' and (r->>'n' is not null or r->>'key' in ('1', '5'))));
select t.check('export: the participant row matches the overview (no extra information)',
  (select r->>'n' from jsonb_array_elements(t.get('ex')::jsonb -> 'rows') r where r->>'key' = 'participants') = (t.get('ov')::jsonb #>> '{participant_count,n}'));
select t.check('export: differencing export against query and overview reveals nothing extra',
  (select count(*) from jsonb_array_elements(t.get('ex')::jsonb -> 'rows') r where r->>'n' is not null and r->>'question_position' is not null) = 0);
select t.put('exb', lv_api.lv_analytics_export(t.id('c100'))::text);
select t.check('export: a publishable question exports its cells', (select count(*) from jsonb_array_elements(t.get('exb')::jsonb -> 'rows') r
  where r->>'question_position' = '1' and r->>'n' in ('6', '7')) = 2);
select t.check('export: 3 and 3 with a cohort of 5 is withheld as a whole in the export too',
  (select count(*) from jsonb_array_elements(lv_api.lv_analytics_export(t.id('chalf')) -> 'rows') r
    where r->>'question_position' = '1' and r->>'n' is not null) = 0);
select t.as_kpn(2);
select t.check('export: a member without analytics.export is lv_forbidden', t.code(lv_api.lv_analytics_export(t.id('ca'))) = 'lv_forbidden');

-- ===== (e) free text ======================================================================================
select t.put('ct4', t.run_campaign(t.id('hub'), 'identified', 'text', array['"a"','"b"','"c"','"d"']::jsonb[], 2)::text);
select t.put('ct6', t.run_campaign(t.id('hub'), 'identified', 'text', array['"a"','"b"','"c"','"d"','"e"','"f"']::jsonb[], 2)::text);
select t.as_kpn(1);
select t.check('text: below 5 answers the list is withheld',
  (lv_api.lv_analytics_query(t.id('ct4'), 'text_responses', t.get('q_' || t.get('ct4'))::uuid) ->> 'suppressed') = 'true'
  and (lv_api.lv_analytics_query(t.id('ct4'), 'text_responses', t.get('q_' || t.get('ct4'))::uuid) -> 'responses') = 'null'::jsonb);
select t.check('text: at 5 or more the strings are listed, nothing else',
  (select bool_and(jsonb_typeof(e) = 'string') and count(*) = 6
     from jsonb_array_elements(lv_api.lv_analytics_query(t.id('ct6'), 'text_responses', t.get('q_' || t.get('ct6'))::uuid) -> 'responses') e));
select t.check('text: the order is random (no stable order across calls)',
  (select count(distinct (lv_api.lv_analytics_query(t.id('ct6'), 'text_responses', t.get('q_' || t.get('ct6'))::uuid) -> 'responses')::text)
     from generate_series(1, 25)) > 1);
select t.check('text: free text never appears in the aggregate rows of an export',
  (select count(*) from jsonb_array_elements(lv_api.lv_analytics_export(t.id('ct6')) -> 'rows') r where r->>'question_position' is not null) = 0);
select t.check('text: the export lists texts separately, and withholds them below the cohort',
  jsonb_array_length(lv_api.lv_analytics_export(t.id('ct6')) #> '{texts,0,texts}') = 6
  and (lv_api.lv_analytics_export(t.id('ct4')) #>> '{texts,0,texts_withheld}') = 'true');
select t.check('text: answer_distribution on text returns texts, never cells',
  jsonb_array_length(lv_api.lv_analytics_query(t.id('ct6'), 'answer_distribution', t.get('q_' || t.get('ct6'))::uuid) -> 'texts') = 6
  and (lv_api.lv_analytics_query(t.id('ct4'), 'answer_distribution', t.get('q_' || t.get('ct4'))::uuid) ->> 'texts_withheld') = 'true');
select t.check('text: the list carries no ids or timestamps',
  (lv_api.lv_analytics_query(t.id('ct6'), 'answer_distribution', t.get('q_' || t.get('ct6'))::uuid) -> 'texts')::text !~ '[0-9a-f]{8}-|T[0-9]{2}:');
select t.as_kpn(2);
select t.check('context: recent_participation lists my own answers, titles and dates only',
  jsonb_array_length(lv_api.lv_my_context() -> 'recent_participation') between 1 and 10
  and (lv_api.lv_my_context() #>> '{recent_participation,0,kind}') = 'hub'
  and (lv_api.lv_my_context() #>> '{recent_participation,0,hub_display_name}') = 'Results Hub'
  and (lv_api.lv_my_context() #>> '{recent_participation,0,answered_on}') = (now() at time zone 'UTC')::date::text
  and (lv_api.lv_my_context() -> 'recent_participation')::text not like '%value%');
select t.as_kpn(1);

-- ===== guests are labelled =================================================================================
select t.check('guests: the overview says whether guest responses are included',
  (lv_api.lv_analytics_overview(t.id('chalf')) ->> 'includes_guests') = 'false' and (lv_api.lv_analytics_overview(t.id('chalf')) ? 'guest_n'));

-- ===== export needs a paid family ========================================================================
select t.as_kpn(20, null, true, 'Free user'); select lv_api.lv_my_context();
select t.put('qs', (lv_api.lv_quick_survey_create('Mine', 'link') #>> '{campaign,campaign_id}'));
select t.check('export: a Quick Survey (free family) cannot be exported', t.code(lv_api.lv_analytics_export(t.id('qs'))) in ('lv_entitlement_required', 'lv_lifecycle_invalid'));
select t.put('personal', t.q($$select id::text from lv.hubs where kind = 'personal' limit 1$$));

-- ===== checkout (fail closed) =============================================================================
select t.as_anon();
select t.check('checkout: signed out cannot start a checkout', t.raises($$select lv_api.lv_checkout_start('starter_hub')$$, '42501'));
select t.as_kpn(1);
select t.check('checkout: fails closed with lv_billing_unavailable', t.code(lv_api.lv_checkout_start('starter_hub')) = 'lv_billing_unavailable');
select t.check('checkout: Campaign Plus is priced now, so it is lv_billing_unavailable, not lv_price_unset',
  t.code(lv_api.lv_checkout_start('campaign_plus', null, 4)) = 'lv_billing_unavailable');
select t.check('checkout: a free product cannot be bought', t.code(lv_api.lv_checkout_start('quick')) = 'lv_invalid_input');
select t.as_pg();
update lv.policy set value = 'true'::jsonb where key = 'billing.provider_ready';
select t.as_kpn(1);
select t.check('checkout: ready but without a payment link still fails closed', t.code(lv_api.lv_checkout_start('starter_hub')) = 'lv_billing_unavailable');
select t.as_pg();
update lv.policy set value = '{"starter_hub":"https://buy.stripe.test/sh","campaign_plus":"https://buy.stripe.test/cp","hub_reservation":"https://buy.stripe.test/hr"}'::jsonb
 where key = 'billing.payment_links';
select t.as_kpn(1);
select t.put('co', lv_api.lv_checkout_start('starter_hub')::text);
select t.check('checkout: with a link it returns the link carrying the intent id',
  (t.get('co')::jsonb ->> 'checkout_url') = 'https://buy.stripe.test/sh?client_reference_id=' || (t.get('co')::jsonb ->> 'intent_id')
  and (t.get('co')::jsonb ->> 'amount_cents') = '1300');
select t.check('checkout: Campaign Plus for 4 weeks is 3900 + 2 x 1900', (lv_api.lv_checkout_start('campaign_plus', t.id('hub'), 4) ->> 'amount_cents') = '7700');
select t.check('checkout: a Campaign plan needs at least 2 weeks', t.code(lv_api.lv_checkout_start('campaign_plus', null, 1)) = 'lv_invalid_input');
select t.check('checkout: a personal space is not a Hub (LC-06)', t.code(lv_api.lv_checkout_start('starter_hub', t.id('personal'))) = 'lv_not_found');
select t.check('checkout: a reservation of a taken slug is lv_conflict', t.code(lv_api.lv_checkout_start('hub_reservation', null, null, 'results-hub')) = 'lv_conflict');
select t.as_pg();
update lv.policy set value = 'false'::jsonb where key = 'billing.provider_ready';

-- ===== billing events: idempotent grants ==================================================================
select t.as_pg();
select t.as_kpn(30, null, true, 'Buyer'); select lv_api.lv_my_context();
select t.put('buyer', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.check('billing: the service role can execute the grant path',
  has_function_privilege('service_role', 'lv.billing_apply_event(text, text, text, jsonb)', 'execute')
  and has_schema_privilege('service_role', 'lv', 'usage'));
select t.check('billing: a Starter Hub purchase without a Hub grants a credit',
  (lv.billing_apply_event('stripe', 'evt_1', 'checkout.session.completed',
     t.paid(t.intent(t.id('buyer'), 'starter_hub'), jsonb_build_object('subscription', 'sub_1', 'mode', 'subscription',
                        'period_end', extract(epoch from now() + interval '30 days')::bigint))) ->> 'outcome') = 'applied'
  and t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid and product = 'starter_hub'$q$, t.get('buyer'))) = '1');
select t.check('billing: replaying the same event is a no-op',
  (lv.billing_apply_event('stripe', 'evt_1', 'checkout.session.completed',
     jsonb_build_object('product', 'starter_hub', 'account_id', t.get('buyer'), 'subscription', 'sub_1')) ->> 'duplicate') = 'true'
  and t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('buyer'))) = '1'
  and t.q($$select count(*)::text from lv.billing_events where event_id = 'evt_1'$$) = '1');
select t.check('billing: the event log never stores the payload', t.q($$select count(*)::text from information_schema.columns
  where table_schema = 'lv' and table_name = 'billing_events' and column_name in ('payload', 'raw')$$) = '0');
select t.as_kpn(30);
select t.put('bhub', (lv_api.lv_hub_create('bought-hub', 'Bought Hub') ->> 'hub_id'));
select t.check('billing: the bought credit creates a Starter Hub that ends with the paid period',
  (lv_api.lv_billing_summary(t.id('bhub')) #>> '{plan,family}') = 'starter'
  and (lv_api.lv_billing_summary(t.id('bhub')) #>> '{plan,ends_at}')::timestamptz > now() + interval '29 days');
select t.as_pg();
select lv.billing_apply_event('stripe', 'evt_2', 'invoice.paid',
  jsonb_build_object('subscription', 'sub_1', 'period_end', extract(epoch from now() + interval '60 days')::bigint));
select t.check('billing: invoice.paid extends the Hub plan',
  t.q(format($q$select (ends_at > now() + interval '59 days')::text from lv.entitlements where hub_id = %L::uuid$q$, t.get('bhub'))) = 'true');
select lv.billing_apply_event('stripe', 'evt_3', 'customer.subscription.deleted',
  jsonb_build_object('subscription', 'sub_1', 'period_end', extract(epoch from now() + interval '60 days')::bigint));
select t.check('billing: cancelling keeps access to the end of the paid period, deletes nothing',
  t.q(format($q$select (ends_at > now() + interval '59 days')::text from lv.entitlements where hub_id = %L::uuid$q$, t.get('bhub'))) = 'true'
  and t.q($$select count(*)::text from lv.hubs where slug = 'bought-hub'$$) = '1');
select t.check('billing: a Campaign Starter purchase for a Hub is a 3-week window',
  (lv.billing_apply_event('stripe', 'evt_4', 'checkout.session.completed',
     t.paid(t.intent(t.id('owner'), 'campaign_starter', t.id('hub'), null, 3), jsonb_build_object('payment_ref', 'pi_4'))) ->> 'outcome') = 'applied'
  and t.q($$select (ends_at - starts_at)::text from lv.entitlements where external_ref = 'pi_4'$$) = '21 days');
select lv.billing_apply_event('stripe', 'evt_5', 'charge.refunded', jsonb_build_object('payment_ref', 'pi_4', 'refunded', true));
select t.check('billing: a refund after the Campaign window started is recorded for support, not revoked (000017, F-08)',
  t.q($$select (ends_at > now())::text from lv.entitlements where external_ref = 'pi_4'$$) = 'true');
select t.check('billing: an unknown event type is recorded and ignored',
  (lv.billing_apply_event('stripe', 'evt_6', 'customer.created', '{}'::jsonb) ->> 'outcome') = 'ignored');
select t.check('billing: an unknown product is recorded and rejected, granting nothing',
  (lv.billing_apply_event('stripe', 'evt_7', 'checkout.session.completed', jsonb_build_object('product', 'gold', 'account_id', t.get('buyer'))) ->> 'outcome') = 'rejected');
select t.check('billing: a purchase for a personal space is rejected (LC-06)',
  (lv.billing_apply_event('stripe', 'evt_8', 'checkout.session.completed',
     t.paid(t.intent(t.id('buyer'), 'starter_hub', t.id('personal')))) ->> 'outcome') = 'rejected');
select t.check('billing: an intent overrides metadata',
  (lv.billing_apply_event('stripe', 'evt_9', 'checkout.session.completed',
     t.paid((t.get('co')::jsonb ->> 'intent_id')::uuid, jsonb_build_object('product', 'team_hub', 'account_id', t.get('buyer')))) ->> 'outcome') = 'applied'
  and t.q(format($q$select product || '|' || (account_id = %L::uuid)::text from lv.hub_credits where external_ref = 'evt_9'$q$, t.get('owner'))) = 'starter_hub|true');

-- ===== billing summary ====================================================================================
select t.as_kpn(1);
select t.check('summary: the Owner sees plan, limits and usage',
  (lv_api.lv_billing_summary(t.id('hub')) #>> '{limits,roles.max_custom}') = '3'
  and (lv_api.lv_billing_summary(t.id('hub')) #>> '{usage,custom_roles}') = '0'
  and (lv_api.lv_billing_summary(t.id('hub')) ->> 'billing_ready') = 'false');
select t.as_kpn(2);
select t.check('summary: a member without billing.view is lv_forbidden', t.code(lv_api.lv_billing_summary(t.id('hub'))) = 'lv_forbidden');
select t.as_kpn(20);
select t.check('summary: a personal space has no billing summary (LC-06)', t.code(lv_api.lv_billing_summary(t.id('personal'))) = 'lv_not_found');
select t.check('discover: a personal space cannot apply (LC-06)', t.code(lv_api.lv_discover_apply(t.id('personal'))) = 'lv_not_found');

-- ===== Hub Name Reservation ==============================================================================
select t.as_pg();
select t.check('reservation: buying a free slug creates an ACTIVE reservation',
  (lv.billing_apply_event('stripe', 'evt_r1', 'checkout.session.completed',
     t.paid(t.intent(t.id('buyer'), 'hub_reservation', null, 'held-name'), jsonb_build_object('payment_ref', 'pi_r1'))) ->> 'outcome') = 'applied');
select t.as_anon();
select t.check('reservation: others see ACTIVE without dates', (lv_api.lv_hub_reservation_status('held-name') ->> 'state') = 'active'
  and not (lv_api.lv_hub_reservation_status('held-name') ? 'expires_at') and (lv_api.lv_hub_reservation_status('held-name') ->> 'mine') = 'false');
select t.check('reservation: an unknown slug is available', (lv_api.lv_hub_reservation_status('nobody-has-this') ->> 'state') = 'available');
select t.check('reservation: an existing Hub slug is taken', (lv_api.lv_hub_reservation_status('results-hub') ->> 'state') = 'taken');
select t.check('reservation: a reserved word is taken', (lv_api.lv_hub_reservation_status('pricing') ->> 'state') = 'taken');
select t.as_kpn(30);
select t.check('reservation: the holder sees their dates', (lv_api.lv_hub_reservation_status('held-name') ->> 'mine') = 'true'
  and (lv_api.lv_hub_reservation_status('held-name') ? 'grace_ends_at'));
select t.as_pg();
select t.grant_credit(t.id('owner'));
select t.as_kpn(1);
select t.check('reservation: nobody else can claim an ACTIVE slug', t.code(lv_api.lv_hub_create('held-name', 'Steal')) = 'lv_conflict');
select t.as_pg();
update lv.hub_reservations set starts_at = now() - interval '380 days', expires_at = now() - interval '10 days' where slug = 'held-name';
select t.as_anon();
select t.check('reservation: 10 days after expiry it is in GRACE', (lv_api.lv_hub_reservation_status('held-name') ->> 'state') = 'grace');
select t.as_kpn(1);
select t.check('reservation: nobody else can claim a slug in GRACE', t.code(lv_api.lv_hub_create('held-name', 'Steal')) = 'lv_conflict');
select t.as_pg();
select t.check('reservation: renewing in GRACE extends from the old expiry',
  (lv.billing_apply_event('stripe', 'evt_r2', 'checkout.session.completed',
     t.paid(t.intent(t.id('buyer'), 'hub_reservation', null, 'held-name'))) #>> '{outcome}') = 'applied'
  and t.q($$select (expires_at between now() + interval '350 days' and now() + interval '360 days')::text from lv.hub_reservations where slug = 'held-name'$$) = 'true');
update lv.hub_reservations set starts_at = now() - interval '800 days', expires_at = now() - interval '26 days' where slug = 'held-name';
select t.as_anon();
select t.check('reservation: after the 25-day grace it is RELEASED', (lv_api.lv_hub_reservation_status('held-name') ->> 'state') = 'released');
select t.as_kpn(1);
select t.check('reservation: a RELEASED slug can be claimed, with a new Hub and no prior data',
  t.code(lv_api.lv_hub_create('held-name', 'Fresh')) = 'ok' and (lv_api.lv_hub_get('held-name') #>> '{hub,about}') is null);
select t.as_pg();
select t.check('reservation: buying a slug someone already holds is rejected',
  (lv.billing_apply_event('stripe', 'evt_r3', 'checkout.session.completed',
     t.paid(t.intent(t.id('buyer'), 'hub_reservation', null, 'held-name'))) ->> 'outcome') = 'rejected');
select t.check('reservation: a reservation grants no features', t.q(format($q$select count(*)::text from lv.entitlements where account_id = %L::uuid and product = 'hub_reservation'$q$, t.get('buyer'))) = '0');

-- ===== Discover ===========================================================================================
select t.as_kpn(1);
select t.put('disc', lv_api.lv_discover_apply(t.id('hub'))::text);
select t.check('discover: a Starter Hub is blocked with reasons',
  t.code(t.get('disc')::jsonb) = 'lv_gate_blocked' and (t.get('disc')::jsonb #> '{error,reasons}') ? 'team_required'
  and (t.get('disc')::jsonb #> '{error,reasons}') ? 'members_below_minimum' and (t.get('disc')::jsonb #>> '{error,min_members}') = '700');
select t.as_pg();
update lv.entitlements set family = 'team', product = 'team_hub' where hub_id = t.id('hub');
select t.set_limit('discover.min_members', '12'::jsonb);
select t.as_kpn(1);
select t.check('discover: genuine active members are counted (all 13 took part recently; guests never count)',
  t.q(format($q$select lv.genuine_active_members(%L::uuid)::text$q$, t.get('hub'))) = '13');
select t.check('discover: a Team Hub at the threshold applies', (lv_api.lv_discover_apply(t.id('hub')) ->> 'status') = 'submitted');
select t.check('discover: applying again is idempotent', (lv_api.lv_discover_apply(t.id('hub')) ->> 'already_applied') = 'true');

-- ===== retention sweep =====================================================================================
select t.as_pg();
insert into lv.audit_events (occurred_at, action) values (now() - interval '400 days', 'old.event');
insert into lv.guest_participation (campaign_id, hub_id, key_hash, campaign_revision, created_at)
values (t.id('ca'), t.id('hub'), 'old-guest-hash', 2, now() - interval '8 days');
select t.put('sweep', lv.retention_sweep()::text);
select t.check('retention: logs older than 12 months are deleted', (t.get('sweep')::jsonb ->> 'audit_deleted')::int >= 1
  and t.q($$select count(*)::text from lv.audit_events where action = 'old.event'$$) = '0');
select t.check('retention: guest hashes older than 7 days are unlinked, the row stays counted',
  t.q($$select count(*)::text from lv.guest_participation where key_hash = 'old-guest-hash'$$) = '0'
  and t.q($$select count(*)::text from lv.guest_participation where key_hash like 'expired:%'$$) = '1');
select t.check('retention: only the service role can run the sweep',
  has_function_privilege('service_role', 'lv.retention_sweep()', 'execute') and not has_function_privilege('authenticated', 'lv.retention_sweep()', 'execute'));

rollback;
