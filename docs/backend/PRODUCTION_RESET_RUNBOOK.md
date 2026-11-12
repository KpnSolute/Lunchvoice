# Production runbook — LunchVoice v2 launch apply (000014–000017)

**Status: EXECUTED 2026-11-07 (steps 0–3, 6, 7.1) under the founder's conditional approval F-13**, after the compliance
re-review confirmed 0 BLOCKER and 0 HIGH. Applied from commit `e375fca` (file hashes verified before apply). Backup
before apply: `2184898828` (2026-11-06 10:40 UTC). The Management API recorded the files under timestamp versions;
`supabase_migrations.schema_migrations` was corrected to `000014`–`000017`. Grant audit A–F and the policy check
matched exactly; `lv_api` was then exposed. `billing-webhook` is not deployed yet (answers nothing until Stripe is
wired; deploy it together with the Stripe setup). Future runs: a new procedure needs fresh founder approval.

**000023-000024: EXECUTED 2026-11-08** (staff panel; API, webhooks, Discord) and **000025-000027: EXECUTED 2026-11-09** (suspended participation, reserved page names, edit a paused Campaign), each from a CI-green commit with file hashes verified and a seeded-database rehearsal first; see CHANGELOG.

**000018-000022: EXECUTED 2026-11-08** under the founder's approval for the full build, after the gate (0 BLOCKER,
0 HIGH), from `33cf4a7` (hashes verified), rehearsed on production-shaped data first; history versions corrected;
grant audit exact. Pending: `supabase functions deploy session billing-webhook checkout email-dispatch` (founder,
CLI) and the section 11 Stripe/email steps.

Project: LunchVoice Supabase project, ref `qprfonxvthmaoxfixigk`. Identity provider: KpnIdentity
(`axzwdbizblfkspduqilj`, `auth.kpnsolute.com`). Verify the ref before every step.

## Current production state (2026-11-07)

- The canonical chain `000001`–`000013` is applied. v1 is retired and gone.
- The `session` Edge Function is deployed and the Google → KpnIdentity → LunchVoice sign-in works end to end.
  Do not change identity configuration in this procedure.
- The Data API exposes only `public,graphql_public`. `lv_api` is **not** exposed, so every RPC from the live site
  answers HTTP 406. That is intentional until step 6: before 000014, every `lv_api` function is executable by
  `public` (LC-05), so exposing `lv_api` first would make that finding exploitable. Never expose `lv`.

## 0. Pre-checks (all must pass; stop on any failure)

1. Local proof on the exact commit to apply:
   - `bash scripts/db-test-canonical.sh` → `checks: N, failed: 0`, both races pass, rollback rehearsal passes, `PASS`.
   - `npm run test:functions` and `npm run check:brain` pass.
2. Production chain matches the repository:
   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   -- expect exactly the 000001..000013 canonical files (no 000014+ yet, no other files)
   select count(*) from pg_namespace where nspname in ('lv', 'lv_api');   -- 2
   ```
3. Take a backup or snapshot (Dashboard → Database → Backups). Record its id in the approval thread.
4. Confirm there is no customer data that the new constraints would reject:
   ```sql
   select count(*) from lv.hubs where slug is null;              -- 0
   select count(*) from lv.hubs h where exists (select 1 from lv.reserved_slugs r where r.slug = h.slug);  -- 0
   ```
   Note: existing Hubs get no entitlement automatically. After 000014 a Hub without one is read-only for premium
   actions (fail closed, nothing deleted). Grant entitlements in step 5 before announcing.

## 1. Apply 000014, 000015, 000016, 000017 (in order, one at a time)

Use the Supabase CLI against the linked project, or paste each file into the SQL editor. Each file is one
transaction (`begin … commit`); a failure leaves the database at the previous file.

```
supabase link --project-ref qprfonxvthmaoxfixigk
supabase db push          # applies only the pending 000014..000017
```

After each file: `select version from supabase_migrations.schema_migrations order by version desc limit 1;`

## 2. Post-apply grant audit (LC-05, LC-20, LC-29) — must return the expected rows exactly

```sql
-- A. nothing in lv_api is executable by PUBLIC                                 expect 0
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'lv_api' and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0);
-- B. anon executes exactly the signed-out allow-list                           expect these 10 names
select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'lv_api' and has_function_privilege('anon', p.oid, 'execute');
-- lv_capability_catalog,lv_guest_campaign_get,lv_guest_submit,lv_hub_get,lv_hub_pages_get,
-- lv_hub_reservation_status,lv_my_context,lv_plan_limits,lv_report_abuse,lv_waitlist_status
-- C. no lv function is executable by anon or authenticated                      expect 0
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'lv' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
-- D. no lv table is readable by anon or authenticated; no schema usage          expect 0, false, false
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'lv' and c.relkind in ('r','S','v')
   and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'));
