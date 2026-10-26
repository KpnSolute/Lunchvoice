-- Rollback for 000007_v2_read_api. Restores the 000006 lv_my_context body.
drop function if exists lv_api.lv_invite_preview(text);
drop function if exists lv_api.lv_invite_list(uuid);
drop function if exists lv_api.lv_member_list(uuid);
drop function if exists lv_api.lv_campaign_get(uuid);
drop function if exists lv_api.lv_campaign_list(uuid);
drop function if exists lv_api.lv_hub_get(text);
drop function if exists lv_api.lv_beta_status();

create or replace function lv_api.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_ci jsonb := lv.caller_identity();
begin
  if v_account is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_unauthenticated', 'message', 'Sign in with KpnIdentity first.'));
  end if;
  return jsonb_build_object('ok', true, 'account_id', v_account,
    'display_name', (select a.display_name from lv.accounts a where a.id = v_account),
    'email_verified', (select i.email_verified_at is not null from lv.account_identities i
                        where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name, 'is_owner', h.owner_account_id = v_account))
        from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
       where m.account_id = v_account and m.status = 'accepted'), jsonb_build_array()));
end;
$$;

drop function if exists lv.roles_of(uuid, uuid);
drop function if exists lv.capabilities_of(uuid, uuid);
drop function if exists lv.err(text, text);
alter table lv.hubs drop constraint if exists hubs_slug_no_double_hyphen;
drop trigger if exists hubs_forbid_reserved_slug on lv.hubs;
drop function if exists lv.forbid_reserved_slug();
delete from lv.reserved_slugs where reason in ('platform route', 'static path', 'planned feature', 'brand')
  and slug not in ('admin', 'api', 'app', 'auth', 'billing', 'discover', 'discovery', 'login', 'pricing', 'signup', 'support', 'www');
