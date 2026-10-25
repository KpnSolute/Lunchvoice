-- LunchVoice v2 foundation 9/N: beta owner applications, platform approval and self-service Hub creation.
--
-- DEPENDS ON migrations 1-8. NOT APPLIED TO PRODUCTION. Creates no Hub, no Owner and no grant by itself.
--
-- The flow (identical for every beta Hub, LionCafe included; no seeded person, no assigned Owner, no email allow-list):
--   1. A person signs in (migration 8) and calls lv_beta_apply with a VERIFIED email.
--   2. A platform administrator calls lv_beta_decide. Nobody can decide their own application.
--   3. The approved applicant calls lv_hub_create. ONE transaction creates the Hub (with its own slug and name), the
--      Owner's accepted membership, the Owner designation and the beta entitlement grant, and consumes the approval.
--      Either everything exists afterwards or nothing does.
-- Beta is distinct from the public waitlist: nothing here reads or writes the waitlist.
--
-- Decisions NOT invented here (policy NULL = undecided = fail closed, answering lv_policy_undecided):
--   * beta.terms  {"months": 3, "plan_equivalent": "starter"|"team"}: the founder confirmed "three free months with full
--     feature access"; WHICH limits "full access" means (D-06/D-07) and when the three months start are not decided, so
--     the grant cannot be created until they are. The grant starts at Hub creation and ends months later.
--   * slug.reserved: list of slugs that nobody may claim (D-09). Format is enforced by the database regardless.
-- Confirmed and enforced: at most 50 beta Hub owners (policy beta.cap = 50), counted under a lock so concurrent
-- creations cannot exceed it.

begin;

insert into lv_private.policy (key, value, note) values
  ('beta.cap', '50'::jsonb, 'Maximum number of beta Hubs (one per approved owner). Founder-confirmed: 50.'),
  ('beta.terms', null, 'Beta grant terms. {"months": positive int, "plan_equivalent": "starter"|"team"}. Undecided (D-06/D-07): NULL makes lv_hub_create fail closed.'),
  ('slug.reserved', null, 'Slugs nobody may claim. JSON array of lower-case slugs, may be empty. Undecided (D-09): NULL makes lv_hub_create fail closed.')
on conflict (key) do nothing;

-- A beta grant is a grant like any other; it only needs its own source.
alter table lv_private.entitlement_grants drop constraint if exists entitlement_grants_source_check;
alter table lv_private.entitlement_grants add constraint entitlement_grants_source_check
  check (source in ('subscription', 'seasonal', 'manual', 'synthetic', 'beta'));

create table lv_private.beta_applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references lv_private.accounts (id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'revoked')),
  contact_email text not null check (length(btrim(contact_email)) > 3),
  note text check (note is null or length(note) <= 500),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references lv_private.accounts (id) on delete restrict,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  hub_id uuid references lv_private.hubs (id) on delete restrict,
  check ((status = 'submitted') = (decided_at is null)),
  check (hub_id is null or status = 'approved'),
  check (decided_by is null or decided_by <> account_id)
);
-- One open application per person; an approval that has not yet produced a Hub stays open.
create unique index beta_applications_open_idx on lv_private.beta_applications (account_id) where status in ('submitted', 'approved');
-- One Hub per approval, and a Hub is created by at most one approval.
create unique index beta_applications_hub_idx on lv_private.beta_applications (hub_id) where hub_id is not null;

create table lv_private.beta_application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null,
  actor_account_id uuid,
  event text not null,
  at timestamptz not null default now()
);
alter table lv_private.beta_applications enable row level security;
alter table lv_private.beta_application_events enable row level security;

create function lv_private.beta_terms() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  select p.value into v from lv_private.policy p where p.key = 'beta.terms';
  if v is not null and jsonb_typeof(v) = 'object' and (v->>'months') ~ '^[1-9][0-9]?$' and (v->>'plan_equivalent') in ('starter', 'team') then
    return v;
  end if;
  return null;
end;
$$;

create function lv_private.beta_cap() returns int
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  select p.value into v from lv_private.policy p where p.key = 'beta.cap';
  if v is not null and jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^[0-9]+$' then return (v #>> '{}')::int; end if;
  return null;
end;
$$;

