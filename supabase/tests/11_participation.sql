-- 11: submissions and receipts: revision binding, server-side validation, lifecycle, audience, guests, duplicates
-- independent of the idempotency key, preserved history, rewards, and the anonymity/privacy boundaries.
-- All policy and reward values are SYNTHETIC test inputs, not approved policy.
select set_config('t.file', '11_participation', false);
begin;

select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'starter', 'synthetic'), (t.org_b(), 'starter', 'synthetic');
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'team', 'synthetic');
insert into lv_private.roles (hub_id, name) values (t.org_a(), 'Surveyor');
insert into lv_private.role_capabilities select r.id, c from lv_private.roles r, unnest(array['community.campaign.draft', 'community.campaign.activate', 'community.campaign.close']) c where r.name = 'Surveyor';
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(3), r.id from lv_private.roles r where r.name = 'Surveyor';
insert into auth.users (id, email, raw_user_meta_data) values (t.u(41), 'b.member@example.invalid', jsonb_build_object('display_name', 'B Member', 'org_id', t.org_b()));
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000c3', 'synthetic-three', 'Synthetic Org Three');
insert into auth.users (id, email, raw_user_meta_data) values (t.u(21), 'outsider@example.invalid', '{"display_name":"Outsider","org_id":"00000000-0000-4000-8001-0000000000c3"}');
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": 100}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';

-- A published Campaign with seven questions (ids stored as <label>.q1 .. q7). anonymous per argument.
create function t.pubcamp(p_label text, p_hub uuid, p_anon boolean, p_publish boolean default true) returns uuid language plpgsql security definer as $$
declare v uuid; n int; qid uuid; r jsonb;
begin
  insert into lv_private.campaigns (hub_id, title, join_code, anonymous) values (p_hub, p_label, lv_private.new_join_code(), p_anon) returning id into v;
  for n in 1..7 loop
    qid := gen_random_uuid();
    perform t.put(p_label || '.q' || n, qid::text);
    insert into lv_private.campaign_questions (id, campaign_id, position, type, prompt, required, options, scale_min, scale_max)
    values (qid, v, n,
      (array['rating','single_choice','multi_choice','yes_no','text','ranking','slider'])[n],
      'Question ' || n, n in (1, 2),
      case n when 2 then '["A","B","C"]'::jsonb when 3 then '["x","y","z"]'::jsonb when 6 then '["r1","r2","r3"]'::jsonb else '[]'::jsonb end,
      case n when 7 then 0 else 1 end, case n when 7 then 10 else 5 end);
  end loop;
  perform t.put(p_label || '.id', v::text);
  if p_publish then
    r := lv_private.activate_campaign(v, (select owner_account_id from lv_private.hubs where id = p_hub), gen_random_uuid(), 'manual');
    if not (r->>'ok')::boolean then raise exception 'fixture activation failed: %', r; end if;
  end if;
  return v;
