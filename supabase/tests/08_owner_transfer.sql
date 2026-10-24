-- 08: Owner transfer: fail-closed policy, explicit reauthentication, atomic swap, replay, stale/expired/competing
-- offers, invalid recipients, exactly one Owner. NOTE: the reauthentication tests fabricate the amr CLAIM in the
-- token; they prove the database enforces the claim, NOT that Google/central identity actually forces a fresh login.
select set_config('t.file', '08_owner_transfer', false);
begin;

select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'team', 'synthetic');
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000c3', 'synthetic-three', 'Synthetic Org Three');
insert into auth.users (id, email, raw_user_meta_data)
  values (t.u(21), 'outsider21@example.invalid', '{"display_name":"Outsider 21","org_id":"00000000-0000-4000-8001-0000000000c3"}');
-- u5 suspended, u6 pending (not accepted); u3 u4 are plain accepted members.
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(5);
update lv_private.hub_memberships set status = 'pending' where hub_id = t.org_a() and account_id = t.u(6);

create function pg_temp.one_owner(p_hub uuid) returns boolean language sql as $$
  select (select count(*) from lv_private.hub_memberships m where m.hub_id = p_hub and lv_private.is_owner(p_hub, m.account_id)) = 1
     and (select count(*) from lv_private.hubs h where h.id = p_hub and h.owner_account_id is not null) = 1 $$;

-- ---- fail closed while policy is undecided
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.check('policy undecided: start fails closed even with a fresh sign-in', public.lv_owner_transfer_start(t.org_a(), t.u(3))->'error'->>'code' = 'lv_policy_undecided');
select t.check('...and names what is missing', public.lv_owner_transfer_start(t.org_a(), t.u(3))->'error'->'details'->'missing' @> '["owner_transfer.reauth"]'::jsonb);
select t.as_pg();
select t.check('nothing was created while undecided', t.q('select count(*) from lv_private.owner_transfer_offers') = '0');

-- Synthetic policy for the tests ONLY (the migration leaves it unset).
update lv_private.policy set value = '{"max_age_seconds": 300, "methods": ["oauth"]}'::jsonb where key = 'owner_transfer.reauth';
update lv_private.policy set value = '3600'::jsonb where key = 'owner_transfer.offer_ttl_seconds';

-- ---- who may start
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('a plain member cannot start', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(4))) = 'lv_forbidden');
select t.as_pg();
-- A role manager holding EVERY delegable capability is still not the Owner.
insert into lv_private.roles (hub_id, name) values (t.org_a(), 'Everything');
insert into lv_private.role_capabilities select r.id, c.id from lv_private.roles r, lv_private.capabilities c where r.name = 'Everything';
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(4), r.id from lv_private.roles r where r.name = 'Everything';
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('a member holding every delegable capability still cannot start', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(3))) = 'lv_forbidden');
select t.as_user_authed(t.u(11), 'oauth', 5);
select t.check('another Hub''s Owner cannot start on this Hub', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(3))) = 'lv_forbidden');
select t.as_anon();
select t.check('anon: unauthenticated', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(3))) = 'lv_unauthenticated');

-- ---- reauthentication is explicit
select t.as_user(t.u(2));
select t.check('no authentication claim: reauthentication required', public.lv_owner_transfer_start(t.org_a(), t.u(3))->'error'->'details'->>'reason' = 'reauthentication_required');
select t.as_user_authed(t.u(2), 'oauth', 1000);
select t.check('stale sign-in (1000s > 300s): reauthentication required', public.lv_owner_transfer_start(t.org_a(), t.u(3))->'error'->'details'->>'reason' = 'reauthentication_required');
select t.as_user_authed(t.u(2), 'password', 5);
select t.check('fresh sign-in by a method the policy does not allow: required', public.lv_owner_transfer_start(t.org_a(), t.u(3))->'error'->'details'->>'reason' = 'reauthentication_required');
select t.as_pg();
select t.check('nothing was created by refused attempts', t.q('select count(*) from lv_private.owner_transfer_offers') = '0');

-- ---- invalid recipients
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.check('cannot transfer to yourself', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(2))) = 'lv_conflict');
select t.check('unknown account is not an accepted member', t.code(public.lv_owner_transfer_start(t.org_a(), gen_random_uuid())) = 'lv_not_member');
select t.check('suspended member is not eligible', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(5))) = 'lv_not_member');
select t.check('pending applicant is not eligible', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(6))) = 'lv_not_member');
select t.check('a non-member is not eligible', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(21))) = 'lv_not_member');
select t.check('a member of another Hub only is not eligible', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(11))) = 'lv_not_member');
select t.check('null recipient is invalid_input', t.code(public.lv_owner_transfer_start(t.org_a(), null)) = 'lv_invalid_input');
select t.check('unknown Hub is not_found', t.code(public.lv_owner_transfer_start(gen_random_uuid(), t.u(3))) = 'lv_not_found');
select t.as_pg();
select t.check('invalid recipients created no offers', t.q('select count(*) from lv_private.owner_transfer_offers') = '0');

