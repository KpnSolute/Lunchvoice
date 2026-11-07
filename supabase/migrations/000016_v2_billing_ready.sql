-- LunchVoice v2 canonical 16: billing-ready, Hub Name Reservation, strict anonymous analytics, export, Discover
-- (launch plan step 4).
--
-- Billing (A-03). Nothing here charges money. lv_checkout_start fails closed (lv_billing_unavailable) until policy
-- 'billing.provider_ready' is true and a payment link exists for the product in 'billing.payment_links'; then it
-- records a checkout intent and returns the link with client_reference_id = intent id. Stripe Checkout / Payment
-- Links must have automatic tax (Stripe Tax) enabled: no tax logic lives in SQL. The billing-webhook Edge Function
-- verifies Stripe's signature and calls lv.billing_apply_event over a direct database connection; that function is
-- service-role only, lives in lv (never lv_api), and is idempotent on (provider, event_id). Semantics (founder):
--   * Hub subscription cancelled: access runs to the end of the paid period (ends_at = period end); no proration;
--     no data deleted.
--   * Campaign plans are duration windows. A refund event revokes the entitlement (or the unused credit); nothing
--     else revokes one. Refund amounts are handled in Stripe.
--   * Grants are additive and never delete data.
--
-- Hub Name Reservation: ACTIVE for 12 months, then GRACE for 'reservation.grace_days' (25), then RELEASED, all
-- derived from time. During ACTIVE and GRACE only the holder can create a Hub with that slug. A reservation grants no
-- features. A released or reserved slug never exposes anyone's data: a new Hub always has a new id.
--
-- Strict anonymous analytics (founder L-07, compliance LC-01, LC-02), one engine for the screen and the export:
--   * cells below the minimum cohort are merged into ONE "withheld" bucket with no per-option presence;
--   * if the withheld bucket would be smaller than the cohort, published cells are moved into it until it is not;
--   * a cell equal to the question total (unanimity, dominance) withholds the whole question;
--   * whenever anything in a question is withheld, its mean and n are withheld too;
--   * participation_rate is withheld at 100% or when eligible minus respondents is below the cohort.
-- Free text (L-10): text_responses lists text answers to authorised creators only when at least min_cohort answers
-- exist, as plain strings in random order with no person, time or submission link; never in aggregates or exports.
-- Guests (L-11): every result carries guest_n so the UI can say "includes unverified guest responses".
--
-- Retention (L-13): lv.retention_sweep() (service-role only, not scheduled here) trims audit and analytics query
-- logs after 'retention.logs_days' (365) and unlinks guest rate-limit hashes after 'retention.guest_hash_days' (7).
-- Schedule later with pg_cron, e.g. select cron.schedule('lv-retention', '17 3 * * *', 'select lv.retention_sweep()').

begin;

insert into lv.policy (key, value, note) values
  ('billing.provider_ready', 'false'::jsonb, 'Checkout fails closed (lv_billing_unavailable) until the founder wires Stripe and sets this true.'),
  ('billing.payment_links', null, 'JSON object product -> Stripe Payment Link URL (automatic tax enabled). NULL: no checkout.'),
  ('reservation.grace_days', '25'::jsonb, 'Canonical: Hub Name Reservation grace after expiry.'),
  ('discover.active_window_days', '90'::jsonb, 'A genuine active member took part in one of the Hub''s Campaigns within this many days.'),
  ('retention.logs_days', '365'::jsonb, 'L-13: audit and analytics query logs are kept 12 months.'),
  ('retention.guest_hash_days', '7'::jsonb, 'L-13: guest rate-limit key hashes are unlinked after 7 days.');

-- ---------------------------------------------------------------------------------------------------------
-- Capabilities: analytics.export and billing.view; the Owner role holds them
-- ---------------------------------------------------------------------------------------------------------
insert into lv.capabilities (capability, cap_group, label) values
  ('analytics.export', 'analytics', 'Export released results'),
  ('billing.view', 'billing', 'View the plan and billing');
insert into lv.role_capabilities (role_id, capability)
select r.id, c from lv.roles r cross join unnest(array['analytics.export', 'billing.view']) c where r.is_owner
on conflict do nothing;

