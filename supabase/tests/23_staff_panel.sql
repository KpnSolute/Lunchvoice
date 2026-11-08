-- 23: STAFF PANEL (000023): staff management, Hub and account suspension, one reports queue, lookup, audit viewer.
select set_config('t.file', '23_staff_panel', false);
begin;

-- Run a statement with the harness owner's table rights but the CURRENT caller's claims (so the suspension
-- triggers see who is acting). Returns the error message, or 'ok'.
create function t.err_of(p_sql text) returns text language plpgsql security definer as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;
grant execute on function t.err_of(text) to public;
create function t.susp(p_msg text) returns boolean language sql immutable as $$ select p_msg like 'lv_suspended:%' $$;

select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Staff Two'); select lv_api.lv_my_context();
select t.put('admin', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Staff Three'); select lv_api.lv_my_context();
select t.put('admin3', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Member'); select lv_api.lv_my_context();
select t.put('member', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(5, null, true, 'Target'); select lv_api.lv_my_context();
select t.put('target', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(6, null, true, 'Outsider'); select lv_api.lv_my_context();
select t.as_kpn(7, 'unverified@example.invalid', false, 'Unverified'); select lv_api.lv_my_context();
select t.as_pg();
select lv.grant_platform_admin(t.id('admin'), null);
select t.grant_credit(t.id('owner'));
select t.grant_credit(t.id('target'));
select t.grant_credit(t.id('target'));

-- Hub A (to suspend) with a member, an active identified poll, a draft and an invite; Hub B owned by the target.
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('suspend-me', 'Suspend Me Club') ->> 'hub_id'));
select lv_api.lv_hub_update(t.id('hub'), null, 'public', 'approval', 'About us.');
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(4); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(5); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(1);
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Live poll', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q', (lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'How was it?') ->> 'question_id'));
select lv_api.lv_campaign_set_participation(t.id('c'), 'members_and_guests');
select lv_api.lv_campaign_activate(t.id('c'));
select t.put('jc', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));
select t.put('draft', (lv_api.lv_campaign_create(t.id('hub'), 'Draft', 'poll') ->> 'campaign_id'));
select t.as_kpn(4);
select lv_api.lv_submit_response(t.id('c'), format('[{"question_id":"%s","value":4}]', t.get('q'))::jsonb);
select t.as_kpn(5);
select t.put('hubB', (lv_api.lv_hub_create('target-hub', 'Target Hub') ->> 'hub_id'));
-- Discover: Hub A is a Team Hub with an approved application, so it is listed before any suspension.
select t.as_pg();
insert into lv.entitlements (scope, account_id, hub_id, family, product, source) values ('hub', t.id('owner'), t.id('hub'), 'team', 'team_hub', 'grant');
insert into lv.discover_applications (hub_id, submitted_by, genuine_members, status) values (t.id('hub'), t.id('owner'), 700, 'approved');

-- ===== access control =====================================================================================
select t.as_kpn(4);
select t.check('access: every staff-panel function refuses a non-admin with lv_forbidden',
  t.code(lv_api.lv_admin_staff_list()) = 'lv_forbidden' and t.code(lv_api.lv_admin_staff_add('person3@example.invalid')) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_staff_revoke(t.id('admin'))) = 'lv_forbidden' and t.code(lv_api.lv_admin_hub_suspend(t.id('hub'), 'x')) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_hub_unsuspend(t.id('hub'))) = 'lv_forbidden' and t.code(lv_api.lv_admin_account_suspend(t.id('target'), 'x')) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_account_unsuspend(t.id('target'))) = 'lv_forbidden' and t.code(lv_api.lv_admin_reports()) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_comment_hide(gen_random_uuid())) = 'lv_forbidden' and t.code(lv_api.lv_admin_comment_reports_dismiss(gen_random_uuid())) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_hub_search('suspend')) = 'lv_forbidden' and t.code(lv_api.lv_admin_account_search('person4@example.invalid')) = 'lv_forbidden'
  and t.code(lv_api.lv_admin_account_email_reveal(t.id('member'))) = 'lv_forbidden' and t.code(lv_api.lv_admin_audit()) = 'lv_forbidden');
