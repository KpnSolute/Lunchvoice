-- 000044: results analytics and Trends (founder decisions 2026-11-13).
--
-- Additive only. Nothing existing is dropped; one function body changes (lv.api_analytics_export: the plan check now
-- also accepts a person's Creator plan) and the rollback restores it.
--
-- 1. Entitlement map (lv.plan_limits, server-enforced):
--    trends.max          free 0, creator_plus 3, creator_pro 10, starter 3, team 5. Creator counts are PROVISIONAL
--                        founder proposals; change the rows, nothing else.
--    trends.max_pass     1 on a Campaign Starter / Campaign Plus pass (starter and team families). When the pass window
--                        ends the Hub has no active family, so its limit is 0 and the Trend is read-only.
--    analytics.premium   team and creator_pro: responses over time, device type, source and a cross-tab.
--    analytics.export    creator_plus and creator_pro (Hubs already had it on starter and team).
-- 2. Trends: lv.trends (one space each) and lv.trend_runs (a Campaign belongs to at most one Trend, in the same space).
--    Manage: campaign.manage in the space (a personal space's owner holds every capability). Read: analytics.read.
--    Over the limit (a plan lapsed or was downgraded): nothing is deleted and every Trend stays readable; creating a
--    Trend, adding a survey to one and "Ask again" are refused (lv_limit_reached) until the count fits again.
--    lv_trend_get compares runs with the SAME privacy-safe engine as each survey's own results (lv.analytics_core):
--    withheld stays withheld (never zero), an open anonymous run is "not released", and answers are never joined
--    across runs: every number is a per-run aggregate.
-- 3. Coarse response context, captured server-side and stored only as per-Campaign COUNTERS, never per response, so it
--    can never be joined to an answer (lv.campaign_response_context):
--    device    mobile / tablet / desktop / unknown, classified from the User-Agent request header by an AFTER INSERT
--              trigger on lv.submissions. The User-Agent and the IP address are never stored.
--    source    link / qr / code / discord, reported once per receipt by the player (lv_response_context). Set-once per
--              receipt (lv.response_context_marks holds only the receipt and the Campaign, not the value).
--    duration  lt_1m / 1_3m / 3_10m / gt_10m, from the same call (the seconds are bucketed and dropped).
--    funnel    started: the player reports that a person opened the first question (lv_response_started). A vanity
--              counter: anyone holding the Campaign id can raise it; completion is shown only when it is plausible.
-- 4. Results API (aggregates only; every function goes through lv.analytics_core first, so drafts, open anonymous
--    surveys, a missing policy and a changed population answer exactly as the per-question results do):
--    lv_analytics_summary   all plans: responses, completion rate, median time bucket.
--    lv_analytics_premium   analytics.premium: responses per day, device, source.
--    lv_analytics_crosstab  analytics.premium: two choice questions against each other.
--    Anonymous surveys: every shown cell is >= campaign.min_cohort with complementary suppression (lv.safe_cells). A
--    cross-tab is all-or-nothing: it is withheld whole unless every non-zero cell is >= the minimum, the table passes
--    lv.safe_cells, and no row or column holds all its answers in one cell (that would reveal everyone in that row).
-- Rollback: supabase/rollbacks/000044_v2_trends_and_analytics.down.sql.
begin;

-- ---------------------------------------------------------------- 1. entitlement map
insert into lv.plan_limits (family, key, value, note) values
  ('free', 'trends.max', '0', 'Founder 2026-11-13: Trends are not on the free plan.'),
  ('creator_plus', 'trends.max', '3', 'PROVISIONAL founder proposal 2026-11-13: 3 Trends on Creator Plus.'),
  ('creator_pro', 'trends.max', '10', 'PROVISIONAL founder proposal 2026-11-13: 10 Trends on Creator Pro.'),
  ('starter', 'trends.max', '3', 'Founder 2026-11-13: 3 Trends on Starter Hub.'),
  ('team', 'trends.max', '5', 'Founder 2026-11-13: 5 Trends on Team Hub (the $2 extra-Trend add-on is not built).'),
  ('starter', 'trends.max_pass', '1', 'Founder 2026-11-13: a Campaign Starter pass includes 1 Trend, read-only after the window.'),
  ('team', 'trends.max_pass', '1', 'Founder 2026-11-13: a Campaign Plus pass includes 1 Trend, read-only after the window.'),
  ('team', 'analytics.premium', 'true', 'Founder 2026-11-13: responses over time, device, source and cross-tab on Team Hub.'),
  ('creator_pro', 'analytics.premium', 'true', 'Founder 2026-11-13: premium results on Creator Pro.'),
  ('creator_plus', 'analytics.export', 'true', 'Founder 2026-11-13: CSV export of released results on paid plans.'),
  ('creator_pro', 'analytics.export', 'true', 'Founder 2026-11-13: CSV export of released results on paid plans.');

-- ---------------------------------------------------------------- 2. Trends
create table lv.trends (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  created_by uuid references lv.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index trends_hub_idx on lv.trends (hub_id, created_at);
alter table lv.trends enable row level security;

create table lv.trend_runs (
  trend_id uuid not null references lv.trends (id) on delete cascade,
  -- A survey is in at most one Trend.
  campaign_id uuid not null unique references lv.campaigns (id) on delete cascade,
  added_by uuid references lv.accounts (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (trend_id, campaign_id)
);
alter table lv.trend_runs enable row level security;

-- One space per Trend: a run must belong to the Trend's own Hub or personal space.
create function lv.trend_run_same_space() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select t.hub_id from lv.trends t where t.id = new.trend_id)
     is distinct from (select c.hub_id from lv.campaigns c where c.id = new.campaign_id) then
    raise exception 'lv_invalid_input: a Trend only holds surveys from its own space' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trend_runs_same_space before insert or update on lv.trend_runs
  for each row execute function lv.trend_run_same_space();

-- How many Trends this space may hold right now. Hubs: their plan (a Campaign pass uses trends.max_pass; an ended plan
-- is 0). Personal spaces: the owner's Creator plan, else the free row.
create function lv.trend_limit(p_hub uuid) returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind text;
  v_owner uuid;
  v_plan jsonb;
begin
  select h.kind, h.owner_account_id into v_kind, v_owner from lv.hubs h where h.id = p_hub;
  if v_kind is null then return 0; end if;
  if v_kind = 'personal' then
    return coalesce((lv.plan_limit(lv.account_creator_family(v_owner), 'trends.max'))::int,
                    (lv.plan_limit('free', 'trends.max'))::int, 0);
  end if;
  v_plan := lv.hub_plan(p_hub);
  if v_plan->>'state' is distinct from 'active' then return 0; end if;
  if v_plan->>'product' in ('campaign_starter', 'campaign_plus') then
    return coalesce((lv.plan_limit(v_plan->>'family', 'trends.max_pass'))::int, 0);
  end if;
  return coalesce((lv.plan_limit(v_plan->>'family', 'trends.max'))::int, 0);
end;
$$;

create function lv.trend_allowance(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('max', l.m, 'used', u.n, 'over', u.n > l.m, 'can_create', u.n < l.m, 'can_add', u.n <= l.m and l.m > 0,
                            'product', case when h.kind = 'personal' then 'creator_plus' else 'starter_hub' end)
    from (select lv.trend_limit(p_hub) as m) l,
         (select count(*)::int as n from lv.trends t where t.hub_id = p_hub) u,
         lv.hubs h
   where h.id = p_hub
$$;

-- Resolve the space: NULL means the caller's personal space.
create function lv.trend_space(p_account uuid, p_hub uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select coalesce(p_hub, lv.personal_space_of(p_account)) $$;

create function lv.trend_json(p_trend uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('trend_id', t.id, 'hub_id', t.hub_id, 'title', t.title, 'description', t.description,
           'space', h.kind, 'created_at', t.created_at,
           'run_count', (select count(*) from lv.trend_runs r where r.trend_id = t.id),
           'latest_at', (select max(coalesce(c.activated_at, c.created_at)) from lv.trend_runs r join lv.campaigns c on c.id = r.campaign_id
                          where r.trend_id = t.id))
    from lv.trends t join lv.hubs h on h.id = t.hub_id where t.id = p_trend
$$;

create function lv.api_trend_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  v_hub := lv.trend_space(v_account, p_hub);
  if v_hub is null then
    -- No personal space yet: nothing to list, and the free plan holds no Trends.
    return jsonb_build_object('ok', true, 'trends', '[]'::jsonb, 'can_manage', true,
      'limit', jsonb_build_object('max', coalesce((lv.plan_limit(coalesce(lv.account_creator_family(v_account), 'free'), 'trends.max'))::int, 0),
                                  'used', 0, 'over', false, 'product', 'creator_plus'));
  end if;
  if lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading Trends requires analytics.read.');
  end if;
  return jsonb_build_object('ok', true,
    'trends', coalesce((select jsonb_agg(lv.trend_json(t.id) order by t.created_at desc, t.id) from lv.trends t where t.hub_id = v_hub), '[]'::jsonb),
    'can_manage', lv.has_capability(v_account, v_hub, 'campaign.manage'),
    'limit', lv.trend_allowance(v_hub));
end;
$$;

-- p_campaigns: surveys to start the Trend with (all from the same space).
create function lv.api_trend_create(p_hub uuid, p_title text, p_description text, p_campaigns uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_allow jsonb;
  v_id uuid;
  v_c uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  v_hub := case when p_hub is null then lv.ensure_personal_space(v_account) else p_hub end;
  if lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.has_capability(v_account, v_hub, 'campaign.manage') then
    return lv.err('lv_forbidden', 'Managing Trends requires campaign.manage.');
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then
    return lv.err('lv_invalid_input', 'A Trend needs a name of 1 to 120 characters.');
  end if;
  if p_description is not null and length(btrim(p_description)) > 500 then
    return lv.err('lv_invalid_input', 'Keep the description to 500 characters.');
  end if;
  perform lv.assert_not_suspended(v_account, v_hub);
  perform pg_advisory_xact_lock(hashtextextended('lv_trend:' || v_hub::text, 0));
  v_allow := lv.trend_allowance(v_hub);
  if not (v_allow->>'can_create')::boolean then
    return lv.err_x('lv_limit_reached',
      case when (v_allow->>'max')::int = 0 then 'Trends come with a paid plan.' else 'This space has reached its Trend limit.' end,
      jsonb_build_object('limit', (v_allow->>'max')::int, 'used', (v_allow->>'used')::int, 'limit_key', 'trends.max',
                         'product', v_allow->>'product'));
  end if;
  insert into lv.trends (hub_id, title, description, created_by)
  values (v_hub, btrim(p_title), nullif(btrim(p_description), ''), v_account) returning id into v_id;
  foreach v_c in array coalesce(p_campaigns, '{}'::uuid[]) loop
    if not exists (select 1 from lv.campaigns c where c.id = v_c and c.hub_id = v_hub) then
      perform lv.fail('lv_invalid_input', 'A Trend only holds surveys from its own space.');
    end if;
    if exists (select 1 from lv.trend_runs r where r.campaign_id = v_c) then
      perform lv.fail('lv_conflict', 'That survey is already in a Trend.');
    end if;
    insert into lv.trend_runs (trend_id, campaign_id, added_by) values (v_id, v_c, v_account);
  end loop;
  perform lv.audit(v_account, v_hub, 'trend.created', v_id::text, null);
  return jsonb_build_object('ok', true, 'trend', lv.trend_json(v_id));
end;
$$;

create function lv.trend_manage_guard(p_account uuid, p_trend uuid) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
begin
  if p_account is null then perform lv.fail('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select t.hub_id into v_hub from lv.trends t where t.id = p_trend;
  if v_hub is null or lv.membership_of(p_account, v_hub) is null then perform lv.fail('lv_not_found', 'No such Trend.'); end if;
  if not lv.has_capability(p_account, v_hub, 'campaign.manage') then
    perform lv.fail('lv_forbidden', 'Managing Trends requires campaign.manage.');
  end if;
  return v_hub;
end;
$$;

create function lv.api_trend_update(p_trend uuid, p_title text, p_description text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid := lv.trend_manage_guard(v_account, p_trend);
begin
  if p_title is not null and length(btrim(p_title)) not between 1 and 120 then
    return lv.err('lv_invalid_input', 'A Trend needs a name of 1 to 120 characters.');
  end if;
  if p_description is not null and length(btrim(p_description)) > 500 then
    return lv.err('lv_invalid_input', 'Keep the description to 500 characters.');
  end if;
  -- Renaming is housekeeping: allowed over the limit.
  update lv.trends set title = coalesce(btrim(p_title), title),
                       description = case when p_description is null then description else nullif(btrim(p_description), '') end
   where id = p_trend;
  perform lv.audit(v_account, v_hub, 'trend.updated', p_trend::text, null);
  return jsonb_build_object('ok', true, 'trend', lv.trend_json(p_trend));
end;
$$;

-- Deleting a Trend removes the grouping only; every survey and its results stay.
create function lv.api_trend_delete(p_trend uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid := lv.trend_manage_guard(v_account, p_trend);
begin
  delete from lv.trends where id = p_trend;
  perform lv.audit(v_account, v_hub, 'trend.deleted', p_trend::text, null);
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_trend_add(p_trend uuid, p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid := lv.trend_manage_guard(v_account, p_trend);
  v_allow jsonb := lv.trend_allowance(v_hub);
begin
  if not (v_allow->>'can_add')::boolean then
    return lv.err_x('lv_limit_reached', 'This space holds more Trends than its plan allows. Trends stay readable; adding surveys waits until the count fits.',
      jsonb_build_object('limit', (v_allow->>'max')::int, 'used', (v_allow->>'used')::int, 'limit_key', 'trends.max', 'product', v_allow->>'product'));
  end if;
  if not exists (select 1 from lv.campaigns c where c.id = p_campaign and c.hub_id = v_hub) then
    return lv.err('lv_invalid_input', 'A Trend only holds surveys from its own space.');
  end if;
  if exists (select 1 from lv.trend_runs r where r.campaign_id = p_campaign) then
    return lv.err('lv_conflict', 'That survey is already in a Trend.');
  end if;
  insert into lv.trend_runs (trend_id, campaign_id, added_by) values (p_trend, p_campaign, v_account);
  perform lv.audit(v_account, v_hub, 'trend.run_added', p_trend::text, jsonb_build_object('campaign_id', p_campaign));
  return jsonb_build_object('ok', true, 'trend', lv.trend_json(p_trend));
end;
$$;

-- Taking a survey out of a Trend is always allowed (it never deletes the survey).
create function lv.api_trend_remove(p_trend uuid, p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid := lv.trend_manage_guard(v_account, p_trend);
begin
  delete from lv.trend_runs where trend_id = p_trend and campaign_id = p_campaign;
  if not found then return lv.err('lv_not_found', 'That survey is not in this Trend.'); end if;
  perform lv.audit(v_account, v_hub, 'trend.run_removed', p_trend::text, jsonb_build_object('campaign_id', p_campaign));
  return jsonb_build_object('ok', true, 'trend', lv.trend_json(p_trend));
end;
$$;

-- "Ask again": from a finished survey in a Trend, one draft copy with the same settings and questions, already in the
-- Trend. Section rules are re-pointed at the copied questions. Schedule, responses, invites and join codes are new.
create function lv.api_trend_ask_again(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_trend uuid;
  v_allow jsonb;
  v_new uuid;
  q record;
  v_map jsonb := '{}'::jsonb;
  v_qid uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(v_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, c.hub_id, 'campaign.manage') then
    return lv.err('lv_forbidden', 'Asking again requires campaign.manage.');
  end if;
  -- Moderation first: a blocked survey is never copied, and a suspended account or Hub creates nothing
  -- (raises lv_suspended, mapped to the envelope by the lv_api wrapper).
  if c.blocked_at is not null then
    return lv.err('lv_locked', 'This survey was blocked by LunchVoice staff, so it cannot be asked again.');
  end if;
  perform lv.assert_not_suspended(v_account, c.hub_id);
  select r.trend_id into v_trend from lv.trend_runs r where r.campaign_id = p_campaign;
  if v_trend is null then return lv.err('lv_invalid_input', 'Add this survey to a Trend first.'); end if;
  if not lv.campaign_finished(c.status, c.closes_at) then
    return lv.err('lv_lifecycle_invalid', 'Ask again once this survey has closed.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_trend:' || c.hub_id::text, 0));
  -- The same creation rate limit as lv_quick_survey_create (quick.create_per_hour), counted per space.
  if (select count(*) from lv.campaigns x where x.hub_id = c.hub_id and x.created_at > now() - interval '1 hour')
     >= coalesce((lv.policy_json('quick.create_per_hour'))::int, 0) then
    return lv.err('lv_rate_limited', 'Many surveys were created in the last hour. Try again later.');
  end if;
  v_allow := lv.trend_allowance(c.hub_id);
  if not (v_allow->>'can_add')::boolean then
    return lv.err_x('lv_limit_reached', 'This space holds more Trends than its plan allows. Trends stay readable; asking again waits until the count fits.',
      jsonb_build_object('limit', (v_allow->>'max')::int, 'used', (v_allow->>'used')::int, 'limit_key', 'trends.max', 'product', v_allow->>'product'));
  end if;

  insert into lv.campaigns (hub_id, title, description, mode, anonymity, access, audience, audience_scope, guest_limit, guest_names, created_by)
  values (c.hub_id, c.title, c.description, c.mode, c.anonymity, c.access, c.audience, c.audience_scope, c.guest_limit, c.guest_names, v_account)
  returning id into v_new;
  insert into lv.campaign_audience_roles (campaign_id, role_id)
  select v_new, ar.role_id from lv.campaign_audience_roles ar where ar.campaign_id = p_campaign;

  for q in select * from lv.campaign_questions x where x.campaign_id = p_campaign order by x.position loop
    insert into lv.campaign_questions (campaign_id, position, kind, prompt, config)
    values (v_new, q.position, q.kind, q.prompt, q.config) returning id into v_qid;
    v_map := v_map || jsonb_build_object(q.id::text, v_qid::text);
  end loop;
  -- Rules look back at earlier questions by id: point them at the copies.
  update lv.campaign_questions x
     set config = jsonb_set(x.config, '{section,show_if,question_id}', v_map -> (x.config #>> '{section,show_if,question_id}'))
   where x.campaign_id = v_new and x.config #>> '{section,show_if,question_id}' is not null
     and v_map ? (x.config #>> '{section,show_if,question_id}');

  insert into lv.trend_runs (trend_id, campaign_id, added_by) values (v_trend, v_new, v_account);
  perform lv.audit(v_account, c.hub_id, 'trend.asked_again', v_trend::text, jsonb_build_object('from', p_campaign, 'campaign_id', v_new));
  return jsonb_build_object('ok', true, 'campaign_id', v_new, 'trend_id', v_trend,
                            'space', (select h.kind from lv.hubs h where h.id = c.hub_id));
end;
$$;

-- The Trend a survey belongs to, for its results page.
create function lv.api_campaign_trend(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_trend uuid;
  v_manage boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(v_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading Trends requires analytics.read.');
  end if;
  v_manage := lv.has_capability(v_account, c.hub_id, 'campaign.manage');
  select r.trend_id into v_trend from lv.trend_runs r where r.campaign_id = p_campaign;
  return jsonb_build_object('ok', true,
    'trend', case when v_trend is null then null else lv.trend_json(v_trend) end,
    'can_manage', v_manage,
    'can_ask_again', v_trend is not null and v_manage and lv.campaign_finished(c.status, c.closes_at)
                     and (lv.trend_allowance(c.hub_id)->>'can_add')::boolean,
    'limit', lv.trend_allowance(c.hub_id));
end;
$$;

-- One repeated question in one run, through the same engine as the survey's own results.
create function lv.trend_point(p_campaign uuid, p_account uuid, p_question uuid, p_kind text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_r jsonb;
  v_s jsonb;
  v_total bigint;
  v_any_withheld boolean;
begin
  v_r := lv.analytics_core(p_campaign, p_account, 'answer_distribution', p_question);
  if not coalesce((v_r->>'ok')::boolean, false) then
    return jsonb_build_object('state', case when v_r #>> '{error,code}' = 'lv_lifecycle_invalid' then 'draft' else 'not_released' end);
  end if;
  if p_kind = 'rating' then
    v_s := lv.analytics_core(p_campaign, p_account, 'rating_summary', p_question);
    if coalesce((v_s->>'suppressed')::boolean, true) or v_s->'mean' is null or v_s->'mean' = 'null'::jsonb then
      return jsonb_build_object('state', case when coalesce((v_r->>'withheld')::boolean, false) or coalesce((v_s->>'suppressed')::boolean, false)
                                              then 'withheld' else 'no_answers' end);
    end if;
    return jsonb_build_object('state', 'released', 'mean', v_s->'mean', 'n', v_s->'n');
  end if;
  if coalesce((v_r->>'withheld')::boolean, false) then return jsonb_build_object('state', 'withheld'); end if;
  if jsonb_array_length(coalesce(v_r->'cells', '[]'::jsonb)) = 0 then return jsonb_build_object('state', 'no_answers'); end if;
  v_any_withheld := exists (select 1 from jsonb_array_elements(v_r->'cells') x where (x->>'suppressed')::boolean);
  v_total := lv.question_total(p_campaign, p_question);
  -- A share is only given when nothing in the question is withheld; otherwise the counts stand alone.
  return jsonb_build_object('state', 'released', 'any_withheld', v_any_withheld,
    'n', case when v_any_withheld then null else v_total end,
    'options', (select coalesce(jsonb_agg(jsonb_build_object('key', x->'key', 'n', x->'n', 'suppressed', (x->>'suppressed')::boolean,
                  'share', case when v_any_withheld or v_total = 0 or (x->>'suppressed')::boolean then null
                                else round((x->>'n')::numeric / v_total, 4) end)), '[]'::jsonb)
                  from jsonb_array_elements(v_r->'cells') x));
end;
$$;

-- ---------------------------------------------------------------- 3. coarse response context (counters only)
create table lv.campaign_response_context (
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  dimension text not null check (dimension in ('device', 'source', 'duration', 'funnel')),
  value text not null,
  n bigint not null default 0 check (n >= 0),
  primary key (campaign_id, dimension, value),
  constraint campaign_response_context_value check (
    (dimension = 'device' and value in ('mobile', 'tablet', 'desktop', 'unknown'))
    or (dimension = 'source' and value in ('link', 'qr', 'code', 'discord'))
    or (dimension = 'duration' and value in ('lt_1m', '1_3m', '3_10m', 'gt_10m'))
    or (dimension = 'funnel' and value = 'started'))
);
alter table lv.campaign_response_context enable row level security;

-- Set-once marker per receipt. It records THAT the player reported, never what it reported.
create table lv.response_context_marks (
  receipt_id uuid primary key,
  campaign_id uuid not null references lv.campaigns (id) on delete cascade
);
alter table lv.response_context_marks enable row level security;

create function lv.bump_context(p_campaign uuid, p_dimension text, p_value text) returns void
language sql volatile security definer set search_path = ''
as $$
  insert into lv.campaign_response_context as x (campaign_id, dimension, value, n) values (p_campaign, p_dimension, p_value, 1)
  on conflict (campaign_id, dimension, value) do update set n = x.n + 1
$$;

-- Coarse device class from a User-Agent string. The string itself is never stored.
create function lv.device_class(p_ua text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_ua is null or btrim(p_ua) = '' then 'unknown'
    when p_ua ~* '(ipad|tablet|kindle|silk/|playbook)' or (p_ua ~* 'android' and p_ua !~* 'mobile') then 'tablet'
    when p_ua ~* '(mobi|iphone|ipod|android|windows phone)' then 'mobile'
    else 'desktop' end
$$;

create function lv.capture_submission_device() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ua text;
begin
  begin
    v_ua := nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent';
  exception when others then v_ua := null;
  end;
  -- A counter must never cost someone their answer: any failure here is swallowed (review 2026-11-13).
  begin
    perform lv.bump_context(new.campaign_id, 'device', lv.device_class(v_ua));
  exception when others then null;
  end;
  return null;
end;
$$;
create trigger submissions_capture_device after insert on lv.submissions
  for each row execute function lv.capture_submission_device();

-- The player reports where the person came from and roughly how long answering took, once per receipt.
create function lv.api_response_context(p_receipt uuid, p_source text, p_seconds int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_campaign uuid;
  v_owner uuid;
begin
  if p_source is not null and p_source not in ('link', 'qr', 'code', 'discord') then
    return lv.err('lv_invalid_input', 'Source is link, qr, code or discord.');
  end if;
  if p_seconds is not null and (p_seconds < 0 or p_seconds > 86400) then
    return lv.err('lv_invalid_input', 'Seconds must be between 0 and 86400.');
  end if;
  select p.campaign_id, p.account_id into v_campaign, v_owner from lv.participation p where p.receipt_id = p_receipt;
  if v_campaign is null then
    select g.campaign_id into v_campaign from lv.guest_participation g where g.receipt_id = p_receipt;
  elsif v_owner is distinct from v_account then
    return lv.err('lv_not_found', 'No such receipt.');
  end if;
  if v_campaign is null then return lv.err('lv_not_found', 'No such receipt.'); end if;
  insert into lv.response_context_marks (receipt_id, campaign_id) values (p_receipt, v_campaign) on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'recorded', false); end if;
  if p_source is not null then perform lv.bump_context(v_campaign, 'source', p_source); end if;
  if p_seconds is not null then
    perform lv.bump_context(v_campaign, 'duration',
      case when p_seconds < 60 then 'lt_1m' when p_seconds < 180 then '1_3m' when p_seconds < 600 then '3_10m' else 'gt_10m' end);
  end if;
  return jsonb_build_object('ok', true, 'recorded', true);
end;
$$;

create function lv.api_response_started(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not exists (select 1 from lv.campaigns c where c.id = p_campaign and c.status = 'active' and c.blocked_at is null
                    and (c.closes_at is null or c.closes_at > now())) then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  perform lv.bump_context(p_campaign, 'funnel', 'started');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- 4. results API
-- Released-or-not cells for anonymous (strict engine) and identified (as recorded) Campaigns.
create function lv.release_cells(p_cells jsonb, p_sensitive boolean, p_min int, p_total bigint) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_sensitive then
    v := lv.safe_cells(p_cells, p_min, p_total);
    return jsonb_build_object('cells', v->'cells', 'withheld', (v->>'withheld')::boolean, 'reason', v->'reason');
  end if;
  return jsonb_build_object('cells', lv.suppress_cells(p_cells, 1, false), 'withheld', false, 'reason', null);
end;
$$;

-- The gate shared by every results call: membership, analytics.read, and lv.analytics_core's own checks (draft, open
-- anonymous survey, policy, changed population). Returns {ok, hub, sensitive, min} or the error.
create function lv.results_gate(p_campaign uuid, p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_core jsonb;
begin
  if p_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(p_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(p_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading results requires analytics.read.');
  end if;
  v_core := lv.analytics_core(p_campaign, p_account, 'participant_count', null);
  if not coalesce((v_core->>'ok')::boolean, false) then return v_core; end if;
  return jsonb_build_object('ok', true, 'hub', c.hub_id, 'sensitive', c.anonymity = 'anonymous',
                            'min', case when c.anonymity = 'anonymous' then (lv.analytics_policy_state()->>'min_cohort')::int else 1 end);
end;
$$;

-- Summary cards for every plan: responses, completion, median time. Withheld is null, never 0.
create function lv.analytics_summary_core(p_campaign uuid, p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate jsonb := lv.results_gate(p_campaign, p_account);
  v_sens boolean;
  v_min int;
  v_n bigint;
  v_started bigint;
  v_dur jsonb;
  v_dur_n bigint;
  v_median text;
  v_cum bigint := 0;
  d record;
begin
  if not coalesce((v_gate->>'ok')::boolean, false) then return v_gate; end if;
  v_sens := (v_gate->>'sensitive')::boolean;
  v_min := (v_gate->>'min')::int;
  select count(*) into v_n from lv.submissions s where s.campaign_id = p_campaign;
  select coalesce(sum(x.n), 0) into v_started from lv.campaign_response_context x
   where x.campaign_id = p_campaign and x.dimension = 'funnel' and x.value = 'started';
  select coalesce(sum(x.n), 0) into v_dur_n from lv.campaign_response_context x where x.campaign_id = p_campaign and x.dimension = 'duration';
  if v_dur_n > 0 and v_dur_n >= v_min then
    for d in select x.value, x.n from lv.campaign_response_context x
              where x.campaign_id = p_campaign and x.dimension = 'duration'
              order by array_position(array['lt_1m', '1_3m', '3_10m', 'gt_10m'], x.value) loop
      v_cum := v_cum + d.n;
      if v_median is null and v_cum * 2 >= v_dur_n then v_median := d.value; end if;
    end loop;
  end if;
  v_dur := jsonb_build_object('bucket', v_median, 'measured', case when v_dur_n >= v_min then v_dur_n end,
                              'suppressed', v_dur_n > 0 and v_dur_n < v_min);
  return jsonb_build_object('ok', true,
    'responses', jsonb_build_object('n', case when v_sens and v_n < v_min then null else v_n end,
                                    'suppressed', v_sens and v_n < v_min, 'released', true),
    -- Completion is measured only from 000044 on, and only when the starts can explain the responses.
    'completion', jsonb_build_object(
      'rate', case when (v_sens and v_n < v_min) or v_started = 0 or v_started < v_n then null else round(v_n::numeric / v_started, 4) end,
      'started', case when (v_sens and v_n < v_min) or v_started < v_n then null else v_started end,
      'suppressed', v_sens and v_n < v_min, 'measured', v_started > 0 and v_started >= v_n),
    'median_time', v_dur);
end;
$$;

create function lv.api_analytics_summary(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.analytics_summary_core(p_campaign, lv.current_account_id()); end; $$;

create function lv.api_trend_get(p_trend uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_runs jsonb := '[]'::jsonb;
  v_questions jsonb := '[]'::jsonb;
  r record;
  g record;
  v_points jsonb;
  v_sum jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select t.hub_id into v_hub from lv.trends t where t.id = p_trend;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Trend.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading Trends requires analytics.read.');
  end if;

  -- Runs in time order: when they opened, else when they were made (drafts from "Ask again" come last).
  for r in select c.*, coalesce(c.activated_at, c.created_at) as run_at
             from lv.trend_runs tr join lv.campaigns c on c.id = tr.campaign_id
            where tr.trend_id = p_trend order by (c.status = 'draft'), coalesce(c.activated_at, c.created_at), c.id loop
    v_sum := lv.analytics_summary_core(r.id, v_account);
    v_runs := v_runs || jsonb_build_object('campaign_id', r.id, 'title', r.title, 'status', r.status, 'anonymity', r.anonymity,
      'run_at', r.run_at, 'activated_at', r.activated_at, 'closed_at', r.closed_at, 'closes_at', r.closes_at,
      'finished', lv.campaign_finished(r.status, r.closes_at),
      'responses', case when coalesce((v_sum->>'ok')::boolean, false) then v_sum->'responses'
                        else jsonb_build_object('n', null, 'suppressed', false, 'released', false,
                                                'reason', case when r.status = 'draft' then 'draft' else 'not_released' end) end);
  end loop;

  -- Repeated questions: the same kind and wording (case and spacing ignored) in at least two runs. Text answers are
  -- never compared.
  for g in
    select q.kind, min(q.prompt) as prompt, lower(regexp_replace(btrim(q.prompt), '\s+', ' ', 'g')) as norm,
           count(distinct q.campaign_id) as runs, min(q.position) as pos
      from lv.trend_runs tr join lv.campaign_questions q on q.campaign_id = tr.campaign_id
     where tr.trend_id = p_trend and q.kind <> 'text'
     group by q.kind, lower(regexp_replace(btrim(q.prompt), '\s+', ' ', 'g'))
    having count(distinct q.campaign_id) >= 2
     order by min(q.position), 3
  loop
    v_points := '[]'::jsonb;
    for r in select c.id, (select q.id from lv.campaign_questions q where q.campaign_id = c.id and q.kind = g.kind
                                and lower(regexp_replace(btrim(q.prompt), '\s+', ' ', 'g')) = g.norm order by q.position limit 1) as qid
               from lv.trend_runs tr join lv.campaigns c on c.id = tr.campaign_id
              where tr.trend_id = p_trend order by (c.status = 'draft'), coalesce(c.activated_at, c.created_at), c.id loop
      v_points := v_points || (jsonb_build_object('campaign_id', r.id, 'question_id', r.qid)
                               || case when r.qid is null then jsonb_build_object('state', 'absent')
                                       else lv.trend_point(r.id, v_account, r.qid, g.kind) end);
    end loop;
    v_questions := v_questions || jsonb_build_object('key', g.kind || ':' || g.norm, 'kind', g.kind, 'prompt', g.prompt,
                                                     'runs', g.runs, 'points', v_points);
  end loop;

  return jsonb_build_object('ok', true, 'trend', lv.trend_json(p_trend), 'runs', v_runs, 'questions', v_questions,
    'can_manage', lv.has_capability(v_account, v_hub, 'campaign.manage'), 'limit', lv.trend_allowance(v_hub));
end;
$$;

create function lv.premium_results_guard(p_campaign uuid, p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid := (select c.hub_id from lv.campaigns c where c.id = p_campaign);
begin
  if v_hub is not null and p_account is not null and lv.membership_of(p_account, v_hub) is not null
     and not lv.feature_allowed(v_hub, p_account, 'analytics.premium') then
    return lv.err_x('lv_entitlement_required', 'Responses over time, device, source and cross-tabs come with Team Hub or Creator Pro.',
      jsonb_build_object('product', case when lv.hub_kind(v_hub) = 'personal' then 'creator_pro' else 'team_hub' end,
                         'feature', 'analytics.premium'));
  end if;
  return null;
end;
$$;

create function lv.api_analytics_premium(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_guard jsonb := lv.premium_results_guard(p_campaign, v_account);
  v_gate jsonb;
  v_sens boolean;
  v_min int;
  v_total bigint;
  v_cells jsonb;
  v_device jsonb;
  v_source jsonb;
  v_known bigint;
begin
  if v_guard is not null then return v_guard; end if;
  v_gate := lv.results_gate(p_campaign, v_account);
  if not coalesce((v_gate->>'ok')::boolean, false) then return v_gate; end if;
  v_sens := (v_gate->>'sensitive')::boolean;
  v_min := (v_gate->>'min')::int;
  select count(*) into v_total from lv.submissions s where s.campaign_id = p_campaign;

  -- Responses per day (anonymous submissions are already stored to the day).
  select coalesce(jsonb_agg(jsonb_build_object('key', d, 'n', n) order by d), '[]'::jsonb) into v_cells
    from (select to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD') as d, count(*) as n
            from lv.submissions s where s.campaign_id = p_campaign group by 1) x;
  v_cells := lv.release_cells(v_cells, v_sens, v_min, v_total);

  -- Device: responses before 000044 (or without a header) count as unknown.
  select coalesce(sum(x.n), 0) into v_known from lv.campaign_response_context x
   where x.campaign_id = p_campaign and x.dimension = 'device' and x.value <> 'unknown';
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', n) order by k), '[]'::jsonb) into v_device
    from (select x.value as k, x.n from lv.campaign_response_context x
           where x.campaign_id = p_campaign and x.dimension = 'device' and x.value <> 'unknown' and x.n > 0
          union all select 'unknown', v_total - least(v_known, v_total) where v_total - least(v_known, v_total) > 0) y;
  v_device := lv.release_cells(v_device, v_sens, v_min, v_total);

  select coalesce(sum(x.n), 0) into v_known from lv.campaign_response_context x where x.campaign_id = p_campaign and x.dimension = 'source';
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', n) order by k), '[]'::jsonb) into v_source
    from (select x.value as k, x.n from lv.campaign_response_context x
           where x.campaign_id = p_campaign and x.dimension = 'source' and x.n > 0
          union all select 'unknown', v_total - least(v_known, v_total) where v_total - least(v_known, v_total) > 0) y;
  v_source := lv.release_cells(v_source, v_sens, v_min, v_total);

  return jsonb_build_object('ok', true, 'over_time', v_cells, 'device', v_device, 'source', v_source);
end;
$$;

-- Two choice questions against each other. Rows are p_row's answers, columns p_col's; a cell counts the responses that
-- gave both (a multiple-choice answer counts in each option it picked).
create function lv.api_analytics_crosstab(p_campaign uuid, p_row uuid, p_col uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_guard jsonb := lv.premium_results_guard(p_campaign, v_account);
  v_gate jsonb;
  v_sens boolean;
  v_min int;
  qr record;
  qc record;
  v_cells jsonb;
  v_total bigint;
  v_safe jsonb;
  v_reason text;
begin
  if v_guard is not null then return v_guard; end if;
  v_gate := lv.results_gate(p_campaign, v_account);
  if not coalesce((v_gate->>'ok')::boolean, false) then return v_gate; end if;
  select * into qr from lv.campaign_questions q where q.id = p_row and q.campaign_id = p_campaign;
  select * into qc from lv.campaign_questions q where q.id = p_col and q.campaign_id = p_campaign;
  if qr.id is null or qc.id is null or qr.id = qc.id
     or qr.kind not in ('single_choice', 'multi_choice', 'yes_no') or qc.kind not in ('single_choice', 'multi_choice', 'yes_no') then
    return lv.err('lv_invalid_input', 'Choose two different choice or yes/no questions of this survey.');
  end if;
  v_sens := (v_gate->>'sensitive')::boolean;
  v_min := (v_gate->>'min')::int;

  select count(*) into v_total
    from lv.answers a join lv.answers b on b.submission_id = a.submission_id and b.question_id = p_col
    join lv.submissions s on s.id = a.submission_id
   where s.campaign_id = p_campaign and a.question_id = p_row;
  select coalesce(jsonb_agg(jsonb_build_object('row', r, 'col', c, 'n', n) order by r, c), '[]'::jsonb) into v_cells
    from (select er.k as r, ec.k as c, count(*) as n
            from lv.answers a join lv.answers b on b.submission_id = a.submission_id and b.question_id = p_col
            join lv.submissions s on s.id = a.submission_id
            cross join lateral jsonb_array_elements_text(case when jsonb_typeof(a.value) = 'array' then a.value else jsonb_build_array(a.value) end) er(k)
            cross join lateral jsonb_array_elements_text(case when jsonb_typeof(b.value) = 'array' then b.value else jsonb_build_array(b.value) end) ec(k)
           where s.campaign_id = p_campaign and a.question_id = p_row
           group by er.k, ec.k) x;

  if v_sens and v_total > 0 then
    v_safe := lv.safe_cells((select coalesce(jsonb_agg(jsonb_build_object('key', jsonb_build_array(x->'row', x->'col')::text, 'n', x->'n')), '[]'::jsonb)
                               from jsonb_array_elements(v_cells) x), v_min, v_total);
    if (v_safe->>'withheld')::boolean then v_reason := coalesce(v_safe->>'reason', 'below_min_cohort');
    elsif (v_safe->>'any_withheld')::boolean then v_reason := 'below_min_cohort';
    -- A row or column whose answers all sit in one cell would reveal everyone in it.
    elsif exists (select 1 from jsonb_array_elements(v_cells) x group by x->>'row' having count(*) = 1)
       or exists (select 1 from jsonb_array_elements(v_cells) x group by x->>'col' having count(*) = 1) then
      v_reason := 'dominance';
    end if;
    if v_reason is not null then
      return jsonb_build_object('ok', true, 'row_question_id', p_row, 'col_question_id', p_col, 'n', null,
                                'cells', '[]'::jsonb, 'withheld', true, 'reason', v_reason);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'row_question_id', p_row, 'col_question_id', p_col,
    'n', v_total, 'withheld', false, 'reason', null,
    'cells', (select coalesce(jsonb_agg(x || jsonb_build_object('suppressed', false)), '[]'::jsonb) from jsonb_array_elements(v_cells) x));
end;
$$;

-- ---------------------------------------------------------------- export: a person's Creator plan counts too
create or replace function lv.api_analytics_export(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_over jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_texts jsonb := '[]'::jsonb;
  qn jsonb;
  cell jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.export') then
    return lv.err('lv_forbidden', 'Exporting results requires analytics.export.');
  end if;
  -- 000044: the Hub's plan OR the person's Creator plan (analytics.export in the map).
  if not lv.feature_allowed(v_hub, v_account, 'analytics.export') then
    return lv.err_x('lv_entitlement_required',
      case when lv.hub_kind(v_hub) = 'personal' then 'Exports need Creator Plus or Creator Pro.' else 'Exports need a Starter or Team plan.' end,
      jsonb_build_object('product', case when lv.hub_kind(v_hub) = 'personal' then 'creator_plus' else 'starter_hub' end));
  end if;

  v_over := lv.api_analytics_overview(p_campaign);
  if not (v_over->>'ok')::boolean then return v_over; end if;

  v_rows := v_rows || jsonb_build_object('question_position', null, 'question', null, 'kind', null, 'key', 'participants',
    'n', v_over #> '{participant_count,n}', 'suppressed', v_over #> '{participant_count,suppressed}', 'reason', null);
  v_rows := v_rows || jsonb_build_object('question_position', null, 'question', null, 'kind', null, 'key', 'guests',
    'n', v_over #> '{participant_count,guest_n}', 'suppressed', v_over #> '{participant_count,guest_suppressed}', 'reason', null);
  for qn in select * from jsonb_array_elements(v_over->'questions') loop
    continue when not coalesce((qn #>> '{result,ok}')::boolean, false);
    if qn->>'kind' = 'text' then
      v_texts := v_texts || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt',
        'texts', qn #> '{result,texts}', 'texts_withheld', qn #> '{result,texts_withheld}');
      continue;
    end if;
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
                            'includes_guests', v_over->'includes_guests', 'rows', v_rows, 'texts', v_texts);
end;
$$;

-- ---------------------------------------------------------------- lv_api wrappers
create function lv_api.lv_trend_list(p_hub uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_trend_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_get(p_trend uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_get(p_trend); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_create(p_hub uuid default null, p_title text default null, p_description text default null,
                                       p_campaigns uuid[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_create(p_hub, p_title, p_description, p_campaigns); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_update(p_trend uuid, p_title text default null, p_description text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_update(p_trend, p_title, p_description); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_delete(p_trend uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_delete(p_trend); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_add(p_trend uuid, p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_add(p_trend, p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_remove(p_trend uuid, p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_remove(p_trend, p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_trend_ask_again(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_trend_ask_again(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_campaign_trend(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_campaign_trend(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_analytics_summary(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_analytics_summary(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_analytics_premium(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_analytics_premium(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_analytics_crosstab(p_campaign uuid, p_row uuid, p_col uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_analytics_crosstab(p_campaign, p_row, p_col); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_response_context(p_receipt uuid, p_source text default null, p_seconds int default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_response_context(p_receipt, p_source, p_seconds); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_response_started(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_response_started(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------- grants: tables only through lv_api; explicit execute
revoke all on lv.trends, lv.trend_runs, lv.campaign_response_context, lv.response_context_marks from public;
revoke all on function lv.trend_run_same_space(), lv.trend_limit(uuid), lv.trend_allowance(uuid), lv.trend_space(uuid, uuid),
  lv.trend_json(uuid), lv.api_trend_list(uuid), lv.api_trend_create(uuid, text, text, uuid[]), lv.trend_manage_guard(uuid, uuid),
  lv.api_trend_update(uuid, text, text), lv.api_trend_delete(uuid), lv.api_trend_add(uuid, uuid), lv.api_trend_remove(uuid, uuid),
  lv.api_trend_ask_again(uuid), lv.api_campaign_trend(uuid), lv.trend_point(uuid, uuid, uuid, text), lv.api_trend_get(uuid),
  lv.bump_context(uuid, text, text), lv.device_class(text), lv.capture_submission_device(), lv.api_response_context(uuid, text, int),
  lv.api_response_started(uuid), lv.release_cells(jsonb, boolean, int, bigint), lv.results_gate(uuid, uuid),
  lv.analytics_summary_core(uuid, uuid), lv.api_analytics_summary(uuid), lv.premium_results_guard(uuid, uuid),
  lv.api_analytics_premium(uuid), lv.api_analytics_crosstab(uuid, uuid, uuid)
  from public;
revoke all on function lv_api.lv_trend_list(uuid), lv_api.lv_trend_get(uuid), lv_api.lv_trend_create(uuid, text, text, uuid[]),
  lv_api.lv_trend_update(uuid, text, text), lv_api.lv_trend_delete(uuid), lv_api.lv_trend_add(uuid, uuid),
  lv_api.lv_trend_remove(uuid, uuid), lv_api.lv_trend_ask_again(uuid), lv_api.lv_campaign_trend(uuid),
  lv_api.lv_analytics_summary(uuid), lv_api.lv_analytics_premium(uuid), lv_api.lv_analytics_crosstab(uuid, uuid, uuid),
  lv_api.lv_response_context(uuid, text, int), lv_api.lv_response_started(uuid)
  from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on lv.trends, lv.trend_runs, lv.campaign_response_context, lv.response_context_marks from anon';
    -- Respondents may be guests: only the two context calls are open to them.
    execute 'grant execute on function lv_api.lv_response_context(uuid, text, int), lv_api.lv_response_started(uuid) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on lv.trends, lv.trend_runs, lv.campaign_response_context, lv.response_context_marks from authenticated';
    execute 'grant execute on function lv_api.lv_trend_list(uuid), lv_api.lv_trend_get(uuid), lv_api.lv_trend_create(uuid, text, text, uuid[]),
      lv_api.lv_trend_update(uuid, text, text), lv_api.lv_trend_delete(uuid), lv_api.lv_trend_add(uuid, uuid),
      lv_api.lv_trend_remove(uuid, uuid), lv_api.lv_trend_ask_again(uuid), lv_api.lv_campaign_trend(uuid),
      lv_api.lv_analytics_summary(uuid), lv_api.lv_analytics_premium(uuid), lv_api.lv_analytics_crosstab(uuid, uuid, uuid),
      lv_api.lv_response_context(uuid, text, int), lv_api.lv_response_started(uuid) to authenticated';
  end if;
end $$;

commit;
