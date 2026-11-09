-- Rollback for 000025_v2_suspended_participation: suspended accounts may answer and join again (000023 behaviour).
begin;
drop trigger if exists participation_account_suspension_guard on lv.participation;
drop trigger if exists hub_memberships_account_suspension_guard on lv.hub_memberships;
drop function if exists lv.suspended_account_guard();
commit;
