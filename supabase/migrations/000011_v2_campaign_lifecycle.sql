-- LunchVoice v2 canonical 11: Campaign versions, draft editing and the full lifecycle (roadmap slice 8).
--
-- Lifecycle (master spec section 8): Draft -> Scheduled -> Active -> Paused/Closed -> Archived.
--
-- Stored status is one of draft, active, paused, closed, archived. "Scheduled" and "ended" are not stored:
-- they are an active Campaign before opens_at or after closes_at, reported by lv.campaign_phase(). This keeps
-- one source of truth for the response window (000004 already refuses submissions outside it), needs no
-- background job to flip states, and means a scheduled Campaign holds its active-Campaign slot from the moment
-- it is published, so it can never fail the cap later when it opens.
--
-- Publishing (draft -> active, through lv_campaign_activate or lv_campaign_schedule) writes an immutable
-- version: the question set, the participation settings and the limit in force. Questions are already frozen
-- after draft by 000003, so a published version can never drift from what respondents answered.
--
-- Pausing stops responses and frees the active slot; resuming must pass the cap again. Closing is final for
-- responses. Archiving hides a closed Campaign (or discards a draft) without deleting anything.

begin;

alter table lv.campaigns drop constraint campaigns_status_check;
alter table lv.campaigns add constraint campaigns_status_check
  check (status in ('draft', 'active', 'paused', 'closed', 'archived'));
alter table lv.campaigns add column paused_at timestamptz;
alter table lv.campaigns add column archived_at timestamptz;

-- ---------------------------------------------------------------------------------------------------------
-- Phase: what the Campaign is doing right now, derived from status and the window
-- ---------------------------------------------------------------------------------------------------------
create function lv.campaign_phase(p_status text, p_opens_at timestamptz, p_closes_at timestamptz) returns text
language sql stable set search_path = ''
as $$
  select case
    when p_status <> 'active' then p_status
    when p_opens_at is not null and p_opens_at > now() then 'scheduled'
    when p_closes_at is not null and p_closes_at <= now() then 'ended'
    else 'open' end
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Immutable published versions
-- ---------------------------------------------------------------------------------------------------------
create table lv.campaign_versions (
  campaign_id uuid not null references lv.campaigns (id) on delete cascade,
  version int not null check (version >= 1),
  published_at timestamptz not null default now(),
  published_by uuid references lv.accounts (id) on delete set null,
  settings jsonb not null,
  questions jsonb not null,
  primary key (campaign_id, version)
);

create function lv.forbid_version_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'lv_locked: a published Campaign version cannot be changed' using errcode = '42501';
end;
$$;
create trigger campaign_versions_immutable before update on lv.campaign_versions
  for each row execute function lv.forbid_version_update();

create function lv.snapshot_published_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'active' then
    insert into lv.campaign_versions (campaign_id, version, published_by, settings, questions)
    values (new.id, new.revision, lv.current_account_id(),
      (to_jsonb(new) - 'join_code' - 'status' - 'activated_at' - 'closed_at' - 'paused_at' - 'archived_at' - 'revision')
        || jsonb_build_object('entitlement', jsonb_build_object(
             'campaign.max_active_per_hub', lv.policy_json('campaign.max_active_per_hub'))),
      coalesce((select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                                    'prompt', q.prompt, 'config', q.config) order by q.position)
                  from lv.campaign_questions q where q.campaign_id = new.id), '[]'::jsonb));
  end if;
  return new;
end;
$$;
create trigger campaigns_snapshot_version after update of status on lv.campaigns
  for each row execute function lv.snapshot_published_version();

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
-- Load a Campaign for a manager. Raises (mapped by the wrapper) so a caller cannot forget the check.
create function lv.managed_campaign(p_campaign uuid, p_account uuid) returns lv.campaigns
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
begin
  select * into c from lv.campaigns x where x.id = p_campaign for update;
  if c.id is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(p_account, c.hub_id, 'campaign.manage');
  return c;
end;
$$;

