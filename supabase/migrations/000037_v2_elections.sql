-- 000037: Elections and the Yes/No feedback type (founder direction 2026-11-11).
--
-- Vocabulary: Poll, Rating, Yes/No, Open feedback and Election are feedback types; a Survey combines several questions.
-- Free Quick Surveys get the basic types (now including Yes/No). Elections are a Hub feature (Starter and Team families,
-- so Campaign Starter and Campaign Plus too), read from the entitlement map key modes.election.
--
-- An election is a Campaign with mode 'election'. Each question is a RACE: a single_choice question (one seat) or a
-- multi_choice question with config.max seats (choose up to N). The options are the candidates. Rules:
--   * Secret ballot: always anonymous, never guests (constraint campaigns_election_secret). Results follow the existing
--     anonymous rules: released only after the election finishes, small groups suppressed, never shown as zero.
--   * Strict votes: a vote must name real candidates, distinct, no more than the seats. A voter may skip a race but must
--     vote in at least one. Votes are final (one participation per voter; nothing edits a submission).
--   * One voter list per election: either the Hub's members (or chosen roles, which stay identified-only per FB-01) or
--     one-time BALLOT CODES the organiser hands out (for voters without accounts, e.g. a school). Never both: once
--     codes exist members cannot vote, and codes cannot be issued after a member has voted.
--   * Ballot codes are shown once and stored only as a hash. A used code is recorded as a guest_participation row keyed
--     by that hash, so the existing population, release and suppression logic counts ballot voters. Nothing links a
--     code to the submission it produced; turnout is shown only after the election finishes.
begin;

-- ---------------------------------------------------------------------------------------------------------
-- Modes and entitlements
-- ---------------------------------------------------------------------------------------------------------
alter table lv.campaigns drop constraint campaigns_mode_check;
alter table lv.campaigns add constraint campaigns_mode_check
  check (mode in ('survey', 'poll', 'rating', 'yes_no', 'feedback', 'election'));
alter table lv.campaigns add constraint campaigns_election_secret
  check (mode <> 'election' or (anonymity = 'anonymous' and audience = 'members'));

update lv.plan_limits set value = '["survey","poll","rating","yes_no","feedback"]',
                          note = 'Founder 2026-11-11: the basic feedback types are free in Quick Surveys; elections are not.'
 where family = 'free' and key = 'quick.modes';
insert into lv.plan_limits (family, key, value, note) values
  ('starter', 'modes.election', 'true', 'Founder 2026-11-11: elections are a Hub feature (Starter family).'),
  ('team', 'modes.election', 'true', 'Founder 2026-11-11: elections are a Hub feature (Team family).');

-- An election needs a Hub plan that includes it, and is a secret ballot from the start.
create function lv.election_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.mode <> 'election' or (tg_op = 'UPDATE' and old.mode = 'election') then return new; end if;
  if lv.hub_kind(new.hub_id) = 'personal' then
    raise exception 'lv_invalid_input: Elections are part of Hub plans, not Quick Surveys.' using errcode = '22023';
  end if;
  if not coalesce(lv.hub_limit(new.hub_id, 'modes.election') = 'true'::jsonb, false) then
    raise exception 'lv_entitlement_required: Elections are included with Starter and Team Hub plans.' using errcode = '42501';
  end if;
  if new.anonymity <> 'anonymous' then
    raise exception 'lv_invalid_input: An election is always a secret ballot. Make the Campaign anonymous first.' using errcode = '22023';
  end if;
  if new.audience <> 'members' then
    raise exception 'lv_invalid_input: Guests cannot vote in an election. Turn guests off first, or use ballot codes.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger campaigns_election_guard before insert or update of mode on lv.campaigns
  for each row execute function lv.election_guard();

-- ---------------------------------------------------------------------------------------------------------
-- Races
-- ---------------------------------------------------------------------------------------------------------
-- Why a race cannot be published, or null when it is a valid race. Candidates are the options, which every choice
-- question already validates (2 to 10, all different, 000018). A multi-seat race is multi_choice with config.max seats.
create function lv.election_race_problem(p_kind text, p_config jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_n int := jsonb_array_length(case when jsonb_typeof(p_config->'options') = 'array' then p_config->'options' else '[]'::jsonb end);
  v_max numeric;
begin
  if p_kind not in ('single_choice', 'multi_choice') then return 'kind'; end if;
  if v_n < 2 then return 'candidates'; end if;
  if p_kind = 'multi_choice' then
    if coalesce(jsonb_typeof(p_config->'max'), '') <> 'number' then return 'seats'; end if;
    v_max := (p_config->>'max')::numeric;
    if v_max <> floor(v_max) or v_max < 2 or v_max >= v_n then return 'seats'; end if;
  end if;
  return null;
end;
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
  end if;

  v_cap := lv.capacity_check(p_campaign);
  v_reasons := v_reasons || (v_cap->'reasons');
  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons) || (v_cap - 'reasons');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Votes
