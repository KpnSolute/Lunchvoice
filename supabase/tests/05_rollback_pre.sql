-- 05: rollback script removes the v2 identity foundation completely and leaves legacy untouched.
-- The runner concatenates: this file + the down script + 05_rollback_post.sql into one psql session.
select set_config('t.file', '05_rollback', false);
begin;
select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select t.check('precondition: v2 data exists before rollback', (select count(*) from lv_private.hub_memberships) = 6);
commit;
