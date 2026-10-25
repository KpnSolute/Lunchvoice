-- LunchVoice v2 canonical baseline 5/6: privacy-safe analytics.
--
-- Ported from prototype 20261024000500 (KEEP core). Properties deliberately preserved:
--   * Cells below the minimum cohort return NULL, NEVER 0 (a zero is itself a disclosure).
--   * When exactly one cell would be suppressed in a partition, a second cell is suppressed too, so the
--     suppressed value cannot be recovered by arithmetic on the published totals.
--   * Results are aggregates only; no per-submission row ever reaches a Hub admin.
--   * The minimum cohort comes from policy. If it is unset, NOTHING is published (fail closed).
--   * Anonymous results are published only after the Campaign has closed, and the participant count is
--     frozen at first release; if the population changes afterwards, results are withheld.
--
-- Simplified from the prototype: guest audience is not ported, so the "guests make results sensitive" branch
-- collapses into "anonymous makes results sensitive".

begin;

insert into lv.policy (key, value, note) values
  ('analytics.publish_complementary', 'true'::jsonb,
   'When exactly one cell falls below the minimum cohort, suppress a second cell as well so the first cannot be reconstructed by subtraction.')
on conflict (key) do nothing;

create table lv.analytics_releases (
  campaign_id uuid primary key references lv.campaigns (id) on delete cascade,
  participant_n bigint not null,
  released_at timestamptz not null default now(),
  released_by uuid references lv.accounts (id) on delete set null
);

create table lv.analytics_query_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  campaign_id uuid references lv.campaigns (id) on delete set null,
  caller uuid references lv.accounts (id) on delete set null,
  metric text,
  question_id uuid,
  outcome text not null
);

create function lv.analytics_policy_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_min jsonb := lv.policy_json('campaign.min_cohort');
  v_comp jsonb := lv.policy_json('analytics.publish_complementary');
begin
  if v_min is null then
    return jsonb_build_object('missing', jsonb_build_array('campaign.min_cohort'));
  end if;
  return jsonb_build_object(
    'min_cohort', (v_min)::int,
    'complementary', coalesce((v_comp)::boolean, true));
end;
$$;

-- The suppression engine. Pure and deterministic so it can be unit-tested directly.
create function lv.suppress_cells(p_cells jsonb, p_min_cohort int, p_complementary boolean) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  c jsonb;
  v_prim int := 0;
  v_pick text;
  v_pick_n bigint;
  v_n bigint;
  v_key text;
begin
  for c in select * from jsonb_array_elements(p_cells) loop
    if (c->>'n')::bigint > 0 and (c->>'n')::bigint < p_min_cohort then v_prim := v_prim + 1; end if;
  end loop;

  if p_complementary and v_prim = 1 then
    for c in select * from jsonb_array_elements(p_cells) loop
      v_n := (c->>'n')::bigint; v_key := c->>'key';
      if not (v_n > 0 and v_n < p_min_cohort)
         and (v_pick is null or v_n < v_pick_n or (v_n = v_pick_n and v_key < v_pick)) then
        v_pick := v_key; v_pick_n := v_n;
      end if;
    end loop;
  end if;

  for c in select * from jsonb_array_elements(p_cells) loop
    v_n := (c->>'n')::bigint; v_key := c->>'key';
    if v_n > 0 and v_n < p_min_cohort then
      v_out := v_out || jsonb_build_object('key', v_key, 'n', null, 'suppressed', true, 'reason', 'below_min_cohort');
    elsif v_pick is not null and v_key = v_pick then
      v_out := v_out || jsonb_build_object('key', v_key, 'n', null, 'suppressed', true, 'reason', 'complementary');
    else
      v_out := v_out || jsonb_build_object('key', v_key, 'n', v_n, 'suppressed', false, 'reason', null);
    end if;
  end loop;
  return v_out;
end;
$$;

-- Aggregate results for one Campaign. Never returns a submission or an account.
create function lv.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record;
  q record;
  v_pol jsonb;
  v_sensitive boolean;
  v_n bigint;
  v_rel record;
  v_cells jsonb;
  v_shown jsonb;
  v_min int;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_not_found', 'message', 'No such Campaign.'));
  end if;
  if c.status = 'draft' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'This Campaign has no results yet.'));
  end if;

  v_sensitive := (c.anonymity = 'anonymous');

  if v_sensitive then
    v_pol := lv.analytics_policy_state();
    if v_pol ? 'missing' then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'policy_missing');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Anonymous results are not available until the privacy policy is set.',
        'missing', v_pol->'missing'));
    end if;

    -- Live anonymous results are not published: they would become a running identity-linked tally.
    if c.status = 'active' then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'live_restricted');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Anonymous results are available only after the Campaign has finished.'));
    end if;

    -- Population is frozen at first release; a changed population withholds results.
    perform pg_advisory_xact_lock(hashtextextended('lv_release:' || p_campaign::text, 0));
    select count(*) into v_n from lv.participation x where x.campaign_id = p_campaign;
    select * into v_rel from lv.analytics_releases r where r.campaign_id = p_campaign;
    if v_rel.campaign_id is null then
      insert into lv.analytics_releases (campaign_id, participant_n, released_by) values (p_campaign, v_n, p_caller);
    elsif v_rel.participant_n <> v_n then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'population_changed');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'These results can no longer be shown because the population changed after first release.'));
    end if;
  end if;

  v_min := case when v_sensitive then (v_pol->>'min_cohort')::int else 1 end;

  if p_metric = 'participant_count' then
    select count(*) into v_n from lv.participation x where x.campaign_id = p_campaign;
    if v_sensitive and v_n < v_min then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'suppressed');
      return jsonb_build_object('ok', true, 'metric', p_metric, 'n', null, 'suppressed', true);
    end if;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'n', v_n, 'suppressed', false);
  end if;

  if p_metric = 'answer_distribution' then
    select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
    if not found then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'Choose a question of this Campaign.'));
    end if;
    if q.kind = 'text' then
      -- Free text can identify a respondent by its content; publishing it needs a decided policy.
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'type_not_available');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Results for free-text questions are not available yet.'));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb) into v_cells
    from (
      select coalesce(a.value #>> '{}', 'null') as k, count(*) as cn
        from lv.answers a
        join lv.submissions s on s.id = a.submission_id
       where s.campaign_id = p_campaign and a.question_id = p_question
       group by 1
    ) x;

    v_shown := lv.suppress_cells(v_cells, v_min, case when v_sensitive then (v_pol->>'complementary')::boolean else false end);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'cells', v_shown);
  end if;

  return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'Unknown metric.'));
end;
$$;

-- The Hub-facing entry point: requires the analytics capability in that Hub.
create function lv.analytics_query(p_campaign uuid, p_metric text, p_question uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, v_hub, 'analytics.read');
  return lv.analytics_core(p_campaign, v_account, p_metric, p_question);
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
end $$;

commit;
