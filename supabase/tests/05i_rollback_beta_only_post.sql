-- After rolling back ONLY migration 9: the beta tables, functions and policy keys are gone; migrations 1 to 8 work as before.
select t.check('beta tables are gone', to_regclass('lv_private.beta_applications') is null and to_regclass('lv_private.beta_application_events') is null);
select t.check('beta functions are gone', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('lv_hub_create', 'lv_beta_apply', 'lv_beta_decide', 'lv_beta_my_application', 'lv_beta_applications_list')));
select t.check('beta policy keys are gone', t.q($$select count(*) from lv_private.policy where key in ('beta.cap', 'beta.terms', 'slug.reserved')$$) = '0');
select t.check('the grant source constraint is back to the earlier set', not exists (select 1 from pg_constraint where conname = 'entitlement_grants_source_check' and pg_get_constraintdef(oid) like '%beta%'));
select t.check('the identity model still works', exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'account_identities' and column_name = 'issuer'));
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