create or replace function lv.owner_bootstrap_roles(p_hub uuid, p_owner uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_role uuid;
begin
  select id into v_member from lv.hub_memberships
   where hub_id = p_hub and account_id = p_owner and status = 'accepted';
  if v_member is null then
    raise exception 'lv_invalid_input: the Owner must be an accepted member first' using errcode = '42501';
  end if;
  if not exists (select 1 from lv.hubs h where h.id = p_hub and h.owner_account_id = p_owner) then
    raise exception 'lv_invalid_input: hub owner mismatch';
  end if;

  insert into lv.roles (hub_id, key, name, is_owner, is_system)
  values (p_hub, 'owner', 'Owner', true, true)
  on conflict (hub_id, key) do update set name = excluded.name
  returning id into v_role;

  -- The Owner holds every capability in the catalogue.
  insert into lv.role_capabilities (role_id, capability)
  select v_role, c.capability from lv.capabilities c
  on conflict do nothing;
  insert into lv.membership_roles (membership_id, role_id) values (v_member, v_role) on conflict do nothing;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Strict suppression engine (anonymous Campaigns)
-- ---------------------------------------------------------------------------------------------------------
-- p_cells: [{key, n}], p_total: the number of answers to the question (a multi-choice answer counts once).
-- Returns {cells:[...], withheld:bool, reason, any_withheld:bool}.
create function lv.safe_cells(p_cells jsonb, p_min int, p_total bigint) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_pub jsonb := '[]'::jsonb;
  v_w bigint := 0;
  c jsonb;
  v_small jsonb;
begin
  if p_total is null or p_total = 0 then
    return jsonb_build_object('cells', '[]'::jsonb, 'withheld', false, 'reason', null, 'any_withheld', false);
  end if;
  if p_total < p_min then
    return jsonb_build_object('cells', '[]'::jsonb, 'withheld', true, 'reason', 'below_min_cohort', 'any_withheld', true);
  end if;
  -- Dominance: one option holding every answer would reveal each respondent's answer.
  if exists (select 1 from jsonb_array_elements(p_cells) x where (x->>'n')::bigint >= p_total) then
    return jsonb_build_object('cells', '[]'::jsonb, 'withheld', true, 'reason', 'dominance', 'any_withheld', true);
  end if;

  for c in select * from jsonb_array_elements(p_cells) loop
    if (c->>'n')::bigint >= p_min then v_pub := v_pub || c; else v_w := v_w + (c->>'n')::bigint; end if;
  end loop;
  -- A withheld bucket smaller than the cohort could be pinned down by subtraction: grow it with the smallest
  -- published cells until it is at least the cohort size.
  while v_w > 0 and v_w < p_min and jsonb_array_length(v_pub) > 0 loop
    select x into v_small from jsonb_array_elements(v_pub) x order by (x->>'n')::bigint, x->>'key' limit 1;
    v_w := v_w + (v_small->>'n')::bigint;
    v_pub := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_pub) x where x <> v_small);
  end loop;
  if jsonb_array_length(v_pub) = 0 or (v_w > 0 and v_w < p_min) then
    return jsonb_build_object('cells', '[]'::jsonb, 'withheld', true, 'reason', 'below_min_cohort', 'any_withheld', true);
  end if;

  return jsonb_build_object(
    'cells', (select coalesce(jsonb_agg(jsonb_build_object('key', x->>'key', 'n', (x->>'n')::bigint, 'suppressed', false, 'reason', null)
                                        order by x->>'key'), '[]'::jsonb) from jsonb_array_elements(v_pub) x)
             || case when v_w > 0 then jsonb_build_array(jsonb_build_object('key', null, 'n', null, 'suppressed', true, 'reason', 'withheld'))
                     else '[]'::jsonb end,
    'withheld', false, 'reason', null, 'any_withheld', v_w > 0);
end;
$$;

create function lv.question_cells(p_campaign uuid, p_question uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb)
    from (select e.k, count(*) as cn
            from lv.answers a
            join lv.submissions s on s.id = a.submission_id
            cross join lateral jsonb_array_elements_text(
              case when jsonb_typeof(a.value) = 'array' then a.value else jsonb_build_array(a.value) end) as e(k)
           where s.campaign_id = p_campaign and a.question_id = p_question
           group by e.k) x
