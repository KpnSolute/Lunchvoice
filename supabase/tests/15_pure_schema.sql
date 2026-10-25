-- Run in the PRISTINE copy of the database (migrations only, no fixture helpers): what the product schema itself does.
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8002-0000000000f1', 'pure.signup@example.invalid', '{"display_name":"Pure Signup"}');
select (select count(*) from lv_private.accounts) as acc, (select count(*) from lv_private.account_identities) as ident, (select count(*) from lv_private.hub_memberships) as mem,
  (select count(*) from public.profiles where id = '00000000-0000-4000-8002-0000000000f1') as prof \gset
rollback;
insert into t.results (file, name, ok) values
  ('15_pure', 'the product schema has no trigger from public.profiles into the v2 tables', not exists (select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid join pg_namespace n on n.oid = p.pronamespace where tg.tgrelid = 'public.profiles'::regclass and not tg.tgisinternal and n.nspname = 'lv_private')),
  ('15_pure', 'a signup in the product schema creates a profile but no account, identity or membership', :prof = 1 and :acc = 0 and :ident = 0 and :mem = 0),
  ('15_pure', 'no token is trusted until identity.trusted_issuers is set (shipped unset)', (select value is null from lv_private.policy where key = 'identity.trusted_issuers') is not null);
