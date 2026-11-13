-- 000051: "My home" shows the caller's real Quick Survey limits.
-- 000042 made every Quick Survey guard use lv.quick_limit (the larger of the free value and the owner's Creator plan),
-- but lv_api.lv_my_context still reported the free numbers (5 active, 10 questions), so a Creator Pro account saw
-- "1/5". This keeps the existing wrapper body exactly (suspension block from 000023) and overrides
-- quick_surveys.limit and quick_surveys.question_limit with lv.quick_limit for the caller's personal space.
-- Rollback: supabase/rollbacks/000051_v2_context_creator_limits.down.sql.
begin;

create or replace function lv_api.lv_my_context() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
  s record;
  v_hub uuid;
begin
  v_out := lv.api_my_context();
  if coalesce((v_out->>'ok')::boolean, false) then
    select x.* into s from lv.account_suspensions x where x.account_id = lv.current_account_id();
    v_out := v_out || jsonb_build_object('suspension', case when s.account_id is null then null
               else jsonb_build_object('suspended', true, 'reason', s.reason, 'suspended_at', s.suspended_at) end);
    -- 000051: the caller's own Quick Survey limits (Creator plans raise them).
    select h.id into v_hub from lv.hubs h
     where h.owner_account_id = lv.current_account_id() and h.kind = 'personal'
     order by h.created_at limit 1;
    if v_hub is not null and jsonb_typeof(v_out->'quick_surveys') = 'object' then
      v_out := jsonb_set(v_out, '{quick_surveys,limit}', lv.quick_limit(v_hub, 'quick.max_active'));
      v_out := jsonb_set(v_out, '{quick_surveys,question_limit}', lv.quick_limit(v_hub, 'quick.max_questions'));
    end if;
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

commit;
