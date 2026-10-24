-- Rollback for 20261024000100_v2_identity_hubs_memberships.sql. NOT a migration: it is never applied
-- automatically. Run it deliberately (in one transaction) only if the v2 identity foundation must be removed.
--
-- Effect: removes every object the migration created. No legacy table, row, policy or grant is touched, so legacy
-- login, surveys, rewards and history are unaffected. v2 data (accounts, Hubs, memberships, audit events) is
-- DISCARDED; if any of it matters, export lv_private.* first. The profile signup mirror trigger is removed.

begin;

drop trigger if exists profiles_sync_v2 on public.profiles;

drop function if exists public.lv_my_context();
drop function if exists public.lv_hub_public(text);
drop function if exists public.lv_member_count(uuid);
drop function if exists public.lv_join_hub(uuid, text);
drop function if exists public.lv_decide_join(uuid, uuid, text);
drop function if exists public.lv_leave_hub(uuid);
drop function if exists public.lv_remove_member(uuid, uuid);
drop function if exists public.lv_suspend_member(uuid, uuid);
drop function if exists public.lv_members_list(uuid);

-- Tables, helpers, triggers and operator functions all live in this schema.
drop schema if exists lv_private cascade;

commit;
