-- 06: reconciliation + idempotent repair of what the profile-signup mirror may have missed.
select set_config('t.file', '06_repair', false);
begin;

select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));

-- Simulate a mirror that did not run: signups happen with the trigger off. Legacy signup must still work.
alter table public.profiles disable trigger t_profiles_mirror;
insert into auth.users (id, email, raw_user_meta_data) values
  (t.u(31), 'missed.one@example.invalid', '{"display_name":"Missed One"}'),
  (t.u(32), 'missed.two@example.invalid', '{"display_name":"Missed Two"}'),
  (t.u(33), 'missed.three@example.invalid', '{"display_name":"Missed Three"}'),
  (t.u(34), 'other.org.missed@example.invalid', jsonb_build_object('display_name', 'Other Org Missed', 'org_id', t.org_b()));
alter table public.profiles enable trigger t_profiles_mirror;
select t.check('legacy signup works while the mirror is off', (select count(*) from public.profiles where id in (t.u(31), t.u(32), t.u(33), t.u(34))) = 4);

-- Prior decisions on people who exist in v2: they must survive the repair.
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(4);
update lv_private.hub_memberships set status = 'removed' where hub_id = t.org_a() and account_id = t.u(5);
update lv_private.hub_memberships set status = 'left' where hub_id = t.org_a() and account_id = t.u(6);

select t.check('reconcile finds the missed accounts', (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_account')::int = 3);
select t.check('reconcile finds the missed memberships', (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_membership')::int = 3);

select t.check('repair requires an existing Hub', t.raises($$select lv_private.repair_org_hub(gen_random_uuid())$$));
create temp table rep as select lv_private.repair_org_hub(t.org_a()) as r;
select t.check('repair creates the three missed accounts, identities and memberships',
  (select (r->>'accounts_created')::int = 3 and (r->>'identities_created')::int = 3 and (r->>'memberships_created')::int = 3 from rep));
select t.check('repaired people are accepted legacy members of the right Hub',
  (select count(*) from lv_private.hub_memberships where hub_id = t.org_a() and account_id in (t.u(31), t.u(32), t.u(33)) and status = 'accepted' and source = 'legacy_repair') = 3);
select t.check('repaired accounts keep the legacy id', (select count(*) from lv_private.accounts where id in (t.u(31), t.u(32), t.u(33))) = 3);
select t.check('repair never grants access to someone from another organization',
  not exists (select 1 from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(34)));
select t.check('repair never touches another organization (no account for its missed user)',
  not exists (select 1 from lv_private.accounts where id = t.u(34)));
select t.check('repair preserves a suspension', (select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(4)) = 'suspended');
select t.check('repair preserves a removal', (select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(5)) = 'removed');
select t.check('repair preserves a departure', (select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(6)) = 'left');
select t.check('repair never changes the Owner', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(2));
select t.check('reconcile is clean afterwards',
  (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_account')::int = 0 and (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_membership')::int = 0);

-- Idempotent.
drop table rep;
create temp table rep as select lv_private.repair_org_hub(t.org_a()) as r;
select t.check('second repair creates nothing', (select (r->>'accounts_created')::int = 0 and (r->>'identities_created')::int = 0 and (r->>'memberships_created')::int = 0 from rep));

-- The API roles cannot run it.
select t.as_user(t.u(3));
select t.check('repair is not callable by authenticated', t.raises($$select lv_private.repair_org_hub(t.org_a())$$, '42501'));
select t.as_anon();
select t.check('repair is not callable by anon', t.raises($$select lv_private.repair_org_hub(t.org_a())$$, '42501'));
select t.as_pg();

select t.check('legacy data unchanged except the signups this test added',
  (t.legacy_fingerprint()->>'points_total') = ((select fp from t.snapshot where name = 'pre')->>'points_total'));

rollback;
