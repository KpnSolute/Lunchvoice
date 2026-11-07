-- LunchVoice v2 canonical 14: entitlements, waitlist, personal space and Quick Surveys (launch plan step 2).
--
-- Binding source: docs/v2/LAUNCH_PLAN.md (founder direction 2026-11-07, decisions L-01..L-06, A-01, A-02, A-04).
--
-- 1. One entitlement map (A-02). lv.plan_limits(family, key, value) is the only place a limit lives. A Hub's
--    family comes from its active hub-scoped entitlement (lv.hub_plan). No active entitlement means premium
--    writes fail closed with lv_entitlement_required; reads, pausing and closing keep working and nothing is
--    deleted. The policies 'campaign.max_active_per_hub' and 'roles.max_custom_per_hub' are retired: every
--    reader now asks the map (lv.custom_role_limit, lv.gate_evaluate, lv.api_campaign_resume, the version
--    snapshot).
-- 2. Products and Hub credits. lv_hub_create no longer needs a beta approval: it consumes one Hub credit
--    atomically and attaches a hub entitlement of the credit's family. Credits come from the waitlist (Founding)
--    and, later, from billing (000016).
-- 3. Founding entitlements (L-01) have no stored end. Their effective end is policy 'billing.launched_at' plus
--    30 days once that policy is set; until then they are open-ended.
-- 4. Waitlist (L-02, L-03; named "waitlist" by the founder): the first 'waitlist.seats' (50) signed-in joiners are
--    admitted under an advisory lock and get one Founding Hub credit; later joiners wait. Joining twice returns the
--    first row. The waitlist is never authorization: every check reads entitlements and credits only.
-- 10. Abuse controls for free surveys: lv_report_abuse (signed out allowed, rate-limited) and platform-admin
--    lv_admin_campaign_block / lv_admin_campaign_unblock, which stop responses and hide a Campaign from
--    respondents while keeping its data.
-- 5. Personal space (A-01): a lv.hubs row with kind = 'personal', no slug, never resolvable by slug, never listed,
--    never joinable, created lazily on the first Quick Survey. It always evaluates to family 'free'.
-- 6. Quick Surveys: survey-mode Campaigns in the personal space with access 'link' (anyone with the link or code,
--    optionally guests) or 'invite' (only signed-in people holding a Campaign invite). Campaign invites grant
--    eligibility for that one Campaign only, never a Hub membership.
-- 7. Survey activation gate (master spec section 13): a survey-mode Campaign may be activated while fewer than
--    surveys.max_active active surveys have NOT met the family threshold. Unique eligible accepted members only;
--    guests never count; zero eligible members means "not met". A new Hub can always activate its first surveys.
-- 8. Policies decided by the founder: campaign.min_cohort 5 (L-04), participation.guest_rate_per_minute 10 (L-05).
-- 9. lv.reserved_slugs covers every top-level UI route (src/lib/reservedSlugs.ts plus the launch routes).
--
-- Error payloads: an lv_ exception message may end with '|{json}'. lv.api_error merges that object into the error
-- envelope, which is how lv_limit_reached carries { limit, used } and lv_entitlement_required carries { product }.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Error envelope: structured extras
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.api_error(p_message text, p_sqlstate text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := substring(p_message from '^(lv_[a-z_]+):');
  v_text text := btrim(regexp_replace(p_message, '^lv_[a-z_]+:\s*', ''));
  v_extra jsonb;
  v_err jsonb;
begin
  if v_code is not null then
    if v_text ~ '\|\{.*\}$' then
      begin
        v_extra := substring(v_text from '\|(\{.*\})$')::jsonb;
      exception when others then
        v_extra := null;
      end;
      v_text := btrim(regexp_replace(v_text, '\|\{.*\}$', ''));
    end if;
    v_err := jsonb_build_object('code', v_code, 'message', v_text);
    -- Activation gate failures carry their reasons as data, not only as prose.
    if v_code = 'lv_gate_blocked' and not (coalesce(v_extra, '{}'::jsonb) ? 'reasons') then
      v_err := v_err || jsonb_build_object('reasons', to_jsonb(string_to_array(v_text, ',')));
    end if;
    if v_code = 'lv_entitlement_required' and not (coalesce(v_extra, '{}'::jsonb) ? 'product') then
      v_err := v_err || jsonb_build_object('product', 'starter_hub');
    end if;
    if v_extra is not null then v_err := v_err || (v_extra - 'code' - 'message'); end if;
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  if p_sqlstate in ('22023', '22P02', '23514', '22001', '22003') then
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'lv_invalid_input', 'message', 'That value is not allowed.'));
  end if;
  if p_sqlstate = '23505' then
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'lv_conflict', 'message', 'That already exists.'));
  end if;
  if p_sqlstate = '23503' then
    return jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'lv_not_found', 'message', 'No such record.'));
  end if;

  raise log 'lv_server_error: % (%)', p_message, p_sqlstate;
  raise exception 'lv_server_error: unexpected fault' using errcode = 'XX000';
end;
$$;

-- Raise an lv_ error with structured extras (mapped back into the envelope by lv.api_error).
create function lv.fail(p_code text, p_message text, p_extra jsonb default null) returns void
language plpgsql volatile set search_path = ''
as $$
begin
  raise exception '%', p_code || ': ' || p_message || coalesce('|' || p_extra::text, '') using errcode = '42501';
end;
$$;

-- Return-style failure envelope with extras.
create function lv.err_x(p_code text, p_message text, p_extra jsonb) returns jsonb
language sql immutable set search_path = ''
as $$ select jsonb_build_object('ok', false, 'error',
           jsonb_build_object('code', p_code, 'message', p_message) || coalesce(p_extra - 'code' - 'message', '{}'::jsonb)) $$;

