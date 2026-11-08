-- 20: COMMUNITY SURFACE AND DISCOVER (000020, build plan track C, C-01, C-02).
select set_config('t.file', '20_community', false);
begin;

select t.trust_test_issuer();
-- One-question poll answered by persons p_people, then (optionally) closed. Runs as the Owner (person 1).
create function t.c20_campaign(p_hub uuid, p_anon text, p_people int[], p_close boolean) returns uuid
language plpgsql as $$
declare
  v_c uuid;
  v_q uuid;
  n int;
begin
  perform t.as_kpn(1);
  v_c := (lv_api.lv_campaign_create(p_hub, 'Poll ' || p_anon || ' ' || array_to_string(p_people, '-'), 'poll', p_anon) ->> 'campaign_id')::uuid;
  v_q := (lv_api.lv_campaign_question_add(v_c, 1, 'yes_no', 'Was the route good?') ->> 'question_id')::uuid;
  perform t.put('cq_' || v_c::text, v_q::text);
  perform lv_api.lv_campaign_activate(v_c);
  foreach n in array p_people loop
    perform t.as_kpn(n);
    perform lv_api.lv_submit_response(v_c, jsonb_build_array(jsonb_build_object('question_id', v_q, 'value', true)));
  end loop;
  perform t.as_kpn(1);
  if p_close then perform lv_api.lv_campaign_close(v_c); end if;
  return v_c;
