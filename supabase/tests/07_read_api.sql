-- 07: READ API (000007). The surface the v2 frontend uses to render without touching tables.
--
-- Proves: context carries roles/capabilities, beta status reads, Hub-by-slug respects visibility, Campaign
-- list/detail are respondent-safe (drafts hidden, no other people's data), member/invite lists are gated,
-- invite preview does not consume a use, and reserved slugs cannot be taken by any path.
select set_config('t.file', '07_read_api', false);
begin;

update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';
select t.trust_test_issuer();

-- People: 1 operator/reviewer, 2 owner, 3 member, 4 outsider.
select t.as_kpn(1, 'reviewer@example.invalid', true, 'Reviewer'); select lv_api.lv_my_context();
select t.put('reviewer', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, 'owner@example.invalid', true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, 'member@example.invalid', true, 'Member'); select lv_api.lv_my_context();
select t.put('member', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, 'outsider@example.invalid', true, 'Outsider'); select lv_api.lv_my_context();

select t.as_pg();
select lv.grant_platform_admin(t.id('reviewer'), null);

-- ===== beta status ======================================================================================
select t.as_kpn(2);
select t.check('beta: no application reads as none',
  lv_api.lv_beta_status() ->> 'status' = 'none');
select t.check('beta: context also reports none', lv_api.lv_my_context() ->> 'beta_status' = 'none');
select lv_api.lv_beta_apply('read api test');
select t.check('beta: pending after applying', lv_api.lv_beta_status() ->> 'status' = 'pending');
select t.as_pg();
select t.put('app', t.q(format($q$select id::text from lv.beta_applications where account_id = %L::uuid$q$, t.get('owner'))));
select t.as_kpn(1);
select lv_api.lv_beta_decide(t.id('app'), true);
select t.as_kpn(2);
select t.check('beta: approved is visible to the applicant', lv_api.lv_beta_status() ->> 'status' = 'approved');
select t.as_anon();
select t.check('beta: anonymous callers are told to sign in', t.code(lv_api.lv_beta_status()) = 'lv_unauthenticated');

-- ===== Hub creation and reserved slugs ==================================================================
select t.as_kpn(2);
select t.check('slug: a reserved word is refused', t.code(lv_api.lv_hub_create('me', 'Me')) = 'lv_invalid_input');
select t.check('slug: reserved words are matched case-insensitively', t.code(lv_api.lv_hub_create('ANALYTICS', 'A')) = 'lv_invalid_input');
select t.as_pg();
select t.check('slug: a double hyphen is refused by the database',
  t.raises($$insert into lv.hubs (slug, display_name, owner_account_id) values ('bad--slug', 'x', (select id from lv.accounts limit 1))$$));
select t.check('slug: a reserved word cannot be inserted around lv_hub_create',
  t.raises($$insert into lv.hubs (slug, display_name, owner_account_id) values ('beta', 'x', (select id from lv.accounts limit 1))$$));
select t.as_kpn(2);
select t.check('hub: an approved applicant creates a Hub', t.code(lv_api.lv_hub_create('lioncafe', 'LionCafe')) = 'ok');
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'lioncafe'$$));

-- Invitation with a known code, a draft Campaign and an active Campaign with questions.
select t.as_pg();
insert into lv.hub_invites (hub_id, code_hash, created_by, max_uses)
values (t.id('hub'), lv.invite_hash('READ-API-CODE'), t.id('owner'), 2);

select t.as_kpn(2);
select lv_api.lv_campaign_create(t.id('hub'), 'Draft only', 'survey', 'anonymous');
select t.put('draft', t.q($$select id::text from lv.campaigns where title = 'Draft only'$$));
select lv_api.lv_campaign_create(t.id('hub'), 'Live survey', 'survey', 'anonymous');
select t.put('live', t.q($$select id::text from lv.campaigns where title = 'Live survey'$$));
select lv_api.lv_campaign_question_add(t.id('live'), 1, 'rating', 'How was lunch?', '{}'::jsonb);
select lv_api.lv_campaign_question_add(t.id('live'), 2, 'single_choice', 'Favourite?', '{"options":["soup","pizza"]}'::jsonb);
select lv_api.lv_campaign_activate(t.id('live'));
select t.as_pg();
select t.put('q1', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and position = 1$q$, t.get('live'))));
select t.put('q2', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and position = 2$q$, t.get('live'))));