select has_schema_privilege('anon', 'lv', 'usage'), has_schema_privilege('authenticated', 'lv', 'usage');
-- E. RLS on every lv table                                                     expect 0
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'lv' and c.relkind = 'r' and not c.relrowsecurity;
-- F. service-only functions: service_role yes, never in lv_api                   expect true, true, 0
select has_function_privilege('service_role', 'lv.billing_apply_event(text, text, text, jsonb)', 'execute'),
       has_function_privilege('service_role', 'lv.retention_sweep()', 'execute');
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'lv_api' and (p.proname like '%billing_apply%' or p.proname like '%retention%');
```

If any result differs: **do not expose `lv_api`**; roll back (step 8) and report.

## 3. Policy verification

```sql
select key, value from lv.policy order by key;
```

Expected launch values: `campaign.min_cohort` 5, `participation.guest_rate_per_minute` 10, `waitlist.seats` 50,
`waitlist.consent_version` "2026-11-07", `quick.create_per_hour` 20, `abuse.reports_per_minute` 20,
`security.reauth_seconds` 600, `hub.deleted_slug_cooldown_days` 30, `reservation.grace_days` 25,
`discover.active_window_days` 90, `retention.logs_days` 365, `retention.guest_hash_days` 7,
`billing.provider_ready` false, `billing.payment_links` NULL, `billing.launched_at` NULL (keep provider_ready
false and payment_links NULL until 000017 is applied and the Stripe Payment Links have fixed prices that match
`lv.products`; 000017 then rejects any session whose amount, currency or payment status does not match its intent. A fixed-price link only matches one week count, so a Campaign plan bought for more weeks than its link charges is rejected, never over-granted: use one link per week count, or server-created Checkout Sessions with quantity = weeks),
`identity.trusted_issuers` = the KpnIdentity issuer array (unchanged from today). The retired keys
`campaign.max_active_per_hub` and `roles.max_custom_per_hub` must be absent. Limits live in `lv.plan_limits`:

```sql
select family, key, value, note from lv.plan_limits order by family, key;
select product, family, price_cents, interval, first_period_weeks, extra_week_cents, purchasable from lv.products;
```

## 4. Edge Functions and secrets (names only; values never go in chat, code or this file)

- `session` (deployed): `KPNIDENTITY_ISSUERS`, `KPNIDENTITY_CLIENT_ID`, `KPNIDENTITY_JWKS_URL`, `LV_SESSION_PRIVATE_JWK`,
  `LV_ALLOWED_ORIGINS`. The public half of the session key stays imported in the project's JWT signing keys.
  Do not change these. Never configure KpnIdentity as third-party auth on this project (LC-12).
- `billing-webhook` (new, deploy now, safe while unconfigured): `supabase functions deploy billing-webhook`.
  `verify_jwt = false` comes from `supabase/config.toml`. It needs `SUPABASE_DB_URL` (provided by the platform) and
  `STRIPE_WEBHOOK_SECRET` (set only when the founder wires Stripe). Until then it answers 503. Its database role
  must be able to `SET ROLE service_role` (true for the platform's `postgres` connection).
- Supabase Auth sign-ups on this project stay disabled (people sign in through KpnIdentity only).

## 5. Entitlement setup

- Waitlist: the first 50 signed-in people who join get a Founding Hub credit automatically. Nothing to do.
- The founder (or an existing Hub) can be granted access with a one-off service-role statement, recorded in the
  approval thread. Find the account id with `lv_my_context` signed in as that person, then:
  ```sql
  -- a Hub credit (the person then creates a Hub through the normal lv_hub_create flow)
  insert into lv.hub_credits (account_id, family, product, source) values ('<account uuid>', 'starter', 'founding', 'grant');
  -- or attach a plan to an existing Hub
  insert into lv.entitlements (scope, account_id, hub_id, family, product, source)
  values ('hub', '<owner account uuid>', '<hub uuid>', 'starter', 'founding', 'grant');
  ```
  Founding entitlements end 30 days after `billing.launched_at` is set. Never create a Hub on someone's behalf.
- Platform moderators: `select lv.grant_platform_admin('<account uuid>', null);`

## 6. Expose `lv_api` (only after steps 2 and 3 pass exactly)

Dashboard → Project Settings → API → Data API → Exposed schemas: `public, graphql_public, lv_api`
(or Management API `PATCH /v1/projects/qprfonxvthmaoxfixigk/postgrest` with `{"db_schema":"public,graphql_public,lv_api"}`).
Never add `lv`.

## 7. Smoke tests (live site and RPC)

1. Signed out: `lv_my_context` → `{ok:false, error:{code:"lv_unauthenticated"}}`; `lv_plan_limits` → ok;
   `lv_waitlist_status` → `seats_total: 50`; calling a signed-in function (e.g. `lv_quick_survey_list`) is refused
   with a permission error (HTTP 401/403), not data.
2. Sign in (Google → KpnIdentity): `lv_my_context` → ok and creates the account; `hubs: []`, `hub_credits: 0`.
3. `lv_waitlist_join` → `admitted` (position n) and `hub_credits: 1`; `lv_hub_create` a test slug → `plan.family: starter`.
4. Quick Survey: `lv_quick_survey_create` → add a question → `lv_campaign_activate` → open `/c/<join code>` signed
   out and answer as a guest → `lv_analytics_overview` shows `guest_n` and withholds what the cohort rule withholds.
5. `lv_checkout_start('starter_hub')` → `lv_billing_unavailable`. `POST /functions/v1/billing-webhook` → 503.
6. Clean up the test Hub with `lv_hub_delete` (typed slug, fresh sign-in): the slug then answers `lv_hub_gone` for
   30 days.

## 8. Privacy checks on production (read-only)

```sql
-- anonymous submissions never name an account, and participation never points at them
select count(*) from lv.submissions s join lv.campaigns c on c.id = s.campaign_id where c.anonymity = 'anonymous' and s.account_id is not null;  -- 0
select count(*) from lv.participation p join lv.campaigns c on c.id = p.campaign_id where c.anonymity = 'anonymous' and p.submission_id is not null; -- 0
-- personal spaces are never routable
select count(*) from lv.hubs where kind = 'personal' and slug is not null;   -- 0
```

## 9. Rollback

Rollbacks are rehearsed by `scripts/db-test-canonical.sh` on a blank database. On production they are a last resort
and lose the launch data (entitlements, waitlist, Quick Surveys, billing log). First set the Data API back to
`public,graphql_public`, then run, newest first, only the files that were applied:

```
supabase/rollbacks/000017_v2_billing_hardening.down.sql
supabase/rollbacks/000016_v2_billing_ready.down.sql
supabase/rollbacks/000015_v2_hub_management.down.sql
supabase/rollbacks/000014_v2_entitlements.down.sql
```

and delete their rows from `supabase_migrations.schema_migrations`. `000014`'s rollback refuses to run while personal
spaces exist (it never deletes answers); restore from the step-0 backup instead in that case.

## 10. Retention (L-13)

`lv.retention_sweep()` (service role) trims audit and analytics query logs older than 12 months and unlinks guest
rate-limit hashes older than 7 days. It is not scheduled by the migrations. When wanted:
`select cron.schedule('lv-retention', '17 3 * * *', 'select lv.retention_sweep()');` (needs the `pg_cron` extension).

## 000018 (track A hardening) — apply note

Needs explicit founder approval for this build (F-13 covered the launch apply only). Order matters:

1. **Apply `000018_v2_hardening.sql`** (after 000017, before 000019+). It hashes existing Campaign invite tokens in
   place (existing invite links keep working), gives every Campaign a link token, and turns ownership transfer into an
   offer. Rollback: `supabase/rollbacks/000018_v2_hardening.down.sql` is **lossy**: Campaign invites come back revoked
   (tokens were only stored hashed), pending ownership offers, role targeting, descriptions and link tokens are dropped.
2. **Before or at apply, confirm live sessions carry `aud = "authenticated"` and `session_kind = "lunchvoice"`** (LC-12):
   decode a fresh session from the deployed `session` function (`issueSession` has always set both). From this
   migration on, `lv.caller_identity()` refuses anything else. **Never configure KpnIdentity as third-party auth on the
   LunchVoice project.**
3. **Redeploy the `session` Edge Function** (LC-13) from `supabase/functions/session` (its `deno.json` now imports
   `postgres`). It uses `SUPABASE_DB_URL` (provided automatically) and runs `lv.session_exchange_consume` as
   `service_role`. Deploying it before 000018 is safe: on "undefined function" it falls back to an in-memory record.
   No new secret. Optional: `KPNIDENTITY_*` unchanged.
4. **Grant audit additions:** `lv.session_exchange_consume(text, timestamptz)` executable by `service_role` only; anon
   allow-list unchanged (`lv_guest_campaign_get` and `lv_guest_submit` are now VOLATILE, still anon); new `lv_api`
   functions (`lv_campaign_set_audience_roles`, `lv_campaign_invite_revoke_by_id`, `lv_hub_limits`,
   `lv_owner_transfer_accept|decline|cancel|status`) are `authenticated` only.
5. **Policies:** `joincode.misses_per_minute` 10, `joincode.global_misses_per_minute` 300, `hub.owner_offer_days` 7;
   plan limit `campaigns.role_targeting` (starter false, team true). The join-code limiter keys signed-out callers by a
   daily-rotated hash of `cf-connecting-ip` / `x-real-ip` / first `x-forwarded-for` from PostgREST `request.headers`;
   smoke test: 11 wrong codes in a minute from one client ⇒ `lv_rate_limited`, the link token still opens the survey.

<!-- ---- track B: commerce ---- -->
## 11. Enabling Stripe and email (000019; build plan B-01, B-02)

Nothing here is done by an agent. Each step needs the founder's explicit approval, and production migrations still
follow sections 0-2 (apply `000019_v2_commerce.sql` after 000017/000018, one at a time). Secret **values** never go
in chat, code, commits or this file; only their names appear here.

### 11.1 Secrets (names only)

| Name | Where | Needed by | Notes |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Edge Function secrets | `checkout` | Restricted key with write access to Customers, Checkout Sessions and Customer Portal sessions. Without it checkout answers 503. |
| `STRIPE_WEBHOOK_SECRET` | Edge Function secrets | `billing-webhook` | The endpoint's signing secret (`whsec_...`). Without it the webhook answers 503. |
| `RESEND_API_KEY` | Edge Function secrets | `email-dispatch` | Without it mail stays queued. |
| `EMAIL_FROM` (optional) | Edge Function secrets | `email-dispatch` | e.g. `LunchVoice <no-reply@lunchvoice.com>`; the domain must be verified in Resend. Default is that value. |
| `EMAIL_DISPATCH_SECRET` (optional) | Edge Function secrets | `email-dispatch` | A second bearer for the cron job if the service-role key should not be stored in the cron command. |
| `LV_APP_ORIGIN` (optional) | Edge Function secrets | `checkout`, `email-dispatch` | Default `https://lunchvoice.com`. |
| `LV_ALLOWED_ORIGINS` | Edge Function secrets | `checkout` | Same value as for `session`. |
| `LV_PUBLISHABLE_KEY` | Edge Function secrets | `checkout` | The publishable key (`sb_publishable_...`). Needed once the legacy anon key is disabled; until then `SUPABASE_ANON_KEY` is used. Custom secrets may not start with `SUPABASE_`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_URL` | provided by the platform | all | Do not set by hand. The dispatchers accept a key from `SUPABASE_SECRET_KEYS` (new) or the legacy service-role key. |

### Retiring the legacy anon and service-role keys

Supabase deprecates the JWT `anon` and `service_role` keys (target: end of 2026; they work until disabled in Settings >
API Keys). The code accepts both generations (`supabase/functions/_shared/keys.ts`, `src/lib/apiKey.ts`) and never
sends a key as `Authorization: Bearer`. Switch in this order, checking the site after each step:

1. Create a publishable key and a secret key in Supabase > Settings > API Keys (if they are not there already).
2. Render: set `VITE_SUPABASE_PUBLISHABLE_KEY` and redeploy. Sign in and load `/me` to confirm.
3. Edge Function secrets: `supabase secrets set LV_PUBLISHABLE_KEY` (the publishable key).
4. Anything that calls the dispatchers (pg_cron or another scheduler) sends a secret key (`sb_secret_...`) as `apikey`
   or `Authorization: Bearer` instead of the service-role key; or use `EMAIL_DISPATCH_SECRET`.
5. The share-preview Worker: `wrangler secret put SUPABASE_PUBLISHABLE_KEY` (`workers/hub-card/README.md`).
6. Only then disable the legacy keys in Supabase, and check sign-in, a guest answer, checkout (once billing is open),
   email dispatch and a Hub link preview.

Commands (the founder runs them; never paste values into chat):
`supabase secrets set STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET RESEND_API_KEY` (interactive or from a local env file
that is never committed), then `supabase functions deploy checkout`, `supabase functions deploy billing-webhook`,
`supabase functions deploy email-dispatch`. `verify_jwt = false` for all three comes from `supabase/config.toml`
(each function authenticates its caller itself).

### 11.2 Stripe dashboard

1. **Products and prices** (USD, tax behaviour "exclusive"), exactly the canonical prices in `lv.products`:
   - Starter Hub: recurring $13/month. Team Hub: recurring $29/month.
   - Campaign Starter: one-time $19 (first 2 weeks) and one-time $13 (per extra week).
   - Campaign Plus: one-time $39 (first 2 weeks) and one-time $19 (per extra week).
   - Hub Name Reservation: one-time $25 (12 months; renewal is another $25 purchase).
   Any other amount makes the webhook reject the grant (`amount_mismatch`, NEW-01).
2. **Stripe Tax**: enable it, add the origin address and registrations, and set the product tax codes. Checkout always
   sends `automatic_tax[enabled]=true`; LunchVoice has no tax logic.
3. **Customer Portal**: enable it; allow cancelling subscriptions **at the end of the billing period** (not
   immediately), no proration (F-08), allow updating payment methods and viewing invoices. Do not enable plan
   switching or promotion codes unless decided.
4. **Webhook endpoint**: `https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/billing-webhook`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`.
5. Promotion codes stay off (checkout never sets `allow_promotion_codes`).
6. Test the whole path in Stripe **test mode** first, with test keys, before live keys are set.

