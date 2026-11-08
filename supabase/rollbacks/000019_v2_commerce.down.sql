-- Rollback for 000019_v2_commerce. Drops the commerce, email and admin objects, puts the 000017 grant path back
-- under its own name and restores the 000016 lv_checkout_start and lv_billing_summary bodies.
begin;

drop function if exists lv_api.lv_billing_config();
drop function if exists lv_api.lv_billing_portal_check();
drop function if exists lv_api.lv_invite_email_send(uuid, text, text);
drop function if exists lv_api.lv_admin_overview();
drop function if exists lv_api.lv_admin_waitlist(int, int);
drop function if exists lv_api.lv_admin_waitlist_contact(uuid);
drop function if exists lv_api.lv_admin_abuse_reports(text);
drop function if exists lv_api.lv_admin_report_dismiss(uuid);
drop function if exists lv_api.lv_admin_discover_list(text);
drop function if exists lv_api.lv_admin_discover_decide(uuid, boolean, text);
drop function if exists lv_api.lv_admin_billing_events(int);
drop function if exists lv_api.lv_admin_email_outbox(int);

drop function if exists lv.api_admin_overview();
drop function if exists lv.api_admin_waitlist(int, int);
drop function if exists lv.api_admin_waitlist_contact(uuid);
drop function if exists lv.api_admin_abuse_reports(text);
drop function if exists lv.api_admin_report_dismiss(uuid);
drop function if exists lv.api_admin_discover_list(text);
drop function if exists lv.api_admin_discover_decide(uuid, boolean, text);
drop function if exists lv.api_admin_billing_events(int);
drop function if exists lv.api_admin_email_outbox(int);
drop function if exists lv.admin_denied();
drop table if exists lv.discover_decisions;

drop trigger if exists waitlist_entries_email on lv.waitlist_entries;
drop trigger if exists hubs_email_created on lv.hubs;
drop trigger if exists participation_email_receipt on lv.participation;
drop trigger if exists hub_reservations_email on lv.hub_reservations;
drop function if exists lv.email_on_waitlist();
drop function if exists lv.email_on_hub_created();
drop function if exists lv.email_on_participation();
drop function if exists lv.email_on_reservation();
drop function if exists lv.api_invite_email_send(uuid, text, text);
drop function if exists lv.email_reservation_sweep();
drop function if exists lv.email_claim(int);
drop function if exists lv.email_mark(uuid, text, text, text);
drop function if exists lv.email_retention_sweep();
drop function if exists lv.email_enqueue(text, uuid, text, jsonb, text);
drop function if exists lv.account_email(uuid);
drop table if exists lv.email_outbox;

drop function if exists lv.billing_apply_event(text, text, text, jsonb);
alter function lv.billing_apply_event_core(text, text, text, jsonb) rename to billing_apply_event;

drop function if exists lv.api_billing_portal_check();
drop function if exists lv.billing_customer_of(uuid);
drop function if exists lv.checkout_intent_attach(uuid, text);
drop function if exists lv.billing_customer_set(uuid, text);
drop function if exists lv.checkout_session_context(uuid);
drop function if exists lv.api_billing_config();