-- ---------------------------------------------------------------------------------------------------------
-- Same as 000017 for every other Campaign. In an election each vote must name real candidates of that race.
create or replace function lv.validate_answers(p_campaign uuid, p_answers jsonb) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  q record;
  v_val jsonb;
  v_seen int := 0;
  v_election boolean := (select c.mode = 'election' from lv.campaigns c where c.id = p_campaign);
  v_opts jsonb;
  v_seats int;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return 'answers must be an array'; end if;

  for q in select * from lv.campaign_questions where campaign_id = p_campaign loop
    select e->'value' into v_val
      from jsonb_array_elements(p_answers) e
     where (e->>'question_id')::uuid = q.id
     limit 1;

    if v_val is null or v_val = 'null'::jsonb then
      -- A voter may leave a race blank (an abstention); other Campaigns follow the question's optional flag.
      if coalesce(v_election, false) or coalesce(q.config->>'optional', 'false') = 'true' then continue; end if;
      return 'missing answer for question ' || q.position;
    end if;

    if q.kind = 'rating' then
      if jsonb_typeof(v_val) <> 'number' then return 'rating must be a number'; end if;
      if (v_val)::numeric < 1 or (v_val)::numeric > 5 then return 'rating out of range'; end if;
    end if;

    if coalesce(v_election, false) then
      v_opts := coalesce(q.config->'options', '[]'::jsonb);
      if q.kind = 'single_choice' then
        if jsonb_typeof(v_val) <> 'string' or not (v_opts @> jsonb_build_array(v_val)) then
          return 'choose a candidate in race ' || q.position;
        end if;
      elsif q.kind = 'multi_choice' then
        v_seats := coalesce((q.config->>'max')::int, 1);
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) = 0 then return 'choose a candidate in race ' || q.position; end if;
        if jsonb_array_length(v_val) > v_seats then return 'choose at most ' || v_seats || ' in race ' || q.position; end if;
        if exists (select 1 from jsonb_array_elements(v_val) x where jsonb_typeof(x) <> 'string' or not (v_opts @> jsonb_build_array(x))) then
          return 'choose a candidate in race ' || q.position;
        end if;
        if (select count(distinct x) from jsonb_array_elements(v_val) x) <> jsonb_array_length(v_val) then
          return 'choose each candidate once in race ' || q.position;
        end if;
      else
        return 'race ' || q.position || ' is not a ballot';
      end if;
    end if;
    v_seen := v_seen + 1;
  end loop;

  if v_seen = 0 then return case when coalesce(v_election, false) then 'vote in at least one race' else 'answer at least one question' end; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Ballot codes
-- ---------------------------------------------------------------------------------------------------------
create table lv.ballot_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  constraint ballot_codes_once unique (campaign_id, code_hash)
);
alter table lv.ballot_codes enable row level security;
revoke all on lv.ballot_codes from public;

create function lv.ballot_code_normalize(p_code text) returns text
language sql immutable set search_path = ''
as $$ select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create function lv.ballot_code_hash(p_campaign uuid, p_code text) returns text
language sql stable security definer set search_path = ''
as $$ select lv.sha256_hex('ballot:' || p_campaign::text || ':' || lv.ballot_code_normalize(p_code)) $$;

-- Ten characters from a 32-letter alphabet without look-alikes (no I, O, 0, 1): 50 bits, shown as ABCDE-FGHJK.
create function lv.ballot_code_new() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b bytea := lv.random_bytes(10);
  v_out text := '';
begin
  for i in 0..9 loop
    v_out := v_out || substr(v_alpha, (get_byte(v_b, i) % 32) + 1, 1);
    if i = 4 then v_out := v_out || '-'; end if;
  end loop;
  return v_out;
end;
$$;

-- One voter list: members cannot vote in an election that uses ballot codes.
create function lv.election_member_vote_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from lv.ballot_codes b where b.campaign_id = new.campaign_id) then
    raise exception 'lv_not_available: This election uses ballot codes. Vote with the code you were given.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger participation_election_ballot_only before insert on lv.participation
  for each row execute function lv.election_member_vote_guard();

