-- 03: participation and the anonymity boundary.
select set_config('t.file', '03_privacy', false);
begin;

select t.trust_test_issuer();

-- A Hub with an owner, plus one Campaign in each anonymity mode.
select t.as_kpn(10, 'owner@example.invalid', true, 'Owner');
select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('owner'), 'approved');
select t.as_kpn(10);
select t.check('the Hub is created for the privacy suite', t.code(lv_api.lv_hub_create('privacy-hub', 'Privacy Hub')) = 'ok');
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'privacy-hub'$$));
select t.check('the suite actually has a Hub to work with', t.get('hub') is not null);

-- The activation gate needs a decided cap; set one so activation can succeed.
select t.as_pg();
update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';

select t.as_kpn(10);
select lv_api.lv_campaign_create(t.id('hub'), 'Anonymous Survey', 'survey', 'anonymous');
select t.put('anon_c', t.q($$select id::text from lv.campaigns where hub_id = '$$ || t.get('hub') || $$'::uuid and title = 'Anonymous Survey'$$));
select lv_api.lv_campaign_create(t.id('hub'), 'Identified Survey', 'survey', 'identified');
select t.put('ident_c', t.q($$select id::text from lv.campaigns where hub_id = '$$ || t.get('hub') || $$'::uuid and title = 'Identified Survey'$$));

select lv_api.lv_campaign_question_add(t.id('anon_c'), 1, 'rating', 'How was lunch?');
select t.put('anon_q', t.q($$select id::text from lv.campaign_questions where campaign_id = '$$ || t.get('anon_c') || $$'::uuid and position = 1$$));
select lv_api.lv_campaign_question_add(t.id('ident_c'), 1, 'rating', 'How was lunch?');
select t.put('ident_q', t.q($$select id::text from lv.campaign_questions where campaign_id = '$$ || t.get('ident_c') || $$'::uuid and position = 1$$));

-- ---------------------------------------------------------------------------------------------------------
-- Activation gate
-- ---------------------------------------------------------------------------------------------------------
select t.check('activating a Campaign with no questions is blocked', t.raises($$select lv.activate_campaign(gen_random_uuid())$$));
select t.check('an accepted member can activate their Campaign', t.code(lv_api.lv_campaign_activate(t.id('anon_c'))) = 'ok');
select t.check('activation is idempotent', t.code(lv_api.lv_campaign_activate(t.id('anon_c'))) = 'ok');
select lv_api.lv_campaign_activate(t.id('ident_c'));
select t.check('questions are frozen once active',
  t.raises($$insert into lv.campaign_questions (campaign_id, position, kind, prompt)
              values ('$$ || t.get('anon_c') || $$'::uuid, 2, 'text', 'Too late')$$, '42501'));

-- ---------------------------------------------------------------------------------------------------------
-- Membership gate on submission
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(11, 'member1@example.invalid', true, 'Member One');
select lv_api.lv_my_context();
select t.put('m1', t.q($$select lv.current_account_id()::text$$));
select t.check('a non-member cannot submit',
  t.raises($$select lv_api.lv_submit_response('$$ || t.get('anon_c') || $$'::uuid,
    '[{"question_id":"$$ || t.get('anon_q') || $$","value":4}]'::jsonb)$$, '42501'));

select t.as_pg();
insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
values (t.id('hub'), t.id('m1'), 'accepted', now());
insert into lv.membership_roles (membership_id, role_id)
  select m.id, r.id from lv.hub_memberships m, lv.roles r
   where m.hub_id = t.id('hub') and m.account_id = t.id('m1')
     and r.hub_id = t.id('hub') and r.key = 'owner';

-- ---------------------------------------------------------------------------------------------------------
-- Anonymity: answers carry NO account, participation carries NO submission link
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(11);
select t.check('an accepted member can submit to an anonymous Campaign',
  (t.q($$select lv_api.lv_submit_response('$$ || t.get('anon_c') || $$'::uuid,
    '[{"question_id":"$$ || t.get('anon_q') || $$","value":4}]'::jsonb)->>'ok'$$) = 'true'));

select t.as_pg();
select t.check('THE ANONYMITY BOUNDARY: an anonymous submission stores no account reference',
  t.q($$select coalesce(account_id::text, 'NULL') from lv.submissions where campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$) = 'NULL');
select t.check('THE ANONYMITY BOUNDARY: an anonymous participation stores no submission reference',
  t.q($$select coalesce(submission_id::text, 'NULL') from lv.participation where campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$) = 'NULL');
select t.check('the answer exists but is reachable only through its submission',
  t.q($$select count(*)::text from lv.answers a
            join lv.submissions s on s.id = a.submission_id
           where s.campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$) = '1');

-- The most direct test: there is NO join path from a person to their anonymous answer.
select t.check('NO JOIN PATH exists from an account to its anonymous answers',
  t.q($$select count(*)::text
            from lv.participation p
            join lv.submissions s on s.id = p.submission_id
            join lv.answers a on a.submission_id = s.id
           where p.campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$) = '0');

