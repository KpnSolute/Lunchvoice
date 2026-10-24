-- After rolling back ONLY migration 6: migrations 1 to 5 must work exactly as before.
select t.check('waitlist, throttle, salt and settings audit are gone', to_regclass('lv_private.waitlist') is null and to_regclass('lv_private.waitlist_attempts') is null
  and to_regclass('lv_private.secrets') is null and to_regclass('lv_private.hub_settings_events') is null);
select t.check('waitlist and settings RPCs are gone', not exists (select 1 from pg_proc where proname in ('lv_waitlist_join', 'lv_hub_settings_update')));
select t.check('the display-name column and waitlist policy key are gone', not exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'hubs' and column_name = 'display_name')
  and t.q($$select count(*) from lv_private.policy where key = 'waitlist.open'$$) = '0');
select t.check('analytics policy keys remain', t.q($$select count(*) from lv_private.policy where key like 'analytics.%'$$) = '3');
begin;
select t.as_anon();
select t.check('the Hub card still works and shows the organization name', public.lv_hub_public('lioncafe')->'data'->>'name' = 'Miami Job Corps Cafeteria');
select t.as_user(t.u(3));
select t.check('the context still works with the organization name', public.lv_my_context()->'data'->'memberships'->0->>'name' = 'Miami Job Corps Cafeteria');
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
