-- LunchVoice v2 canonical 12: participation modes, including guests (roadmap slice 10).
--
-- Three modes now exist (master spec section 9):
--   * authenticated member, identified    -- campaigns.anonymity = 'identified'  (000004)
--   * authenticated member, anonymous     -- campaigns.anonymity = 'anonymous'   (000004; eligibility in
--                                            lv.participation, answers in lv.submissions, no stored join)
--   * guest                                -- campaigns.audience = 'members_and_guests' (this file)
--
-- Guests, by construction:
--   * never create a Hub membership, so they never change member totals, thresholds or perks;
--   * see only the Campaign they hold the join code for: its title, questions and the Hub's display name,
--     never Hub content, members or other Campaigns (and never a draft, paused or closed Campaign's form);
--   * are counted separately (lv.guest_participation) and their submissions are flagged is_guest, so analytics
--     can report them apart from members and thresholds can exclude them;
--   * are abuse-limited: a per-Campaign rate from policy 'participation.guest_rate_per_minute' (NULL on a fresh
--     install, so guest submissions fail closed until an operator sets it), an optional per-Campaign total
--     (campaigns.guest_limit), and one submission per guest key. The guest key is a client-held random secret;
--     only its hash is stored. Network-level limits (per IP) belong at the edge, not in this database.
--
-- The participation policy is part of the published version (000011 snapshots every campaigns column), so it
-- can only be changed while the Campaign is a draft.

begin;

alter table lv.campaigns drop constraint campaigns_audience_check;
alter table lv.campaigns add constraint campaigns_audience_check
  check (audience in ('members', 'members_and_guests'));
alter table lv.campaigns add column guest_limit int check (guest_limit is null or guest_limit > 0);

alter table lv.submissions add column is_guest boolean not null default false;

insert into lv.policy (key, value, note) values
  ('participation.guest_rate_per_minute', null,
   'Maximum guest submissions accepted per Campaign per minute. NULL means guest submissions are refused (fail closed).');

create table lv.guest_participation (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  key_hash text not null,
  receipt_id uuid not null default gen_random_uuid(),
  campaign_revision int not null,
  created_at timestamptz not null default now(),
  -- One submission per guest key per Campaign. No account, no submission reference: nothing to join on.
  constraint guest_participation_once unique (campaign_id, key_hash),
  constraint guest_participation_receipt_key unique (receipt_id)
);
create index guest_participation_recent_idx on lv.guest_participation (campaign_id, created_at);

create function lv.sha256_hex(p_text text) returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_schema text := lv.pgcrypto_schema();
  v_out text;
begin
  if v_schema is null then raise exception 'lv_server_error: pgcrypto is not installed'; end if;
  execute format('select encode(%I.digest($1, ''sha256''), ''hex'')', v_schema) into v_out using p_text;
  return v_out;
end;
$$;

-- A guest-facing Campaign is found by its join code only, and only while it accepts guests and is published.
create function lv.guest_campaign(p_join_code text) returns lv.campaigns
language sql stable security definer set search_path = ''
as $$
  select c.* from lv.campaigns c
   where c.join_code = upper(btrim(coalesce(p_join_code, '')))
     and c.audience = 'members_and_guests'
     and c.status = 'active'
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Bodies
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_campaign_set_participation(p_campaign uuid, p_audience text, p_guest_limit int, p_clear_guest_limit boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status <> 'draft' then return lv.err('lv_locked', 'Participation settings are part of the published version and can only change in a draft.'); end if;
  update lv.campaigns
     set audience = coalesce(p_audience, audience),
         guest_limit = case when coalesce(p_clear_guest_limit, false) then null else coalesce(p_guest_limit, guest_limit) end
   where id = c.id;
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_hub_name text;
  v_phase text;
  v_full boolean;
begin
  c := lv.guest_campaign(p_join_code);
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  select h.display_name into v_hub_name from lv.hubs h where h.id = c.hub_id;
  v_phase := lv.campaign_phase(c.status, c.opens_at, c.closes_at);
  v_full := c.guest_limit is not null
            and (select count(*) from lv.guest_participation g where g.campaign_id = c.id) >= c.guest_limit;
  return jsonb_build_object('ok', true,
    'campaign', jsonb_build_object('campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
                                   'phase', v_phase, 'opens_at', c.opens_at, 'closes_at', c.closes_at),
    'hub', jsonb_build_object('name', v_hub_name),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), '[]'::jsonb),
    'can_respond', v_phase = 'open' and not v_full);
end;
$$;

create function lv.api_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb) returns jsonb
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

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers (the guest functions are callable signed out)
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_campaign_set_participation(p_campaign uuid, p_audience text default null,
                                                     p_guest_limit int default null, p_clear_guest_limit boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_set_participation(p_campaign, p_audience, p_guest_limit, p_clear_guest_limit); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_guest_campaign_get(p_join_code); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_guest_submit(p_join_code text, p_guest_key text, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_guest_submit(p_join_code, p_guest_key, p_answers); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on all tables in schema lv from public;
grant execute on all functions in schema lv_api to public;
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
