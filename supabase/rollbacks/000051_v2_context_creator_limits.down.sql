-- Rollback for 000051: restores the 000023 wrapper (free Quick Survey numbers in My home).
begin;
create or replace function lv_api.lv_my_context() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
  s record;
begin
  v_out := lv.api_my_context();
  if coalesce((v_out->>'ok')::boolean, false) then
    select x.* into s from lv.account_suspensions x where x.account_id = lv.current_account_id();
    v_out := v_out || jsonb_build_object('suspension', case when s.account_id is null then null
               else jsonb_build_object('suspended', true, 'reason', s.reason, 'suspended_at', s.suspended_at) end);
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;
commit;