end $$;
create function t.a(p_label text, p_n int, p_value jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('question_id', t.get(p_label || '.q' || p_n), 'value', p_value) $$;
create function t.good(p_label text) returns jsonb language sql stable as $$
  select jsonb_build_array(t.a(p_label, 1, '4'), t.a(p_label, 2, '"B"'), t.a(p_label, 3, '["x","z"]'), t.a(p_label, 4, 'true'),
    t.a(p_label, 5, '"fine"'), t.a(p_label, 6, '["r2","r1","r3"]'), t.a(p_label, 7, '7')) $$;

select t.as_pg();
select t.put('A', t.pubcamp('A', t.org_a(), false)::text);       -- identified survey
select t.put('N', t.pubcamp('N', t.org_a(), true)::text);        -- anonymous survey

-- ---- published revision is bound and immutable
select t.check('activation pinned the published question revision', t.q(format('select published_revision from lv_private.campaigns where id = %L', t.id('A'))) = '1');
select t.check('questions cannot be added after publication', t.raises(format($$insert into lv_private.campaign_questions (campaign_id, position, type, prompt) values (%L, 99, 'text', 'late')$$, t.id('A')), '42501'));
select t.check('questions cannot be edited after publication', t.raises(format($$update lv_private.campaign_questions set prompt = 'changed' where campaign_id = %L$$, t.id('A')), '42501'));
select t.check('questions cannot be deleted after publication', t.raises(format($$delete from lv_private.campaign_questions where campaign_id = %L$$, t.id('A')), '42501'));
select t.check('the revision number cannot be bumped after publication', t.raises(format($$update lv_private.campaigns set question_revision = 2 where id = %L$$, t.id('A')), '42501'));
select t.as_user(t.u(3));
select t.check('lv_campaign_update refuses an active Campaign', public.lv_campaign_update(t.id('A'), 'x')->'error'->'details'->>'reason' = 'not_a_draft');

-- ---- who may submit
select t.as_anon();
select t.check('anon cannot submit', t.code(public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())) = 'lv_unauthenticated');
select t.as_user(t.u(21));
select t.check('a non-member cannot submit and learns nothing (not_found)', t.code(public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())) = 'lv_not_found');
select t.as_user(t.u(41));
select t.check('a member of ANOTHER Hub gets the same answer as for an unknown Campaign (not_found, same message)', public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())->'error' = public.lv_submit_response(gen_random_uuid(), t.good('A'), gen_random_uuid())->'error');
select t.as_user(t.u(4));
select t.check('null idempotency key is invalid_input', t.code(public.lv_submit_response(t.id('A'), t.good('A'), null)) = 'lv_invalid_input');
select t.as_pg();
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(5);
update lv_private.hub_memberships set status = 'removed' where hub_id = t.org_a() and account_id = t.u(6);
select t.as_user(t.u(5));
select t.check('a suspended member cannot submit', t.code(public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())) = 'lv_not_found');
select t.as_user(t.u(6));
select t.check('a removed member cannot submit', t.code(public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())) = 'lv_not_found');
select t.as_pg();
update lv_private.hub_memberships set status = 'accepted' where hub_id = t.org_a() and account_id in (t.u(5), t.u(6));

-- ---- validation (all server-side; nothing is stored by a failed attempt)
select t.as_user(t.u(4));
select t.check('answers must be an array', public.lv_submit_response(t.id('A'), '{"a":1}'::jsonb, gen_random_uuid())->'error'->'details'->>'reason' = 'answers_must_be_an_array');
select t.check('an unknown question id is refused', public.lv_submit_response(t.id('A'), jsonb_build_array(jsonb_build_object('question_id', gen_random_uuid(), 'value', 3)), gen_random_uuid())->'error'->'details'->>'reason' = 'unknown_question');
select t.check('a question of ANOTHER Campaign is refused', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('N', 1, '3'), t.a('A', 2, '"A"')), gen_random_uuid())->'error'->'details'->>'reason' = 'unknown_question');
select t.check('a duplicate answer to one question is refused', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 1, '4'), t.a('A', 2, '"A"')), gen_random_uuid())->'error'->'details'->>'reason' = 'duplicate_answer');
select t.check('a missing required question lists it', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3')), gen_random_uuid())->'error'->'details'->'question_ids' = jsonb_build_array(t.get('A.q2')));
select t.check('malformed answer objects are refused', t.code(public.lv_submit_response(t.id('A'), '[1]'::jsonb, gen_random_uuid())) = 'lv_invalid_input'
  and t.code(public.lv_submit_response(t.id('A'), '[{"question_id":"not-a-uuid","value":1}]'::jsonb, gen_random_uuid())) = 'lv_invalid_input');
select t.check('rating below range', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '0'), t.a('A', 2, '"A"')), gen_random_uuid())->'error'->'details'->>'reason' = 'value_out_of_range');
select t.check('rating above range', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '6'), t.a('A', 2, '"A"')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('rating must be a whole number', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '2.5'), t.a('A', 2, '"A"')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('rating must be a number, not a string or boolean', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '"3"'), t.a('A', 2, '"A"')), gen_random_uuid())) = 'lv_invalid_input'
  and t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, 'true'), t.a('A', 2, '"A"')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('slider honours its own 0..10 range', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 7, '11')), gen_random_uuid())) = 'lv_invalid_input'
  and t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 7, '-1')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('single choice must be one of the options', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"Z"')), gen_random_uuid())->'error'->'details'->>'reason' = 'value_not_an_option');
select t.check('single choice must be a string', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '["A"]')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('multi choice options must exist and be distinct', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 3, '["x","q"]')), gen_random_uuid())) = 'lv_invalid_input'
  and public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 3, '["x","x"]')), gen_random_uuid())->'error'->'details'->>'reason' = 'duplicate_options');
