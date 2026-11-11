-- Rollback for 000029_v2_participation_guest_limits: the shared per-Campaign limit of 10 a minute returns, with the
-- per-Campaign advisory lock. No data is lost: rate windows are counters only.
begin;

create or replace function lv.api_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb, p_guest_name text) returns jsonb
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

delete from lv.integration_rate_windows where scope = 'guest_caller';
alter table lv.integration_rate_windows drop constraint integration_rate_windows_scope_check;
alter table lv.integration_rate_windows add constraint integration_rate_windows_scope_check
  check (scope in ('api_key', 'discord_user', 'discord_guild'));
delete from lv.policy where key = 'participation.guest_per_caller_per_minute';
update lv.policy
   set value = '10'::jsonb, note = 'L-05: maximum guest submissions per Campaign per minute.'
 where key = 'participation.guest_rate_per_minute';

commit;
