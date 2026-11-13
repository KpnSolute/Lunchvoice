-- 000045: a Quick Survey can be deleted, with its results (audit P8, founder checklist 2026-11-13).
--
-- 1. lv_quick_survey_delete(p_campaign): the creator deletes one Quick Survey from their personal space, in any state
--    (draft, scheduled, open, paused, closed, archived). Everything that belongs to it goes in the same transaction:
--    questions, submissions and answers, participation receipts, guest participation, invites and eligibility,
--    released aggregates, points and integration rows (all ON DELETE CASCADE from lv.campaigns). The analytics query
--    log keeps its rows with campaign_id set to null (000005), so no answer content survives. One audit event
--    ('quick_survey.deleted') records that it happened, with no title or content.
--    Refused: anything that is not a Quick Survey (Hub Campaigns are archived, not deleted), a survey that is not the
--    caller's, and a survey LunchVoice staff blocked or that has an open abuse report (so moderation evidence is never
--    destroyed by the person being reported). Unknown and not-yours answer the same lv_not_found.
-- 2. Cascade fix (also repairs Hub, personal space and account deletion): 000027 rewrote
--    lv.freeze_questions_after_draft without 000015's deletion bypass, so a cascade from a deleted Campaign into its
--    questions raised lv_locked whenever the Campaign had been published. During a cascade the parent Campaign row is
--    already gone; the trigger now lets a question go when its Campaign no longer exists. Direct edits and deletes of
--    questions on a live Campaign are refused exactly as before.
-- Rollback: supabase/rollbacks/000045_v2_survey_delete.down.sql.
begin;

-- ---------------------------------------------------------------- 2. cascade fix
create or replace function lv.freeze_questions_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_campaign uuid;
begin
  v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  select c.status into v_status from lv.campaigns c where c.id = v_campaign;
  -- The Campaign itself is being deleted (a cascade): its questions go with it.
  if tg_op = 'DELETE' and v_status is null then return old; end if;
  if v_status is distinct from 'draft' and not (v_status = 'paused' and not lv.campaign_has_responses(v_campaign)) then
    raise exception 'lv_locked: questions cannot change once a Campaign has answers or has been closed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------- 1. delete a Quick Survey
create function lv.api_quick_survey_delete(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  select x.id, x.hub_id, x.blocked_at into c
    from lv.campaigns x join lv.hubs h on h.id = x.hub_id
   where x.id = p_campaign and h.kind = 'personal' and h.owner_account_id = v_account
   for update of x;
  if c.id is null then return lv.err('lv_not_found', 'No such survey.'); end if;
  if c.blocked_at is not null
     or exists (select 1 from lv.abuse_reports r where r.campaign_id = c.id and r.status = 'open') then
    return lv.err('lv_locked', 'LunchVoice staff are reviewing this survey, so it can’t be deleted right now. Contact support.');
  end if;
  -- answers -> questions is ON DELETE RESTRICT, so the answers go first; everything else cascades.
  delete from lv.answers a using lv.submissions s where s.id = a.submission_id and s.campaign_id = c.id;
  delete from lv.campaigns where id = c.id;
  perform lv.audit(v_account, c.hub_id, 'quick_survey.deleted', c.id::text);
  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

create function lv_api.lv_quick_survey_delete(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_quick_survey_delete(p_campaign); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Grants: explicit, never PUBLIC (LC-05). Signed-in callers only.
revoke all on function lv.api_quick_survey_delete(uuid) from public;
revoke all on function lv_api.lv_quick_survey_delete(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.api_quick_survey_delete(uuid) from anon';
    execute 'revoke all on function lv_api.lv_quick_survey_delete(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.api_quick_survey_delete(uuid) from authenticated';
    execute 'grant execute on function lv_api.lv_quick_survey_delete(uuid) to authenticated';
  end if;
end $$;

commit;
