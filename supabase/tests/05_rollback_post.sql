select t.check('lv_private schema is gone', not exists (select 1 from pg_namespace where nspname = 'lv_private'));
select t.check('no lv_* functions remain', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'lv\_%'));
select t.check('signup mirror trigger is gone', not exists (select 1 from pg_trigger where tgname = 'profiles_sync_v2'));
select t.check('legacy data unchanged by backfill + rollback', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
begin;
insert into auth.users (id, email, raw_user_meta_data) values (t.u(40), 'after.rollback@example.invalid', '{"display_name":"After Rollback"}');
select t.check('legacy signup still works after rollback', exists (select 1 from public.profiles where id = t.u(40)));
select t.check('v2 RPCs are gone', t.raises('select public.lv_my_context()', '42883'));
commit;
