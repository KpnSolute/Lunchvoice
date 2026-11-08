-- LunchVoice v2 canonical 21: cross-track integration (build plan 2026-11-21).
--
-- Connects track C's shop to track B's email outbox. 000020 shipped lv.community_order_notify as an empty, marked hook;
-- this replaces its body so a FULFILLED order queues the E08 "ready for pickup" email (template shop_order) to the
-- member's verified address. Placed and cancelled orders send nothing (the template only describes a ready order).
-- One email per order (dedupe key). lv.email_enqueue never raises and returns NULL for an unusable address, so the
-- order itself can never fail because of mail. The payload holds the Hub name, item name and slug only: no points,
-- no balance, no answers.

begin;

create or replace function lv.community_order_notify(p_order uuid, p_event text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  o record;
begin
  if p_event is distinct from 'fulfilled' then return; end if;
  select so.id, so.account_id, so.item_name, h.display_name as hub_name, h.slug
    into o
    from lv.shop_orders so join lv.hubs h on h.id = so.hub_id
   where so.id = p_order and so.status = 'fulfilled' and h.kind = 'community';
  if not found then return; end if;
  begin
    perform lv.email_enqueue('shop_order', o.account_id, lv.account_email(o.account_id),
      jsonb_build_object('hub_name', o.hub_name, 'item', o.item_name, 'slug', o.slug),
      'order:' || o.id::text || ':fulfilled');
  exception when others then raise log 'lv email: shop order enqueue skipped (%)', sqlstate;
  end;
end;
$$;
revoke all on function lv.community_order_notify(uuid, text) from public;

commit;
