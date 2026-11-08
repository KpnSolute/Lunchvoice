-- Rollback of 000021: restore 000020's empty hook (no shop email).
begin;
create or replace function lv.community_order_notify(p_order uuid, p_event text) returns void
language plpgsql volatile security definer set search_path = ''
as $$ begin null; end; $$;
revoke all on function lv.community_order_notify(uuid, text) from public;
commit;
