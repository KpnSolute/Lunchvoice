-- 17: BILLING HARDENING AND LAUNCH-REVIEW FIXES (000017; compliance re-review NEW-01, NEW-02, NEW-06, NEW-08).
select set_config('t.file', '17_billing_hardening', false);
begin;

select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Buyer'); select lv_api.lv_my_context();
select t.put('buyer', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'));
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('hardening-hub', 'Hardening Hub') ->> 'hub_id'));
select t.as_pg();

-- ===== NEW-01: a grant is bound to what was paid =========================================================
select t.put('i104', t.intent(t.id('buyer'), 'campaign_starter', null, null, 104)::text);
select t.check('NEW-01: a 104-week intent is priced at 134500 cents', t.q(format($q$select amount_cents::text from lv.checkout_intents where id = %L::uuid$q$, t.get('i104'))) = '134500');
select t.check('NEW-01: a 104-week intent paid with amount_subtotal 1900 is rejected',
  (lv.billing_apply_event('stripe', 'e_mis', 'checkout.session.completed', t.paid(t.id('i104'), '{"amount_subtotal": 1900}'::jsonb)) ->> 'outcome') = 'rejected'
  and t.q($$select detail->>'reason' from lv.billing_events where event_id = 'e_mis'$$) = 'amount_mismatch');
select t.check('NEW-01: an amount mismatch grants nothing',
  t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('buyer'))) = '0'
  and t.q(format($q$select completed_at is null from lv.checkout_intents where id = %L::uuid$q$, t.get('i104')))::boolean);
select t.check('NEW-01: a session without an intent is rejected; metadata alone is never trusted',
  (lv.billing_apply_event('stripe', 'e_noint', 'checkout.session.completed',
     jsonb_build_object('product', 'team_hub', 'account_id', t.get('buyer'), 'amount_subtotal', 2900, 'currency', 'usd', 'payment_status', 'paid')) ->> 'outcome') = 'rejected'
  and t.q($$select detail->>'reason' from lv.billing_events where event_id = 'e_noint'$$) = 'no_intent');
select t.check('NEW-01: another currency is rejected',
  (lv.billing_apply_event('stripe', 'e_eur', 'checkout.session.completed', t.paid(t.intent(t.id('buyer'), 'starter_hub'), '{"currency": "eur"}'::jsonb)) ->> 'outcome') = 'rejected');
select t.check('NEW-01: a missing amount is rejected',
  (lv.billing_apply_event('stripe', 'e_noamt', 'checkout.session.completed', t.paid(t.intent(t.id('buyer'), 'starter_hub')) - 'amount_subtotal') ->> 'outcome') = 'rejected');

select t.put('iasync', t.intent(t.id('buyer'), 'starter_hub')::text);
select t.check('NEW-01: an unpaid (delayed) session grants nothing',
  (lv.billing_apply_event('stripe', 'e_unpaid', 'checkout.session.completed', t.paid(t.id('iasync'), '{"payment_status": "unpaid"}'::jsonb)) ->> 'outcome') = 'rejected'
  and t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('buyer'))) = '0');
select t.check('NEW-01: async_payment_succeeded grants once the money arrives',
  (lv.billing_apply_event('stripe', 'e_async', 'checkout.session.async_payment_succeeded', t.paid(t.id('iasync'), '{"subscription": "sub_async"}'::jsonb)) ->> 'outcome') = 'applied'
  and t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('buyer'))) = '1');
select t.check('NEW-01: async success grants exactly once (a second paid event for the same intent is ignored)',
  (lv.billing_apply_event('stripe', 'e_async2', 'checkout.session.completed', t.paid(t.id('iasync'))) ->> 'outcome') = 'ignored'
  and (lv.billing_apply_event('stripe', 'e_async', 'checkout.session.async_payment_succeeded', t.paid(t.id('iasync'))) ->> 'duplicate') = 'true'
  and t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('buyer'))) = '1');
select t.check('NEW-01: a matching amount grants exactly the intent''s weeks (metadata weeks ignored)',
  (lv.billing_apply_event('stripe', 'e_plus', 'checkout.session.completed',
     t.paid(t.intent(t.id('buyer'), 'campaign_plus', null, null, 4), '{"weeks": 104, "payment_ref": "pi_plus"}'::jsonb)) ->> 'outcome') = 'applied'
  and t.q($$select family || '|' || duration::text from lv.hub_credits where external_ref = 'pi_plus'$$) = 'team|28 days');
select t.check('NEW-01: no_payment_required (a 100% coupon) also grants',
  (lv.billing_apply_event('stripe', 'e_free', 'checkout.session.completed',
     t.paid(t.intent(t.id('owner'), 'campaign_starter', null, null, 2), '{"payment_status": "no_payment_required", "payment_ref": "pi_free"}'::jsonb)) ->> 'outcome') = 'applied');

