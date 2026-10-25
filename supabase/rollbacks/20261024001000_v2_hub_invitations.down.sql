-- Rollback of 20261024001000_v2_hub_invitations. Removes invitations and their redemption log.
-- Memberships created by redeeming an invitation are real product data and are NOT removed.
begin;
drop function if exists public.lv_invite_redeem(text);
drop function if exists public.lv_invite_preview(text);
drop function if exists public.lv_invite_revoke(uuid);
drop function if exists public.lv_invite_list(uuid);
drop function if exists public.lv_invite_create(uuid, int, timestamptz, text);
drop function if exists lv_private.invite_json(lv_private.hub_invites);
drop function if exists lv_private.invite_hash(text);
drop function if exists lv_private.invite_status(lv_private.hub_invites);
drop table if exists lv_private.hub_invite_redemptions;
drop table if exists lv_private.hub_invites;
commit;
