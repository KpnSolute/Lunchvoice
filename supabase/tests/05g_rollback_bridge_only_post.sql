-- After rolling back ONLY migration 7: migrations 1 to 6 must work exactly as before, and legacy data is untouched.
select t.check('bridge tables and functions are gone', to_regclass('lv_private.legacy_session_map') is null and to_regclass('lv_private.legacy_bridge_issues') is null
  and not exists (select 1 from pg_proc where proname like 'legacy\_%' and pronamespace = 'lv_private'::regnamespace));
select t.check('the legacy_historical column is gone', not exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'campaigns' and column_name = 'legacy_historical'));
select t.check('native participation survives', t.q('select count(*) from lv_private.campaign_participation') = '1');
begin;
select t.as_user(t.u(2));
select t.check('campaign RPCs still work', t.code(public.lv_campaign_list(t.org_a())) = 'ok');
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
