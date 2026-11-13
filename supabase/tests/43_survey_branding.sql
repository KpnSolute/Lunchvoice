-- 43: survey branding (000043). The theme belongs to the survey; the Hub's color is only a starting point or an
-- explicit "follow"; entitlement = Hub plan OR the creator's Creator plan; a lapse falls back without deleting.
select set_config('t.file', '43_survey_branding', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('qs', lv_api.lv_quick_survey_create('Book club', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select lv_api.lv_campaign_question_add(t.id('qs'), 1, 'rating', 'How was it?', '{}'::jsonb);
select t.put('logo', t.get('qs') || '/logo-0123456789abcdef0123.png');
select t.put('cover', t.get('qs') || '/cover-fedcba9876543210fedc.webp');

-- Contrast helpers.
select t.as_pg();
select t.check('contrast: ink on white is about 18.9:1', round(lv.contrast_ratio('#14110f', '#ffffff'), 1) between 18.5 and 19.2);
select t.check('contrast: LunchVoice amber on white fails AA', lv.contrast_ratio('#ff9a18', '#ffffff') < 4.5);
select t.check('contrast: every Hub palette color passes on white',
  not exists (select 1 from jsonb_array_elements(lv.accent_palette()) a where lv.contrast_ratio(a->>'hex', '#ffffff') < 4.5));

-- Free personal space: locked, with the plan that unlocks it.
select t.as_kpn(1);
select t.check('free: features say branding is not included', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{features,branding}') = 'false');
select t.put('denied', lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e"}'::jsonb)::text);
select t.check('free: saving is lv_entitlement_required naming Creator Plus',
  t.code(t.get('denied')::jsonb) = 'lv_entitlement_required' and (t.get('denied')::jsonb #>> '{error,product}') = 'creator_plus');
select t.check('free: a branding image cannot be uploaded', not lv_storage.branding_writable('survey-logos', t.get('logo')));

-- Creator Plus on the person (no Hub at all) unlocks a standalone Quick Survey.
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(1);
select t.check('creator plus: branding allowed, footer removal not', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{features,branding}') = 'true'
  and (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{features,remove_footer}') = 'false');
select t.check('creator plus: the owner may upload a logo into this survey''s folder', lv_storage.branding_writable('survey-logos', t.get('logo')));
select t.check('storage: a logo name in the cover bucket is refused', not lv_storage.branding_writable('survey-covers', t.get('logo')));
select t.check('storage: an svg name is refused', not lv_storage.branding_writable('survey-logos', t.get('qs') || '/logo-0123456789abcdef0123.svg'));
select t.check('save: a light color (amber text on white) is refused',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#ff9a18"}'::jsonb)) = 'lv_invalid_input');
select t.check('save: a logo outside this survey''s folder is refused',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), jsonb_build_object('logo_path', gen_random_uuid()::text || '/logo-0123456789abcdef0123.png'))) = 'lv_invalid_input');
select t.check('save: following a Hub is refused for a Quick Survey',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"follow_hub":true,"color":"#0f766e"}'::jsonb)) = 'lv_invalid_input');
select t.check('save: hiding the footer needs Creator Pro',
  (lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","hide_footer":true}'::jsonb) #>> '{error,product}') = 'creator_pro');
select t.check('save: a full theme saves',
  t.code(lv_api.lv_campaign_branding_set(t.id('qs'), jsonb_build_object('color', '#0F766E', 'logo_path', t.get('logo'), 'cover_path', t.get('cover'),
    'welcome_headline', 'Pick next month''s book', 'thank_you', 'See you Thursday.', 'button_style', 'pill'))) = 'ok');
select t.check('save: the color is stored lower-case', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,color}') = '#0f766e');

-- Draft: only managers see the theme and the images.
select t.as_anon();
select t.check('draft: the public gets no theme', (lv_api.lv_campaign_theme(t.id('qs')) -> 'theme') = 'null'::jsonb);
select t.check('draft: the public cannot read the logo', not lv_storage.branding_readable('survey-logos', t.get('logo')));
select t.as_kpn(2);
select t.check('draft: another person cannot write or save', not lv_storage.branding_writable('survey-logos', t.get('logo'))
  and t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e"}'::jsonb)) = 'lv_not_found');
select t.as_kpn(1);
select t.check('draft: the owner previews the theme', (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,color}') = '#0f766e');

-- Published: everyone sees it; anonymity is untouched.
select t.check('publish: the survey publishes', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.as_anon();
select t.check('published: a guest gets the theme with the footer', (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,headline}') is null
  and (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,welcome_headline}') = 'Pick next month''s book'
  and (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,hide_footer}') = 'false');
select t.check('published: a guest can read the saved logo and cover', lv_storage.branding_readable('survey-logos', t.get('logo'))
  and lv_storage.branding_readable('survey-covers', t.get('cover')));
select t.check('published: an unreferenced upload stays private',
  not lv_storage.branding_readable('survey-logos', t.get('qs') || '/logo-aaaaaaaaaaaaaaaaaaaa.png'));
select t.check('published: anonymity is unchanged', t.q(format($q$select anonymity from lv.campaigns where id = %L::uuid$q$, t.get('qs'))) = 'anonymous');
select t.check('grants: anon cannot write images or call the editor API',
  t.raises($$select lv_storage.branding_writable('survey-logos', 'x')$$) and t.raises(format($q$select lv_api.lv_campaign_branding_get(%L::uuid)$q$, t.get('qs'))));
select t.check('grants: the table is not readable by API roles', t.raises($$select * from lv.campaign_branding$$));

-- Lapse: the data stays, the player falls back.
select t.as_pg();
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where account_id = t.id('me') and family = 'creator_plus';
select t.as_anon();
select t.check('lapse: the player falls back to LunchVoice styling', (lv_api.lv_campaign_theme(t.id('qs')) -> 'theme') = 'null'::jsonb);
select t.check('lapse: the images are no longer public', not lv_storage.branding_readable('survey-logos', t.get('logo')));
select t.as_kpn(1);
select t.check('lapse: the stored theme is kept', (lv_api.lv_campaign_branding_get(t.id('qs')) #>> '{branding,color}') = '#0f766e');
select t.check('lapse: new edits are refused', t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#1d4ed8"}'::jsonb)) = 'lv_entitlement_required');
select t.check('lapse: a reset is always allowed', t.code(lv_api.lv_campaign_branding_set(t.id('qs'), null)) = 'ok');
select t.check('lapse: the reset removed the theme', (lv_api.lv_campaign_branding_get(t.id('qs')) -> 'branding') = 'null'::jsonb);

-- Creator Pro hides the footer.
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_pro', 'creator_pro', 'grant');
select t.as_kpn(1);
select t.check('creator pro: the footer can go', t.code(lv_api.lv_campaign_branding_set(t.id('qs'), '{"color":"#0f766e","hide_footer":true}'::jsonb)) = 'ok');
select t.check('creator pro: the player drops the footer', (lv_api.lv_campaign_theme(t.id('qs')) #>> '{theme,hide_footer}') = 'true');

-- A Hub Campaign: its own theme is independent of the Hub; following is an explicit choice.
select t.as_kpn(3, null, true, 'Hub owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.as_kpn(3);
select t.put('hub', (lv_api.lv_hub_create('brand-hub', 'Brand Hub') ->> 'hub_id'));
select lv_api.lv_hub_update(t.id('hub'), null, null, null, null, 'teal');
select t.put('c1', (lv_api.lv_campaign_create(t.id('hub'), 'Own theme', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('c2', (lv_api.lv_campaign_create(t.id('hub'), 'Follows the Hub', 'poll', 'anonymous') ->> 'campaign_id'));
select t.check('hub: the editor offers the Hub color as a starting point', (lv_api.lv_campaign_branding_get(t.id('c1')) #>> '{hub,accent_hex}') = '#0f766e');
select t.check('hub: Starter Hub allows branding for its managers', t.code(lv_api.lv_campaign_branding_set(t.id('c1'), '{"color":"#be123c"}'::jsonb)) = 'ok'
  and t.code(lv_api.lv_campaign_branding_set(t.id('c2'), '{"follow_hub":true,"color":"#0f766e"}'::jsonb)) = 'ok');
select lv_api.lv_hub_update(t.id('hub'), null, null, null, null, 'indigo');
select t.check('hub: changing the Hub color leaves a survey''s own theme untouched', (lv_api.lv_campaign_theme(t.id('c1')) #>> '{theme,color}') = '#be123c');
select t.check('hub: a survey that chose to follow the Hub takes the new color', (lv_api.lv_campaign_theme(t.id('c2')) #>> '{theme,color}') = '#4338ca');
select t.check('hub: footer removal is a Team feature', t.code(lv_api.lv_campaign_branding_set(t.id('c1'), '{"color":"#be123c","hide_footer":true}'::jsonb)) = 'lv_entitlement_required');
rollback;
