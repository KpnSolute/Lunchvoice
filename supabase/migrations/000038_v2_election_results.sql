-- 000038: election night (founder direction 2026-11-12): parties, voter groups and a results call made for elections.
--
--   * Parties: a race's config may carry `parties`, a map from candidate to party (slate, team) name. Candidates without
--     one are independent. An election uses at most 8 parties so every party keeps a distinct, colour-blind-safe colour.
--   * Voter groups ("demographics"): ballot codes may be created for a group (for example "Grade 9"). A ballot vote
--     records only its group, never the code. Members voting with their account have no group.
--   * lv_election_results: winners, margins, party scoreboard, turnout and how each group voted, all through the strict
--     engine (lv.safe_cells, 000016): released only after the election ends, small groups merged, unanimity withheld.
--     The group-by-candidate table of a race is published only when EVERY cell in it is safe (each group has at least the
--     minimum cohort of voters in that race and no group is unanimous), so nothing hidden can be derived by subtraction.
--     Winners are announced once a race has at least the minimum cohort of votes, even when exact counts are withheld.
begin;

-- ---------------------------------------------------------------------------------------------------------
-- Parties on races
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.election_race_problem(p_kind text, p_config jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_opts jsonb := case when jsonb_typeof(p_config->'options') = 'array' then p_config->'options' else '[]'::jsonb end;
  v_n int := jsonb_array_length(v_opts);
  v_max numeric;
  v_parties jsonb := p_config->'parties';
begin
  if p_kind not in ('single_choice', 'multi_choice') then return 'kind'; end if;
  if v_n < 2 then return 'candidates'; end if;
  if p_kind = 'multi_choice' then
    if coalesce(jsonb_typeof(p_config->'max'), '') <> 'number' then return 'seats'; end if;
    v_max := (p_config->>'max')::numeric;
    if v_max <> floor(v_max) or v_max < 2 or v_max >= v_n then return 'seats'; end if;
  end if;
  if v_parties is not null and v_parties <> 'null'::jsonb then
    if jsonb_typeof(v_parties) <> 'object' then return 'parties'; end if;
    if exists (select 1 from jsonb_each(v_parties) e
                where not (v_opts @> jsonb_build_array(e.key)) or jsonb_typeof(e.value) <> 'string'
                   or btrim(e.value #>> '{}') = '' or length(e.value #>> '{}') > 40) then
      return 'parties';
    end if;
  end if;
  return null;
end;
$$;

-- Distinct parties across all races of an election, in order of first appearance (race position, then candidate order).
-- The order fixes each party's colour, so a party keeps one colour in every race.
create function lv.election_parties(p_campaign uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(p order by first_pos, first_idx), array[]::text[]) from (
    select btrim(q.config->'parties'->>(o.val)) as p, min(q.position) as first_pos, min(o.idx) as first_idx
      from lv.campaign_questions q
      cross join lateral jsonb_array_elements_text(coalesce(q.config->'options', '[]'::jsonb)) with ordinality as o(val, idx)
     where q.campaign_id = p_campaign and q.config->'parties'->>(o.val) is not null
     group by btrim(q.config->'parties'->>(o.val))) x
$$;

create or replace function lv.gate_evaluate(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c record;
  v_questions int;
  v_reasons jsonb := '[]'::jsonb;
  v_cap jsonb;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('not_found')); end if;

  if c.status <> 'draft' then v_reasons := v_reasons || to_jsonb('not_draft'::text); end if;
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;
  select count(*) into v_questions from lv.campaign_questions q where q.campaign_id = c.id;
  if v_questions = 0 then v_reasons := v_reasons || to_jsonb('no_questions'::text); end if;
  -- FB-01: role targeting is for identified Campaigns only (overlapping role audiences let anonymous answers be
  -- differenced back to one person).
  if c.audience_scope = 'roles' and c.anonymity = 'anonymous' then
    v_reasons := v_reasons || to_jsonb('role_targeting_anonymous'::text);
  end if;
  if c.audience_scope = 'roles' then
    if not coalesce(lv.hub_limit(c.hub_id, 'campaigns.role_targeting') = 'true'::jsonb, false) then
      v_reasons := v_reasons || to_jsonb('role_targeting_unavailable'::text);
    end if;
    if not exists (select 1 from lv.campaign_audience_roles ar where ar.campaign_id = c.id) then
      v_reasons := v_reasons || to_jsonb('audience_empty'::text);
    end if;
  end if;
  -- 000037: an election needs its plan (checked again at publish: expired access fails closed) and valid races.
  if c.mode = 'election' then
    if not coalesce(lv.hub_limit(c.hub_id, 'modes.election') = 'true'::jsonb, false) then
      v_reasons := v_reasons || to_jsonb('election_unavailable'::text);
    end if;
    if exists (select 1 from lv.campaign_questions q where q.campaign_id = c.id and lv.election_race_problem(q.kind, q.config) is not null) then
      v_reasons := v_reasons || to_jsonb('election_race_invalid'::text);
    end if;
    -- 000038: at most 8 parties per election (one distinct colour each).
    if coalesce(array_length(lv.election_parties(c.id), 1), 0) > 8 then
      v_reasons := v_reasons || to_jsonb('election_too_many_parties'::text);
    end if;
  end if;

  v_cap := lv.capacity_check(p_campaign);
  v_reasons := v_reasons || (v_cap->'reasons');
  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons) || (v_cap - 'reasons');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Voter groups on ballot codes
-- ---------------------------------------------------------------------------------------------------------
alter table lv.ballot_codes add column group_label text check (group_label is null or length(group_label) between 1 and 40);
alter table lv.submissions add column ballot_group text check (ballot_group is null or length(ballot_group) between 1 and 40);

create function lv.ballot_group_clean(p_label text) returns text
language sql immutable set search_path = ''
as $$ select nullif(btrim(regexp_replace(regexp_replace(coalesce(p_label, ''), '[[:cntrl:]]', '', 'g'), '[[:space:]]+', ' ', 'g')), '') $$;

drop function lv_api.lv_election_ballot_codes_create(uuid, int);
drop function lv.api_election_ballot_codes_create(uuid, int);

create function lv.api_election_ballot_codes_create(p_campaign uuid, p_count int, p_group text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_codes text[] := array[]::text[];
  v_code text;
  v_total int;
  v_group text := lv.ballot_group_clean(p_group);
begin
  c := lv.managed_campaign(p_campaign, v_account);
  perform lv.premium_guard(c.hub_id, false);
  if c.mode <> 'election' then return lv.err('lv_invalid_input', 'Ballot codes are only for elections.'); end if;
  if c.status in ('closed', 'archived') or lv.campaign_finished(c.status, c.closes_at) then
    return lv.err('lv_lifecycle_invalid', 'This election is finished.');
  end if;
  if p_count is null or p_count < 1 or p_count > 500 then
    return lv.err('lv_invalid_input', 'Create between 1 and 500 ballot codes at a time.');
  end if;
  if v_group is not null and length(v_group) > 40 then return lv.err('lv_invalid_input', 'Keep the group name to 40 characters.'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_ballot:' || c.id::text, 0));
  if exists (select 1 from lv.participation p where p.campaign_id = c.id) then
    return lv.err('lv_not_available', 'Members have already voted, so this election cannot switch to ballot codes.');
  end if;
  if v_group is not null and not exists (select 1 from lv.ballot_codes b where b.campaign_id = c.id and b.group_label = v_group)
     and (select count(distinct b.group_label) from lv.ballot_codes b where b.campaign_id = c.id) >= 20 then
    return lv.err('lv_limit_reached', 'An election can have at most 20 voter groups.');
  end if;
  select count(*) into v_total from lv.ballot_codes b where b.campaign_id = c.id;
  if v_total + p_count > 5000 then
    return jsonb_set(jsonb_set(lv.err('lv_limit_reached', 'An election can have at most 5000 ballot codes.'),
                               '{error,limit}', '5000'), '{error,used}', to_jsonb(v_total));
  end if;
  while coalesce(array_length(v_codes, 1), 0) < p_count loop
    v_code := lv.ballot_code_new();
    insert into lv.ballot_codes (campaign_id, hub_id, code_hash, group_label) values (c.id, c.hub_id, lv.ballot_code_hash(c.id, v_code), v_group)
    on conflict do nothing;
    if found then v_codes := v_codes || v_code; end if;
  end loop;
  perform lv.audit(v_account, c.hub_id, 'election.ballot_codes_created', c.id::text, jsonb_build_object('count', p_count, 'group', v_group));
  return jsonb_build_object('ok', true, 'codes', to_jsonb(v_codes), 'issued', v_total + p_count, 'group', v_group);
end;
$$;

create function lv_api.lv_election_ballot_codes_create(p_campaign uuid, p_count int, p_group text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_election_ballot_codes_create(p_campaign, p_count, p_group); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Issued per group is the organiser's own number; used (turnout) stays hidden until the end.
create or replace function lv.api_election_ballot_status(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_finished boolean;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.mode <> 'election' then return lv.err('lv_invalid_input', 'Ballot codes are only for elections.'); end if;
  v_finished := lv.campaign_finished(c.status, c.closes_at);
  return jsonb_build_object('ok', true,
    'issued', (select count(*) from lv.ballot_codes b where b.campaign_id = c.id),
    'used', case when v_finished then (select count(*) from lv.ballot_codes b
                                        join lv.guest_participation g on g.campaign_id = b.campaign_id and g.key_hash = b.code_hash
                                       where b.campaign_id = c.id) end,
    'used_visible', v_finished,
    'groups', coalesce((select jsonb_agg(jsonb_build_object('label', x.group_label, 'issued', x.n) order by x.group_label nulls last)
                          from (select b.group_label, count(*) as n from lv.ballot_codes b where b.campaign_id = c.id group by b.group_label) x),
                       '[]'::jsonb));
end;
$$;

-- Same as 000037, and the vote carries the code's group (never the code).
create or replace function lv.api_ballot_submit(p_join_code text, p_ballot_code text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_hash text;
  v_bad text;
  v_sub uuid;
  v_receipt uuid;
  v_group text;
begin
  select * into c from lv.campaigns x
   where x.id = lv.campaign_id_by_code(p_join_code) and x.status = 'active' and x.blocked_at is null and x.mode = 'election';
  if c.id is null then return lv.err('lv_not_found', 'No such election.'); end if;
  if lv.campaign_phase(c.status, c.opens_at, c.closes_at) <> 'open' then
    return lv.err('lv_closed', 'This election is not accepting votes.');
  end if;
  v_hash := lv.ballot_code_hash(c.id, p_ballot_code);
  perform pg_advisory_xact_lock(hashtextextended('lv_ballot:' || c.id::text, 0));
  select b.group_label into v_group from lv.ballot_codes b where b.campaign_id = c.id and b.code_hash = v_hash;
  if not found then
    return jsonb_set(lv.err('lv_not_found', 'That ballot code is not valid for this election. Check it and try again.'),
                     '{error,field}', '"ballot_code"');
  end if;
  if exists (select 1 from lv.guest_participation g where g.campaign_id = c.id and g.key_hash = v_hash) then
    return lv.err('lv_conflict', 'This ballot code has already been used.');
  end if;
  v_bad := lv.validate_answers(c.id, p_answers);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id, is_guest, ballot_group)
  values (c.id, c.hub_id, c.revision, null, false, v_group)
  returning id into v_sub;
  insert into lv.answers (submission_id, question_id, value)
  select v_sub, (e->>'question_id')::uuid, e->'value'
    from jsonb_array_elements(p_answers) e
   where e->'value' is not null and e->'value' <> 'null'::jsonb;
  insert into lv.guest_participation (campaign_id, hub_id, key_hash, campaign_revision)
  values (c.id, c.hub_id, v_hash, c.revision)
  returning receipt_id into v_receipt;
  return jsonb_build_object('ok', true, 'receipt_id', v_receipt);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------------------------------------
-- Votes per candidate in one race, optionally only from submissions whose group is (or is not) in p_groups.
-- '' stands for "no group". Returns {cells: [{key, n}], total}.
create function lv.election_race_cells(p_campaign uuid, p_question uuid, p_groups text[], p_in boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with a as (
    select x.value from lv.answers x join lv.submissions s on s.id = x.submission_id
     where s.campaign_id = p_campaign and x.question_id = p_question
       and (p_groups is null or ((coalesce(s.ballot_group, '') = any(p_groups)) = p_in))
  )
  select jsonb_build_object(
    'cells', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'n', n) order by k) from (
               select e.k, count(*) as n from a
               cross join lateral jsonb_array_elements_text(case when jsonb_typeof(a.value) = 'array' then a.value else jsonb_build_array(a.value) end) e(k)
               group by e.k) y), '[]'::jsonb),
    'total', (select count(*) from a))
$$;

create function lv.api_election_results(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_count jsonb;
  v_min int;
  v_parties text[];
  v_voters bigint;
  v_issued bigint;
  v_ballot boolean;
  v_group_cells jsonb;
  v_group_safe jsonb;
  v_pub_groups text[] := array[]::text[];
  v_other boolean := false;
  v_sets jsonb := '[]'::jsonb;
  v_groups_out jsonb := '[]'::jsonb;
  v_races jsonb := '[]'::jsonb;
  q record;
  v_rc jsonb;
  v_safe jsonb;
  v_seats int;
  v_ranked jsonb;
  v_boundary bigint;
  v_next bigint;
  v_winners jsonb;
  v_tie boolean;
  v_cands jsonb;
  v_by_group jsonb;
  v_by_ok boolean;
  st jsonb;
  v_gc jsonb;
  v_gs jsonb;
  v_party_votes jsonb;
  v_margin numeric;
  g record;
  v_rate numeric;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(v_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading results requires analytics.read.');
  end if;
  if c.mode <> 'election' then return lv.err('lv_invalid_input', 'Election results are only for elections.'); end if;

  -- The usual release gate: finished, policy set, population frozen at first release. Logged like every result.
  v_count := lv.analytics_core(p_campaign, v_account, 'participant_count', null);
  if not coalesce((v_count->>'ok')::boolean, false) then return v_count; end if;
  v_min := (lv.analytics_policy_state()->>'min_cohort')::int;
  v_parties := lv.election_parties(c.id);

  select count(*) into v_voters from lv.submissions s where s.campaign_id = c.id;
  select count(*) into v_issued from lv.ballot_codes b where b.campaign_id = c.id;
  v_ballot := v_issued > 0;

  -- Voter groups: a group is shown when it has at least the cohort of voters (the strict engine merges the rest into
  -- one bucket of at least the cohort, or withholds the breakdown).
  if v_ballot and (select count(distinct coalesce(b.group_label, '')) from lv.ballot_codes b where b.campaign_id = c.id) >= 2 then
    v_group_cells := coalesce((select jsonb_agg(jsonb_build_object('key', k, 'n', n) order by k)
                                 from (select coalesce(s.ballot_group, '') as k, count(*) as n from lv.submissions s
                                        where s.campaign_id = c.id group by 1) y), '[]'::jsonb);
    v_group_safe := lv.safe_cells(v_group_cells, v_min, v_voters);
    if not (v_group_safe->>'withheld')::boolean then
      select coalesce(array_agg(x->>'key'), array[]::text[]) into v_pub_groups
        from jsonb_array_elements(v_group_safe->'cells') x where x->>'key' is not null;
      v_other := (v_group_safe->>'any_withheld')::boolean;
    end if;
  end if;

  -- Turnout per group (issued is the organiser's own number; voted follows the engine; the rate is withheld at 100%
  -- or when the non-voters are fewer than the cohort, as for participation_rate).
  if v_ballot then
    for g in select coalesce(b.group_label, '') as label, count(*) as issued from lv.ballot_codes b where b.campaign_id = c.id group by 1 order by 1 loop
      st := null;
      if g.label = any(v_pub_groups) then
        st := (select x from jsonb_array_elements(v_group_safe->'cells') x where x->>'key' = g.label limit 1);
      end if;
      v_rate := case when st is not null and (st->>'n')::bigint < g.issued and g.issued - (st->>'n')::bigint >= v_min
                     then round(100.0 * (st->>'n')::bigint / g.issued, 1) end;
      v_groups_out := v_groups_out || jsonb_build_object('label', nullif(g.label, ''), 'issued', g.issued,
        'voted', case when st is not null then (st->>'n')::bigint end, 'turnout_pct', v_rate, 'merged', st is null);
    end loop;
  end if;

  -- The sets a by-group table may show: each published group, plus "Other groups" when the engine merged some.
  if coalesce(array_length(v_pub_groups, 1), 0) + (v_other)::int >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object('label', k, 'groups', jsonb_build_array(k), 'in', true) order by k), '[]'::jsonb)
      into v_sets from unnest(v_pub_groups) k;
    if v_other then
      v_sets := v_sets || jsonb_build_object('label', null, 'other', true, 'groups', to_jsonb(v_pub_groups), 'in', false);
    end if;
  end if;

  for q in select * from lv.campaign_questions x where x.campaign_id = c.id order by x.position loop
    v_rc := lv.election_race_cells(c.id, q.id, null, true);
    v_safe := lv.safe_cells(v_rc->'cells', v_min, (v_rc->>'total')::bigint);
    v_seats := case when q.kind = 'multi_choice' then coalesce((q.config->>'max')::int, 1) else 1 end;

    -- Candidates, in ballot order, with the published count and share (null when withheld).
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', o.val, 'party', nullif(btrim(q.config->'parties'->>o.val), ''),
             'votes', (select (x->>'n')::bigint from jsonb_array_elements(v_safe->'cells') x where x->>'key' = o.val),
             'share', (select round(100.0 * (x->>'n')::bigint / nullif((v_rc->>'total')::bigint, 0), 1)
                         from jsonb_array_elements(v_safe->'cells') x where x->>'key' = o.val))
           order by o.idx), '[]'::jsonb)
      into v_cands
      from jsonb_array_elements_text(coalesce(q.config->'options', '[]'::jsonb)) with ordinality o(val, idx);

    -- Winners from the raw tally, announced once the race has at least the cohort of votes.
    v_winners := null; v_tie := false; v_margin := null;
    if (v_rc->>'total')::bigint >= v_min then
      select coalesce(jsonb_agg(jsonb_build_object('name', o.val, 'n', coalesce((select (x->>'n')::bigint from jsonb_array_elements(v_rc->'cells') x where x->>'key' = o.val), 0))
                                order by coalesce((select (x->>'n')::bigint from jsonb_array_elements(v_rc->'cells') x where x->>'key' = o.val), 0) desc, o.val), '[]'::jsonb)
        into v_ranked
        from jsonb_array_elements_text(coalesce(q.config->'options', '[]'::jsonb)) o(val);
      v_boundary := (v_ranked->(v_seats - 1)->>'n')::bigint;
      v_next := (v_ranked->v_seats->>'n')::bigint;
      v_tie := v_next is not null and v_next = v_boundary;
      select coalesce(jsonb_agg(r->>'name'), '[]'::jsonb) into v_winners
        from jsonb_array_elements(v_ranked) with ordinality t(r, i)
       where (r->>'n')::bigint > coalesce(case when v_tie then v_boundary end, -1) and i <= v_seats;
      -- The margin (points between the last winner and the first runner-up) only when both shares are published.
      if not v_tie and not (v_safe->>'withheld')::boolean and v_next is not null
         and exists (select 1 from jsonb_array_elements(v_cands) x where x->>'name' = v_ranked->(v_seats - 1)->>'name' and x->'share' <> 'null'::jsonb)
         and exists (select 1 from jsonb_array_elements(v_cands) x where x->>'name' = v_ranked->v_seats->>'name' and x->'share' <> 'null'::jsonb) then
        v_margin := round(100.0 * (v_boundary - v_next) / nullif((v_rc->>'total')::bigint, 0), 1);
      end if;
    end if;

    -- Party share of the votes cast in the race (in a multi-seat race each voter casts several), only when every
    -- candidate's count is published.
    v_party_votes := null;
    if not (v_safe->>'withheld')::boolean and not (v_safe->>'any_withheld')::boolean and coalesce(array_length(v_parties, 1), 0) > 0 then
      select jsonb_agg(jsonb_build_object('party', p, 'votes', s, 'share', round(100.0 * s / nullif(t, 0), 1)) order by s desc, p)
        into v_party_votes
        from (select coalesce(x->>'party', '') as p, sum(coalesce((x->>'votes')::bigint, 0)) as s,
                     (select sum(coalesce((z->>'votes')::bigint, 0)) from jsonb_array_elements(v_cands) z) as t
                from jsonb_array_elements(v_cands) x group by 1) y;
    end if;

    -- How each group voted: published only when every cell of every set is safe.
    v_by_group := null; v_by_ok := jsonb_array_length(v_sets) >= 2;
    if v_by_ok then
      v_by_group := '[]'::jsonb;
      for st in select * from jsonb_array_elements(v_sets) loop
        v_gc := lv.election_race_cells(c.id, q.id, array(select jsonb_array_elements_text(st->'groups')), (st->>'in')::boolean);
        v_gs := lv.safe_cells(v_gc->'cells', v_min, (v_gc->>'total')::bigint);
        if (v_gs->>'withheld')::boolean or (v_gs->>'any_withheld')::boolean
           or exists (select 1 from jsonb_array_elements_text(coalesce(q.config->'options', '[]'::jsonb)) o(val)
                       where not exists (select 1 from jsonb_array_elements(v_gs->'cells') x where x->>'key' = o.val)
                         and exists (select 1 from jsonb_array_elements(v_gc->'cells') x where x->>'key' = o.val)) then
          v_by_ok := false; exit;
        end if;
        v_by_group := v_by_group || jsonb_build_object(
          'label', nullif(st->>'label', ''), 'other', coalesce((st->>'other')::boolean, false), 'voters', (v_gc->>'total')::bigint,
          'candidates', (select coalesce(jsonb_agg(jsonb_build_object('name', o.val,
                                  'votes', coalesce((select (x->>'n')::bigint from jsonb_array_elements(v_gs->'cells') x where x->>'key' = o.val), 0),
                                  'share', round(100.0 * coalesce((select (x->>'n')::bigint from jsonb_array_elements(v_gs->'cells') x where x->>'key' = o.val), 0)
                                                 / nullif((v_gc->>'total')::bigint, 0), 1)) order by o.idx), '[]'::jsonb)
                           from jsonb_array_elements_text(coalesce(q.config->'options', '[]'::jsonb)) with ordinality o(val, idx)));
      end loop;
      if not v_by_ok then v_by_group := null; end if;
    end if;

    v_races := v_races || jsonb_build_object(
      'question_id', q.id, 'position', q.position, 'prompt', q.prompt, 'seats', v_seats,
      'votes', case when (v_safe->>'withheld')::boolean then null else (v_rc->>'total')::bigint end,
      'withheld', (v_safe->>'withheld')::boolean, 'withheld_reason', v_safe->'reason', 'some_withheld', (v_safe->>'any_withheld')::boolean,
      'candidates', v_cands, 'winners', v_winners, 'tie', v_tie,
      'tied', case when v_tie then (select jsonb_agg(r->>'name') from jsonb_array_elements(v_ranked) r where (r->>'n')::bigint = v_boundary) end,
      'margin_pts', v_margin, 'parties', v_party_votes,
      'by_group', v_by_group,
      'by_group_reason', case when v_by_group is not null then null
                              when not v_ballot then 'no_groups'
                              when jsonb_array_length(v_sets) < 2 then 'not_enough_groups'
                              else 'small_groups' end);
  end loop;

  return jsonb_build_object('ok', true,
    'min_cohort', v_min,
    'parties', to_jsonb(v_parties),
    'voting', case when v_ballot then 'ballot_codes' else 'members' end,
    'turnout', jsonb_build_object(
      'voters', case when v_voters >= v_min then v_voters end,
      'issued', case when v_ballot then v_issued end,
      'turnout_pct', case when v_ballot and v_voters >= v_min and v_voters < v_issued and v_issued - v_voters >= v_min
                          then round(100.0 * v_voters / v_issued, 1) end,
      'participation', case when not v_ballot then lv.analytics_core(p_campaign, v_account, 'participation_rate', null) - 'ok' - 'metric' end),
    'groups', v_groups_out,
    -- Seats won per party, from the races whose winners are known and not tied.
    'scoreboard', coalesce((select jsonb_agg(jsonb_build_object('party', nullif(p, ''), 'seats', n) order by n desc, p)
                              from (select coalesce(btrim(q2.config->'parties'->>w), '') as p, count(*) as n
                                      from jsonb_array_elements(v_races) r
                                      cross join lateral jsonb_array_elements_text(case when (r->>'tie')::boolean or r->'winners' is null or r->'winners' = 'null'::jsonb then '[]'::jsonb else r->'winners' end) w
                                      join lv.campaign_questions q2 on q2.id = (r->>'question_id')::uuid
                                     group by 1) z), '[]'::jsonb),
    'seats_total', (select coalesce(sum((r->>'seats')::int), 0) from jsonb_array_elements(v_races) r),
    'races', v_races);
end;
$$;

create function lv_api.lv_election_results(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_election_results(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on function lv.election_parties(uuid) from public;
revoke all on function lv.ballot_group_clean(text) from public;
revoke all on function lv.api_election_ballot_codes_create(uuid, int, text) from public;
revoke all on function lv.election_race_cells(uuid, uuid, text[], boolean) from public;
revoke all on function lv.api_election_results(uuid) from public;
revoke all on function lv_api.lv_election_ballot_codes_create(uuid, int, text) from public;
revoke all on function lv_api.lv_election_results(uuid) from public;
do $$
declare
  v_private constant text := 'lv.election_parties(uuid), lv.ballot_group_clean(text), lv.api_election_ballot_codes_create(uuid, int, text), '
    'lv.election_race_cells(uuid, uuid, text[], boolean), lv.api_election_results(uuid)';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function ' || v_private || ' from anon';
    execute 'revoke all on function lv_api.lv_election_ballot_codes_create(uuid, int, text), lv_api.lv_election_results(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function ' || v_private || ' from authenticated';
    execute 'grant execute on function lv_api.lv_election_ballot_codes_create(uuid, int, text), lv_api.lv_election_results(uuid) to authenticated';
  end if;
end $$;

commit;