create function lv.api_election_ballot_codes_create(p_campaign uuid, p_count int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_codes text[] := array[]::text[];
  v_code text;
  v_total int;
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
  perform pg_advisory_xact_lock(hashtextextended('lv_ballot:' || c.id::text, 0));
  if exists (select 1 from lv.participation p where p.campaign_id = c.id) then
    return lv.err('lv_not_available', 'Members have already voted, so this election cannot switch to ballot codes.');
  end if;
  select count(*) into v_total from lv.ballot_codes b where b.campaign_id = c.id;
  if v_total + p_count > 5000 then
    return jsonb_set(jsonb_set(lv.err('lv_limit_reached', 'An election can have at most 5000 ballot codes.'),
                               '{error,limit}', '5000'), '{error,used}', to_jsonb(v_total));
  end if;
  while coalesce(array_length(v_codes, 1), 0) < p_count loop
    v_code := lv.ballot_code_new();
    insert into lv.ballot_codes (campaign_id, hub_id, code_hash) values (c.id, c.hub_id, lv.ballot_code_hash(c.id, v_code))
    on conflict do nothing;
    if found then v_codes := v_codes || v_code; end if;
  end loop;
  perform lv.audit(v_account, c.hub_id, 'election.ballot_codes_created', c.id::text, jsonb_build_object('count', p_count));
  return jsonb_build_object('ok', true, 'codes', to_jsonb(v_codes), 'issued', v_total + p_count);
end;
$$;

-- Issued is always visible to managers; how many were used is turnout, an anonymous count, so only after the end.
create function lv.api_election_ballot_status(p_campaign uuid) returns jsonb
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
    'used_visible', v_finished);
end;
$$;

-- Vote with a ballot code. Anyone holding a valid unused code may vote once; no account is needed or recorded.
create function lv.api_ballot_submit(p_join_code text, p_ballot_code text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_hash text;
  v_bad text;
  v_sub uuid;
  v_receipt uuid;
begin
  select * into c from lv.campaigns x
   where x.id = lv.campaign_id_by_code(p_join_code) and x.status = 'active' and x.blocked_at is null and x.mode = 'election';
  if c.id is null then return lv.err('lv_not_found', 'No such election.'); end if;
  if lv.campaign_phase(c.status, c.opens_at, c.closes_at) <> 'open' then
    return lv.err('lv_closed', 'This election is not accepting votes.');
  end if;
  v_hash := lv.ballot_code_hash(c.id, p_ballot_code);
  perform pg_advisory_xact_lock(hashtextextended('lv_ballot:' || c.id::text, 0));
  if not exists (select 1 from lv.ballot_codes b where b.campaign_id = c.id and b.code_hash = v_hash) then
    return jsonb_set(lv.err('lv_not_found', 'That ballot code is not valid for this election. Check it and try again.'),
                     '{error,field}', '"ballot_code"');
  end if;
  if exists (select 1 from lv.guest_participation g where g.campaign_id = c.id and g.key_hash = v_hash) then
    return lv.err('lv_conflict', 'This ballot code has already been used.');
  end if;
  v_bad := lv.validate_answers(c.id, p_answers);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id, is_guest)
  values (c.id, c.hub_id, c.revision, null, false)
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

create function lv_api.lv_election_ballot_codes_create(p_campaign uuid, p_count int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_election_ballot_codes_create(p_campaign, p_count); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_election_ballot_status(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_election_ballot_status(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Wrong join codes and wrong ballot codes both count toward the caller's miss limit (the join-code brake).
create function lv_api.lv_ballot_submit(p_join_code text, p_ballot_code text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  v_out := lv.api_ballot_submit(p_join_code, p_ballot_code, p_answers);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

revoke all on function lv.election_guard() from public;
revoke all on function lv.election_race_problem(text, jsonb) from public;
revoke all on function lv.ballot_code_normalize(text) from public;
revoke all on function lv.ballot_code_hash(uuid, text) from public;
revoke all on function lv.ballot_code_new() from public;
revoke all on function lv.election_member_vote_guard() from public;
revoke all on function lv.api_election_ballot_codes_create(uuid, int) from public;
revoke all on function lv.api_election_ballot_status(uuid) from public;
revoke all on function lv.api_ballot_submit(text, text, jsonb) from public;
revoke all on function lv_api.lv_election_ballot_codes_create(uuid, int) from public;
revoke all on function lv_api.lv_election_ballot_status(uuid) from public;
revoke all on function lv_api.lv_ballot_submit(text, text, jsonb) from public;
do $$
declare
  v_private constant text := 'lv.election_guard(), lv.election_race_problem(text, jsonb), lv.ballot_code_normalize(text), '
    'lv.ballot_code_hash(uuid, text), lv.ballot_code_new(), lv.election_member_vote_guard(), '
    'lv.api_election_ballot_codes_create(uuid, int), lv.api_election_ballot_status(uuid), lv.api_ballot_submit(text, text, jsonb)';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function ' || v_private || ' from anon';
    execute 'revoke all on function lv_api.lv_election_ballot_codes_create(uuid, int), lv_api.lv_election_ballot_status(uuid) from anon';
    execute 'grant execute on function lv_api.lv_ballot_submit(text, text, jsonb) to anon';
    execute 'revoke all on lv.ballot_codes from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function ' || v_private || ' from authenticated';
    execute 'grant execute on function lv_api.lv_election_ballot_codes_create(uuid, int), lv_api.lv_election_ballot_status(uuid), lv_api.lv_ballot_submit(text, text, jsonb) to authenticated';
    execute 'revoke all on lv.ballot_codes from authenticated';
  end if;
end $$;

commit;