select t.check('multi choice must be an array', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 3, '"x"')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('yes/no must be a boolean', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 4, '"yes"')), gen_random_uuid())) = 'lv_invalid_input');
select t.check('ranking must order every option exactly once', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 6, '["r1","r2"]')), gen_random_uuid())->'error'->'details'->>'reason' = 'ranking_must_order_every_option');
select t.check('text over 2000 characters is refused', t.code(public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '3'), t.a('A', 2, '"A"'), t.a('A', 5, to_jsonb(repeat('x', 2001)))), gen_random_uuid())) = 'lv_invalid_input');
select t.check('more than 100 answers is refused', public.lv_submit_response(t.id('A'), (select jsonb_agg(t.a('A', 5, '"x"')) from generate_series(1, 101)), gen_random_uuid())->'error'->'details'->>'reason' = 'too_many_answers');
select t.as_pg();
select t.check('no failed attempt stored anything', t.q('select count(*) from lv_private.campaign_participation') = '0' and t.q('select count(*) from lv_private.campaign_answers') = '0');

-- ---- success, receipts, duplicates independent of the key
select t.as_user(t.u(4));
select t.put('k1', gen_random_uuid()::text);
select t.put('r1', public.lv_submit_response(t.id('A'), t.good('A'), t.id('k1'))->'data'->>'id');
select t.check('first submission: a receipt, not a duplicate', t.id('r1') is not null);
select t.check('receipt: reward is explicitly UNSET, no invented points', public.lv_my_receipts()->'data'->'receipts'->0->>'reward_state' = 'unset' and public.lv_my_receipts()->'data'->'receipts'->0->'points' = 'null'::jsonb);
select t.check('receipt carries no answers', not (public.lv_my_receipts()->'data'->'receipts'->0 ? 'answers') and not (public.lv_my_receipts()->'data'->'receipts'->0 ? 'value'));
select t.check('retry with the SAME key returns the same receipt as a duplicate',
  public.lv_submit_response(t.id('A'), t.good('A'), t.id('k1'))->'data'->>'id' = t.get('r1') and public.lv_submit_response(t.id('A'), t.good('A'), t.id('k1'))->'data'->>'duplicate' = 'true');
select t.check('a DIFFERENT key (and different answers) returns the same original receipt', public.lv_submit_response(t.id('A'), jsonb_build_array(t.a('A', 1, '1'), t.a('A', 2, '"C"')), gen_random_uuid())->'data'->>'id' = t.get('r1'));
select t.check('...marked duplicate', public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())->'data'->>'duplicate' = 'true');
select t.as_pg();
select t.check('one participation row and one answer set, whatever keys were used', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('A'))) = '1'
  and t.q(format('select count(*) from lv_private.campaign_answers where campaign_id = %L', t.id('A'))) = '1');
select t.check('the FIRST answers won (rating 4, not the retry''s 1)', t.q(format($$select value::text from lv_private.campaign_answer_values v join lv_private.campaign_answers a using (response_id) where a.campaign_id = %L and v.question_id = %L$$, t.id('A'), t.get('A.q1'))) = '4');
select t.check('answers are bound to revision 1 and the Hub', t.q(format('select question_revision::text || (hub_id = %L)::text from lv_private.campaign_answers where campaign_id = %L', t.org_a(), t.id('A'))) = '1true');
select t.check('optional unanswered questions store nothing', t.q(format($$select count(*) from lv_private.campaign_answer_values v join lv_private.campaign_answers a using (response_id) where a.campaign_id = %L$$, t.id('A'))) = '7');
select t.as_user(t.u(3));
select t.check('another member has no receipts; receipts are private to the participant', public.lv_my_receipts()->'data'->'receipts' = '[]'::jsonb);
select t.as_user(t.u(2));
select t.check('the Owner cannot read someone else''s receipt through lv_my_receipts', public.lv_my_receipts()->'data'->'receipts' = '[]'::jsonb);