create function lv_private.application_json(a lv_private.beta_applications, p_admin boolean) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', a.id, 'status', a.status, 'submitted_at', a.submitted_at, 'decided_at', a.decided_at,
    'hub_id', a.hub_id, 'decision_note', a.decision_note)
    || case when p_admin then jsonb_build_object('account_id', a.account_id, 'contact_email', a.contact_email, 'note', a.note,
         'display_name', (select x.display_name from lv_private.accounts x where x.id = a.account_id)) else '{}'::jsonb end
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Apply, read own, list (platform admins), decide
-- ---------------------------------------------------------------------------------------------------------
create function public.lv_beta_apply(note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_acc uuid; v_ci jsonb; v_email text; v_note text := lv_private.clean_text(note, 500); a lv_private.beta_applications;
begin
  v_acc := lv_private.current_account_id();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if note is not null and v_note is null then return lv_private.fail('lv_invalid_input', 'Check the note.'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_beta_apply:' || v_acc::text, 0));
  select * into a from lv_private.beta_applications x where x.account_id = v_acc and x.status in ('submitted', 'approved');
  if found then return lv_private.ok(lv_private.application_json(a, false) || jsonb_build_object('already_open', true)); end if;
  v_ci := lv_private.caller_identity();
  v_email := nullif(btrim(v_ci->>'email'), '');
  if v_email is null or not coalesce((v_ci->>'email_verified')::boolean, false) then
    return lv_private.fail('lv_email_unverified', 'Verify your email address to apply.');
  end if;
  insert into lv_private.beta_applications (account_id, contact_email, note) values (v_acc, lower(v_email), v_note) returning * into a;
  insert into lv_private.beta_application_events (application_id, actor_account_id, event) values (a.id, v_acc, 'submitted');
  return lv_private.ok(lv_private.application_json(a, false) || jsonb_build_object('already_open', false));
end;
$$;

create function public.lv_beta_my_application() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_acc uuid; a lv_private.beta_applications;
begin
  v_acc := lv_private.current_account_id();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select * into a from lv_private.beta_applications x where x.account_id = v_acc order by x.submitted_at desc limit 1;
  if not found then return lv_private.ok(jsonb_build_object('application', null)); end if;
  return lv_private.ok(jsonb_build_object('application', lv_private.application_json(a, false)));
end;
$$;

create function public.lv_beta_applications_list(status text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_acc uuid;
begin
  v_acc := lv_private.current_account_id();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if not lv_private.is_platform_admin(v_acc) then return lv_private.fail('lv_forbidden', 'You do not have permission to do that.'); end if;
  if status is not null and status not in ('submitted', 'approved', 'rejected', 'revoked') then return lv_private.fail('lv_invalid_input', 'Check the status.'); end if;
  return lv_private.ok(jsonb_build_object('applications', coalesce((
    select jsonb_agg(lv_private.application_json(x, true) order by x.submitted_at, x.id)
    from lv_private.beta_applications x where lv_beta_applications_list.status is null or x.status = lv_beta_applications_list.status), '[]'::jsonb)));
end;
$$;

create function public.lv_beta_decide(application_id uuid, decision text, note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_acc uuid; a lv_private.beta_applications; v_note text := lv_private.clean_text(note, 500); v_to text;
begin
  v_acc := lv_private.current_account_id();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if not lv_private.is_platform_admin(v_acc) then return lv_private.fail('lv_forbidden', 'You do not have permission to do that.'); end if;
  if application_id is null or decision not in ('approve', 'reject', 'revoke') or (note is not null and v_note is null) then
    return lv_private.fail('lv_invalid_input', 'Check the decision.');
  end if;
  select * into a from lv_private.beta_applications x where x.id = lv_beta_decide.application_id for update;
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  if a.account_id = v_acc then return lv_private.fail('lv_forbidden', 'You cannot decide your own application.'); end if;
  v_to := case decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end;
  if a.status = v_to then return lv_private.ok(lv_private.application_json(a, true) || jsonb_build_object('changed', false)); end if;
  if (decision in ('approve', 'reject') and a.status <> 'submitted')
     or (decision = 'revoke' and (a.status <> 'approved' or a.hub_id is not null)) then
    return lv_private.fail('lv_conflict', 'That decision cannot be applied in the current state.', jsonb_build_object('status', a.status));
  end if;
  update lv_private.beta_applications x set status = v_to, decided_at = now(), decided_by = v_acc, decision_note = v_note where x.id = a.id returning * into a;
  insert into lv_private.beta_application_events (application_id, actor_account_id, event) values (a.id, v_acc, v_to);
  return lv_private.ok(lv_private.application_json(a, true) || jsonb_build_object('changed', true));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Self-service Hub creation: one transaction
-- ---------------------------------------------------------------------------------------------------------
create function public.lv_hub_create(name text, slug text, visibility text default 'private', membership_mode text default 'invite_only') returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_acc uuid; v_name text := lv_private.clean_text(name, 80); v_slug text := lower(btrim(slug)); a lv_private.beta_applications;
  v_terms jsonb; v_reserved jsonb; v_cap int; v_hub uuid := gen_random_uuid(); v_missing text[] := '{}';
begin
  v_acc := lv_private.current_account_id();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if v_name is null or v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     or visibility not in ('public', 'private') or membership_mode not in ('open', 'approval', 'invite_only') then
    return lv_private.fail('lv_invalid_input', 'Check the Hub details.');
  end if;
  -- Serialize creations: the cap and slug are checked and consumed under one lock.
  perform pg_advisory_xact_lock(hashtextextended('lv_hub_create', 0));
  select * into a from lv_private.beta_applications x where x.account_id = v_acc and x.status = 'approved' for update;
  if not found then return lv_private.fail('lv_forbidden', 'An approved beta application is required.'); end if;
  if a.hub_id is not null then return lv_private.fail('lv_conflict', 'Your approval has already been used to create a Hub.', jsonb_build_object('hub_id', a.hub_id)); end if;
  v_terms := lv_private.beta_terms();
  select p.value into v_reserved from lv_private.policy p where p.key = 'slug.reserved';
  v_cap := lv_private.beta_cap();
  if v_terms is null then v_missing := array_append(v_missing, 'beta.terms'); end if;
  if v_reserved is null or jsonb_typeof(v_reserved) <> 'array' then v_missing := array_append(v_missing, 'slug.reserved'); end if;
  if v_cap is null then v_missing := array_append(v_missing, 'beta.cap'); end if;
  if array_length(v_missing, 1) > 0 then
    return lv_private.fail('lv_policy_undecided', 'Hub creation is not open yet.', jsonb_build_object('missing', to_jsonb(v_missing)));
  end if;
  if v_reserved ? v_slug then return lv_private.fail('lv_slug_unavailable', 'That address is not available.'); end if;
  if exists (select 1 from lv_private.hubs h where lower(h.slug) = v_slug) then return lv_private.fail('lv_slug_unavailable', 'That address is not available.'); end if;
  if (select count(*) from lv_private.beta_applications x where x.hub_id is not null) >= v_cap then
    return lv_private.fail('lv_quota_exceeded', 'The beta is full.', jsonb_build_object('cap', v_cap));
  end if;

  insert into lv_private.hubs (id, slug, display_name, visibility, membership_mode) values (v_hub, v_slug, v_name, visibility, membership_mode);
  insert into lv_private.hub_memberships (hub_id, account_id, status, source, joined_at) values (v_hub, v_acc, 'accepted', 'v2', now());
  update lv_private.hubs h set owner_account_id = v_acc where h.id = v_hub;
  insert into lv_private.entitlement_grants (hub_id, plan_code, source, valid_from, valid_to)
    values (v_hub, v_terms->>'plan_equivalent', 'beta', now(), now() + make_interval(months => (v_terms->>'months')::int));
  update lv_private.beta_applications x set hub_id = v_hub where x.id = a.id;
  insert into lv_private.beta_application_events (application_id, actor_account_id, event) values (a.id, v_acc, 'hub_created');
  return lv_private.ok(jsonb_build_object('hub_id', v_hub, 'slug', v_slug, 'name', v_name, 'visibility', visibility,
    'membership_mode', membership_mode, 'entitlements', lv_private.entitlement_summary(v_hub)));
end;
$$;

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('lv_beta_apply', 'lv_beta_my_application', 'lv_beta_applications_list', 'lv_beta_decide', 'lv_hub_create')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;

commit;