-- ---- a valid offer; one open offer per Hub
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.put('offer1', public.lv_owner_transfer_start(t.org_a(), t.u(3))->'data'->>'offer_id');
select t.check('offer created with an expiry about one hour out', t.id('offer1') is not null);
select t.as_pg();
select t.check('the offer expires about 3600 seconds out', t.q(format('select extract(epoch from expires_at - created_at)::int from lv_private.owner_transfer_offers where id = %L', t.id('offer1'))) between '3590' and '3610');
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.check('a competing offer to someone else is refused while one is open', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(4))) = 'lv_conflict');
select t.check('the same recipient again is also refused (one open offer)', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(3))) = 'lv_conflict');
select t.as_pg();
select t.check('the database allows only one pending offer per Hub',
  t.raises($$insert into lv_private.owner_transfer_offers (hub_id, from_account_id, to_account_id, expires_at) values (t.org_a(), t.u(2), t.u(4), now() + interval '1 hour')$$, '23505'));

-- ---- acceptance: only the addressed recipient, with fresh authentication
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('someone else cannot accept', t.code(public.lv_owner_transfer_accept(t.id('offer1'))) = 'lv_forbidden');
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.check('the Owner cannot accept their own offer', t.code(public.lv_owner_transfer_accept(t.id('offer1'))) = 'lv_forbidden');
select t.as_user_authed(t.u(3), 'oauth', 5000);
select t.check('the recipient needs fresh authentication too', public.lv_owner_transfer_accept(t.id('offer1'))->'error'->'details'->>'reason' = 'reauthentication_required');
select t.as_user(t.u(3));
select t.check('...and no claim at all is refused', public.lv_owner_transfer_accept(t.id('offer1'))->'error'->'details'->>'reason' = 'reauthentication_required');
select t.check('unknown offer is not_found', t.code(public.lv_owner_transfer_accept(gen_random_uuid())) = 'lv_not_found');
select t.as_pg();
select t.check('refused attempts did not move ownership', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(2));
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('before the swap: u4 holds Everything, not ownership', t.q(format('select lv_private.is_owner(%L, %L)', t.org_a(), t.u(4))) = 'false');
select t.as_pg();
select t.check('before the swap: exactly one Owner', pg_temp.one_owner(t.org_a()));

select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('recipient with fresh authentication accepts', public.lv_owner_transfer_accept(t.id('offer1'))->'data'->>'owner_account_id' = t.u(3)::text);
select t.as_pg();
select t.check('after the swap: u3 is the Owner', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(3));
select t.check('after the swap: exactly one Owner', pg_temp.one_owner(t.org_a()));
select t.check('the previous Owner is still an accepted member, now ordinary', t.q($$select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(2)$$) = 'accepted' and not lv_private.is_owner(t.org_a(), t.u(2)));
select t.check('the offer is recorded as accepted', t.q(format('select status from lv_private.owner_transfer_offers where id = %L', t.id('offer1'))) = 'accepted');
select t.check('the previous Owner keeps no authority', lv_private.held_capabilities(t.org_a(), t.u(2)) = '{}');
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.check('the previous Owner can no longer start a transfer', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(4))) = 'lv_forbidden');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('the new Owner context says so', (public.lv_my_context()->'data'->'memberships'->0->>'is_owner')::boolean);

-- replay is idempotent
select t.check('replaying the accept returns the same result', public.lv_owner_transfer_accept(t.id('offer1'))->'data'->>'owner_account_id' = t.u(3)::text);
select t.as_pg();
select t.check('replay did not create a second swap or another Owner', pg_temp.one_owner(t.org_a()) and t.q($$select count(*) from lv_private.owner_transfer_offers where status = 'accepted'$$) = '1');
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('a replay by someone else is still forbidden', t.code(public.lv_owner_transfer_accept(t.id('offer1'))) = 'lv_forbidden');

-- ---- cancel / decline / stale / expired / suspended recipient
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.put('offer2', public.lv_owner_transfer_start(t.org_a(), t.u(4))->'data'->>'offer_id');
select t.as_user_authed(t.u(2), 'oauth', 5);
select t.check('a stranger cannot cancel', t.code(public.lv_owner_transfer_cancel(t.id('offer2'))) = 'lv_forbidden');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('the Owner cancels', t.code(public.lv_owner_transfer_cancel(t.id('offer2'))) = 'ok');
select t.check('cancelling twice is lifecycle_invalid', t.code(public.lv_owner_transfer_cancel(t.id('offer2'))) = 'lv_lifecycle_invalid');
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('accepting a cancelled offer is lifecycle_invalid', public.lv_owner_transfer_accept(t.id('offer2'))->'error'->>'code' = 'lv_lifecycle_invalid');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.put('offer3', public.lv_owner_transfer_start(t.org_a(), t.u(4))->'data'->>'offer_id');
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('the recipient declines', t.code(public.lv_owner_transfer_cancel(t.id('offer3'))) = 'ok');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('a new offer is possible after a decline', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(4))) = 'ok');
select t.put('offer4', t.q($$select id from lv_private.owner_transfer_offers where status = 'pending'$$));
select t.as_pg();

