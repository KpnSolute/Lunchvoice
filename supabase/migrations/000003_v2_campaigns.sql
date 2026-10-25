-- LunchVoice v2 canonical baseline 3/6: Campaigns and the activation gate.
--
-- Replaces prototype 20261024000300 (REDESIGN). Kept: campaign shape, question set, draft-only question
-- locking, atomic activation, scheduling, join codes. NOT kept: the prototype's hard-coded entitlement
-- numbers, which were never approved. This baseline enforces a known 'max_active' cap and fails CLOSED
-- when a limit is undefined rather than inventing one.

begin;

create table lv.campaigns (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  mode text not null check (mode in ('survey', 'poll', 'rating', 'feedback')),
  anonymity text not null default 'anonymous' check (anonymity in ('anonymous', 'identified')),
  audience text not null default 'members' check (audience in ('members')),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  join_code text not null unique,
  revision int not null default 1 check (revision >= 1),
  opens_at timestamptz,
  closes_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  created_by uuid references lv.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campaigns_schedule_order check (closes_at is null or opens_at is null or closes_at > opens_at),
  constraint campaigns_active_conflict check (not (status = 'active' and closed_at is not null))
);
create index campaigns_hub_status_idx on lv.campaigns (hub_id, status);
create index campaigns_open_window_idx on lv.campaigns (hub_id, opens_at, closes_at) where status = 'active';

create table lv.campaign_questions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  position int not null check (position > 0),
  kind text not null check (kind in ('rating', 'single_choice', 'multi_choice', 'yes_no', 'text')),
  prompt text not null check (length(btrim(prompt)) > 0),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint campaign_questions_position_key unique (campaign_id, position)
);

-- Questions are frozen once the Campaign is active, so a submission always refers to a stable question set.
create function lv.freeze_questions_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_campaign uuid;
begin
  v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  select c.status into v_status from lv.campaigns c where c.id = v_campaign;
  if v_status is distinct from 'draft' then
    raise exception 'lv_locked: questions cannot change once a Campaign has been activated' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger campaign_questions_frozen
  before insert or update or delete on lv.campaign_questions
  for each row execute function lv.freeze_questions_after_draft();

-- A Campaign's own join code is generated server-side; a caller never supplies it.
create function lv.new_join_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no ambiguous characters
  v_out text := '';
  i int;
begin
  for i in 1..6 loop
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_out;
end;
$$;

create function lv.generate_join_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v_code text;
  v_try int := 0;
begin
  loop
    v_try := v_try + 1;
    v_code := lv.new_join_code();
    exit when not exists (select 1 from lv.campaigns c where c.join_code = v_code);
    if v_try > 50 then raise exception 'lv_server_error: could not allocate a join code'; end if;
  end loop;
  return v_code;
end;
$$;

create function lv.assign_join_code() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.join_code is null or new.join_code = '' then new.join_code := lv.generate_join_code(); end if;
  return new;
end;
$$;
create trigger campaigns_set_join_code before insert on lv.campaigns
  for each row execute function lv.assign_join_code();

-- ---------------------------------------------------------------------------------------------------------
-- Activation gate
-- ---------------------------------------------------------------------------------------------------------
-- Limits live in lv.policy so a value can be set without a migration. NULL = undefined = fail closed.
insert into lv.policy (key, value, note) values
  ('campaign.max_active_per_hub', null,
   'Maximum simultaneously active Campaigns per Hub. NULL means activation is refused until an owner sets it (no invented plan numbers).'),
  ('campaign.min_cohort', null,
   'Minimum cohort size before any analytics cell is published. NULL means no results are published (fail closed).');

create function lv.gate_evaluate(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c record;
  v_cap jsonb;
  v_active int;
  v_questions int;
  v_reasons jsonb := '[]'::jsonb;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('not_found')); end if;

  if c.status <> 'draft' then v_reasons := v_reasons || to_jsonb('not_draft'::text); end if;
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;

  select count(*) into v_questions from lv.campaign_questions q where q.campaign_id = c.id;
  if v_questions = 0 then v_reasons := v_reasons || to_jsonb('no_questions'::text); end if;

  v_cap := lv.policy_json('campaign.max_active_per_hub');
  if v_cap is null then
    v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
  else
    select count(*) into v_active from lv.campaigns x where x.hub_id = c.hub_id and x.status = 'active';
    if v_active >= (v_cap)::int then v_reasons := v_reasons || to_jsonb('limit_reached'::text); end if;
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons);
end;
$$;

create function lv.activate_campaign(p_campaign uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_gate jsonb;
  c record;
begin
  -- Row lock first: two simultaneous activations cannot both pass the cap check.
  select * into c from lv.campaigns where id = p_campaign for update;
  if c is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  if c.status = 'active' then return; end if;  -- idempotent

  perform pg_advisory_xact_lock(hashtextextended('lv_activate:' || c.hub_id::text, 0));
  v_gate := lv.gate_evaluate(p_campaign);
  if not (v_gate->>'ok')::boolean then
    raise exception 'lv_gate_blocked: %', (select string_agg(r, ',') from jsonb_array_elements_text(v_gate->'reasons') r)
      using errcode = '42501';
  end if;

  update lv.campaigns
     set status = 'active', activated_at = now(), revision = revision + 1
   where id = p_campaign;
  perform lv.audit(c.created_by, c.hub_id, 'campaign.activated', p_campaign::text, v_gate);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Capability catalogue for this domain
-- ---------------------------------------------------------------------------------------------------------
create function lv.owner_bootstrap_roles(p_hub uuid, p_owner uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_role uuid;
  v_owner_active uuid;
begin
  -- Owner membership (created by the caller of lv_hub_create) must be accepted.
  select id into v_member from lv.hub_memberships
   where hub_id = p_hub and account_id = p_owner and status = 'accepted';
  if v_member is null then
    raise exception 'lv_invalid_input: the Owner must be an accepted member first' using errcode = '42501';
  end if;

  insert into lv.roles (hub_id, key, name, is_owner, is_system)
  values (p_hub, 'owner', 'Owner', true, true)
  on conflict (hub_id, key) do update set name = excluded.name
  returning id into v_role;

  insert into lv.role_capabilities (role_id, capability) values
    (v_role, 'hub.settings.manage'),
    (v_role, 'admin.members.admit'),
    (v_role, 'admin.members.remove'),
    (v_role, 'admin.roles.manage'),
    (v_role, 'campaign.manage'),
    (v_role, 'analytics.read')
  on conflict do nothing;

  -- The prototype's "no Owner role assignment" guard is expressed here instead: the Owner's role assignment
  -- is derived from hubs.owner_account_id, and this row exists so capability lookups work uniformly.
  insert into lv.membership_roles (membership_id, role_id) values (v_member, v_role) on conflict do nothing;

  -- Satisfy the owner_role_assignment invariant: exactly one assignment for the owner hub.
  select h.id into v_owner_active from lv.hubs h where h.id = p_hub and h.owner_account_id = p_owner;
  if v_owner_active is null then
    raise exception 'lv_invalid_input: hub owner mismatch';
  end if;
  return v_role;
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