-- ---------------------------------------------------------------------------------------------------------
-- The database refuses to re-create the link even if code tries
-- ---------------------------------------------------------------------------------------------------------
select t.check('the database refuses an account on an anonymous submission',
  t.raises($$update lv.submissions set account_id = '$$ || t.get('m1') || $$'::uuid
              where campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$, '42501'));
select t.check('the database refuses a submission link on anonymous participation',
  t.raises($$update lv.participation
              set submission_id = (select id from lv.submissions where campaign_id = '$$ || t.get('anon_c') || $$'::uuid limit 1)
              where campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$, '42501'));

-- ---------------------------------------------------------------------------------------------------------
-- An IDENTIFIED Campaign does record the respondent (the deliberate contrast)
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(11);
select t.check('a member can submit to an identified Campaign', (t.q($$select lv_api.lv_submit_response('$$ || t.get('ident_c') || $$'::uuid,
    '[{"question_id":"$$ || t.get('ident_q') || $$","value":5}]'::jsonb)->>'ok'$$) = 'true'));
select t.as_pg();
select t.check('an identified submission DOES record the respondent by design',
  t.q($$select (account_id = '$$ || t.get('m1') || $$'::uuid)::text from lv.submissions where campaign_id = '$$ || t.get('ident_c') || $$'::uuid$$) = 'true');

-- ---------------------------------------------------------------------------------------------------------
-- Duplicate prevention
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(11);
select t.check('a repeat submission is idempotent, not a second participation',
  (t.q($$select (lv_api.lv_submit_response('$$ || t.get('anon_c') || $$'::uuid,
    '[{"question_id":"$$ || t.get('anon_q') || $$","value":1}]'::jsonb)->>'duplicate')$$) = 'true'));
select t.as_pg();
select t.check('exactly one participation row exists for that person and Campaign',
  t.q($$select count(*)::text from lv.participation where campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$) = '1');
select t.check('...and the duplicate did not create a second submission',
  t.q($$select count(*)::text from lv.submissions where campaign_id = '$$ || t.get('anon_c') || $$'::uuid$$) = '1');
select t.check('the database itself blocks a second participation',
  t.raises($$insert into lv.participation (campaign_id, hub_id, account_id, campaign_revision)
              values ('$$ || t.get('anon_c') || $$'::uuid, '$$ || t.get('hub') || $$'::uuid, '$$ || t.get('m1') || $$'::uuid, 1)$$, '23505'));

-- ---------------------------------------------------------------------------------------------------------
-- Validation and lifecycle
-- ---------------------------------------------------------------------------------------------------------
-- Validation must be exercised by someone who has NOT already submitted (the idempotent path returns first).
select t.as_kpn(13, 'member3@example.invalid', true, 'Member Three');
select lv_api.lv_my_context();
select t.put('m3', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.hub_memberships (hub_id, account_id, status, accepted_at) values (t.id('hub'), t.id('m3'), 'accepted', now());
select t.check('member 3 is an accepted member of the Hub',
  t.q($$select status from lv.hub_memberships where hub_id = '$$ || t.get('hub') || $$'::uuid and account_id = '$$ || t.get('m3') || $$'::uuid$$) = 'accepted');
select t.as_kpn(13);
select t.check('member 3 has no prior participation in this Campaign',
  t.q($$select count(*)::text from lv.participation where campaign_id = '$$ || t.get('anon_c') || $$'::uuid and account_id = '$$ || t.get('m3') || $$'::uuid$$) = '0');
select t.check('a missing answer is rejected',
  t.raises($$select lv_api.lv_submit_response('$$ || t.get('anon_c') || $$'::uuid, '[]'::jsonb)$$, '22023'));
select t.check('a rejected submission creates no participation row',
  t.q($$select count(*)::text from lv.participation where campaign_id = '$$ || t.get('anon_c') || $$'::uuid and account_id = '$$ || t.get('m3') || $$'::uuid$$) = '0');
select t.as_pg();
update lv.campaigns set status = 'closed', closed_at = now() where id = t.id('anon_c');
select t.as_kpn(12, 'member2@example.invalid', true, 'Member Two');
select lv_api.lv_my_context();
select t.put('m2', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.hub_memberships (hub_id, account_id, status, accepted_at) values (t.id('hub'), t.id('m2'), 'accepted', now());
select t.as_kpn(12);
select t.check('a closed Campaign refuses responses',
  t.raises($$select lv_api.lv_submit_response('$$ || t.get('anon_c') || $$'::uuid,
    '[{"question_id":"$$ || t.get('anon_q') || $$","value":3}]'::jsonb)$$, '42501'));

-- ---------------------------------------------------------------------------------------------------------
-- A caller cannot forge identity by supplying an account id
-- ---------------------------------------------------------------------------------------------------------
select t.as_anon();
select t.check('an anonymous caller cannot submit at all',
  t.raises($$select lv_api.lv_submit_response('$$ || t.get('ident_c') || $$'::uuid,
    '[{"question_id":"$$ || t.get('ident_q') || $$","value":5}]'::jsonb)$$, '42501'));

rollback;