### 11.3 Policy updates (one statement each, after approval)

```sql
-- price IDs from step 11.2 (not secrets)
update lv.policy set value = '{"starter_hub": "price_...", "team_hub": "price_...",
  "campaign_starter": {"first": "price_...", "extra_week": "price_..."},
  "campaign_plus": {"first": "price_...", "extra_week": "price_..."},
  "hub_reservation": "price_..."}'::jsonb where key = 'billing.stripe_prices';
-- open checkout (lv_billing_config then reports the products on sale)
update lv.policy set value = 'true'::jsonb where key = 'billing.provider_ready';
-- when paid billing goes live: Founding entitlements end 30 days later (L-01)
update lv.policy set value = to_jsonb(now()::text) where key = 'billing.launched_at';
```

Leave `billing.payment_links` NULL (legacy). To close checkout again, set `billing.provider_ready` to false: buttons
disable, nothing already granted changes.

### 11.4 Email schedule

With `pg_cron` and `pg_net` enabled, schedule the dispatcher (every 5 minutes; the bearer is read from Vault, never
written into the job text):

```sql
select cron.schedule('lv-email-dispatch', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/email-dispatch',
    headers := jsonb_build_object('authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')))
$$);
```

The Vault secret `email_dispatch_secret` holds the same value as the `EMAIL_DISPATCH_SECRET` function secret.
Without `RESEND_API_KEY` the job only queues reservation reminders. Check the Admin console (Email tab) for queue
depth and failures; addresses are never shown there.

