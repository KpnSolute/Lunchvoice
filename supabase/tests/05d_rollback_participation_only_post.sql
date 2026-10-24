-- After rolling back ONLY migration 4: migrations 1 to 3 must work exactly as before.
select t.check('answer and guest tables are gone', to_regclass('lv_private.campaign_answers') is null and to_regclass('lv_private.campaign_answer_values') is null and to_regclass('lv_private.campaign_guest_grants') is null);
select t.check('participation RPCs are gone', not exists (select 1 from pg_proc where proname in ('lv_submit_response', 'lv_my_receipts', 'lv_campaign_resolve')));
select t.check('the participation ledger survives (the gate still reads it)', t.q('select count(*) from lv_private.campaign_participation') = '1');
select t.check('receipt columns are gone', not exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'campaign_participation' and column_name in ('receipt_id', 'audience', 'response_id', 'points')));
select t.check('questions are editable again at the migration-3 level (no freeze trigger)', not exists (select 1 from pg_trigger where tgname in ('campaign_questions_frozen', 'campaigns_revision_frozen')));
begin;
select t.as_user(t.u(2));
select t.check('campaign RPCs still work', t.code(public.lv_campaign_list(t.org_a())) = 'ok');
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