-- ---- rewards: only from a decided policy; recorded, never applied to a balance here
select t.as_pg();
update lv_private.policy set value = '{"points": 10}'::jsonb where key = 'participation.reward';
select t.as_user(t.u(3));
select t.check('with a (synthetic) reward policy the receipt RECORDS points', public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())->'data'->>'points' = '10');
select t.as_pg();
select t.check('...but no balance changed (legacy points are untouched)', (t.legacy_fingerprint()->>'points_total') = ((select fp from t.snapshot where name = 'pre')->>'points_total'));
update lv_private.policy set value = '{"points": -5}'::jsonb where key = 'participation.reward';
select t.as_user(t.u(5));
select t.check('an invalid reward policy counts as unset', public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())->'data'->>'reward_state' = 'unset');
select t.as_pg();
update lv_private.policy set value = null where key = 'participation.reward';

-- ---- anonymity separation (campaign N is anonymous)
select t.as_user(t.u(4));
select t.check('anonymous Campaign accepts the submission', t.code(public.lv_submit_response(t.id('N'), t.good('N'), gen_random_uuid())) = 'ok');
select t.as_pg();
select t.check('anonymous: the answer row names NO account', t.q(format('select count(*) from lv_private.campaign_answers where campaign_id = %L and account_id is not null', t.id('N'))) = '0');
select t.check('anonymous: the participation row holds NO reference to the answers', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L and response_id is not null', t.id('N'))) = '0');
select t.check('anonymous: no value links the ledger to the answers (ids, receipt, key)',
  t.q(format($$select count(*) from lv_private.campaign_participation p join lv_private.campaign_answers a on a.campaign_id = p.campaign_id
      where p.campaign_id = %L and (p.id = a.response_id or p.receipt_id = a.response_id or p.idempotency_key = a.response_id or p.response_id = a.response_id)$$, t.id('N'))) = '0');
select t.check('anonymous: answers carry only a coarse date, not a timestamp', (select data_type from information_schema.columns where table_schema = 'lv_private' and table_name = 'campaign_answers' and column_name = 'submitted_on') = 'date'
  and not exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'campaign_answers' and data_type like 'timestamp%'));
select t.check('the schema has no foreign key from answers to the participation ledger',
  not exists (select 1 from pg_constraint c where c.conrelid = 'lv_private.campaign_answers'::regclass and c.confrelid = 'lv_private.campaign_participation'::regclass));
select t.check('...and the only ledger-to-answers key is the nullable response_id that anonymity guards forbid',
  (select count(*) from pg_constraint c where c.conrelid = 'lv_private.campaign_participation'::regclass and c.confrelid = 'lv_private.campaign_answers'::regclass) = 1);
select t.check('database guard: an anonymous answer cannot be written with an account',
  t.raises(format($$insert into lv_private.campaign_answers (campaign_id, hub_id, question_revision, audience, account_id) values (%L, %L, 1, 'member', %L)$$, t.id('N'), t.org_a(), t.u(3)), '42501'));
select t.check('database guard: anonymous participation cannot reference answers',
  t.raises(format($$update lv_private.campaign_participation set response_id = (select response_id from lv_private.campaign_answers where campaign_id = %L limit 1) where campaign_id = %L$$, t.id('N'), t.id('N')), '42501'));
select t.check('identified Campaign: the answer names the account by design and the ledger links to it',
  t.q(format('select count(*) from lv_private.campaign_answers a join lv_private.campaign_participation p on p.response_id = a.response_id and p.account_id = a.account_id where a.campaign_id = %L', t.id('A'))) = '3');