### 11.5 Verification after enabling

- `/pricing` signed in shows enabled buy buttons; signed out shows "Sign in to buy".
- A test-mode purchase of each product returns to LunchVoice with "Payment received", and the Admin console Billing tab
  shows an `applied` `checkout.session.completed`.
- Cancelling in the Customer Portal shows "cancelled and ends on …" on the Hub billing page; access continues to the
  period end.
- A Hub created from a test purchase sends E03 (with Resend configured).
<!-- ---- end track B: commerce ---- -->

<!-- ---- track D: api + discord ---- -->
## 12. Enabling the API and Discord bot (000024; docs/v2/API_AND_DISCORD_PLAN.md)

Applies only after 000024 is applied with the founder's approval (section 1). Nothing here is needed for launch: until
the functions are deployed and the secrets set, the API answers 503 and the Discord endpoint fails closed.

### 12.1 Functions

Deploy `api`, `discord` and `webhook-dispatch` (all `verify_jwt = false` in `supabase/config.toml`, each with a reason).
They reach the database with `SUPABASE_DB_URL` and `SET LOCAL ROLE service_role`; only the service role may execute
`lv.api_key_call`, `lv.discord_interaction`, `lv.webhook_*` and `lv.discord_claim/mark`.

### 12.2 Secrets (names only; set with `supabase secrets set`, never in chat, code or this file)

