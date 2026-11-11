-- 29: guests are never turned away by a shared limit (000029, founder decision F-15).
select set_config('t.file', '29_guest_limits', false);
begin;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.check('policy: the safety ceiling is 600 and the per-caller limit is 60',
  t.q($$select string_agg(value::text, ',' order by key) from lv.policy
         where key in ('participation.guest_per_caller_per_minute', 'participation.guest_rate_per_minute')$$) = '60,600');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('guest-limits', 'Guest Limits') ->> 'hub_id'));
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Room poll', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('q', (lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'How was it?') ->> 'question_id'));
select t.put('a', format('[{"question_id":"%s","value":4}]', t.get('q')));
select lv_api.lv_campaign_set_participation(t.id('c'), 'members_and_guests');
select t.check('setup: the poll is open', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'ok');
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));

-- ===== a room answers at once ============================================================================
select t.as_anon();
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.40"}', false);
select t.check('F-15: thirty guests from one address answer within the same minute, none refused',
  (select bool_and(t.code(lv_api.lv_guest_submit(t.get('code'), repeat('k', 36) || lpad(g::text, 4, '0'), t.get('a')::jsonb, null)) = 'ok')
     from generate_series(1, 30) g));
select t.as_pg();
select t.check('F-15: all thirty answers are stored', t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and is_guest$q$, t.get('c'))) = '30');

-- ===== one caller cannot flood ===========================================================================
update lv.policy set value = '32'::jsonb where key = 'participation.guest_per_caller_per_minute';
select t.as_anon();
select t.check('per caller: answers up to the limit are accepted',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('m', 40), t.get('a')::jsonb, null)) = 'ok'
  and t.code(lv_api.lv_guest_submit(t.get('code'), repeat('n', 40), t.get('a')::jsonb, null)) = 'ok');
select t.check('per caller: the next one from the same address is lv_rate_limited, and says it is this connection',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('o', 40), t.get('a')::jsonb, null)) = 'lv_rate_limited'
  and (lv_api.lv_guest_submit(t.get('code'), repeat('o', 40), t.get('a')::jsonb, null) #>> '{error,message}') like '%this connection%');
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.77"}', false);
select t.check('per caller: a guest at another address is not affected',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('o', 40), t.get('a')::jsonb, null)) = 'ok');
select set_config('request.headers', '', false);
select t.check('per caller: a request with no address is not limited per caller',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('p', 40), t.get('a')::jsonb, null)) = 'ok');
select t.as_pg();
select t.check('per caller: counters hold a hash only, never the address or the Campaign id',
  t.q(format($q$select count(*)::text from lv.integration_rate_windows
                 where scope = 'guest_caller' and (key !~ '^[0-9a-f]{64}$' or key like '%%203.0.113%%' or key like '%%' || %L || '%%')$q$, t.get('c'))) = '0'
  and t.q($$select count(*)::text from lv.integration_rate_windows where scope = 'guest_caller'$$)::int >= 2);
select t.check('per caller: nothing links a caller to a participation row',
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'lv' and table_name = 'guest_participation') = 'id,campaign_id,hub_id,key_hash,receipt_id,campaign_revision,created_at');
update lv.policy set value = null where key = 'participation.guest_per_caller_per_minute';
select t.as_anon();
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.40"}', false);
select t.check('per caller: an unset per-caller policy is not enforced',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('q', 40), t.get('a')::jsonb, null)) = 'ok');
select set_config('request.headers', '', false);

-- ===== duplicates ========================================================================================
select t.put('r1', (lv_api.lv_guest_submit(t.get('code'), repeat('d', 40), t.get('a')::jsonb, null) ->> 'receipt_id'));
select t.check('duplicate: the same key again returns the same receipt, marked duplicate',
  (lv_api.lv_guest_submit(t.get('code'), repeat('d', 40), t.get('a')::jsonb, null) ->> 'receipt_id') = t.get('r1')
  and (lv_api.lv_guest_submit(t.get('code'), repeat('d', 40), t.get('a')::jsonb, null) ->> 'duplicate') = 'true');
select t.as_pg();
select t.check('duplicate: three calls stored one answer',
  t.q(format($q$select (count(*) - 35)::text from lv.submissions where campaign_id = %L::uuid and is_guest$q$, t.get('c'))) = '1');

-- ===== the safety ceiling and the host's own cap =========================================================
update lv.policy set value = '36'::jsonb where key = 'participation.guest_rate_per_minute';
select t.as_anon();
select t.check('ceiling: at the per-Campaign ceiling a new guest is lv_rate_limited',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('e', 40), t.get('a')::jsonb, null)) = 'lv_rate_limited');
select t.check('ceiling: someone who already answered still gets their receipt',
  (lv_api.lv_guest_submit(t.get('code'), repeat('d', 40), t.get('a')::jsonb, null) ->> 'receipt_id') = t.get('r1'));
select t.as_pg();
update lv.policy set value = null where key = 'participation.guest_rate_per_minute';
select t.as_anon();
select t.check('ceiling: an unset ceiling still fails closed',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('e', 40), t.get('a')::jsonb, null)) = 'lv_policy_undecided');
select t.as_pg();
update lv.policy set value = '600'::jsonb where key = 'participation.guest_rate_per_minute';
update lv.campaigns set guest_limit = 37 where id = t.id('c');
select t.as_anon();
select t.check('cap: the host''s total guest cap is exact',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('e', 40), t.get('a')::jsonb, null)) = 'ok'
  and t.code(lv_api.lv_guest_submit(t.get('code'), repeat('f', 40), t.get('a')::jsonb, null)) = 'lv_limit_reached');

select t.as_pg();
select t.check('grants: unchanged (signed-out callers reach the wrapper only)',
  has_function_privilege('anon', 'lv_api.lv_guest_submit(text, text, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'lv.api_guest_submit(text, text, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'lv.integration_rate_hit(text, text, int)', 'execute'));

rollback;
