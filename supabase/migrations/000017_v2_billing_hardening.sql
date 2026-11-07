-- LunchVoice v2 canonical 17: billing hardening and launch-review fixes (compliance re-review, section 7).
--
-- 000014-000016 are released as they are; this file changes behaviour only through create-or-replace and new
-- objects, so it can be applied (and rolled back) on its own.
--
-- NEW-01 (HIGH) A grant is bound to what Stripe confirmed. For checkout.session.completed and
--   checkout.session.async_payment_succeeded, lv.billing_apply_event records `rejected` and grants nothing unless:
--     * a checkout intent exists for the session (client_reference_id). Metadata alone is never trusted: product,
--       account, Hub, slug and weeks come from the intent only;
--     * payment_status is 'paid' or 'no_payment_required' (a delayed payment grants on async_payment_succeeded);
--     * currency is 'usd';
--     * amount_subtotal (pre-tax; Stripe Tax adds tax on top) equals the intent's amount_cents;
--     * the intent has not been used already (so completed + async_succeeded grant exactly once).
-- NEW-02 (MEDIUM) Refunds follow F-08. Only a FULL refund acts, and only on what has not started:
--     * a Campaign plan (credit not yet used, or a window that has not started) is revoked;
--     * a Campaign plan whose window has started, and any partial refund, is recorded for support, not revoked;
--     * a Hub Name Reservation is released;
--     * a Hub subscription is never ended by a refund. customer.subscription.deleted keeps access to the end of the
--       paid period, unless a full refund of that subscription was recorded first and the cancellation is immediate
--       (ended_at given): then access ends at ended_at (explicit full refund + cancellation).
-- NEW-06 (LOW) A question whose config has "optional": true may be skipped by members and guests. A missing
--   required answer is still refused, and a submission must answer at least one question.
-- NEW-08 (LOW) Waitlist seats are never re-issued. A counter records the highest admitted and waitlisted positions
--   ever handed out; deleting an account does not free its seat, so at most 'waitlist.seats' Founding grants are
--   ever issued and positions never repeat. (Decision taken for the founder; documented in API_CONTRACT.md.)

begin;

