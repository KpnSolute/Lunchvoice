-- 02: LionCafe -> Hub backfill: required Owner, atomic, repeatable, recoverable, reconcilable, non-destructive.
select set_config('t.file', '02_backfill', false);
begin;

-- Owner is a required explicit input. It is never inferred (not from email, role or "first admin").
select t.check('NULL owner is rejected', t.raises($$select lv_private.backfill_org_hub(t.org_a(), null)$$));
select t.check('unknown owner is rejected', t.raises($$select lv_private.backfill_org_hub(t.org_a(), gen_random_uuid())$$));
select t.check('owner from another organization is rejected', t.raises($$select lv_private.backfill_org_hub(t.org_a(), t.u(11))$$));
select t.check('unknown organization is rejected', t.raises($$select lv_private.backfill_org_hub(gen_random_uuid(), t.u(2))$$));
select t.check('rejected calls leave nothing behind',
  (select count(*) from lv_private.hubs) = 0 and (select count(*) from lv_private.accounts) = 0 and (select count(*) from lv_private.hub_memberships) = 0);

-- Interruption: crash part-way through; everything rolls back, then a retry succeeds.
create function t.boom() returns trigger language plpgsql as $$
begin
  if (select count(*) from lv_private.hub_memberships) >= 3 then raise exception 'simulated crash'; end if;
  return new;
end $$;
create trigger t_boom before insert on lv_private.hub_memberships for each row execute function t.boom();
select t.check('a mid-run crash raises', t.raises($$select lv_private.backfill_org_hub(t.org_a(), t.u(2))$$));
select t.check('a mid-run crash leaves zero partial state',
  (select count(*) from lv_private.hubs) = 0 and (select count(*) from lv_private.accounts) = 0
  and (select count(*) from lv_private.account_identities) = 0 and (select count(*) from lv_private.hub_memberships) = 0);
drop trigger t_boom on lv_private.hub_memberships;
drop function t.boom();

create temp table rep as select lv_private.backfill_org_hub(t.org_a(), t.u(2)) as r;
select t.check('first run reports 6 profiles, 6 accounts, 6 memberships and a new Hub',
  (select (r->>'profiles_in_org')::int = 6 and (r->>'accounts_created')::int = 6 and (r->>'memberships_created')::int = 6
          and (r->>'hub_created')::boolean from rep));
select t.check('the Hub IS the organization (same id, no duplicate)',
  (select count(*) from lv_private.hubs) = 1 and exists (select 1 from lv_private.hubs where id = t.org_a()));
select t.check('every account id equals its legacy profile id',
  (select count(*) from lv_private.accounts a join public.profiles p on p.id = a.id where p.org_id = t.org_a()) = 6);
select t.check('every legacy member is an accepted member', (select count(*) from lv_private.hub_memberships where hub_id = t.org_a() and status = 'accepted') = 6);
select t.check('the supplied Owner is the Owner', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(2));
select t.check('the legacy staff admin is NOT made Owner', (select owner_account_id from lv_private.hubs where id = t.org_a()) <> t.u(1));
select t.check('accounts with the same email are NOT merged',
  (select count(distinct account_id) from lv_private.account_identities where auth_user_id in (t.u(4), t.u(5))) = 2);
select t.check('a blank legacy display name gets a safe fallback', (select display_name from lv_private.accounts where id = t.u(6)) = 'student.six');
select t.check('other organizations are untouched',
  not exists (select 1 from lv_private.hubs where id = t.org_b()) and not exists (select 1 from lv_private.account_identities where auth_user_id = t.u(11)));
select t.check('legacy data is byte-identical after the backfill', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));

-- Deep links and ids survive: the legacy slug resolves, case-insensitively, to the same id.
select t.check('legacy slug resolves to the original org id (mixed case)', (public.lv_hub_public('LionCafe')->'data'->>'hub_id')::uuid = t.org_a());
select t.check('legacy slug resolves to the original org id (lower case)', (public.lv_hub_public('lioncafe')->'data'->>'hub_id')::uuid = t.org_a());

-- Repeatable: a second run changes nothing.
drop table rep;
create temp table rep as select lv_private.backfill_org_hub(t.org_a(), t.u(2)) as r;
select t.check('re-run creates nothing',
  (select (r->>'accounts_created')::int = 0 and (r->>'identities_created')::int = 0 and (r->>'memberships_created')::int = 0
          and not (r->>'hub_created')::boolean from rep));
select t.check('re-run leaves exactly one Hub and six memberships',
  (select count(*) from lv_private.hubs) = 1 and (select count(*) from lv_private.hub_memberships) = 6);
select t.check('re-run cannot change the Owner', t.raises($$select lv_private.backfill_org_hub(t.org_a(), t.u(3))$$));
select t.check('the Owner is unchanged after a rejected change', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(2));

-- A re-run never undoes later decisions.
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(4);
update lv_private.hub_memberships set status = 'removed' where hub_id = t.org_a() and account_id = t.u(5);
select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select t.check('re-run keeps a suspension', (select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(4)) = 'suspended');
select t.check('re-run keeps a removal', (select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(5)) = 'removed');

-- Recovery: a membership lost to a partial earlier run is restored without touching anything else.
delete from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(6);
select t.check('reconcile reports the gap', (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_membership')::int = 1);
select t.check('re-run restores exactly the missing membership', (lv_private.backfill_org_hub(t.org_a(), t.u(2))->>'memberships_created')::int = 1);
select t.check('reconcile reports no gaps',
  (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_membership')::int = 0
  and (lv_private.reconcile_org_hub(t.org_a())->>'profiles_without_account')::int = 0);
select t.check('reconcile points total matches legacy points',
  (lv_private.reconcile_org_hub(t.org_a())->>'legacy_points_total')::int = 160);

-- A user who signs up after the Hub exists is mirrored and joins as an accepted legacy member; a backfill re-run adds no duplicate.
insert into auth.users (id, email, raw_user_meta_data) values (t.u(23), 'late.signup@example.invalid', '{"display_name":"Late Signup"}');
select t.check('late signup becomes an accepted member', (select status from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(23)) = 'accepted');
select t.check('late signup is labelled as a legacy signup', (select source from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(23)) = 'legacy_signup');
select t.check('re-run after a late signup adds no duplicate', (lv_private.backfill_org_hub(t.org_a(), t.u(2))->>'memberships_created')::int = 0);

-- The audit trail recorded the changes with the previous status.
select t.check('audit trail has the suspension',
  exists (select 1 from lv_private.hub_membership_events where account_id = t.u(4) and from_status = 'accepted' and to_status = 'suspended'));

rollback;
