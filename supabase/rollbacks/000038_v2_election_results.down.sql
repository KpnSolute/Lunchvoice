-- Rollback for 000038_v2_election_results: parties, voter groups and lv_election_results go away.
-- The group columns are dropped with their values (group names typed by organisers; votes are kept).
begin;
drop function if exists lv_api.lv_election_results(uuid);
drop function if exists lv.api_election_results(uuid);
drop function if exists lv.election_race_cells(uuid, uuid, text[], boolean);
drop function if exists lv_api.lv_election_ballot_codes_create(uuid, int, text);
drop function if exists lv.api_election_ballot_codes_create(uuid, int, text);

-- 000037 versions
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


create or replace function lv.election_race_problem(p_kind text, p_config jsonb) returns text
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


create function lv_api.lv_election_ballot_codes_create(p_campaign uuid, p_count int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_election_ballot_codes_create(p_campaign, p_count); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;


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
    'used_visible', v_finished);
end;
$$;


create or replace function lv.api_ballot_submit(p_join_code text, p_ballot_code text, p_answers jsonb) returns jsonb
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


drop function if exists lv.election_parties(uuid);
drop function if exists lv.ballot_group_clean(text);
alter table lv.submissions drop column if exists ballot_group;
alter table lv.ballot_codes drop column if exists group_label;

revoke all on function lv.api_election_ballot_codes_create(uuid, int) from public;
revoke all on function lv_api.lv_election_ballot_codes_create(uuid, int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.api_election_ballot_codes_create(uuid, int), lv_api.lv_election_ballot_codes_create(uuid, int) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.api_election_ballot_codes_create(uuid, int) from authenticated';
    execute 'grant execute on function lv_api.lv_election_ballot_codes_create(uuid, int) to authenticated';
  end if;
end $$;
commit;
