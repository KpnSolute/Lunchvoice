-- 000050: a signed-in person who opens a survey link (/c/<join code>) answers with their account, not as a guest.
-- The guest read (lv_guest_campaign_get) deliberately omits the Campaign id. This read returns it only to a signed-in
-- caller who may take part (lv.can_participate: member in the audience, link-open, or invited) or who manages it;
-- everyone else gets the same lv_not_found as an unknown code, so a code never confirms a Campaign it would not open.
-- Rollback: supabase/rollbacks/000050_v2_campaign_by_code.down.sql.
begin;

create function lv_api.lv_campaign_by_code(p_join_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  select x.id, x.hub_id, x.status into c from lv.campaigns x
   where x.join_code = upper(btrim(coalesce(p_join_code, ''))) and x.join_code is not null;
  if c.id is null
     or not (lv.can_participate(c.id, v_account) or lv.has_capability(v_account, c.hub_id, 'campaign.manage')) then
    return lv.err('lv_not_found', 'No survey uses that code.');
  end if;
  return jsonb_build_object('ok', true, 'campaign_id', c.id);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

revoke all on function lv_api.lv_campaign_by_code(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv_api.lv_campaign_by_code(text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_campaign_by_code(text) to authenticated';
  end if;
end $$;

commit;
