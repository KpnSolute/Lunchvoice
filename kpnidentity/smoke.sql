-- Post-deploy smoke for KpnIdentity. The kpni triggers run inside GoTrue's insert into auth.users, so an error
-- in them blocks every sign-up. Run this right after applying the migration; it changes nothing (rolls back).
-- Every row must show ok = true.
begin;
insert into auth.users (id, email, email_confirmed_at)
  values ('99999999-9999-4999-8999-999999999999', 'smoke@example.invalid', now());
select 'profile created with subject = id' as step,
       exists (select 1 from kpni.profiles where auth_user_id = '99999999-9999-4999-8999-999999999999'
                 and subject = auth_user_id and email_verified) as ok;
select 'account_created event written' as step,
       exists (select 1 from kpni.security_events where subject = '99999999-9999-4999-8999-999999999999'
                 and event = 'account_created') as ok;
delete from auth.users where id = '99999999-9999-4999-8999-999999999999';
select 'profile removed with the auth user' as step,
       not exists (select 1 from kpni.profiles where auth_user_id = '99999999-9999-4999-8999-999999999999') as ok;
rollback;
