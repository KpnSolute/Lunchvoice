-- LunchVoice v2 canonical baseline 4/6: participation, submissions and the anonymity boundary.
--
-- Ported from prototype 20261024000400 (KEEP core). The anonymity property is the reason this migration
-- matters, and it is preserved exactly:
--
--   * lv.participation  records WHO took part (account_id). It must, to block duplicates and grant rewards.
--   * lv.submissions    records WHAT was answered. For an anonymous Campaign it carries NO account reference.
--   * lv.answers        hang off a submission only.
--   * For an anonymous Campaign the participation row stores submission_id = NULL.
--
-- So for an anonymous Campaign there is NO STORED JOIN PATH in either direction, and two triggers make that
-- true even if a future code path tries otherwise. Guest participation is NOT ported (D-03 undecided).

begin;

create table lv.participation (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  receipt_id uuid not null default gen_random_uuid(),
  submission_id uuid,                       -- NULL for anonymous Campaigns (enforced below)
  campaign_revision int not null,
  reward_state text not null default 'not_applicable'
    check (reward_state in ('not_applicable', 'unset', 'recorded')),
  points int check (points is null or points >= 0),
  created_at timestamptz not null default now(),
  -- One participation per person per Campaign: this is the duplicate protection.
  constraint participation_once unique (campaign_id, account_id),
  constraint participation_receipt_key unique (receipt_id)
);
create index participation_campaign_idx on lv.participation (campaign_id);
create index participation_account_idx on lv.participation (account_id);

create table lv.submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  campaign_revision int not null,
  -- For an identified Campaign this is the respondent. For an anonymous one it is NULL (enforced by trigger).
  account_id uuid references lv.accounts (id) on delete set null,
  submitted_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index submissions_campaign_idx on lv.submissions (campaign_id);

create table lv.answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references lv.submissions (id) on delete cascade,
  question_id uuid not null references lv.campaign_questions (id) on delete restrict,
  value jsonb not null,
  created_at timestamptz not null default now(),
  constraint answers_once_per_question unique (submission_id, question_id)
);
create index answers_question_idx on lv.answers (question_id);

alter table lv.participation
  add constraint participation_submission_fkey
  foreign key (submission_id) references lv.submissions (id) on delete set null;

-- ---------------------------------------------------------------------------------------------------------
-- The anonymity boundary, enforced in the database
-- ---------------------------------------------------------------------------------------------------------

-- A submission for an anonymous Campaign must not name an account.
create function lv.check_submission_anonymity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_anonymity text;
  v_hub uuid;
begin
  select c.anonymity, c.hub_id into v_anonymity, v_hub from lv.campaigns c where c.id = new.campaign_id;
  if v_hub is null then
    raise exception 'lv_not_found: no such Campaign' using errcode = '23503';
  end if;
  if v_hub <> new.hub_id then
    raise exception 'lv_hub_mismatch: a submission must belong to the Campaign''s Hub' using errcode = '23503';
  end if;
  if v_anonymity = 'anonymous' and new.account_id is not null then
    raise exception 'lv_anonymity_violation: an anonymous Campaign''s submission cannot name an account' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger submissions_check_anonymity before insert or update on lv.submissions
  for each row execute function lv.check_submission_anonymity();

-- A participation row for an anonymous Campaign must not reference its submission.
create function lv.check_participation_link() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_anonymity text;
begin
  select c.anonymity into v_anonymity from lv.campaigns c where c.id = new.campaign_id;
  if v_anonymity = 'anonymous' and new.submission_id is not null then
    raise exception 'lv_anonymity_violation: an anonymous Campaign''s participation cannot reference its submission' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger participation_check_link before insert or update on lv.participation
  for each row execute function lv.check_participation_link();

-- ---------------------------------------------------------------------------------------------------------
-- Submission path
-- ---------------------------------------------------------------------------------------------------------
create function lv.validate_answers(p_campaign uuid, p_answers jsonb) returns text
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
      return 'missing answer for question ' || q.position;
    end if;

    if q.kind = 'rating' then
      if jsonb_typeof(v_val) <> 'number' then return 'rating must be a number'; end if;
      if (v_val)::numeric < 1 or (v_val)::numeric > 5 then return 'rating out of range'; end if;
    elsif q.kind in ('single_choice', 'multi_choice', 'yes_no', 'text') then
      if jsonb_typeof(v_val) = 'null' then return 'empty answer'; end if;
    end if;
    v_seen := v_seen + 1;
  end loop;

  if v_seen = 0 then return 'no questions'; end if;
  return null;
end;
$$;

-- The single submission path. Atomic: lifecycle, duplicate, validation, answers and participation are one
-- transaction, serialised per (campaign, account) so two simultaneous submits cannot both succeed.
create function lv.submit_response(p_campaign uuid, p_answers jsonb) returns jsonb
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

  if c.status <> 'active'
     or (c.opens_at is not null and c.opens_at > now())
     or (c.closes_at is not null and c.closes_at <= now()) then
    raise exception 'lv_closed: this Campaign is not accepting responses' using errcode = '42501';
  end if;

  if not exists (select 1 from lv.hub_memberships m
                  where m.hub_id = c.hub_id and m.account_id = v_account and m.status = 'accepted') then
    raise exception 'lv_forbidden: only accepted members of this Hub may respond' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_submit:' || p_campaign::text || ':' || v_account::text, 0));

  -- Idempotent: a repeat submission returns the existing receipt instead of creating a second one.
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

-- A person may see their own receipts, never their own answers back from a Hub-facing surface.
create function lv.my_receipts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return jsonb_build_array(); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'campaign_id', p.campaign_id,
      'receipt_id', p.receipt_id,
      'created_at', p.created_at))
      from lv.participation p where p.account_id = v_account
  ), jsonb_build_array());
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
