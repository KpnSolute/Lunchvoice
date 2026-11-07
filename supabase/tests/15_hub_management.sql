-- 15: HUB AND ACCOUNT MANAGEMENT (000015, launch plan step 3).
select set_config('t.file', '15_hub_management', false);
begin;

select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Heir'); select lv_api.lv_my_context();
select t.put('heir', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Respondent'); select lv_api.lv_my_context();
select t.put('resp', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'));
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('manage-hub', 'Manage Hub') ->> 'hub_id'));
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(2); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(3); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_pg();
select t.put('m_heir', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('heir'))));
select t.put('m_resp', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('resp'))));

-- ===== hub update ========================================================================================
select t.as_kpn(1);
select t.check('update: name, visibility, membership, about and accent change together',
  (lv_api.lv_hub_update(t.id('hub'), 'Managed Hub', 'public', 'approval', 'We talk lunch.', 'teal') #>> '{hub,accent}') = 'teal');
select t.check('update: hub_get shows about, accent and the palette',
  (lv_api.lv_hub_get('manage-hub') #>> '{hub,about}') = 'We talk lunch.'
  and jsonb_array_length(lv_api.lv_hub_get('manage-hub') -> 'accents') = 9
  and (lv_api.lv_hub_get('manage-hub') #>> '{membership,plan,family}') = 'starter');
select t.check('update: an accent outside the palette is lv_invalid_input', t.code(lv_api.lv_hub_update(t.id('hub'), null, null, null, null, '#ff00ff')) = 'lv_invalid_input');
select t.check('update: a bad visibility is lv_invalid_input', t.code(lv_api.lv_hub_update(t.id('hub'), null, 'listed')) = 'lv_invalid_input');
select t.check('update: omitted fields stay', (lv_api.lv_hub_update(t.id('hub'), null, null, null, null, null) #>> '{hub,name}') = 'Managed Hub');
select t.as_kpn(2);
select t.check('update: a member without hub.settings.manage is lv_forbidden', t.code(lv_api.lv_hub_update(t.id('hub'), 'Mine')) = 'lv_forbidden');
select t.as_anon();
select t.check('update: hub_get still works signed out for a public Hub', (lv_api.lv_hub_get('manage-hub') #>> '{hub,accent}') = 'teal');

-- ===== pages =============================================================================================
select t.as_anon();
select t.check('pages: a public Hub shows its default pages signed out',
  (select string_agg(e->>'kind', ',' order by (e->>'position')::int) from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e) = 'home,campaigns');
select t.as_kpn(1);
select t.put('pg', lv_api.lv_hub_pages_update(t.id('hub'), '[
  {"key":"menu","kind":"custom","title":"Menu","body":"Soup","position":2},
  {"key":"faq","kind":"custom","title":"FAQ","position":3,"enabled":false},
  {"key":"shop","kind":"shop","title":"Shop","position":4}]'::jsonb)::text);
select t.check('pages: custom pages are saved and the system pages are added back',
  t.code(t.get('pg')::jsonb) = 'ok' and jsonb_array_length(t.get('pg')::jsonb -> 'pages') = 5);
select t.check('pages: custom slots follow the Starter map (3)',
  (lv_api.lv_hub_pages_get(t.id('hub')) -> 'custom_slots') = '{"used": 2, "limit": 3}'::jsonb);
select t.put('pg4', lv_api.lv_hub_pages_update(t.id('hub'), '[
  {"key":"a","kind":"custom","title":"A"},{"key":"b","kind":"custom","title":"B"},
  {"key":"c","kind":"custom","title":"C"},{"key":"d","kind":"custom","title":"D"}]'::jsonb)::text);
select t.check('pages: a fourth custom page is lv_limit_reached with limit and used',
  t.code(t.get('pg4')::jsonb) = 'lv_limit_reached' and (t.get('pg4')::jsonb #>> '{error,limit}') = '3' and (t.get('pg4')::jsonb #>> '{error,used}') = '4');
select t.check('pages: a refused update changes nothing', (lv_api.lv_hub_pages_get(t.id('hub')) #>> '{custom_slots,used}') = '2');
select t.check('pages: an unknown kind is lv_invalid_input', t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[{"key":"x","kind":"html","title":"X"}]'::jsonb)) = 'lv_invalid_input');
select t.check('pages: duplicate keys are lv_invalid_input', t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[{"key":"x","kind":"custom","title":"X"},{"key":"x","kind":"custom","title":"Y"}]'::jsonb)) = 'lv_invalid_input');
select t.as_kpn(3);
select t.check('pages: members see only enabled pages',
  jsonb_array_length(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') = 4);
select t.check('pages: a member cannot edit pages', t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[]'::jsonb)) = 'lv_forbidden');
select t.as_pg();
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where hub_id = t.id('hub');
select t.as_kpn(1);
select t.check('pages: editing pages needs an active plan', t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[]'::jsonb)) = 'lv_entitlement_required');
select t.check('pages: reading pages works without one', t.code(lv_api.lv_hub_pages_get(t.id('hub'))) = 'ok');
select t.as_pg();
update lv.entitlements set ends_at = null where hub_id = t.id('hub');

-- ===== personal spaces are not Hubs ======================================================================
select t.as_kpn(3);
select lv_api.lv_quick_survey_create('My survey', 'link');
select t.put('personal', t.q(format($q$select id::text from lv.hubs where owner_account_id = %L::uuid and kind = 'personal'$q$, t.get('resp'))));
select t.check('personal: update, pages, transfer and delete answer lv_not_found',
  t.code(lv_api.lv_hub_update(t.id('personal'), 'Renamed')) = 'lv_not_found'
  and t.code(lv_api.lv_hub_pages_get(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_hub_pages_update(t.id('personal'), '[]'::jsonb)) = 'lv_not_found'
  and t.code(lv_api.lv_owner_transfer(t.id('personal'), gen_random_uuid(), 'x')) = 'lv_not_found'
  and t.code(lv_api.lv_hub_delete(t.id('personal'), 'x')) = 'lv_not_found');

-- ===== owner transfer ====================================================================================
select t.as_kpn(2);
select t.check('transfer: only the Owner can transfer', t.code(lv_api.lv_owner_transfer(t.id('hub'), t.id('m_heir'), 'manage-hub')) = 'lv_forbidden');
select t.as_kpn(1);
select t.check('transfer: a wrong confirmation is lv_confirmation_mismatch',
  t.code(lv_api.lv_owner_transfer(t.id('hub'), t.id('m_heir'), 'Manage-Hub')) = 'lv_confirmation_mismatch');
select t.age_session(3600);
select t.check('transfer: a stale session is lv_reauth_required', t.code(lv_api.lv_owner_transfer(t.id('hub'), t.id('m_heir'), 'manage-hub')) = 'lv_reauth_required');
select t.as_kpn(1);
select t.check('transfer: an unknown membership is lv_not_found', t.code(lv_api.lv_owner_transfer(t.id('hub'), gen_random_uuid(), 'manage-hub')) = 'lv_not_found');
select t.as_pg();
update lv.hub_memberships set status = 'pending' where id = t.id('m_resp');
select t.as_kpn(1);
select t.check('transfer: the target must be an accepted member', t.code(lv_api.lv_owner_transfer(t.id('hub'), t.id('m_resp'), 'manage-hub')) = 'lv_not_accepted');
select t.check('transfer: the Owner transfers to an accepted member', t.code(lv_api.lv_owner_transfer(t.id('hub'), t.id('m_heir'), 'manage-hub')) = 'ok');
select t.as_pg();
select t.check('transfer: the Hub owner and the Owner role moved together',
  t.q(format($q$select (h.owner_account_id = %L::uuid)::text || '|' || (select count(*) from lv.membership_roles mr join lv.roles r on r.id = mr.role_id
                where r.hub_id = h.id and r.is_owner and mr.membership_id = %L::uuid)::text from lv.hubs h where h.id = %L::uuid$q$,
             t.get('heir'), t.get('m_heir'), t.get('hub'))) = 'true|1');
select t.check('transfer: there is still exactly one Owner role assignment',
  t.q(format($q$select count(*)::text from lv.membership_roles mr join lv.roles r on r.id = mr.role_id where r.hub_id = %L::uuid and r.is_owner$q$, t.get('hub'))) = '1');
select t.check('transfer: the new Owner membership is protected',
  t.raises(format($q$update lv.hub_memberships set status = 'removed' where id = %L::uuid$q$, t.get('m_heir')), '42501'));
select t.check('transfer: the owner still cannot be changed directly',
  t.raises(format($q$update lv.hubs set owner_account_id = %L::uuid where id = %L::uuid$q$, t.get('owner'), t.get('hub')), '42501'));
select t.as_kpn(1);
select t.check('transfer: the former Owner is an ordinary member now', t.code(lv_api.lv_hub_update(t.id('hub'), 'Back')) = 'lv_forbidden'
  and t.code(lv_api.lv_member_leave(t.id('hub'))) = 'ok');
select t.as_pg();
select t.check('transfer: audited', t.q(format($q$select count(*)::text from lv.audit_events where action = 'hub.owner_transferred' and hub_id = %L::uuid$q$, t.get('hub'))) = '1');

-- ===== account delete ====================================================================================
-- An identified and an anonymous Campaign with answers from the respondent.
select t.as_pg();
update lv.hub_memberships set status = 'accepted' where id = t.id('m_resp');
select t.as_kpn(2);
select t.put('ci', (lv_api.lv_campaign_create(t.id('hub'), 'Named', 'poll', 'identified') ->> 'campaign_id'));
select t.put('ciq', (lv_api.lv_campaign_question_add(t.id('ci'), 1, 'yes_no', 'Yes?') ->> 'question_id'));
select t.put('ciq2', (lv_api.lv_campaign_question_add(t.id('ci'), 2, 'text', 'Why?') ->> 'question_id'));
select t.put('ca', (lv_api.lv_campaign_create(t.id('hub'), 'Secret', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('caq', (lv_api.lv_campaign_question_add(t.id('ca'), 1, 'yes_no', 'Yes?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('ci')); select lv_api.lv_campaign_activate(t.id('ca'));
select t.as_kpn(3);
select lv_api.lv_waitlist_join('resp@example.invalid', 'Resp Hub', '2026-11-07');
select lv_api.lv_submit_response(t.id('ci'), format('[{"question_id":"%s","value":"yes"},{"question_id":"%s","value":"I am Pat from room 4"}]', t.get('ciq'), t.get('ciq2'))::jsonb);
select t.put('mycampinv', (lv_api.lv_campaign_invite_create(
  (lv_api.lv_quick_survey_create('Invite me', 'invite') #>> '{campaign,campaign_id}')::uuid) #>> '{invite,token}'));
select lv_api.lv_submit_response(t.id('ca'), format('[{"question_id":"%s","value":"no"}]', t.get('caq'))::jsonb);
select t.check('delete: the confirmation must be DELETE', t.code(lv_api.lv_account_delete('delete')) = 'lv_confirmation_mismatch');
select t.age_session(3600);
select t.check('delete: a stale session is lv_reauth_required', t.code(lv_api.lv_account_delete('DELETE')) = 'lv_reauth_required');
select t.as_kpn(2);
select t.check('delete: an owner of a community Hub is refused', t.code(lv_api.lv_account_delete('DELETE')) = 'lv_owner_protected');
select t.as_kpn(3);
select t.check('delete: the respondent deletes their account', t.code(lv_api.lv_account_delete('DELETE')) = 'ok');
select t.as_pg();
select t.check('delete: the account and identity are gone',
  t.q(format($q$select (select count(*) from lv.accounts where id = %L::uuid) + (select count(*) from lv.account_identities where account_id = %L::uuid)$q$, t.get('resp'), t.get('resp'))) = '0');
select t.check('delete: the personal space and its Quick Surveys are gone',
  t.q(format($q$select count(*)::text from lv.hubs where id = %L::uuid$q$, t.get('personal'))) = '0');
select t.check('delete: the identified submission stays, irreversibly unlinked',
  t.q(format($q$select count(*)::text || '|' || count(account_id)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('ci'))) = '1|0');
select t.check('delete: its structured answer stays and its free-text answer is deleted',
  t.q(format($q$select string_agg(q.kind, ',' order by q.kind) from lv.answers a join lv.campaign_questions q on q.id = a.question_id
                 where q.campaign_id = %L::uuid$q$, t.get('ci'))) = 'yes_no');
select t.check('delete: the account''s participation rows are deleted (nothing joins back)',
  t.q(format($q$select count(*)::text from lv.participation where campaign_id in (%L::uuid, %L::uuid)$q$, t.get('ci'), t.get('ca'))) = '0');
select t.check('delete: the anonymous answer stays as an aggregate',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('ca'))) = '1');
select t.check('delete: invitations it created are deleted',
  t.q(format($q$select count(*)::text from lv.campaign_invites where token = %L$q$, t.get('mycampinv'))) = '0');
select t.check('delete: the waitlist row and contact email are gone', t.q($$select count(*)::text from lv.waitlist_entries where contact_email = 'resp@example.invalid'$$) = '0');
select t.check('delete: no audit row names the account',
  t.q(format($q$select count(*)::text from lv.audit_events where actor_account_id = %L::uuid or target = %L or detail::text like %L$q$, t.get('resp'), t.get('resp'), '%' || t.get('resp') || '%')) = '0');
select t.check('delete: the unlinked submission keeps no exact time (UTC day only), nor do its answers',
  t.q(format($q$select bool_and(s.created_at = date_trunc('day', s.created_at at time zone 'UTC') at time zone 'UTC'
                       and not exists (select 1 from lv.answers a where a.submission_id = s.id and a.created_at <> s.created_at))::text
                 from lv.submissions s where s.campaign_id = %L::uuid$q$, t.get('ci'))) = 'true');
-- No row anywhere in lv may still carry the old account id or its identity subject (LC-16, F-05).
do $$
declare
  r record;
  v_hits int := 0;
  v_n int;
  v_where text := '';
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'lv' and c.relkind = 'r' loop
    execute format('select count(*) from lv.%I x where x::text like $1 or x::text like $2', r.relname)
      into v_n using '%' || t.get('resp') || '%', '%' || t.sub(3)::text || '%';
    if v_n > 0 then v_hits := v_hits + v_n; v_where := v_where || r.relname || ' '; end if;
  end loop;
  perform t.check('delete: no lv row references the deleted account id or identity subject', v_hits = 0, v_where);
end $$;
select t.check('delete: the membership is gone and member totals drop',
  t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid$q$, t.get('hub'))) = '2');
select t.as_kpn(3);
select t.check('delete: signing in again starts a fresh account', t.code(lv_api.lv_my_context()) = 'ok'
  and t.q($$select lv.current_account_id()::text$$) <> t.get('resp'));

-- ===== profile ===========================================================================================
select t.check('profile: the display name changes', (lv_api.lv_profile_update('  New Name ') #>> '{account,display_name}') = 'New Name'
  and (lv_api.lv_my_context() ->> 'display_name') = 'New Name');
select t.check('profile: a blank name is lv_invalid_input', t.code(lv_api.lv_profile_update('  ')) = 'lv_invalid_input');

-- ===== hub delete ========================================================================================
select t.as_kpn(1);
select t.check('hub delete: a non-owner is refused', t.code(lv_api.lv_hub_delete(t.id('hub'), 'manage-hub')) in ('lv_forbidden', 'lv_not_found'));
select t.as_kpn(2);
select t.check('hub delete: a wrong confirmation is lv_confirmation_mismatch', t.code(lv_api.lv_hub_delete(t.id('hub'), 'manage hub')) = 'lv_confirmation_mismatch');
select t.age_session(3600);
select t.check('hub delete: a stale session is lv_reauth_required', t.code(lv_api.lv_hub_delete(t.id('hub'), 'manage-hub')) = 'lv_reauth_required');
select t.as_kpn(2);
select t.check('hub delete: the Owner deletes the Hub', t.code(lv_api.lv_hub_delete(t.id('hub'), 'manage-hub')) = 'ok');
select t.as_pg();
select t.check('hub delete: all Hub data is gone',
  t.q(format($q$select ((select count(*) from lv.hubs where id = %1$L::uuid) + (select count(*) from lv.campaigns where hub_id = %1$L::uuid)
               + (select count(*) from lv.submissions where hub_id = %1$L::uuid) + (select count(*) from lv.hub_memberships where hub_id = %1$L::uuid)
               + (select count(*) from lv.hub_pages where hub_id = %1$L::uuid))::text$q$, t.get('hub'))) = '0');
select t.check('hub delete: only a tombstone remains (slug and time, nothing else)',
  t.q($$select count(*)::text from lv.hub_tombstones where slug = 'manage-hub'$$) = '1'
  and t.q($$select string_agg(column_name, ',' order by column_name) from information_schema.columns
           where table_schema = 'lv' and table_name = 'hub_tombstones'$$) = 'deleted_at,id,slug');
select t.as_anon();
select t.check('quarantine: reading the old slug answers the neutral lv_hub_gone', t.code(lv_api.lv_hub_get('manage-hub')) = 'lv_hub_gone'
  and not (lv_api.lv_hub_get('manage-hub') ? 'hub'));
select t.as_pg();
select t.grant_credit(t.id('owner'));
select t.grant_credit(t.id('heir'));
select t.as_kpn(1);
select t.check('quarantine: nobody can claim it for 30 days', t.code(lv_api.lv_hub_create('manage-hub', 'Grab')) = 'lv_conflict');
select t.as_kpn(2);
select t.check('quarantine: not even the former Owner', t.code(lv_api.lv_hub_create('manage-hub', 'Back')) = 'lv_conflict');
select t.as_pg();
update lv.hub_tombstones set deleted_at = now() - interval '31 days' where slug = 'manage-hub';
select t.as_anon();
select t.check('after quarantine: an unclaimed slug is simply lv_not_found', t.code(lv_api.lv_hub_get('manage-hub')) = 'lv_not_found');
select t.as_kpn(1);
select t.check('after quarantine: the slug can be claimed, with a new Hub id',
  t.code(lv_api.lv_hub_create('manage-hub', 'New Owner Hub')) = 'ok'
  and t.q($$select id::text from lv.hubs where slug = 'manage-hub'$$) <> t.get('hub'));
select t.check('after quarantine: the new Hub shows none of the old data',
  (lv_api.lv_hub_get('manage-hub') #>> '{hub,about}') is null
  and (lv_api.lv_hub_pages_get(t.q($$select id::text from lv.hubs where slug = 'manage-hub'$$)::uuid) #>> '{custom_slots,used}') = '0');

rollback;