-- ===== invite preview ===================================================================================
select t.as_kpn(3);
select t.check('preview: a valid code names the Hub', lv_api.lv_invite_preview('read-api-code') #>> '{hub,slug}' = 'lioncafe');
select t.check('preview: it says the caller is not yet a member', (lv_api.lv_invite_preview('READ-API-CODE') ->> 'already_member') = 'false');
select t.as_pg();
select t.check('preview: previewing consumes no use',
  t.q($$select uses::text from lv.hub_invites where code_hash = lv.invite_hash('READ-API-CODE')$$) = '0');
select t.as_kpn(3);
select t.check('preview: an unknown code looks the same as a bad one', t.code(lv_api.lv_invite_preview('NOPE')) = 'lv_invalid_code');
select t.as_anon();
select t.check('preview: signed-out callers cannot probe codes', t.code(lv_api.lv_invite_preview('READ-API-CODE')) = 'lv_unauthenticated');
select t.as_kpn(3);
select lv_api.lv_invite_redeem('READ-API-CODE');
select t.check('preview: a member is told they are already in', (lv_api.lv_invite_preview('READ-API-CODE') ->> 'already_member') = 'true');

-- ===== context ==========================================================================================
select t.as_kpn(2);
select t.check('context: the Owner sees the Owner role and campaign.manage',
  (lv_api.lv_my_context() #>> '{hubs,0,capabilities}') like '%campaign.manage%'
  and (lv_api.lv_my_context() #>> '{hubs,0,roles,0,key}') = 'owner');
select t.as_kpn(3);
select t.check('context: a plain member has the Hub but no capabilities',
  (lv_api.lv_my_context() #>> '{hubs,0,slug}') = 'lioncafe'
  and (lv_api.lv_my_context() #> '{hubs,0,capabilities}') = '[]'::jsonb);
select t.as_kpn(1);
select t.check('context: the reviewer is flagged as platform admin', (lv_api.lv_my_context() ->> 'is_platform_admin') = 'true');

-- ===== Hub by slug ======================================================================================
select t.as_kpn(3);
select t.check('hub_get: a member gets membership details',
  (lv_api.lv_hub_get('LionCafe') #>> '{membership,active_campaigns}') = '1');
select t.as_kpn(4);
select t.check('hub_get: a private Hub does not reveal itself to an outsider', t.code(lv_api.lv_hub_get('lioncafe')) = 'lv_not_found');
select t.check('hub_get: an unknown slug looks identical', t.code(lv_api.lv_hub_get('nothing-here')) = 'lv_not_found');
select t.as_pg();
update lv.hubs set visibility = 'public' where id = t.id('hub');
select t.as_kpn(4);
select t.check('hub_get: a public Hub shows its card to an outsider', lv_api.lv_hub_get('lioncafe') #>> '{hub,name}' = 'LionCafe');
select t.check('hub_get: but not the membership block', (lv_api.lv_hub_get('lioncafe') -> 'membership') = 'null'::jsonb);
select t.as_anon();
select t.check('hub_get: a signed-out visitor can read a public card', t.code(lv_api.lv_hub_get('lioncafe')) = 'ok');

-- ===== campaigns ========================================================================================
select t.as_kpn(3);
select t.check('campaign_list: a member sees only the live Campaign (no draft)',
  jsonb_array_length(lv_api.lv_campaign_list(t.id('hub')) -> 'campaigns') = 1);
select t.check('campaign_list: a member never sees a join code',
  (lv_api.lv_campaign_list(t.id('hub')) #>> '{campaigns,0,join_code}') is null);
select t.as_kpn(2);
select t.check('campaign_list: a manager sees the draft too',
  jsonb_array_length(lv_api.lv_campaign_list(t.id('hub')) -> 'campaigns') = 2);
select t.as_kpn(4);
select t.check('campaign_list: an outsider is told no such Hub', t.code(lv_api.lv_campaign_list(t.id('hub'))) = 'lv_not_found');

select t.as_kpn(3);
select t.check('campaign_get: a member gets the questions and may respond',
  jsonb_array_length(lv_api.lv_campaign_get(t.id('live')) -> 'questions') = 2
  and (lv_api.lv_campaign_get(t.id('live')) ->> 'can_respond') = 'true');
select t.check('campaign_get: the respondent view carries no gate or code',
  (lv_api.lv_campaign_get(t.id('live')) ? 'gate') = false and (lv_api.lv_campaign_get(t.id('live')) ? 'join_code') = false);
select t.check('campaign_get: a draft is invisible to a plain member', t.code(lv_api.lv_campaign_get(t.id('draft'))) = 'lv_not_found');
select t.as_kpn(2);
select t.check('campaign_get: a manager sees the draft with its gate',
  (lv_api.lv_campaign_get(t.id('draft')) #>> '{gate,reasons,0}') is not null);
select t.as_kpn(4);
select t.check('campaign_get: an outsider cannot read any Campaign', t.code(lv_api.lv_campaign_get(t.id('live'))) = 'lv_not_found');

-- After responding: has_responded flips, can_respond closes, and the anonymous Campaign leaks no account.
select t.as_kpn(3);
select lv_api.lv_submit_response(t.id('live'), jsonb_build_array(
  jsonb_build_object('question_id', t.id('q1'), 'value', 4),
  jsonb_build_object('question_id', t.id('q2'), 'value', 'soup')));
select t.check('campaign_get: after responding the form closes and a receipt is shown',
  (lv_api.lv_campaign_get(t.id('live')) ->> 'has_responded') = 'true'
  and (lv_api.lv_campaign_get(t.id('live')) ->> 'can_respond') = 'false'
  and (lv_api.lv_campaign_get(t.id('live')) ->> 'receipt_id') is not null);

-- ===== members and invites ==============================================================================
select t.as_kpn(3);
select t.check('member_list: a plain member cannot list members', t.code(lv_api.lv_member_list(t.id('hub'))) = 'lv_forbidden');
select t.check('invite_list: a plain member cannot list invitations', t.code(lv_api.lv_invite_list(t.id('hub'))) = 'lv_forbidden');
select t.as_kpn(2);
select t.check('member_list: the Owner lists the Owner and the member, without email',
  jsonb_array_length(lv_api.lv_member_list(t.id('hub')) -> 'members') = 2
  and (lv_api.lv_member_list(t.id('hub'))::text like '%@example.invalid%') = false);
select t.check('invite_list: the Owner sees the invitation state and no code',
  (lv_api.lv_invite_list(t.id('hub')) #>> '{invites,0,state}') = 'active'
  and (lv_api.lv_invite_list(t.id('hub'))::text like '%READ-API-CODE%') = false);
select t.as_kpn(4);
select t.check('member_list: an outsider is told no such Hub', t.code(lv_api.lv_member_list(t.id('hub'))) = 'lv_not_found');

select t.as_pg();
rollback;
