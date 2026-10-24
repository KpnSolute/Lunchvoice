-- 05: rollback scripts remove what they created and leave legacy untouched. The runner concatenates this file with
-- the down script(s) and a post file into one psql session, against data that includes roles and assignments.
select set_config('t.file', '05_rollback', false);
begin;
select lv_private.backfill_org_hub(t.org_a(), t.u(2));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'starter', 'synthetic');
select t.as_user(t.u(2));
select public.lv_role_create(t.org_a(), 'Moderator', null, array['admin.members.admit']);
select public.lv_role_assign(t.q($$select id from lv_private.roles where hub_id = t.org_a()$$)::uuid, t.u(3));
select t.as_pg();
select t.check('precondition: v2 data, a role and an assignment exist before rollback',
  (select count(*) from lv_private.hub_memberships) = 6 and t.q('select count(*) from lv_private.role_assignments') = '1');
commit;
