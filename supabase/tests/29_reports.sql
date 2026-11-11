-- 29: reporting people and Hubs (000029). A report attaches to the account, reaches staff, and never exposes the reporter.
select set_config('t.file', '29_reports', false);
begin;
create function t.err_of(p_sql text) returns text language plpgsql security definer as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function t.err_of(text) to public;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Staff'); select lv_api.lv_my_context();
select t.put('staff', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Reporter'); select lv_api.lv_my_context();
select t.put('reporter', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Troll'); select lv_api.lv_my_context();
select t.put('troll', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(5, null, true, 'Outsider'); select lv_api.lv_my_context();
select t.as_pg();
select lv.grant_platform_admin(t.id('staff'), null);
select t.grant_credit(t.id('owner'), 'starter');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('report-hub', 'Report Hub') ->> 'hub_id'));
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(3); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(4); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_pg();
select t.put('m_troll', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('troll'))));
insert into lv.comments (hub_id, author_account_id, body) values (t.id('hub'), t.id('troll'), 'rude comment');
select t.put('cm', t.q(format($q$select id::text from lv.comments where hub_id = %L::uuid$q$, t.get('hub'))));

-- ===== reporting a person =================================================================================
select t.as_kpn(3);
select t.check('person: a member reports someone through one of their comments',
  t.code(lv_api.lv_report_account(t.id('hub'), p_comment => t.id('cm'), p_reason => 'harassment', p_details => E'Kept\tinsulting me')) = 'ok');
select t.check('person: reporting the same person again is a quiet duplicate',
  (lv_api.lv_report_account(t.id('hub'), p_comment => t.id('cm'), p_reason => 'harassment') ->> 'duplicate') = 'true');
select t.check('person: it is stored against the account, with the Hub where it happened',
  t.q(format($q$select count(*)::text from lv.user_reports where target_account_id = %L::uuid and hub_id = %L::uuid and status = 'open'$q$, t.get('troll'), t.get('hub'))) = '1');
select t.check('person: you cannot report yourself', t.code(lv_api.lv_report_account(t.id('hub'), p_membership => t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('reporter')))::uuid, p_reason => 'spam')) = 'lv_invalid_input');
select t.check('person: a bad reason is refused', t.code(lv_api.lv_report_account(t.id('hub'), p_comment => t.id('cm'), p_reason => 'because')) = 'lv_invalid_input');
select t.check('person: name exactly one way to identify them', t.code(lv_api.lv_report_account(t.id('hub'), p_reason => 'spam')) = 'lv_invalid_input');
select t.as_kpn(5);
select t.check('person: someone outside the Hub cannot probe for people in it', t.code(lv_api.lv_report_account(t.id('hub'), p_membership => t.id('m_troll'), p_reason => 'spam')) = 'lv_not_found');
select t.as_pg();
select t.check('person: the audit never records the reporter',
  t.q($$select count(*)::text from lv.audit_events where action = 'report.account' and actor_account_id is not null$$) = '0');
select t.check('person: the cleaned details were stored', t.q(format($q$select details from lv.user_reports where target_account_id = %L::uuid$q$, t.get('troll'))) = 'Kept insulting me');

-- ===== reporting a Hub ====================================================================================
select t.as_kpn(5);
select t.check('hub: anyone signed in can report a Hub by its address', t.code(lv_api.lv_report_hub('report-hub', 'scam', 'Asks for money')) = 'ok');
select t.check('hub: an unknown address is lv_not_found', t.code(lv_api.lv_report_hub('no-such-hub', 'scam')) = 'lv_not_found');
select t.as_kpn(1);
select t.check('hub: an owner cannot report their own Hub', t.code(lv_api.lv_report_hub('report-hub', 'spam')) = 'lv_invalid_input');

-- ===== the reporter's own list ============================================================================
select t.as_kpn(3);
select t.check('mine: shows what I sent and its status, nothing about other reporters',
  (lv_api.lv_my_reports() #>> '{reports,0,status}') = 'open' and (lv_api.lv_my_reports() #>> '{reports,0,label}') = 'Troll'
  and not (lv_api.lv_my_reports()::text like '%staff_note%'));
select t.as_anon();
select t.check('mine: signed-out callers cannot report or list',
  not has_function_privilege('anon', 'lv_api.lv_report_account(uuid, uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_report_hub(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_my_reports()', 'execute'));

-- ===== staff ==============================================================================================
select t.as_kpn(2);
select t.check('staff: the one queue carries both kinds', jsonb_array_length(lv_api.lv_admin_reports('open', 'all') -> 'items') >= 2
  and (select count(*) from jsonb_array_elements(lv_api.lv_admin_reports('open', 'person') -> 'items') i where i->>'type' = 'person') = 1
  and (select count(*) from jsonb_array_elements(lv_api.lv_admin_reports('open', 'hub') -> 'items') i where i->>'type' = 'hub') = 1);
select t.check('staff: a person report says who, where, why and the open-report count, but never the reporter',
  (lv_api.lv_admin_reports('open', 'person') #>> '{items,0,target_name}') = 'Troll'
  and (lv_api.lv_admin_reports('open', 'person') #>> '{items,0,target_open_reports}') = '1'
  and (lv_api.lv_admin_reports('open', 'person') #>> '{items,0,hub_slug}') = 'report-hub'
  and not (lv_api.lv_admin_reports('open', 'all')::text like '%reporter%'));
select t.put('rep', lv_api.lv_admin_reports('open', 'person') #>> '{items,0,id}');
select t.as_pg();
select t.check('staff: the account row carries its open-report count', (lv.admin_account_row(t.id('troll')) ->> 'open_reports') = '1');
select t.as_kpn(2);
select t.check('staff: a note is limited to 500 characters', t.code(lv_api.lv_admin_user_report_decide(t.id('rep'), 'actioned', repeat('x', 501))) = 'lv_invalid_input');
select t.check('staff: a report can be actioned with a note', t.code(lv_api.lv_admin_user_report_decide(t.id('rep'), 'actioned', 'Warned and removed the comment')) = 'ok');
select t.check('staff: it leaves the open queue and shows as actioned', jsonb_array_length(lv_api.lv_admin_reports('open', 'person') -> 'items') = 0
  and (lv_api.lv_admin_reports('actioned', 'person') #>> '{items,0,staff_note}') = 'Warned and removed the comment');
select t.as_kpn(3);
select t.check('staff: the reporter sees the outcome as a status only', (lv_api.lv_my_reports() #>> '{reports,0,status}') = 'actioned');
select t.as_kpn(3);
select t.check('staff: ordinary people cannot use the queue', t.code(lv_api.lv_admin_reports('open', 'all')) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_user_report_decide(t.id('rep'), 'dismissed')) = 'lv_forbidden');

-- ===== the rate limit =====================================================================================
select t.as_pg();
insert into lv.user_reports (reporter_account_id, target_kind, hub_id, reason, status)
  select t.id('reporter'), 'hub', t.id('hub'), 'spam', 'dismissed' from generate_series(1, 10) g;
select t.as_kpn(3);
select t.check('limits: a flood of reports in a day is refused politely', t.code(lv_api.lv_report_hub('report-hub', 'other')) = 'lv_rate_limited');

select t.as_pg();
select t.check('grants: the table and helpers are unreachable by API roles',
  not has_table_privilege('authenticated', 'lv.user_reports', 'select')
  and not has_function_privilege('authenticated', 'lv.api_report_account(uuid, uuid, uuid, text, text)', 'execute'));
rollback;