-- stale: the Owner recorded on the offer is no longer the Owner
update lv_private.owner_transfer_offers set from_account_id = t.u(2) where id = t.id('offer4');
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('a stale offer is refused', public.lv_owner_transfer_accept(t.id('offer4'))->'error'->'details'->>'status' = 'superseded');
select t.as_pg();
select t.check('...marked superseded and ownership unchanged', t.q(format('select status from lv_private.owner_transfer_offers where id = %L', t.id('offer4'))) = 'superseded'
  and (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(3));

-- expired
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.put('offer5', public.lv_owner_transfer_start(t.org_a(), t.u(4))->'data'->>'offer_id');
select t.as_pg();
update lv_private.owner_transfer_offers set expires_at = now() - interval '1 second' where id = t.id('offer5');
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('an expired offer cannot be accepted', public.lv_owner_transfer_accept(t.id('offer5'))->'error'->'details'->>'status' = 'expired');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.put('offer6', public.lv_owner_transfer_start(t.org_a(), t.u(4))->'data'->>'offer_id');
select t.as_pg();
update lv_private.owner_transfer_offers set expires_at = now() - interval '1 second' where id = t.id('offer6');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('an expired open offer does not block a new one (it is expired on the spot)', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(4))) = 'ok');
select t.as_pg();
select t.check('...and the old one is recorded as expired', t.q(format('select status from lv_private.owner_transfer_offers where id = %L', t.id('offer6'))) = 'expired');

-- recipient no longer eligible at acceptance time
select t.put('offer7', t.q($$select id from lv_private.owner_transfer_offers where status = 'pending'$$));
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(4);
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('a recipient who was suspended meanwhile cannot accept', t.code(public.lv_owner_transfer_accept(t.id('offer7'))) = 'lv_not_member');
select t.as_pg();
select t.check('...ownership unchanged', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(3) and pg_temp.one_owner(t.org_a()));

-- a recipient's roles dissolve into direct ownership
update lv_private.hub_memberships set status = 'accepted' where hub_id = t.org_a() and account_id = t.u(4);
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(4), r.id from lv_private.roles r where r.name = 'Everything';
select t.check('precondition: u4 holds a role again', t.q('select count(*) from lv_private.role_assignments where account_id = ' || quote_literal(t.u(4))) = '1');
select t.as_user_authed(t.u(4), 'oauth', 5);
select t.check('transfer to a role holder succeeds', t.code(public.lv_owner_transfer_accept(t.id('offer7'))) = 'ok');
select t.as_pg();
select t.check('...their role assignments are gone (authority is direct now)', t.q('select count(*) from lv_private.role_assignments where account_id = ' || quote_literal(t.u(4))) = '0');
select t.check('...still exactly one Owner, and it is u4', pg_temp.one_owner(t.org_a()) and (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(4));

-- ---- the Owner cannot be changed by any other route
select t.check('SQL cannot reassign the Owner', t.raises($$update lv_private.hubs set owner_account_id = t.u(3) where id = t.org_a()$$, '42501'));
select t.check('the old session flag no longer authorizes anything',
  t.raises($$set lv.owner_transfer = 'on'; update lv_private.hubs set owner_account_id = t.u(3) where id = t.org_a()$$, '42501'));
select t.check('a guessed token authorizes nothing',
  t.raises($$select set_config('lv.owner_change_token', 'guess', false); update lv_private.hubs set owner_account_id = t.u(3) where id = t.org_a()$$, '42501'));
select t.check('the Owner membership is still protected', t.raises($$delete from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(4)$$, '42501'));
select t.check('leaving no token behind', t.q('select count(*) from lv_private.owner_change_tokens') = '0');
select t.as_user_authed(t.u(3), 'oauth', 5);
select t.check('direct: offers are unreadable to the API roles', t.raises('select * from lv_private.owner_transfer_offers', '42501'));
select t.check('direct: policy is unreadable to the API roles', t.raises('select * from lv_private.policy', '42501'));
select t.check('direct: policy cannot be changed by the API roles', t.raises($$update lv_private.policy set value = '{"max_age_seconds": 999999}'::jsonb$$, '42501'));

-- ---- Hub B was never touched
select t.as_pg();
select t.check('Hub B Owner unchanged', (select owner_account_id from lv_private.hubs where id = t.org_b()) = t.u(11));

rollback;
