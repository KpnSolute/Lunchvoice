-- 48: survey branding v2 (000048): gradients and cosmetics on top of 000043. Same rules: per-survey, plan-gated, strict.
select set_config('t.file', '48_branding_gradients', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('qs', lv_api.lv_quick_survey_create('Lunch poll', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select lv_api.lv_campaign_question_add(t.id('qs'), 1, 'rating', 'How was it?', '{}'::jsonb);
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(1);

select t.check('free path unchanged: a plain 000043 save is still a solid theme',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e"}'::jsonb)) = 'ok');
select t.check('defaults: solid, diagonal, fill, quiet cosmetics',
  (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,style}') = 'solid'
  and (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,banner_style}') = 'fill'
  and (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,cosmetics,glow}') = 'false');
select t.check('gradient: two readable colors save with a direction and cosmetics',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"style":"gradient","color":"#0f766e","color2":"#1d4ed8","gradient_angle":180,"banner_style":"pattern","cosmetics":{"pattern":"grid","progress_tint":true,"glow":true}}'::jsonb)) = 'ok');
select t.check('gradient: the saved values come back',
  (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,color2}') = '#1d4ed8'
  and (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,gradient_angle}') = '180'
  and (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,cosmetics,pattern}') = 'grid');
select t.check('logo: the optional drop shadow saves and defaults off',
  (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,cosmetics,logo_shadow}') = 'false'
  and t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","cosmetics":{"logo_shadow":true}}'::jsonb)) = 'ok');
select t.check('logo: the shadow comes back', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,cosmetics,logo_shadow}') = 'true');
select t.check('gradient: a light second color is refused (white text would not read)',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"style":"gradient","color":"#0f766e","color2":"#fbbf24"}'::jsonb)) = 'lv_invalid_input');
select t.check('gradient: a missing second color is refused',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"style":"gradient","color":"#0f766e"}'::jsonb)) = 'lv_invalid_input');
select t.check('gradient: a bad direction, banner, pattern or style is refused',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"style":"gradient","color":"#0f766e","color2":"#1d4ed8","gradient_angle":45}'::jsonb)) = 'lv_invalid_input'
  and t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","banner_style":"video"}'::jsonb)) = 'lv_invalid_input'
  and t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","cosmetics":{"pattern":"stripes"}}'::jsonb)) = 'lv_invalid_input'
  and t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","style":"rainbow"}'::jsonb)) = 'lv_invalid_input');
select t.check('solid: a stray second color is dropped',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","color2":"#1d4ed8"}'::jsonb)) = 'ok');
select t.check('solid: the second color was not stored', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,color2}') is null);
select t.check('grants: the table is still closed to API roles', t.raises($$select * from lv.campaign_branding$$));

select t.check('save: a gradient to publish', t.code(lv_api.lv_campaign_branding_set(t.id('qs'),
  '{"style":"gradient","color":"#0f766e","color2":"#1d4ed8","gradient_angle":90,"cosmetics":{"pattern":"none","progress_tint":true,"glow":false}}'::jsonb)) = 'ok');
select t.check('publish: the survey publishes', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.as_anon();
select t.check('published: a guest gets the gradient fields', (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,style}') = 'gradient'
  and (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,color2}') = '#1d4ed8'
  and (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,gradient_angle}') = '90'
  and (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,cosmetics,progress_tint}') = 'true');
select t.as_pg();
insert into lv.hub_suspensions (hub_id, reason) select hub_id, 'test suspension' from lv.campaigns where id = t.id('qs');
select t.as_anon();
select t.check('visibility: a suspended Hub still shows no theme', (lv_api.lv_campaign_theme(t.id('qs')) -> 'theme') = 'null'::jsonb);
select t.as_pg();
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where account_id = t.id('me') and family = 'creator_plus';
select t.as_anon();
select t.check('lapse: the player falls back', (lv_api.lv_campaign_theme(t.id('qs')) -> 'theme') = 'null'::jsonb);
select t.as_kpn(1);
select t.check('lapse: the gradient is kept', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,style}') = 'gradient');
select t.check('lapse: new edits are refused', t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e"}'::jsonb)) = 'lv_entitlement_required');
rollback;
