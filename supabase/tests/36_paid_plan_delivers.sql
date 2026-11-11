-- 36: a purchase delivers what it advertises (founder question 2026-11-11: "do the users get what they are paying for?").
-- A Starter Hub hits its limits; a verified Team purchase arrives through the billing pipeline; the same Hub then gets the Team
-- allowances. Cancelling keeps access to the end of the paid period (000017 covers refunds in depth).
select set_config('t.file', '36_paid_plan_delivers', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('pay-delivers', 'Pay Delivers') ->> 'hub_id'));
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Targeted', 'poll', 'identified') ->> 'campaign_id'));
select t.put('r1', (lv_api.lv_role_create(t.id('hub'), 'One', 'star', array[]::text[]) #>> '{role,role_id}'));

select t.check('starter: the plan is Starter', t.q(format($q$select lv.hub_plan(%L::uuid) ->> 'family'$q$, t.get('hub'))) = 'starter');
select t.check('starter: roles up to the Starter limit of 3', t.code(lv_api.lv_role_create(t.id('hub'), 'Two', 'star', array[]::text[])) = 'ok'
  and t.code(lv_api.lv_role_create(t.id('hub'), 'Three', 'star', array[]::text[])) = 'ok');
select t.check('starter: a fourth role is refused (the limit is enforced)', t.code(lv_api.lv_role_create(t.id('hub'), 'Four', 'star', array[]::text[])) in ('lv_limit_reached', 'lv_entitlement_required'));
select t.check('starter: role targeting is a Team feature and is refused', t.code(lv_api.lv_campaign_set_audience_roles(t.id('c'), array[t.id('r1')])) in ('lv_entitlement_required', 'lv_not_available'));

-- The purchase: a Team Hub subscription for this Hub, paid in full, arrives from Stripe.
select t.as_pg();
select t.put('intent', t.intent(t.id('owner'), 'team_hub', t.id('hub'))::text);
select t.check('purchase: the verified event is applied', (lv.billing_apply_event('stripe', 'e_team_pay', 'checkout.session.completed', t.paid(t.id('intent'))) ->> 'outcome') = 'applied');
select t.check('purchase: the Hub is now on the Team family, delivered as a billing entitlement',
  t.q(format($q$select lv.hub_plan(%L::uuid) ->> 'family'$q$, t.get('hub'))) = 'team'
  and t.q(format($q$select count(*)::text from lv.entitlements where hub_id = %L::uuid and source = 'billing' and family = 'team'$q$, t.get('hub'))) = '1');
select t.check('purchase: the same event twice grants nothing more',
  (lv.billing_apply_event('stripe', 'e_team_pay_2', 'checkout.session.completed', t.paid(t.id('intent'))) ->> 'outcome') = 'ignored'
  and t.q(format($q$select count(*)::text from lv.entitlements where hub_id = %L::uuid and source = 'billing'$q$, t.get('hub'))) = '1');

select t.as_kpn(1);
select t.check('team: the fourth role now works, up to the Team limit of 6',
  t.code(lv_api.lv_role_create(t.id('hub'), 'Four', 'star', array[]::text[])) = 'ok'
  and t.code(lv_api.lv_role_create(t.id('hub'), 'Five', 'star', array[]::text[])) = 'ok'
  and t.code(lv_api.lv_role_create(t.id('hub'), 'Six', 'star', array[]::text[])) = 'ok');
select t.check('team: a seventh role is refused', t.code(lv_api.lv_role_create(t.id('hub'), 'Seven', 'star', array[]::text[])) in ('lv_limit_reached', 'lv_entitlement_required'));
select t.check('team: role targeting now works on an identified Campaign', t.code(lv_api.lv_campaign_set_audience_roles(t.id('c'), array[t.id('r1')])) = 'ok');

-- Cancelling: access runs to the end of the paid period, then the Hub falls back to its other entitlement.
select t.as_pg();
select t.check('cancel: the entitlement is kept to the end of the paid period, not cut off',
  (lv.billing_apply_event('stripe', 'e_cancel', 'customer.subscription.deleted',
     jsonb_build_object('subscription', (select external_ref from lv.entitlements where hub_id = t.id('hub') and source = 'billing'),
                        'period_end', extract(epoch from now() + interval '20 days')::bigint)) ->> 'outcome') in ('applied', 'ignored'));
select t.check('cancel: the Hub is still on Team today', t.q(format($q$select lv.hub_plan(%L::uuid) ->> 'family'$q$, t.get('hub'))) = 'team');
select t.check('cancel: nothing was deleted: the roles still exist', t.q(format($q$select count(*)::text from lv.roles r where r.hub_id = %L::uuid$q$, t.get('hub')))::int >= 6);
rollback;