-- ===== NEW-02: refunds per F-08 ===========================================================================
-- Campaign plan bought as a credit, not used yet: a full refund revokes it.
select t.check('NEW-02: a full refund before the Campaign window starts revokes the unused credit',
  (lv.billing_apply_event('stripe', 'r_full_credit', 'charge.refunded', '{"payment_ref": "pi_plus", "amount": 7700, "amount_refunded": 7700}'::jsonb) ->> 'outcome') = 'applied'
  and t.q(format($q$select (lv.valid_credit(%L::uuid) is distinct from (select id from lv.hub_credits where external_ref = 'pi_plus'))::text$q$, t.get('buyer'))) = 'true'
  and t.q($$select (ends_at <= now())::text from lv.hub_credits where external_ref = 'pi_plus'$$) = 'true');
-- A partial refund never revokes.
select t.check('NEW-02: a partial refund is recorded for support and revokes nothing',
  (lv.billing_apply_event('stripe', 'r_partial', 'charge.refunded', '{"payment_ref": "pi_free", "amount": 1900, "amount_refunded": 500}'::jsonb) ->> 'outcome') = 'ignored'
  and t.q($$select detail->>'reason' from lv.billing_events where event_id = 'r_partial'$$) = 'partial_refund_recorded_for_support'
  and t.q($$select (ends_at is null)::text from lv.hub_credits where external_ref = 'pi_free'$$) = 'true');
-- Campaign plan attached to a Hub: the window starts at purchase, so a refund afterwards is recorded, not applied.
select lv.billing_apply_event('stripe', 'e_win', 'checkout.session.completed',
  t.paid(t.intent(t.id('owner'), 'campaign_starter', t.id('hub'), null, 3), '{"payment_ref": "pi_win"}'::jsonb));
select t.check('NEW-02: a full refund after the Campaign window started does not revoke it',
  (lv.billing_apply_event('stripe', 'r_started', 'charge.refunded', '{"payment_ref": "pi_win", "refunded": true}'::jsonb) ->> 'outcome') = 'ignored'
  and t.q($$select detail->>'reason' from lv.billing_events where event_id = 'r_started'$$) = 'started_window_recorded_for_support'
  and t.q($$select (ends_at > now() + interval '20 days')::text from lv.entitlements where external_ref = 'pi_win'$$) = 'true');
-- A window scheduled for the future is revoked by a full refund.
insert into lv.entitlements (scope, account_id, hub_id, family, product, source, starts_at, ends_at, external_ref)
values ('hub', t.id('owner'), t.id('hub'), 'starter', 'campaign_starter', 'billing', now() + interval '7 days', now() + interval '21 days', 'pi_future');
select t.check('NEW-02: a full refund of a window that has not started revokes it',
  (lv.billing_apply_event('stripe', 'r_future', 'charge.refunded', '{"payment_ref": "pi_future", "refunded": true}'::jsonb) ->> 'outcome') = 'applied'
  and t.q($$select (ends_at = starts_at)::text from lv.entitlements where external_ref = 'pi_future'$$) = 'true');
-- Reservations: a full refund releases the reservation.
select lv.billing_apply_event('stripe', 'e_res', 'checkout.session.completed',
  t.paid(t.intent(t.id('buyer'), 'hub_reservation', null, 'refund-me'), '{"payment_ref": "pi_res"}'::jsonb));
select t.check('NEW-02: a full refund releases a Hub Name Reservation',
  (lv.billing_apply_event('stripe', 'r_res', 'charge.refunded', '{"payment_ref": "pi_res", "refunded": true}'::jsonb) ->> 'outcome') = 'applied'
  and t.q($$select lv.reservation_state(expires_at, released_at) from lv.hub_reservations where slug = 'refund-me'$$) = 'released');

-- Hub subscriptions: a refund never ends paid-for access by itself.
select lv.billing_apply_event('stripe', 'e_subA', 'checkout.session.completed',
  t.paid(t.intent(t.id('owner'), 'starter_hub', t.id('hub')), jsonb_build_object('subscription', 'sub_A', 'mode', 'subscription',
         'period_end', extract(epoch from now() + interval '30 days')::bigint)));
select lv.billing_apply_event('stripe', 'e_invA', 'invoice.paid',
  jsonb_build_object('subscription', 'sub_A', 'payment_ref', 'pi_subA', 'period_end', extract(epoch from now() + interval '30 days')::bigint));
select t.check('NEW-02: a full refund of a Hub subscription payment keeps access',
  (lv.billing_apply_event('stripe', 'r_subA', 'charge.refunded', '{"payment_ref": "pi_subA", "refunded": true}'::jsonb) ->> 'outcome') = 'ignored'
  and t.q($$select detail->>'reason' from lv.billing_events where event_id = 'r_subA'$$) = 'subscription_refund_recorded'
  and t.q($$select (ends_at > now() + interval '29 days')::text from lv.entitlements where external_ref = 'sub_A'$$) = 'true');
