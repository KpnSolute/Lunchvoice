-- 11: CAMPAIGN VERSIONS AND LIFECYCLE (000011, roadmap slice 8).
--
-- Draft editing, scheduling, pause/resume against the cap, close, archive, and immutable published versions.
select set_config('t.file', '11_campaign_lifecycle', false);
begin;

update lv.policy set value = '2'::jsonb where key = 'campaign.max_active_per_hub';
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Member'); select lv_api.lv_my_context();
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('owner'), 'approved');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('lifecycle-hub', 'Lifecycle Hub')->>'hub_id'));
select t.put('invite', (lv_api.lv_invite_create(t.id('hub'))->>'code'));
select t.as_kpn(2);
select lv_api.lv_invite_redeem(t.get('invite'));

-- ===== draft editing ====================================================================================
select t.as_kpn(1);
select t.put('c1', (lv_api.lv_campaign_create(t.id('hub'), 'Draft one', 'survey', 'identified')->>'campaign_id'));
select t.put('q1', (lv_api.lv_campaign_question_add(t.id('c1'), 1, 'rating', 'How was it?')->>'question_id'));
select t.put('q2', (lv_api.lv_campaign_question_add(t.id('c1'), 2, 'text', 'Anything else?')->>'question_id'));
select t.check('draft: title, mode and anonymity can be edited',
  t.code(lv_api.lv_campaign_update(t.id('c1'), 'Renamed', 'poll', 'anonymous')) = 'ok'
  and t.q(format($q$select title || '|' || mode || '|' || anonymity from lv.campaigns where id = %L::uuid$q$, t.get('c1'))) = 'Renamed|poll|anonymous');
select t.check('draft: a blank title is lv_invalid_input', t.code(lv_api.lv_campaign_update(t.id('c1'), '   ')) = 'lv_invalid_input');
select t.check('draft: an invalid mode is lv_invalid_input', t.code(lv_api.lv_campaign_update(t.id('c1'), null, 'nonsense')) = 'lv_invalid_input');
select t.check('draft: a window that closes before it opens is lv_invalid_input',
  t.code(lv_api.lv_campaign_update(t.id('c1'), null, null, null, now() + interval '2 days', now() + interval '1 day')) = 'lv_invalid_input');
select t.check('draft: a window that closed in the past is lv_invalid_input',
  t.code(lv_api.lv_campaign_update(t.id('c1'), null, null, null, null, now() - interval '1 day')) = 'lv_invalid_input');
select t.check('draft: a question can be edited',
  t.code(lv_api.lv_campaign_question_update(t.id('q2'), null, null, 'Any other comments?')) = 'ok');
select t.check('draft: a question can be removed', t.code(lv_api.lv_campaign_question_remove(t.id('q2'))) = 'ok');
select t.as_kpn(2);
select t.check('draft: a member without campaign.manage cannot edit', t.code(lv_api.lv_campaign_update(t.id('c1'), 'Mine')) = 'lv_forbidden');

-- ===== scheduling ========================================================================================
select t.as_kpn(1);
select t.check('schedule: a draft with a future window is published as scheduled',
  (lv_api.lv_campaign_schedule(t.id('c1'), now() + interval '1 day', now() + interval '8 days')->>'phase') = 'scheduled');
select t.check('schedule: a scheduled Campaign keeps stored status active (it holds its slot)',
  t.q(format($q$select status from lv.campaigns where id = %L::uuid$q$, t.get('c1'))) = 'active');
select t.check('schedule: scheduling twice is lv_lifecycle_invalid',
  t.code(lv_api.lv_campaign_schedule(t.id('c1'), now() + interval '1 day', now() + interval '8 days')) = 'lv_lifecycle_invalid');
select t.as_kpn(2);
select t.check('schedule: a member cannot respond before it opens',
  t.code(lv_api.lv_submit_response(t.id('c1'), format('[{"question_id":"%s","value":4}]', t.get('q1'))::jsonb)) = 'lv_closed');

-- ===== published versions are immutable =================================================================
select t.as_pg();
select t.check('version: publishing wrote version 2 with the frozen question set',
  t.q(format($q$select version::text || '|' || jsonb_array_length(questions)::text from lv.campaign_versions where campaign_id = %L::uuid$q$, t.get('c1'))) = '2|1');