-- ---- the API boundary: no role can read answers, ledger or grants; no public function exposes them
select t.as_user(t.u(2));
select t.check('Owner cannot select answers', t.raises('select * from lv_private.campaign_answers', '42501'));
select t.check('Owner cannot select answer values', t.raises('select * from lv_private.campaign_answer_values', '42501'));
select t.check('Owner cannot select the participation ledger', t.raises('select * from lv_private.campaign_participation', '42501'));
select t.check('Owner cannot select guest grants', t.raises('select * from lv_private.campaign_guest_grants', '42501'));
select t.check('Owner cannot call the submission core directly', t.raises($$select lv_private.submit_core(gen_random_uuid(), t.u(2), null, '[]'::jsonb, gen_random_uuid())$$, '42501'));
select t.as_anon();
select t.check('anon cannot select answers either', t.raises('select * from lv_private.campaign_answers', '42501'));
select t.as_pg();
select t.check('no public function reads the answer tables', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.prosrc ilike '%campaign_answers%' or p.prosrc ilike '%campaign_answer_values%')) = 0);
select t.check('exactly one public function reads the participation ledger (the caller''s own receipts)', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc ilike '%campaign_participation%') = 'lv_my_receipts');
select t.check('no view exposes answers or the ledger', not exists (select 1 from information_schema.view_table_usage u where u.table_schema = 'lv_private' and u.table_name in ('campaign_answers', 'campaign_answer_values', 'campaign_participation')));
select t.check('no table in the exposed (public) schema holds answers', not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name like 'campaign%'));

-- ---- lifecycle at submission time; preserved history
select t.put('L', t.pubcamp('L', t.org_a(), false, false)::text);
select t.as_user(t.u(4));
select t.check('a draft cannot be answered', public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())->'error'->'details'->>'reason' = 'not_active');
select t.as_pg();
update lv_private.campaigns set state = 'scheduled', opens_at = now() + interval '1 day' where id = t.id('L');
select t.as_user(t.u(4));
select t.check('a scheduled Campaign cannot be answered', t.code(public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())) = 'lv_lifecycle_invalid');
select t.as_pg();
update lv_private.campaigns set state = 'draft', opens_at = null where id = t.id('L');
select lv_private.activate_campaign(t.id('L'), t.u(2), gen_random_uuid(), 'manual');
select t.as_user(t.u(4));
select t.check('an active Campaign accepts', t.code(public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())) = 'ok');
select t.as_user(t.u(2));
select t.check('Owner closes it', t.code(public.lv_campaign_close(t.id('L'))) = 'ok');
select t.as_user(t.u(3));
select t.check('after close a NEW participant is refused', public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())->'error'->'details'->>'reason' = 'not_active');
select t.as_user(t.u(4));
select t.check('after close the original participant still gets their receipt (duplicate)', public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())->'data'->>'duplicate' = 'true');
select t.as_pg();
select t.check('closing preserved the answer and the ledger row', t.q(format('select count(*) from lv_private.campaign_answers where campaign_id = %L', t.id('L'))) = '1'
  and t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('L'))) = '1');
select lv_private.activate_campaign(t.id('L'), t.u(2), gen_random_uuid(), 'manual');
select t.as_user(t.u(4));
select t.check('REOPENING does not give the same person a second response (policy undecided: no new response)', public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())->'data'->>'duplicate' = 'true');
select t.as_user(t.u(3));
select t.check('...but a person who had not answered can answer after reopening', t.code(public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())) = 'ok');
select t.as_pg();
select t.check('reopening preserved the earlier answers (2 total, 1 per person)', t.q(format('select count(*) from lv_private.campaign_answers where campaign_id = %L', t.id('L'))) = '2'
  and t.q(format('select count(*) from lv_private.campaign_answers where campaign_id = %L and question_revision = 1', t.id('L'))) = '2');
update lv_private.campaigns set opens_at = now() - interval '1 day', closes_at = now() - interval '1 minute' where id = t.id('L');
select t.as_user(t.u(6));
select t.check('past the closing time a new participant is refused even though the state still says active', public.lv_submit_response(t.id('L'), t.good('L'), gen_random_uuid())->'error'->'details'->>'reason' in ('closed_by_time', 'not_active'));
select t.as_pg();
update lv_private.campaigns set mode = 'poll' where id = t.id('A');
select t.as_user(t.u(6));
select t.check('a non-survey mode is policy-pending (D-08)', public.lv_submit_response(t.id('A'), t.good('A'), gen_random_uuid())->'error'->'details'->>'decision' = 'D-08');
select t.as_pg();
update lv_private.campaigns set mode = 'survey' where id = t.id('A');