select t.check('NEW-02: an explicit full refund plus immediate cancellation ends access at the cancellation',
  (lv.billing_apply_event('stripe', 'd_subA', 'customer.subscription.deleted',
     jsonb_build_object('subscription', 'sub_A', 'ended_at', extract(epoch from now())::bigint,
                        'period_end', extract(epoch from now() + interval '30 days')::bigint)) ->> 'outcome') = 'applied'
  and t.q($$select (ends_at <= now() + interval '1 minute')::text from lv.entitlements where external_ref = 'sub_A'$$) = 'true');
select lv.billing_apply_event('stripe', 'e_subB', 'checkout.session.completed',
  t.paid(t.intent(t.id('owner'), 'starter_hub', t.id('hub')), jsonb_build_object('subscription', 'sub_B', 'mode', 'subscription',
         'period_end', extract(epoch from now() + interval '30 days')::bigint)));
select t.check('NEW-02: cancelling without a full refund keeps access to the end of the paid period',
  (lv.billing_apply_event('stripe', 'd_subB', 'customer.subscription.deleted',
     jsonb_build_object('subscription', 'sub_B', 'ended_at', extract(epoch from now())::bigint,
                        'period_end', extract(epoch from now() + interval '30 days')::bigint)) ->> 'outcome') = 'applied'
  and t.q($$select (ends_at > now() + interval '29 days')::text from lv.entitlements where external_ref = 'sub_B'$$) = 'true');

-- ===== NEW-06: optional questions =========================================================================
select t.as_kpn(1);
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(3); select lv_api.lv_my_context(); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(1);
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Optional', 'poll', 'identified') ->> 'campaign_id'));
select t.put('qreq', (lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'Required') ->> 'question_id'));
select t.put('qopt', (lv_api.lv_campaign_question_add(t.id('c'), 2, 'text', 'Optional', '{"optional": true}'::jsonb) ->> 'question_id'));
select lv_api.lv_campaign_set_participation(t.id('c'), 'members_and_guests');
select lv_api.lv_campaign_activate(t.id('c'));
select t.put('ccode', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));
select t.as_kpn(3);
select t.check('NEW-06: a member may skip an optional question',
  t.code(lv_api.lv_submit_response(t.id('c'), format('[{"question_id":"%s","value":4}]', t.get('qreq'))::jsonb)) = 'ok');
select t.as_kpn(1);
select t.check('NEW-06: a member may not skip a required question',
  t.code(lv_api.lv_submit_response(t.id('c'), format('[{"question_id":"%s","value":"only this"}]', t.get('qopt'))::jsonb)) = 'lv_invalid_input');
select t.as_anon();
select t.check('NEW-06: a guest may skip an optional question',
  t.code(lv_api.lv_guest_submit(t.get('ccode'), repeat('k', 40), format('[{"question_id":"%s","value":3}]', t.get('qreq'))::jsonb)) = 'ok');
select t.check('NEW-06: a guest may not skip a required question',
  t.code(lv_api.lv_guest_submit(t.get('ccode'), repeat('m', 40), format('[{"question_id":"%s","value":"x"}]', t.get('qopt'))::jsonb)) = 'lv_invalid_input');
select t.as_pg();
select t.check('NEW-06: a skipped optional question stores no answer row',
  t.q(format($q$select count(*)::text from lv.answers where question_id = %L::uuid$q$, t.get('qopt'))) = '0');
select t.check('NEW-06: a submission must answer at least one question',
  t.q(format($q$select lv.validate_answers(%L::uuid, '[]'::jsonb)$q$, t.get('c'))) = 'missing answer for question 1');

-- ===== NEW-08: seats are never re-issued ==================================================================
select t.as_pg();
update lv.policy set value = '2'::jsonb where key = 'waitlist.seats';
select t.as_kpn(10); select t.check('NEW-08: first seat', (lv_api.lv_waitlist_join() ->> 'position') = '1');
select t.as_kpn(11); select t.check('NEW-08: second seat', (lv_api.lv_waitlist_join() ->> 'status') = 'admitted');
select t.as_kpn(10);
select t.check('NEW-08: the first admitted person deletes their account', t.code(lv_api.lv_account_delete('DELETE')) = 'ok');
select t.as_kpn(12);
select t.put('wl12', lv_api.lv_waitlist_join()::text);
select t.check('NEW-08: a deleted account does not free its seat: the next joiner is waitlisted',
  (t.get('wl12')::jsonb ->> 'status') = 'waitlisted' and (t.get('wl12')::jsonb ->> 'position') = '1');
select t.check('NEW-08: the list stays full', (lv_api.lv_waitlist_status() ->> 'seats_taken') = '2' and (lv_api.lv_waitlist_status() ->> 'open') = 'false');
select t.as_kpn(13);
select t.check('NEW-08: waitlist positions never repeat', (lv_api.lv_waitlist_join() ->> 'position') = '2');
select t.as_pg();
select t.check('NEW-08: at most waitlist.seats Founding grants were ever issued',
  t.q($$select (count(*) <= 2)::text from lv.audit_events where action = 'waitlist.admitted'$$) = 'true'
  and t.q($$select admitted_issued::text from lv.waitlist_counters$$) = '2');

rollback;
