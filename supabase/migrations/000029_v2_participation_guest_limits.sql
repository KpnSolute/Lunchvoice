-- 000029 (module: participation): guests are never turned away by a shared limit (founder decision F-15, 2026-11-11).
--
-- Before: lv.api_guest_submit took one advisory lock per Campaign, counted every guest row, and refused once
-- 'participation.guest_rate_per_minute' (10) answers had arrived in the last minute from ANYONE. A room of thirty
-- people, or one shared link, and most of the audience saw "Too many responses right now".
--
-- Now, two limits with different jobs, both policy rows (F-02: numbers are configuration, never constants):
--   * 'participation.guest_per_caller_per_minute' (60): one caller cannot flood a Campaign. The caller is
--     lv.request_caller_key() (000018): a daily-salted hash of the network address, or the account when signed in.
--     60 because a classroom or an office answers from one address. Counted in lv.integration_rate_windows under a
--     hash of (Campaign, caller), so nothing links a caller to a participation row or an answer. When the request
--     carries no address the per-caller limit does not apply; the ceiling below still does.
--   * 'participation.guest_rate_per_minute' is kept as the per-Campaign SAFETY CEILING and raised from 10 to 600.
--     It protects the database; ordinary use never meets it. NULL still fails closed (lv_policy_undecided).
-- The advisory lock is taken only for a Campaign with a total guest cap (guest_limit), where the cap must be exact.
-- Duplicates are settled by the unique key on (campaign_id, key_hash): the guest key is claimed first, and a second
-- tap of Submit gets the first one's receipt. The count of all guest rows runs only when there is a cap.
-- Nothing else changes: validation, guest names, receipts, anonymity and the response envelope are as in 000028.
begin;

alter table lv.integration_rate_windows drop constraint integration_rate_windows_scope_check;
alter table lv.integration_rate_windows add constraint integration_rate_windows_scope_check
  check (scope in ('api_key', 'discord_user', 'discord_guild', 'guest_caller'));

insert into lv.policy (key, value, note) values
  ('participation.guest_per_caller_per_minute', '60'::jsonb,
   'F-15: guest answers accepted per minute per Campaign from one caller (hashed network address, or account). Sized for a room sharing one address. NULL: not enforced.');
update lv.policy
   set value = '600'::jsonb,
       note = 'F-15: safety ceiling of guest answers per minute per Campaign, for everyone combined. Protects the database; ordinary use never meets it. NULL: guest answers fail closed.'
 where key = 'participation.guest_rate_per_minute';

create or replace function lv.api_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb, p_guest_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_key text := btrim(coalesce(p_guest_key, ''));
  v_hash text;
  v_rate jsonb;
  v_recent int;
  v_caller text;
  v_caller_limit int;
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

  -- F-15: a guest is never refused because other people are answering. Two limits with different jobs:
  --   * per caller (one network address, hashed daily; or one signed-in account): stops one client flooding;
  --   * per Campaign (the safety ceiling): protects the database, set far above a full room or a busy channel.
  -- Only a Campaign with a total guest cap needs its accounting serialised; the unique key on
  -- (campaign_id, key_hash) settles duplicates for everyone else.
  if c.guest_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended('lv_guest:' || c.id::text, 0));
  end if;

  select g.receipt_id into v_receipt from lv.guest_participation g where g.campaign_id = c.id and g.key_hash = v_hash;
  if v_receipt is not null then
    return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', true);
  end if;

  if c.guest_limit is not null then
    select count(*) into v_total from lv.guest_participation g where g.campaign_id = c.id;
    if v_total >= c.guest_limit then
      return lv.err('lv_limit_reached', 'This Campaign is not accepting more guest responses.');
    end if;
  end if;

  v_caller := lv.request_caller_key();
  v_caller_limit := (lv.policy_json('participation.guest_per_caller_per_minute'))::int;
  if v_caller <> 'anon' and v_caller_limit is not null
     and lv.integration_rate_hit('guest_caller', lv.sha256_hex(c.id::text || ':' || v_caller), v_caller_limit) is not null then
    return lv.err('lv_rate_limited', 'Too many responses from this connection. Try again in a minute.');
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

  -- Claim the guest key first: two taps of Submit race on the unique key, and the loser gets the winner's receipt.
  insert into lv.guest_participation (campaign_id, hub_id, key_hash, campaign_revision)
  values (c.id, c.hub_id, v_hash, c.revision)
  on conflict (campaign_id, key_hash) do nothing
  returning receipt_id into v_receipt;
  if v_receipt is null then
    select g.receipt_id into v_receipt from lv.guest_participation g where g.campaign_id = c.id and g.key_hash = v_hash;
    return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', true);
  end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id, is_guest, guest_name)
  values (c.id, c.hub_id, c.revision, null, true, v_name)
  returning id into v_sub;
  insert into lv.answers (submission_id, question_id, value)
  select v_sub, (e->>'question_id')::uuid, e->'value'
    from jsonb_array_elements(p_answers) e
   where e->'value' is not null and e->'value' <> 'null'::jsonb;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', false);
end;
$$;

commit;