| Secret | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_DB_URL` | api, discord, webhook-dispatch | Already present on hosted projects. |
| `DISCORD_APPLICATION_ID` | registration script | From the Developer Portal, General Information. |
| `DISCORD_PUBLIC_KEY` | discord | Ed25519 key that verifies Discord's requests. Unset = the endpoint answers 503. |
| `DISCORD_BOT_TOKEN` | discord, registration script | Bot tab. Needed for role rules, role removal and auto-post. |
| `LUNCHVOICE_APP_URL` | discord | Optional; defaults to `https://lunchvoice.com` (links in bot messages). |
| `EMAIL_DISPATCH_SECRET` | webhook-dispatch, discord `/dispatch` | Optional extra bearer (the service-role key also works). |

### 12.3 Discord Developer Portal

1. Create an application named LunchVoice and add a Bot (Bot tab). Leave "Public Bot" on only when the founder wants
   any server to be able to add it. No privileged intents are needed.
2. General Information: copy the Application ID and Public Key into the secrets above. Bot tab: reset and copy the token
   into `DISCORD_BOT_TOKEN`.
3. Interactions Endpoint URL: `https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/discord`. Discord sends a signed
   PING when you save; the function must answer it, so deploy the function and set `DISCORD_PUBLIC_KEY` first.
