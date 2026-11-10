-- Rollback for 000028_v2_guest_names: guests no longer give a name; the Responses view goes. Names already stored are
-- dropped with the column (they were typed by guests for the creator; nothing else references them).
begin;
drop function if exists lv_api.lv_campaign_responses(uuid, int, timestamptz);
drop function if exists lv.api_campaign_responses(uuid, int, timestamptz);
drop function if exists lv_api.lv_campaign_set_guest_names(uuid, text);
drop function if exists lv.api_campaign_set_guest_names(uuid, text);
drop function if exists lv_api.lv_guest_submit(text, text, jsonb, text);

create or replace function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  v := lv.campaign_get_base(p_campaign);
  if coalesce((v->>'ok')::boolean, false) and coalesce((v->>'can_manage')::boolean, false) then
    v := jsonb_set(v, '{campaign,has_responses}', to_jsonb(lv.campaign_has_responses(p_campaign)));
  end if;
  return v;
end;
$$;

create or replace function lv_api.lv_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  if exists (select 1 from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, ''))) and lv.hub_suspended(c.hub_id)) then
    return lv.err('lv_closed', 'This Campaign isn''t accepting responses right now.');
  end if;
  v_out := lv.api_guest_campaign_get(p_join_code);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create or replace function lv.api_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_key text := btrim(coalesce(p_guest_key, ''));
  v_hash text;
  v_rate jsonb;
  v_recent int;
  v_total int;
  v_receipt uuid;
  v_bad text;
  v_sub uuid;
begin
  c := lv.guest_campaign(p_join_code);
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if lv.campaign_phase(c.status, c.opens_at, c.closes_at) <> 'open' then
    return lv.err('lv_closed', 'This Campaign is not accepting responses.');
  end if;
  if length(v_key) < 32 or length(v_key) > 200 then
    return lv.err('lv_invalid_input', 'A guest key is a random secret of 32 to 200 characters held by the browser.');
  end if;
  v_hash := lv.sha256_hex(c.id::text || ':' || v_key);

  v_rate := lv.policy_json('participation.guest_rate_per_minute');
  if v_rate is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_policy_undecided',
      'message', 'Guest responses are not available until the guest rate limit is set.',
      'missing', jsonb_build_array('participation.guest_rate_per_minute')));
  end if;

  -- Serialise guest accounting per Campaign: duplicate check, total cap and rate window are one decision.
  perform pg_advisory_xact_lock(hashtextextended('lv_guest:' || c.id::text, 0));

  select g.receipt_id into v_receipt from lv.guest_participation g where g.campaign_id = c.id and g.key_hash = v_hash;
  if v_receipt is not null then
    return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', true);
  end if;

  select count(*) into v_total from lv.guest_participation g where g.campaign_id = c.id;
  if c.guest_limit is not null and v_total >= c.guest_limit then
    return lv.err('lv_limit_reached', 'This Campaign is not accepting more guest responses.');
  end if;
  select count(*) into v_recent from lv.guest_participation g
   where g.campaign_id = c.id and g.created_at > now() - interval '1 minute';
  if v_recent >= (v_rate)::int then
    return lv.err('lv_rate_limited', 'Too many responses right now. Try again in a minute.');
  end if;

  v_bad := lv.validate_answers(c.id, p_answers);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id, is_guest)
  values (c.id, c.hub_id, c.revision, null, true)
  returning id into v_sub;
  insert into lv.answers (submission_id, question_id, value)
  select v_sub, (e->>'question_id')::uuid, e->'value'
    from jsonb_array_elements(p_answers) e
   where e->'value' is not null and e->'value' <> 'null'::jsonb;
  insert into lv.guest_participation (campaign_id, hub_id, key_hash, campaign_revision)
  values (c.id, c.hub_id, v_hash, c.revision)
  returning receipt_id into v_receipt;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', false);
end;
$$;
drop function if exists lv.api_guest_submit(text, text, jsonb, text);

drop trigger if exists submissions_names_not_anonymous on lv.submissions;
drop trigger if exists campaigns_names_not_anonymous on lv.campaigns;
drop function if exists lv.forbid_names_on_anonymous();
alter table lv.submissions drop column if exists guest_name;
alter table lv.campaigns drop column if exists guest_names;
commit;
