-- 000028: guest names for identified surveys, and a per-person Responses view for identified surveys (founder request
-- 2026-11-10: "when doing guest users can they put their name instead of having an account, like Kahoot").
--
-- Rules (privacy first):
--   * Names exist ONLY on identified Campaigns, and only when the creator turns them on ("off", "optional" or "required").
--     A database trigger refuses a name on an anonymous Campaign and refuses switching a Campaign with names on to
--     anonymous, so no path can attach a typed name to an anonymous answer.
--   * A guest's name is typed by the guest and is never verified: it is shown with a "Guest, unverified" label.
--   * Names can be changed only in a draft, or while paused before anyone has answered (the promise people answered under).
--   * "Responses" (who answered and what) is for identified Campaigns only, for people with analytics.read, and every first
--     page opened is audited. Anonymous Campaigns still only ever show released totals.
begin;

alter table lv.campaigns add column guest_names text not null default 'off' check (guest_names in ('off', 'optional', 'required'));
alter table lv.submissions add column guest_name text check (guest_name is null or length(btrim(guest_name)) between 1 and 40);

create function lv.forbid_names_on_anonymous() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_anon boolean;
begin
  if tg_table_name = 'campaigns' then
    if new.guest_names <> 'off' and new.anonymity = 'anonymous' then
      raise exception 'lv_not_available: Guest names are only for identified Campaigns. Turn names off first, or keep the Campaign identified, so no typed name can be linked to an anonymous answer.' using errcode = '42501';
    end if;
  else
    if new.guest_name is not null then
      select c.anonymity = 'anonymous' into v_anon from lv.campaigns c where c.id = new.campaign_id;
      if coalesce(v_anon, true) then
        raise exception 'lv_not_available: A name can never be stored with an anonymous answer.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger campaigns_names_not_anonymous before insert or update of anonymity, guest_names on lv.campaigns
  for each row execute function lv.forbid_names_on_anonymous();
create trigger submissions_names_not_anonymous before insert or update of guest_name on lv.submissions
  for each row execute function lv.forbid_names_on_anonymous();

-- Guest submit with an optional name. The 3-argument function stays as a delegate (older clients, the API).
create function lv.api_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb, p_guest_name text) returns jsonb
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
  v_name text;
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

  -- A guest's name (identified Campaigns only, creator's choice): self-typed, so it stays labelled unverified.
  v_name := nullif(btrim(regexp_replace(regexp_replace(coalesce(p_guest_name, ''), '[[:cntrl:]]', '', 'g'), '[[:space:]]+', ' ', 'g')), '');
  if v_name is not null and length(v_name) > 40 then return lv.err('lv_invalid_input', 'Keep the name to 40 characters.'); end if;
  if c.anonymity = 'anonymous' or c.guest_names = 'off' then v_name := null; end if;
  if c.guest_names = 'required' and c.anonymity = 'identified' and v_name is null then
    return lv.err('lv_invalid_input', 'Add your name so the creator knows who answered.');
  end if;

  v_bad := lv.validate_answers(c.id, p_answers);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id, is_guest, guest_name)
  values (c.id, c.hub_id, c.revision, null, true, v_name)
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

create or replace function lv.api_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb) returns jsonb
language sql volatile security definer set search_path = ''
as $$ select lv.api_guest_submit(p_join_code, p_guest_key, p_answers, null) $$;

create function lv_api.lv_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb, p_guest_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  v_out := lv.api_guest_submit(p_join_code, p_guest_key, p_answers, p_guest_name);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- The respondent's view says whether to ask for a name.
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
  if coalesce((v_out->>'ok')::boolean, false) and v_out ? 'campaign' then
    v_out := jsonb_set(v_out, '{campaign,guest_names}', to_jsonb(coalesce((
      select case when c.anonymity = 'identified' then c.guest_names else 'off' end
        from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, '')))), 'off')));
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- The manager's view carries the setting too (this replaces the 000027 wrapper, adding one field).
create or replace function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  v := lv.campaign_get_base(p_campaign);
  if coalesce((v->>'ok')::boolean, false) and coalesce((v->>'can_manage')::boolean, false) then
    v := jsonb_set(v, '{campaign,has_responses}', to_jsonb(lv.campaign_has_responses(p_campaign)));
    v := jsonb_set(v, '{campaign,guest_names}', to_jsonb((select c.guest_names from lv.campaigns c where c.id = p_campaign)));
  end if;
  return v;
end;
$$;

