-- 35: staff billing controls (000035): schedule or open billing, which starts the Founding countdown and enables purchases.
select set_config('t.file', '35_billing_controls', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Staff'); select lv_api.lv_my_context();
select t.put('staff', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Ordinary'); select lv_api.lv_my_context();
select t.as_pg();
select lv.grant_platform_admin(t.id('staff'), null);
update lv.policy set value = null where key = 'billing.launched_at';
update lv.policy set value = 'false'::jsonb where key = 'billing.provider_ready';
update lv.policy set value = null where key = 'billing.stripe_prices';

select t.as_kpn(2);
select t.check('access: ordinary people cannot read or change billing',
  t.code(lv_api.lv_admin_billing_status()) = 'lv_forbidden' and t.code(lv_api.lv_admin_billing_set('open', null, 'OPEN BILLING')) = 'lv_forbidden');
select t.as_anon();
select t.check('access: signed-out callers cannot call the staff functions and can read the public plan limits',
  not has_function_privilege('anon', 'lv_api.lv_admin_billing_status()', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_admin_billing_set(text, timestamptz, text)', 'execute')
  and t.code(lv_api.lv_plan_limits()) = 'ok');
select t.check('public: billing starts off with no date', (lv_api.lv_plan_limits() #>> '{billing,open}') = 'false' and (lv_api.lv_plan_limits() #> '{billing,launch_at}') = 'null'::jsonb);

select t.as_kpn(1);
select t.check('status: off, no date, every Stripe price missing',
  (lv_api.lv_admin_billing_status() ->> 'open') = 'false' and (lv_api.lv_admin_billing_status() #>> '{launch_at}') is null
  and jsonb_array_length(lv_api.lv_admin_billing_status() -> 'price_gaps') = 5);
select t.check('schedule: a past date is refused', t.code(lv_api.lv_admin_billing_set('schedule', now() - interval '1 day')) = 'lv_invalid_input');
select t.check('schedule: a date more than a year away is refused', t.code(lv_api.lv_admin_billing_set('schedule', now() + interval '500 days')) = 'lv_invalid_input');
select t.put('when', to_char(date_trunc('second', now() + interval '10 days'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
select t.check('schedule: a future date is accepted', t.code(lv_api.lv_admin_billing_set('schedule', t.get('when')::timestamptz)) = 'ok');
select t.check('schedule: it is published, with the Founding end 30 days later',
  (lv_api.lv_plan_limits() #>> '{billing,launch_at}')::timestamptz = t.get('when')::timestamptz
  and (lv_api.lv_plan_limits() #>> '{billing,founding_ends_at}')::timestamptz = t.get('when')::timestamptz + interval '30 days'
  and (lv_api.lv_plan_limits() #>> '{billing,open}') = 'false');
select t.as_pg();
select t.check('countdown: a Founding entitlement now ends 30 days after the date for everyone',
  lv.effective_end('founding', null) = t.get('when')::timestamptz + interval '30 days');
select t.as_kpn(1);
select t.check('clear: the date can be removed while billing is off', t.code(lv_api.lv_admin_billing_set('clear')) = 'ok');
select t.check('clear: and it is gone', (lv_api.lv_admin_billing_status() #>> '{launch_at}') is null);
select lv_api.lv_admin_billing_set('schedule', t.get('when')::timestamptz);

-- ===== opening billing =====================================================================================
select t.check('open: refused until every Stripe price is set, naming what is missing',
  t.code(lv_api.lv_admin_billing_set('open', null, 'OPEN BILLING')) = 'lv_not_available'
  and (lv_api.lv_admin_billing_set('open', null, 'OPEN BILLING') #>> '{error,message}') like '%starter_hub%');
select t.as_pg();
update lv.policy set value = '{"starter_hub":"price_a","team_hub":"price_b","hub_reservation":"price_c","campaign_starter":{"first":"p1","extra_week":"p2"},"campaign_plus":{"first":"p3","extra_week":"p4"}}'::jsonb where key = 'billing.stripe_prices';
select t.as_kpn(1);
select t.check('open: needs the typed confirmation', t.code(lv_api.lv_admin_billing_set('open')) = 'lv_invalid_input'
  and t.code(lv_api.lv_admin_billing_set('open', null, 'yes')) = 'lv_invalid_input');
select t.check('open: works with prices set and the confirmation', t.code(lv_api.lv_admin_billing_set('open', null, 'OPEN BILLING')) = 'ok');
select t.check('open: purchases are on and the countdown starts now, not on the old future date',
  (lv_api.lv_plan_limits() #>> '{billing,open}') = 'true'
  and (lv_api.lv_plan_limits() #>> '{billing,launch_at}')::timestamptz <= now() + interval '1 second'
  and (lv_api.lv_plan_limits() #>> '{billing,launch_at}')::timestamptz < t.get('when')::timestamptz);
select t.as_pg();
select t.check('open: the policy flag every purchase path reads is on', (lv.policy_json('billing.provider_ready'))::boolean = true);
select t.as_kpn(1);
select t.check('open: the date can no longer move or be cleared', t.code(lv_api.lv_admin_billing_set('schedule', now() + interval '5 days')) = 'lv_conflict'
  and t.code(lv_api.lv_admin_billing_set('clear')) = 'lv_conflict');
select t.check('open: opening twice changes nothing', t.code(lv_api.lv_admin_billing_set('open', null, 'OPEN BILLING')) = 'ok');
select t.check('status: reports the Founding Hubs and paying Hubs counts', (lv_api.lv_admin_billing_status() ->> 'founding_hubs') is not null
  and (lv_api.lv_admin_billing_status() ->> 'paying_hubs') is not null and jsonb_array_length(lv_api.lv_admin_billing_status() -> 'price_gaps') = 0);

-- ===== pausing =============================================================================================
select t.check('pause: needs the typed confirmation', t.code(lv_api.lv_admin_billing_set('pause')) = 'lv_invalid_input');
select t.put('launched', lv_api.lv_plan_limits() #>> '{billing,launch_at}');
select t.check('pause: works with the confirmation', t.code(lv_api.lv_admin_billing_set('pause', null, 'PAUSE BILLING')) = 'ok');
select t.check('pause: stops new purchases and keeps the launch date', (lv_api.lv_plan_limits() #>> '{billing,open}') = 'false'
  and (lv_api.lv_plan_limits() #>> '{billing,launch_at}') = t.get('launched'));
select t.check('pause: the status warns that the launch date has passed while billing is off', (lv_api.lv_admin_billing_status() ->> 'launch_passed_billing_off') = 'true');
select t.as_pg();
select t.check('audit: every change is recorded by action', (select string_agg(action, ',' order by id) from lv.audit_events where action like 'billing.%')
  = 'billing.scheduled,billing.schedule_cleared,billing.scheduled,billing.opened,billing.paused');
rollback;