$$;

create function lv.question_total(p_campaign uuid, p_question uuid) returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from lv.answers a join lv.submissions s on s.id = a.submission_id
       where s.campaign_id = p_campaign and a.question_id = p_question $$;

create or replace function lv.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record;
  q record;
  v_pol jsonb;
  v_sensitive boolean;
  v_n bigint;
  v_guests bigint;
  v_rel record;
  v_cells jsonb;
  v_safe jsonb;
  v_min int;
  v_part jsonb;
  v_eligible bigint;
  v_mean numeric;
  v_total bigint;
  v_text_min int;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if c.status = 'draft' then return lv.err('lv_lifecycle_invalid', 'This Campaign has no results yet.'); end if;

  v_sensitive := (c.anonymity = 'anonymous');
  select count(*) into v_guests from lv.guest_participation g where g.campaign_id = p_campaign;

  if v_sensitive then
    v_pol := lv.analytics_policy_state();
    if v_pol ? 'missing' then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'policy_missing');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_policy_undecided',
        'message', 'Anonymous results are not available until the privacy policy is set.', 'missing', v_pol->'missing'));
    end if;
    if not lv.campaign_finished(c.status, c.closes_at) then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'live_restricted');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_policy_undecided',
        'message', 'Anonymous results are available only after the Campaign has finished.'));
    end if;
    perform pg_advisory_xact_lock(hashtextextended('lv_release:' || p_campaign::text, 0));
    select (select count(*) from lv.participation x where x.campaign_id = p_campaign) + v_guests into v_n;
    select * into v_rel from lv.analytics_releases r where r.campaign_id = p_campaign;
    if v_rel.campaign_id is null then
      insert into lv.analytics_releases (campaign_id, participant_n, released_by) values (p_campaign, v_n, p_caller);
    elsif v_rel.participant_n <> v_n then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'population_changed');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_policy_undecided',
        'message', 'These results can no longer be shown because the population changed after first release.'));
    end if;
  end if;

  v_min := case when v_sensitive then (v_pol->>'min_cohort')::int else 1 end;

  if p_metric = 'participant_count' then
    select count(*) into v_n from lv.participation x where x.campaign_id = p_campaign;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, p_caller, p_metric, p_question, case when v_sensitive and v_n < v_min then 'suppressed' else 'published' end);
    return jsonb_build_object('ok', true, 'metric', p_metric,
      'n', case when v_sensitive and v_n < v_min then null else v_n end,
      'suppressed', v_sensitive and v_n < v_min,
      'guest_n', case when v_sensitive and v_guests > 0 and v_guests < v_min then null else v_guests end,
      'guest_suppressed', v_sensitive and v_guests > 0 and v_guests < v_min);
  end if;

  if p_metric = 'participation_rate' then
    v_part := lv.campaign_member_participation(p_campaign);
    v_n := (v_part->>'participants')::bigint;
    v_eligible := (v_part->>'eligible')::bigint;
    -- Withheld when small, at 100%, or when the non-respondents are fewer than the cohort.
    if v_sensitive and (v_n < v_min or (v_eligible is not null and v_eligible - v_n < v_min)) then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'suppressed');
      return jsonb_build_object('ok', true, 'metric', p_metric, 'n', null, 'eligible_n', null, 'rate', null, 'suppressed', true,
                                'reason', case when v_n < v_min then 'below_min_cohort' else 'near_full_turnout' end, 'guest_n', null);
    end if;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'n', v_n, 'eligible_n', v_eligible,
      'rate', case when coalesce(v_eligible, 0) = 0 then null else round(v_n::numeric / v_eligible, 4) end,
      'suppressed', false, 'reason', null);
  end if;

  if p_metric in ('answer_distribution', 'rating_summary', 'text_responses') then
    select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
    if not found then return lv.err('lv_invalid_input', 'Choose a question of this Campaign.'); end if;
  end if;

  if p_metric = 'text_responses' then
    if q.kind <> 'text' then return lv.err('lv_invalid_input', 'text_responses needs a text question.'); end if;
    v_text_min := (lv.policy_json('campaign.min_cohort'))::int;
    v_total := lv.question_total(p_campaign, p_question);
    if v_text_min is null or v_total < v_text_min then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'suppressed');
      return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', null, 'responses', null,
                                'suppressed', true, 'reason', 'below_min_cohort');
    end if;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    -- Strings only, random order: no person, time, submission or ordering signal.
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', v_total, 'suppressed', false,
      'responses', (select coalesce(jsonb_agg(x.v order by random()), '[]'::jsonb) from (
                      select a.value #>> '{}' as v from lv.answers a join lv.submissions s on s.id = a.submission_id
                       where s.campaign_id = p_campaign and a.question_id = p_question) x));
  end if;

  if p_metric in ('answer_distribution', 'rating_summary') and q.kind = 'text' then
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'type_not_available');
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_policy_undecided',
      'message', 'Free-text answers are never aggregated. Use text_responses.'));
  end if;

  if p_metric = 'answer_distribution' then
    v_cells := lv.question_cells(p_campaign, p_question);
    if v_sensitive then
      v_safe := lv.safe_cells(v_cells, v_min, lv.question_total(p_campaign, p_question));
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
      values (p_campaign, p_caller, p_metric, p_question, case when (v_safe->>'withheld')::boolean then 'suppressed' else 'published' end);
      return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'cells', v_safe->'cells',
                                'withheld', (v_safe->>'withheld')::boolean, 'reason', v_safe->'reason');
    end if;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question,
      'cells', lv.suppress_cells(v_cells, 1, false), 'withheld', false, 'reason', null);
  end if;

  if p_metric = 'rating_summary' then
    if q.kind <> 'rating' then return lv.err('lv_invalid_input', 'rating_summary needs a rating question.'); end if;
    select count(*), avg((a.value)::numeric) into v_n, v_mean
      from lv.answers a join lv.submissions s on s.id = a.submission_id
     where s.campaign_id = p_campaign and a.question_id = p_question and jsonb_typeof(a.value) = 'number';
    -- The mean of a question with any withheld cell would let the withheld split be solved: withhold it too.
    if v_sensitive and (lv.safe_cells(lv.question_cells(p_campaign, p_question), v_min, lv.question_total(p_campaign, p_question))->>'any_withheld')::boolean then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'suppressed');
      return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', null, 'mean', null, 'suppressed', true);
    end if;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', v_n,
                              'mean', round(v_mean, 2), 'suppressed', false);
  end if;

  return lv.err('lv_invalid_input', 'Unknown metric.');
