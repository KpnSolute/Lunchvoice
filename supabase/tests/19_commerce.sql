-- 19: COMMERCE, TRANSACTIONAL EMAIL AND THE PLATFORM ADMIN CONSOLE (000019; build plan track B, B-01, B-02).
select set_config('t.file', '19_commerce', false);
begin;

-- The intent id inside a stored lv_checkout_start answer.
create function t.id_of_json(p_k text) returns uuid language sql stable
as $$ select (v::jsonb ->> 'intent_id')::uuid from t.vars where k = p_k $$;

select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Buyer'); select lv_api.lv_my_context();
select t.put('buyer', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Admin'); select lv_api.lv_my_context();
select t.put('admin', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Member'); select lv_api.lv_my_context();
select t.put('member', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(5, null, true, 'Stranger'); select lv_api.lv_my_context();
select t.put('stranger', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select lv.grant_platform_admin(t.id('admin'), null);
select t.grant_credit(t.id('owner'));
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('commerce-hub', 'Commerce Hub') ->> 'hub_id'));

-- ===== billing config and checkout intents (B-01) =========================================================
select t.as_anon();
select t.check('config: signed out cannot read the billing config (signed-in surface only)', t.raises('select lv_api.lv_billing_config()', '42501'));
select t.as_kpn(2);
select t.put('cfg0', lv_api.lv_billing_config()::text);
select t.check('config: by default nothing is on sale and no secret or price id is returned',
  (t.get('cfg0')::jsonb ->> 'provider_ready') = 'false' and (t.get('cfg0')::jsonb ->> 'checkout_available') = 'false'
  and (t.get('cfg0')::jsonb #>> '{products,starter_hub}') = 'false' and (t.get('cfg0')::jsonb #>> '{products,hub_reservation}') = 'false'
  and t.get('cfg0') not like '%price_%' and t.get('cfg0') not like '%sk_%');
select t.check('checkout: still fails closed by default', t.code(lv_api.lv_checkout_start('starter_hub')) = 'lv_billing_unavailable');

select t.as_pg();
update lv.policy set value = 'true'::jsonb where key = 'billing.provider_ready';
select t.as_kpn(2);
select t.check('config: provider ready without price ids still sells nothing',
  (lv_api.lv_billing_config() ->> 'checkout_available') = 'false' and t.code(lv_api.lv_checkout_start('team_hub')) = 'lv_billing_unavailable');
select t.as_pg();
update lv.policy set value = '{"starter_hub": "price_Starter1", "team_hub": {"price": "price_Team1"},
  "campaign_starter": {"first": "price_CsFirst", "extra_week": "price_CsWeek"}, "campaign_plus": {"first": "price_CpFirst"},
  "hub_reservation": {"price": "price_Res1"}}'::jsonb where key = 'billing.stripe_prices';
select t.as_kpn(2);
select t.put('cfg1', lv_api.lv_billing_config()::text);
select t.check('config: products with valid price ids are on sale',
  (t.get('cfg1')::jsonb #>> '{products,starter_hub}') = 'true' and (t.get('cfg1')::jsonb #>> '{products,team_hub}') = 'true'
  and (t.get('cfg1')::jsonb #>> '{products,campaign_starter}') = 'true' and (t.get('cfg1')::jsonb #>> '{products,hub_reservation}') = 'true'
  and (t.get('cfg1')::jsonb ->> 'checkout_available') = 'true');
select t.check('config: a Campaign plan without its extra-week price is not on sale',
  (t.get('cfg1')::jsonb #>> '{products,campaign_plus}') = 'false' and t.code(lv_api.lv_checkout_start('campaign_plus', null, 4)) = 'lv_billing_unavailable');
select t.check('config: the config never carries price ids', t.get('cfg1') not like '%price_%');
select t.put('co', lv_api.lv_checkout_start('starter_hub')::text);
select t.check('checkout: a Hub plan intent is a subscription Checkout Session, with no URL from the database',
  (t.get('co')::jsonb ->> 'checkout') = 'session' and (t.get('co')::jsonb ->> 'mode') = 'subscription'
  and (t.get('co')::jsonb ->> 'amount_cents') = '1300' and not (t.get('co')::jsonb ? 'checkout_url'));
select t.put('co_cs', lv_api.lv_checkout_start('campaign_starter', null, 5)::text);
select t.check('checkout: Campaign Starter for 5 weeks is a payment of 1900 + 3 x 1300',
  (t.get('co_cs')::jsonb ->> 'mode') = 'payment' and (t.get('co_cs')::jsonb ->> 'amount_cents') = '5800');

select t.as_pg();
select t.put('ctx', lv.checkout_session_context(t.id_of_json('co_cs'))::text);
select t.check('service: the session context comes from the intent (product, weeks, amount, prices)',
  (t.get('ctx')::jsonb ->> 'product') = 'campaign_starter' and (t.get('ctx')::jsonb ->> 'weeks') = '5'
  and (t.get('ctx')::jsonb ->> 'first_period_weeks') = '2' and (t.get('ctx')::jsonb ->> 'amount_cents') = '5800'
  and (t.get('ctx')::jsonb #>> '{prices,first}') = 'price_CsFirst' and (t.get('ctx')::jsonb #>> '{prices,extra_week}') = 'price_CsWeek'
  and (t.get('ctx')::jsonb ->> 'account_id') = t.get('buyer') and (t.get('ctx')::jsonb ->> 'customer_id') is null);
select t.check('service: an unknown intent has no context', t.code(lv.checkout_session_context(gen_random_uuid())) = 'lv_not_found');
select t.check('service: a Stripe customer is stored per account',
  t.code(lv.billing_customer_set(t.id('buyer'), 'cus_Buyer1')) = 'ok'
  and (lv.checkout_session_context(t.id_of_json('co_cs')) ->> 'customer_id') = 'cus_Buyer1');
select t.check('service: a second customer never replaces the first',
  (lv.billing_customer_set(t.id('buyer'), 'cus_Other') ->> 'customer_id') = 'cus_Buyer1');
select t.check('service: a malformed customer id is refused', t.code(lv.billing_customer_set(t.id('buyer'), 'acct_x')) = 'lv_invalid_input');
select t.check('service: the Checkout Session id is attached to its open intent',
  t.code(lv.checkout_intent_attach(t.id_of_json('co_cs'), 'cs_test_abc')) = 'ok'
  and (lv.checkout_session_context(t.id_of_json('co_cs')) ->> 'provider_session') = 'cs_test_abc'
  and t.code(lv.checkout_intent_attach(t.id_of_json('co_cs'), 'not-a-session')) = 'lv_invalid_input');

select t.as_kpn(2);
select t.check('service: authenticated callers cannot run the service-role checkout functions',
  t.raises(format('select lv.checkout_session_context(%L::uuid)', t.get('co_cs')::jsonb ->> 'intent_id'), '42501')
  and t.raises($$select lv.billing_customer_set(gen_random_uuid(), 'cus_x')$$, '42501')
  and t.raises($$select lv.billing_customer_of(gen_random_uuid())$$, '42501'));
select t.put('portal', lv_api.lv_billing_portal_check()::text);
select t.check('portal: the buyer has a customer to manage, and only their own account is named',
  t.code(t.get('portal')::jsonb) = 'ok' and (t.get('portal')::jsonb ->> 'account_id') = t.get('buyer')
  and (lv_api.lv_billing_config() ->> 'portal_available') = 'true');
select t.as_kpn(5);
select t.check('portal: an account without a customer has nothing to manage',
  t.code(lv_api.lv_billing_portal_check()) = 'lv_not_found' and (lv_api.lv_billing_config() ->> 'portal_available') = 'false');

select t.as_pg();
update lv.policy set value = '3'::jsonb where key = 'billing.intents_per_hour';
select t.as_kpn(5);
select lv_api.lv_checkout_start('starter_hub'); select lv_api.lv_checkout_start('starter_hub'); select lv_api.lv_checkout_start('starter_hub');
select t.check('checkout: intents are rate-limited per account', t.code(lv_api.lv_checkout_start('starter_hub')) = 'lv_rate_limited');
select t.as_pg();
update lv.policy set value = '20'::jsonb where key = 'billing.intents_per_hour';

-- ===== webhook: subscriptions, renewals and cancellation at period end ======================================
select t.as_kpn(1);
select t.put('co_sub', lv_api.lv_checkout_start('starter_hub', t.id('hub'))::text);
select t.as_pg();
select t.check('webhook: a paid subscription checkout is applied through the wrapper',
  (lv.billing_apply_event('stripe', 'w_sub', 'checkout.session.completed',
     t.paid(t.id_of_json('co_sub'), jsonb_build_object('subscription', 'sub_Hub1', 'customer', 'cus_Owner1', 'mode', 'subscription',
       'period_end', extract(epoch from now() + interval '30 days')::bigint))) ->> 'outcome') = 'applied');
select t.check('webhook: the subscription and the paying customer are remembered',
  t.q($$select account_id::text || '|' || product || '|' || status from lv.billing_subscriptions where subscription_id = 'sub_Hub1'$$)
    = t.get('owner') || '|starter_hub|active'
  and t.q(format($q$select customer_id from lv.billing_customers where account_id = %L::uuid$q$, t.get('owner'))) = 'cus_Owner1');
select t.as_kpn(1);
select t.put('sum1', lv_api.lv_billing_summary(t.id('hub'))::text);
select t.check('summary: the Owner sees the subscription and may manage it',
  (t.get('sum1')::jsonb #>> '{subscription,status}') = 'active' and (t.get('sum1')::jsonb #>> '{subscription,manageable}') = 'true'
  and (t.get('sum1')::jsonb #>> '{subscription,cancel_at_period_end}') = 'false'
  and (t.get('sum1')::jsonb #>> '{purchasable,team_hub}') = 'true');
select t.as_pg();
select t.check('webhook: invoice.paid (renewal) extends access to the new period end',
  (lv.billing_apply_event('stripe', 'w_inv', 'invoice.paid', jsonb_build_object('subscription', 'sub_Hub1', 'payment_ref', 'pi_ren',
     'period_end', extract(epoch from now() + interval '60 days')::bigint)) ->> 'outcome') = 'applied'
  and t.q($$select (ends_at > now() + interval '59 days')::text from lv.entitlements where external_ref = 'sub_Hub1'$$) = 'true'
  and t.q($$select (current_period_end > now() + interval '59 days')::text from lv.billing_subscriptions where subscription_id = 'sub_Hub1'$$) = 'true');
select t.check('webhook: a cancellation scheduled for the period end is recorded and keeps access',
  (lv.billing_apply_event('stripe', 'w_upd', 'customer.subscription.updated', jsonb_build_object('subscription', 'sub_Hub1',
     'status', 'active', 'cancel_at_period_end', true, 'period_end', extract(epoch from now() + interval '60 days')::bigint)) ->> 'outcome') = 'applied'
  and t.q($$select cancel_at_period_end::text from lv.billing_subscriptions where subscription_id = 'sub_Hub1'$$) = 'true'
  and t.q($$select (ends_at > now() + interval '59 days')::text from lv.entitlements where external_ref = 'sub_Hub1'$$) = 'true');
select t.check('webhook: subscription.updated is idempotent',
  (lv.billing_apply_event('stripe', 'w_upd', 'customer.subscription.updated', '{"subscription": "sub_Hub1"}'::jsonb) ->> 'duplicate') = 'true');
select t.check('webhook: subscription.updated for an unknown subscription is ignored',
  (lv.billing_apply_event('stripe', 'w_upd2', 'customer.subscription.updated', '{"subscription": "sub_Nope", "cancel_at_period_end": true}'::jsonb) ->> 'outcome') = 'ignored');
select t.as_kpn(1);
select t.check('summary: the scheduled cancellation is visible', (lv_api.lv_billing_summary(t.id('hub')) #>> '{subscription,cancel_at_period_end}') = 'true');
select t.as_pg();
select t.check('webhook: deleted at the period end keeps access exactly to that end',
  (lv.billing_apply_event('stripe', 'w_del', 'customer.subscription.deleted', jsonb_build_object('subscription', 'sub_Hub1',
     'ended_at', extract(epoch from now() + interval '60 days')::bigint, 'period_end', extract(epoch from now() + interval '60 days')::bigint)) ->> 'outcome') = 'applied'
  and t.q($$select (ends_at > now() + interval '59 days')::text from lv.entitlements where external_ref = 'sub_Hub1'$$) = 'true'
  and t.q($$select status from lv.billing_subscriptions where subscription_id = 'sub_Hub1'$$) = 'canceled');
select t.check('webhook: NEW-01 still binds grants to the confirmed amount through the wrapper',
  (lv.billing_apply_event('stripe', 'w_mis', 'checkout.session.completed', t.paid(t.id_of_json('co_cs'), '{"amount_subtotal": 1900}'::jsonb)) ->> 'outcome') = 'rejected'
  and t.q($$select detail->>'reason' from lv.billing_events where event_id = 'w_mis'$$) = 'amount_mismatch');
select t.check('webhook: the grant path is reachable by the service role only through the wrapper',
  has_function_privilege('service_role', 'lv.billing_apply_event(text, text, text, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'lv.billing_apply_event_core(text, text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'lv.billing_apply_event(text, text, text, jsonb)', 'execute'));

-- ===== Hub Name Reservation purchase and renewal ===========================================================
select t.as_kpn(2);
select t.put('co_res', lv_api.lv_checkout_start('hub_reservation', null, null, 'future-name')::text);
select t.check('reservation: an available name can be bought (one-time payment)',
  (t.get('co_res')::jsonb ->> 'mode') = 'payment' and (t.get('co_res')::jsonb ->> 'amount_cents') = '2500');
select t.as_pg();
select lv.billing_apply_event('stripe', 'w_res', 'checkout.session.completed', t.paid(t.id_of_json('co_res'), '{"payment_ref": "pi_res1"}'::jsonb));
select t.check('reservation: the paid reservation is ACTIVE for 12 months',
  t.q($$select lv.reservation_state(expires_at, released_at) || '|' || (expires_at > now() + interval '11 months')::text from lv.hub_reservations where slug = 'future-name'$$) = 'active|true');
select t.check('email: a reservation confirmation is queued for the holder (E05)',
  t.q(format($q$select count(*)::text from lv.email_outbox where template = 'reservation_confirmed' and account_id = %L::uuid and to_address = 'person2@example.invalid'$q$, t.get('buyer'))) = '1');
select t.as_kpn(5);
select t.check('reservation: someone else cannot buy a reserved name', t.code(lv_api.lv_checkout_start('hub_reservation', null, null, 'future-name')) = 'lv_conflict');
select t.as_kpn(2);
select t.put('co_ren', lv_api.lv_checkout_start('hub_reservation', null, null, 'future-name')::text);
select t.check('reservation: the holder can renew during ACTIVE', t.code(t.get('co_ren')::jsonb) = 'ok');
select t.as_pg();
select lv.billing_apply_event('stripe', 'w_ren', 'checkout.session.completed', t.paid(t.id_of_json('co_ren'), '{"payment_ref": "pi_res2"}'::jsonb));
select t.check('reservation: a renewal adds 12 months and queues a second confirmation',
  t.q($$select (expires_at > now() + interval '23 months')::text from lv.hub_reservations where slug = 'future-name'$$) = 'true'
  and t.q($$select count(*)::text from lv.email_outbox where template = 'reservation_confirmed' and payload->>'slug' = 'future-name'$$) = '2');
-- A reservation in GRACE can still be renewed by its holder.
update lv.hub_reservations set starts_at = now() - interval '13 months', expires_at = now() - interval '3 days' where slug = 'future-name';
select t.as_kpn(2);
select t.check('reservation: the holder can renew during GRACE', t.code(lv_api.lv_checkout_start('hub_reservation', null, null, 'future-name')) = 'ok');
select t.as_kpn(5);
select t.check('reservation: nobody else can buy it during GRACE', t.code(lv_api.lv_checkout_start('hub_reservation', null, null, 'future-name')) = 'lv_conflict');

-- ===== transactional email: enqueue points (B-02) =========================================================
select t.as_pg();
select t.check('email: Hub created queues E03 to the Owner''s verified email',
  t.q(format($q$select to_address || '|' || (payload->>'slug') from lv.email_outbox where template = 'hub_created' and account_id = %L::uuid$q$, t.get('owner')))
    = 'person1@example.invalid|commerce-hub');
select t.as_kpn(6, 'Joiner@Example.invalid', true, 'Joiner'); select lv_api.lv_my_context();
select t.put('joiner', t.q($$select lv.current_account_id()::text$$));
select lv_api.lv_waitlist_join('Joiner@Example.invalid', 'Their Hub', '2026-11-07');
select t.as_kpn(7); select lv_api.lv_waitlist_join();
select t.as_pg();
select t.check('email: a waitlist join with a consented contact email queues E01 to that address',
  t.q(format($q$select to_address || '|' || (payload->>'status') from lv.email_outbox where template = 'waitlist_joined' and account_id = %L::uuid$q$, t.get('joiner')))
    = 'joiner@example.invalid|admitted');
select t.check('email: a waitlist join without a contact email sends nothing',
  t.q($$select count(*)::text from lv.email_outbox where template = 'waitlist_joined'$$) = '1');

-- Participation receipts: identified Campaigns only.
select t.as_kpn(1);
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(4); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(1);
select t.put('cid', (lv_api.lv_campaign_create(t.id('hub'), 'Identified poll', 'poll', 'identified') ->> 'campaign_id'));
select t.put('qid', (lv_api.lv_campaign_question_add(t.id('cid'), 1, 'rating', 'How was it?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('cid'));
select t.put('can', (lv_api.lv_campaign_create(t.id('hub'), 'Anonymous poll', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('qan', (lv_api.lv_campaign_question_add(t.id('can'), 1, 'rating', 'How was it?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('can'));
select t.as_kpn(4);
select t.check('participation: the member answers both Campaigns',
  t.code(lv_api.lv_submit_response(t.id('cid'), format('[{"question_id":"%s","value":4}]', t.get('qid'))::jsonb)) = 'ok'
  and t.code(lv_api.lv_submit_response(t.id('can'), format('[{"question_id":"%s","value":2}]', t.get('qan'))::jsonb)) = 'ok');
select t.as_pg();
select t.check('email: an identified Campaign queues one receipt (E07) to the respondent',
  t.q(format($q$select count(*)::text from lv.email_outbox where template = 'participation_receipt' and account_id = %L::uuid and to_address = 'person4@example.invalid'$q$, t.get('member'))) = '1'
  and t.q($$select payload->>'campaign_title' from lv.email_outbox where template = 'participation_receipt'$$) = 'Identified poll');
select t.check('email: an anonymous Campaign never sends a receipt',
  t.q($$select count(*)::text from lv.email_outbox where template = 'participation_receipt' and payload->>'campaign_title' = 'Anonymous poll'$$) = '0');
select t.check('email: a receipt carries no answer (only title, Hub name and receipt id)',
  t.q($$select string_agg(k, ',' order by k) from lv.email_outbox o, jsonb_object_keys(o.payload) k where o.template = 'participation_receipt'$$)
    = 'campaign_title,hub_name,receipt_id');
select t.check('email: no outbox payload ever contains an answer value or a question id',
  t.q(format($q$select count(*)::text from lv.email_outbox where payload::text like '%%%s%%' or payload ? 'answers' or payload ? 'value'$q$, t.get('qid'))) = '0');

-- E04: email a Hub invite.
select t.as_kpn(1);
select t.put('code2', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.check('invite email: a live code of this Hub is queued to the address',
  (lv_api.lv_invite_email_send(t.id('hub'), t.get('code2'), 'Friend@Example.invalid') ->> 'queued') = 'true');
select t.check('invite email: sending the same invite to the same address again does not duplicate',
  (lv_api.lv_invite_email_send(t.id('hub'), t.get('code2'), 'friend@example.invalid') ->> 'already_sent') = 'true');
select t.check('invite email: an unknown code is lv_invalid_code', t.code(lv_api.lv_invite_email_send(t.id('hub'), 'NOPE-NOPE', 'a@example.invalid')) = 'lv_invalid_code');
select t.check('invite email: a bad address is lv_invalid_input', t.code(lv_api.lv_invite_email_send(t.id('hub'), t.get('code2'), 'not-an-address')) = 'lv_invalid_input');
select t.as_kpn(4);
select t.check('invite email: a member without admit rights is refused', t.code(lv_api.lv_invite_email_send(t.id('hub'), t.get('code2'), 'b@example.invalid')) = 'lv_forbidden');
select t.as_pg();
select t.check('invite email: the audit trail never records the address',
  t.q($$select count(*)::text from lv.audit_events where action = 'invite.emailed' and (detail::text like '%@%' or coalesce(target, '') like '%@%')$$) = '0'
  and t.q($$select count(*)::text from lv.email_outbox where template = 'hub_invite'$$) = '1');
update lv.policy set value = '1'::jsonb where key = 'email.invites_per_hour';
select t.as_kpn(1);
select t.check('invite email: sending is rate-limited per account', t.code(lv_api.lv_invite_email_send(t.id('hub'), t.get('code2'), 'c@example.invalid')) = 'lv_rate_limited');
select t.as_pg();

-- E05 / E06: reminders before expiry and in grace, once per period.
insert into lv.hub_reservations (slug, account_id, starts_at, expires_at) values
  ('soon-name', t.id('stranger'), now() - interval '50 weeks', now() + interval '5 days'),
  ('grace-name', t.id('stranger'), now() - interval '13 months', now() - interval '3 days'),
  ('far-name', t.id('stranger'), now(), now() + interval '300 days');
select t.put('sweep', lv.email_reservation_sweep()::text);
select t.check('email: the sweep queues an expiry reminder (E05) and a grace notice (E06), nothing for a far expiry',
  t.q($$select count(*)::text from lv.email_outbox where template = 'reservation_expiring' and payload->>'slug' = 'soon-name'$$) = '1'
  and t.q($$select count(*)::text from lv.email_outbox where template = 'reservation_grace' and payload->>'slug' = 'grace-name'$$) = '1'
  and t.q($$select count(*)::text from lv.email_outbox where template in ('reservation_expiring', 'reservation_grace') and payload->>'slug' = 'far-name'$$) = '0');
select t.check('email: a repeated sweep sends nothing twice',
  (lv.email_reservation_sweep() ->> 'expiring') = '0'
  and t.q($$select count(*)::text from lv.email_outbox where template in ('reservation_expiring', 'reservation_grace') and payload->>'slug' in ('soon-name', 'grace-name')$$) = '2');
select t.check('email: the grace notice carries the grace end and the 25 days',
  t.q($$select payload->>'grace_days' from lv.email_outbox where template = 'reservation_grace'$$) = '25');

-- ===== dispatcher state machine ===========================================================================
select t.check('email: enqueue refuses an unknown template or a bad address (returns null)',
  lv.email_enqueue('marketing_blast', null, 'x@example.invalid', '{}'::jsonb) is null
  and lv.email_enqueue('shop_order', null, 'not an address', '{}'::jsonb) is null);
select t.put('shop', lv.email_enqueue('shop_order', t.id('member'), 'person4@example.invalid',
  '{"hub_name": "Commerce Hub", "item": "Water bottle", "slug": "commerce-hub"}'::jsonb, 'order:test-1')::text);
select t.check('email: lv.email_enqueue accepts a shop order (E08) for track C and dedupes on its key',
  t.get('shop') is not null and lv.email_enqueue('shop_order', t.id('member'), 'person4@example.invalid', '{}'::jsonb, 'order:test-1') is null);
update lv.email_outbox set created_at = now() - interval '1 day' where id = t.id('shop');
select t.put('claim', lv.email_claim(1)::text);
select t.check('dispatch: a claim returns the oldest due message and marks it sending',
  (t.get('claim')::jsonb #>> '{messages,0,id}') = t.get('shop')
  and t.q(format($q$select status || '|' || attempts from lv.email_outbox where id = %L::uuid$q$, t.get('shop'))) = 'sending|1');
select t.check('dispatch: a message being sent is not claimed twice',
  t.q(format($q$select count(*)::text from jsonb_array_elements(lv.email_claim(100)->'messages') m where m->>'id' = %L$q$, t.get('shop'))) = '0');
select t.check('dispatch: a transient failure goes back to the queue with a delay',
  (lv.email_mark(t.id('shop'), 'retry', 'provider 503') ->> 'status') = 'queued'
  and t.q(format($q$select (next_attempt_at > now())::text from lv.email_outbox where id = %L::uuid$q$, t.get('shop'))) = 'true');
update lv.email_outbox set next_attempt_at = now() - interval '1 minute' where id = t.id('shop');
select lv.email_claim(100);
select t.check('dispatch: a sent message keeps no payload',
  (lv.email_mark(t.id('shop'), 'sent', null, 're_123') ->> 'status') = 'sent'
  and t.q(format($q$select payload::text || '|' || provider_message_id from lv.email_outbox where id = %L::uuid$q$, t.get('shop'))) = '{}|re_123');
select t.check('dispatch: marking a message that is not being sent is refused', t.code(lv.email_mark(t.id('shop'), 'sent')) = 'lv_lifecycle_invalid');
update lv.policy set value = '1'::jsonb where key = 'email.max_attempts';
select t.put('m2', lv.email_enqueue('shop_order', t.id('member'), 'person4@example.invalid', '{"item": "Cap"}'::jsonb, 'order:test-2')::text);
update lv.email_outbox set created_at = now() - interval '2 days' where id = t.id('m2');
select lv.email_claim(1);
select t.check('dispatch: after the last attempt a message is failed, not retried',
  (lv.email_mark(t.id('m2'), 'retry', 'still down') ->> 'status') = 'failed');
update lv.email_outbox set status = 'sending', locked_at = now() - interval '20 minutes'
 where template = 'hub_created';
select t.check('dispatch: a message stuck in sending for 15 minutes is reclaimed',
  t.q($$select count(*)::text from jsonb_array_elements(lv.email_claim(100)->'messages') m where m->>'template' = 'hub_created'$$) = '1');
update lv.email_outbox set sent_at = now() - interval '31 days' where id = t.id('shop');
select t.check('dispatch: finished rows are deleted after the retention period',
  (lv.email_retention_sweep() ->> 'deleted') = '1'
  and t.q(format($q$select count(*)::text from lv.email_outbox where id = %L::uuid$q$, t.get('shop'))) = '0');

-- Account deletion deletes the account's mail.
select t.check('email: the joiner has mail before deleting the account',
  t.q(format($q$select count(*)::text from lv.email_outbox where account_id = %L::uuid$q$, t.get('joiner'))) = '1');
select t.as_kpn(6, 'Joiner@Example.invalid', true, 'Joiner');
select t.check('email: the joiner deletes the account', t.code(lv_api.lv_account_delete('DELETE')) = 'ok');
select t.as_pg();
select t.check('email: deleting an account deletes its pending mail and its address',
  t.q($$select count(*)::text from lv.email_outbox where to_address = 'joiner@example.invalid'$$) = '0');

select t.as_kpn(2);
select t.check('email: the service-role email functions are denied to authenticated callers',
  t.raises('select lv.email_claim(1)', '42501') and t.raises('select lv.email_reservation_sweep()', '42501')
  and t.raises($$select lv.email_mark(gen_random_uuid(), 'sent')$$, '42501') and t.raises('select lv.email_retention_sweep()', '42501')
  and t.raises($$select lv.email_enqueue('hub_created', null, 'x@example.invalid', '{}'::jsonb)$$, '42501'));
select t.check('email: the outbox table cannot be read by API callers', t.raises('select count(*) from lv.email_outbox', '42501'));
select t.as_pg();
select t.check('email: the dispatcher functions are granted to the service role',
  has_function_privilege('service_role', 'lv.email_claim(int)', 'execute') and has_function_privilege('service_role', 'lv.email_mark(uuid, text, text, text)', 'execute')
  and not has_function_privilege('service_role', 'lv.email_enqueue(text, uuid, text, jsonb, text)', 'execute'));

-- ===== platform admin console =============================================================================
-- Abuse report and a Discover application to work with.
select t.as_kpn(1);
select t.put('jc', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('cid'))));
select t.as_anon();
select lv_api.lv_report_abuse(t.get('jc'), 'Asks for passwords');
select t.as_pg();
insert into lv.discover_applications (hub_id, submitted_by, genuine_members) values (t.id('hub'), t.id('owner'), 700);
select t.put('app', t.q(format($q$select id::text from lv.discover_applications where hub_id = %L::uuid$q$, t.get('hub'))));
select t.as_kpn(5); select lv_api.lv_waitlist_join('stranger@example.invalid', null, '2026-11-07');
select t.as_pg();
select t.put('entry', t.q(format($q$select id::text from lv.waitlist_entries where account_id = %L::uuid$q$, t.get('stranger'))));

select t.as_kpn(4);
select t.check('admin: every admin function refuses a non-admin with lv_forbidden',
  t.code(lv_api.lv_admin_overview()) = 'lv_forbidden' and t.code(lv_api.lv_admin_waitlist()) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_waitlist_contact(t.id('entry'))) = 'lv_forbidden' and t.code(lv_api.lv_admin_abuse_reports()) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_report_dismiss(gen_random_uuid())) = 'lv_forbidden' and t.code(lv_api.lv_admin_discover_list()) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_discover_decide(t.id('app'), true)) = 'lv_forbidden' and t.code(lv_api.lv_admin_billing_events()) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_email_outbox()) = 'lv_forbidden');
select t.check('admin: a refused decision changes nothing',
  t.q(format($q$select status from lv.discover_applications where id = %L::uuid$q$, t.get('app'))) = 'submitted');
select t.as_kpn(1);
select t.check('admin: a Hub Owner is not an admin either', t.code(lv_api.lv_admin_overview()) = 'lv_forbidden');
select t.as_anon();
select t.check('admin: signed out, the admin functions are not even executable',
  t.raises('select lv_api.lv_admin_overview()', '42501') and t.raises('select lv_api.lv_admin_waitlist()', '42501')
  and t.raises($$select lv_api.lv_admin_discover_decide(gen_random_uuid(), true)$$, '42501'));
select t.as_pg();
update lv.platform_admins set revoked_at = now() where account_id = t.id('admin');
select t.as_kpn(3);
select t.check('admin: a revoked admin is refused', t.code(lv_api.lv_admin_overview()) = 'lv_forbidden');
select t.as_pg();
select lv.grant_platform_admin(t.id('admin'), null);

select t.as_kpn(3);
select t.put('ov', lv_api.lv_admin_overview()::text);
select t.check('admin: the overview counts the waitlist, reports, Discover and the outbox',
  t.code(t.get('ov')::jsonb) = 'ok' and (t.get('ov')::jsonb #>> '{waitlist,admitted}')::int >= 1
  and (t.get('ov')::jsonb ->> 'reports_open') = '1' and (t.get('ov')::jsonb ->> 'discover_pending') = '1'
  and (t.get('ov')::jsonb #>> '{billing,provider_ready}') = 'true' and (t.get('ov')::jsonb #>> '{email,queued}')::int >= 1);
select t.put('wl', lv_api.lv_admin_waitlist()::text);
select t.check('admin: the waitlist shows positions and states but never an email address',
  jsonb_array_length(t.get('wl')::jsonb -> 'entries') >= 2 and t.get('wl') not like '%@%'
  and (t.get('wl')::jsonb #>> '{entries,0,position}') is not null);
select t.check('admin: opening one contact email returns it',
  (lv_api.lv_admin_waitlist_contact(t.id('entry')) ->> 'contact_email') = 'stranger@example.invalid');
select t.as_pg();
select t.check('admin: opening a contact email is audited (without the address)',
  t.q(format($q$select count(*)::text from lv.audit_events where action = 'admin.waitlist_contact_viewed' and target = %L and actor_account_id = %L::uuid
              and detail::text not like '%%@%%'$q$, t.get('entry'), t.get('admin'))) = '1');

select t.as_kpn(3);
select t.put('rep', lv_api.lv_admin_abuse_reports()::text);
select t.check('admin: the abuse queue lists the report with its Campaign, never the reporter',
  (t.get('rep')::jsonb #>> '{reports,0,reason}') = 'Asks for passwords' and (t.get('rep')::jsonb #>> '{reports,0,campaign_id}') = t.get('cid')
  and (t.get('rep')::jsonb #>> '{reports,0,open_reports}') = '1' and not (t.get('rep')::jsonb -> 'reports' -> 0 ? 'reporter_account_id'));
select t.check('admin: blocking from the queue uses the existing moderation path',
  t.code(lv_api.lv_admin_campaign_block(t.id('cid'), 'Phishing')) = 'ok'
  and (lv_api.lv_admin_abuse_reports('actioned') #>> '{reports,0,blocked}') = 'true'
  and t.code(lv_api.lv_admin_campaign_unblock(t.id('cid'))) = 'ok');
select t.as_anon(); select lv_api.lv_report_abuse(t.get('jc'), 'Second report');
select t.as_kpn(3);
select t.put('rep2', (lv_api.lv_admin_abuse_reports() #>> '{reports,0,report_id}'));
select t.check('admin: a report can be dismissed once', t.code(lv_api.lv_admin_report_dismiss(t.id('rep2'))) = 'ok'
  and t.code(lv_api.lv_admin_report_dismiss(t.id('rep2'))) = 'lv_not_found');
select t.check('admin: an unknown report status is lv_invalid_input', t.code(lv_api.lv_admin_abuse_reports('weird')) = 'lv_invalid_input');

select t.check('admin: the Discover queue lists the application with live member counts',
  (lv_api.lv_admin_discover_list() #>> '{applications,0,application_id}') = t.get('app')
  and (lv_api.lv_admin_discover_list() #>> '{applications,0,genuine_members_at_apply}') = '700');
select t.check('admin: a note over 500 characters is refused', t.code(lv_api.lv_admin_discover_decide(t.id('app'), true, repeat('x', 501))) = 'lv_invalid_input');
select t.check('admin: approving a Discover application', (lv_api.lv_admin_discover_decide(t.id('app'), true, 'Real community') ->> 'status') = 'approved');
select t.as_pg();
select t.check('admin: the decision is stored on the application (read by track C) and in the decision log',
  t.q(format($q$select status from lv.discover_applications where id = %L::uuid$q$, t.get('app'))) = 'approved'
  and t.q(format($q$select decision || '|' || decided_by::text from lv.discover_decisions where application_id = %L::uuid$q$, t.get('app'))) = 'approved|' || t.get('admin'));
select t.as_kpn(3);
select t.check('admin: a decision can be reversed', (lv_api.lv_admin_discover_decide(t.id('app'), false) ->> 'status') = 'rejected'
  and (lv_api.lv_admin_discover_list('rejected') #>> '{applications,0,application_id}') = t.get('app'));
select t.as_pg();
select t.grant_credit(t.id('admin'));
select t.as_kpn(3);
select t.put('ahub', (lv_api.lv_hub_create('admin-own-hub', 'Admin Hub') ->> 'hub_id'));
select t.as_pg();
insert into lv.discover_applications (hub_id, submitted_by, genuine_members) values (t.id('ahub'), t.id('admin'), 700);
select t.as_kpn(3);
select t.check('admin: nobody decides their own Hub''s application',
  t.code(lv_api.lv_admin_discover_decide((select t.q(format($q$select id::text from lv.discover_applications where hub_id = %L::uuid$q$, t.get('ahub'))))::uuid, true)) = 'lv_forbidden');

select t.put('bev', lv_api.lv_admin_billing_events()::text);
select t.check('admin: the billing log shows type, outcome and reason, never references or payloads',
  jsonb_array_length(t.get('bev')::jsonb -> 'events') >= 5 and t.get('bev') not like '%pi_%' and t.get('bev') not like '%sub_Hub1%'
  and t.get('bev') not like '%cus_%' and not (t.get('bev')::jsonb -> 'events' -> 0 ? 'detail')
  and t.get('bev') like '%amount_mismatch%');
select t.put('obx', lv_api.lv_admin_email_outbox()::text);
select t.check('admin: the outbox view shows counts and states, never an address or a payload',
  t.get('obx') not like '%@%' and not (t.get('obx')::jsonb -> 'recent' -> 0 ? 'payload')
  and (t.get('obx')::jsonb #>> '{by_template,reservation_confirmed}')::int >= 2);

-- ===== grants =============================================================================================
select t.as_pg();
select t.check('grants: no new lv_api function is executable by anon',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and (p.proname like 'lv_admin_%' or p.proname in ('lv_billing_config', 'lv_billing_portal_check', 'lv_invite_email_send'))
           and has_function_privilege('anon', p.oid, 'execute')$$) = '0');
select t.check('grants: every new lv_api function is executable by authenticated',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and (p.proname like 'lv_admin_%' or p.proname in ('lv_billing_config', 'lv_billing_portal_check', 'lv_invite_email_send'))
           and not has_function_privilege('authenticated', p.oid, 'execute')$$) = '0');
select t.check('grants: the new tables have row level security and no API grants',
  t.q($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'lv' and c.relname in ('email_outbox', 'billing_customers', 'billing_subscriptions', 'discover_decisions')
           and (not c.relrowsecurity or has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('service_role', c.oid, 'select'))$$) = '0');
select t.check('reserved: /reserve cannot be claimed as a Hub', t.q($$select count(*)::text from lv.reserved_slugs where slug = 'reserve'$$) = '1');

rollback;
