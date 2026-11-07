-- Rollback for 000017_v2_billing_hardening. Restores the 000016 billing grant path, the 000004 answer validation
-- and the 000014 waitlist functions (captured with pg_get_functiondef), and drops the seat counter.
drop trigger if exists waitlist_entries_count_issued on lv.waitlist_entries;
drop function if exists lv.waitlist_count_issued();

CREATE OR REPLACE FUNCTION lv.billing_apply_event(p_provider text, p_event_id text, p_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
  v_p jsonb := coalesce(p_payload, '{}'::jsonb);
  it lv.checkout_intents;
  pr record;
  v_account uuid;
  v_hub uuid;
  v_slug text;
  v_weeks int;
  v_sub text;
  v_ref text;
  v_end timestamptz;
  v_outcome text := 'applied';
  v_detail jsonb := '{}'::jsonb;
  r lv.hub_reservations;
  v_n int;
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
  v_sub := nullif(v_p->>'subscription', '');
  v_ref := coalesce(v_sub, nullif(v_p->>'payment_ref', ''), p_event_id);

  if p_type = 'checkout.session.completed' then
    if v_p->>'intent_id' ~ '^[0-9a-f-]{36}$' then
      select * into it from lv.checkout_intents x where x.id = (v_p->>'intent_id')::uuid for update;
    end if;
    begin
      v_account := coalesce(it.account_id, (v_p->>'account_id')::uuid);
      v_hub := coalesce(it.hub_id, (v_p->>'hub_id')::uuid);
      v_weeks := coalesce(it.weeks, (v_p->>'weeks')::int);
    exception when others then
      v_account := null;
    end;
    v_slug := lower(btrim(coalesce(it.slug, v_p->>'slug')));
    select * into pr from lv.products x where x.product = coalesce(it.product, v_p->>'product');

    if pr.product is null or not pr.purchasable then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'unknown_or_unpurchasable_product');
    elsif v_account is null or not exists (select 1 from lv.accounts a where a.id = v_account) then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'unknown_account');
    elsif v_hub is not null and lv.hub_kind(v_hub) is distinct from 'community' then
      v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'unknown_hub');
    elsif pr.product = 'hub_reservation' then
      r := lv.slug_hold(v_slug);
      if v_slug is null or exists (select 1 from lv.hubs h where h.slug = v_slug)
         or exists (select 1 from lv.reserved_slugs s where s.slug = v_slug)
         or (r.id is not null and r.account_id is distinct from v_account) then
        v_outcome := 'rejected'; v_detail := jsonb_build_object('reason', 'slug_unavailable', 'slug', v_slug);
      elsif r.id is not null then
        -- Renewal in ACTIVE or GRACE: another 12 months from the current expiry.
        update lv.hub_reservations set expires_at = expires_at + make_interval(months => coalesce(pr.period_months, 12))
         where id = r.id;
        v_detail := jsonb_build_object('reservation', r.id, 'renewed', true);
      else
        insert into lv.hub_reservations (slug, account_id, expires_at, external_ref)
        values (v_slug, v_account, now() + make_interval(months => coalesce(pr.period_months, 12)), v_ref)
        returning id into r.id;
        v_detail := jsonb_build_object('reservation', r.id, 'renewed', false);
      end if;
    elsif pr.interval = 'month' then
      if v_hub is not null then
        insert into lv.entitlements (scope, account_id, hub_id, family, product, source, starts_at, ends_at, external_ref)
        values ('hub', v_account, v_hub, pr.family, pr.product, 'billing', now(), coalesce(v_end, now() + interval '1 month'), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_entitlement');
      else
        insert into lv.hub_credits (account_id, family, product, source, ends_at, external_ref)
        values (v_account, pr.family, pr.product, 'billing', coalesce(v_end, now() + interval '1 month'), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_credit');
      end if;
    elsif pr.interval = 'weeks' then
      v_weeks := greatest(coalesce(v_weeks, pr.first_period_weeks), pr.first_period_weeks);
      if v_hub is not null then
        insert into lv.entitlements (scope, account_id, hub_id, family, product, source, starts_at, ends_at, external_ref)
        values ('hub', v_account, v_hub, pr.family, pr.product, 'billing', now(), now() + make_interval(weeks => v_weeks), v_ref);
        v_detail := jsonb_build_object('granted', 'hub_entitlement', 'weeks', v_weeks);
      else
        insert into lv.hub_credits (account_id, family, product, source, duration, external_ref)
        values (v_account, pr.family, pr.product, 'billing', make_interval(weeks => v_weeks), v_ref);
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
      v_detail := jsonb_build_object('extended', v_n);
      if v_n = 0 and not found then v_outcome := 'ignored'; end if;
    end if;

  elsif p_type = 'customer.subscription.deleted' then
    -- Access runs to the end of the paid period; nothing is deleted, nothing is prorated.
    if v_sub is null then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'no_subscription');
    else
      update lv.entitlements set ends_at = greatest(starts_at, coalesce(v_end, ends_at, now())) where external_ref = v_sub;
      get diagnostics v_n = row_count;
      update lv.hub_credits set ends_at = coalesce(v_end, now()) where external_ref = v_sub and consumed_at is null;
      v_detail := jsonb_build_object('ended', v_n);
    end if;

  elsif p_type = 'charge.refunded' then
    -- An explicit refund revokes what that payment bought (Campaign plans, reservations); nothing else revokes.
    if v_ref = p_event_id then
      v_outcome := 'ignored'; v_detail := jsonb_build_object('reason', 'no_payment_ref');
    else
      update lv.entitlements set ends_at = greatest(starts_at, now()) where external_ref = v_ref and (ends_at is null or ends_at > now());
      get diagnostics v_n = row_count;
      update lv.hub_credits set ends_at = now() where external_ref = v_ref and consumed_at is null;
      update lv.hub_reservations set released_at = coalesce(released_at, now()) where external_ref = v_ref;
      v_detail := jsonb_build_object('revoked', v_n);
    end if;
  else
    v_outcome := 'ignored';
  end if;

  update lv.billing_events set outcome = v_outcome, detail = v_detail where id = v_id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'outcome', v_outcome);
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.validate_answers(p_campaign uuid, p_answers jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      return 'missing answer for question ' || q.position;
    end if;

    if q.kind = 'rating' then
      if jsonb_typeof(v_val) <> 'number' then return 'rating must be a number'; end if;
      if (v_val)::numeric < 1 or (v_val)::numeric > 5 then return 'rating out of range'; end if;
    elsif q.kind in ('single_choice', 'multi_choice', 'yes_no', 'text') then
      if jsonb_typeof(v_val) = 'null' then return 'empty answer'; end if;
    end if;
    v_seen := v_seen + 1;
  end loop;

  if v_seen = 0 then return 'no questions'; end if;
  return null;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.api_waitlist_join(p_contact_email text, p_intended_hub_name text, p_consent_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.ensure_account();
  w record;
  v_email text := nullif(btrim(p_contact_email), '');
  v_hub_name text := nullif(btrim(p_intended_hub_name), '');
  v_consent text := nullif(btrim(p_consent_version), '');
  v_taken int;
  v_status text;
  v_pos int;
  v_ent uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return lv.err('lv_invalid_input', 'That contact email does not look right.');
  end if;
  if v_hub_name is not null and length(v_hub_name) > 80 then return lv.err('lv_invalid_input', 'Keep the Hub name under 80 characters.'); end if;
  -- A contact email is kept only with consent to the current notice (launch and account updates only).
  if v_email is not null and v_consent is distinct from (lv.policy_json('waitlist.consent_version') #>> '{}') then
    return lv.err_x('lv_invalid_input', 'Accept the current notice to leave a contact email.',
                    jsonb_build_object('consent_version', lv.policy_json('waitlist.consent_version') #>> '{}'));
  end if;
  if v_email is null then v_consent := null; end if;

  -- One global lock: the seat count and the admission decision are a single serial step.
  perform pg_advisory_xact_lock(hashtextextended('lv_waitlist', 0));

  select * into w from lv.waitlist_entries x where x.account_id = v_account;
  if w.id is not null then
    return jsonb_build_object('ok', true, 'status', w.status, 'position', w.position, 'already_joined', true)
      || case when w.status = 'admitted' then jsonb_build_object('granted', (
            select lv.entitlement_json(e.id) from lv.entitlements e
             where e.account_id = v_account and e.scope = 'account' and e.product = 'founding' and e.source = 'waitlist'
             order by e.created_at limit 1)) else '{}'::jsonb end;
  end if;

  select count(*) into v_taken from lv.waitlist_entries x where x.status = 'admitted';
  if v_taken < lv.waitlist_seats() then
    v_status := 'admitted';
    v_pos := v_taken + 1;
  else
    v_status := 'waitlisted';
    select count(*) + 1 into v_pos from lv.waitlist_entries x where x.status = 'waitlisted';
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
$function$

;

CREATE OR REPLACE FUNCTION lv.api_waitlist_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.current_account_id();
  v_taken int;
  v_out jsonb;
begin
  select count(*) into v_taken from lv.waitlist_entries w where w.status = 'admitted';
  v_out := jsonb_build_object('ok', true, 'seats_total', lv.waitlist_seats(), 'seats_taken', v_taken,
                              'open', v_taken < lv.waitlist_seats());
  if v_account is not null then v_out := v_out || jsonb_build_object('me', lv.waitlist_me(v_account)); end if;
  return v_out;
end;
$function$

;

drop table if exists lv.waitlist_counters;