end $$;
grant execute on function t.c20_campaign(uuid, text, int[], boolean) to public;

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Poster'); select lv_api.lv_my_context();
select t.put('poster', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Member Three'); select lv_api.lv_my_context();
select t.put('m3', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Outsider'); select lv_api.lv_my_context();
select t.as_kpn(5, null, true, 'Member Five'); select lv_api.lv_my_context();
select t.put('m5', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(6, null, true, 'Solo'); select lv_api.lv_my_context();
select t.put('solo', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'));
select t.grant_credit(t.id('owner'));
select t.set_limit('campaigns.max_active', '50'::jsonb);
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('northside-running', 'Northside Running Club') ->> 'hub_id'));
select lv_api.lv_hub_update(t.id('hub'), null, 'public', 'approval', 'Weekly long runs.');
select t.put('code', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(2); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(3); select lv_api.lv_invite_redeem(t.get('code'));
select t.as_kpn(5); select lv_api.lv_invite_redeem(t.get('code'));
-- A private Hub for the non-member checks.
select t.as_kpn(1);
select t.put('priv', (lv_api.lv_hub_create('harbor-book-circle', 'Harbor Book Circle') ->> 'hub_id'));
-- A personal space (LC-06).
select t.as_kpn(6);
select lv_api.lv_quick_survey_create('Solo survey', 'link');
select t.put('personal', t.q(format($q$select id::text from lv.hubs where owner_account_id = %L::uuid and kind = 'personal'$q$, t.get('solo'))));
select t.as_pg();
select t.put('m_poster', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('poster'))));

-- ===== capabilities ======================================================================================
select t.as_kpn(1);
select t.check('caps: the catalogue lists community.post, community.moderate and community.shop',
  (lv_api.lv_capability_catalog())::text like '%community.post%' and (lv_api.lv_capability_catalog())::text like '%community.moderate%'
  and (lv_api.lv_capability_catalog())::text like '%community.shop%');
select t.check('caps: the Owner holds the community capabilities',
  (lv_api.lv_my_context())::text like '%community.post%' and (lv_api.lv_my_context())::text like '%community.moderate%');
select t.put('r_editor', (lv_api.lv_role_create(t.id('hub'), 'Editor', 'star', array['community.post', 'community.moderate']) #>> '{role,role_id}'));
select lv_api.lv_member_role_assign(t.id('m_poster'), t.id('r_editor'));

-- ===== pages: content, visibility, add-on gating =========================================================
select t.put('pg', lv_api.lv_hub_pages_update(t.id('hub'), '[
  {"key":"routes","kind":"custom","title":"Route maps","body":"# Routes\n- [Map](https://example.org/map)","visibility":"public"},
  {"key":"kit","kind":"custom","title":"Kit list","body":"Members only kit list","visibility":"members"},
  {"key":"news","kind":"news","title":"Newsroom"},
  {"key":"comments","kind":"comments","title":"Comments"},
  {"key":"leaderboard","kind":"leaderboard","title":"Leaderboard"},
  {"key":"shop","kind":"shop","title":"Shop"}]'::jsonb)::text);
select t.check('pages: custom pages with bodies and every add-on page save on Starter', t.code(t.get('pg')::jsonb) = 'ok');
select t.check('pages: the visibility of a custom page is kept',
  (select e->>'visibility' from jsonb_array_elements(t.get('pg')::jsonb -> 'pages') e where e->>'key' = 'routes') = 'public');
select t.check('pages: add-on pages are members-only whatever is sent',
  (select e->>'visibility' from jsonb_array_elements(lv_api.lv_hub_pages_update(t.id('hub'), (t.get('pg')::jsonb -> 'pages')
       || '[]'::jsonb) -> 'pages') e where e->>'key' = 'shop') = 'members');
select t.check('pages: a second news page is lv_invalid_input',
  t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[{"key":"n1","kind":"news","title":"A"},{"key":"n2","kind":"news","title":"B"}]'::jsonb)) = 'lv_invalid_input');
select t.check('pages: a bad visibility is lv_invalid_input',
  t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[{"key":"x","kind":"custom","title":"X","visibility":"everyone"}]'::jsonb)) = 'lv_invalid_input');
select t.check('pages: managers see the add-on plan flags',
  (lv_api.lv_hub_pages_get(t.id('hub')) #>> '{addons,shop,allowed}') = 'true'
  and (lv_api.lv_hub_pages_get(t.id('hub')) #>> '{addons,news,enabled}') = 'true');
select t.as_anon();
select t.check('pages: a visitor sees the public custom page and its body',
  (select e->>'body' from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e where e->>'key' = 'routes') like '# Routes%');
select t.check('pages: a visitor never sees a members-only page or its body',
  not exists (select 1 from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e where e->>'key' = 'kit')
  and (lv_api.lv_hub_pages_get(t.id('hub')))::text not like '%Members only kit list%');
select t.check('pages: a visitor sees no shop, leaderboard or comments page',
  not exists (select 1 from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e
               where e->>'kind' in ('shop', 'leaderboard', 'comments')));
select t.check('pages: the news page is hidden from visitors while no public post exists',
  not exists (select 1 from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e where e->>'kind' = 'news'));
select t.as_kpn(3);
select t.check('pages: a member sees the members-only page body',
  (select e->>'body' from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e where e->>'key' = 'kit') = 'Members only kit list');
select t.as_kpn(4);
select t.check('pages: a private Hub still answers lv_not_found to a non-member', t.code(lv_api.lv_hub_pages_get(t.id('priv'))) = 'lv_not_found');

-- ===== newsroom ==========================================================================================
select t.as_kpn(3);
select t.check('news: a member without community.post cannot write', t.code(lv_api.lv_news_save(t.id('hub'), 'Hello')) = 'lv_forbidden');
select t.as_kpn(4);
select t.check('news: a signed-in non-member of a public Hub cannot write', t.code(lv_api.lv_news_save(t.id('hub'), 'Hello')) = 'lv_forbidden');
select t.as_kpn(2);
select t.put('post1', (lv_api.lv_news_save(t.id('hub'), 'Spring route is live', 'We changed the route because of your answers.') #>> '{post,post_id}'));
select t.check('news: a poster creates a draft', (lv_api.lv_news_get(t.id('post1')) #>> '{post,status}') = 'draft');
select t.as_kpn(3);
select t.check('news: members do not see drafts', t.code(lv_api.lv_news_get(t.id('post1'))) = 'lv_not_found'
  and jsonb_array_length(lv_api.lv_news_list(t.id('hub'), true) -> 'posts') = 0);
select t.as_kpn(2);
select t.check('news: publishing works', (lv_api.lv_news_publish(t.id('post1')) #>> '{post,status}') = 'published');
select t.check('news: pinning a published post works', (lv_api.lv_news_pin(t.id('post1')) #>> '{post,pinned}') = 'true');
select t.put('post2', (lv_api.lv_news_save(t.id('hub'), 'Open day', 'Everyone welcome.', 'public') #>> '{post,post_id}'));
select lv_api.lv_news_publish(t.id('post2'));
select t.check('news: a draft cannot be pinned',
  t.code(lv_api.lv_news_pin((lv_api.lv_news_save(t.id('hub'), 'Draft only') #>> '{post,post_id}')::uuid)) = 'lv_invalid_input');
select t.as_pg();
update lv.policy set value = '1'::jsonb where key = 'community.max_pinned';
select t.as_kpn(2);
select t.put('pin2', lv_api.lv_news_pin(t.id('post2'))::text);
select t.check('news: the pin limit is lv_limit_reached', t.code(t.get('pin2')::jsonb) = 'lv_limit_reached');
select t.check('news: a non-member of a private Hub gets lv_not_found', t.code(lv_api.lv_news_save(t.id('priv'), 'X')) = 'lv_not_found');
select t.as_kpn(1);
select lv_api.lv_hub_pages_update(t.id('priv'), '[{"key":"news","kind":"news","title":"News"}]'::jsonb);
select t.check('news: a private Hub cannot publish publicly', t.code(lv_api.lv_news_save(t.id('priv'), 'X', 'Y', 'public')) = 'lv_invalid_input');
select t.check('news: a private Hub posts for members', t.code(lv_api.lv_news_save(t.id('priv'), 'X', 'Y')) = 'ok');
select t.as_kpn(3);
select t.check('news: members read published posts, pinned first',
  (lv_api.lv_news_list(t.id('hub')) #>> '{posts,0,post_id}') = t.get('post1')
  and jsonb_array_length(lv_api.lv_news_list(t.id('hub')) -> 'posts') = 2);
select t.as_anon();
select t.check('news: a visitor reads only the public post',
  jsonb_array_length(lv_api.lv_news_list(t.id('hub')) -> 'posts') = 1
  and (lv_api.lv_news_list(t.id('hub')) #>> '{posts,0,post_id}') = t.get('post2'));
select t.check('news: a visitor cannot open a members post', t.code(lv_api.lv_news_get(t.id('post1'))) = 'lv_not_found');
select t.check('news: a visitor sees no comment counts', (lv_api.lv_news_get(t.id('post2')) #> '{post,comment_count}') = 'null'::jsonb);
select t.check('news: the news page now shows to visitors',
  exists (select 1 from jsonb_array_elements(lv_api.lv_hub_pages_get(t.id('hub')) -> 'pages') e where e->>'kind' = 'news'));
select t.check('news: signed out, writing raises permission denied', t.raises($$select lv_api.lv_news_save(gen_random_uuid(), 'X')$$, '42501'));
select t.as_pg();
update lv.hubs set visibility = 'private' where id = t.id('hub');
select t.as_anon();
select t.check('news: once the Hub is private, its public posts are gone for visitors', t.code(lv_api.lv_news_list(t.id('hub'))) = 'lv_not_found'
  and t.code(lv_api.lv_news_get(t.id('post2'))) = 'lv_not_found');
select t.as_pg();
update lv.hubs set visibility = 'public' where id = t.id('hub');

-- ===== comments and moderation ===========================================================================
select t.as_kpn(3);
select t.put('c1', (lv_api.lv_comment_add(t.id('hub'), 'Great route!', t.id('post1')) ->> 'comment_id'));
select t.check('comments: a member comments on a published post', t.get('c1') is not null);
select t.put('cw', (lv_api.lv_comment_add(t.id('hub'), 'Hello wall') ->> 'comment_id'));
select t.check('comments: a member comments on the Comments page', t.get('cw') is not null);
select t.check('comments: an empty comment is lv_invalid_input', t.code(lv_api.lv_comment_add(t.id('hub'), '   ', t.id('post1'))) = 'lv_invalid_input');
select t.check('comments: an over-long comment is lv_invalid_input with the limit',
  (lv_api.lv_comment_add(t.id('hub'), repeat('x', 1001), t.id('post1')) #>> '{error,limit}') = '1000');
select t.as_pg();
select t.put('draft', t.q(format($q$select id::text from lv.news_posts where hub_id = %L::uuid and status = 'draft' limit 1$q$, t.get('hub'))));
select t.as_kpn(3);
select t.check('comments: a draft post takes no comments (by id)', t.code(lv_api.lv_comment_add(t.id('hub'), 'x', t.id('draft'))) = 'lv_not_found');
select lv_api.lv_comment_add(t.id('hub'), 'two', t.id('post1'));
select lv_api.lv_comment_add(t.id('hub'), 'three', t.id('post1'));
select lv_api.lv_comment_add(t.id('hub'), 'four', t.id('post1'));
select t.check('comments: the sixth comment in a minute is lv_rate_limited', t.code(lv_api.lv_comment_add(t.id('hub'), 'five', t.id('post1'))) = 'lv_rate_limited');
select t.as_kpn(4);
select t.check('comments: a non-member cannot read comments of a public Hub', t.code(lv_api.lv_comment_list(t.id('hub'), t.id('post1'))) = 'lv_forbidden');
select t.check('comments: a non-member cannot comment', t.code(lv_api.lv_comment_add(t.id('hub'), 'hi', t.id('post1'))) = 'lv_forbidden');
select t.check('comments: a private Hub answers lv_not_found to a non-member', t.code(lv_api.lv_comment_list(t.id('priv'))) = 'lv_not_found');
select t.as_anon();
select t.check('comments: signed out, comments are not callable', t.raises($$select lv_api.lv_comment_list(gen_random_uuid())$$, '42501')
  and t.raises($$select lv_api.lv_comment_add(gen_random_uuid(), 'x')$$, '42501'));
select t.as_kpn(5);
select t.check('comments: members read comments with the author name',
  (lv_api.lv_comment_list(t.id('hub'), t.id('post1')) #>> '{comments,0,author_name}') = 'Member Three');
select t.check('comments: someone else cannot delete a comment', t.code(lv_api.lv_comment_delete(t.id('c1'))) = 'lv_forbidden');
select t.check('comments: a member reports a comment', (lv_api.lv_comment_report(t.id('c1'), 'Spam') ->> 'already_reported') = 'false');
select t.check('comments: reporting twice is idempotent', (lv_api.lv_comment_report(t.id('c1'), 'Spam') ->> 'already_reported') = 'true');
select t.check('comments: a plain member cannot hide', t.code(lv_api.lv_comment_hide(t.id('c1'))) = 'lv_forbidden');
select t.as_kpn(3);
select t.check('comments: the author cannot report their own comment', t.code(lv_api.lv_comment_report(t.id('c1'), 'x')) = 'lv_invalid_input');
select t.as_kpn(2);
select t.check('comments: a moderator sees the report count',
  (select (e->>'report_count')::int from jsonb_array_elements(lv_api.lv_comment_list(t.id('hub'), t.id('post1')) -> 'comments') e where e->>'comment_id' = t.get('c1')) = 1);
select t.check('comments: a moderator hides a comment', (lv_api.lv_comment_hide(t.id('c1')) ->> 'hidden') = 'true');
select t.check('comments: a moderator still sees a hidden comment',
  exists (select 1 from jsonb_array_elements(lv_api.lv_comment_list(t.id('hub'), t.id('post1')) -> 'comments') e where e->>'comment_id' = t.get('c1') and e->>'hidden' = 'true'));
select t.as_kpn(5);
select t.check('comments: members no longer see a hidden comment',
  not exists (select 1 from jsonb_array_elements(lv_api.lv_comment_list(t.id('hub'), t.id('post1')) -> 'comments') e where e->>'comment_id' = t.get('c1')));
select t.as_kpn(2);
select t.check('comments: a moderator deletes a comment', t.code(lv_api.lv_comment_delete(t.id('c1'))) = 'ok');
select t.as_kpn(3);
select t.check('comments: the author deletes their own', t.code(lv_api.lv_comment_delete(t.id('cw'))) = 'ok');
select t.check('comments: comments never attach to Campaigns or answers (no such column)',
  t.q($$select count(*)::text from information_schema.columns where table_schema = 'lv' and table_name = 'comments'
         and column_name in ('campaign_id', 'submission_id', 'answer_id')$$) = '0');

-- ===== leaderboard (C-01) ================================================================================
select t.put('cl1', t.c20_campaign(t.id('hub'), 'anonymous', array[2, 3, 5], true)::text);
select t.put('cl2', t.c20_campaign(t.id('hub'), 'identified', array[3, 5], true)::text);
select t.put('clive', t.c20_campaign(t.id('hub'), 'identified', array[3], false)::text);
select t.as_kpn(3);
select t.check('leaderboard: it is opt-in: nobody appears by default', jsonb_array_length(lv_api.lv_leaderboard_get(t.id('hub')) -> 'entries') = 0
  and (lv_api.lv_leaderboard_get(t.id('hub')) #>> '{me,opted_in}') = 'false');
select t.check('leaderboard: opting in works', (lv_api.lv_leaderboard_opt(t.id('hub'), true) ->> 'opted_in') = 'true');
select t.check('leaderboard: only ended Campaigns count (the live one does not)',
  (lv_api.lv_leaderboard_get(t.id('hub')) #>> '{entries,0,campaigns}') = '2');
select t.as_kpn(2); select lv_api.lv_leaderboard_opt(t.id('hub'), true);
select t.check('leaderboard: ranks by participation count, names only for the opted in',
  (lv_api.lv_leaderboard_get(t.id('hub')) #>> '{entries,0,display_name}') = 'Member Three'
  and (lv_api.lv_leaderboard_get(t.id('hub')) #>> '{entries,1,display_name}') = 'Poster'
  and (lv_api.lv_leaderboard_get(t.id('hub')) #>> '{entries,1,rank}') = '2'
  and jsonb_array_length(lv_api.lv_leaderboard_get(t.id('hub')) -> 'entries') = 2);
select t.check('leaderboard: Member Five (not opted in) never appears', (lv_api.lv_leaderboard_get(t.id('hub')))::text not like '%Member Five%');
select t.check('leaderboard: entries carry no answers, timings or Campaign ids',
  not exists (select 1 from jsonb_array_elements(lv_api.lv_leaderboard_get(t.id('hub')) -> 'entries') e, jsonb_object_keys(e) k
               where k not in ('rank', 'display_name', 'campaigns', 'me')));
select t.as_kpn(1); select lv_api.lv_campaign_close(t.id('clive'));
select t.as_kpn(3);
select t.check('leaderboard: once the live Campaign ends it counts', (lv_api.lv_leaderboard_get(t.id('hub')) #>> '{entries,0,campaigns}') = '3');
select t.check('leaderboard: opting out works', (lv_api.lv_leaderboard_opt(t.id('hub'), false) ->> 'opted_in') = 'false');
select t.check('leaderboard: an opted-out member is gone', (lv_api.lv_leaderboard_get(t.id('hub')))::text not like '%Member Three%');
select t.as_kpn(4);
select t.check('leaderboard: a non-member cannot read it', t.code(lv_api.lv_leaderboard_get(t.id('hub'))) = 'lv_forbidden');

-- ===== shop and Hub points (C-02) ========================================================================
select t.as_kpn(3);
select t.check('shop: points are off by default and show no balance', (lv_api.lv_shop_get(t.id('hub')) ->> 'points_enabled') = 'false'
  and (lv_api.lv_community_get(t.id('hub')) #> '{me,points}') = 'null'::jsonb);
select t.as_kpn(1);
select t.check('shop: points per Campaign need community.shop', t.code(lv_api.lv_campaign_points_set(t.id('clive'), 10)) = 'ok');
select t.as_kpn(3);
select t.check('shop: a plain member cannot set points', t.code(lv_api.lv_campaign_points_set(t.id('clive'), 10)) = 'lv_forbidden');
select t.as_kpn(1);
select t.check('shop: turning points on works', (lv_api.lv_community_update(t.id('hub'), true) #>> '{settings,points_enabled}') = 'true');
select t.put('cp', t.c20_campaign(t.id('hub'), 'anonymous', array[3, 5], false)::text);
select t.as_kpn(1); select lv_api.lv_campaign_points_set(t.id('cp'), 25);
-- Points are recorded at participation time: set the value first, then answer.
select t.put('cp2', (lv_api.lv_campaign_create(t.id('hub'), 'Points poll', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('cp2q', (lv_api.lv_campaign_question_add(t.id('cp2'), 1, 'yes_no', 'Again?') ->> 'question_id'));
select lv_api.lv_campaign_points_set(t.id('cp2'), 40);
select lv_api.lv_campaign_activate(t.id('cp2'));
select t.as_kpn(3); select lv_api.lv_submit_response(t.id('cp2'), jsonb_build_array(jsonb_build_object('question_id', t.id('cp2q'), 'value', true)));
select t.as_kpn(5); select lv_api.lv_submit_response(t.id('cp2'), jsonb_build_array(jsonb_build_object('question_id', t.id('cp2q'), 'value', false)));
select t.as_pg();
select t.check('points: the award is on the participation row, recorded', t.q(format(
  $q$select string_agg(points::text || ':' || reward_state, ',') from lv.participation where campaign_id = %L::uuid$q$, t.get('cp2'))) = '40:recorded,40:recorded');
select t.check('points: an anonymous Campaign keeps no link from participation to the submission', t.q(format(
  $q$select count(*)::text from lv.participation where campaign_id = %L::uuid and submission_id is not null$q$, t.get('cp2'))) = '0');
select t.check('points: participation before the value was set earned nothing', t.q(format(
  $q$select coalesce(sum(points), 0)::text from lv.participation where campaign_id = %L::uuid$q$, t.get('cp'))) = '0');
select t.as_kpn(3);
select t.check('points: the member sees their own balance', (lv_api.lv_shop_get(t.id('hub')) ->> 'balance') = '40'
  and (lv_api.lv_community_get(t.id('hub')) #>> '{me,points}') = '40');
select t.as_kpn(1);
select t.put('item', (lv_api.lv_shop_item_save(t.id('hub'), 'Club socks', 'Reflective', 30, 1) #>> '{item,item_id}'));
select t.check('shop: an item with a point price and stock is created', t.get('item') is not null);
select t.put('item2', (lv_api.lv_shop_item_save(t.id('hub'), 'Water bottle', null, 500) #>> '{item,item_id}'));
select t.check('shop: a zero price is lv_invalid_input', t.code(lv_api.lv_shop_item_save(t.id('hub'), 'Free', null, 0)) = 'lv_invalid_input');
select t.as_kpn(3);
select t.check('shop: a plain member cannot add items', t.code(lv_api.lv_shop_item_save(t.id('hub'), 'Mine', null, 1)) = 'lv_forbidden');
select t.check('shop: not enough points is lv_insufficient_points', t.code(lv_api.lv_shop_order_place(t.id('item2'))) = 'lv_insufficient_points');
select t.put('o1', lv_api.lv_shop_order_place(t.id('item'))::text);
select t.check('shop: an order is placed and the balance drops', t.code(t.get('o1')::jsonb) = 'ok' and (t.get('o1')::jsonb ->> 'balance') = '10');
select t.as_kpn(5);
select t.check('shop: the last item in stock is gone: lv_out_of_stock', t.code(lv_api.lv_shop_order_place(t.id('item'))) = 'lv_out_of_stock');
select t.check('shop: a member cannot fulfil an order', t.code(lv_api.lv_shop_order_update((t.get('o1')::jsonb #>> '{order,order_id}')::uuid, 'fulfilled')) = 'lv_not_found');
select t.check('shop: a member cannot list the Hub orders', t.code(lv_api.lv_shop_order_list(t.id('hub'))) = 'lv_forbidden');
select t.as_kpn(1);
select t.check('shop: the Hub lists orders with the member name',
  (lv_api.lv_shop_order_list(t.id('hub'), 'placed') #>> '{orders,0,member_name}') = 'Member Three');
select t.as_kpn(3);
select t.check('shop: the member cancels their own open order',
  t.code(lv_api.lv_shop_order_update((t.get('o1')::jsonb #>> '{order,order_id}')::uuid, 'cancelled')) = 'ok');
select t.check('shop: cancelling refunds the points and restores the stock', (lv_api.lv_shop_get(t.id('hub')) ->> 'balance') = '40'
  and (select (e->>'stock')::int from jsonb_array_elements(lv_api.lv_shop_get(t.id('hub')) -> 'items') e where e->>'item_id' = t.get('item')) = 1);
select t.put('o2', lv_api.lv_shop_order_place(t.id('item'))::text);
select t.as_kpn(1);
select t.check('shop: the Hub fulfils an order', (lv_api.lv_shop_order_update((t.get('o2')::jsonb #>> '{order,order_id}')::uuid, 'fulfilled') #>> '{order,status}') = 'fulfilled');
select t.check('shop: a fulfilled order cannot change again',
  t.code(lv_api.lv_shop_order_update((t.get('o2')::jsonb #>> '{order,order_id}')::uuid, 'cancelled')) = 'lv_lifecycle_invalid');
select t.as_pg();
select t.set_limit('shop.max_items', '2'::jsonb);
select t.as_kpn(1);
select t.check('shop: the active item limit is lv_limit_reached', t.code(lv_api.lv_shop_item_save(t.id('hub'), 'Hat', null, 5)) = 'lv_limit_reached');
select t.check('shop: deactivating an item frees a slot',
  t.code(lv_api.lv_shop_item_save(t.id('hub'), null, null, null, null, false, t.id('item2'))) = 'ok'
  and t.code(lv_api.lv_shop_item_save(t.id('hub'), 'Hat', null, 5)) = 'ok');
select t.check('shop: points never reach guests: participation rows always have an account',
  t.q($$select count(*)::text from lv.participation where account_id is null$$) = '0');

-- ===== expired plan fails closed; reads and opting out keep working ======================================
select t.as_pg();
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where hub_id = t.id('hub');
select t.as_kpn(2);
select t.check('expired: posting is lv_entitlement_required', t.code(lv_api.lv_news_save(t.id('hub'), 'Late')) = 'lv_entitlement_required');
select t.check('expired: reading the Newsroom still works', t.code(lv_api.lv_news_list(t.id('hub'))) = 'ok');
select t.as_kpn(3);
select t.check('expired: commenting is lv_entitlement_required', t.code(lv_api.lv_comment_add(t.id('hub'), 'hi', t.id('post1'))) = 'lv_entitlement_required');
select t.check('expired: ordering is lv_entitlement_required', t.code(lv_api.lv_shop_order_place(t.id('item'))) = 'lv_entitlement_required');
select t.check('expired: the balance is kept', (lv_api.lv_shop_get(t.id('hub')) ->> 'balance') = '10');
select t.check('expired: opting out of the leaderboard still works', t.code(lv_api.lv_leaderboard_opt(t.id('hub'), false)) = 'ok');
select t.as_kpn(1);
select t.check('expired: enabling an add-on page is refused', t.code(lv_api.lv_hub_pages_update(t.id('hub'), '[{"key":"shop","kind":"shop","title":"Shop"}]'::jsonb)) = 'lv_entitlement_required');
select t.as_pg();
select t.check('expired: nothing was deleted', t.q(format($q$select (select count(*) from lv.news_posts where hub_id = %1$L::uuid)
  + (select count(*) from lv.shop_orders where hub_id = %1$L::uuid)$q$, t.get('hub'))) = '5');
update lv.entitlements set ends_at = null where hub_id = t.id('hub');

-- ===== personal spaces are never community spaces (LC-06) ================================================
select t.as_kpn(6);
select t.check('personal: every community operation answers lv_not_found',
  t.code(lv_api.lv_community_get(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_community_update(t.id('personal'), true)) = 'lv_not_found'
  and t.code(lv_api.lv_news_list(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_news_save(t.id('personal'), 'X')) = 'lv_not_found'
  and t.code(lv_api.lv_comment_list(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_comment_add(t.id('personal'), 'x')) = 'lv_not_found'
  and t.code(lv_api.lv_leaderboard_get(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_leaderboard_opt(t.id('personal'), true)) = 'lv_not_found'
  and t.code(lv_api.lv_shop_get(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_shop_item_save(t.id('personal'), 'X', null, 1)) = 'lv_not_found'
  and t.code(lv_api.lv_shop_order_list(t.id('personal'))) = 'lv_not_found');
select t.as_pg();
select t.put('qs', t.q(format($q$select id::text from lv.campaigns where hub_id = %L::uuid limit 1$q$, t.get('personal'))));
select t.as_kpn(6);
select t.check('personal: Quick Survey points answer lv_not_found', t.code(lv_api.lv_campaign_points_set(t.id('qs'), 5)) = 'lv_not_found');

-- ===== Discover listing ==================================================================================
select t.as_pg();
select t.grant_credit(t.id('poster'), 'team');
select t.grant_credit(t.id('poster'), 'team');
select t.grant_credit(t.id('poster'), 'team');
select t.as_kpn(2);
select t.put('team1', (lv_api.lv_hub_create('harbor-sailing', 'Harbor Sailing Club') ->> 'hub_id'));
select lv_api.lv_hub_update(t.id('team1'), null, 'public', 'open', 'Sailing every weekend.');
select lv_api.lv_community_update(t.id('team1'), null, 'sports_fitness');
select t.put('team2', (lv_api.lv_hub_create('quiet-team', 'Quiet Team') ->> 'hub_id'));
select t.put('team3', (lv_api.lv_hub_create('pending-team', 'Pending Team') ->> 'hub_id'));
select lv_api.lv_hub_update(t.id('team3'), null, 'public');
select t.as_kpn(1);
select t.check('discover: a category outside the list is lv_invalid_input', t.code(lv_api.lv_community_update(t.id('hub'), null, 'not_a_category')) = 'lv_invalid_input');
select t.as_pg();
insert into lv.discover_applications (hub_id, status, genuine_members) values
  (t.id('team1'), 'approved', 812), (t.id('team2'), 'approved', 800), (t.id('team3'), 'submitted', 750),
  (t.id('hub'), 'approved', 900), (t.id('personal'), 'approved', 999);
select t.as_anon();
select t.put('dl', lv_api.lv_discover_list()::text);
select t.check('discover: works signed out', t.code(t.get('dl')::jsonb) = 'ok');
select t.check('discover: only the approved, public, Team-family Hub is listed',
  jsonb_array_length(t.get('dl')::jsonb -> 'hubs') = 1 and (t.get('dl')::jsonb #>> '{hubs,0,slug}') = 'harbor-sailing');
select t.check('discover: a private approved Hub, a pending one and a Starter one are not listed',
  t.get('dl') not like '%quiet-team%' and t.get('dl') not like '%pending-team%' and t.get('dl') not like '%northside-running%');
select t.check('discover: personal spaces and Quick Surveys never appear',
  t.get('dl') not like '%Solo survey%' and t.get('dl') not like '%' || t.get('personal') || '%');
select t.check('discover: the member count is rounded down to the nearest 100', (t.get('dl')::jsonb #>> '{hubs,0,members_rounded}') = '0'
  and (t.get('dl')::jsonb #>> '{hubs,0,category}') = 'sports_fitness');
select t.check('discover: no Hub id, owner or exact count is exposed',
  t.get('dl') not like '%' || t.get('team1') || '%' and t.get('dl') not like '%hub_id%' and t.get('dl') not like '%owner%');
select t.check('discover: search matches the name', jsonb_array_length(lv_api.lv_discover_list('sailing') -> 'hubs') = 1
  and jsonb_array_length(lv_api.lv_discover_list('running') -> 'hubs') = 0);
select t.check('discover: a LIKE wildcard in the search is literal', jsonb_array_length(lv_api.lv_discover_list('%') -> 'hubs') = 0);
select t.check('discover: category filters', jsonb_array_length(lv_api.lv_discover_list(null, 'sports_fitness') -> 'hubs') = 1
  and jsonb_array_length(lv_api.lv_discover_list(null, 'faith') -> 'hubs') = 0);
select t.check('discover: an unknown category is lv_invalid_input', t.code(lv_api.lv_discover_list(null, 'nope')) = 'lv_invalid_input');
select t.as_pg();
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where hub_id = t.id('team1');
select t.as_anon();
select t.check('discover: a lapsed Team plan drops out of the listing (and keeps its data)',
  jsonb_array_length(lv_api.lv_discover_list() -> 'hubs') = 0);
select t.as_kpn(2);
select t.check('discover: the Hub manager sees its application status', (lv_api.lv_community_get(t.id('team1')) #>> '{discover,status}') = 'approved');

-- ===== grants ============================================================================================
select t.as_pg();
select t.check('grants: no community function is executable by PUBLIC',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and p.proname ~ '^lv_(community|news|comment|leaderboard|shop|campaign_points|discover_list)'
           and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)$$) = '0');
select t.check('grants: anon executes only Discover and the public Newsroom reads',
  t.q($$select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and p.proname ~ '^lv_(community|news|comment|leaderboard|shop|campaign_points|discover_list)'
           and has_function_privilege('anon', p.oid, 'execute')$$) = 'lv_discover_list,lv_news_get,lv_news_list');
select t.check('grants: every new lv table has RLS on and no API role access',
  t.q($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'lv' and c.relname in ('hub_community', 'news_posts', 'comments', 'comment_reports', 'leaderboard_optins',
                                                  'campaign_points', 'shop_items', 'shop_orders')
           and c.relrowsecurity and not has_table_privilege('authenticated', c.oid, 'select')
           and not has_table_privilege('anon', c.oid, 'select')$$) = '8');
select t.check('grants: every new definer function pins search_path',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('lv', 'lv_api') and p.prosecdef
           and p.proname ~ '(community|news|comment|leaderboard|shop|campaign_points|discover_list|addon|points|item_json|order_json|post_json)'
           and not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')$$) = '0');

rollback;
