-- After rolling back ONLY migration 5: migrations 1 to 4 must work exactly as before.
select t.check('analytics tables and RPC are gone', to_regclass('lv_private.analytics_releases') is null and to_regclass('lv_private.analytics_query_log') is null
  and not exists (select 1 from pg_proc where proname = 'lv_analytics_query'));
select t.check('analytics policy keys are gone, participation reward key remains', t.q($$select count(*) from lv_private.policy where key like 'analytics.%'$$) = '0'
  and t.q($$select count(*) from lv_private.policy where key = 'participation.reward'$$) = '1');
select t.check('answers and the participation ledger survive', t.q('select count(*) from lv_private.campaign_participation') = '1');
begin;
select t.as_user(t.u(3));
select t.check('receipts still work', public.lv_my_receipts()->'data'->'receipts' is not null);
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
