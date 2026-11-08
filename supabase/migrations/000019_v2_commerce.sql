-- LunchVoice v2 canonical 19: commerce, transactional email and the platform admin console (build plan track B,
-- decisions B-01 and B-02).
--
-- Nothing here charges money or sends mail by itself. Everything stays fail closed until the founder supplies keys.
--
-- 1. Checkout Sessions (B-01). Policy 'billing.stripe_prices' maps each product to Stripe price IDs:
--      starter_hub, team_hub, hub_reservation : "price_..."  or  {"price": "price_..."}
--      campaign_starter, campaign_plus        : {"first": "price_...", "extra_week": "price_..."}
--    A Campaign plan is one line item for the first period (lv.products.first_period_weeks) plus the extra-week price
--    with quantity = weeks - first_period_weeks, so the Stripe subtotal equals lv.checkout_amount exactly; the
--    webhook still rejects any mismatch (NEW-01). lv_checkout_start records the intent; the `checkout` Edge Function
--    then creates the Checkout Session server-side (automatic tax on) through the service-role functions below.
--    The legacy Payment Link path (billing.payment_links) keeps working for compatibility; Checkout Sessions win
--    when both are configured. lv_billing_config tells the UI which products are on sale (no secrets).
-- 2. Stripe customers and subscriptions. lv.billing_customers holds one Stripe customer per account (written by the
--    service role only). lv.billing_subscriptions mirrors subscription state (status, cancel_at_period_end, period
--    end) for display; access itself still follows lv.billing_apply_event_core (000017), which is unchanged and now
--    sits behind a thin lv.billing_apply_event wrapper that adds customer.subscription.updated.
-- 3. Transactional email outbox (B-02). lv.email_outbox never holds an answer. Mail is enqueued on waitlist join
--    with a consented contact email (E01), Hub created (E03), a Hub invite sent by email (E04), reservation
--    confirmed / expiring / in grace (E05, E06), an identified participation receipt (E07, never for anonymous
--    Campaigns) and, later, shop orders (E08, through lv.email_enqueue). Deleting an account deletes its mail
--    (foreign key cascade). A sent message keeps no payload; finished rows are purged after 'email.retention_days'.
-- 4. Platform admin console. Every lv_admin_* function checks lv.is_platform_admin and answers lv_forbidden to
--    everyone else. The waitlist overview never shows a contact email; opening one is a separate, audited call.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------------------------------------
insert into lv.policy (key, value, note) values
  ('billing.stripe_prices', null,
   'B-01: product -> Stripe price IDs. Hub plans and the reservation: "price_..." or {"price": "price_..."}. Campaign plans: {"first": "price_...", "extra_week": "price_..."}. NULL: no Checkout Session can be created.'),
  ('billing.intents_per_hour', '20'::jsonb, 'Abuse control: checkout intents one account may start per hour.'),
  ('email.retention_days', '30'::jsonb, 'Sent, failed and cancelled outbox rows are deleted after this many days.'),
  ('email.max_attempts', '5'::jsonb, 'A message that fails this many times is marked failed and not retried.'),
  ('email.invites_per_hour', '30'::jsonb, 'Abuse control: Hub invites one account may send by email per hour.'),
  ('email.reservation_reminder_days', '14'::jsonb, 'E05: remind the holder this many days before a reservation expires.'),
  ('email.participation_receipts', 'true'::jsonb, 'E07: send a participation receipt for identified Campaigns (never for anonymous ones).');

update lv.policy set note = 'Legacy: product -> Stripe Payment Link URL. Superseded by billing.stripe_prices (server-created Checkout Sessions); kept for compatibility.'
 where key = 'billing.payment_links';