4. Register the slash command (once, and again whenever `COMMAND_DEFINITIONS` changes):
   `DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… node --import tsx scripts/discord-register-commands.mjs`
   (add `DISCORD_GUILD_ID=…` to try it in one test server first; `--dry-run` prints the payload without network).
5. OAuth2 URL Generator: scopes `bot` and `applications.commands`; bot permissions Send Messages and Embed Links, plus
   Manage Roles only if servers will use role rules (the bot's role must sit above the roles it assigns).

### 12.4 Schedules (pg_cron + pg_net, bearer from Vault as in 11.4)

```sql
select cron.schedule('lv-webhook-dispatch', '* * * * *', $$
  select net.http_post(
    url := 'https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object('authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')))
$$);
select cron.schedule('lv-discord-dispatch', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/discord/dispatch',
    headers := jsonb_build_object('authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')))
$$);
```

The webhook job also sweeps time-closed Campaigns, trims delivery logs older than 12 months (F-04) and expired Discord
codes. The Discord job removes roles after unlink or account deletion and sends auto-posts.

### 12.5 Verification

- `curl -s https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/api/v1/hub` without a key answers 401
  `lv_unauthenticated`; with a key from a Team Hub it answers the Hub; with a Starter Hub key it answers 402.
- A key's results for an anonymous Campaign match the app's results page, with withheld cells withheld and no texts.
- In a test server: `/lunchvoice link`, confirm at `/connect/discord`, `/lunchvoice verify`; `/lunchvoice post` of an
  anonymous Campaign shows only the "Answer in LunchVoice" button.
- Staff can turn a server off with `lv_api.lv_admin_discord_guild_disable(guild_id, true, reason)` (Admin UI pending).
<!-- ---- end track D: api + discord ---- -->
