-- Rollback for 20261024000400_v2_participation_receipts.sql. NOT a migration: never applied automatically.
-- Run deliberately, in one transaction, BEFORE rolling back migrations 3, 2 and 1.
--
-- Effect: DELETES every submitted answer, receipt data in the participation ledger columns (the ledger rows themselves
-- remain, because the gate reads them), guest grants and the reward policy key; restores the migration-3 activation
-- function (which no longer pins a published revision) and removes the question freeze. Export lv_private.campaign_answers,
-- campaign_answer_values and campaign_participation first if any of it matters. No legacy table is touched.

begin;

drop function if exists public.lv_submit_response(uuid, jsonb, uuid);
drop function if exists public.lv_my_receipts();
drop function if exists public.lv_campaign_resolve(text);

alter table lv_private.campaign_participation drop constraint if exists campaign_participation_response_id_fkey;
drop table if exists lv_private.campaign_answer_values;
drop table if exists lv_private.campaign_answers;
drop table if exists lv_private.campaign_guest_grants;

drop index if exists lv_private.campaign_participation_receipt_idx;
alter table lv_private.campaign_participation
  drop column if exists audience,
  drop column if exists receipt_id,
  drop column if exists idempotency_key,
  drop column if exists question_revision,
  drop column if exists response_id,
  drop column if exists reward_state,
  drop column if exists points;

drop trigger if exists campaign_participation_link on lv_private.campaign_participation;
drop trigger if exists campaign_questions_frozen on lv_private.campaign_questions;
drop trigger if exists campaigns_revision_frozen on lv_private.campaigns;
alter table lv_private.campaigns drop column if exists published_revision;
delete from lv_private.policy where key = 'participation.reward';

-- Migration-3 activation function restored.
create or replace function lv_private.activate_campaign(p_campaign uuid, p_actor uuid, p_key uuid, p_via text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; c record; act record; v_checks jsonb; v_result jsonb; v_was_closed boolean;
begin
  select x.hub_id into v_hub from lv_private.campaigns x where x.id = p_campaign;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  -- Hub-level lock: every activation, reopening and expiry sweep for this Hub is serialized.
  perform 1 from lv_private.hubs h where h.id = v_hub for update;
  update lv_private.campaigns x set state = 'expired'
  where x.hub_id = v_hub and x.state in ('active', 'scheduled') and x.closes_at is not null and x.closes_at <= now();
  select * into c from lv_private.campaigns x where x.id = p_campaign for update;

  select * into act from lv_private.campaign_activations a where a.campaign_id = p_campaign and a.idempotency_key = p_key;
  if found then
    if act.actor_account_id is distinct from p_actor then
      return lv_private.fail('lv_conflict', 'That idempotency key belongs to another request.');
    end if;
    return lv_private.ok(jsonb_set(act.result, '{replay}', 'true'::jsonb));
  end if;

  v_checks := lv_private.activation_checks(p_campaign);
  if jsonb_array_length(v_checks) > 0 then
    update lv_private.campaigns x set last_activation_error = v_checks->0->>'code', last_activation_attempt_at = now() where x.id = p_campaign;
    return lv_private.fail(v_checks->0->>'code', v_checks->0->>'message', v_checks->0->'details');
  end if;

  v_was_closed := c.state = 'closed';
  update lv_private.campaigns x set
    state = 'active',
    activated_at = coalesce(x.activated_at, now()),
    closed_at = null,
    reopened_count = x.reopened_count + case when v_was_closed then 1 else 0 end,
    last_activation_error = null,
    last_activation_attempt_at = now()
  where x.id = p_campaign
  returning jsonb_build_object('campaign_id', x.id, 'state', 'active', 'activated_at', x.activated_at, 'expires_at', x.closes_at, 'replay', false)
  into v_result;
  insert into lv_private.campaign_activations (campaign_id, idempotency_key, actor_account_id, via, result)
  values (p_campaign, p_key, p_actor, case when p_via = 'manual' and v_was_closed then 'reopen' else p_via end, v_result);
  return lv_private.ok(v_result);
end;
$$;

drop function if exists lv_private.questions_frozen_after_draft();
drop function if exists lv_private.published_revision_frozen();
drop function if exists lv_private.check_answers();
drop function if exists lv_private.check_participation_link();
drop function if exists lv_private.validate_answers(uuid, jsonb);
drop function if exists lv_private.receipt_json(uuid, boolean);
drop function if exists lv_private.submit_core(uuid, uuid, text, jsonb, uuid);
drop function if exists lv_private.submit_guest(uuid, jsonb, uuid);
drop function if exists lv_private.policy_ok_reward();

commit;