select t.as_pg();
select t.check('access: a refused suspension changed nothing', t.q($$select count(*)::text from lv.hub_suspensions$$) = '0');
select t.as_anon();
select t.check('access: signed out, the staff-panel functions are not executable',
  t.raises('select lv_api.lv_admin_staff_list()', '42501') and t.raises($$select lv_api.lv_admin_staff_add('x@example.invalid')$$, '42501')
  and t.raises('select lv_api.lv_admin_audit()', '42501') and t.raises('select lv_api.lv_admin_reports()', '42501'));

-- ===== staff management ===================================================================================
select t.as_kpn(2);
select t.check('staff: the list shows active staff with names and who granted them',
  jsonb_array_length(lv_api.lv_admin_staff_list() -> 'staff') = 1
  and (lv_api.lv_admin_staff_list() #>> '{staff,0,display_name}') = 'Staff Two' and (lv_api.lv_admin_staff_list() #>> '{staff,0,is_me}') = 'true');
select t.put('nf', lv_api.lv_admin_staff_add('nobody@example.invalid')::text);
select t.check('staff: an email nobody verified is lv_not_found with the sign-in hint',
  t.code(t.get('nf')::jsonb) = 'lv_not_found' and (t.get('nf')::jsonb #>> '{error,message}') like '%sign in to LunchVoice once first%');
select t.check('staff: an unverified email never finds an account', t.code(lv_api.lv_admin_staff_add('unverified@example.invalid')) = 'lv_not_found');
select t.check('staff: a display name is not an email and never finds anyone', t.code(lv_api.lv_admin_staff_add('Staff Three')) = 'lv_invalid_input');
select t.age_session(3600);
select t.check('staff: adding needs a recent sign-in', t.code(lv_api.lv_admin_staff_add('person3@example.invalid')) = 'lv_reauth_required');
select t.as_kpn(2);
select t.put('add', lv_api.lv_admin_staff_add(' Person3@Example.invalid ')::text);
select t.check('staff: adding by verified email grants staff',
  t.code(t.get('add')::jsonb) = 'ok' and (t.get('add')::jsonb ->> 'account_id') = t.get('admin3') and (t.get('add')::jsonb ->> 'already_staff') = 'false');
select t.check('staff: adding again is idempotent', (lv_api.lv_admin_staff_add('person3@example.invalid') ->> 'already_staff') = 'true');
select t.check('staff: the list now has two, granted by Staff Two',
  jsonb_array_length(lv_api.lv_admin_staff_list() -> 'staff') = 2
  and (lv_api.lv_admin_staff_list() -> 'staff') @> '[{"display_name": "Staff Three", "granted_by_name": "Staff Two", "is_me": false}]'::jsonb);
select t.as_kpn(3);
select t.check('staff: the new staff member can open the panel', t.code(lv_api.lv_admin_overview()) = 'ok' and (lv_api.lv_admin_overview() ->> 'staff') = '2');
select t.check('staff: nobody can revoke themselves', t.code(lv_api.lv_admin_staff_revoke(t.id('admin3'))) = 'lv_conflict');
select t.age_session(3600);
select t.check('staff: revoking needs a recent sign-in', t.code(lv_api.lv_admin_staff_revoke(t.id('admin'))) = 'lv_reauth_required');
select t.as_kpn(2);
select t.check('staff: revoking someone who is not staff is lv_not_found', t.code(lv_api.lv_admin_staff_revoke(t.id('member'))) = 'lv_not_found');
select t.check('staff: revoking another staff member works', t.code(lv_api.lv_admin_staff_revoke(t.id('admin3'))) = 'ok');
select t.as_kpn(3);
select t.check('staff: a revoked member is refused at once', t.code(lv_api.lv_admin_overview()) = 'lv_forbidden');
select t.as_kpn(2);
select t.check('staff: the last staff member can never be removed (self-revoke of the last one is refused)',
  t.code(lv_api.lv_admin_staff_revoke(t.id('admin'))) = 'lv_conflict' and jsonb_array_length(lv_api.lv_admin_staff_list() -> 'staff') = 1);
select t.as_pg();
select t.check('staff: the last-staff guard holds even inside the function (counted under a lock)',
  t.q($$select (prosrc like '%pg_advisory_xact_lock%lv_staff%' and prosrc like '%<= 1%')::text from pg_proc where proname = 'api_admin_staff_revoke'$$) = 'true');
select t.check('staff: staff.added and staff.revoked are audited with the actor',
  t.q(format($q$select count(*)::text from lv.audit_events where action in ('staff.added', 'staff.revoked') and actor_account_id = %L::uuid and target = %L$q$,
             t.get('admin'), t.get('admin3'))) = '2');

-- ===== Hub suspension =====================================================================================
select t.as_anon();
select t.check('discover: the Team Hub is listed before suspension', (lv_api.lv_discover_list() -> 'hubs') @> '[{"slug": "suspend-me"}]'::jsonb);
select t.as_pg();
select t.put('before', t.q(format($q$select (select count(*) from lv.campaigns where hub_id = %1$L::uuid) || '|' || (select count(*) from lv.participation where hub_id = %1$L::uuid)$q$, t.get('hub'))));
select t.as_kpn(2);
select t.check('hub suspend: a reason is required', t.code(lv_api.lv_admin_hub_suspend(t.id('hub'), '  ')) = 'lv_invalid_input');
select t.check('hub suspend: staff suspend the Hub', t.code(lv_api.lv_admin_hub_suspend(t.id('hub'), 'Impersonation report')) = 'ok');
select t.as_kpn(1);
select t.check('hub suspend: the Owner sees the state and the reason',
  (lv_api.lv_hub_get('suspend-me') #>> '{hub,suspension,suspended}') = 'true' and (lv_api.lv_hub_get('suspend-me') #>> '{hub,suspension,reason}') = 'Impersonation report');
select t.as_kpn(5);
select t.check('hub suspend: a member sees a neutral state without the reason',
  (lv_api.lv_hub_get('suspend-me') #>> '{hub,suspension,suspended}') = 'true' and not (lv_api.lv_hub_get('suspend-me') -> 'hub' -> 'suspension' ? 'reason'));
select t.check('hub suspend: the member''s responses are refused (lv_closed)',
  t.code(lv_api.lv_submit_response(t.id('c'), format('[{"question_id":"%s","value":3}]', t.get('q'))::jsonb)) = 'lv_closed');
select t.as_anon();
select t.check('hub suspend: guests see the Campaign as closed and cannot submit',
  t.code(lv_api.lv_guest_campaign_get(t.get('jc'))) = 'lv_closed'
  and t.code(lv_api.lv_guest_submit(t.get('jc'), repeat('g', 40), format('[{"question_id":"%s","value":3}]', t.get('q'))::jsonb)) = 'lv_closed');
select t.check('hub suspend: the Hub is hidden from Discover', not ((lv_api.lv_discover_list() -> 'hubs') @> '[{"slug": "suspend-me"}]'::jsonb));
select t.as_kpn(1);
select t.check('hub suspend: the Owner cannot create a Campaign', t.code(lv_api.lv_campaign_create(t.id('hub'), 'New', 'poll')) = 'lv_suspended');
select t.check('hub suspend: the Owner cannot add questions to a draft', t.code(lv_api.lv_campaign_question_add(t.id('draft'), 1, 'rating', 'Q')) = 'lv_suspended');
select t.check('hub suspend: the Owner cannot publish (activate) or resume', t.code(lv_api.lv_campaign_activate(t.id('draft'))) in ('lv_suspended', 'lv_gate_blocked'));
select t.check('hub suspend: the Owner cannot create invites', t.code(lv_api.lv_invite_create(t.id('hub'))) = 'lv_suspended');
select t.check('hub suspend: the Owner cannot rename the Hub', t.code(lv_api.lv_hub_update(t.id('hub'), 'Renamed')) = 'lv_suspended');
select t.check('hub suspend: the Owner cannot create roles', t.code(lv_api.lv_role_create(t.id('hub'), 'helpers', 'star')) = 'lv_suspended');
select t.check('hub suspend: the Owner cannot write news (refused at the table)',
  t.susp(t.err_of(format($q$insert into lv.news_posts (hub_id, author_account_id, title) values (%L, %L, 'Hello')$q$, t.get('hub'), t.get('owner')))));
select t.check('hub suspend: comments, shop items, orders, pages, community settings, Discover and checkout are refused at the table',
  t.susp(t.err_of(format($q$insert into lv.comments (hub_id, author_account_id, body) values (%L, %L, 'x')$q$, t.get('hub'), t.get('owner'))))
  and t.susp(t.err_of(format($q$insert into lv.shop_items (hub_id, name, price_points) values (%L, 'Socks', 5)$q$, t.get('hub'))))
  and t.susp(t.err_of(format($q$insert into lv.hub_pages (hub_id, key, kind, title, position, enabled) values (%L, 'extra', 'custom', 'Extra', 9, true)$q$, t.get('hub'))))
  and t.susp(t.err_of(format($q$insert into lv.hub_community (hub_id, points_enabled) values (%L, true)
                                 on conflict (hub_id) do update set points_enabled = true$q$, t.get('hub'))))
  and t.susp(t.err_of(format($q$insert into lv.checkout_intents (account_id, product, hub_id, amount_cents) values (%L, 'team_hub', %L, 2900)$q$, t.get('owner'), t.get('hub')))));
select t.as_kpn(6);
select t.check('hub suspend: nobody can join', t.code(lv_api.lv_invite_redeem(t.get('code'))) in ('lv_suspended', 'lv_invalid_code'));
select t.check('hub suspend: joining is refused at the table', t.susp(t.err_of(format($q$insert into lv.hub_memberships (hub_id, account_id) values (%L, %L)$q$,
  t.get('hub'), t.q('select lv.current_account_id()::text')))));
select t.as_kpn(1);
select t.check('hub suspend: reads keep working for the Owner',
  t.code(lv_api.lv_campaign_list(t.id('hub'))) = 'ok' and t.code(lv_api.lv_campaign_get(t.id('c'))) = 'ok' and t.code(lv_api.lv_member_list(t.id('hub'))) = 'ok');
select t.check('hub suspend: closing a Campaign still works (it reduces exposure)', t.code(lv_api.lv_campaign_close(t.id('c'))) = 'ok');
select t.as_kpn(4);
select t.check('hub suspend: a member can still leave', t.code(lv_api.lv_member_leave(t.id('hub'))) = 'ok');
select t.as_pg();
select t.check('hub suspend: nothing was deleted',
  t.q(format($q$select (select count(*) from lv.campaigns where hub_id = %1$L::uuid) || '|' || (select count(*) from lv.participation where hub_id = %1$L::uuid)$q$, t.get('hub'))) = t.get('before'));
select t.as_kpn(2);
select t.check('hub suspend: staff may still moderate (block) inside a suspended Hub', t.code(lv_api.lv_admin_campaign_block(t.id('draft'), 'Test')) = 'ok'
  and t.code(lv_api.lv_admin_campaign_unblock(t.id('draft'))) = 'ok');
select t.check('hub unsuspend: staff lift the suspension', t.code(lv_api.lv_admin_hub_unsuspend(t.id('hub'))) = 'ok'
  and t.code(lv_api.lv_admin_hub_unsuspend(t.id('hub'))) = 'lv_not_found');
select t.as_kpn(1);
select t.check('hub unsuspend: writes work again and the state is gone',
  t.code(lv_api.lv_campaign_create(t.id('hub'), 'After', 'poll')) = 'ok' and not (lv_api.lv_hub_get('suspend-me') -> 'hub' ? 'suspension'));
select t.as_pg();
select t.check('hub suspend: suspended and unsuspended are audited',
  t.q(format($q$select count(*)::text from lv.audit_events where action in ('hub.suspended', 'hub.unsuspended') and hub_id = %L::uuid$q$, t.get('hub'))) = '2');

-- ===== account suspension =================================================================================
select t.as_kpn(2);
select t.check('account suspend: staff never suspend themselves', t.code(lv_api.lv_admin_account_suspend(t.id('admin'), 'x')) = 'lv_conflict');
select t.as_pg(); select lv.grant_platform_admin(t.id('admin3'), t.id('admin'));
select t.as_kpn(2);
select t.check('account suspend: another active staff member must be removed from staff first', t.code(lv_api.lv_admin_account_suspend(t.id('admin3'), 'x')) = 'lv_conflict');
select t.as_pg(); select lv.revoke_platform_admin(t.id('admin3'), t.id('admin'));
select t.as_kpn(2);
select t.check('account suspend: a reason is required', t.code(lv_api.lv_admin_account_suspend(t.id('target'), '')) = 'lv_invalid_input');
select t.check('account suspend: staff suspend the account', t.code(lv_api.lv_admin_account_suspend(t.id('target'), 'Spam')) = 'ok');
select t.as_kpn(5);
select t.check('account suspend: the person still signs in and sees why', t.code(lv_api.lv_my_context()) = 'ok'
  and (lv_api.lv_my_context() #>> '{suspension,reason}') = 'Spam');
select t.check('account suspend: cannot create a Hub', t.code(lv_api.lv_hub_create('another-target', 'Another')) = 'lv_suspended');
select t.check('account suspend: cannot create a Quick Survey', t.code(lv_api.lv_quick_survey_create('Mine', 'link')) = 'lv_suspended');
select t.check('account suspend: cannot create a Campaign in their own Hub', t.code(lv_api.lv_campaign_create(t.id('hubB'), 'X', 'poll')) = 'lv_suspended');
select t.check('account suspend: cannot rename their Hub or create invites',
  t.code(lv_api.lv_hub_update(t.id('hubB'), 'Renamed')) = 'lv_suspended' and t.code(lv_api.lv_invite_create(t.id('hubB'))) = 'lv_suspended');
select t.check('account suspend: cannot write news (refused at the table)',
  t.susp(t.err_of(format($q$insert into lv.news_posts (hub_id, author_account_id, title) values (%L, %L, 'Hello')$q$, t.get('hubB'), t.get('target')))));
select t.check('account suspend: cannot comment, order or buy (refused at the table)',
  t.susp(t.err_of(format($q$insert into lv.comments (hub_id, author_account_id, body) values (%L, %L, 'x')$q$, t.get('hub'), t.get('target'))))
  and t.susp(t.err_of(format($q$insert into lv.checkout_intents (account_id, product, amount_cents) values (%L, 'starter_hub', 1300)$q$, t.get('target')))));
select t.as_pg();
insert into lv.shop_items (hub_id, name, price_points) values (t.id('hub'), 'Socks', 5);
select t.as_kpn(5);
select t.check('account suspend: a shop order is refused at the table',
  t.susp(t.err_of(format($q$insert into lv.shop_orders (hub_id, item_id, account_id, item_name, points)
                             select hub_id, id, %L, name, price_points from lv.shop_items where hub_id = %L$q$, t.get('target'), t.get('hub')))));
select t.as_kpn(1);
select t.put('c2', (lv_api.lv_campaign_create(t.id('hub'), 'Second poll', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q2', (lv_api.lv_campaign_question_add(t.id('c2'), 1, 'rating', 'How?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('c2'));
select t.as_kpn(5);
select t.check('account suspend: reads still work', t.code(lv_api.lv_campaign_list(t.id('hubB'))) = 'ok' and t.code(lv_api.lv_campaign_get(t.id('c2'))) = 'ok');
select t.check('account suspend: answering a Campaign is still allowed',
  t.code(lv_api.lv_submit_response(t.id('c2'), format('[{"question_id":"%s","value":5}]', t.get('q2'))::jsonb)) = 'ok');
select t.check('account suspend: leaving a Hub still works', t.code(lv_api.lv_member_leave(t.id('hub'))) = 'ok');
select t.check('account suspend: deleting their Hub still works', t.code(lv_api.lv_hub_delete(t.id('hubB'), 'target-hub')) = 'ok');
select t.as_kpn(2);
select t.check('account unsuspend: staff lift it, and the person can create again',
  t.code(lv_api.lv_admin_account_unsuspend(t.id('target'))) = 'ok');
select t.as_kpn(5);
select t.check('account unsuspend: creating works again', t.code(lv_api.lv_quick_survey_create('Back', 'link')) = 'ok');
select t.as_kpn(2);
select lv_api.lv_admin_account_suspend(t.id('target'), 'Spam again');
select t.as_kpn(5);
select t.check('account suspend: a suspended account can still delete itself', t.code(lv_api.lv_account_delete('DELETE')) = 'ok');
select t.as_pg();
select t.check('account suspend: the suspension went with the deleted account',
  t.q(format($q$select count(*)::text from lv.account_suspensions where account_id = %L::uuid$q$, t.get('target'))) = '0');

-- ===== one reports queue ==================================================================================
select t.as_kpn(4); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_anon();
select lv_api.lv_report_abuse(t.get('jc'), 'Asks for passwords');
select t.as_pg();
insert into lv.comments (hub_id, author_account_id, body) values (t.id('hub'), t.id('member'), 'Rude comment');
insert into lv.comments (hub_id, author_account_id, body) values (t.id('hub'), t.id('member'), 'Odd comment');
select t.put('cm1', t.q($$select id::text from lv.comments where body = 'Rude comment'$$));
select t.put('cm2', t.q($$select id::text from lv.comments where body = 'Odd comment'$$));
insert into lv.comment_reports (comment_id, reporter_account_id, reason) values (t.id('cm1'), t.id('owner'), 'Insults'), (t.id('cm2'), t.id('owner'), 'Spam?');
select t.as_kpn(2);
select t.put('rq', lv_api.lv_admin_reports()::text);
select t.check('reports: survey and comment reports share one queue',
  jsonb_array_length(t.get('rq')::jsonb -> 'items') = 3
  and (t.get('rq')::jsonb -> 'items') @> jsonb_build_array(jsonb_build_object('type', 'survey', 'campaign_id', t.get('c'), 'hub_slug', 'suspend-me'))
  and (t.get('rq')::jsonb -> 'items') @> jsonb_build_array(jsonb_build_object('type', 'comment', 'comment_id', t.get('cm1'), 'hub_slug', 'suspend-me')));
select t.check('reports: the reporter is never returned', t.get('rq') not like '%' || t.get('owner') || '%' and t.get('rq') not like '%reporter%');
select t.check('reports: the type filter works',
  jsonb_array_length(lv_api.lv_admin_reports('open', 'comment') -> 'items') = 2 and jsonb_array_length(lv_api.lv_admin_reports('open', 'survey') -> 'items') = 1);
select t.check('reports: an unknown filter is lv_invalid_input', t.code(lv_api.lv_admin_reports('open', 'weird')) = 'lv_invalid_input');
select t.put('hide', lv_api.lv_admin_comment_hide(t.id('cm1'))::text);
select t.check('reports: hiding a comment actions its reports', t.code(t.get('hide')::jsonb) = 'ok'
  and (lv_api.lv_admin_reports('actioned', 'comment') #>> '{items,0,hidden}') = 'true');
select t.put('dis', lv_api.lv_admin_comment_reports_dismiss(t.id('cm2'))::text);
select t.check('reports: dismissing comment reports, once', t.code(t.get('dis')::jsonb) = 'ok'
  and t.code(lv_api.lv_admin_comment_reports_dismiss(t.id('cm2'))) = 'lv_not_found'
  and jsonb_array_length(lv_api.lv_admin_reports('dismissed', 'comment') -> 'items') = 1);
select t.as_pg();
select t.check('reports: a hidden comment is kept (never deleted)', t.q(format($q$select (hidden_at is not null)::text from lv.comments where id = %L::uuid$q$, t.get('cm1'))) = 'true');
select t.as_kpn(2);
select t.put('srep', (lv_api.lv_admin_reports('open', 'survey') #>> '{items,0,id}'));
select t.put('sdis', lv_api.lv_admin_report_dismiss(t.id('srep'))::text);
select t.check('reports: a survey report is dismissed through the same queue', t.code(t.get('sdis')::jsonb) = 'ok'
  and jsonb_array_length(lv_api.lv_admin_reports('open') -> 'items') = 0);

-- ===== lookup =============================================================================================
select t.put('hs', lv_api.lv_admin_hub_search('SUSPEND')::text);
select t.check('lookup: Hubs are found by slug or name with plan, members and suspension state',
  (t.get('hs')::jsonb #>> '{hubs,0,slug}') = 'suspend-me' and (t.get('hs')::jsonb #>> '{hubs,0,member_count}')::int >= 2
  and (t.get('hs')::jsonb #>> '{hubs,0,plan,family}') = 'team' and (t.get('hs')::jsonb #>> '{hubs,0,created_at}') is not null
  and (t.get('hs')::jsonb #> '{hubs,0,suspension}') = 'null'::jsonb);
select t.check('lookup: Hub search by name works too', (lv_api.lv_admin_hub_search('me club') #>> '{hubs,0,slug}') = 'suspend-me');
select t.put('as', lv_api.lv_admin_account_search('PERSON4@example.invalid')::text);
select t.check('lookup: an account is found by exact verified email, and the email is not echoed',
  (t.get('as')::jsonb #>> '{accounts,0,account_id}') = t.get('member') and t.get('as') not like '%@%'
  and (t.get('as')::jsonb #>> '{accounts,0,display_name}') = 'Member');
select t.check('lookup: a partial email never searches (no enumeration)', t.code(lv_api.lv_admin_account_search('person4@')) = 'lv_invalid_input'
  and jsonb_array_length(lv_api.lv_admin_account_search('unverified@example.invalid') -> 'accounts') = 0);
select t.check('lookup: revealing the email is a deliberate call', (lv_api.lv_admin_account_email_reveal(t.id('member')) #>> '{emails,0}') = 'person4@example.invalid');
select t.as_pg();
select t.check('lookup: a reveal is audited (target account, no address)',
  t.q(format($q$select count(*)::text from lv.audit_events where action = 'admin.email_revealed' and target = %L and detail::text not like '%%@%%'$q$, t.get('member'))) = '1');

-- ===== audit viewer =======================================================================================
select t.as_kpn(2);
select t.put('au', lv_api.lv_admin_audit()::text);
select t.check('audit: staff actions are listed with the actor''s name, never the detail',
  (t.get('au')::jsonb -> 'events') @> '[{"action": "staff.added", "actor_name": "Staff Two"}]'::jsonb
  and (t.get('au')::jsonb -> 'events') @> '[{"action": "hub.suspended"}]'::jsonb
  and not (t.get('au')::jsonb -> 'events' -> 0 ? 'detail') and t.get('au') not like '%Impersonation report%');
select t.check('audit: the staff scope leaves out ordinary activity', not ((t.get('au')::jsonb -> 'events') @> '[{"action": "hub.created"}]'::jsonb)
  and (lv_api.lv_admin_audit('all') -> 'events') @> '[{"action": "hub.created"}]'::jsonb);
select t.check('audit: the action filter narrows by prefix',
  (select bool_and(e->>'action' like 'hub.%') from jsonb_array_elements(lv_api.lv_admin_audit('staff', 'hub.') -> 'events') e)
  and jsonb_array_length(lv_api.lv_admin_audit('staff', 'hub.') -> 'events') = 2);
select t.check('audit: the actor filter works',
  (select bool_and(e->>'actor_account_id' = t.get('member')) and count(*) > 0 from jsonb_array_elements(lv_api.lv_admin_audit('all', null, t.id('member')) -> 'events') e)
  and jsonb_array_length(lv_api.lv_admin_audit('staff', null, t.id('member')) -> 'events') = 0);
select t.check('audit: an unknown scope is lv_invalid_input', t.code(lv_api.lv_admin_audit('everything')) = 'lv_invalid_input');

-- ===== overview and grants ================================================================================
select t.check('overview: suspensions, staff and comment reports are counted',
  (lv_api.lv_admin_overview() ->> 'hubs_suspended') = '0' and (lv_api.lv_admin_overview() ->> 'staff') = '1'
  and (lv_api.lv_admin_overview() ->> 'comment_reports_open') = '0');
select t.as_pg();
select t.check('grants: no staff-panel function is executable by anon',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and p.proname like 'lv_admin_%' and has_function_privilege('anon', p.oid, 'execute')$$) = '0');
select t.check('grants: every staff-panel function is executable by authenticated',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and p.proname like 'lv_admin_%' and not has_function_privilege('authenticated', p.oid, 'execute')$$) = '0');
select t.check('grants: the new tables have row level security and no API grants',
  t.q($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'lv' and c.relname in ('hub_suspensions', 'account_suspensions', 'comment_report_reviews')
           and (not c.relrowsecurity or has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))$$) = '0');
select t.check('grants: the suspension helper is not callable by API roles',
  not has_function_privilege('authenticated', 'lv.assert_not_suspended(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'lv.assert_not_suspended(uuid, uuid)', 'execute'));

rollback;
