-- 20: anonymous responses carry one constant date per Campaign (000020), identified ones keep real times.
select set_config('t.file', '20_anonymous_time_constant', false);
begin;

update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';
select t.trust_test_issuer();

select t.as_kpn(1, 'owner@example.invalid', true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, 'm1@example.invalid', true, 'M1'); select lv_api.lv_my_context();
select t.as_kpn(3, 'm2@example.invalid', true, 'M2'); select lv_api.lv_my_context();
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('owner'), 'approved');

select t.as_kpn(1);
select t.check('setup: a Hub is created', t.code(lv_api.lv_hub_create('time-hub', 'Time Hub')) = 'ok');
select t.as_pg();
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'time-hub'$$));
insert into lv.hub_invites (hub_id, code_hash, created_by, max_uses)
values (t.id('hub'), lv.invite_hash('TIME-CODE'), t.id('owner'), 5);

select t.as_kpn(2); select lv_api.lv_invite_redeem('TIME-CODE');
select t.as_kpn(3); select lv_api.lv_invite_redeem('TIME-CODE');

-- One anonymous and one identified Campaign, each with one rating question.
select t.as_kpn(1);
select lv_api.lv_campaign_create(t.id('hub'), 'Anon', 'survey', 'anonymous');
select lv_api.lv_campaign_create(t.id('hub'), 'Ident', 'survey', 'identified');
select t.as_pg();
select t.put('ca', t.q($$select id::text from lv.campaigns where title = 'Anon'$$));
select t.put('ci', t.q($$select id::text from lv.campaigns where title = 'Ident'$$));
select t.as_kpn(1);
select lv_api.lv_campaign_question_add(t.id('ca'), 1, 'rating', 'How?', '{}'::jsonb);
select lv_api.lv_campaign_question_add(t.id('ci'), 1, 'rating', 'How?', '{}'::jsonb);
select lv_api.lv_campaign_activate(t.id('ca'));
select lv_api.lv_campaign_activate(t.id('ci'));
select t.as_pg();
select t.put('qa', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('ca'))));
select t.put('qi', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('ci'))));
-- Pretend the anonymous Campaign was activated on a past day, so a constant date is distinguishable from today.
update lv.campaigns set activated_at = timestamptz '2026-01-15 13:45:00+00' where id = t.id('ca');

select t.as_kpn(2);
select t.check('anon: member 1 submits', t.code(lv_api.lv_submit_response(t.id('ca'),
  format('[{"question_id":"%s","value":4}]', t.get('qa'))::jsonb)) = 'ok');
select t.as_kpn(3);
select t.check('anon: member 2 submits', t.code(lv_api.lv_submit_response(t.id('ca'),
  format('[{"question_id":"%s","value":2}]', t.get('qa'))::jsonb)) = 'ok');
select t.check('ident: member 2 submits to the identified Campaign', t.code(lv_api.lv_submit_response(t.id('ci'),
  format('[{"question_id":"%s","value":5}]', t.get('qi'))::jsonb)) = 'ok');

select t.as_pg();
select t.check('anon: every submission carries the Campaign activation day, not the submit day',
  t.q(format($q$select (count(*) = 2 and count(distinct created_at) = 1
                        and min(created_at) = date_trunc('day', timestamptz '2026-01-15 13:45:00+00'))::text
                  from lv.submissions where campaign_id = %L::uuid$q$, t.get('ca'))) = 'true');
select t.check('anon: the stored date column is the same constant',
  t.q(format($q$select (count(distinct submitted_on) = 1 and min(submitted_on) = date '2026-01-15')::text
                  from lv.submissions where campaign_id = %L::uuid$q$, t.get('ca'))) = 'true');
select t.check('anon: answers carry the same constant time',
  t.q(format($q$select (count(distinct a.created_at) = 1)::text from lv.answers a
                 join lv.submissions s on s.id = a.submission_id where s.campaign_id = %L::uuid$q$, t.get('ca'))) = 'true');
select t.check('anon: no answer-side timestamp matches any participation timestamp',
  t.q(format($q$select (count(*) = 0)::text from lv.submissions s join lv.participation p on p.campaign_id = s.campaign_id
                 where s.campaign_id = %L::uuid and (s.created_at = p.created_at or s.submitted_on = p.created_at::date)$q$, t.get('ca'))) = 'true');
select t.check('ident: an identified Campaign keeps the real submission time',
  t.q(format($q$select (created_at > now() - interval '1 hour')::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('ci'))) = 'true');

rollback;
