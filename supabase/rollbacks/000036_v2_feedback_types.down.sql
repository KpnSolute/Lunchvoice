-- Rollback for 000036_v2_feedback_types: Quick Surveys are created as surveys only and keep that rule on update.
-- Quick Surveys already created as a poll, rating or open feedback keep their (valid) mode; nothing is deleted.
begin;
drop function if exists lv_api.lv_quick_survey_create(text, text, text, boolean, text);
drop function if exists lv.api_quick_survey_create(text, text, text, boolean, text);

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
  perform pg_advisory_xact_lock(hashtextextended('lv_quick_create:' || v_account::text, 0));
  if (select count(*) from lv.campaigns c where c.hub_id = v_hub and c.created_at > now() - interval '1 hour')
     >= coalesce((lv.policy_json('quick.create_per_hour'))::int, 0) then
    return lv.err('lv_rate_limited', 'You have created many Quick Surveys in the last hour. Try again later.');
  end if;
  insert into lv.campaigns (hub_id, title, mode, anonymity, access, audience, created_by)
  values (v_hub, v_title, 'survey', coalesce(p_anonymity, 'anonymous'), v_access,
          case when v_access = 'link' and coalesce(p_guests, true) then 'members_and_guests' else 'members' end,
          v_account)
  returning id into v_id;
  perform lv.audit(v_account, v_hub, 'quick_survey.created', v_id::text);
  return jsonb_build_object('ok', true, 'campaign', lv.campaign_summary(v_id, true));
end;
$$;

create function lv_api.lv_quick_survey_create(p_title text, p_access text default 'link', p_anonymity text default 'anonymous',
                                              p_guests boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_quick_survey_create(p_title, p_access, p_anonymity, p_guests); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_campaign_update(p_campaign uuid, p_title text default null, p_mode text default null,
                                                     p_anonymity text default null, p_opens_at timestamptz default null,
                                                     p_closes_at timestamptz default null, p_clear_schedule boolean default false,
                                                     p_description text default null, p_access text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid := (select c.hub_id from lv.campaigns c where c.id = p_campaign);
  v_out jsonb;
begin
  if p_mode is not null and p_mode <> 'survey' and lv.hub_kind(v_hub) = 'personal' then
    return lv.err('lv_invalid_input', 'A Quick Survey is always a survey.');
  end if;
  if p_description is not null and length(btrim(p_description)) > 2000 then
    return lv.err('lv_invalid_input', 'Keep the description to 2000 characters.');
  end if;
  if p_access is not null and p_access not in ('link', 'invite') then
    return lv.err('lv_invalid_input', 'Access is link or invite.');
  end if;

  v_out := lv.api_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule);
  if not (v_out->>'ok')::boolean then return v_out; end if;

  if p_access is not null then
    if lv.hub_kind(v_hub) <> 'personal' then
      perform lv.fail('lv_invalid_input', 'Only a Quick Survey chooses link or invite access; Hub Campaigns are for members.');
    end if;
    update lv.campaigns
       set access = p_access,
           audience = case when p_access = 'invite' then 'members' else audience end
     where id = p_campaign;
  end if;
  if p_description is not null then
    update lv.campaigns set description = nullif(btrim(p_description), '') where id = p_campaign;
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

drop function if exists lv.quick_mode_allowed(text);
delete from lv.plan_limits where family = 'free' and key = 'quick.modes';

revoke all on function lv.api_quick_survey_create(text, text, text, boolean) from public;
revoke all on function lv_api.lv_quick_survey_create(text, text, text, boolean) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.api_quick_survey_create(text, text, text, boolean) from anon';
    execute 'revoke all on function lv_api.lv_quick_survey_create(text, text, text, boolean) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.api_quick_survey_create(text, text, text, boolean) from authenticated';
    execute 'grant execute on function lv_api.lv_quick_survey_create(text, text, text, boolean) to authenticated';
  end if;
end $$;
commit;