select t.check('version: the version carries the participation settings and the limit in force',
  t.q(format($q$select (settings->>'anonymity') || '|' || (settings #>> '{entitlement,campaign.max_active_per_hub}') from lv.campaign_versions where campaign_id = %L::uuid$q$, t.get('c1'))) = 'anonymous|2');
select t.check('version: a published version cannot be changed',
  t.raises(format($q$update lv.campaign_versions set questions = '[]'::jsonb where campaign_id = %L::uuid$q$, t.get('c1'))));
select t.as_kpn(1);
select t.check('version: a published Campaign cannot be edited (lv_locked)', t.code(lv_api.lv_campaign_update(t.id('c1'), 'Late edit')) = 'lv_locked');
select t.check('version: its questions cannot change (lv_locked)',
  t.code(lv_api.lv_campaign_question_update(t.id('q1'), null, null, 'Changed?')) = 'lv_locked');
select t.check('version: managers can list versions', jsonb_array_length(lv_api.lv_campaign_versions(t.id('c1'))->'versions') = 1);
select t.as_kpn(2);
select t.check('version: members without campaign.manage cannot list versions', t.code(lv_api.lv_campaign_versions(t.id('c1'))) = 'lv_forbidden');

-- ===== cap, pause and resume =============================================================================
select t.as_kpn(1);
select t.put('c2', (lv_api.lv_campaign_create(t.id('hub'), 'Open now', 'survey', 'identified')->>'campaign_id'));
select t.put('q21', (lv_api.lv_campaign_question_add(t.id('c2'), 1, 'rating', 'Rate')->>'question_id'));
select t.check('schedule: no open time publishes it open', (lv_api.lv_campaign_schedule(t.id('c2'))->>'phase') = 'open');
select t.put('c3', (lv_api.lv_campaign_create(t.id('hub'), 'Third', 'survey', 'identified')->>'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('c3'), 1, 'rating', 'Rate');
select t.check('cap: a scheduled Campaign counts toward the cap, so a third is blocked',
  t.code(lv_api.lv_campaign_schedule(t.id('c3'))) = 'lv_gate_blocked'
  and (lv_api.lv_campaign_schedule(t.id('c3')) #>> '{error,reasons,0}') = 'limit_reached');
select t.check('cap: a blocked schedule leaves the draft untouched',
  t.q(format($q$select status || '|' || coalesce(opens_at::text, 'none') from lv.campaigns where id = %L::uuid$q$, t.get('c3'))) = 'draft|none');

select t.check('pause: an open Campaign pauses', t.code(lv_api.lv_campaign_pause(t.id('c2'))) = 'ok');
select t.as_kpn(2);
select t.check('pause: a paused Campaign refuses responses',
  t.code(lv_api.lv_submit_response(t.id('c2'), format('[{"question_id":"%s","value":3}]', t.get('q21'))::jsonb)) = 'lv_closed');
select t.as_kpn(1);
select t.check('pause: pausing frees the slot, so the third can now be published', t.code(lv_api.lv_campaign_schedule(t.id('c3'))) = 'ok');
select t.check('resume: resuming needs a free slot again',
  t.code(lv_api.lv_campaign_resume(t.id('c2'))) = 'lv_gate_blocked'
  and (lv_api.lv_campaign_resume(t.id('c2')) #>> '{error,reasons,0}') = 'limit_reached');
select lv_api.lv_campaign_close(t.id('c3'));
select t.check('resume: with a slot free it resumes', t.code(lv_api.lv_campaign_resume(t.id('c2'))) = 'ok');
select t.as_kpn(2);
select t.check('resume: a resumed Campaign accepts responses',
  t.code(lv_api.lv_submit_response(t.id('c2'), format('[{"question_id":"%s","value":3}]', t.get('q21'))::jsonb)) = 'ok');

-- ===== close and archive =================================================================================
select t.as_kpn(1);
select t.check('close: a paused Campaign can be closed',
  t.code(lv_api.lv_campaign_pause(t.id('c2'))) = 'ok' and t.code(lv_api.lv_campaign_close(t.id('c2'))) = 'ok'
  and t.q(format($q$select status from lv.campaigns where id = %L::uuid$q$, t.get('c2'))) = 'closed');
select t.check('close: closing twice is harmless', t.code(lv_api.lv_campaign_close(t.id('c2'))) = 'ok');
select t.check('close: a closed Campaign cannot be paused', t.code(lv_api.lv_campaign_pause(t.id('c2'))) = 'lv_lifecycle_invalid');
select t.check('close: a closed Campaign cannot be resumed', t.code(lv_api.lv_campaign_resume(t.id('c2'))) = 'lv_lifecycle_invalid');
select t.put('c4', (lv_api.lv_campaign_create(t.id('hub'), 'Throwaway', 'poll', 'identified')->>'campaign_id'));
select t.check('close: a draft has nothing to close', t.code(lv_api.lv_campaign_close(t.id('c4'))) = 'lv_lifecycle_invalid');
select t.check('archive: a running Campaign must be closed first', t.code(lv_api.lv_campaign_archive(t.id('c1'))) = 'lv_lifecycle_invalid');
select t.check('archive: a draft can be discarded by archiving it', t.code(lv_api.lv_campaign_archive(t.id('c4'))) = 'ok');
select t.check('archive: a closed Campaign is archived', t.code(lv_api.lv_campaign_archive(t.id('c2'))) = 'ok');
select t.as_pg();
select t.check('archive: archiving deletes nothing',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('c2'))) = '1');
select t.check('phase: phase is derived from status and window',
  lv.campaign_phase('active', now() + interval '1 hour', null) = 'scheduled'
  and lv.campaign_phase('active', null, now() - interval '1 hour') = 'ended'
  and lv.campaign_phase('active', now() - interval '1 hour', now() + interval '1 hour') = 'open'
  and lv.campaign_phase('paused', null, null) = 'paused');
select t.check('audit: lifecycle actions are audited',
  t.q(format($q$select count(distinct action)::text from lv.audit_events where hub_id = %L::uuid
                 and action in ('campaign.scheduled','campaign.paused','campaign.resumed','campaign.closed','campaign.archived')$q$,
             t.get('hub'))) = '5');

rollback;