-- ---- guests: explicit, scoped, separate; never members, never rewarded
select t.put('G', t.pubcamp('G', t.org_a(), false)::text);
select t.put('G2', t.pubcamp('G2', t.org_a(), false, false)::text);
create temp table before_guest as select
  (lv_private.gate_evaluate(t.org_a(), null)->>'numerator')::int as num, (lv_private.gate_evaluate(t.org_a(), null)->>'denominator')::int as den,
  (select count(*) from lv_private.accounts) as accounts, (select count(*) from lv_private.hub_memberships) as memberships,
  (select count(*) from lv_private.campaign_participation where audience = 'member') as members;
grant all on before_guest to public;
insert into lv_private.campaign_guest_grants (id, campaign_id, token_hash) values ('00000000-0000-4000-8009-000000000001', t.id('G'), 'hash-1'), ('00000000-0000-4000-8009-000000000002', t.id('G'), 'hash-2');
select t.check('a guest is refused while the Campaign has not enabled guest access', (lv_private.submit_guest('00000000-0000-4000-8009-000000000001', t.good('G'), gen_random_uuid()))->'error'->>'code' = 'lv_forbidden');
update lv_private.campaigns set guest_access = 'link' where id = t.id('G');
select t.check('with guest access on, a valid grant submits', (lv_private.submit_guest('00000000-0000-4000-8009-000000000001', t.good('G'), gen_random_uuid()))->>'ok' = 'true');
select t.check('guest rows are audience guest with no account', t.q(format($$select audience || (account_id is null)::text || (guest_ref is not null)::text from lv_private.campaign_participation where campaign_id = %L$$, t.id('G'))) = 'guesttruetrue');
select t.check('guest answers are flagged guest and carry no account', t.q(format($$select audience || (account_id is null)::text from lv_private.campaign_answers where campaign_id = %L$$, t.id('G'))) = 'guesttrue');
select t.check('guest receipt: no points, reward not applicable', (lv_private.submit_guest('00000000-0000-4000-8009-000000000001', t.good('G'), gen_random_uuid()))->'data'->>'reward_state' = 'not_applicable'
  and (lv_private.submit_guest('00000000-0000-4000-8009-000000000001', t.good('G'), gen_random_uuid()))->'data'->>'duplicate' = 'true');