create function lv.validate_window(p_opens_at timestamptz, p_closes_at timestamptz) returns text
language sql stable set search_path = ''
as $$
  select case
    when p_closes_at is not null and p_opens_at is not null and p_closes_at <= p_opens_at then 'The close time must be after the open time.'
    when p_closes_at is not null and p_closes_at <= now() then 'The close time must be in the future.'
    end
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Draft editing
-- ---------------------------------------------------------------------------------------------------------
-- NULL leaves a field unchanged. p_clear_schedule removes both window ends.
create function lv.api_campaign_update(p_campaign uuid, p_title text, p_mode text, p_anonymity text,
                                       p_opens_at timestamptz, p_closes_at timestamptz, p_clear_schedule boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_opens timestamptz;
  v_closes timestamptz;
  v_bad text;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status <> 'draft' then return lv.err('lv_locked', 'Only a draft can be edited. Published versions are immutable.'); end if;
  if p_title is not null and btrim(p_title) = '' then return lv.err('lv_invalid_input', 'A Campaign needs a title.'); end if;

  v_opens := case when coalesce(p_clear_schedule, false) then null else coalesce(p_opens_at, c.opens_at) end;
  v_closes := case when coalesce(p_clear_schedule, false) then null else coalesce(p_closes_at, c.closes_at) end;
  v_bad := lv.validate_window(v_opens, v_closes);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;

  update lv.campaigns
     set title = coalesce(btrim(p_title), title),
         mode = coalesce(p_mode, mode),
         anonymity = coalesce(p_anonymity, anonymity),
         opens_at = v_opens,
         closes_at = v_closes
   where id = c.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Questions: 000003 already refuses any change once the Campaign has left draft (lv_locked).
create function lv.api_campaign_question_update(p_question uuid, p_position int, p_kind text, p_prompt text, p_config jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_campaign uuid;
begin
  select q.campaign_id into v_campaign from lv.campaign_questions q where q.id = p_question;
  if v_campaign is null then return lv.err('lv_not_found', 'No such question.'); end if;
  perform lv.managed_campaign(v_campaign, v_account);
  if p_prompt is not null and btrim(p_prompt) = '' then return lv.err('lv_invalid_input', 'A question needs a prompt.'); end if;
  update lv.campaign_questions
     set position = coalesce(p_position, position),
         kind = coalesce(p_kind, kind),
         prompt = coalesce(btrim(p_prompt), prompt),
         config = coalesce(p_config, config)
   where id = p_question;
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_campaign_question_remove(p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_campaign uuid;
begin
  select q.campaign_id into v_campaign from lv.campaign_questions q where q.id = p_question;
  if v_campaign is null then return lv.err('lv_not_found', 'No such question.'); end if;
  perform lv.managed_campaign(v_campaign, v_account);
  delete from lv.campaign_questions where id = p_question;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------------------------------------
-- Publish with a window. A future opens_at makes it Scheduled; it holds its slot from now.
create function lv.api_campaign_schedule(p_campaign uuid, p_opens_at timestamptz, p_closes_at timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_bad text;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status <> 'draft' then return lv.err('lv_lifecycle_invalid', 'Only a draft can be scheduled.'); end if;
  v_bad := lv.validate_window(p_opens_at, p_closes_at);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;
  update lv.campaigns set opens_at = p_opens_at, closes_at = p_closes_at where id = c.id;
  perform lv.activate_campaign(c.id);     -- the 000003 gate; raises lv_gate_blocked with reasons
  select * into c from lv.campaigns where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.scheduled', c.id::text,
                   jsonb_build_object('opens_at', c.opens_at, 'closes_at', c.closes_at));
  return jsonb_build_object('ok', true, 'status', c.status, 'phase', lv.campaign_phase(c.status, c.opens_at, c.closes_at),
                            'version', c.revision);
end;
$$;

create function lv.api_campaign_pause(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status = 'paused' then return jsonb_build_object('ok', true); end if;
  if c.status <> 'active' or lv.campaign_phase(c.status, c.opens_at, c.closes_at) = 'ended' then
    return lv.err('lv_lifecycle_invalid', 'Only a running or scheduled Campaign can be paused.');
  end if;
  update lv.campaigns set status = 'paused', paused_at = now() where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.paused', c.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Resuming takes an active slot again, so it passes the same cap as activation, under the same lock.
create function lv.api_campaign_resume(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_cap jsonb;
  v_active int;
  v_reasons jsonb := '[]'::jsonb;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status = 'active' then return jsonb_build_object('ok', true); end if;
  if c.status <> 'paused' then return lv.err('lv_lifecycle_invalid', 'Only a paused Campaign can be resumed.'); end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_activate:' || c.hub_id::text, 0));
  if c.closes_at is not null and c.closes_at <= now() then v_reasons := v_reasons || to_jsonb('already_closed'::text); end if;
  v_cap := lv.policy_json('campaign.max_active_per_hub');
  if v_cap is null then
    v_reasons := v_reasons || to_jsonb('limit_undefined'::text);
  else
    select count(*) into v_active from lv.campaigns x where x.hub_id = c.hub_id and x.status = 'active';
    if v_active >= (v_cap)::int then v_reasons := v_reasons || to_jsonb('limit_reached'::text); end if;
  end if;
  if jsonb_array_length(v_reasons) > 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_gate_blocked',
      'message', 'This Campaign cannot resume yet.', 'reasons', v_reasons));
  end if;

  update lv.campaigns set status = 'active', paused_at = null where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.resumed', c.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Close a running, scheduled or paused Campaign. Closing twice is harmless; a draft has nothing to close.
create or replace function lv.api_campaign_close(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status in ('closed', 'archived') then return jsonb_build_object('ok', true); end if;
  if c.status = 'draft' then return lv.err('lv_lifecycle_invalid', 'A draft has nothing to close. Archive it to discard it.'); end if;
  update lv.campaigns set status = 'closed', closed_at = coalesce(closed_at, now()), paused_at = null where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.closed', c.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Archive a closed Campaign, or discard a draft. Nothing is deleted.
create function lv.api_campaign_archive(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status = 'archived' then return jsonb_build_object('ok', true); end if;
  if c.status not in ('closed', 'draft') then
    return lv.err('lv_lifecycle_invalid', 'Close the Campaign before archiving it.');
  end if;
  update lv.campaigns set status = 'archived', archived_at = now() where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'campaign.archived', c.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_campaign_versions(p_campaign uuid) returns jsonb
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
    return lv.err('lv_forbidden', 'Viewing versions requires campaign.manage.');
  end if;
  return jsonb_build_object('ok', true, 'versions', coalesce((
    select jsonb_agg(jsonb_build_object('version', v.version, 'published_at', v.published_at,
                                        'settings', v.settings, 'questions', v.questions) order by v.version)
      from lv.campaign_versions v where v.campaign_id = p_campaign), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_campaign_update(p_campaign uuid, p_title text default null, p_mode text default null,
                                          p_anonymity text default null, p_opens_at timestamptz default null,
                                          p_closes_at timestamptz default null, p_clear_schedule boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_question_update(p_question uuid, p_position int default null, p_kind text default null,
                                                   p_prompt text default null, p_config jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_question_update(p_question, p_position, p_kind, p_prompt, p_config); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_question_remove(p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_question_remove(p_question); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_schedule(p_campaign uuid, p_opens_at timestamptz default null, p_closes_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_schedule(p_campaign, p_opens_at, p_closes_at); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_pause(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_pause(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_resume(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_resume(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_archive(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_archive(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_versions(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_campaign_versions(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

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
