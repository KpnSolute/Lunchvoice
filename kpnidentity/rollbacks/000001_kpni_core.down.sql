-- Rolls back 000001_kpni_core. Removes the auth.users triggers first so GoTrue inserts can never reach a
-- missing function, then drops the kpni schema. Leaves the citext/pgcrypto extensions and auth.* untouched.
drop trigger if exists kpni_on_auth_user_created on auth.users;
drop trigger if exists kpni_on_auth_user_updated on auth.users;
drop schema if exists kpni cascade;
-- Restore PostgreSQL's built-in default that the migration revoked globally.
alter default privileges grant execute on functions to public;
