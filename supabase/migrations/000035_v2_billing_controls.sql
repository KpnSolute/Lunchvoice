-- 000035: staff billing controls (founder request 2026-11-11: turn billing on for everyone from the staff panel, set the launch
-- date, and have that start the Founding countdown and open purchases).
--
-- Two policy values already drive everything and were only settable by SQL:
--   billing.launched_at     the launch date. Founding entitlements end 30 days after it (lv.effective_end), so setting it
--                           is what gives every Founding Hub a real end date instead of "30 days after billing opens".
--   billing.provider_ready  whether Checkout may start. Every purchase path already fails closed without it.
-- This adds staff-only calls to read and change them safely, and publishes the launch date and the on/off state.
--
-- Rules: scheduling needs a date in the future and billing off; opening needs every Stripe price set and a typed confirmation, and
-- stamps the launch date at "now" when none is set or it is still in the future; pausing stops new purchases but never touches
-- access already paid for or the Founding countdown. Every action is audited. Nothing is deleted.
begin;

create function lv.billing_price_gaps() returns text[]
language sql stable security definer set search_path = ''
as $$
  with p as (select value as v from lv.policy where key = 'billing.stripe_prices')
  select coalesce(array_agg(k order by k), array[]::text[]) from (
    select 'starter_hub' as k from p where v is null or v->'starter_hub' is null or v->'starter_hub' = 'null'::jsonb
    union all select 'team_hub' from p where v is null or v->'team_hub' is null
    union all select 'hub_reservation' from p where v is null or v->'hub_reservation' is null
    union all select 'campaign_starter' from p where v is null or v->'campaign_starter'->'first' is null or v->'campaign_starter'->'extra_week' is null
    union all select 'campaign_plus' from p where v is null or v->'campaign_plus'->'first' is null or v->'campaign_plus'->'extra_week' is null
    union all select 'starter_hub' where not exists (select 1 from p)
  ) g
$$;

create function lv.billing_status_json() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ready boolean := coalesce((lv.policy_json('billing.provider_ready'))::boolean, false);
  v_launch_j jsonb := lv.policy_json('billing.launched_at');
  v_launch timestamptz := case when v_launch_j is not null and jsonb_typeof(v_launch_j) = 'string' then (v_launch_j #>> '{}')::timestamptz end;
begin
  return jsonb_build_object(
    'open', v_ready,
    'launch_at', v_launch,
    'founding_ends_at', v_launch + interval '30 days',
    'launch_passed_billing_off', (not v_ready) and v_launch is not null and v_launch <= now());
end;
$$;

create function lv.api_admin_billing_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true) || lv.billing_status_json() || jsonb_build_object(
    'price_gaps', to_jsonb(lv.billing_price_gaps()),
    'founding_hubs', (select count(*) from lv.entitlements e where e.product = 'founding' and e.scope = 'hub'),
    'paying_hubs', (select count(distinct e.hub_id) from lv.entitlements e where e.source = 'billing' and e.scope = 'hub'
                      and (e.ends_at is null or e.ends_at > now())),
    'events_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days'),
    'applied_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days' and b.outcome = 'applied'),
    'rejected_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days' and b.outcome = 'rejected'));
end;
$$;

