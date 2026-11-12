-- Rollback for 000037_v2_elections: elections and the Yes/No type go away; nothing is deleted.
-- Campaigns already created as yes_no or election keep their rows, and in that case the wider mode constraint stays
-- (dropping it would require changing or deleting customer data). Ballot-code votes stay as guest participation.
begin;
drop function if exists lv_api.lv_ballot_submit(text, text, jsonb);
drop function if exists lv_api.lv_election_ballot_status(uuid);
drop function if exists lv_api.lv_election_ballot_codes_create(uuid, int);
drop function if exists lv.api_ballot_submit(text, text, jsonb);
drop function if exists lv.api_election_ballot_status(uuid);
drop function if exists lv.api_election_ballot_codes_create(uuid, int);
drop trigger if exists participation_election_ballot_only on lv.participation;
drop function if exists lv.election_member_vote_guard();
drop table if exists lv.ballot_codes;
drop function if exists lv.ballot_code_new();
drop function if exists lv.ballot_code_hash(uuid, text);
drop function if exists lv.ballot_code_normalize(text);
drop trigger if exists campaigns_election_guard on lv.campaigns;
drop function if exists lv.election_guard();

-- gate_evaluate as in 000022
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

  v_cap := lv.capacity_check(p_campaign);
  v_reasons := v_reasons || (v_cap->'reasons');
  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons) || (v_cap - 'reasons');
end;
$$;


drop function if exists lv.election_race_problem(text, jsonb);

-- validate_answers as in 000017
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

delete from lv.plan_limits where key = 'modes.election' and family in ('starter', 'team');
update lv.plan_limits set value = '["survey","poll","rating","feedback"]',
                          note = 'Founder 2026-11-11: every feedback type is free in Quick Surveys.'
 where family = 'free' and key = 'quick.modes';
alter table lv.campaigns drop constraint if exists campaigns_election_secret;
do $$ begin
  if not exists (select 1 from lv.campaigns where mode in ('yes_no', 'election')) then
    alter table lv.campaigns drop constraint campaigns_mode_check;
    alter table lv.campaigns add constraint campaigns_mode_check check (mode in ('survey', 'poll', 'rating', 'feedback'));
  else
    raise notice 'keeping the wider mode constraint: yes_no or election Campaigns exist';
  end if;
end $$;
commit;