-- /reserve is a top-level route (reservation purchase).
insert into lv.reserved_slugs (slug, reason) values ('reserve', 'ui route') on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- Stripe customers, subscriptions, Checkout Session ids
-- ---------------------------------------------------------------------------------------------------------
create table lv.billing_customers (
  account_id uuid primary key references lv.accounts (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  customer_id text not null check (customer_id ~ '^cus_[A-Za-z0-9]{1,250}$'),
  created_at timestamptz not null default now(),
  constraint billing_customers_customer_key unique (provider, customer_id)
);
alter table lv.billing_customers enable row level security;

create table lv.billing_subscriptions (
  subscription_id text primary key check (subscription_id ~ '^sub_[A-Za-z0-9]{1,250}$'),
  account_id uuid references lv.accounts (id) on delete set null,
  hub_id uuid references lv.hubs (id) on delete set null,
  product text references lv.products (product),
  status text not null default 'active' check (length(status) between 1 and 40),
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create index billing_subscriptions_account_idx on lv.billing_subscriptions (account_id);
alter table lv.billing_subscriptions enable row level security;

alter table lv.checkout_intents add column provider_session text check (provider_session is null or provider_session ~ '^cs_[A-Za-z0-9_]{1,250}$');
create index checkout_intents_account_recent_idx on lv.checkout_intents (account_id, created_at);

-- A product's Stripe prices, validated, or NULL when not configured.
create function lv.stripe_prices_for(p_product text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_all jsonb := lv.policy_json('billing.stripe_prices');
  v jsonb;
  pr record;
begin
  if v_all is null or jsonb_typeof(v_all) <> 'object' then return null; end if;
  select * into pr from lv.products x where x.product = p_product;
  if pr.product is null then return null; end if;
  v := v_all->p_product;
  if v is null then return null; end if;
  if jsonb_typeof(v) = 'string' then v := jsonb_build_object('price', v #>> '{}'); end if;
  if jsonb_typeof(v) <> 'object' then return null; end if;
  if pr.interval = 'weeks' then
    if coalesce(v->>'first', '') !~ '^price_[A-Za-z0-9]{1,250}$' or coalesce(v->>'extra_week', '') !~ '^price_[A-Za-z0-9]{1,250}$' then
      return null;
    end if;
    return jsonb_build_object('first', v->>'first', 'extra_week', v->>'extra_week');
  end if;
  if coalesce(v->>'price', '') !~ '^price_[A-Za-z0-9]{1,250}$' then return null; end if;
  return jsonb_build_object('price', v->>'price');
end;
$$;

create function lv.payment_link_for(p_product text) returns text
language sql stable security definer set search_path = ''
as $$ select case when (lv.policy_json('billing.payment_links')->>p_product) ~ '^https://'
                  then lv.policy_json('billing.payment_links')->>p_product end $$;

-- 'session', 'link' or NULL (not on sale). Session wins over a legacy link.
create function lv.checkout_channel(p_product text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  pr record;
begin
  select * into pr from lv.products x where x.product = p_product;
  if pr.product is null or not pr.purchasable or pr.price_cents is null then return null; end if;
  if not coalesce((lv.policy_json('billing.provider_ready'))::boolean, false) then return null; end if;
  if lv.stripe_prices_for(p_product) is not null then return 'session'; end if;
  if lv.payment_link_for(p_product) is not null then return 'link'; end if;
  return null;
end;
$$;

-- What the UI may offer. Never a secret or a price ID.
create function lv.api_billing_config() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_ready boolean := coalesce((lv.policy_json('billing.provider_ready'))::boolean, false);
  v_products jsonb;
begin
  select coalesce(jsonb_object_agg(p.product, lv.checkout_channel(p.product) is not null), '{}'::jsonb) into v_products
    from lv.products p where p.product in ('starter_hub', 'team_hub', 'campaign_starter', 'campaign_plus', 'hub_reservation');
  return jsonb_build_object('ok', true, 'provider_ready', v_ready,
    'checkout_available', exists (select 1 from jsonb_each(v_products) e where e.value = 'true'::jsonb),
    'products', v_products,
    'portal_available', v_ready and v_account is not null and exists (select 1 from lv.billing_customers c where c.account_id = v_account));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_checkout_start: intents for Checkout Sessions (and the legacy link), rate-limited
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.api_checkout_start(p_product text, p_hub uuid, p_weeks int, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  pr record;
  v_url text;
  v_channel text;
  v_slug text := lower(btrim(p_slug));
  v_intent uuid;
  v_amount int;
  v_status jsonb;
  v_recent int;
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

  v_channel := lv.checkout_channel(pr.product);
  if v_channel is null then return lv.err('lv_billing_unavailable', 'This plan is not on sale yet.'); end if;

  select count(*) into v_recent from lv.checkout_intents i
   where i.account_id = v_account and i.created_at > now() - interval '1 hour';
  if v_recent >= coalesce((lv.policy_json('billing.intents_per_hour'))::int, 20) then
    return lv.err('lv_rate_limited', 'Too many checkouts started. Try again in a while.');
  end if;

  v_amount := lv.checkout_amount(pr.product, p_weeks);
  insert into lv.checkout_intents (account_id, product, hub_id, slug, weeks, amount_cents)
  values (v_account, pr.product, p_hub, case when pr.product = 'hub_reservation' then v_slug end,
          case when pr.interval = 'weeks' then p_weeks end, v_amount)
  returning id into v_intent;

  if v_channel = 'session' then
    return jsonb_build_object('ok', true, 'intent_id', v_intent, 'amount_cents', v_amount, 'checkout', 'session',
                              'mode', case when pr.interval = 'month' then 'subscription' else 'payment' end);
  end if;
  v_url := lv.payment_link_for(pr.product);
  return jsonb_build_object('ok', true, 'intent_id', v_intent, 'amount_cents', v_amount, 'checkout', 'link',
    'checkout_url', v_url || case when position('?' in v_url) > 0 then '&' else '?' end || 'client_reference_id=' || v_intent::text);
end;
$$;

-- SERVICE ROLE ONLY. Everything the checkout Edge Function needs to create a Checkout Session for an intent.
-- The intent, not the browser, decides the product, the weeks, the slug, the Hub and the amount.
create function lv.checkout_session_context(p_intent uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  it lv.checkout_intents;
  pr record;
begin
  select * into it from lv.checkout_intents x where x.id = p_intent;
  if it.id is null then return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_not_found', 'message', 'No such checkout.')); end if;
  select * into pr from lv.products x where x.product = it.product;
  return jsonb_build_object('ok', true,
    'intent_id', it.id, 'product', it.product, 'interval', pr.interval,
    'mode', case when pr.interval = 'month' then 'subscription' else 'payment' end,
    'weeks', it.weeks, 'first_period_weeks', pr.first_period_weeks, 'amount_cents', it.amount_cents,
    'account_id', it.account_id, 'hub_id', it.hub_id, 'hub_slug', (select h.slug from lv.hubs h where h.id = it.hub_id),
    'slug', it.slug, 'completed', it.completed_at is not null, 'provider_session', it.provider_session,
    'prices', lv.stripe_prices_for(it.product),
    'customer_id', (select c.customer_id from lv.billing_customers c where c.account_id = it.account_id));
end;
$$;

-- SERVICE ROLE ONLY. Remember the Stripe customer created for an account. Never replaces an existing one.
create function lv.billing_customer_set(p_account uuid, p_customer text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v text;
begin
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]{1,250}$' then return lv.err('lv_invalid_input', 'Not a customer id.'); end if;
  if not exists (select 1 from lv.accounts a where a.id = p_account) then return lv.err('lv_not_found', 'No such account.'); end if;
  insert into lv.billing_customers (account_id, customer_id) values (p_account, p_customer)
  on conflict (account_id) do nothing;
  select c.customer_id into v from lv.billing_customers c where c.account_id = p_account;
  return jsonb_build_object('ok', true, 'customer_id', v);
end;
$$;

-- SERVICE ROLE ONLY. Attach the created Checkout Session id to its intent (support and reconciliation).
create function lv.checkout_intent_attach(p_intent uuid, p_session text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_session is null or p_session !~ '^cs_[A-Za-z0-9_]{1,250}$' then return lv.err('lv_invalid_input', 'Not a session id.'); end if;
  update lv.checkout_intents set provider_session = p_session where id = p_intent and completed_at is null;
  if not found then return lv.err('lv_not_found', 'No open checkout.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Signed in: whether the caller has a Stripe customer to manage. Returns the caller's own account id so the
-- Edge Function (which received this answer from the database, not from the browser) can look the customer up.
create function lv.api_billing_portal_check() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if not coalesce((lv.policy_json('billing.provider_ready'))::boolean, false) then
    return lv.err('lv_billing_unavailable', 'Billing is not open yet.');
  end if;
  if not exists (select 1 from lv.billing_customers c where c.account_id = v_account) then
    return lv.err('lv_not_found', 'There is no subscription to manage on this account.');
  end if;
  return jsonb_build_object('ok', true, 'account_id', v_account);
end;
$$;

-- SERVICE ROLE ONLY.
create function lv.billing_customer_of(p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$ select c.customer_id from lv.billing_customers c where c.account_id = p_account $$;

-- ---------------------------------------------------------------------------------------------------------
-- Webhook: the 000017 grant path is unchanged; a wrapper adds subscription state and customer.subscription.updated
-- ---------------------------------------------------------------------------------------------------------
alter function lv.billing_apply_event(text, text, text, jsonb) rename to billing_apply_event_core;

create function lv.billing_apply_event(p_provider text, p_event_id text, p_type text, p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_id bigint;
  v_res jsonb;
  v_sub text := nullif(v_p->>'subscription', '');
  v_end timestamptz;
  it lv.checkout_intents;
  v_n int;
begin
  begin
    v_end := case when v_p->>'period_end' ~ '^[0-9]+$' then to_timestamp((v_p->>'period_end')::bigint)
                  else (v_p->>'period_end')::timestamptz end;
  exception when others then v_end := null; end;

  -- Display state only: a cancellation scheduled for the period end never shortens access. Access ends through
  -- customer.subscription.deleted (at the period end) exactly as 000017 decides.
  if p_type = 'customer.subscription.updated' then
    insert into lv.billing_events (provider, event_id, type, outcome)
    values (p_provider, p_event_id, p_type, 'ignored')
    on conflict (provider, event_id) do nothing
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
    update lv.billing_subscriptions
       set status = coalesce(left(nullif(v_p->>'status', ''), 40), status),
           cancel_at_period_end = coalesce((v_p->>'cancel_at_period_end')::boolean, cancel_at_period_end),
           current_period_end = coalesce(v_end, current_period_end),
           updated_at = now()
     where subscription_id = v_sub;
    get diagnostics v_n = row_count;
    update lv.billing_events
       set outcome = case when v_n > 0 then 'applied' else 'ignored' end,
           detail = jsonb_build_object('subscription', v_sub, 'cancel_at_period_end', (v_p->>'cancel_at_period_end')::boolean,
                                       'reason', case when v_n > 0 then 'subscription_state_recorded' else 'unknown_subscription' end)
     where id = v_id;
    return jsonb_build_object('ok', true, 'duplicate', false, 'outcome', case when v_n > 0 then 'applied' else 'ignored' end);
  end if;

  v_res := lv.billing_apply_event_core(p_provider, p_event_id, p_type, p_payload);
  if coalesce((v_res->>'duplicate')::boolean, false) then return v_res; end if;

  if p_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') and v_res->>'outcome' = 'applied' then
    if v_p->>'intent_id' ~ '^[0-9a-f-]{36}$' then
      select * into it from lv.checkout_intents x where x.id = (v_p->>'intent_id')::uuid;
    end if;
    if it.id is not null and v_sub ~ '^sub_[A-Za-z0-9]{1,250}$' then
      insert into lv.billing_subscriptions (subscription_id, account_id, hub_id, product, status, current_period_end)
      values (v_sub, it.account_id, it.hub_id, it.product, 'active', v_end)
      on conflict (subscription_id) do update set status = 'active', updated_at = now();
    end if;
    if it.id is not null and v_p->>'customer' ~ '^cus_[A-Za-z0-9]{1,250}$' then
      insert into lv.billing_customers (account_id, customer_id) values (it.account_id, v_p->>'customer')
      on conflict do nothing;
    end if;
  elsif p_type = 'invoice.paid' and v_sub is not null and v_end is not null then
    update lv.billing_subscriptions
       set current_period_end = greatest(coalesce(current_period_end, v_end), v_end), status = 'active', updated_at = now()
     where subscription_id = v_sub;
  elsif p_type = 'customer.subscription.deleted' and v_sub is not null then
    update lv.billing_subscriptions
       set status = 'canceled', cancel_at_period_end = false, current_period_end = coalesce(v_end, current_period_end), updated_at = now()
     where subscription_id = v_sub;
  end if;
  return v_res;
end;
$$;

-- Billing summary: the 000016 shape plus subscription state and what is on sale.
create or replace function lv.api_billing_summary(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h record;
  v_plan jsonb;
  r record;
  s record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  if h.id is null or h.kind <> 'community' or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not (lv.is_owner(v_account, h.id) or lv.has_capability(v_account, h.id, 'billing.view')) then
    return lv.err('lv_forbidden', 'Billing needs the Owner or billing.view.');
  end if;
  v_plan := lv.hub_plan(h.id);
  select * into r from lv.hub_reservations x where x.slug = h.slug order by x.expires_at desc limit 1;
  -- The Hub's subscription (bought for it, or bought first and turned into this Hub through a credit).
  select b.* into s from lv.billing_subscriptions b
   where exists (select 1 from lv.entitlements e where e.scope = 'hub' and e.hub_id = h.id and e.external_ref = b.subscription_id)
   order by (b.status = 'canceled'), b.updated_at desc limit 1;
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
    'subscription', case when s.subscription_id is null then null else jsonb_build_object(
      'status', s.status, 'cancel_at_period_end', s.cancel_at_period_end, 'current_period_end', s.current_period_end,
      -- Only the paying account can open the Customer Portal for it.
      'manageable', s.account_id = v_account) end,
    'billing_ready', coalesce((lv.policy_json('billing.provider_ready'))::boolean, false),
    'purchasable', (select coalesce(jsonb_object_agg(p.product, lv.checkout_channel(p.product) is not null), '{}'::jsonb)
                      from lv.products p where p.product in ('starter_hub', 'team_hub', 'campaign_starter', 'campaign_plus')));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Transactional email outbox (B-02)
-- ---------------------------------------------------------------------------------------------------------
create table lv.email_outbox (
  id uuid primary key default gen_random_uuid(),
  template text not null check (template in ('waitlist_joined', 'hub_created', 'hub_invite', 'reservation_confirmed',
                                             'reservation_expiring', 'reservation_grace', 'participation_receipt', 'shop_order')),
  -- The account the message belongs to (recipient, or the sender of an invite). Deleting it deletes the mail.
  account_id uuid references lv.accounts (id) on delete cascade,
  to_address text not null check (length(to_address) <= 254 and to_address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Only what the template needs (names, slugs, dates, a receipt id). Never an answer. Emptied once sent.
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 300),
  dedupe_key text check (dedupe_key is null or length(dedupe_key) <= 200),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 200),
  created_at timestamptz not null default now(),
  constraint email_outbox_dedupe_key unique (dedupe_key)
);
create index email_outbox_due_idx on lv.email_outbox (status, next_attempt_at);
create index email_outbox_account_idx on lv.email_outbox (account_id);
alter table lv.email_outbox enable row level security;
comment on table lv.email_outbox is
  'Transactional mail only (B-02). Never holds answers. Rows cascade with the account; sent rows keep no payload and are purged after email.retention_days.';

-- The verified email KpnIdentity gave for an account (most recent), or NULL. Display/contact only, never a key.
create function lv.account_email(p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select i.email from lv.account_identities i
   where i.account_id = p_account and i.email_verified_at is not null and i.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
   order by i.updated_at desc limit 1
$$;

-- Enqueue one message. Returns its id, or NULL when there is no usable address or the dedupe key was seen.
-- Callable from other definer functions (track C: shop_order). Never raises on bad input.
create function lv.email_enqueue(p_template text, p_account uuid, p_to text, p_payload jsonb, p_dedupe text default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_to text := lower(btrim(p_to));
begin
  if v_to is null or length(v_to) > 254 or v_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  if p_template not in ('waitlist_joined', 'hub_created', 'hub_invite', 'reservation_confirmed', 'reservation_expiring',
                        'reservation_grace', 'participation_receipt', 'shop_order') then return null; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 4096 then return null; end if;
  insert into lv.email_outbox (template, account_id, to_address, payload, dedupe_key)
  values (p_template, p_account, v_to, jsonb_strip_nulls(p_payload), p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- E01: waitlist join. Only when the joiner left a contact email with consent (the email is optional).
create function lv.email_on_waitlist() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.contact_email is not null and new.consent_version is not null then
    begin
      perform lv.email_enqueue('waitlist_joined', new.account_id, new.contact_email,
        jsonb_build_object('status', new.status, 'position', new.position), 'waitlist:' || new.id::text);
    exception when others then raise log 'lv email: waitlist enqueue skipped (%)', sqlstate;
    end;
  end if;
  return new;
end;
$$;
create trigger waitlist_entries_email after insert on lv.waitlist_entries
  for each row execute function lv.email_on_waitlist();

-- E03: a community Hub was created. To the Owner's verified email.
create function lv.email_on_hub_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'community' then
    begin
      perform lv.email_enqueue('hub_created', new.owner_account_id, lv.account_email(new.owner_account_id),
        jsonb_build_object('hub_name', new.display_name, 'slug', new.slug), 'hub_created:' || new.id::text);
    exception when others then raise log 'lv email: hub enqueue skipped (%)', sqlstate;
    end;
  end if;
  return new;
end;
$$;
create trigger hubs_email_created after insert on lv.hubs
  for each row execute function lv.email_on_hub_created();

-- E07: participation receipt, identified Campaigns only. It confirms taking part, never what was answered.
-- Anonymous Campaigns never send one: the mail would link a person to a Campaign the creator promised not to link.
create function lv.email_on_participation() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  if not coalesce((lv.policy_json('email.participation_receipts'))::boolean, false) then return new; end if;
  select x.title, x.anonymity, h.display_name, h.kind into c
    from lv.campaigns x join lv.hubs h on h.id = x.hub_id where x.id = new.campaign_id;
  if c.anonymity = 'identified' then
    begin
      perform lv.email_enqueue('participation_receipt', new.account_id, lv.account_email(new.account_id),
        jsonb_build_object('campaign_title', c.title, 'hub_name', case when c.kind = 'community' then c.display_name end,
                           'receipt_id', new.receipt_id),
        'receipt:' || new.receipt_id::text);
    exception when others then raise log 'lv email: receipt enqueue skipped (%)', sqlstate;
    end;
  end if;
  return new;
end;
$$;
create trigger participation_email_receipt after insert on lv.participation
  for each row execute function lv.email_on_participation();

-- E05 (confirmation): a reservation was bought or renewed.
create function lv.email_on_reservation() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.account_id is not null and new.released_at is null
     and (tg_op = 'INSERT' or new.expires_at > old.expires_at) then
    begin
      perform lv.email_enqueue('reservation_confirmed', new.account_id, lv.account_email(new.account_id),
        jsonb_build_object('slug', new.slug, 'expires_at', new.expires_at, 'renewed', tg_op = 'UPDATE'),
        'res_ok:' || new.id::text || ':' || floor(extract(epoch from new.expires_at))::bigint::text);
    exception when others then raise log 'lv email: reservation enqueue skipped (%)', sqlstate;
    end;
  end if;
  return new;
end;
$$;
create trigger hub_reservations_email after insert or update of expires_at on lv.hub_reservations
  for each row execute function lv.email_on_reservation();

-- SERVICE ROLE ONLY (run by email-dispatch). E05 reminders before expiry and E06 grace notices, once per period.
create function lv.email_reservation_sweep() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_days int := coalesce((lv.policy_json('email.reservation_reminder_days'))::int, 14);
  v_grace int := coalesce((lv.policy_json('reservation.grace_days'))::int, 0);
  r record;
  v_exp int := 0;
  v_gr int := 0;
  v_state text;
begin
  for r in select x.* from lv.hub_reservations x
            where x.released_at is null and x.account_id is not null
              and x.expires_at < now() + make_interval(days => v_days)
              and x.expires_at + make_interval(days => v_grace) > now()
              -- The newest reservation for the slug only, and only while no Hub uses the name.
              and x.id = (select y.id from lv.hub_reservations y where y.slug = x.slug order by y.expires_at desc limit 1)
              and not exists (select 1 from lv.hubs h where h.slug = x.slug) loop
    v_state := lv.reservation_state(r.expires_at, r.released_at);
    if v_state = 'active' then
      if lv.email_enqueue('reservation_expiring', r.account_id, lv.account_email(r.account_id),
           jsonb_build_object('slug', r.slug, 'expires_at', r.expires_at),
           'res_exp:' || r.id::text || ':' || floor(extract(epoch from r.expires_at))::bigint::text) is not null then
        v_exp := v_exp + 1;
      end if;
    elsif v_state = 'grace' then
      if lv.email_enqueue('reservation_grace', r.account_id, lv.account_email(r.account_id),
           jsonb_build_object('slug', r.slug, 'expires_at', r.expires_at,
                              'grace_ends_at', r.expires_at + make_interval(days => v_grace), 'grace_days', v_grace),
           'res_grace:' || r.id::text || ':' || floor(extract(epoch from r.expires_at))::bigint::text) is not null then
        v_gr := v_gr + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'expiring', v_exp, 'grace', v_gr);
end;
$$;

-- SERVICE ROLE ONLY. Claim up to p_limit due messages (queued, or stuck in sending for 15 minutes).
create function lv.email_claim(p_limit int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  with c as (
    select o.id from lv.email_outbox o
     where (o.status = 'queued' and o.next_attempt_at <= now())
        or (o.status = 'sending' and o.locked_at < now() - interval '15 minutes')
     order by o.created_at
     limit greatest(least(coalesce(p_limit, 20), 100), 1)
     for update skip locked),
  u as (
    update lv.email_outbox o set status = 'sending', locked_at = now(), attempts = o.attempts + 1
      from c where o.id = c.id
    returning o.id, o.template, o.to_address, o.payload, o.attempts)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'template', u.template, 'to', u.to_address,
                                               'payload', u.payload, 'attempts', u.attempts)), '[]'::jsonb)
    into v from u;
  return jsonb_build_object('ok', true, 'messages', v);
end;
$$;

-- SERVICE ROLE ONLY. Record the outcome of one send: 'sent', 'retry' (transient) or 'failed' (permanent).
create function lv.email_mark(p_id uuid, p_result text, p_error text default null, p_provider_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  m lv.email_outbox;
  v_max int := coalesce((lv.policy_json('email.max_attempts'))::int, 5);
begin
  select * into m from lv.email_outbox o where o.id = p_id for update;
  if m.id is null then return lv.err('lv_not_found', 'No such message.'); end if;
  if m.status <> 'sending' then return lv.err('lv_lifecycle_invalid', 'That message is not being sent.'); end if;
  if p_result = 'sent' then
    update lv.email_outbox set status = 'sent', sent_at = now(), locked_at = null, payload = '{}'::jsonb,
                               last_error = null, provider_message_id = left(p_provider_id, 200)
     where id = p_id;
  elsif p_result = 'retry' and m.attempts < v_max then
    update lv.email_outbox set status = 'queued', locked_at = null, last_error = left(p_error, 300),
                               next_attempt_at = now() + make_interval(mins => power(2, least(m.attempts, 10))::int)
     where id = p_id;
  elsif p_result in ('retry', 'failed') then
    update lv.email_outbox set status = 'failed', locked_at = null, payload = '{}'::jsonb, last_error = left(p_error, 300)
     where id = p_id;
  else
    return lv.err('lv_invalid_input', 'Result must be sent, retry or failed.');
  end if;
  return jsonb_build_object('ok', true, 'status', (select o.status from lv.email_outbox o where o.id = p_id));
end;
$$;

-- SERVICE ROLE ONLY. Delete finished rows after the retention period; report what is still waiting.
create function lv.email_retention_sweep() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_days int := coalesce((lv.policy_json('email.retention_days'))::int, 30);
  v_n int;
begin
  delete from lv.email_outbox
   where status in ('sent', 'failed', 'cancelled') and coalesce(sent_at, created_at) < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_n,
                            'queued', (select count(*) from lv.email_outbox o where o.status in ('queued', 'sending')));
end;
$$;

-- E04: email a Hub invite the caller just created. The code is checked against its stored hash, so only someone
-- holding a live code of this Hub (shown once at creation) can mail it.
create function lv.api_invite_email_send(p_hub uuid, p_code text, p_to text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_to text := lower(btrim(p_to));
  i record;
  h record;
  v_recent int;
  v_id uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  perform lv.require_capability(v_account, p_hub, 'admin.members.admit');
  if v_to is null or length(v_to) > 254 or v_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return lv.err('lv_invalid_input', 'That email address does not look right.');
  end if;
  select x.* into i from lv.hub_invites x
   where x.code_hash = lv.invite_hash(coalesce(p_code, '')) and x.hub_id = p_hub and x.revoked_at is null
     and (x.expires_at is null or x.expires_at > now()) and (x.max_uses is null or x.uses < x.max_uses);
  if i.id is null then return lv.err('lv_invalid_code', 'That invite code is not live for this Hub.'); end if;
  select count(*) into v_recent from lv.email_outbox o
   where o.template = 'hub_invite' and o.account_id = v_account and o.created_at > now() - interval '1 hour';
  if v_recent >= coalesce((lv.policy_json('email.invites_per_hour'))::int, 30) then
    return lv.err('lv_rate_limited', 'Too many invites sent by email. Try again in a while.');
  end if;
  select x.display_name, x.slug into h from lv.hubs x where x.id = p_hub;
  v_id := lv.email_enqueue('hub_invite', v_account, v_to,
    jsonb_build_object('hub_name', h.display_name, 'slug', h.slug, 'code', upper(btrim(p_code)), 'expires_at', i.expires_at,
                       'inviter_name', (select a.display_name from lv.accounts a where a.id = v_account)),
    'invite:' || i.id::text || ':' || md5(v_to));
  -- The audit never records the address.
  perform lv.audit(v_account, p_hub, 'invite.emailed', i.id::text, jsonb_build_object('queued', v_id is not null));
  return jsonb_build_object('ok', true, 'queued', v_id is not null, 'already_sent', v_id is null);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Platform admin console
-- ---------------------------------------------------------------------------------------------------------
create table lv.discover_decisions (
  application_id uuid primary key references lv.discover_applications (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  decided_by uuid references lv.accounts (id) on delete set null,
  decided_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 500)
);
alter table lv.discover_decisions enable row level security;

create function lv.admin_denied() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if lv.current_account_id() is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if not lv.is_platform_admin(lv.current_account_id()) then return lv.err('lv_forbidden', 'This needs a platform administrator.'); end if;
  return null;
end;
$$;

create function lv.api_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true,
    'waitlist', jsonb_build_object(
      'seats_total', lv.waitlist_seats(),
      'seats_taken', least((select c.admitted_issued from lv.waitlist_counters c where c.id), lv.waitlist_seats()),
      'admitted', (select count(*) from lv.waitlist_entries w where w.status = 'admitted'),
      'waitlisted', (select count(*) from lv.waitlist_entries w where w.status = 'waitlisted'),
      'with_contact', (select count(*) from lv.waitlist_entries w where w.contact_email is not null)),
    'reports_open', (select count(*) from lv.abuse_reports r where r.status = 'open'),
    'campaigns_blocked', (select count(*) from lv.campaigns c where c.blocked_at is not null),
    'discover_pending', (select count(*) from lv.discover_applications d where d.status = 'submitted'),
    'billing', jsonb_build_object(
      'provider_ready', coalesce((lv.policy_json('billing.provider_ready'))::boolean, false),
      'events_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days'),
      'rejected_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days' and b.outcome = 'rejected')),
    'email', (select jsonb_build_object(
      'queued', count(*) filter (where o.status in ('queued', 'sending')),
      'sent', count(*) filter (where o.status = 'sent'),
      'failed', count(*) filter (where o.status = 'failed')) from lv.email_outbox o));
end;
$$;

-- Positions and states, never a contact email (only whether one exists).
create function lv.api_admin_waitlist(p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true,
    'total', (select count(*) from lv.waitlist_entries),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('entry_id', w.id, 'status', w.status, 'position', w.position,
                                   'joined_at', w.created_at, 'has_contact_email', w.contact_email is not null,
                                   'intended_hub_name', w.intended_hub_name) order by w.status, w.position)
      from (select * from lv.waitlist_entries x order by x.status, x.position
             limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0)) w), '[]'::jsonb));
end;
$$;

-- Opening one contact email is deliberate and audited.
create function lv.api_admin_waitlist_contact(p_entry uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  w record;
begin
  if v_denied is not null then return v_denied; end if;
  select * into w from lv.waitlist_entries x where x.id = p_entry;
  if w.id is null then return lv.err('lv_not_found', 'No such waitlist entry.'); end if;
  perform lv.audit(lv.current_account_id(), null, 'admin.waitlist_contact_viewed', w.id::text);
  return jsonb_build_object('ok', true, 'entry_id', w.id, 'contact_email', w.contact_email, 'consent_version', w.consent_version);
end;
$$;

-- The abuse queue. The reporter is never shown.
create function lv.api_admin_abuse_reports(p_status text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_status text := coalesce(nullif(p_status, ''), 'open');
begin
  if v_denied is not null then return v_denied; end if;
  if v_status not in ('open', 'actioned', 'dismissed', 'all') then return lv.err('lv_invalid_input', 'Unknown status.'); end if;
  return jsonb_build_object('ok', true, 'reports', coalesce((
    select jsonb_agg(jsonb_build_object('report_id', r.id, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at,
             'campaign_id', c.id, 'campaign_title', c.title, 'join_code', c.join_code, 'blocked', c.blocked_at is not null,
             'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug, 'quick_survey', h.kind = 'personal',
             'open_reports', (select count(*) from lv.abuse_reports y where y.campaign_id = c.id and y.status = 'open'))
             order by r.created_at desc)
      from (select * from lv.abuse_reports x where v_status = 'all' or x.status = v_status order by x.created_at desc limit 200) r
      left join lv.campaigns c on c.id = r.campaign_id
      left join lv.hubs h on h.id = c.hub_id), '[]'::jsonb));
end;
$$;

create function lv.api_admin_report_dismiss(p_report uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  r record;
begin
  if v_denied is not null then return v_denied; end if;
  update lv.abuse_reports set status = 'dismissed' where id = p_report and status = 'open' returning * into r;
  if r.id is null then return lv.err('lv_not_found', 'No open report with that id.'); end if;
  perform lv.audit(lv.current_account_id(), null, 'abuse.dismissed', r.id::text);
  return jsonb_build_object('ok', true, 'status', 'dismissed');
end;
$$;

create function lv.api_admin_discover_list(p_status text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_status text := coalesce(nullif(p_status, ''), 'submitted');
begin
  if v_denied is not null then return v_denied; end if;
  if v_status not in ('submitted', 'approved', 'rejected', 'all') then return lv.err('lv_invalid_input', 'Unknown status.'); end if;
  return jsonb_build_object('ok', true, 'applications', coalesce((
    select jsonb_agg(jsonb_build_object('application_id', d.id, 'status', d.status, 'hub_id', h.id, 'hub_slug', h.slug,
             'hub_name', h.display_name, 'genuine_members_at_apply', d.genuine_members,
             'genuine_members_now', lv.genuine_active_members(h.id), 'family', lv.hub_family(h.id), 'applied_at', d.created_at,
             'decided_at', dd.decided_at, 'note', dd.note) order by d.created_at)
      from lv.discover_applications d join lv.hubs h on h.id = d.hub_id
      left join lv.discover_decisions dd on dd.application_id = d.id
     where v_status = 'all' or d.status = v_status), '[]'::jsonb));
end;
$$;

-- Track C reads lv.discover_applications.status = 'approved' for the listing; this is the only writer of decisions.
create function lv.api_admin_discover_decide(p_application uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_account uuid := lv.current_account_id();
  d record;
  v_decision text := case when p_approve then 'approved' else 'rejected' end;
begin
  if v_denied is not null then return v_denied; end if;
  if p_approve is null then return lv.err('lv_invalid_input', 'Approve or reject.'); end if;
  if p_note is not null and length(p_note) > 500 then return lv.err('lv_invalid_input', 'Keep the note under 500 characters.'); end if;
  select a.*, h.owner_account_id into d from lv.discover_applications a join lv.hubs h on h.id = a.hub_id
   where a.id = p_application for update of a;
  if d.id is null then return lv.err('lv_not_found', 'No such application.'); end if;
  if d.owner_account_id = v_account or d.submitted_by = v_account then
    return lv.err('lv_forbidden', 'Nobody can decide their own Hub''s application.');
  end if;
  update lv.discover_applications set status = v_decision where id = d.id;
  insert into lv.discover_decisions (application_id, decision, decided_by, decided_at, note)
  values (d.id, v_decision, v_account, now(), nullif(btrim(p_note), ''))
  on conflict (application_id) do update set decision = excluded.decision, decided_by = excluded.decided_by,
                                             decided_at = excluded.decided_at, note = excluded.note;
  perform lv.audit(v_account, d.hub_id, 'discover.' || v_decision, d.id::text);
  return jsonb_build_object('ok', true, 'status', v_decision);
end;
$$;

-- The billing log: type, outcome and reason only. Never the provider payload (none is stored) or references.
create function lv.api_admin_billing_events(p_limit int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'type', b.type, 'outcome', b.outcome, 'reason', b.detail->>'reason',
                                        'received_at', b.received_at) order by b.id desc)
      from (select * from lv.billing_events x order by x.id desc limit greatest(least(coalesce(p_limit, 100), 500), 1)) b), '[]'::jsonb));
end;
$$;

-- Outbox status: counts and recent rows without addresses or payloads.
create function lv.api_admin_email_outbox(p_limit int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true,
    'counts', coalesce((select jsonb_object_agg(s.status, s.n) from (select o.status, count(*) n from lv.email_outbox o group by o.status) s), '{}'::jsonb),
    'by_template', coalesce((select jsonb_object_agg(s.template, s.n) from (select o.template, count(*) n from lv.email_outbox o group by o.template) s), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'template', o.template, 'status', o.status, 'attempts', o.attempts,
                                         'last_error', o.last_error, 'created_at', o.created_at, 'sent_at', o.sent_at) order by o.created_at desc)
      from (select * from lv.email_outbox x order by x.created_at desc limit greatest(least(coalesce(p_limit, 50), 200), 1)) o), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_billing_config() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_billing_config(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_billing_portal_check() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_billing_portal_check(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_invite_email_send(p_hub uuid, p_code text, p_to text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_invite_email_send(p_hub, p_code, p_to); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_overview(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_waitlist(p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_waitlist(p_limit, p_offset); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_waitlist_contact(p_entry uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_waitlist_contact(p_entry); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_abuse_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_abuse_reports(p_status); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_report_dismiss(p_report uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_report_dismiss(p_report); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_discover_list(p_status text default 'submitted') returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_discover_list(p_status); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_discover_decide(p_application uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_discover_decide(p_application, p_approve, p_note); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_billing_events(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_billing_events(p_limit); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_email_outbox(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_email_outbox(p_limit); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- Grants: explicit, never PUBLIC (LC-05). Every new lv_api function is for signed-in callers only; the admin ones
-- refuse non-admins inside. The service-role path is usage on lv plus execute on the named functions (LC-20).
-- ---------------------------------------------------------------------------------------------------------
revoke all on function lv_api.lv_billing_config(), lv_api.lv_billing_portal_check(), lv_api.lv_invite_email_send(uuid, text, text),
  lv_api.lv_admin_overview(), lv_api.lv_admin_waitlist(int, int), lv_api.lv_admin_waitlist_contact(uuid),
  lv_api.lv_admin_abuse_reports(text), lv_api.lv_admin_report_dismiss(uuid), lv_api.lv_admin_discover_list(text),
  lv_api.lv_admin_discover_decide(uuid, boolean, text), lv_api.lv_admin_billing_events(int), lv_api.lv_admin_email_outbox(int) from public;

revoke all on all tables in schema lv from public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema lv from anon';
    execute 'revoke all on all functions in schema lv from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema lv from authenticated';
    execute 'revoke all on all functions in schema lv from authenticated';
    execute 'grant execute on function lv_api.lv_billing_config(), lv_api.lv_billing_portal_check(), lv_api.lv_invite_email_send(uuid, text, text),
      lv_api.lv_admin_overview(), lv_api.lv_admin_waitlist(int, int), lv_api.lv_admin_waitlist_contact(uuid),
      lv_api.lv_admin_abuse_reports(text), lv_api.lv_admin_report_dismiss(uuid), lv_api.lv_admin_discover_list(text),
      lv_api.lv_admin_discover_decide(uuid, boolean, text), lv_api.lv_admin_billing_events(int), lv_api.lv_admin_email_outbox(int) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function lv.billing_apply_event_core(text, text, text, jsonb) from service_role';
    execute 'grant usage on schema lv to service_role';
    execute 'grant execute on function lv.billing_apply_event(text, text, text, jsonb), lv.checkout_session_context(uuid),
      lv.billing_customer_set(uuid, text), lv.checkout_intent_attach(uuid, text), lv.billing_customer_of(uuid),
      lv.email_reservation_sweep(), lv.email_claim(int), lv.email_mark(uuid, text, text, text), lv.email_retention_sweep()
      to service_role';
  end if;
end $$;

commit;