-- ---------------------------------------------------------------------------------------------------------
-- Hub kinds: community Hubs (routable, slugged) and personal spaces (no slug, never routable)
-- ---------------------------------------------------------------------------------------------------------
alter table lv.hubs add column kind text not null default 'community' check (kind in ('community', 'personal'));
alter table lv.hubs alter column slug drop not null;
alter table lv.hubs drop constraint hubs_slug_format;
alter table lv.hubs drop constraint hubs_slug_length;
alter table lv.hubs drop constraint hubs_slug_no_double_hyphen;
alter table lv.hubs add constraint hubs_kind_slug check ((kind = 'community') = (slug is not null));
alter table lv.hubs add constraint hubs_slug_format
  check (kind <> 'community' or (slug = lower(slug) and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$'));
alter table lv.hubs add constraint hubs_slug_length check (kind <> 'community' or length(slug) between 3 and 40);
alter table lv.hubs add constraint hubs_slug_no_double_hyphen check (kind <> 'community' or slug !~ '--');
-- One personal space per account; it is private and invite-only so no join path can reach it.
create unique index hubs_one_personal_idx on lv.hubs (owner_account_id) where kind = 'personal';
alter table lv.hubs add constraint hubs_personal_closed
  check (kind <> 'personal' or (visibility = 'private' and membership_mode = 'invite_only'));

-- ---------------------------------------------------------------------------------------------------------
-- The entitlement map (A-02). Values are jsonb: numbers, booleans, lists and threshold objects.
-- ---------------------------------------------------------------------------------------------------------
create table lv.plan_limits (
  family text not null check (family in ('free', 'starter', 'team')),
  key text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  value jsonb,
  note text not null default '',
  primary key (family, key)
);
alter table lv.plan_limits enable row level security;

insert into lv.plan_limits (family, key, value, note) values
  ('free', 'quick.max_active', '5', 'Founder direction 2026-11-07: up to 5 active Quick Surveys.'),
  ('free', 'quick.max_questions', '10', 'L-06: up to 10 questions per Quick Survey.'),
  ('free', 'quick.kinds', '["rating","single_choice","multi_choice","yes_no","text"]', 'Core question kinds.'),
  ('starter', 'roles.max_custom', '3', 'Canonical: 3 custom roles; the Owner never uses a slot.'),
  ('starter', 'pages.max_custom', '3', 'Canonical: 3 custom Hub pages.'),
  ('starter', 'campaigns.max_active', '15', 'Canonical: 15 simultaneously active Campaigns.'),
  ('starter', 'surveys.max_active', '2', 'Canonical: 2 active survey-mode Campaigns that have not met the threshold.'),
  ('starter', 'surveys.threshold', '{"op":"gt","value":0.5}', 'Canonical: more than 50% of unique eligible members.'),
  ('starter', 'analytics.export', 'true', 'Exports of released aggregates.'),
  ('team', 'roles.max_custom', '6', 'Canonical: 6 custom roles.'),
  ('team', 'pages.max_custom', '10', 'PROVISIONAL (A-04): founder gave "expanded"; 10 until decided.'),
  ('team', 'campaigns.max_active', '15', 'PROVISIONAL (A-04): founder gave no number; never below Starter.'),
  ('team', 'surveys.max_active', '5', 'Canonical: 5 active survey-mode Campaigns that have not met the threshold.'),
  ('team', 'surveys.threshold', '{"op":"gte","value":0.2}', 'Canonical: at least 20% of unique eligible members.'),
  ('team', 'analytics.export', 'true', 'Exports of released aggregates.'),
  ('team', 'discover.min_members', '700', 'Canonical: Discover eligibility at 700 genuine active members.');

create function lv.plan_limit(p_family text, p_key text) returns jsonb
language sql stable security definer set search_path = ''
as $$ select l.value from lv.plan_limits l where l.family = p_family and l.key = p_key $$;

create function lv.family_rank(p_family text) returns int
language sql immutable set search_path = ''
as $$ select case p_family when 'team' then 2 when 'starter' then 1 when 'free' then 0 end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Products. Prices in cents; NULL price = unknown and never purchasable (Campaign Plus).
-- ---------------------------------------------------------------------------------------------------------
create table lv.products (
  product text primary key,
  family text check (family is null or family in ('free', 'starter', 'team')),
  price_cents int check (price_cents is null or price_cents >= 0),
  interval text not null check (interval in ('none', 'month', 'weeks', 'year')),
  first_period_weeks int check (first_period_weeks is null or first_period_weeks > 0),
  extra_week_cents int check (extra_week_cents is null or extra_week_cents >= 0),
  period_months int check (period_months is null or period_months > 0),
  purchasable boolean not null default false,
  note text not null default '',
  constraint products_price_known check (not purchasable or price_cents is not null)
);
alter table lv.products enable row level security;

insert into lv.products (product, family, price_cents, interval, first_period_weeks, extra_week_cents, period_months, purchasable, note) values
  ('quick', 'free', 0, 'none', null, null, null, false, 'Quick Surveys in the personal space; always free.'),
  ('founding', 'starter', null, 'none', null, null, null, false, 'Waitlist grant: free until billing launches, then 30 more days.'),
  ('starter_hub', 'starter', 1300, 'month', null, null, null, true, 'Starter Hub: $13/month.'),
  ('team_hub', 'team', 2900, 'month', null, null, null, true, 'Team Hub: $29/month.'),
  ('campaign_starter', 'starter', 1900, 'weeks', 2, 1300, null, true, 'Campaign Starter: $19 for the first 2 weeks, $13 per extra week.'),
  ('campaign_plus', 'team', 3900, 'weeks', 2, 1900, null, true, 'Campaign Plus: $39 for the first 2 weeks, $19 per extra week (founder, 2026-11-07).'),
  ('hub_reservation', null, 2500, 'year', null, null, 12, true, 'Hub Name Reservation: $25 per 12 months; grants no features.');

-- ---------------------------------------------------------------------------------------------------------
-- Entitlements and Hub credits
-- ---------------------------------------------------------------------------------------------------------
create table lv.entitlements (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('account', 'hub')),
  account_id uuid references lv.accounts (id) on delete set null,
  hub_id uuid references lv.hubs (id) on delete set null,
  family text not null check (family in ('free', 'starter', 'team')),
  product text not null references lv.products (product),
  source text not null check (source in ('waitlist', 'billing', 'grant')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now(),
  constraint entitlements_scope_shape check (scope = 'hub' or hub_id is null),
  constraint entitlements_window check (ends_at is null or ends_at >= starts_at)
);
create index entitlements_hub_idx on lv.entitlements (hub_id) where scope = 'hub';
create index entitlements_account_idx on lv.entitlements (account_id);
create index entitlements_ref_idx on lv.entitlements (external_ref) where external_ref is not null;
alter table lv.entitlements enable row level security;

create table lv.hub_credits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references lv.accounts (id) on delete cascade,
  family text not null check (family in ('starter', 'team')),
  product text not null references lv.products (product),
  source text not null check (source in ('waitlist', 'billing', 'grant')),
  entitlement_id uuid references lv.entitlements (id) on delete set null,
  ends_at timestamptz,          -- fixed end for the Hub entitlement it becomes (e.g. a paid period end)
  duration interval,            -- or a duration counted from Hub creation (e.g. Campaign Starter weeks)
  external_ref text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_by_hub uuid references lv.hubs (id) on delete set null,
  constraint hub_credits_consumed_shape check (consumed_by_hub is null or consumed_at is not null)
);
create index hub_credits_account_idx on lv.hub_credits (account_id) where consumed_at is null;
alter table lv.hub_credits enable row level security;

insert into lv.policy (key, value, note) values
  ('billing.launched_at', null,
   'ISO timestamp when paid billing went live. NULL = not launched: Founding entitlements stay open-ended. Once set, they end 30 days later.'),
  ('waitlist.seats', '50'::jsonb, 'L-02: the first 50 signed-in waitlist joiners are admitted automatically.');

-- Retired: limits come from lv.plan_limits now.
delete from lv.policy where key in ('campaign.max_active_per_hub', 'roles.max_custom_per_hub');
update lv.policy set value = '5'::jsonb, note = 'L-04: minimum cohort before an anonymous analytics cell is published.'
 where key = 'campaign.min_cohort';
update lv.policy set value = '10'::jsonb, note = 'L-05: maximum guest submissions per Campaign per minute.'
 where key = 'participation.guest_rate_per_minute';

-- The effective end of an entitlement or credit. Founding has no stored end; it follows billing.launched_at.
create function lv.effective_end(p_product text, p_ends_at timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_launch jsonb;
begin
  if p_product <> 'founding' or p_ends_at is not null then return p_ends_at; end if;
  v_launch := lv.policy_json('billing.launched_at');
  if v_launch is null or jsonb_typeof(v_launch) <> 'string' then return null; end if;
  return (v_launch #>> '{}')::timestamptz + interval '30 days';
end;
$$;

create function lv.entitlement_state(p_starts_at timestamptz, p_end timestamptz) returns text
language sql stable set search_path = ''
as $$ select case when p_starts_at > now() then 'scheduled'
                  when p_end is not null and p_end <= now() then 'expired'
                  else 'active' end $$;

create function lv.entitlement_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('id', e.id, 'product', e.product, 'family', e.family, 'scope', e.scope,
           'hub_id', e.hub_id, 'starts_at', e.starts_at, 'ends_at', lv.effective_end(e.product, e.ends_at),
           'source', e.source))
         || jsonb_build_object('state', lv.entitlement_state(e.starts_at, lv.effective_end(e.product, e.ends_at)))
    from lv.entitlements e where e.id = p_id
$$;

-- The plan a Hub runs on right now. Personal spaces are always the free family.
create function lv.hub_plan(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind text;
  e record;
begin
  select h.kind into v_kind from lv.hubs h where h.id = p_hub;
  if v_kind is null then return null; end if;
  if v_kind = 'personal' then
    return jsonb_build_object('family', 'free', 'product', 'quick', 'state', 'active', 'starts_at', null, 'ends_at', null);
  end if;

  select x.*, lv.effective_end(x.product, x.ends_at) as eff into e
    from lv.entitlements x
   where x.scope = 'hub' and x.hub_id = p_hub and x.starts_at <= now()
     and (lv.effective_end(x.product, x.ends_at) is null or lv.effective_end(x.product, x.ends_at) > now())
   order by lv.family_rank(x.family) desc, lv.effective_end(x.product, x.ends_at) desc nulls first, x.created_at
   limit 1;
  if e.id is not null then
    return jsonb_build_object('family', e.family, 'product', e.product, 'state', 'active',
                              'starts_at', e.starts_at, 'ends_at', e.eff, 'entitlement_id', e.id);
  end if;

  select x.*, lv.effective_end(x.product, x.ends_at) as eff into e
    from lv.entitlements x
   where x.scope = 'hub' and x.hub_id = p_hub and x.starts_at > now()
   order by x.starts_at limit 1;
  if e.id is not null then
    return jsonb_build_object('family', e.family, 'product', e.product, 'state', 'scheduled',
                              'starts_at', e.starts_at, 'ends_at', e.eff, 'entitlement_id', e.id);
  end if;

  select x.*, lv.effective_end(x.product, x.ends_at) as eff into e
    from lv.entitlements x
   where x.scope = 'hub' and x.hub_id = p_hub
   order by lv.effective_end(x.product, x.ends_at) desc nulls first limit 1;
  if e.id is not null then
    return jsonb_build_object('family', e.family, 'product', e.product, 'state', 'expired',
                              'starts_at', e.starts_at, 'ends_at', e.eff, 'entitlement_id', e.id);
  end if;
  return jsonb_build_object('family', null, 'product', null, 'state', 'none', 'starts_at', null, 'ends_at', null);
end;
$$;

-- The family in force for a Hub, or NULL (no active entitlement: premium actions fail closed).
create function lv.hub_family(p_hub uuid) returns text
language sql stable security definer set search_path = ''
as $$ select case when p->>'state' = 'active' then p->>'family' end from lv.hub_plan(p_hub) p $$;

create function lv.hub_limit(p_hub uuid, p_key text) returns jsonb
language sql stable security definer set search_path = ''
as $$ select lv.plan_limit(lv.hub_family(p_hub), p_key) $$;

create or replace function lv.custom_role_limit(p_hub uuid) returns int
language sql stable security definer set search_path = ''
as $$ select (lv.hub_limit(p_hub, 'roles.max_custom'))::int $$;

-- Premium-write guard used by the API wrappers. Non-members fall through so the body answers as before
-- (lv_not_found / lv_forbidden); members of a Hub without an active plan get lv_entitlement_required.
create function lv.premium_guard(p_hub uuid, p_personal_ok boolean) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_kind text;
begin
  select h.kind into v_kind from lv.hubs h where h.id = p_hub;
  -- A personal space is never a Hub: every Hub-scoped operation answers as if it did not exist (LC-06).
  if v_kind = 'personal' and not p_personal_ok then
    perform lv.fail('lv_not_found', 'No such Hub.');
  end if;
  if v_kind is null or v_account is null or lv.membership_of(v_account, p_hub) is null then return; end if;
  if lv.hub_family(p_hub) is null then
    perform lv.fail('lv_entitlement_required', 'This Hub has no active plan. Premium actions are locked; your data is kept.',
                    jsonb_build_object('product', 'starter_hub'));
  end if;
end;
$$;

create function lv.hub_kind(p_hub uuid) returns text
language sql stable security definer set search_path = ''
as $$ select h.kind from lv.hubs h where h.id = p_hub $$;

-- Hub-scoped reads and lifecycle operations refuse a personal space (LC-06). No plan check: reads and
-- membership housekeeping keep working when a plan has expired.
create function lv.require_community(p_hub uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if lv.hub_kind(p_hub) = 'personal' then perform lv.fail('lv_not_found', 'No such Hub.'); end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Campaign access: who may answer. 'members' (community default), 'link' and 'invite' (Quick Surveys).
-- ---------------------------------------------------------------------------------------------------------
alter table lv.campaigns add column access text not null default 'members' check (access in ('members', 'link', 'invite'));
alter table lv.campaigns add constraint campaigns_invite_no_guests check (access <> 'invite' or audience = 'members');
-- Platform moderation: a blocked Campaign accepts no responses and is hidden from respondents; nothing is deleted.
alter table lv.campaigns add column blocked_at timestamptz;
alter table lv.campaigns add column blocked_reason text check (blocked_reason is null or length(blocked_reason) <= 500);

create table lv.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  -- Shown to the Campaign's managers like the join code: it grants only eligibility to answer this Campaign.
  token text not null,
  created_by uuid references lv.accounts (id) on delete set null,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaign_invites_token_key unique (token),
  constraint campaign_invites_uses_sane check (uses >= 0 and (max_uses is null or uses <= max_uses))
);
create index campaign_invites_campaign_idx on lv.campaign_invites (campaign_id);
alter table lv.campaign_invites enable row level security;

-- Eligibility for one Campaign. Never a membership: it does not count toward any Hub total or threshold.
create table lv.campaign_eligibility (
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  invite_id uuid references lv.campaign_invites (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, account_id)
);
create index campaign_eligibility_account_idx on lv.campaign_eligibility (account_id);
alter table lv.campaign_eligibility enable row level security;

create function lv.can_participate(p_campaign uuid, p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_account is not null and exists (
    select 1 from lv.campaigns c
     where c.id = p_campaign
       and (lv.membership_of(p_account, c.hub_id) is not null
            or c.access = 'link'
            or (c.access = 'invite' and exists (select 1 from lv.campaign_eligibility e
                                                 where e.campaign_id = c.id and e.account_id = p_account))))
$$;

-- Unique eligible participants and the eligible population.
--   members: accepted members of the Hub (000013 semantics, unchanged).
--   invite:  accounts holding eligibility for the Campaign.
--   link:    eligible population unknown (NULL), so no rate and no threshold.
create or replace function lv.campaign_member_participation(p_campaign uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case c.access
    when 'invite' then jsonb_build_object(
      'participants', (select count(distinct p.account_id) from lv.participation p
                         join lv.campaign_eligibility e on e.campaign_id = p.campaign_id and e.account_id = p.account_id
                        where p.campaign_id = c.id),
      'eligible', (select count(*) from lv.campaign_eligibility e where e.campaign_id = c.id))
    when 'link' then jsonb_build_object(
      'participants', (select count(distinct p.account_id) from lv.participation p where p.campaign_id = c.id),
      'eligible', null)
    else jsonb_build_object(
      'participants', (select count(distinct p.account_id)
                         from lv.participation p
                         join lv.hub_memberships m on m.hub_id = p.hub_id and m.account_id = p.account_id and m.status = 'accepted'
                        where p.campaign_id = c.id),
      'eligible', (select count(*) from lv.hub_memberships m where m.hub_id = c.hub_id and m.status = 'accepted'))
    end
    from lv.campaigns c where c.id = p_campaign
$$;

-- Has a survey met its family's threshold? Zero (or unknown) eligible members is never "met".
create function lv.survey_threshold_met(p_campaign uuid, p_threshold jsonb) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_part jsonb := lv.campaign_member_participation(p_campaign);
  v_eligible numeric := (v_part->>'eligible')::numeric;
  v_ratio numeric;
begin
  if p_threshold is null or v_eligible is null or v_eligible = 0 then return false; end if;
  v_ratio := (v_part->>'participants')::numeric / v_eligible;
  return case p_threshold->>'op'
    when 'gt' then v_ratio > (p_threshold->>'value')::numeric
    when 'gte' then v_ratio >= (p_threshold->>'value')::numeric
    else false end;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Activation gate, now driven by the map. Reasons (data): not_found, not_draft, already_closed, no_questions,
-- entitlement_required, limit_undefined, limit_reached, survey_limit_reached, too_many_questions,
-- kind_not_allowed, blocked (a platform administrator stopped this Campaign). limit/used describe the first slot limit that blocked.
-- ---------------------------------------------------------------------------------------------------------
create function lv.capacity_check(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c record;
  v_kind text;
  v_family text;
  v_limit jsonb;
  v_used int;
  v_kinds jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_detail jsonb := '{}'::jsonb;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c.id is null then return jsonb_build_object('reasons', jsonb_build_array('not_found')); end if;
  if c.blocked_at is not null then
    v_reasons := v_reasons || to_jsonb('blocked'::text);
  end if;
  v_kind := lv.hub_kind(c.hub_id);
  v_family := lv.hub_family(c.hub_id);
  if v_family is null then
    return jsonb_build_object('reasons', jsonb_build_array('entitlement_required'), 'family', null);
  end if;

  if v_kind = 'personal' then
    v_limit := lv.plan_limit(v_family, 'quick.max_active');
    select count(*) into v_used from lv.campaigns x where x.hub_id = c.hub_id and x.status = 'active' and x.id <> c.id;
    if v_limit is null then
      v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
    elsif v_used >= (v_limit)::int then
      v_reasons := v_reasons || to_jsonb('limit_reached'::text);
      v_detail := jsonb_build_object('limit', (v_limit)::int, 'used', v_used, 'limit_key', 'quick.max_active');
    end if;

    v_limit := lv.plan_limit(v_family, 'quick.max_questions');
    select count(*) into v_used from lv.campaign_questions q where q.campaign_id = c.id;
    if v_limit is null or v_used > (v_limit)::int then
      v_reasons := v_reasons || to_jsonb('too_many_questions'::text);
      if v_detail = '{}'::jsonb and v_limit is not null then
        v_detail := jsonb_build_object('limit', (v_limit)::int, 'used', v_used, 'limit_key', 'quick.max_questions');
      end if;
    end if;

    v_kinds := lv.plan_limit(v_family, 'quick.kinds');
    if v_kinds is null or exists (select 1 from lv.campaign_questions q where q.campaign_id = c.id and not (v_kinds ? q.kind)) then
      v_reasons := v_reasons || to_jsonb('kind_not_allowed'::text);
    end if;
  else
    v_limit := lv.plan_limit(v_family, 'campaigns.max_active');
    select count(*) into v_used from lv.campaigns x where x.hub_id = c.hub_id and x.status = 'active' and x.id <> c.id;
    if v_limit is null then
      v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
    elsif v_used >= (v_limit)::int then
      v_reasons := v_reasons || to_jsonb('limit_reached'::text);
      v_detail := jsonb_build_object('limit', (v_limit)::int, 'used', v_used, 'limit_key', 'campaigns.max_active');
    end if;

    if c.mode = 'survey' then
      v_limit := lv.plan_limit(v_family, 'surveys.max_active');
      if v_limit is null then
        v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
      else
        select count(*) into v_used from lv.campaigns x
         where x.hub_id = c.hub_id and x.status = 'active' and x.mode = 'survey' and x.id <> c.id
           and not lv.survey_threshold_met(x.id, lv.plan_limit(v_family, 'surveys.threshold'));
        if v_used >= (v_limit)::int then
          v_reasons := v_reasons || to_jsonb('survey_limit_reached'::text);
          if v_detail = '{}'::jsonb then
            v_detail := jsonb_build_object('limit', (v_limit)::int, 'used', v_used, 'limit_key', 'surveys.max_active');
          end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('reasons', v_reasons, 'family', v_family) || v_detail;
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

  v_cap := lv.capacity_check(p_campaign);
  v_reasons := v_reasons || (v_cap->'reasons');
  return jsonb_build_object('ok', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons) || (v_cap - 'reasons');
end;
$$;

-- Raise the right error for a failed capacity/gate result. Personal-space slot and size limits answer
-- lv_limit_reached { limit, used }; everything else lv_gate_blocked { reasons }.
create function lv.raise_gate(p_campaign uuid, p_gate jsonb) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_reasons jsonb := p_gate->'reasons';
begin
  if v_reasons ? 'entitlement_required' then
    perform lv.fail('lv_entitlement_required', 'This Hub has no active plan. Premium actions are locked; your data is kept.',
                    jsonb_build_object('product', 'starter_hub'));
  end if;
  if lv.hub_kind((select c.hub_id from lv.campaigns c where c.id = p_campaign)) = 'personal'
     and (v_reasons ? 'limit_reached' or v_reasons ? 'too_many_questions') then
    perform lv.fail('lv_limit_reached',
      case when v_reasons ? 'limit_reached' then 'You already have the maximum number of active Quick Surveys.'
           else 'A Quick Survey can have at most ' || coalesce(p_gate->>'limit', '?') || ' questions.' end,
      jsonb_build_object('limit', (p_gate->>'limit')::int, 'used', (p_gate->>'used')::int, 'reasons', v_reasons));
  end if;
  perform lv.fail('lv_gate_blocked', (select string_agg(r, ',') from jsonb_array_elements_text(v_reasons) r),
                  jsonb_build_object('reasons', v_reasons) || (p_gate - 'ok' - 'reasons' - 'family'));
end;
$$;

create or replace function lv.activate_campaign(p_campaign uuid) returns void
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
  if not (v_gate->>'ok')::boolean then perform lv.raise_gate(p_campaign, v_gate); end if;

  update lv.campaigns
     set status = 'active', activated_at = now(), revision = revision + 1
   where id = p_campaign;
  perform lv.audit(c.created_by, c.hub_id, 'campaign.activated', p_campaign::text, v_gate);
end;
$$;

-- Resuming takes an active slot again: same map-driven capacity check, same lock.
create or replace function lv.api_campaign_resume(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_cap jsonb;
  v_reasons jsonb := '[]'::jsonb;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status = 'active' then return jsonb_build_object('ok', true); end if;
  if c.status <> 'paused' then return lv.err('lv_lifecycle_invalid', 'Only a paused Campaign can be resumed.'); end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_activate:' || c.hub_id::text, 0));
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;
  v_cap := lv.capacity_check(c.id);
  v_reasons := v_reasons || (v_cap->'reasons');
  if jsonb_array_length(v_reasons) > 0 then
    perform lv.raise_gate(c.id, jsonb_build_object('reasons', v_reasons) || (v_cap - 'reasons'));
  end if;

  update lv.campaigns set status = 'active', paused_at = null where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.resumed', c.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- The published version records the plan and the limits in force instead of the retired policy.
create or replace function lv.snapshot_published_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan jsonb := lv.hub_plan(new.hub_id);
begin
  if old.status = 'draft' and new.status = 'active' then
    insert into lv.campaign_versions (campaign_id, version, published_by, settings, questions)
    values (new.id, new.revision, lv.current_account_id(),
      (to_jsonb(new) - 'join_code' - 'status' - 'activated_at' - 'closed_at' - 'paused_at' - 'archived_at' - 'revision')
        || jsonb_build_object('entitlement', jsonb_build_object(
             'family', v_plan->>'family', 'product', v_plan->>'product',
             'limits', coalesce((select jsonb_object_agg(l.key, l.value) from lv.plan_limits l
                                  where l.family = v_plan->>'family'), '{}'::jsonb))),
      coalesce((select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                                    'prompt', q.prompt, 'config', q.config) order by q.position)
                  from lv.campaign_questions q where q.campaign_id = new.id), '[]'::jsonb));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Participation honours access: members, anyone signed in with the link, or invited people only
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.submit_response(p_campaign uuid, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_bad text;
  v_sub uuid;
  v_part uuid;
  v_receipt uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;

  select * into c from lv.campaigns where id = p_campaign;
  if c is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;

  if c.status <> 'active' or c.blocked_at is not null
     or (c.opens_at is not null and c.opens_at > now())
     or (c.closes_at is not null and c.closes_at <= now()) then
    raise exception 'lv_closed: this Campaign is not accepting responses' using errcode = '42501';
  end if;

  if not lv.can_participate(p_campaign, v_account) then
    raise exception 'lv_forbidden: you are not eligible to answer this Campaign' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_submit:' || p_campaign::text || ':' || v_account::text, 0));

  select p.id, p.receipt_id into v_part, v_receipt
    from lv.participation p
   where p.campaign_id = p_campaign and p.account_id = v_account;
  if v_part is not null then
    return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', true);
  end if;

  v_bad := lv.validate_answers(p_campaign, p_answers);
  if v_bad is not null then
    raise exception 'lv_invalid_input: %', v_bad using errcode = '22023';
  end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id)
  values (p_campaign, c.hub_id, c.revision, case when c.anonymity = 'anonymous' then null else v_account end)
  returning id into v_sub;

  insert into lv.answers (submission_id, question_id, value)
  select v_sub, (e->>'question_id')::uuid, e->'value'
    from jsonb_array_elements(p_answers) e
   where e->'value' is not null and e->'value' <> 'null'::jsonb;

  insert into lv.participation (campaign_id, hub_id, account_id, submission_id, campaign_revision, reward_state)
  values (p_campaign, c.hub_id, v_account,
          case when c.anonymity = 'anonymous' then null else v_sub end,
          c.revision, 'not_applicable')
  returning id, receipt_id into v_part, v_receipt;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', false);
end;
$$;

-- Guests never reach an invite-only Campaign.
create or replace function lv.guest_campaign(p_join_code text) returns lv.campaigns
language sql stable security definer set search_path = ''
as $$
  select c.* from lv.campaigns c
   where c.join_code = upper(btrim(coalesce(p_join_code, '')))
     and c.audience = 'members_and_guests'
     and c.access <> 'invite'
     and c.status = 'active'
     and c.blocked_at is null
$$;

-- The join-code entry point. Guests see a guest-enabled Campaign as before. A signed-in caller also finds a
-- link-access Campaign and an invite-only Campaign they are eligible for, and answers through
-- lv_submit_response with the returned campaign_id. A link-access Campaign without guests tells a signed-out
-- caller to sign in. Everything else is lv_not_found.
create or replace function lv.api_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_account uuid := lv.current_account_id();
  v_hub record;
  v_phase text;
  v_full boolean;
  v_guest_ok boolean;
  v_signed_ok boolean;
  v_responded boolean := false;
begin
  select * into c from lv.campaigns x where x.join_code = upper(btrim(coalesce(p_join_code, ''))) and x.status = 'active' and x.blocked_at is null;
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  v_guest_ok := c.audience = 'members_and_guests' and c.access <> 'invite';
  v_signed_ok := v_account is not null and lv.can_participate(c.id, v_account);
  if not (v_guest_ok or v_signed_ok or (c.access = 'link' and v_account is null)) then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;

  select h.display_name, h.kind into v_hub from lv.hubs h where h.id = c.hub_id;
  v_phase := lv.campaign_phase(c.status, c.opens_at, c.closes_at);
  v_full := c.guest_limit is not null
            and (select count(*) from lv.guest_participation g where g.campaign_id = c.id) >= c.guest_limit;
  if v_signed_ok then
    v_responded := exists (select 1 from lv.participation p where p.campaign_id = c.id and p.account_id = v_account);
  end if;
  return jsonb_build_object('ok', true,
    'campaign', jsonb_build_object('campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
                                   'phase', v_phase, 'opens_at', c.opens_at, 'closes_at', c.closes_at,
                                   'access', c.access, 'guests_allowed', v_guest_ok),
    -- A personal space is never named: the respondent sees LunchVoice, not "Personal space".
    'hub', jsonb_build_object('name', case when v_hub.kind = 'personal' then null else v_hub.display_name end),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), '[]'::jsonb),
    'signed_in', v_account is not null,
    'sign_in_required', not v_guest_ok and not v_signed_ok,
    'has_responded', v_responded,
    'can_respond', v_phase = 'open' and ((v_signed_ok and not v_responded) or (not v_signed_ok and v_guest_ok and not v_full)));
end;
$$;

-- Respondent-safe detail, now also for eligible non-members (Quick Survey respondents).
create or replace function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_member boolean;
  v_manage boolean;
  v_responded boolean;
  v_receipt uuid;
  v_open boolean;
  v_out jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  v_member := lv.membership_of(v_account, c.hub_id) is not null;
  if not v_member and not (c.status = 'active' and lv.can_participate(c.id, v_account)) then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  v_manage := v_member and lv.has_capability(v_account, c.hub_id, 'campaign.manage');
  if (c.status = 'draft' or c.blocked_at is not null) and not v_manage then return lv.err('lv_not_found', 'No such Campaign.'); end if;

  select true, p.receipt_id into v_responded, v_receipt
    from lv.participation p where p.campaign_id = c.id and p.account_id = v_account;
  v_responded := coalesce(v_responded, false);
  v_open := c.status = 'active'
            and (c.opens_at is null or c.opens_at <= now())
            and (c.closes_at is null or c.closes_at > now());

  v_out := jsonb_build_object('ok', true,
    'campaign', jsonb_build_object(
      'campaign_id', c.id, 'hub_id', case when v_member then c.hub_id end, 'title', c.title, 'mode', c.mode,
      'anonymity', c.anonymity, 'status', c.status, 'revision', c.revision, 'opens_at', c.opens_at,
      'closes_at', c.closes_at, 'access', c.access, 'audience', c.audience),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), jsonb_build_array()),
    'has_responded', v_responded,
    'receipt_id', v_receipt,
    'can_respond', v_open and c.blocked_at is null and not v_responded and lv.can_participate(c.id, v_account),
    'can_manage', v_manage);

  if v_manage then
    v_out := v_out || jsonb_build_object('join_code', c.join_code, 'gate', lv.gate_evaluate(c.id),
                                         'blocked', c.blocked_at is not null, 'blocked_reason', c.blocked_reason);
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Personal space (A-01)
-- ---------------------------------------------------------------------------------------------------------
create function lv.personal_space_of(p_account uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select h.id from lv.hubs h where h.owner_account_id = p_account and h.kind = 'personal' $$;

create function lv.ensure_personal_space(p_account uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid;
begin
  if p_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;
  v_hub := lv.personal_space_of(p_account);
  if v_hub is not null then return v_hub; end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_personal:' || p_account::text, 0));
  v_hub := lv.personal_space_of(p_account);
  if v_hub is not null then return v_hub; end if;

  insert into lv.hubs (slug, display_name, kind, visibility, membership_mode, owner_account_id)
  values (null, 'Personal space', 'personal', 'private', 'invite_only', p_account) returning id into v_hub;
  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at) values (v_hub, p_account, 'accepted', now());
  perform lv.owner_bootstrap_roles(v_hub, p_account);
  perform lv.audit(p_account, v_hub, 'personal_space.created', p_account::text);
  return v_hub;
end;
$$;

create function lv.campaign_summary(p_campaign uuid, p_manage boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity, 'status', c.status,
           'phase', lv.campaign_phase(c.status, c.opens_at, c.closes_at), 'access', c.access,
           'guests', c.audience = 'members_and_guests', 'opens_at', c.opens_at, 'closes_at', c.closes_at,
           'created_at', c.created_at, 'blocked', c.blocked_at is not null,
           'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
           'join_code', case when p_manage then c.join_code end)
    from lv.campaigns c where c.id = p_campaign
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Hub creation consumes a Hub credit (no beta gate)
-- ---------------------------------------------------------------------------------------------------------
-- Slug claim hook: NULL when the slug may be claimed by this account. 000016 adds Hub Name Reservations.
create function lv.slug_claim_blocked(p_slug text, p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$ select null::text $$;

create function lv.valid_credit(p_account uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.id from lv.hub_credits c
   where c.account_id = p_account and c.consumed_at is null
     and (lv.effective_end(c.product, c.ends_at) is null or lv.effective_end(c.product, c.ends_at) > now())
   order by c.created_at, c.id
   limit 1
$$;

create or replace function lv.api_hub_create(p_slug text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_blocked text;
  cr record;
  v_hub uuid;
  v_ent uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;
  if v_slug is null or length(v_slug) not between 3 and 40
     or v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$' or v_slug like '%--%' then
    return lv.err('lv_invalid_input', 'Hub names are 3 to 40 characters: lowercase letters, numbers and single hyphens, not starting or ending with a hyphen.');
  end if;
  if v_name is null or v_name = '' then
    return lv.err('lv_invalid_input', 'A Hub needs a display name.');
  end if;
  if exists (select 1 from lv.reserved_slugs r where r.slug = v_slug) then
    return lv.err('lv_invalid_input', 'That name is reserved.');
  end if;
  v_blocked := lv.slug_claim_blocked(v_slug, v_account);
  if v_blocked is not null then return lv.err('lv_conflict', v_blocked); end if;

  -- One credit, one Hub: serialise this account's credit spending, then lock the credit row.
  perform pg_advisory_xact_lock(hashtextextended('lv_credit:' || v_account::text, 0));
  select * into cr from lv.hub_credits c where c.id = lv.valid_credit(v_account) for update;
  if cr.id is null then
    return lv.err_x('lv_entitlement_required', 'Creating a Hub needs a Hub credit: join the waitlist or buy a Hub plan.',
                    jsonb_build_object('product', 'starter_hub'));
  end if;

  insert into lv.hubs (slug, display_name, owner_account_id) values (v_slug, v_name, v_account) returning id into v_hub;
  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at) values (v_hub, v_account, 'accepted', now());
  perform lv.owner_bootstrap_roles(v_hub, v_account);

  update lv.hub_credits set consumed_at = now(), consumed_by_hub = v_hub where id = cr.id;
  insert into lv.entitlements (scope, account_id, hub_id, family, product, source, starts_at, ends_at, external_ref)
  values ('hub', v_account, v_hub, cr.family, cr.product, cr.source, now(),
          coalesce(cr.ends_at, now() + cr.duration), cr.external_ref)
  returning id into v_ent;
  perform lv.audit(v_account, v_hub, 'hub.created', v_slug, jsonb_build_object('credit', cr.id, 'entitlement', v_ent));

  return jsonb_build_object('ok', true, 'hub_id', v_hub, 'slug', v_slug, 'plan', lv.hub_plan(v_hub));
exception
  when unique_violation then
    return lv.err('lv_conflict', 'That Hub name is taken.');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Waitlist (L-02, L-03)
-- ---------------------------------------------------------------------------------------------------------
create table lv.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references lv.accounts (id) on delete cascade,
  status text not null check (status in ('admitted', 'waitlisted')),
  position int not null check (position > 0),
  contact_email text check (contact_email is null or (length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint waitlist_entries_account_key unique (account_id)
);
create index waitlist_entries_status_idx on lv.waitlist_entries (status, position);
alter table lv.waitlist_entries enable row level security;
comment on column lv.waitlist_entries.contact_email is
  'Optional contact address the person typed. Never an identity key; the seat is bound to the account ((issuer, subject)).';

create function lv.waitlist_seats() returns int
language sql stable security definer set search_path = ''
as $$ select coalesce(greatest((lv.policy_json('waitlist.seats'))::int, 0), 0) $$;

create function lv.waitlist_me(p_account uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when w.id is null then jsonb_build_object('status', 'none')
              else jsonb_build_object('status', w.status, 'position', w.position, 'joined_at', w.created_at) end
    from (select 1) one left join lv.waitlist_entries w on w.account_id = p_account
$$;

create function lv.api_waitlist_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_taken int;
  v_out jsonb;
begin
  select count(*) into v_taken from lv.waitlist_entries w where w.status = 'admitted';
  v_out := jsonb_build_object('ok', true, 'seats_total', lv.waitlist_seats(), 'seats_taken', v_taken,
                              'open', v_taken < lv.waitlist_seats());
  if v_account is not null then v_out := v_out || jsonb_build_object('me', lv.waitlist_me(v_account)); end if;
  return v_out;
end;
$$;

create function lv.api_waitlist_join(p_contact_email text, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  w record;
  v_email text := nullif(btrim(p_contact_email), '');
  v_note text := nullif(btrim(p_note), '');
  v_taken int;
  v_status text;
  v_pos int;
  v_ent uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return lv.err('lv_invalid_input', 'That contact email does not look right.');
  end if;
  if v_note is not null and length(v_note) > 500 then return lv.err('lv_invalid_input', 'Keep the note under 500 characters.'); end if;

  -- One global lock: the seat count and the admission decision are a single serial step.
  perform pg_advisory_xact_lock(hashtextextended('lv_waitlist', 0));

  select * into w from lv.waitlist_entries x where x.account_id = v_account;
  if w.id is not null then
    return jsonb_build_object('ok', true, 'status', w.status, 'position', w.position, 'already_joined', true)
      || case when w.status = 'admitted' then jsonb_build_object('granted', (
            select lv.entitlement_json(e.id) from lv.entitlements e
             where e.account_id = v_account and e.scope = 'account' and e.product = 'founding' and e.source = 'waitlist'
             order by e.created_at limit 1)) else '{}'::jsonb end;
  end if;

  select count(*) into v_taken from lv.waitlist_entries x where x.status = 'admitted';
  if v_taken < lv.waitlist_seats() then
    v_status := 'admitted';
    v_pos := v_taken + 1;
  else
    v_status := 'waitlisted';
    select count(*) + 1 into v_pos from lv.waitlist_entries x where x.status = 'waitlisted';
  end if;

  insert into lv.waitlist_entries (account_id, status, position, contact_email, note)
  values (v_account, v_status, v_pos, v_email, v_note);

  if v_status = 'admitted' then
    insert into lv.entitlements (scope, account_id, family, product, source, starts_at, ends_at)
    values ('account', v_account, 'starter', 'founding', 'waitlist', now(), null)
    returning id into v_ent;
    insert into lv.hub_credits (account_id, family, product, source, entitlement_id)
    values (v_account, 'starter', 'founding', 'waitlist', v_ent);
  end if;
  perform lv.audit(v_account, null, 'waitlist.' || v_status, v_account::text, jsonb_build_object('position', v_pos));

  return jsonb_build_object('ok', true, 'status', v_status, 'position', v_pos, 'already_joined', false)
    || case when v_ent is not null then jsonb_build_object('granted', lv.entitlement_json(v_ent)) else '{}'::jsonb end;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Plan limits (public, for the pricing page)
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_plan_limits() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true,
    'families', (select jsonb_object_agg(f.family, coalesce((select jsonb_object_agg(l.key, l.value)
                                                               from lv.plan_limits l where l.family = f.family), '{}'::jsonb))
                   from (values ('free'), ('starter'), ('team')) f(family)),
    'products', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                          'product', p.product, 'family', p.family, 'price_cents', p.price_cents,
                          'interval', p.interval, 'first_period_weeks', p.first_period_weeks,
                          'extra_week_cents', p.extra_week_cents, 'period_months', p.period_months))
                          || jsonb_build_object('purchasable', p.purchasable, 'family', p.family)
                        order by p.product)
                   from lv.products p))
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Context: entitlements, credits, Quick Survey usage, waitlist; only community Hubs are listed
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.api_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_ci jsonb := lv.caller_identity();
  v_personal uuid;
begin
  if v_account is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_unauthenticated', 'message', 'Sign in with KpnIdentity first.'));
  end if;
  v_personal := lv.personal_space_of(v_account);
  return jsonb_build_object('ok', true, 'account_id', v_account,
    'display_name', (select a.display_name from lv.accounts a where a.id = v_account),
    'email_verified', (select i.email_verified_at is not null from lv.account_identities i
                        where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject'),
    'is_platform_admin', lv.is_platform_admin(v_account),
    'beta_status', coalesce((select b.status from lv.beta_applications b where b.account_id = v_account), 'none'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hub_id', h.id, 'slug', h.slug, 'name', h.display_name, 'kind', h.kind,
               'is_owner', h.owner_account_id = v_account,
               'roles', lv.roles_of(v_account, h.id),
               'capabilities', lv.capabilities_of(v_account, h.id),
               'plan', lv.hub_plan(h.id) - 'entitlement_id')
             order by h.display_name)
        from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
       where m.account_id = v_account and m.status = 'accepted' and h.kind = 'community'), jsonb_build_array()),
    'entitlements', coalesce((
      select jsonb_agg(lv.entitlement_json(e.id) order by e.created_at)
        from lv.entitlements e where e.account_id = v_account), jsonb_build_array()),
    'hub_credits', (select count(*) from lv.hub_credits c
                     where c.account_id = v_account and c.consumed_at is null
                       and (lv.effective_end(c.product, c.ends_at) is null or lv.effective_end(c.product, c.ends_at) > now())),
    'quick_surveys', jsonb_build_object(
      'active', (select count(*) from lv.campaigns c where c.hub_id = v_personal and c.status = 'active'),
      'limit', (lv.plan_limit('free', 'quick.max_active'))::int,
      'question_limit', (lv.plan_limit('free', 'quick.max_questions'))::int),
    'waitlist', lv.waitlist_me(v_account));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Quick Surveys
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_quick_survey_create(p_title text, p_access text, p_anonymity text, p_guests boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_hub uuid;
  v_title text := btrim(p_title);
  v_access text := coalesce(p_access, 'link');
  v_id uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_title is null or v_title = '' or length(v_title) > 200 then
    return lv.err('lv_invalid_input', 'A Quick Survey needs a title of up to 200 characters.');
  end if;
  if v_access not in ('link', 'invite') then return lv.err('lv_invalid_input', 'Access is link or invite.'); end if;
  if coalesce(p_anonymity, 'anonymous') not in ('anonymous', 'identified') then
    return lv.err('lv_invalid_input', 'Anonymity is anonymous or identified.');
  end if;
  v_hub := lv.ensure_personal_space(v_account);
  insert into lv.campaigns (hub_id, title, mode, anonymity, access, audience, created_by)
  values (v_hub, v_title, 'survey', coalesce(p_anonymity, 'anonymous'), v_access,
          -- Guests are allowed only with link access.
          case when v_access = 'link' and coalesce(p_guests, true) then 'members_and_guests' else 'members' end,
          v_account)
  returning id into v_id;
  perform lv.audit(v_account, v_hub, 'quick_survey.created', v_id::text);
  return jsonb_build_object('ok', true, 'campaign', lv.campaign_summary(v_id, true));
end;
$$;

create function lv.api_quick_survey_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  v_hub := lv.personal_space_of(v_account);
  return jsonb_build_object('ok', true,
    'surveys', coalesce((select jsonb_agg(lv.campaign_summary(c.id, true) order by c.created_at desc, c.id)
                           from lv.campaigns c where c.hub_id = v_hub), jsonb_build_array()),
    'active', (select count(*) from lv.campaigns c where c.hub_id = v_hub and c.status = 'active'),
    'limit', (lv.plan_limit('free', 'quick.max_active'))::int,
    'question_limit', (lv.plan_limit('free', 'quick.max_questions'))::int);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Campaign invites: eligibility for one Campaign, never a membership
-- ---------------------------------------------------------------------------------------------------------
create function lv.campaign_invite_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('invite_id', i.id, 'token', i.token, 'max_uses', i.max_uses, 'uses', i.uses,
           'expires_at', i.expires_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at,
           'state', case when i.revoked_at is not null then 'revoked'
                         when i.expires_at is not null and i.expires_at <= now() then 'expired'
                         when i.max_uses is not null and i.uses >= i.max_uses then 'exhausted'
                         else 'active' end)
    from lv.campaign_invites i where i.id = p_id
$$;

create function lv.api_campaign_invite_create(p_campaign uuid, p_max_uses int, p_expires_at timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_id uuid;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  perform lv.premium_guard(c.hub_id, true);
  if c.access <> 'invite' then
    return lv.err('lv_invalid_input', 'Only an invite-only Campaign uses Campaign invites; share the link or join code instead.');
  end if;
  if c.status in ('closed', 'archived') then return lv.err('lv_lifecycle_invalid', 'This Campaign is finished.'); end if;
  if p_expires_at is not null and p_expires_at <= now() then return lv.err('lv_invalid_input', 'The expiry must be in the future.'); end if;
  insert into lv.campaign_invites (campaign_id, token, created_by, max_uses, expires_at)
  values (c.id, upper(encode(lv.random_bytes(12), 'hex')), v_account, p_max_uses, p_expires_at)
  returning id into v_id;
  perform lv.audit(v_account, c.hub_id, 'campaign_invite.created', v_id::text, jsonb_build_object('campaign_id', c.id));
  return jsonb_build_object('ok', true, 'invite', lv.campaign_invite_json(v_id));
end;
$$;

create function lv.api_campaign_invite_list(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, v_hub, 'campaign.manage') then
    return lv.err('lv_forbidden', 'Listing Campaign invites requires campaign.manage.');
  end if;
  return jsonb_build_object('ok', true,
    'invites', coalesce((select jsonb_agg(lv.campaign_invite_json(i.id) order by i.created_at desc)
                           from lv.campaign_invites i where i.campaign_id = p_campaign), jsonb_build_array()),
    'eligible', (select count(*) from lv.campaign_eligibility e where e.campaign_id = p_campaign));
end;
$$;

create function lv.api_campaign_invite_revoke(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  i record;
  v_hub uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.token = upper(btrim(coalesce(p_token, ''))) for update;
  if i.id is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = i.campaign_id;
  if lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such invite.'); end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  -- Revoking stops new redemptions; people already eligible stay eligible (their answers are not touched).
  update lv.campaign_invites set revoked_at = coalesce(revoked_at, now()) where id = i.id;
  perform lv.audit(v_account, v_hub, 'campaign_invite.revoked', i.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_campaign_invite_redeem(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  i record;
  c record;
  v_new boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into i from lv.campaign_invites x where x.token = upper(btrim(coalesce(p_token, ''))) for update;
  select * into c from lv.campaigns x where x.id = i.campaign_id;
  -- Unknown, revoked, expired, exhausted and finished all answer identically.
  if i.id is null or c.id is null
     or i.revoked_at is not null
     or (i.expires_at is not null and i.expires_at <= now())
     or c.status in ('closed', 'archived') or c.access <> 'invite' then
    return lv.err('lv_invalid_code', 'That invite is not valid.');
  end if;
  if exists (select 1 from lv.campaign_eligibility e where e.campaign_id = c.id and e.account_id = v_account) then
    return jsonb_build_object('ok', true, 'campaign_id', c.id, 'join_code', c.join_code, 'already_eligible', true);
  end if;
  if i.max_uses is not null and i.uses >= i.max_uses then
    return lv.err('lv_invalid_code', 'That invite is not valid.');
  end if;
  insert into lv.campaign_eligibility (campaign_id, account_id, invite_id) values (c.id, v_account, i.id)
  on conflict do nothing
  returning true into v_new;
  if coalesce(v_new, false) then update lv.campaign_invites set uses = uses + 1 where id = i.id; end if;
  perform lv.audit(v_account, c.hub_id, 'campaign_invite.redeemed', i.id::text);
  return jsonb_build_object('ok', true, 'campaign_id', c.id, 'join_code', c.join_code, 'already_eligible', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Abuse reports and platform moderation
-- ---------------------------------------------------------------------------------------------------------
create table lv.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references lv.campaigns (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  reporter_account_id uuid references lv.accounts (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index abuse_reports_campaign_idx on lv.abuse_reports (campaign_id, created_at);
create index abuse_reports_recent_idx on lv.abuse_reports (created_at);
alter table lv.abuse_reports enable row level security;

insert into lv.policy (key, value, note) values
  ('abuse.reports_per_minute', '20'::jsonb, 'Maximum abuse reports accepted per minute across the platform (signed-out reporting is allowed).');

-- Answers identically for unknown and known codes, so reporting cannot be used to discover codes.
create function lv.api_report_abuse(p_join_code text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reason text := btrim(p_reason);
  v_campaign uuid;
  v_recent int;
begin
  if v_reason is null or v_reason = '' or length(v_reason) > 1000 then
    return lv.err('lv_invalid_input', 'Tell us briefly what is wrong (up to 1000 characters).');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_abuse', 0));
  select count(*) into v_recent from lv.abuse_reports r where r.created_at > now() - interval '1 minute';
  if v_recent >= coalesce((lv.policy_json('abuse.reports_per_minute'))::int, 0) then
    return lv.err('lv_rate_limited', 'Too many reports right now. Try again in a minute.');
  end if;
  select c.id into v_campaign from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, '')));
  if v_campaign is not null then
    insert into lv.abuse_reports (campaign_id, reason, reporter_account_id) values (v_campaign, v_reason, lv.current_account_id());
  end if;
  return jsonb_build_object('ok', true, 'received', true);
end;
$$;

create function lv.api_admin_campaign_block(p_campaign uuid, p_reason text, p_block boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if not lv.is_platform_admin(v_account) then return lv.err('lv_forbidden', 'Platform moderation requires an administrator.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign for update;
  if c.id is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if p_block and (btrim(coalesce(p_reason, '')) = '' or length(p_reason) > 500) then
    return lv.err('lv_invalid_input', 'A block needs a reason of up to 500 characters.');
  end if;
  update lv.campaigns
     set blocked_at = case when p_block then coalesce(blocked_at, now()) end,
         blocked_reason = case when p_block then btrim(p_reason) end
   where id = c.id;
  if p_block then update lv.abuse_reports set status = 'actioned' where campaign_id = c.id and status = 'open'; end if;
  perform lv.audit(v_account, c.hub_id, case when p_block then 'campaign.blocked' else 'campaign.unblocked' end, c.id::text,
                   jsonb_build_object('reason', btrim(p_reason)));
  return jsonb_build_object('ok', true, 'blocked', p_block);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Reserved slugs: every top-level UI route (src/lib/reservedSlugs.ts) plus the launch routes
-- ---------------------------------------------------------------------------------------------------------
insert into lv.reserved_slugs (slug, reason) values
  ('me', 'ui route'), ('api', 'ui route'), ('analytics', 'ui route'), ('campaigns', 'ui route'), ('signin', 'ui route'),
  ('signout', 'ui route'), ('login', 'ui route'), ('logout', 'ui route'), ('auth', 'ui route'), ('callback', 'ui route'),
  ('oauth', 'ui route'), ('sso', 'ui route'), ('join', 'ui route'), ('invite', 'ui route'), ('invites', 'ui route'),
  ('discover', 'ui route'), ('discovery', 'ui route'), ('pricing', 'ui route'), ('waitlist', 'ui route'), ('beta', 'ui route'),
  ('assets', 'ui route'), ('static', 'ui route'), ('public', 'ui route'), ('favicon.ico', 'ui route'),
  ('robots.txt', 'ui route'), ('sitemap.xml', 'ui route'), ('manifest.webmanifest', 'ui route'), ('.well-known', 'ui route'),
  ('index.html', 'ui route'), ('studio', 'ui route'), ('hubs', 'ui route'), ('hub', 'ui route'), ('explore', 'ui route'),
  ('search', 'ui route'), ('new', 'ui route'), ('create', 'ui route'), ('settings', 'ui route'), ('account', 'ui route'),
  ('billing', 'ui route'), ('notifications', 'ui route'), ('admin', 'ui route'), ('dashboard', 'ui route'),
  ('campaign', 'ui route'), ('survey', 'ui route'), ('surveys', 'ui route'), ('results', 'ui route'), ('reports', 'ui route'),
  ('members', 'ui route'), ('roles', 'ui route'), ('shop', 'ui route'), ('leaderboard', 'ui route'), ('newsroom', 'ui route'),
  ('comments', 'ui route'), ('pages', 'ui route'), ('lunchvoice', 'ui route'), ('kpnsolute', 'ui route'),
  ('kpnidentity', 'ui route'), ('kpn', 'ui route'), ('www', 'ui route'), ('app', 'ui route'), ('status', 'ui route'),
  ('docs', 'ui route'), ('help', 'ui route'), ('support', 'ui route'), ('about', 'ui route'), ('terms', 'ui route'),
  ('privacy', 'ui route'), ('blog', 'ui route'), ('legal', 'ui route'), ('security', 'ui route'), ('contact', 'ui route'),
  ('whitelist', 'launch route'), ('s', 'launch route'), ('brand', 'launch route'), ('c', 'launch route'),
  ('j', 'launch route'), ('licenses', 'launch route'), ('__gallery', 'launch route'),
  ('how-it-works', 'launch route'), ('use-cases', 'launch route'), ('quick', 'launch route'),
  ('quick-surveys', 'launch route'), ('q', 'launch route'), ('builder', 'launch route'), ('news', 'launch route'),
  ('p', 'launch route'), ('reservation', 'launch route'), ('reservations', 'launch route'), ('signup', 'launch route'),
  ('checkout', 'launch route'), ('webhooks', 'launch route')
-- No customer names are ever reserved.
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- API: new operations
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_plan_limits() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_plan_limits(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_waitlist_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_waitlist_status(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_waitlist_join(p_contact_email text default null, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_waitlist_join(p_contact_email, p_note); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_report_abuse(p_join_code text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_report_abuse(p_join_code, p_reason); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_campaign_block(p_campaign uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_campaign_block(p_campaign, p_reason, true); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_admin_campaign_unblock(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_campaign_block(p_campaign, null, false); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_quick_survey_create(p_title text, p_access text default 'link', p_anonymity text default 'anonymous',
                                              p_guests boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_quick_survey_create(p_title, p_access, p_anonymity, p_guests); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_quick_survey_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_quick_survey_list(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_invite_create(p_campaign uuid, p_max_uses int default null, p_expires_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_invite_create(p_campaign, p_max_uses, p_expires_at); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_invite_list(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_campaign_invite_list(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_invite_revoke(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_invite_revoke(p_token); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_invite_redeem(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_invite_redeem(p_token); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- API: existing wrappers gain the premium and personal-space guards (bodies unchanged)
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv_api.lv_role_create(p_hub uuid, p_name text, p_icon text default null,
                                                 p_capabilities text[] default null, p_groups text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard(p_hub, false); return lv.api_role_create(p_hub, p_name, p_icon, p_capabilities, p_groups); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_role_update(p_role uuid, p_name text default null, p_icon text default null,
                                                 p_capabilities text[] default null, p_groups text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard((select r.hub_id from lv.roles r where r.id = p_role), false); return lv.api_role_update(p_role, p_name, p_icon, p_capabilities, p_groups); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_member_role_assign(p_membership uuid, p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard((select m.hub_id from lv.hub_memberships m where m.id = p_membership), false); return lv.api_member_role_assign(p_membership, p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_invite_create(p_hub uuid, p_max_uses int default null, p_expires_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard(p_hub, false); return lv.api_invite_create(p_hub, p_max_uses, p_expires_at); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Hub-scoped housekeeping refuses personal spaces (bodies unchanged).
create or replace function lv_api.lv_hub_join(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_hub_join(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_member_leave(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_member_leave(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_member_admit(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community((select m.hub_id from lv.hub_memberships m where m.id = p_membership)); return lv.api_member_admit(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_member_reject(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community((select m.hub_id from lv.hub_memberships m where m.id = p_membership)); return lv.api_member_reject(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_member_remove(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community((select m.hub_id from lv.hub_memberships m where m.id = p_membership)); return lv.api_member_remove(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_member_role_unassign(p_membership uuid, p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community((select m.hub_id from lv.hub_memberships m where m.id = p_membership)); return lv.api_member_role_unassign(p_membership, p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_role_delete(p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community((select r.hub_id from lv.roles r where r.id = p_role)); return lv.api_role_delete(p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_role_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_role_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_invite_revoke(p_invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community((select i.hub_id from lv.hub_invites i where i.id = p_invite)); return lv.api_invite_revoke(p_invite); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- 000007 defined these two directly in lv_api; move the bodies to lv.api_* and wrap them.
alter function lv_api.lv_member_list(uuid) set schema lv;
alter function lv.lv_member_list(uuid) rename to api_member_list;
alter function lv_api.lv_invite_list(uuid) set schema lv;
alter function lv.lv_invite_list(uuid) rename to api_invite_list;

create function lv_api.lv_member_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_member_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_invite_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_invite_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Quick Surveys are created only through lv_quick_survey_create.
create or replace function lv_api.lv_campaign_create(p_hub uuid, p_title text, p_mode text, p_anonymity text default 'anonymous')
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if lv.hub_kind(p_hub) = 'personal' and lv.membership_of(lv.current_account_id(), p_hub) is not null then
    return lv.err('lv_not_available', 'Use lv_quick_survey_create for your personal space.');
  end if;
  return lv.api_campaign_create(p_hub, p_title, p_mode, p_anonymity);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- In the personal space, the question count and kinds follow the free family.
create function lv.quick_question_guard(p_campaign uuid, p_kind text, p_adding boolean) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  v_limit jsonb;
  v_used int;
  v_kinds jsonb;
begin
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.hub_kind(v_hub) <> 'personal' or lv.membership_of(lv.current_account_id(), v_hub) is null then return; end if;
  v_kinds := lv.plan_limit('free', 'quick.kinds');
  if p_kind is not null and (v_kinds is null or not (v_kinds ? p_kind)) then
    perform lv.fail('lv_invalid_input', 'Quick Surveys support rating, single choice, multi choice, yes/no and text questions.');
  end if;
  if p_adding then
    v_limit := lv.plan_limit('free', 'quick.max_questions');
    select count(*) into v_used from lv.campaign_questions q where q.campaign_id = p_campaign;
    if v_limit is null or v_used >= (v_limit)::int then
      perform lv.fail('lv_limit_reached', 'A Quick Survey can have at most ' || coalesce(v_limit::text, '0') || ' questions.',
                      jsonb_build_object('limit', (v_limit)::int, 'used', v_used));
    end if;
  end if;
end;
$$;

create or replace function lv_api.lv_campaign_question_add(p_campaign uuid, p_position int, p_kind text, p_prompt text, p_config jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.quick_question_guard(p_campaign, p_kind, true); return lv.api_campaign_question_add(p_campaign, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_campaign_question_update(p_question uuid, p_position int default null, p_kind text default null,
                                                              p_prompt text default null, p_config jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.quick_question_guard((select q.campaign_id from lv.campaign_questions q where q.id = p_question), p_kind, false); return lv.api_campaign_question_update(p_question, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- A Quick Survey stays a survey, and an invite-only Campaign never admits guests.
create or replace function lv_api.lv_campaign_update(p_campaign uuid, p_title text default null, p_mode text default null,
                                                     p_anonymity text default null, p_opens_at timestamptz default null,
                                                     p_closes_at timestamptz default null, p_clear_schedule boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_mode is not null and p_mode <> 'survey'
     and lv.hub_kind((select c.hub_id from lv.campaigns c where c.id = p_campaign)) = 'personal' then
    return lv.err('lv_invalid_input', 'A Quick Survey is always a survey.');
  end if;
  return lv.api_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create or replace function lv_api.lv_campaign_set_participation(p_campaign uuid, p_audience text default null,
                                                                p_guest_limit int default null, p_clear_guest_limit boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_audience = 'members_and_guests' and (select c.access from lv.campaigns c where c.id = p_campaign) = 'invite' then
    return lv.err('lv_invalid_input', 'An invite-only Campaign cannot accept guests.');
  end if;
  return lv.api_campaign_set_participation(p_campaign, p_audience, p_guest_limit, p_clear_guest_limit);
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Join codes from the CSPRNG (LC-10); anonymous participation times coarsened to the day (LC-09)
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.new_join_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 symbols, no ambiguous characters
  v_bytes bytea := lv.random_bytes(6);
  v_out text := '';
  i int;
begin
  for i in 0..5 loop
    v_out := v_out || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;
  return v_out;
end;
$$;

create function lv.coarsen_participation_time() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from lv.campaigns c where c.id = new.campaign_id and c.anonymity = 'anonymous') then
    new.created_at := date_trunc('day', new.created_at);
  end if;
  return new;
end;
$$;
create trigger participation_coarsen_time before insert on lv.participation
  for each row execute function lv.coarsen_participation_time();

-- ---------------------------------------------------------------------------------------------------------
-- RLS on every lv table (LC-29). No policies: only the definer functions, owned by the table owner, read them.
-- ---------------------------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'lv' and c.relkind = 'r' loop
    execute format('alter table lv.%I enable row level security', r.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Grants (LC-05). The blanket "grant execute on all functions in schema lv_api to public" of 000006-000013 is
-- withdrawn. Every lv_api function is granted to authenticated; anon gets only the signed-out surface. Later
-- migrations grant each new function explicitly and never to public.
-- ---------------------------------------------------------------------------------------------------------
revoke execute on all functions in schema lv_api from public;
do $$
declare r record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema lv_api from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on all functions in schema lv_api to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'lv_api'
                and p.proname in ('lv_hub_get', 'lv_guest_campaign_get', 'lv_guest_submit', 'lv_capability_catalog',
                                  'lv_plan_limits', 'lv_waitlist_status', 'lv_report_abuse') loop
      execute format('grant execute on function %s to anon', r.sig);
    end loop;
  end if;
end $$;

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