-- ---------------------------------------------------------------------------------------------------------
-- NEW-06: optional questions
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.validate_answers(p_campaign uuid, p_answers jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  v_val jsonb;
  v_seen int := 0;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return 'answers must be an array'; end if;

  for q in select * from lv.campaign_questions where campaign_id = p_campaign loop
    select e->'value' into v_val
      from jsonb_array_elements(p_answers) e
     where (e->>'question_id')::uuid = q.id
     limit 1;

    if v_val is null or v_val = 'null'::jsonb then
      if coalesce(q.config->>'optional', 'false') = 'true' then continue; end if;
      return 'missing answer for question ' || q.position;
    end if;

    if q.kind = 'rating' then
      if jsonb_typeof(v_val) <> 'number' then return 'rating must be a number'; end if;
      if (v_val)::numeric < 1 or (v_val)::numeric > 5 then return 'rating out of range'; end if;
    end if;
    v_seen := v_seen + 1;
  end loop;

  if v_seen = 0 then return 'answer at least one question'; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- NEW-08: seats are never re-issued
-- ---------------------------------------------------------------------------------------------------------
create table lv.waitlist_counters (
  id boolean primary key default true check (id),
  admitted_issued int not null default 0 check (admitted_issued >= 0),
  waitlisted_issued int not null default 0 check (waitlisted_issued >= 0)
);
alter table lv.waitlist_counters enable row level security;
insert into lv.waitlist_counters (admitted_issued, waitlisted_issued)
select coalesce(max(position) filter (where status = 'admitted'), 0), coalesce(max(position) filter (where status = 'waitlisted'), 0)
  from lv.waitlist_entries;

-- Every inserted row moves the counter forward; deleting a row never moves it back.
create function lv.waitlist_count_issued() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update lv.waitlist_counters
     set admitted_issued = case when new.status = 'admitted' then greatest(admitted_issued, new.position) else admitted_issued end,
         waitlisted_issued = case when new.status = 'waitlisted' then greatest(waitlisted_issued, new.position) else waitlisted_issued end
   where id;
  return new;
end;
$$;
create trigger waitlist_entries_count_issued after insert on lv.waitlist_entries
  for each row execute function lv.waitlist_count_issued();

create or replace function lv.api_waitlist_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_taken int := (select c.admitted_issued from lv.waitlist_counters c where c.id);
  v_out jsonb;
begin
  v_out := jsonb_build_object('ok', true, 'seats_total', lv.waitlist_seats(), 'seats_taken', least(v_taken, lv.waitlist_seats()),
                              'open', v_taken < lv.waitlist_seats());
  if v_account is not null then v_out := v_out || jsonb_build_object('me', lv.waitlist_me(v_account)); end if;
  return v_out;
end;
$$;

create or replace function lv.api_waitlist_join(p_contact_email text, p_intended_hub_name text, p_consent_version text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  w record;
  cn record;
  v_email text := nullif(btrim(p_contact_email), '');
  v_hub_name text := nullif(btrim(p_intended_hub_name), '');
  v_consent text := nullif(btrim(p_consent_version), '');
  v_status text;
  v_pos int;
  v_ent uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return lv.err('lv_invalid_input', 'That contact email does not look right.');
  end if;
  if v_hub_name is not null and length(v_hub_name) > 80 then return lv.err('lv_invalid_input', 'Keep the Hub name under 80 characters.'); end if;
  if v_email is not null and v_consent is distinct from (lv.policy_json('waitlist.consent_version') #>> '{}') then
    return lv.err_x('lv_invalid_input', 'Accept the current notice to leave a contact email.',
                    jsonb_build_object('consent_version', lv.policy_json('waitlist.consent_version') #>> '{}'));
  end if;
  if v_email is null then v_consent := null; end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_waitlist', 0));

  select * into w from lv.waitlist_entries x where x.account_id = v_account;
  if w.id is not null then
    return jsonb_build_object('ok', true, 'status', w.status, 'position', w.position, 'already_joined', true)
      || case when w.status = 'admitted' then jsonb_build_object('granted', (
            select lv.entitlement_json(e.id) from lv.entitlements e
             where e.account_id = v_account and e.scope = 'account' and e.product = 'founding' and e.source = 'waitlist'
             order by e.created_at limit 1)) else '{}'::jsonb end;
  end if;

  select * into cn from lv.waitlist_counters c where c.id for update;
  if cn.admitted_issued < lv.waitlist_seats() then
    v_status := 'admitted';
    v_pos := cn.admitted_issued + 1;
  else
    v_status := 'waitlisted';
    v_pos := cn.waitlisted_issued + 1;
  end if;

  insert into lv.waitlist_entries (account_id, status, position, contact_email, intended_hub_name, consent_version)
  values (v_account, v_status, v_pos, v_email, v_hub_name, v_consent);

  if v_status = 'admitted' then
    insert into lv.entitlements (scope, account_id, family, product, source, starts_at, ends_at)
    values ('account', v_account, 'starter', 'founding', 'waitlist', now(), null)
    returning id into v_ent;
    insert into lv.hub_credits (account_id, family, product, source, entitlement_id)
    values (v_account, 'starter', 'founding', 'waitlist', v_ent);
  end if;
  perform lv.audit(v_account, null, 'waitlist.' || v_status, v_account::text, jsonb_build_object('position', v_pos));

  return jsonb_build_object('ok', true, 'status', v_status, 'position', v_pos, 'already_joined', false)
    || case when v_ent is not null then jsonb_build_object('granted', lv.entitlement_json(v_ent)) else '{}'::jsonb end;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- NEW-01, NEW-02: billing grants bound to confirmed payments; refunds per F-08
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.billing_apply_event(p_provider text, p_event_id text, p_type text, p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_p jsonb := coalesce(p_payload, '{}'::jsonb);
  it lv.checkout_intents;
  pr record;
  v_sub text;
  v_ref text;
  v_end timestamptz;
  v_ended timestamptz;
  v_outcome text := 'applied';
  v_detail jsonb := '{}'::jsonb;
  r lv.hub_reservations;
  v_n int;
  v_m int;
  v_full boolean;
  v_weeks int;
begin
  insert into lv.billing_events (provider, event_id, type, outcome)
  values (p_provider, p_event_id, coalesce(p_type, 'unknown'), 'ignored')
  on conflict (provider, event_id) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  begin
    v_end := case when v_p->>'period_end' ~ '^[0-9]+$' then to_timestamp((v_p->>'period_end')::bigint)
                  else (v_p->>'period_end')::timestamptz end;
  exception when others then v_end := null; end;
  begin
    v_ended := case when v_p->>'ended_at' ~ '^[0-9]+$' then to_timestamp((v_p->>'ended_at')::bigint)
                    else (v_p->>'ended_at')::timestamptz end;
  exception when others then v_ended := null; end;
  v_sub := nullif(v_p->>'subscription', '');
  v_ref := coalesce(v_sub, nullif(v_p->>'payment_ref', ''), p_event_id);

  if p_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    if v_p->>'intent_id' ~ '^[0-9a-f-]{36}$' then
      select * into it from lv.checkout_intents x where x.id = (v_p->>'intent_id')::uuid for update;
    end if;
    select * into pr from lv.products x where x.product = it.product;

    -- Every condition below must hold before anything is granted (NEW-01).
    if it.id is null then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'no_intent');
    elsif it.completed_at is not null then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'intent_already_used', 'intent', it.id);
    elsif coalesce(v_p->>'payment_status', '') not in ('paid', 'no_payment_required') then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'not_paid', 'payment_status', v_p->>'payment_status', 'intent', it.id);
    elsif lower(coalesce(v_p->>'currency', '')) <> 'usd' then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'currency', 'intent', it.id);
    elsif coalesce(v_p->>'amount_subtotal', '') !~ '^[0-9]+$' or (v_p->>'amount_subtotal')::bigint <> it.amount_cents then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'amount_mismatch', 'intent', it.id,
                                            'expected', it.amount_cents, 'paid', v_p->>'amount_subtotal');
    elsif pr.product is null or not pr.purchasable then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'unknown_or_unpurchasable_product');
    elsif it.account_id is null or not exists (select 1 from lv.accounts a where a.id = it.account_id) then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'unknown_account');
    elsif it.hub_id is not null and lv.hub_kind(it.hub_id) is distinct from 'community' then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'unknown_hub');
    elsif pr.product = 'hub_reservation' then
      r := lv.slug_hold(it.slug);
      if it.slug is null or exists (select 1 from lv.hubs h where h.slug = it.slug)
         or exists (select 1 from lv.reserved_slugs s where s.slug = it.slug)
         or (r.id is not null and r.account_id is distinct from it.account_id) then
        v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'slug_unavailable', 'slug', it.slug);
      elsif r.id is not null then
        update lv.hub_reservations set expires_at = expires_at + make_interval(months => coalesce(pr.period_months, 12)),
                                       external_ref = v_ref
         where id = r.id;
        v_detail := jsonb_build_object('reservation', r.id, 'renewed', true);
      else
        insert into lv.hub_reservations (slug, account_id, expires_at, external_ref)
        values (it.slug, it.account_id, now() + make_interval(months => coalesce(pr.period_months, 12)), v_ref)
        returning id into r.id;
        v_detail := jsonb_build_object('reservation', r.id, 'renewed', false);
      end if;
    elsif pr.interval = 'month' then
      if it.hub_id is not null then
        insert into lv.entitlements (scope, account_id, hub_id, family, product, source, starts_at, ends_at, external_ref)
        values ('hub', it.account_id, it.hub_id, pr.family, pr.product, 'billing', now(), coalesce(v_end, now() + interval '1 month'), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_entitlement');
      else
        insert into lv.hub_credits (account_id, family, product, source, ends_at, external_ref)
        values (it.account_id, pr.family, pr.product, 'billing', coalesce(v_end, now() + interval '1 month'), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_credit');
      end if;
    elsif pr.interval = 'weeks' then
      -- Exactly the weeks the intent was priced for.
      v_weeks := it.weeks;
      if v_weeks is null or v_weeks < pr.first_period_weeks then
        v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'weeks');
      elsif it.hub_id is not null then
        insert into lv.entitlements (scope, account_id, hub_id, family, product, source, starts_at, ends_at, external_ref)
        values ('hub', it.account_id, it.hub_id, pr.family, pr.product, 'billing', now(), now() + make_interval(weeks => v_weeks), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_entitlement', 'weeks', v_weeks);
      else
        insert into lv.hub_credits (account_id, family, product, source, duration, external_ref)
        values (it.account_id, pr.family, pr.product, 'billing', make_interval(weeks => v_weeks), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_credit', 'weeks', v_weeks);
      end if;
    end if;
    if it.id is not null and v_outcome = 'applied' then update lv.checkout_intents set completed_at = now() where id = it.id; end if;

  elsif p_type = 'invoice.paid' then
    if v_sub is null or v_end is null then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'no_subscription_period');
    else
      update lv.entitlements set ends_at = greatest(coalesce(ends_at, v_end), v_end) where external_ref = v_sub;
      get diagnostics v_n = row_count;
      update lv.hub_credits set ends_at = greatest(coalesce(ends_at, v_end), v_end) where external_ref = v_sub and consumed_at is null;
      get diagnostics v_m = row_count;
      -- Remember which payment paid which subscription, so a later refund can be recognised (NEW-02).
      v_detail := jsonb_build_object('extended', v_n + v_m, 'subscription', v_sub, 'payment_ref', v_p->>'payment_ref');
      if v_n + v_m = 0 then v_outcome := 'ignored'; end if;
    end if;

  elsif p_type = 'customer.subscription.deleted' then
    if v_sub is null then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'no_subscription');
    else
      -- Access runs to the end of the paid period. Only an explicit full refund recorded for this subscription,
      -- followed by an immediate cancellation (ended_at), ends it earlier.
      if v_ended is not null and exists (select 1 from lv.billing_events b
                                          where b.type = 'charge.refunded' and b.detail->>'subscription' = v_sub
                                            and b.detail->>'full' = 'true') then
        update lv.entitlements set ends_at = greatest(starts_at, v_ended) where external_ref = v_sub;
        get diagnostics v_n = row_count;
        v_detail := jsonb_build_object('ended', v_n, 'reason', 'full_refund_and_cancellation');
      else
        update lv.entitlements set ends_at = greatest(starts_at, coalesce(v_end, ends_at, now())) where external_ref = v_sub;
        get diagnostics v_n = row_count;
        v_detail := jsonb_build_object('ended', v_n, 'reason', 'end_of_paid_period');
      end if;
      update lv.hub_credits set ends_at = coalesce(v_end, now()) where external_ref = v_sub and consumed_at is null;
    end if;

  elsif p_type = 'charge.refunded' then
    v_ref := nullif(v_p->>'payment_ref', '');
    v_full := coalesce((v_p->>'refunded')::boolean, false)
              or (v_p->>'amount' ~ '^[0-9]+$' and v_p->>'amount_refunded' ~ '^[0-9]+$'
                  and (v_p->>'amount_refunded')::bigint >= (v_p->>'amount')::bigint and (v_p->>'amount')::bigint > 0);
    -- The subscription this payment paid for, if any (from the invoice.paid log).
    select b.detail->>'subscription' into v_sub from lv.billing_events b
     where b.type = 'invoice.paid' and v_ref is not null and b.detail->>'payment_ref' = v_ref limit 1;
    if v_ref is null then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'no_payment_ref');
    elsif not v_full then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'partial_refund_recorded_for_support', 'payment_ref', v_ref);
    elsif v_sub is not null or exists (select 1 from lv.entitlements e join lv.products p on p.product = e.product
                                        where e.external_ref = v_ref and p.interval = 'month') then
      -- A Hub subscription refund never ends paid-for access by itself.
      v_outcome := 'ignored';
      v_detail := jsonb_build_object('reason', 'subscription_refund_recorded', 'subscription', v_sub, 'full', true, 'payment_ref', v_ref);
    else
      -- Campaign plans: revoke only what has not started (an unused credit or a future window).
      update lv.hub_credits set ends_at = now() where external_ref = v_ref and consumed_at is null;
      get diagnostics v_m = row_count;
      update lv.entitlements set ends_at = starts_at where external_ref = v_ref and starts_at > now();
      get diagnostics v_n = row_count;
      update lv.hub_reservations set released_at = coalesce(released_at, now()) where external_ref = v_ref and released_at is null;
      v_detail := jsonb_build_object('revoked_credits', v_m, 'revoked_windows', v_n, 'full', true, 'payment_ref', v_ref,
        'started_windows_kept', (select count(*) from lv.entitlements e where e.external_ref = v_ref and e.starts_at <= now()
                                    and (e.ends_at is null or e.ends_at > now())));
      if (v_detail->>'started_windows_kept')::int > 0 and v_m + v_n = 0 then
        v_outcome := 'ignored'; v_detail := v_detail || jsonb_build_object('reason', 'started_window_recorded_for_support');
      end if;
    end if;
  else
    v_outcome := 'ignored';
  end if;

  update lv.billing_events set outcome = v_outcome, detail = v_detail where id = v_id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'outcome', v_outcome);
end;
$$;

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
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function lv.billing_apply_event(text, text, text, jsonb) to service_role';
  end if;
end $$;

commit;