end;
$$;

-- One results page. Text questions carry text_responses; the others their distribution (and rating summary).
create or replace function lv.api_analytics_overview(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_count jsonb;
  v_rate jsonb;
  v_questions jsonb := '[]'::jsonb;
  q record;
  v_result jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading results requires analytics.read.');
  end if;

  v_count := lv.analytics_core(p_campaign, v_account, 'participant_count', null);
  if not (v_count->>'ok')::boolean then return v_count; end if;
  v_rate := lv.analytics_core(p_campaign, v_account, 'participation_rate', null);

  for q in select * from lv.campaign_questions x where x.campaign_id = p_campaign order by x.position loop
    if q.kind = 'text' then
      v_result := lv.analytics_core(p_campaign, v_account, 'text_responses', q.id);
    else
      v_result := lv.analytics_core(p_campaign, v_account, 'answer_distribution', q.id);
      if q.kind = 'rating' and (v_result->>'ok')::boolean then
        v_result := v_result || jsonb_build_object('summary', lv.analytics_core(p_campaign, v_account, 'rating_summary', q.id) - 'ok' - 'metric' - 'question_id');
      end if;
    end if;
    v_questions := v_questions || jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                                     'prompt', q.prompt, 'result', v_result);
  end loop;

  return jsonb_build_object('ok', true,
    'participant_count', v_count - 'ok' - 'metric',
    'participation_rate', v_rate - 'ok' - 'metric',
    'guest_n', v_count->'guest_n',
    'includes_guests', coalesce((v_count->>'guest_n')::bigint, 1) > 0,
    'questions', v_questions);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Export: released aggregates only, through the same engine. Free text is never exported.
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_analytics_export(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_family text;
  v_over jsonb;
  v_rows jsonb := '[]'::jsonb;
  qn jsonb;
  cell jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.export') then
    return lv.err('lv_forbidden', 'Exporting results requires analytics.export.');
  end if;
  v_family := lv.hub_family(v_hub);
  if v_family is null or v_family = 'free' or coalesce((lv.plan_limit(v_family, 'analytics.export'))::boolean, false) is not true then
    return lv.err_x('lv_entitlement_required', 'Exports need a Starter or Team plan.', jsonb_build_object('product', 'starter_hub'));
  end if;

  v_over := lv.api_analytics_overview(p_campaign);
  if not (v_over->>'ok')::boolean then return v_over; end if;

  v_rows := v_rows || jsonb_build_object('question_position', null, 'question', null, 'kind', null, 'key', 'participants',
    'n', v_over #> '{participant_count,n}', 'suppressed', v_over #> '{participant_count,suppressed}', 'reason', null);
  v_rows := v_rows || jsonb_build_object('question_position', null, 'question', null, 'kind', null, 'key', 'guests',
    'n', v_over #> '{participant_count,guest_n}', 'suppressed', v_over #> '{participant_count,guest_suppressed}', 'reason', null);
  for qn in select * from jsonb_array_elements(v_over->'questions') loop
    continue when qn->>'kind' = 'text' or not coalesce((qn #>> '{result,ok}')::boolean, false);
    if (qn #>> '{result,withheld}')::boolean then
      v_rows := v_rows || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt', 'kind', qn->'kind',
        'key', null, 'n', null, 'suppressed', true, 'reason', qn #> '{result,reason}');
    end if;
    for cell in select * from jsonb_array_elements(coalesce(qn #> '{result,cells}', '[]'::jsonb)) loop
      v_rows := v_rows || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt', 'kind', qn->'kind',
        'key', cell->'key', 'n', cell->'n', 'suppressed', cell->'suppressed', 'reason', cell->'reason');
    end loop;
    if qn #> '{result,summary}' is not null then
      v_rows := v_rows || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt', 'kind', qn->'kind',
        'key', 'mean', 'n', qn #> '{result,summary,mean}', 'suppressed', qn #> '{result,summary,suppressed}', 'reason', null);
    end if;
  end loop;
  perform lv.audit(v_account, v_hub, 'analytics.exported', p_campaign::text);
  return jsonb_build_object('ok', true, 'campaign_id', p_campaign, 'generated_at', now(),
                            'includes_guests', v_over->'includes_guests', 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Hub Name Reservation
-- ---------------------------------------------------------------------------------------------------------
create table lv.hub_reservations (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$' and length(slug) between 3 and 40),
  account_id uuid references lv.accounts (id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now(),
  constraint hub_reservations_window check (expires_at > starts_at)
);
create index hub_reservations_slug_idx on lv.hub_reservations (slug, expires_at desc);
alter table lv.hub_reservations enable row level security;

create function lv.reservation_state(p_expires_at timestamptz, p_released_at timestamptz) returns text
language sql stable security definer set search_path = ''
as $$ select case when p_released_at is not null then 'released'
                  when now() < p_expires_at then 'active'
                  when now() < p_expires_at + make_interval(days => coalesce((lv.policy_json('reservation.grace_days'))::int, 0)) then 'grace'
                  else 'released' end $$;

-- The reservation holding a slug right now (ACTIVE or GRACE), if any.
create function lv.slug_hold(p_slug text) returns lv.hub_reservations
language sql stable security definer set search_path = ''
as $$
  select r.* from lv.hub_reservations r
   where r.slug = p_slug and lv.reservation_state(r.expires_at, r.released_at) in ('active', 'grace')
   order by r.expires_at desc limit 1
$$;

create or replace function lv.slug_claim_blocked(p_slug text, p_account uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  r lv.hub_reservations;
begin
  if lv.slug_quarantined(p_slug) then return 'That Hub name was released recently and is not available yet.'; end if;
  r := lv.slug_hold(p_slug);
  if r.id is not null and r.account_id is distinct from p_account then return 'That Hub name is reserved.'; end if;
  return null;
end;
$$;

create function lv.api_hub_reservation_status(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_slug text := lower(btrim(p_slug));
  h record;
  r record;
  v_grace int := coalesce((lv.policy_json('reservation.grace_days'))::int, 0);
begin
  if v_slug is null or length(v_slug) not between 3 and 40 or v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$' or v_slug like '%--%' then
    return lv.err('lv_invalid_input', 'Hub names are 3 to 40 characters: lowercase letters, numbers and single hyphens.');
  end if;
  select x.owner_account_id into h from lv.hubs x where x.slug = v_slug;
  if found then
    return jsonb_build_object('ok', true, 'slug', v_slug, 'state', 'taken', 'mine', h.owner_account_id = v_account);
  end if;
  if exists (select 1 from lv.reserved_slugs s where s.slug = v_slug) or lv.slug_quarantined(v_slug) then
    return jsonb_build_object('ok', true, 'slug', v_slug, 'state', 'taken', 'mine', false);
  end if;
  select * into r from lv.hub_reservations x where x.slug = v_slug order by x.expires_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', true, 'slug', v_slug, 'state', 'available', 'mine', false); end if;
  return jsonb_build_object('ok', true, 'slug', v_slug, 'state', lv.reservation_state(r.expires_at, r.released_at),
    'mine', r.account_id is not distinct from v_account and v_account is not null)
    -- Dates only for the holder; others learn only the state.
    || case when r.account_id = v_account and v_account is not null
            then jsonb_build_object('expires_at', r.expires_at, 'grace_ends_at', r.expires_at + make_interval(days => v_grace))
            else '{}'::jsonb end;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Billing: intents, the event log and the service-role grant path
-- ---------------------------------------------------------------------------------------------------------
create table lv.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references lv.accounts (id) on delete set null,
  product text not null references lv.products (product),
  hub_id uuid references lv.hubs (id) on delete set null,
  slug text,
  weeks int check (weeks is null or weeks between 1 and 104),
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table lv.checkout_intents enable row level security;

create table lv.billing_events (
  id bigserial primary key,
  provider text not null check (provider in ('stripe')),
  event_id text not null check (length(event_id) between 1 and 255),
  type text not null,
  received_at timestamptz not null default now(),
  outcome text not null check (outcome in ('applied', 'ignored', 'rejected')),
  -- What was granted or why it was rejected. Never the provider payload.
  detail jsonb not null default '{}'::jsonb,
  constraint billing_events_once unique (provider, event_id)
);
alter table lv.billing_events enable row level security;

create function lv.checkout_amount(p_product text, p_weeks int) returns int
language sql stable security definer set search_path = ''
as $$
  select case when p.interval = 'weeks'
              then p.price_cents + greatest(coalesce(p_weeks, p.first_period_weeks) - p.first_period_weeks, 0) * p.extra_week_cents
              else p.price_cents end
    from lv.products p where p.product = p_product
$$;

create function lv.api_checkout_start(p_product text, p_hub uuid, p_weeks int, p_slug text) returns jsonb
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
-- Always records the event once; returns { ok, outcome, duplicate }.
create function lv.billing_apply_event(p_provider text, p_event_id text, p_type text, p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
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
$$;

create function lv.api_billing_summary(p_hub uuid) returns jsonb
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
-- ---------------------------------------------------------------------------------------------------------
create table lv.discover_applications (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  submitted_by uuid references lv.accounts (id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  genuine_members int not null,
  created_at timestamptz not null default now(),
  constraint discover_applications_hub_key unique (hub_id)
);
alter table lv.discover_applications enable row level security;

-- Genuine active members: accepted, email verified at KpnIdentity, and took part in one of this Hub's Campaigns
-- within the active window. Guests never count.
create function lv.genuine_active_members(p_hub uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from lv.hub_memberships m
   where m.hub_id = p_hub and m.status = 'accepted'
     and exists (select 1 from lv.account_identities i where i.account_id = m.account_id and i.email_verified_at is not null)
     and exists (select 1 from lv.participation p where p.hub_id = p_hub and p.account_id = m.account_id
                    and p.created_at > now() - make_interval(days => coalesce((lv.policy_json('discover.active_window_days'))::int, 90)))
$$;

create function lv.api_discover_apply(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_family text;
  v_members int;
  v_min int := (lv.plan_limit('team', 'discover.min_members'))::int;
  v_reasons jsonb := '[]'::jsonb;
  a record;
begin
  perform lv.require_capability(v_account, p_hub, 'hub.settings.manage');
  select * into a from lv.discover_applications x where x.hub_id = p_hub;
  if a.id is not null then return jsonb_build_object('ok', true, 'status', a.status, 'already_applied', true); end if;
  v_family := lv.hub_family(p_hub);
  v_members := lv.genuine_active_members(p_hub);
  if v_family is distinct from 'team' then v_reasons := v_reasons || to_jsonb('team_required'::text); end if;
  if v_min is null or v_members < v_min then v_reasons := v_reasons || to_jsonb('members_below_minimum'::text); end if;
  if jsonb_array_length(v_reasons) > 0 then
    return lv.err_x('lv_gate_blocked', 'This Hub cannot apply for Discover yet.',
                    jsonb_build_object('reasons', v_reasons, 'genuine_members', v_members, 'min_members', v_min));
  end if;
  insert into lv.discover_applications (hub_id, submitted_by, genuine_members) values (p_hub, v_account, v_members);
  perform lv.audit(v_account, p_hub, 'discover.applied', p_hub::text, jsonb_build_object('genuine_members', v_members));
  return jsonb_build_object('ok', true, 'status', 'submitted', 'already_applied', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Retention sweep (L-13). Service role only; schedule with pg_cron when wanted.
-- ---------------------------------------------------------------------------------------------------------
create function lv.retention_sweep() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_logs int := coalesce((lv.policy_json('retention.logs_days'))::int, 365);
  v_guest int := coalesce((lv.policy_json('retention.guest_hash_days'))::int, 7);
  v_a int; v_q int; v_g int;
begin
  delete from lv.audit_events where occurred_at < now() - make_interval(days => v_logs);
  get diagnostics v_a = row_count;
  delete from lv.analytics_query_log where occurred_at < now() - make_interval(days => v_logs);
  get diagnostics v_q = row_count;
  -- Keep the row (it is counted in released populations), drop the key hash that could link a device.
  update lv.guest_participation set key_hash = 'expired:' || id::text
   where created_at < now() - make_interval(days => v_guest) and key_hash not like 'expired:%';
  get diagnostics v_g = row_count;
  return jsonb_build_object('ok', true, 'audit_deleted', v_a, 'query_log_deleted', v_q, 'guest_hashes_unlinked', v_g);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_checkout_start(p_product text, p_hub uuid default null, p_weeks int default null, p_slug text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_checkout_start(p_product, p_hub, p_weeks, p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_billing_summary(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_billing_summary(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_reservation_status(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_reservation_status(p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_analytics_export(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard((select c.hub_id from lv.campaigns c where c.id = p_campaign), true); return lv.api_analytics_export(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_discover_apply(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_discover_apply(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Grants: explicit, never PUBLIC (LC-05).
revoke all on function lv_api.lv_checkout_start(text, uuid, int, text), lv_api.lv_billing_summary(uuid),
  lv_api.lv_hub_reservation_status(text), lv_api.lv_analytics_export(uuid), lv_api.lv_discover_apply(uuid) from public;

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
    execute 'grant execute on function lv_api.lv_checkout_start(text, uuid, int, text), lv_api.lv_billing_summary(uuid),
      lv_api.lv_hub_reservation_status(text), lv_api.lv_analytics_export(uuid), lv_api.lv_discover_apply(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function lv_api.lv_hub_reservation_status(text) to anon';
  end if;
  -- The billing grant path and the retention sweep: service role only, schema usage and these two functions,
  -- nothing on tables (LC-20).
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema lv to service_role';
    execute 'grant execute on function lv.billing_apply_event(text, text, text, jsonb), lv.retention_sweep() to service_role';
  end if;
end $$;

commit;