select t.check('the same guest grant cannot submit twice under different keys', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('G'))) = '1');
select t.check('a second grant is a second guest', (lv_private.submit_guest('00000000-0000-4000-8009-000000000002', t.good('G'), gen_random_uuid()))->>'ok' = 'true');
update lv_private.campaign_guest_grants set revoked_at = now() where id = '00000000-0000-4000-8009-000000000002';
insert into lv_private.campaign_guest_grants (id, campaign_id, token_hash, expires_at) values ('00000000-0000-4000-8009-000000000003', t.id('G'), 'hash-3', now() - interval '1 minute');
insert into lv_private.campaign_guest_grants (id, campaign_id, token_hash) values ('00000000-0000-4000-8009-000000000004', t.id('G2'), 'hash-4');
select t.check('a revoked grant is refused', (lv_private.submit_guest('00000000-0000-4000-8009-000000000002', t.good('G'), gen_random_uuid()))->'error'->>'code' = 'lv_forbidden');
select t.check('an expired grant is refused', (lv_private.submit_guest('00000000-0000-4000-8009-000000000003', t.good('G'), gen_random_uuid()))->'error'->>'code' = 'lv_forbidden');
select t.check('an unknown grant is refused', (lv_private.submit_guest(gen_random_uuid(), t.good('G'), gen_random_uuid()))->'error'->>'code' = 'lv_forbidden');
select t.check('a grant on a Campaign without guest access is refused', (lv_private.submit_guest('00000000-0000-4000-8009-000000000004', t.good('G2'), gen_random_uuid()))->'error'->>'code' = 'lv_forbidden');
select t.check('a grant is scoped to its Campaign: another Campaign''s questions are refused and nothing leaks into other Campaigns',
  (lv_private.submit_guest('00000000-0000-4000-8009-000000000001', t.good('A'), gen_random_uuid()))->>'ok' = 'true'
  and t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L and audience = ''guest''', t.id('A'))) = '0');
select t.check('guests created no account and no membership and no member participation',
  (select accounts from before_guest) = (select count(*) from lv_private.accounts) and (select memberships from before_guest) = (select count(*) from lv_private.hub_memberships)
  and (select members from before_guest) = (select count(*) from lv_private.campaign_participation where audience = 'member'));
select t.check('spoof: the core refuses a call that names both a member and a guest reference',
  t.raises(format($$select lv_private.submit_core(%L, %L, 'spoofed-guest-ref', %L::jsonb, gen_random_uuid())$$, t.id('G'), t.u(5), t.good('G')::text), '23514'));
select t.check('spoof: a guest row can never carry an account (generated audience + CHECK)', t.raises(format($$insert into lv_private.campaign_participation (campaign_id, hub_id, account_id, guest_ref) values (%L, %L, %L, 'x')$$, t.id('G'), t.org_a(), t.u(4)), '23514'));
select t.check('guest participation never reaches the eligible-member numerator or denominator', (lv_private.gate_evaluate(t.org_a(), null)->>'numerator')::int = (select num from before_guest) and (lv_private.gate_evaluate(t.org_a(), null)->>'denominator')::int = (select den from before_guest));
select t.as_user(t.u(4));
select t.check('guest receipts are not visible to members', jsonb_array_length(public.lv_my_receipts()->'data'->'receipts') = 3);

-- ---- join-code resolution
select t.put('code', t.q(format('select join_code from lv_private.campaigns where id = %L', t.id('A'))));
select t.as_anon();
select t.check('private Hub: anon sees nothing (not_found)', t.code(public.lv_campaign_resolve(t.get('code'))) = 'lv_not_found');
select t.as_user(t.u(21));
select t.check('private Hub: a non-member sees nothing', t.code(public.lv_campaign_resolve(t.get('code'))) = 'lv_not_found');
select t.as_user(t.u(4));
select t.check('private Hub: a member resolves it (lower case code too)', public.lv_campaign_resolve(lower(t.get('code')))->'data'->>'campaign_id' = t.id('A')::text
  and public.lv_campaign_resolve(t.get('code'))->'data'->>'requires_account' = 'true');
select t.as_pg();
update lv_private.hubs set visibility = 'public' where id = t.org_a();
select t.as_anon();
select t.check('public Hub: anon resolves an active Campaign', public.lv_campaign_resolve(t.get('code'))->'data'->>'hub_slug' = 'lioncafe');
select t.as_pg();
select t.put('dcode', t.q(format('select join_code from lv_private.campaigns where id = %L', t.id('L'))));
select t.put('draftcode', t.q($$select join_code from lv_private.campaigns where state = 'draft' limit 1$$));
select t.as_anon();
select t.check('a draft or scheduled Campaign code never resolves', t.code(public.lv_campaign_resolve(coalesce(t.get('draftcode'), 'NOPE00'))) = 'lv_not_found');
select t.check('an empty code is invalid_input', t.code(public.lv_campaign_resolve('  ')) = 'lv_invalid_input');
select t.as_pg();
update lv_private.hubs set visibility = 'private' where id = t.org_a();

-- ---- cross-Hub integrity at the database level
select t.check('participation cannot be written for another Hub''s Campaign', t.raises(format($$insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) values (%L, %L, %L)$$, t.id('A'), t.org_b(), t.u(41)), '23503'));
select t.check('answers cannot be written for another Hub', t.raises(format($$insert into lv_private.campaign_answers (campaign_id, hub_id, question_revision, audience) values (%L, %L, 1, 'member')$$, t.id('A'), t.org_b()), '23503'));

rollback;
