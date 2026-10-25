-- After rolling back ONLY migration 10: invitations are gone; migrations 1 to 9 work as before.
select t.check('invitation tables are gone', to_regclass('lv_private.hub_invites') is null and to_regclass('lv_private.hub_invite_redemptions') is null);
select t.check('invitation functions are gone', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'lv\_invite\_%'));
select t.check('beta self-service still exists', to_regclass('lv_private.beta_applications') is not null);
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
