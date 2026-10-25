-- Applied ONCE after all migrations, before any test, to the throwaway database only (never part of a migration).
-- 1. Which token issuers this test database trusts (production sets only the verified central issuer).
update lv_private.policy set value = '["urn:lunchvoice:legacy-auth-user","https://auth.test.invalid"]'::jsonb where key = 'identity.trusted_issuers';
-- 2. FIXTURE HELPER, not product behaviour: many older tests create users by inserting into auth.users and expect the old signup mirror
--    (account + identity + membership of the user's legacy organization when it is a Hub). The product no longer does this; the helper
--    only keeps those fixtures short. Tests that exercise the product's behaviour drop it inside their transaction.
create trigger t_profiles_mirror after insert on public.profiles for each row execute function lv_private.sync_profile();
