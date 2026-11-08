-- 24: LunchVoice API keys, webhooks and the Discord bot (000024). Example Hub: Northside Running Club.
select set_config('t.file', '24_api_discord', false);
begin;
select t.trust_test_issuer();

-- Service-role caller (the Edge Functions run their database calls as service_role).
create function t.as_service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  set role service_role;
end $$;
create function t.api(p_hash text, p_op text, p_args jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$
begin
  perform t.as_service();
  return lv.api_key_call(p_hash, p_op, p_args);
end $$;
create function t.dc(p_cmd text, p_user text, p_opts jsonb default '{}'::jsonb, p_admin boolean default false,
                     p_guild text default '900000000000000001') returns jsonb language plpgsql as $$
begin
  perform t.as_service();
  return lv.discord_interaction(p_cmd, jsonb_build_object('guild_id', p_guild, 'guild_name', 'Northside Discord',
    'channel_id', '910000000000000001', 'user_id', p_user, 'username', 'runner' || right(p_user, 3), 'is_admin', p_admin,
    'options', p_opts));
end $$;
create function t.hash(p text) returns text language sql security definer as $$ select lv.sha256_hex(p) $$;
create function t.ans1(p_campaign uuid, p_question uuid, p_value jsonb) returns jsonb language sql as $$
  select lv_api.lv_submit_response(p_campaign, jsonb_build_array(jsonb_build_object('question_id', p_question, 'value', p_value)))
$$;
grant execute on function t.as_service(), t.api(text, text, jsonb), t.dc(text, text, jsonb, boolean, text), t.hash(text),
  t.ans1(uuid, uuid, jsonb) to public;

-- ---------------------------------------------------------------------------------------------- setup
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Starter owner'); select lv_api.lv_my_context();
select t.put('owner2', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'team');
select t.grant_credit(t.id('owner2'), 'starter');
select t.set_limit('campaigns.max_active', '50'::jsonb);
-- This suite issues many commands per minute; the rate-limit checks lower these again.
update lv.policy set value = '1000'::jsonb where key in ('discord.user_commands_per_minute', 'discord.guild_commands_per_minute');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('northside-running', 'Northside Running Club') ->> 'hub_id'));
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(n) || lv_api.lv_my_context()::text || lv_api.lv_invite_redeem(t.get('code'))::text from generate_series(3, 13) n;
select t.as_kpn(2);
select t.put('hub2', (lv_api.lv_hub_create('northside-walkers', 'Northside Walkers') ->> 'hub_id'));
select t.put('c_other', (lv_api.lv_campaign_create(t.id('hub2'), 'Other Hub poll', 'poll', 'identified') ->> 'campaign_id'));
select t.as_kpn(3);
select t.put('acc3', t.q($$select lv.current_account_id()::text$$));
select t.put('m3', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('acc3'))));
select t.check('setup: 12 accepted members in the Team Hub',
  t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid and status = 'accepted'$q$, t.get('hub'))) = '12');

-- ---------------------------------------------------------------------------------------------- capability, gates
select t.check('api.manage is a capability and the Owner role holds it',
  t.q($$select count(*)::text from lv.capabilities where capability = 'api.manage'$$) = '1'
  and t.q(format($q$select lv.has_capability(%L::uuid, %L::uuid, 'api.manage')::text$q$, t.get('owner'), t.get('hub'))) = 'true');