-- The 000016 bodies of lv_checkout_start and lv_billing_summary.
create or replace function lv.api_checkout_start(p_product text, p_hub uuid, p_weeks int, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  pr record;
  v_links jsonb;
  v_url text;
  v_slug text := lower(btrim(p_slug));
  v_intent uuid;
  v_amount int;
  v_status jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into pr from lv.products x where x.product = p_product;
  if pr.product is null or not pr.purchasable then
    if pr.product is not null and pr.price_cents is null then
      return lv.err('lv_price_unset', 'This plan has no price yet, so it cannot be bought.');
    end if;
    return lv.err('lv_invalid_input', 'That product cannot be bought.');
  end if;
  if not coalesce((lv.policy_json('billing.provider_ready'))::boolean, false) then
    return lv.err('lv_billing_unavailable', 'Paid plans are not on sale yet.');
  end if;

  if p_hub is not null then
    if lv.hub_kind(p_hub) is distinct from 'community' or not lv.is_owner(v_account, p_hub) then
      return lv.err('lv_not_found', 'No such Hub.');
    end if;
  end if;
  if pr.interval = 'weeks' and (p_weeks is null or p_weeks < pr.first_period_weeks or p_weeks > 104) then
    return lv.err('lv_invalid_input', format('Choose at least %s weeks.', pr.first_period_weeks));
  end if;
  if pr.product = 'hub_reservation' then
    v_status := lv.api_hub_reservation_status(v_slug);
    if not (v_status->>'ok')::boolean then return v_status; end if;
    if v_status->>'state' = 'taken' or (v_status->>'state' in ('active', 'grace') and not (v_status->>'mine')::boolean) then
      return lv.err('lv_conflict', 'That Hub name is not available to reserve.');
    end if;
  end if;

  v_links := lv.policy_json('billing.payment_links');
  v_url := v_links->>pr.product;
  if v_url is null or v_url !~ '^https://' then
    return lv.err('lv_billing_unavailable', 'This plan is not on sale yet.');
  end if;
  v_amount := lv.checkout_amount(pr.product, p_weeks);
  insert into lv.checkout_intents (account_id, product, hub_id, slug, weeks, amount_cents)
  values (v_account, pr.product, p_hub, case when pr.product = 'hub_reservation' then v_slug end,
          case when pr.interval = 'weeks' then p_weeks end, v_amount)
  returning id into v_intent;
  return jsonb_build_object('ok', true, 'intent_id', v_intent, 'amount_cents', v_amount,
    'checkout_url', v_url || case when position('?' in v_url) > 0 then '&' else '?' end || 'client_reference_id=' || v_intent::text);
end;
$$;

-- SERVICE ROLE ONLY. Called by the billing-webhook Edge Function after it has verified the provider signature.
-- p_payload is the normalised event: { intent_id?, product?, account_id?, hub_id?, slug?, weeks?, subscription?,
-- payment_ref?, period_end? (ISO or epoch seconds) }. Values from a checkout intent override metadata.
create or replace function lv.api_billing_summary(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h record;
  v_plan jsonb;
  r record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  if h.id is null or h.kind <> 'community' or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not (lv.is_owner(v_account, h.id) or lv.has_capability(v_account, h.id, 'billing.view')) then
    return lv.err('lv_forbidden', 'Billing needs the Owner or billing.view.');
  end if;
  v_plan := lv.hub_plan(h.id);
  select * into r from lv.hub_reservations x where x.slug = h.slug order by x.expires_at desc limit 1;
  return jsonb_build_object('ok', true,
    'plan', jsonb_build_object('family', v_plan->'family', 'product', v_plan->'product', 'state', v_plan->'state',
                               'starts_at', v_plan->'starts_at', 'ends_at', v_plan->'ends_at'),
    'limits', coalesce((select jsonb_object_agg(l.key, l.value) from lv.plan_limits l where l.family = v_plan->>'family'), '{}'::jsonb),
    'usage', jsonb_build_object(
      'custom_roles', (select count(*) from lv.roles x where x.hub_id = h.id and not x.is_owner and not x.is_system),
      'custom_pages', (select count(*) from lv.hub_pages x where x.hub_id = h.id and x.kind = 'custom'),
      'active_campaigns', (select count(*) from lv.campaigns x where x.hub_id = h.id and x.status = 'active'),
      'active_surveys', (select count(*) from lv.campaigns x where x.hub_id = h.id and x.status = 'active' and x.mode = 'survey')),
    'reservation', case when r.id is null then null else jsonb_build_object(
      'slug', r.slug, 'state', lv.reservation_state(r.expires_at, r.released_at), 'expires_at', r.expires_at,
      'grace_ends_at', r.expires_at + make_interval(days => coalesce((lv.policy_json('reservation.grace_days'))::int, 0))) end,
    'billing_ready', coalesce((lv.policy_json('billing.provider_ready'))::boolean, false));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Discover applications (Team family, 700 genuine active members). Personal spaces are never eligible.

drop function if exists lv.checkout_channel(text);
drop function if exists lv.payment_link_for(text);
drop function if exists lv.stripe_prices_for(text);
drop index if exists lv.checkout_intents_account_recent_idx;
alter table lv.checkout_intents drop column if exists provider_session;
drop table if exists lv.billing_subscriptions;
drop table if exists lv.billing_customers;

delete from lv.reserved_slugs where slug = 'reserve';
delete from lv.policy where key in ('billing.stripe_prices', 'billing.intents_per_hour', 'email.retention_days', 'email.max_attempts',
                                    'email.invites_per_hour', 'email.reservation_reminder_days', 'email.participation_receipts');
update lv.policy set note = 'JSON object product -> Stripe Payment Link URL (automatic tax enabled). NULL: no checkout.'
 where key = 'billing.payment_links';

revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function lv.billing_apply_event(text, text, text, jsonb) to service_role';
  end if;
end $$;

commit;
