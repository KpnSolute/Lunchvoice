-- 30: the reporting system, step 1 (000030): categories, per-caller limits, one open report per caller, grouped queue,
-- decision stamps and the staff email.
select set_config('t.file', '30_staff_reports', false);
begin;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Staff'); select lv_api.lv_my_context();
select t.put('staff', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Member'); select lv_api.lv_my_context();
select t.put('member', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.platform_admins (account_id) values (t.id('staff'));
select t.grant_credit(t.id('owner'), 'starter');
select t.check('policy: per-caller 5, platform safeguard 300, notices to admin@',
  t.q($$select string_agg(value::text, ',' order by key) from lv.policy
         where key in ('abuse.notify_email', 'abuse.reports_per_caller_per_minute', 'abuse.reports_per_minute')$$) = '"admin@lunchvoice.com",5,300');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('report-hub', 'Report Hub') ->> 'hub_id'));
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Win a prize', 'poll', 'anonymous') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('c'), 1, 'yes_no', 'Password?');
select lv_api.lv_campaign_set_participation(t.id('c'), 'members_and_guests');
select lv_api.lv_campaign_activate(t.id('c'));
select t.put('c2', (lv_api.lv_campaign_create(t.id('hub'), 'Dull poll', 'poll', 'anonymous') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('c2'), 1, 'yes_no', 'Ok?');
select lv_api.lv_campaign_set_participation(t.id('c2'), 'members_and_guests');
select lv_api.lv_campaign_activate(t.id('c2'));
select t.as_pg();
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));
select t.put('code2', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c2'))));

-- ===== reporting =========================================================================================
select t.as_anon();
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.90"}', false);
select t.check('report: a category is stored', t.code(lv_api.lv_report_abuse(t.get('code'), 'Asks for my bank login', 'scam')) = 'ok');
select t.check('report: an unknown category is lv_invalid_input', t.code(lv_api.lv_report_abuse(t.get('code'), 'x', 'boring')) = 'lv_invalid_input');
select t.check('report: the same caller again is received but stores nothing', t.code(lv_api.lv_report_abuse(t.get('code'), 'Again', 'scam')) = 'ok');
select t.check('report: the old two-argument call still works and files under other', t.code(lv_api.lv_report_abuse(t.get('code2'), 'Not for me')) = 'ok');
select t.check('report: an unknown code answers the same', lv_api.lv_report_abuse('ZZZZZZ', 'x', 'spam') = lv_api.lv_report_abuse(t.get('code2'), 'Not for me', 'spam'));
select t.as_pg();
select t.check('report: one row per caller per survey, with its category',
  t.q(format($q$select string_agg(category, ',' order by created_at) from lv.abuse_reports where campaign_id = %L::uuid$q$, t.get('c'))) = 'scam'
  and t.q(format($q$select string_agg(category, ',') from lv.abuse_reports where campaign_id = %L::uuid$q$, t.get('c2'))) = 'other');
select t.check('report: the caller is stored only as a hash',
  t.q($$select count(*)::text from lv.abuse_reports where caller_hash !~ '^[0-9a-f]{64}$' or caller_hash like '%203.0.113%'$$) = '0');

-- per-caller limit: this caller has made 5 calls that reached the counter (the invalid category was refused earlier)
select t.as_anon();
select t.check('limit: the sixth report in a minute from one caller is lv_rate_limited',
  t.code(lv_api.lv_report_abuse(t.get('code'), 'Flood', 'spam')) = 'lv_rate_limited');
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.91"}', false);
select t.check('limit: another caller can still report (one caller cannot silence reporting)',
  t.code(lv_api.lv_report_abuse(t.get('code'), 'Phishing for passwords', 'scam')) = 'ok');
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.92"}', false);
select t.check('report: a third person reports the same survey', t.code(lv_api.lv_report_abuse(t.get('code'), 'Wants my address', 'private_info')) = 'ok');
select set_config('request.headers', '', false);
select t.as_kpn(3);
select t.check('report: a signed-in person reports once', t.code(lv_api.lv_report_abuse(t.get('code'), 'Bad', 'harmful')) = 'ok'
  and t.code(lv_api.lv_report_abuse(t.get('code'), 'Bad again', 'harmful')) = 'ok');
select t.as_pg();
select t.check('report: four distinct reporters made four rows',
  t.q(format($q$select count(*)::text from lv.abuse_reports where campaign_id = %L::uuid$q$, t.get('c'))) = '4');

-- ===== staff are told ====================================================================================
select t.check('notify: one email at the first report and one at the third, to the configured address, per survey',
  t.q($$select string_agg((payload->>'reporters') || ':' || (payload->>'title'), ',' order by payload->>'title', (payload->>'reporters')::int)
          from lv.email_outbox where template = 'staff_report'$$) = '1:Dull poll,1:Win a prize,3:Win a prize'
  and t.q($$select count(distinct to_address)::text || ':' || min(to_address) from lv.email_outbox where template = 'staff_report'$$) = '1:admin@lunchvoice.com');
select t.check('notify: the email carries no reporter and none of the reporter''s words',
  t.q($$select count(*)::text from lv.email_outbox where template = 'staff_report'
          and (payload::text ilike '%bank%' or payload::text ilike '%password%' or payload::text like '%203.0.113%' or account_id is not null)$$) = '0');
update lv.policy set value = null where key = 'abuse.notify_email';
select t.as_anon();
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.93"}', false);
select t.check('notify: with no address set, a report is still stored', t.code(lv_api.lv_report_abuse(t.get('code2'), 'Hm', 'spam')) = 'ok');
select set_config('request.headers', '', false);
select t.as_pg();
select t.check('notify: and no email is queued for it',
  t.q($$select count(*)::text from lv.email_outbox where template = 'staff_report'$$) = '3'
  and t.q(format($q$select count(*)::text from lv.abuse_reports where campaign_id = %L::uuid$q$, t.get('c2'))) = '2');

-- ===== the queue =========================================================================================
select t.as_kpn(2);
select t.put('rq', lv_api.lv_admin_reports('open', 'survey')::text);
select t.check('queue: one item per survey', jsonb_array_length(t.get('rq')::jsonb -> 'items') = 2);
select t.check('queue: phishing and private-information reports sort first',
  (t.get('rq')::jsonb #>> '{items,0,campaign_id}') = t.get('c'));
select t.check('queue: the item counts reports and distinct people, and breaks them down by category',
  (t.get('rq')::jsonb #>> '{items,0,report_count}') = '4' and (t.get('rq')::jsonb #>> '{items,0,distinct_count}') = '4'
  and (t.get('rq')::jsonb #> '{items,0,categories}') = '{"scam": 2, "private_info": 1, "harmful": 1}'::jsonb
  and jsonb_array_length(t.get('rq')::jsonb #> '{items,0,reasons}') = 3);
select t.check('queue: nobody who reported is returned',
  t.get('rq') not like '%' || t.get('member') || '%' and t.get('rq') not like '%reporter%' and t.get('rq') not like '%caller%');
select t.as_kpn(3);
select t.check('queue: only staff can read it or dismiss', t.code(lv_api.lv_admin_reports()) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_campaign_reports_dismiss(t.id('c'))) = 'lv_forbidden');

-- ===== decisions are stamped =============================================================================
select t.as_kpn(2);
select t.check('decide: one call dismisses a survey''s open reports', (lv_api.lv_admin_campaign_reports_dismiss(t.id('c2')) ->> 'reports') = '2'
  and t.code(lv_api.lv_admin_campaign_reports_dismiss(t.id('c2'))) = 'lv_not_found');
select t.check('decide: blocking a survey actions its reports', t.code(lv_api.lv_admin_campaign_block(t.id('c'), 'Phishing')) = 'ok');
select t.as_pg();
select t.check('decide: every decided report records when and by whom',
  t.q($$select count(*)::text from lv.abuse_reports where status <> 'open' and (decided_at is null or decided_by is null)$$) = '0'
  and t.q(format($q$select count(distinct decided_by)::text || ':' || min(decided_by::text) from lv.abuse_reports where status <> 'open'$q$)) = '1:' || t.get('staff')
  and t.q($$select string_agg(status || '=' || n, ',' order by status) from (select status, count(*) n from lv.abuse_reports group by status) s$$) = 'actioned=4,dismissed=2');
select t.as_kpn(2);
select t.check('decide: the queue reports the median time to a decision', (lv_api.lv_admin_reports('all') ->> 'median_decision_hours') is not null
  and jsonb_array_length(lv_api.lv_admin_reports('open') -> 'items') = 0);
select t.as_anon();
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.90"}', false);
select t.as_pg();
delete from lv.integration_rate_windows where scope = 'report_caller';
select t.as_anon();
select t.check('report: after a decision the same caller can report that survey again', t.code(lv_api.lv_report_abuse(t.get('code2'), 'Still bad', 'spam')) = 'ok');
select set_config('request.headers', '', false);
select t.as_pg();
select t.check('report: and it is a new open report', t.q(format($q$select count(*)::text from lv.abuse_reports where campaign_id = %L::uuid and status = 'open'$q$, t.get('c2'))) = '1');

select t.check('grants: reporting is open to signed-out callers; the queue and its helpers are not',
  has_function_privilege('anon', 'lv_api.lv_report_abuse(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_admin_campaign_reports_dismiss(uuid)', 'execute')
  and not has_function_privilege('anon', 'lv.api_report_abuse(text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'lv.staff_report_notify(text, uuid, text, text, text, int)', 'execute'));

rollback;