select t.as_kpn(2);
select t.check('Team only: a Starter Hub cannot create keys (lv_entitlement_required, team_hub)',
  t.code(lv_api.lv_api_key_create(t.id('hub2'), 'Starter key', array['campaigns:read'])) = 'lv_entitlement_required'
  and (lv_api.lv_api_key_create(t.id('hub2'), 'Starter key', array['campaigns:read']) #>> '{error,product}') = 'team_hub');
select t.as_kpn(3);
select t.check('a member without api.manage cannot list or create keys',
  t.code(lv_api.lv_api_keys_list(t.id('hub'))) = 'lv_forbidden'
  and t.code(lv_api.lv_api_key_create(t.id('hub'), 'Nope', array['campaigns:read'])) = 'lv_forbidden');
select t.as_anon();
select t.check('signed out: no access to the key functions',
  t.raises($$select lv_api.lv_api_key_create('00000000-0000-0000-0000-000000000000'::uuid, 'x', array['campaigns:read'])$$));

-- ---------------------------------------------------------------------------------------------- key creation and hashing
select t.as_kpn(1);
select t.check('unknown scopes are refused',
  t.code(lv_api.lv_api_key_create(t.id('hub'), 'Bad', array['campaigns:read', 'admin:all'])) = 'lv_invalid_input');
select t.put('k1', lv_api.lv_api_key_create(t.id('hub'), 'Results sync', array['campaigns:read', 'campaigns:write', 'results:read'])::text);
select t.put('s1', t.get('k1')::jsonb ->> 'secret');
select t.put('kid1', t.get('k1')::jsonb #>> '{key,key_id}');
select t.put('h1', t.hash(t.get('s1')));
select t.check('create returns the secret once, in the documented format',
  t.get('s1') ~ '^lvk_[0-9a-f]{12}_[0-9a-f]{48}$' and (t.get('k1')::jsonb ->> 'shown_once') = 'true'
  and left(t.get('s1'), 16) = (t.get('k1')::jsonb #>> '{key,prefix}'));
select t.check('hashing: only the SHA-256 of the key is stored, never the key',
  t.q(format($q$select (secret_hash = %L)::text from lv.api_keys where id = %L::uuid$q$, t.get('h1'), t.get('kid1'))) = 'true'
  and t.q(format($q$select count(*)::text from lv.api_keys k where row_to_json(k)::text like %L$q$, '%' || right(t.get('s1'), 48) || '%')) = '0');
select t.check('the list shows prefix, scopes and last use, never the secret or its hash',
  (lv_api.lv_api_keys_list(t.id('hub')) #>> '{keys,0,prefix}') = (t.get('k1')::jsonb #>> '{key,prefix}')
  and (lv_api.lv_api_keys_list(t.id('hub')))::text !~ right(t.get('s1'), 48)
  and (lv_api.lv_api_keys_list(t.id('hub')))::text !~ t.get('h1')
  and (lv_api.lv_api_keys_list(t.id('hub')) ->> 'enabled') = 'true');

-- ---------------------------------------------------------------------------------------------- calls
select t.check('an unknown key is refused (lv_unauthenticated)', t.code(t.api(repeat('a', 64), 'campaigns.list')) = 'lv_unauthenticated'
  and t.code(t.api('not-a-hash', 'campaigns.list')) = 'lv_unauthenticated');
select t.check('a valid key lists its Hub''s Campaigns', t.code(t.api(t.get('h1'), 'campaigns.list')) = 'ok');
select t.check('the impersonation claim does not outlive the call',
  coalesce(current_setting('request.jwt.claims', true), '') = '');
select t.check('last_used_at is recorded',
  t.q(format($q$select (last_used_at is not null)::text from lv.api_keys where id = %L::uuid$q$, t.get('kid1'))) = 'true');
select t.check('scope enforcement: invites:write and webhooks:manage are missing (lv_forbidden, missing)',
  t.code(t.api(t.get('h1'), 'invites.create')) = 'lv_forbidden'
  and (t.api(t.get('h1'), 'invites.create') #>> '{error,missing,0}') = 'invites:write'
  and t.code(t.api(t.get('h1'), 'webhooks.list')) = 'lv_forbidden');
select t.check('unknown operations are refused', t.code(t.api(t.get('h1'), 'hub.delete')) = 'lv_not_found');

select t.put('c_api', (t.api(t.get('h1'), 'campaigns.create', '{"title":"Long run check-in","mode":"poll","anonymity":"identified"}') ->> 'campaign_id'));
select t.check('campaigns:write creates a draft in the key''s Hub',
  t.q(format($q$select (hub_id = %L::uuid and status = 'draft')::text from lv.campaigns where id = %L::uuid$q$, t.get('hub'), t.get('c_api'))) = 'true');
select t.check('questions.add works through the same validation (bad options refused)',
  t.code(t.api(t.get('h1'), 'campaigns.questions.add', jsonb_build_object('campaign_id', t.get('c_api'), 'position', 1,
    'kind', 'single_choice', 'prompt', 'Pick', 'config', '{"options":["Only one"]}'::jsonb))) = 'lv_invalid_input');
select t.put('q_api', (t.api(t.get('h1'), 'campaigns.questions.add', jsonb_build_object('campaign_id', t.get('c_api'), 'position', 1,
    'kind', 'yes_no', 'prompt', 'Coming on Saturday?')) ->> 'question_id'));
select t.check('schedule: a bad timestamp is lv_invalid_input, a good window is accepted',
  t.code(t.api(t.get('h1'), 'campaigns.schedule', jsonb_build_object('campaign_id', t.get('c_api'), 'closes_at', 'tomorrow-ish'))) = 'lv_invalid_input'
  and t.code(t.api(t.get('h1'), 'campaigns.schedule', jsonb_build_object('campaign_id', t.get('c_api'), 'closes_at', (now() + interval '7 days')::text))) = 'ok');
select t.check('publish activates the Campaign', t.code(t.api(t.get('h1'), 'campaigns.publish', jsonb_build_object('campaign_id', t.get('c_api')))) = 'ok'
  and (t.api(t.get('h1'), 'campaigns.get', jsonb_build_object('campaign_id', t.get('c_api'))) #>> '{campaign,status}') = 'active');
select t.check('a key never reaches another Hub''s Campaign (lv_not_found)',
  t.code(t.api(t.get('h1'), 'campaigns.get', jsonb_build_object('campaign_id', t.get('c_other')))) = 'lv_not_found'
  and t.code(t.api(t.get('h1'), 'campaigns.close', jsonb_build_object('campaign_id', t.get('c_other')))) = 'lv_not_found');
select t.check('a malformed id is lv_invalid_input', t.code(t.api(t.get('h1'), 'campaigns.get', '{"campaign_id":"x"}')) = 'lv_invalid_input');
select t.check('writes are audited with the key, reads are not',
  t.q(format($q$select count(*)::text from lv.audit_events where action = 'api.call' and hub_id = %L::uuid and detail->>'key_id' = %L$q$, t.get('hub'), t.get('kid1'))) <> '0'
  and t.q(format($q$select count(*)::text from lv.audit_events where action = 'api.call' and target = 'campaigns.list'$q$)) = '0');

-- ---------------------------------------------------------------------------------------------- rate limit
select t.as_kpn(1);
select t.put('k2', lv_api.lv_api_key_create(t.id('hub'), 'Burst', array['campaigns:read'])::text);
select t.put('h2', t.hash(t.get('k2')::jsonb ->> 'secret'));
select t.as_pg();
select t.set_limit('api.rate_per_minute', '2'::jsonb);
select t.put('rl', (select string_agg(t.code(t.api(t.get('h2'), 'campaigns.list')), ',') from generate_series(1, 3)));
select t.check('rate limit: the third call in a minute is lv_rate_limited', t.get('rl') = 'ok,ok,lv_rate_limited');
select t.check('rate limit: it carries retry_after',
  (t.api(t.get('h2'), 'campaigns.list') #>> '{error,retry_after}')::int between 1 and 60);
select t.as_pg();
select t.set_limit('api.rate_per_minute', '1000'::jsonb);

-- ---------------------------------------------------------------------------------------------- results via the API
-- Anonymous survey with a rating and a text question; members 3..8 answer (6 >= cohort 5), then it closes.
select t.as_kpn(1);
select t.put('c_anon', (lv_api.lv_campaign_create(t.id('hub'), 'Winter social night', 'survey', 'anonymous') ->> 'campaign_id'));
select t.put('qa_r', (lv_api.lv_campaign_question_add(t.id('c_anon'), 1, 'rating', 'How was it?') ->> 'question_id'));
select t.put('qa_t', (lv_api.lv_campaign_question_add(t.id('c_anon'), 2, 'text', 'Anything else?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('c_anon'));
select t.check('anonymous results are not released while live, through the API too',
  t.code(t.api(t.get('h1'), 'results.get', jsonb_build_object('campaign_id', t.get('c_anon')))) <> 'ok');
select t.as_kpn(3);
select t.as_kpn(n) || t.submit(t.id('c_anon'), t.id('qa_r'), to_jsonb(case when n = 8 then 1 else 5 end), t.id('qa_t'), 'Loved the route ' || n)::text
  from generate_series(3, 8) n;
select t.as_kpn(1);
select lv_api.lv_campaign_close(t.id('c_anon'));
select t.put('ov', lv_api.lv_analytics_overview(t.id('c_anon'))::text);
select t.put('ra', t.api(t.get('h1'), 'results.get', jsonb_build_object('campaign_id', t.get('c_anon')))::text);
select t.check('results: the API answers from the same engine (same participant count and withheld rating)',
  (t.get('ra')::jsonb #>> '{participant_count,n}') = (t.get('ov')::jsonb #>> '{participant_count,n}')
  and (t.get('ra')::jsonb #>> '{questions,0,result,withheld}') = 'true'
  and (t.get('ra')::jsonb #> '{questions,0,result}') = (t.get('ov')::jsonb #> '{questions,0,result}'));
select t.check('results: withheld stays withheld, never zero (no cells, mean null)',
  jsonb_array_length(t.get('ra')::jsonb #> '{questions,0,result,cells}') = 0
  and (t.get('ra')::jsonb #>> '{questions,0,result,summary,mean}') is null);
select t.check('results: the app shows the free texts, the API never returns an individual answer',
  jsonb_array_length(t.get('ov')::jsonb #> '{questions,1,result,texts}') = 6
  and (t.get('ra')::jsonb #>> '{questions,1,result,texts_omitted}') = 'true'
  and t.get('ra') !~ 'Loved the route');
select t.check('results: no account or receipt appears in the API result',
  t.get('ra') !~ t.get('acc3') and t.get('ra') !~ 'receipt');

-- ---------------------------------------------------------------------------------------------- creator standing, revoke
select t.as_kpn(1);
select t.put('r_api', (lv_api.lv_role_create(t.id('hub'), 'Integrations', 'star', array['api.manage', 'campaign.manage']) #>> '{role,role_id}'));
select lv_api.lv_member_role_assign(t.id('m3'), t.id('r_api'));
select t.as_kpn(3);
select t.put('h3', t.hash(lv_api.lv_api_key_create(t.id('hub'), 'Member key', array['campaigns:read']) ->> 'secret'));
select t.check('a key works for a member holding api.manage', t.code(t.api(t.get('h3'), 'campaigns.list')) = 'ok');
select t.as_kpn(1);
select lv_api.lv_member_role_unassign(t.id('m3'), t.id('r_api'));
select t.check('the key stops when its creator loses api.manage (lv_forbidden), and is kept',
  t.code(t.api(t.get('h3'), 'campaigns.list')) = 'lv_forbidden'
  and t.q(format($q$select count(*)::text from lv.api_keys where secret_hash = %L and revoked_at is null$q$, t.get('h3'))) = '1');
select t.as_kpn(1);
select t.check('revoke works and is idempotent', t.code(lv_api.lv_api_key_revoke(t.id('kid1'))) = 'ok'
  and t.code(lv_api.lv_api_key_revoke(t.id('kid1'))) = 'ok');
select t.check('a revoked key is refused', t.code(t.api(t.get('h1'), 'campaigns.list')) = 'lv_unauthenticated');
select t.as_kpn(1);
select t.put('k4', lv_api.lv_api_key_create(t.id('hub'), 'Webhooks', array['campaigns:read', 'webhooks:manage', 'invites:write', 'results:read'])::text);
select t.put('h4', t.hash(t.get('k4')::jsonb ->> 'secret'));
select t.check('invites:write creates a Hub invite', t.code(t.api(t.get('h4'), 'invites.create', '{"max_uses":3}')) = 'ok');

-- ---------------------------------------------------------------------------------------------- webhooks
select t.as_kpn(1);
select t.check('webhook URLs: https only, no IP literals or internal names',
  t.code(lv_api.lv_webhook_create(t.id('hub'), 'http://hooks.northside-running.org/lv')) = 'lv_invalid_input'
  and t.code(lv_api.lv_webhook_create(t.id('hub'), 'https://10.0.0.1/hook')) = 'lv_invalid_input'
  and t.code(lv_api.lv_webhook_create(t.id('hub'), 'https://localhost/hook')) = 'lv_invalid_input'
  and t.code(lv_api.lv_webhook_create(t.id('hub'), 'https://db.internal/hook')) = 'lv_invalid_input');
select t.put('wh', lv_api.lv_webhook_create(t.id('hub'), 'https://hooks.northside-running.org/lv')::text);
select t.put('wid', t.get('wh')::jsonb #>> '{endpoint,endpoint_id}');
select t.check('webhook: the per-endpoint secret is shown once and never listed',
  (t.get('wh')::jsonb ->> 'secret') ~ '^lvwh_[0-9a-f]{48}$'
  and (lv_api.lv_webhook_list(t.id('hub')))::text !~ (t.get('wh')::jsonb ->> 'secret'));
select t.as_kpn(2);
select t.check('webhook: a Starter Hub cannot add endpoints', t.code(lv_api.lv_webhook_create(t.id('hub2'), 'https://hooks.example.org/x')) = 'lv_entitlement_required');
select t.check('webhooks:manage lists endpoints through the API',
  jsonb_array_length(t.api(t.get('h4'), 'webhooks.list') -> 'endpoints') = 1);

select t.as_kpn(1);
select t.put('c_w', (lv_api.lv_campaign_create(t.id('hub'), 'Saturday long run', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q_w', (lv_api.lv_campaign_question_add(t.id('c_w'), 1, 'yes_no', 'Coming?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('c_w'));
select t.check('campaign.published is queued once for the endpoint',
  t.q(format($q$select count(*)::text from lv.webhook_outbox where endpoint_id = %L::uuid and event = 'campaign.published'
               and payload #>> '{data,campaign_id}' = %L$q$, t.get('wid'), t.get('c_w'))) = '1');
-- Ten identified answers reach the first milestone.
select t.as_kpn(n) || t.ans1(t.id('c_w'), t.id('q_w'), 'true'::jsonb)::text from generate_series(3, 12) n;
select t.check('campaign.responses_milestone at 10 released responses (identified)',
  t.q(format($q$select count(*)::text from lv.webhook_outbox where endpoint_id = %L::uuid and event = 'campaign.responses_milestone'
               and (payload #>> '{data,milestone}') = '10'$q$, t.get('wid'))) = '1');
select t.as_kpn(1);
select lv_api.lv_campaign_close(t.id('c_w'));
select t.check('campaign.closed carries the released count',
  t.q(format($q$select payload #>> '{data,released_participants}' from lv.webhook_outbox where endpoint_id = %L::uuid and event = 'campaign.closed'
               and payload #>> '{data,campaign_id}' = %L$q$, t.get('wid'), t.get('c_w'))) = '10');
-- Anonymous: ten answers, never a milestone (counts are not released while live).
select t.put('c_wa', (lv_api.lv_campaign_create(t.id('hub'), 'Anonymous pulse', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('q_wa', (lv_api.lv_campaign_question_add(t.id('c_wa'), 1, 'yes_no', 'Happy?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('c_wa'));
select t.as_kpn(n) || t.ans1(t.id('c_wa'), t.id('q_wa'), 'true'::jsonb)::text from generate_series(3, 12) n;
select t.check('anonymous Campaigns never emit a responses milestone',
  t.q(format($q$select count(*)::text from lv.webhook_outbox where event = 'campaign.responses_milestone' and payload #>> '{data,campaign_id}' = %L$q$, t.get('c_wa'))) = '0');
select t.check('payloads hold no answers or identities',
  t.q($$select count(*)::text from lv.webhook_outbox where payload::text ~ 'account|receipt|answers'$$) = '0');
select t.check('the delivery log has no body column',
  t.q($$select count(*)::text from information_schema.columns where table_schema = 'lv' and table_name = 'webhook_deliveries'
         and column_name in ('payload', 'body', 'response')$$) = '0');

select t.as_service();
select t.put('claim', lv.webhook_claim(10)::text);
select t.check('dispatcher claim returns url, secret and a signed-body source for each due delivery',
  jsonb_array_length(t.get('claim')::jsonb -> 'deliveries') >= 3
  and (t.get('claim')::jsonb #>> '{deliveries,0,url}') = 'https://hooks.northside-running.org/lv'
  and (t.get('claim')::jsonb #>> '{deliveries,0,secret}') = (t.get('wh')::jsonb ->> 'secret'));
select t.put('d0', t.get('claim')::jsonb #>> '{deliveries,0,id}');
select t.put('d1', t.get('claim')::jsonb #>> '{deliveries,1,id}');
select lv.webhook_mark(t.id('d0'), 'retry', 503, 120, 'http 503');
select lv.webhook_mark(t.id('d1'), 'delivered', 200, 80, null);
select t.as_pg();
select t.check('retry backs off and keeps the payload; delivered empties it',
  t.q(format($q$select (status = 'queued' and next_attempt_at > now() and payload <> '{}'::jsonb)::text from lv.webhook_outbox where id = %L::uuid$q$, t.get('d0'))) = 'true'
  and t.q(format($q$select (status = 'delivered' and payload = '{}'::jsonb)::text from lv.webhook_outbox where id = %L::uuid$q$, t.get('d1'))) = 'true');
select t.check('the delivery log records outcome and status code',
  t.q(format($q$select string_agg(outcome || ':' || status_code, ',' order by outcome) from lv.webhook_deliveries where endpoint_id = %L::uuid$q$, t.get('wid'))) = 'delivered:200,retry:503');

-- ---------------------------------------------------------------------------------------------- plan lapse and suspension
select t.as_pg();
update lv.webhook_outbox set next_attempt_at = now() - interval '1 second' where id = t.id('d0');
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where hub_id = t.id('hub');
select t.check('plan lapse: keys answer lv_entitlement_required (team_hub) and are kept',
  t.code(t.api(t.get('h4'), 'campaigns.list')) = 'lv_entitlement_required'
  and (t.api(t.get('h4'), 'campaigns.list') #>> '{error,product}') = 'team_hub'
  and t.q(format($q$select count(*)::text from lv.api_keys where secret_hash = %L and revoked_at is null$q$, t.get('h4'))) = '1');
select t.as_service();
select t.check('plan lapse: webhooks pause (nothing claimed)',
  jsonb_array_length(lv.webhook_claim(10) -> 'deliveries') = 0);
select t.as_pg();
select t.check('plan lapse: the queued delivery is kept',
  t.q(format($q$select status from lv.webhook_outbox where id = %L::uuid$q$, t.get('d0'))) = 'queued');
update lv.entitlements set ends_at = null where hub_id = t.id('hub');
select t.check('plan restored: the same key works again', t.code(t.api(t.get('h4'), 'campaigns.list')) = 'ok');

-- Suspension hook (000023 owns suspensions): use the real staff-panel tables.
select t.as_pg();
insert into lv.hub_suspensions (hub_id, reason) values (t.id('hub'), 'test suspension');
select t.check('suspension: a suspended Hub''s keys are refused (lv_forbidden) and kept',
  t.code(t.api(t.get('h4'), 'campaigns.list')) = 'lv_forbidden'
  and t.q(format($q$select count(*)::text from lv.api_keys where secret_hash = %L and revoked_at is null$q$, t.get('h4'))) = '1');
select t.as_service();
select t.check('suspension: webhooks pause for a suspended Hub', jsonb_array_length(lv.webhook_claim(10) -> 'deliveries') = 0);
select t.as_pg();
delete from lv.hub_suspensions where hub_id = t.id('hub');
select t.check('suspension: lifting it restores the same key', t.code(t.api(t.get('h4'), 'campaigns.list')) = 'ok');

-- ---------------------------------------------------------------------------------------------- Discord: account link
select t.put('du3', '300000000000000003');
select t.put('du1', '300000000000000001');
select t.put('lk', t.dc('link', t.get('du3'))::text);
select t.check('discord link: a one-time code, valid for about 10 minutes, stored hashed',
  (t.get('lk')::jsonb ->> 'code') ~ '^[0-9A-F]{20}$'
  and (t.get('lk')::jsonb ->> 'expires_at')::timestamptz between now() + interval '9 minutes' and now() + interval '11 minutes'
  and t.q(format($q$select count(*)::text from lv.discord_codes where code_hash = %L$q$, t.hash(t.get('lk')::jsonb ->> 'code'))) = '1'
  and t.q(format($q$select count(*)::text from lv.discord_codes d where row_to_json(d)::text like %L$q$, '%' || (t.get('lk')::jsonb ->> 'code') || '%')) = '0');
select t.as_anon();
select t.check('discord link: confirming needs sign-in', t.raises(format($q$select lv_api.lv_discord_link_confirm(%L, '2026-11-08', true)$q$, t.get('lk')::jsonb ->> 'code')));
select t.as_kpn(3);
select t.check('discord link: preview names the kind and the Discord user',
  (lv_api.lv_discord_code_preview(t.get('lk')::jsonb ->> 'code') ->> 'kind') = 'link'
  and (lv_api.lv_discord_code_preview(t.get('lk')::jsonb ->> 'code') ->> 'discord_username') = 'runner003');
select t.check('discord link: an outdated consent version is refused',
  t.code(lv_api.lv_discord_link_confirm(t.get('lk')::jsonb ->> 'code', '2020-01-01', false)) = 'lv_invalid_input');
select t.check('discord link: confirm links the account (role facts not consented)',
  t.code(lv_api.lv_discord_link_confirm(t.get('lk')::jsonb ->> 'code', '2026-11-08', false)) = 'ok');
select t.check('discord link: the link shows in Account Settings', (lv_api.lv_discord_me() #>> '{link,discord_username}') = 'runner003');
select t.check('discord link: the code is one-time', t.code(lv_api.lv_discord_link_confirm(t.get('lk')::jsonb ->> 'code', '2026-11-08', false)) = 'lv_invalid_code');
select t.check('discord link: the Discord id is a handle, not an identity (no account_identities row)',
  t.q(format($q$select count(*)::text from lv.account_identities where identity_subject = %L$q$, t.get('du3'))) = '0');
select t.check('discord link: a linked Discord user cannot start a second link', t.code(t.dc('link', t.get('du3'))) = 'lv_conflict');
select t.put('lk_old', t.dc('link', '300000000000000099')::text);
select t.as_pg();
update lv.discord_codes set expires_at = now() - interval '1 second' where code_hash = t.hash(t.get('lk_old')::jsonb ->> 'code');
select t.as_kpn(4);
select t.check('discord link: an expired code is refused', t.code(lv_api.lv_discord_link_confirm(t.get('lk_old')::jsonb ->> 'code', '2026-11-08', true)) = 'lv_invalid_code');

-- The Owner links too (role facts consented).
select t.put('lk1', t.dc('link', t.get('du1'))::text);
select t.as_kpn(1);
select lv_api.lv_discord_link_confirm(t.get('lk1')::jsonb ->> 'code', '2026-11-08', true);

-- ---------------------------------------------------------------------------------------------- server <-> Hub
select t.check('connect: only server admins', t.code(t.dc('connect', t.get('du1'), '{"hub":"northside-running"}')) = 'lv_forbidden');
select t.put('cn_none', t.dc('connect', t.get('du1'), '{"hub":"no-such-hub-anywhere"}', true)::text);
select t.check('connect: a code is issued even for an unknown Hub (no enumeration)', t.code(t.get('cn_none')::jsonb) = 'ok');
select t.put('cn', t.dc('connect', t.get('du1'), '{"hub":"northside-running"}', true)::text);
select t.check('connect: a new code replaces the previous one', t.q(format($q$select count(*)::text from lv.discord_codes where code_hash = %L$q$,
  t.hash(t.get('cn_none')::jsonb ->> 'code'))) = '0');
select t.as_kpn(3);
select t.check('connect: a member who does not manage the Hub cannot see or confirm it',
  t.code(lv_api.lv_discord_code_preview(t.get('cn')::jsonb ->> 'code')) = 'lv_not_found'
  and t.code(lv_api.lv_discord_connect_confirm(t.get('cn')::jsonb ->> 'code')) = 'lv_not_found');
select t.as_kpn(1);
select t.check('connect: a Hub manager confirms in LunchVoice', t.code(lv_api.lv_discord_connect_confirm(t.get('cn')::jsonb ->> 'code')) = 'ok');
select t.check('connect: the connection is listed in Hub settings', jsonb_array_length(lv_api.lv_discord_connections(t.id('hub')) -> 'connections') = 1);

-- ---------------------------------------------------------------------------------------------- role rules
select t.put('role_wl', '500000000000000001');
select t.put('role_hub', '500000000000000002');
select t.put('role_team', '500000000000000003');
select t.check('setup: only server admins', t.code(t.dc('setup', t.get('du1'), jsonb_build_object('fact', 'team_hub', 'role', t.get('role_team')))) = 'lv_forbidden');
select t.check('setup: a waitlist and a Team rule', t.code(t.dc('setup', t.get('du1'), jsonb_build_object('fact', 'waitlist_founding', 'role', t.get('role_wl')), true)) = 'ok'
  and t.code(t.dc('setup', t.get('du1'), jsonb_build_object('fact', 'team_hub', 'role', t.get('role_team')), true)) = 'ok');
select t.check('setup: a membership rule only for a Hub the configuring person manages',
  t.code(t.dc('setup', t.get('du3'), jsonb_build_object('fact', 'hub_member', 'role', t.get('role_hub'), 'hub', 'northside-running'), true)) = 'lv_forbidden'
  and t.code(t.dc('setup', t.get('du1'), jsonb_build_object('fact', 'hub_member', 'role', t.get('role_hub'), 'hub', 'northside-walkers'), true)) = 'lv_forbidden'
  and t.code(t.dc('setup', '300000000000000077', jsonb_build_object('fact', 'hub_member', 'role', t.get('role_hub'), 'hub', 'northside-running'), true)) = 'lv_forbidden'
  and t.code(t.dc('setup', t.get('du1'), jsonb_build_object('fact', 'hub_member', 'role', t.get('role_hub'), 'hub', 'northside-running'), true)) = 'ok');
select t.check('role facts: none for a linked person who did not consent',
  jsonb_array_length(t.dc('verify', t.get('du3')) -> 'add') = 0);
select t.check('role facts: none for an unlinked person (verify asks to link first)',
  t.code(t.dc('verify', '300000000000000088')) = 'lv_not_found');
select t.put('p1', t.dc('verify', t.get('du1'))::text);
select t.check('role facts: a consenting Owner of a Team Hub gets the Team and member roles, not the waitlist role',
  (t.get('p1')::jsonb -> 'add') = jsonb_build_array(t.get('role_hub'), t.get('role_team')));
-- Member 3 re-links with consent.
select t.dc('unlink', t.get('du3'));
select t.put('lk3', t.dc('link', t.get('du3'))::text);
select t.as_kpn(3);
select lv_api.lv_waitlist_join();
select lv_api.lv_discord_link_confirm(t.get('lk3')::jsonb ->> 'code', '2026-11-08', true);
select t.put('p3', t.dc('verify', t.get('du3'))::text);
select t.check('role facts: a consenting member gets the member and Founding roles, not the Team role',
  (t.get('p3')::jsonb -> 'add') = jsonb_build_array(t.get('role_wl'), t.get('role_hub')));
select t.as_service();
select lv.discord_roles_applied('900000000000000001', t.get('du3'), array[t.get('role_wl'), t.get('role_hub')], null);
-- Member 3 leaves the Hub: the member role is removed at the next check.
select t.as_kpn(3);
select lv_api.lv_member_leave(t.id('hub'));
select t.put('p3b', t.dc('verify', t.get('du3'))::text);
select t.check('role facts: a fact that stops being true removes the role at the next check',
  (t.get('p3b')::jsonb -> 'add') = jsonb_build_array(t.get('role_wl'))
  and (t.get('p3b')::jsonb -> 'remove') = jsonb_build_array(t.get('role_hub')));

-- ---------------------------------------------------------------------------------------------- posting and D-01
select t.as_kpn(1);
select t.put('c_poll', (lv_api.lv_campaign_create(t.id('hub'), 'Pick the route', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q_poll', (lv_api.lv_campaign_question_add(t.id('c_poll'), 1, 'single_choice', 'Which route?', '{"options":["River","Hills","Park"]}'::jsonb) ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('c_poll'));
select t.put('jc_poll', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c_poll'))));
select t.put('jc_anon', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c_wa'))));
select t.check('post: only a linked person who manages Campaigns in a connected Hub',
  t.code(t.dc('post', '300000000000000088', jsonb_build_object('campaign', t.get('jc_poll')))) = 'lv_forbidden'
  and t.code(t.dc('post', t.get('du1'), jsonb_build_object('campaign', 'ZZZZZZ'))) = 'lv_not_found');
select t.put('card_poll', t.dc('post', t.get('du1'), jsonb_build_object('campaign', t.get('jc_poll')))::text);
select t.put('card_anon', t.dc('post', t.get('du1'), jsonb_build_object('campaign', t.get('jc_anon')))::text);
select t.check('D-01: an identified one-question poll may be answered in Discord',
  (t.get('card_poll')::jsonb #>> '{card,answer_in_discord}') = 'true'
  and (t.get('card_poll')::jsonb #> '{card,options}') = '["River","Hills","Park"]'::jsonb);
select t.check('D-01: an anonymous Campaign card only opens the LunchVoice player',
  (t.get('card_anon')::jsonb #>> '{card,answer_in_discord}') = 'false'
  and (t.get('card_anon')::jsonb #> '{card,options}') = 'null'::jsonb
  and (t.get('card_anon')::jsonb #>> '{card,join_code}') = t.get('jc_anon'));
select t.as_pg();
select t.put('n_anon', t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('c_wa'))));
select t.check('D-01 server-side: an in-Discord answer to an anonymous Campaign is refused and records nothing',
  t.code(t.dc('answer', t.get('du1'), jsonb_build_object('campaign_id', t.get('c_wa'), 'option', 0))) = 'lv_not_available'
  and t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('c_wa'))) = t.get('n_anon'));
select t.check('answer: an unlinked Discord user cannot answer', t.code(t.dc('answer', '300000000000000088', jsonb_build_object('campaign_id', t.get('c_poll'), 'option', 1))) = 'lv_forbidden');
select t.check('answer: a bad option is refused', t.code(t.dc('answer', t.get('du1'), jsonb_build_object('campaign_id', t.get('c_poll'), 'option', 7))) = 'lv_invalid_input');
select t.check('answer: the linked person''s identified answer is recorded',
  t.code(t.dc('answer', t.get('du1'), jsonb_build_object('campaign_id', t.get('c_poll'), 'option', 1))) = 'ok'
  and t.q(format($q$select a.value #>> '{}' from lv.answers a join lv.submissions s on s.id = a.submission_id
                     where s.campaign_id = %L::uuid and s.account_id = %L::uuid$q$, t.get('c_poll'), t.get('owner'))) = 'Hills');
select t.check('answer: one answer per linked person (a second click is a duplicate)', (t.dc('answer', t.get('du1'), jsonb_build_object('campaign_id', t.get('c_poll'), 'option', 0)) ->> 'duplicate') = 'true'
  and t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('c_poll'))) = '1');
select t.as_kpn(1);
select t.put('conn', lv_api.lv_discord_connections(t.id('hub')) #>> '{connections,0,connection_id}');
select lv_api.lv_discord_connection_update(t.id('conn'), true, false);
select t.put('c_auto', (lv_api.lv_campaign_create(t.id('hub'), 'Auto posted', 'poll', 'anonymous') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('c_auto'), 1, 'yes_no', 'Ok?');
select lv_api.lv_campaign_activate(t.id('c_auto'));
select t.check('auto-post on publish queues a post job for the connected channel',
  t.q(format($q$select count(*)::text from lv.discord_outbox where kind = 'post' and campaign_id = %L::uuid and channel_id = '910000000000000001'$q$, t.get('c_auto'))) = '1');

-- ---------------------------------------------------------------------------------------------- rate limits, staff disable
select t.as_pg();
update lv.policy set value = '1'::jsonb where key = 'discord.user_commands_per_minute';
select t.check('discord: per-user command rate limit', t.code(t.dc('verify', '300000000000000055')) <> 'lv_rate_limited'
  and t.code(t.dc('verify', '300000000000000055')) = 'lv_rate_limited');
select t.as_pg();
update lv.policy set value = '1000'::jsonb where key = 'discord.user_commands_per_minute';
update lv.policy set value = '1'::jsonb where key = 'discord.guild_commands_per_minute';
select t.check('discord: per-server command rate limit',
  t.code(t.dc('verify', '300000000000000056', '{}', false, '900000000000000002')) <> 'lv_rate_limited'
  and t.code(t.dc('verify', '300000000000000057', '{}', false, '900000000000000002')) = 'lv_rate_limited');
select t.as_pg();
update lv.policy set value = '1000'::jsonb where key = 'discord.guild_commands_per_minute';
select t.as_kpn(30, null, true, 'Staff'); select lv_api.lv_my_context();
select t.check('staff only: a regular account cannot disable a server', t.code(lv_api.lv_admin_discord_guild_disable('900000000000000001', true, 'x')) = 'lv_forbidden');
select t.as_pg();
select lv.grant_platform_admin(t.q($$select account_id::text from lv.account_identities where identity_subject = '00000000-0000-4000-8c00-000000000030'$$)::uuid, null);
select t.as_kpn(30);
select t.check('staff can disable a server', t.code(lv_api.lv_admin_discord_guild_disable('900000000000000001', true, 'Abuse report')) = 'ok');
select t.check('a disabled server gets no commands and no role facts',
  t.code(t.dc('post', t.get('du1'), jsonb_build_object('campaign', t.get('jc_poll')))) = 'lv_not_available'
  and t.q($$select (lv.discord_role_plan('900000000000000001', '300000000000000001') -> 'add')::text$$)::jsonb = '[]'::jsonb);
select t.as_kpn(30);
select lv_api.lv_admin_discord_guild_disable('900000000000000001', false, null);

-- ---------------------------------------------------------------------------------------------- account deletion
select t.as_kpn(3);
select t.check('account deletion succeeds for the linked member', t.code(lv_api.lv_account_delete('DELETE')) = 'ok');
select t.as_pg();
select t.check('account deletion removes the Discord link and the account''s API keys',
  t.q(format($q$select count(*)::text from lv.discord_links where discord_user_id = %L$q$, t.get('du3'))) = '0'
  and t.q(format($q$select count(*)::text from lv.api_keys where secret_hash = %L$q$, t.get('h3'))) = '0');
select t.check('account deletion queues removal of every role the bot granted',
  t.q(format($q$select count(*)::text from lv.discord_outbox where kind = 'role_sync' and discord_user_id = %L and status = 'queued'$q$, t.get('du3'))) <> '0'
  and t.q(format($q$select (lv.discord_role_plan('900000000000000001', %L) -> 'remove')::text$q$, t.get('du3')))::jsonb
      = jsonb_build_array(t.get('role_wl'), t.get('role_hub')));
select t.as_service();
select lv.discord_roles_applied('900000000000000001', t.get('du3'), null, array[t.get('role_wl'), t.get('role_hub')]);
select t.as_pg();
select t.check('after the removal nothing about that Discord user remains',
  t.q(format($q$select count(*)::text from lv.discord_role_grants where discord_user_id = %L$q$, t.get('du3'))) = '0');
select t.as_kpn(1);
select t.check('Account Settings unlink', (lv_api.lv_discord_unlink() ->> 'unlinked') = 'true');
select t.check('after unlink no link is shown', (lv_api.lv_discord_me() -> 'link') = 'null'::jsonb);

-- ---------------------------------------------------------------------------------------------- grants and RLS
select t.as_pg();
select t.check('the service entry points are not executable by API roles',
  not has_function_privilege('authenticated', 'lv.api_key_call(text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'lv.api_key_call(text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'lv.discord_interaction(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'lv.integration_act_as(uuid, text)', 'execute')
  and not has_function_privilege('service_role', 'lv.integration_act_as(uuid, text)', 'execute')
  and has_function_privilege('service_role', 'lv.api_key_call(text, text, jsonb)', 'execute'));
select t.check('signed-in functions are not executable signed out',
  not has_function_privilege('anon', 'lv_api.lv_api_key_create(uuid, text, text[])', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_discord_link_confirm(text, text, boolean)', 'execute')
  and has_function_privilege('authenticated', 'lv_api.lv_discord_link_confirm(text, text, boolean)', 'execute'));
select t.check('RLS is on for every new table and none is granted to API roles',
  t.q($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'lv' and c.relkind = 'r' and not c.relrowsecurity
           and c.relname in ('api_keys', 'webhook_endpoints', 'webhook_outbox', 'webhook_deliveries', 'discord_guilds', 'discord_links',
                             'discord_codes', 'discord_connections', 'discord_role_rules', 'discord_role_grants', 'discord_outbox',
                             'integration_rate_windows')$$) = '0'
  and not has_table_privilege('service_role', 'lv.api_keys', 'select')
  and not has_table_privilege('authenticated', 'lv.discord_links', 'select'));
select t.check('reserved routes: /developers and /connect cannot be claimed as Hubs',
  t.q($$select count(*)::text from lv.reserved_slugs where slug in ('developers', 'connect')$$) = '2');

rollback;