create function lv.api_admin_billing_set(p_action text, p_launch_at timestamptz, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  v_st jsonb := lv.billing_status_json();
  v_ready boolean := (v_st->>'open')::boolean;
  v_launch timestamptz := (v_st->>'launch_at')::timestamptz;
  v_gaps text[];
begin
  if v_denied is not null then return v_denied; end if;
  if p_action not in ('schedule', 'clear', 'open', 'pause') then
    return lv.err('lv_invalid_input', 'Choose schedule, clear, open or pause.');
  end if;

  if p_action = 'schedule' then
    if v_ready then return lv.err('lv_conflict', 'Billing is already on, so the launch date can''t move.'); end if;
    if p_launch_at is null or p_launch_at <= now() then return lv.err('lv_invalid_input', 'Pick a launch date in the future. To start billing now, use Open billing.'); end if;
    if p_launch_at > now() + interval '400 days' then return lv.err('lv_invalid_input', 'That date is more than a year away.'); end if;
    update lv.policy set value = to_jsonb(to_char(p_launch_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where key = 'billing.launched_at';
    perform lv.audit(v_actor, null, 'billing.scheduled', null, jsonb_build_object('launch_at', p_launch_at));

  elsif p_action = 'clear' then
    if v_ready then return lv.err('lv_conflict', 'Billing is on. Pause it first; the launch date stays once billing has started.'); end if;
    update lv.policy set value = null where key = 'billing.launched_at';
    perform lv.audit(v_actor, null, 'billing.schedule_cleared', null);

  elsif p_action = 'open' then
    if p_confirm is distinct from 'OPEN BILLING' then return lv.err('lv_invalid_input', 'Type OPEN BILLING to confirm.'); end if;
    v_gaps := lv.billing_price_gaps();
    if array_length(v_gaps, 1) > 0 then
      return lv.err('lv_not_available', 'Stripe prices are not set for: ' || array_to_string(v_gaps, ', ') || '. Billing can''t open until every product has one.');
    end if;
    if not v_ready then
      update lv.policy set value = 'true'::jsonb where key = 'billing.provider_ready';
      -- The Founding countdown starts on the launch date; if none is set (or it is still ahead), it starts now.
      if v_launch is null or v_launch > now() then
        update lv.policy set value = to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where key = 'billing.launched_at';
      end if;
      perform lv.audit(v_actor, null, 'billing.opened', null, jsonb_build_object('launch_at', coalesce(v_launch, now())));
    end if;

  else -- pause
    if p_confirm is distinct from 'PAUSE BILLING' then return lv.err('lv_invalid_input', 'Type PAUSE BILLING to confirm.'); end if;
    if v_ready then
      update lv.policy set value = 'false'::jsonb where key = 'billing.provider_ready';
      perform lv.audit(v_actor, null, 'billing.paused', null);
    end if;
  end if;

  return jsonb_build_object('ok', true) || lv.billing_status_json();
end;
$$;

-- The public face: whether billing is on and the launch date, so every Hub's countdown can show a real date.
create or replace function lv_api.lv_plan_limits() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_out jsonb;
  v_st jsonb := lv.billing_status_json();
begin
  v_out := lv.api_plan_limits();
  if coalesce((v_out->>'ok')::boolean, false) then
    v_out := v_out || jsonb_build_object('billing', jsonb_build_object('open', v_st->'open', 'launch_at', v_st->'launch_at', 'founding_ends_at', v_st->'founding_ends_at'));
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create function lv_api.lv_admin_billing_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_billing_status(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_billing_set(p_action text, p_launch_at timestamptz default null, p_confirm text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_billing_set(p_action, p_launch_at, p_confirm); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on function lv.billing_price_gaps() from public;
revoke all on function lv.billing_status_json() from public;
revoke all on function lv.api_admin_billing_status() from public;
revoke all on function lv.api_admin_billing_set(text, timestamptz, text) from public;
revoke all on function lv_api.lv_admin_billing_status() from public;
revoke all on function lv_api.lv_admin_billing_set(text, timestamptz, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.billing_price_gaps(), lv.billing_status_json(), lv.api_admin_billing_status(), lv.api_admin_billing_set(text, timestamptz, text) from anon';
    execute 'revoke all on function lv_api.lv_admin_billing_status(), lv_api.lv_admin_billing_set(text, timestamptz, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.billing_price_gaps(), lv.billing_status_json(), lv.api_admin_billing_status(), lv.api_admin_billing_set(text, timestamptz, text) from authenticated';
    execute 'grant execute on function lv_api.lv_admin_billing_status(), lv_api.lv_admin_billing_set(text, timestamptz, text) to authenticated';
  end if;
end $$;

commit;
