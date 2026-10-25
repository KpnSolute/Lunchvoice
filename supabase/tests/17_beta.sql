-- 17: beta applications, platform approval and self-service Hub creation (the whole onboarding path, no developer-edited rows).
select set_config('t.file', '17_beta', false);
begin;

create function t.sid(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8900-' || lpad((100 + n)::text, 12, '0'))::uuid $$;

update lv_private.policy set value = '["https://auth.test.invalid"]'::jsonb where key = 'identity.trusted_issuers';

-- people sign in (accounts appear on first call)
select t.as_central(t.sid(1), 'ada@example.invalid', true);   select public.lv_my_context();
select t.as_central(t.sid(2), 'rev@example.invalid', true);   select public.lv_my_context();
select t.as_central(t.sid(3), 'unver@example.invalid', false); select public.lv_my_context();
select t.as_central(t.sid(4), 'student@example.invalid', true); select public.lv_my_context();
select t.as_pg();
select lv_private.grant_platform_admin(t.sid(2), 'founder (synthetic test)', 'rehearsal reviewer');

-- policy defaults
select t.check('beta cap ships as the confirmed 50', lv_private.beta_cap() = 50);
select t.check('beta terms and reserved slugs ship UNSET', lv_private.beta_terms() is null and (select value from lv_private.policy where key = 'slug.reserved') is null);

-- application
select t.as_central(t.sid(3), 'unver@example.invalid', false);
select t.check('an unverified email cannot apply', t.code(public.lv_beta_apply('hi')) = 'lv_email_unverified');
select t.as_anon();
select t.check('anon cannot apply', t.code(public.lv_beta_apply('hi')) = 'lv_unauthenticated');
select t.as_central(t.sid(1), 'ada@example.invalid', true);
select t.check('a verified person can apply', t.code(public.lv_beta_apply('LionCafe at MJCC')) = 'ok');
select t.check('...and sees it as submitted', public.lv_beta_my_application()->'data'->'application'->>'status' = 'submitted');
select t.check('applying again returns the same open application', (public.lv_beta_apply()->'data'->>'already_open')::boolean);
select t.check('the applicant does not see their contact email in the response', not (public.lv_beta_my_application()->'data'->'application' ? 'contact_email'));
select t.check('an applicant cannot decide', t.code(public.lv_beta_decide((public.lv_beta_my_application()->'data'->'application'->>'id')::uuid, 'approve')) = 'lv_forbidden');
select t.check('...or list applications', t.code(public.lv_beta_applications_list()) = 'lv_forbidden');
select t.check('the API roles cannot read the application table', t.raises('select * from lv_private.beta_applications', '42501'));
select t.as_pg();
select t.put('app1', (select id::text from lv_private.beta_applications where account_id = t.sid(1)));
select t.as_central(t.sid(3), 'unver@example.invalid', false);
select t.check('a non-admin who is not the applicant cannot decide either', t.code(public.lv_beta_decide(t.get('app1')::uuid, 'approve')) = 'lv_forbidden');

-- hub creation before approval and before policy
select t.as_central(t.sid(1), 'ada@example.invalid', true);
select t.check('no Hub before approval', t.code(public.lv_hub_create('LionCafe', 'lioncafe')) = 'lv_forbidden');

-- approval
select t.as_central(t.sid(2), 'rev@example.invalid', true);
select t.check('a platform admin sees the applicant email', public.lv_beta_applications_list('submitted')->'data'->'applications'->0->>'contact_email' = 'ada@example.invalid');
select t.check('approve', t.code(public.lv_beta_decide(t.get('app1')::uuid, 'approve', 'welcome')) = 'ok');
select t.check('repeat approval changes nothing', not (public.lv_beta_decide(t.get('app1')::uuid, 'approve')->'data'->>'changed')::boolean);
select t.check('an approved application cannot be rejected', t.code(public.lv_beta_decide(t.get('app1')::uuid, 'reject')) = 'lv_conflict');

-- nobody approves themselves
select t.as_pg();
select lv_private.grant_platform_admin(t.sid(1), 'founder (synthetic test)', 'self-approval test');
select t.as_central(t.sid(1), 'ada@example.invalid', true);
select t.check('a platform admin cannot decide their own application', t.code(public.lv_beta_decide(t.get('app1')::uuid, 'revoke')) = 'lv_forbidden');
select t.as_pg();
select lv_private.revoke_platform_admin(t.sid(1), 'founder (synthetic test)', 'done');

-- hub creation: fail closed until the founder decides
select t.as_central(t.sid(1), 'ada@example.invalid', true);
select t.check('Hub creation answers policy-undecided until terms and reserved slugs are set',
  t.code(public.lv_hub_create('LionCafe', 'lioncafe')) = 'lv_policy_undecided'
  and public.lv_hub_create('LionCafe', 'lioncafe')->'error'->'details'->'missing' @> '["beta.terms","slug.reserved"]'::jsonb);
select t.as_pg();
select t.check('...and created nothing', t.q('select count(*) from lv_private.hubs where slug = ''lioncafe''') = '0');
update lv_private.policy set value = '{"months": 3, "plan_equivalent": "team"}'::jsonb where key = 'beta.terms';
update lv_private.policy set value = '["admin","www","api"]'::jsonb where key = 'slug.reserved';

select t.as_central(t.sid(1), 'ada@example.invalid', true);
select t.check('invalid input is refused', t.code(public.lv_hub_create('', 'lioncafe')) = 'lv_invalid_input' and t.code(public.lv_hub_create('X', 'Bad Slug!')) = 'lv_invalid_input'
  and t.code(public.lv_hub_create('X', 'lioncafe', 'secret')) = 'lv_invalid_input');
select t.check('a reserved slug is refused', t.code(public.lv_hub_create('Admin', 'admin')) = 'lv_slug_unavailable');
select t.check('the approved applicant creates their own Hub', t.code(public.lv_hub_create('LionCafe', 'LionCafe')) = 'ok');
select t.as_pg();
select t.put('hub', (select id::text from lv_private.hubs where slug = 'lioncafe'));

select t.check('the Hub has the applicant as its single Owner with an accepted membership',
  (select owner_account_id from lv_private.hubs where slug = 'lioncafe') = t.sid(1)
  and t.q($$select count(*) from lv_private.hub_memberships where status = 'accepted' and hub_id = $$ || quote_literal(t.get('hub'))) = '1');
select t.check('the Hub is private and invite-only by default', (select visibility || '/' || membership_mode from lv_private.hubs where slug = 'lioncafe') = 'private/invite_only');
select t.check('exactly one beta grant, three months, Team limits, and no other grant',
  (select count(*) from lv_private.entitlement_grants where hub_id = t.get('hub')::uuid) = 1
  and (select source || '/' || plan_code from lv_private.entitlement_grants where hub_id = t.get('hub')::uuid) = 'beta/team'
  and (select valid_to - valid_from from lv_private.entitlement_grants where hub_id = t.get('hub')::uuid) between interval '89 days' and interval '93 days');
select t.check('the approval is consumed', (select hub_id from lv_private.beta_applications where id = t.get('app1')::uuid) = t.get('hub')::uuid);
select t.check('no other account got any membership', t.q('select count(*) from lv_private.hub_memberships') = '1');

select t.as_central(t.sid(1), 'ada@example.invalid', true);
select t.check('the second Hub on the same approval is refused', t.code(public.lv_hub_create('Another', 'another')) = 'lv_conflict');
select t.check('the Hub resolves publicly by its own slug', (select public.lv_hub_public('lioncafe')->'data'->>'name') = 'LionCafe');

-- a student: no beta approval needed to exist, but no Hub and no way to create one
select t.as_central(t.sid(4), 'student@example.invalid', true);
select t.check('a student without approval cannot create a Hub', t.code(public.lv_hub_create('Mine', 'mine')) = 'lv_forbidden');
select t.as_pg();
select t.check('...and is not a member of the Hub', not exists (select 1 from lv_private.hub_memberships where hub_id = t.get('hub')::uuid and account_id = t.sid(4)));
select t.as_central(t.sid(4), 'student@example.invalid', true);

-- slug taken
select t.as_central(t.sid(4), 'student@example.invalid', true);
select public.lv_beta_apply('me too');
select t.as_pg();
select t.put('app4', (select id::text from lv_private.beta_applications where account_id = t.sid(4)));
select t.as_central(t.sid(2), 'rev@example.invalid', true);
select public.lv_beta_decide(t.get('app4')::uuid, 'approve');
select t.as_central(t.sid(4), 'student@example.invalid', true);
select t.check('a taken slug is refused case-insensitively', t.code(public.lv_hub_create('Copy', 'LIONCAFE')) = 'lv_slug_unavailable');

-- cap
select t.as_pg();
update lv_private.policy set value = '1'::jsonb where key = 'beta.cap';
select t.as_central(t.sid(4), 'student@example.invalid', true);
select t.check('the cap stops a creation once reached', t.code(public.lv_hub_create('Second', 'second')) = 'lv_quota_exceeded');
select t.as_pg();
update lv_private.policy set value = null where key = 'beta.cap';
select t.as_central(t.sid(4), 'student@example.invalid', true);
select t.check('an unset cap fails closed', t.code(public.lv_hub_create('Second', 'second')) = 'lv_policy_undecided');

rollback;
