create table public.kpnsolute_event_receipts (
  webhook_id text primary key check (length(btrim(webhook_id)) between 1 and 180),
  org_id uuid not null references public.orgs(id) on delete cascade,
  tenant_id text not null check (length(btrim(tenant_id)) between 2 and 63),
  source_event_id text not null check (length(btrim(source_event_id)) between 1 and 180),
  event_type text not null check (length(btrim(event_type)) between 1 and 180),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index kpnsolute_event_receipts_org_received_idx
  on public.kpnsolute_event_receipts(org_id, received_at desc);

alter table public.kpnsolute_event_receipts enable row level security;
alter table public.kpnsolute_event_receipts force row level security;
revoke all on public.kpnsolute_event_receipts from anon, authenticated;
grant all on public.kpnsolute_event_receipts to service_role;

create or replace function public.apply_kpnsolute_menu_event(
  target_webhook_id text,
  target_org_id uuid,
  target_tenant_id text,
  target_source_event_id text,
  target_event_type text,
  target_occurred_at timestamptz,
  target_anchor_date date,
  target_days jsonb
) returns table(duplicate boolean, cycle_id uuid, days_applied integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_cycle_id uuid;
  day_value jsonb;
  applied_count integer := 0;
begin
  if jsonb_typeof(target_days) <> 'array' or jsonb_array_length(target_days) = 0 then
    raise exception 'target_days must be a non-empty JSON array';
  end if;

  if exists (select 1 from public.kpnsolute_event_receipts where webhook_id = target_webhook_id) then
    select mc.id into target_cycle_id
    from public.menu_cycles mc
    where mc.org_id = target_org_id and mc.is_active = true
    order by mc.updated_at desc
    limit 1;
    return query select true, target_cycle_id, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(target_org_id::text));
  if exists (select 1 from public.kpnsolute_event_receipts where webhook_id = target_webhook_id) then
    select mc.id into target_cycle_id
    from public.menu_cycles mc
    where mc.org_id = target_org_id and mc.is_active = true
    order by mc.updated_at desc
    limit 1;
    return query select true, target_cycle_id, 0;
    return;
  end if;

  select mc.id into target_cycle_id
  from public.menu_cycles mc
  where mc.org_id = target_org_id and mc.is_active = true
  order by mc.updated_at desc
  limit 1;

  if target_cycle_id is null then
    insert into public.menu_cycles(title, version_label, starts_on, is_active, org_id)
    values ('KpnCompute menu rotation', 'KpnSolute Events', target_anchor_date, true, target_org_id)
    returning id into target_cycle_id;
  end if;

  for day_value in select value from jsonb_array_elements(target_days)
  loop
    if coalesce((day_value->>'day_number')::integer, 0) < 1 then
      raise exception 'day_number must be a positive integer';
    end if;
    update public.menu_cycle_days set
      weekday = day_value->>'weekday',
      breakfast = coalesce(day_value->'breakfast', '[]'::jsonb),
      lunch = coalesce(day_value->'lunch', '[]'::jsonb),
      dinner = coalesce(day_value->'dinner', '[]'::jsonb),
      org_id = target_org_id,
      updated_at = now()
    where cycle_id = target_cycle_id and day_number = (day_value->>'day_number')::integer;
    if not found then
      insert into public.menu_cycle_days(cycle_id, day_number, weekday, breakfast, lunch, dinner, org_id, updated_at)
      values (
        target_cycle_id,
        (day_value->>'day_number')::integer,
        day_value->>'weekday',
        coalesce(day_value->'breakfast', '[]'::jsonb),
        coalesce(day_value->'lunch', '[]'::jsonb),
        coalesce(day_value->'dinner', '[]'::jsonb),
        target_org_id,
        now()
      );
    end if;
    applied_count := applied_count + 1;
  end loop;

  update public.menu_cycles set
    starts_on = coalesce(target_anchor_date, starts_on),
    version_label = 'KpnSolute Events ' || target_event_type,
    updated_at = now()
  where id = target_cycle_id;

  insert into public.kpnsolute_event_receipts(webhook_id, org_id, tenant_id, source_event_id, event_type, occurred_at)
  values (target_webhook_id, target_org_id, target_tenant_id, target_source_event_id, target_event_type, target_occurred_at);

  return query select false, target_cycle_id, applied_count;
end;
$$;

revoke all on function public.apply_kpnsolute_menu_event(text,uuid,text,text,text,timestamptz,date,jsonb) from public, anon, authenticated;
grant execute on function public.apply_kpnsolute_menu_event(text,uuid,text,text,text,timestamptz,date,jsonb) to service_role;