-- Turn names on or off.
create function lv.api_campaign_set_guest_names(p_campaign uuid, p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if p_mode is null or p_mode not in ('off', 'optional', 'required') then
    return lv.err('lv_invalid_input', 'Names are off, optional or required.');
  end if;
  if not (c.status = 'draft' or (c.status = 'paused' and not lv.campaign_has_responses(c.id))) then
    return lv.err('lv_locked', 'Guest names can change in a draft, or while paused before anyone has answered.');
  end if;
  if p_mode <> 'off' then
    if c.anonymity <> 'identified' then
      return lv.err('lv_not_available', 'Guest names are only for identified Campaigns. An anonymous Campaign never stores a name.');
    end if;
    if c.audience <> 'members_and_guests' then
      return lv.err('lv_not_available', 'Turn on guest responses first; names are only asked of guests.');
    end if;
  end if;
  update lv.campaigns set guest_names = p_mode where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.guest_names', c.id::text, jsonb_build_object('mode', p_mode));
  return jsonb_build_object('ok', true, 'guest_names', p_mode);
end;
$$;
create function lv_api.lv_campaign_set_guest_names(p_campaign uuid, p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_set_guest_names(p_campaign, p_mode); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Who answered and what: identified Campaigns only.
create function lv.api_campaign_responses(p_campaign uuid, p_limit int, p_before timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or c.status = 'draft' or lv.membership_of(v_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading responses requires analytics.read.');
  end if;
  if c.anonymity <> 'identified' then
    return lv.err('lv_not_available', 'Individual responses exist only for identified Campaigns. An anonymous Campaign only ever shows totals.');
  end if;

  select coalesce(jsonb_agg(r.j order by r.at desc), '[]'::jsonb) into v_rows
    from (
      select s.created_at as at, jsonb_build_object(
               'response_id', s.id,
               'kind', case when s.is_guest then 'guest' else 'member' end,
               'verified', not s.is_guest,
               'name', case when s.is_guest then s.guest_name else a.display_name end,
               'at', s.created_at,
               'answers', coalesce((
                 select jsonb_agg(jsonb_build_object('question_id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'value', an.value) order by q.position)
                   from lv.answers an join lv.campaign_questions q on q.id = an.question_id
                  where an.submission_id = s.id), '[]'::jsonb)) as j
        from lv.submissions s left join lv.accounts a on a.id = s.account_id
       where s.campaign_id = c.id and (p_before is null or s.created_at < p_before)
       order by s.created_at desc limit v_limit) r;

  if p_before is null then
    perform lv.audit(v_account, c.hub_id, 'campaign.responses_viewed', c.id::text);
  end if;
  return jsonb_build_object('ok', true, 'responses', v_rows,
    'total', (select count(*) from lv.submissions s where s.campaign_id = c.id));
end;
$$;
create function lv_api.lv_campaign_responses(p_campaign uuid, p_limit int default 50, p_before timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_responses(p_campaign, p_limit, p_before); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Grants: explicit. Guests (signed out) may call the guest functions; only signed-in users the rest.
revoke all on function lv.forbid_names_on_anonymous() from public;
revoke all on function lv.api_guest_submit(text, text, jsonb, text) from public;
revoke all on function lv.api_campaign_set_guest_names(uuid, text) from public;
revoke all on function lv.api_campaign_responses(uuid, int, timestamptz) from public;
revoke all on function lv_api.lv_guest_submit(text, text, jsonb, text) from public;
revoke all on function lv_api.lv_campaign_set_guest_names(uuid, text) from public;
revoke all on function lv_api.lv_campaign_responses(uuid, int, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.forbid_names_on_anonymous() from anon';
    execute 'revoke all on function lv.api_guest_submit(text, text, jsonb, text) from anon';
    execute 'revoke all on function lv.api_campaign_set_guest_names(uuid, text) from anon';
    execute 'revoke all on function lv.api_campaign_responses(uuid, int, timestamptz) from anon';
    execute 'grant execute on function lv_api.lv_guest_submit(text, text, jsonb, text) to anon';
    execute 'revoke all on function lv_api.lv_campaign_set_guest_names(uuid, text) from anon';
    execute 'revoke all on function lv_api.lv_campaign_responses(uuid, int, timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.forbid_names_on_anonymous() from authenticated';
    execute 'revoke all on function lv.api_guest_submit(text, text, jsonb, text) from authenticated';
    execute 'revoke all on function lv.api_campaign_set_guest_names(uuid, text) from authenticated';
    execute 'revoke all on function lv.api_campaign_responses(uuid, int, timestamptz) from authenticated';
    execute 'grant execute on function lv_api.lv_guest_submit(text, text, jsonb, text) to authenticated';
    execute 'grant execute on function lv_api.lv_campaign_set_guest_names(uuid, text) to authenticated';
    execute 'grant execute on function lv_api.lv_campaign_responses(uuid, int, timestamptz) to authenticated';
  end if;
end $$;

commit;
