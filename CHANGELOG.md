# Changelog

This file is the durable project memory. Every meaningful code, configuration,
release, and operational change belongs here. Entries follow Keep a Changelog
categories and the repository's decimal `X.X.X` release policy.

## [Unreleased]

### Docs (M1, M2: audience pages, the `join` marketing site and plans per audience; Marketing planning; 2026-11-14)

- Status: planned. Nothing built. A first code draft was started and removed on the founder's instruction ("dont build it, just put it in for today in our roadmap").
- What changed: the roadmap now has a Marketing area. M1 specifies `join.lunchvoice.com` as a chooser plus one page per audience (food service, social, corporate, education, and proposed associations and events), each with one Start free button, with the main landing's Use cases link pointing to it. M2 lists the founder decisions on plans per audience (no new price or plan name is approved).
- Where: `docs/v2/launch-roadmap/02_FEATURE_SPECS.md` (M1, M2), `TRACKER.md` (rows M1, M2), `00_ROADMAP_4_WEEKS.md` (spec index, schedule rows, founder action Wed 11-25), `docs/v2/launch-roadmap/drafts/audience-pages.draft.json` (draft copy, not live).
- Checks: Not run (documents only).
- Production: not touched.
- Not done and blockers: no pages, no `join` host, no DNS; the Cloudflare token for DNS edits is still rejected (see `docs/ops/SERVICES_AND_DEPENDENCIES.md`); the audience list and plan decisions need the founder.
- Next: founder approves or edits the audience list and M2 decisions by Wed 11-25; Edge and UI-functional build in week 3.

### Added (A8 sign-in methods on one account; A9 verified; Edge-less UI-functional; 2026-11-14)

- Status: coded and tested (type check, build, brain check, 17 `lvAuth` tests); **not yet verified in the browser**. A9 is now verified: the founder linked the empty `evlut.xo` account to Kpn on production (one account "Miah", handle `kpnworld`, KpnIdentity and own issuer both attached).
- What changed: Account settings has **Sign-in methods** (list, add Google or Discord with Supabase `linkIdentity`, add a password, remove one; the last cannot be removed). Supabase manual linking is on (`security_manual_linking_enabled` = true, applied through the Management API). The header menu shows the account's own display name, no longer the name Discord or Google sent. The Discord card and the profile note no longer say Discord "is never how you sign in". The link intent is single use, lasts 10 minutes and counts only for the session that started it (security review finding 2).
- Where: `src/lib/lvAuth.ts` (`listMethods`, `startLink`, `removeMethod`, `addPassword`), `src/identity/IdentityProvider.tsx`, `src/pages/SignInMethods.tsx`, `src/pages/Account.tsx`, `src/pages/Public.tsx`, `src/pages/Integrations.tsx`, `src/lib/lvAuth.test.ts`.
- Checks: `npx tsc --noEmit` clean; `npm run build` ok; `npm run check:brain` ok; `lvAuth` tests 17 of 17 pass. Browser run: Not run.
- Production: Auth setting changed (manual linking on). No migration. Frontend not yet deployed.
- Not done and blockers: removal and linking do not yet ask for a fresh sign-in within 10 minutes (spec A8 security line); security review finding 1 (server-side same-verified-email check inside `lv.link_identities`, plus a visible notice to both accounts) needs migration 000059 and the owner's approval to apply; a sign-in with Discord that shares a verified email already merged into the founder's Auth user (one Auth user, two identities); Discord with a different email has not been tested.
- Next: founder tries Add Discord / Add Google on `/settings` after the deploy; backend owner writes 000059.

### Added (A9 link an existing account found by email: database, server and screens; migration 000058 applied; `session` v18 deployed; Backend, Edge and UI-functional; 2026-11-14)

- Status: deployed; **not yet verified end to end with the founder's real accounts**.
- Founder ask: when someone signs in with a new method and an account with their email exists, **find it, ask, and link after they confirm it is theirs**, so it is not a second user.
- Database, **migration `000058_v2_identity_link`** (SHA-256 `a02ab097…`, applied to Lunchvoice through the Management API, history row `000058`): `lv.link_identities(new_issuer, new_subject, old_issuer, old_subject)` moves the new identity onto the old account and removes the empty account the new sign-in had created.
  **Service role only** (read back in production: `authenticated` and `anon` cannot run it). The new account must be **empty**, checked against every foreign key that points at `lv.accounts` (so a future table cannot be forgotten); the old account keeps everything; if the old account had no username it takes the new one; locks in a fixed order; audited as `account.identity_linked`; linking twice is a no-op. Rollback `supabase/rollbacks/000058_v2_identity_link.down.sql`.
- Server, **`session` Edge Function v18**: a `kind: "link"` path verifies BOTH proofs, the **new LunchVoice session** (a token this function signed, verified with its own key) and a **fresh sign-in to the old account** (a KpnIdentity ID token with its nonce, or an access token from our own Auth), refuses the same identity twice, and only then calls the database function. Checked live: missing, forged and malformed bodies are refused (400 or 401); the normal sign-in path is unchanged.
- Screens: `/signin/username` first asks "Is this your account?" when `lv_link_candidates` finds one (display name and username only). **Yes** sends the person through the existing KpnSolute sign-in (its own password page) as the proof, links, and returns with a new session for the old account; **No** creates a new account. Uses the pending-link record in `sessionStorage`; the username cache is cleared after a link.
- Checks: database suite from empty **1844 of 1844** (16 new in `58_identity_link.sql`), rollback rehearsal passes; function tests 100 of 100 (2 new); unit tests 171 of 171 (2 new for the link callback); `tsc` clean; `npm run test:pr` exit 0.
- Not done and blockers: a real run with the founder's accounts (sign in at `/signin?own=1`, accept the prompt, confirm at the KpnSolute page); proof through an old **own-Auth** account (the `oldAccessToken` path exists in the function but has no screen); A8 (link and remove sign-in methods in settings); the prompt only appears for accounts created in this flow (`source: own`).
- Next: the founder signs in at `/signin?own=1` with Google or Discord; if their old email matches, the prompt appears.

### Security (privacy: held usernames are swept; migration 000057 applied to production; founder question "why are you keeping deleted accounts"; Backend; 2026-11-14)

- Status: deployed and verified (database suite and production read-back).
- Answer: deleting an account keeps **no account data**. For `handle.hold_days` (14) only the **username text and an expiry** stay, with `account_id` null, so nobody can take the name to impersonate the person. The gap found while answering: nothing deleted those rows after the hold.
- Fix: **`000057_v2_handle_history_sweep`** adds `lv.handle_history_sweep()` (deletes rows whose hold ended more than a day ago) and runs it after every insert into the history; a daily cron job **`lv-handle-history-sweep`** (03:23) was scheduled in production like the other jobs (cron entries are not in migrations).
  Applied through the Management API as one transaction (history row `000057`, SHA-256 `2ec0e185…`). Read back: both functions, the trigger, the cron schedule `23 3 * * *`, latest version `000057`, history rows 0.
- Checks: database suite from empty **1828 of 1828** (8 new in `57_handle_history_sweep.sql`: expired rows swept, live holds kept, a deleted account leaves a held name with no link to a person and the account row is gone, the name is free after the hold); rollback rehearsal passes.
- Not done: the account-deletion screen's copy does not yet say that the username is held for 14 days; add it to the delete-account text and the privacy policy (S-73).

### Security (automated review of the 000055 commit: link-candidate trust and the username hold bypass; migration 000056 applied to production; Backend; 2026-11-14)

- Status: deployed and verified (database suite and production read-back).
- Finding 1 (MEDIUM, valid): the link-candidate lookup trusted the matched account's email without checking that it was verified, and a verified flag could outlive a changed email. Fix in **`000056_v2_usernames_hardening`**: `lv_link_candidates` now needs a verified email on **both** accounts;
  a trigger clears `email_verified_at` whenever an identity's email changes, so "verified" always refers to the email stored now (the next verified sign-in sets it again). The lookup only ever returned a hint (display name and username), and linking still needs proof of both sign-ins (A9).
- Finding 2 (MEDIUM, valid): `lv.handle_history.account_id` cascade-deleted its rows with the account, and a deleted account's own username was never held, so deleting an account freed its name at once for impersonation. Fix: history rows are kept (`account_id` becomes null on delete), a no-owner
  row holds the name for **everyone**, and a trigger on `lv.accounts` holds the deleted account's username for `handle.hold_days` (14).
- Applied to production (Management API, one transaction, history row `000056`, SHA-256 `5afefcd8…`); read back: both triggers present, `handle_history.account_id` nullable with `ON DELETE SET NULL`, latest version `000056`. Rollback `supabase/rollbacks/000056_v2_usernames_hardening.down.sql`.
- Checks: database suite from empty **1820 of 1820** (10 new checks in `56_usernames_hardening.sql`), rollback rehearsal passes.
- Not done: the same review's wider suggestion to clear `email_verified_at` inside `ensure_account` itself was not taken (that function is replaced in several migrations, including ones only on production); the trigger covers the same case at the table.

### Added (E11 usernames: migration 000055 applied to production; the username step for every account; link-by-email lookup; A8 and A9 specified; Backend and UI-functional; 2026-11-14)

- Status: **deployed** (migration applied and verified in production; front end pushed, Render deploys it); the end-to-end username step on the live site is not yet verified by a real sign-in; links (A9) and sign-in methods (A8) are specified, not built.
- Founder asks (2026-11-14): new people who sign up with Google or Discord must pick a **username** instead of inheriting the provider's name; sign-in methods are ways to log in to one account; an existing account is **found by email**, asked about, and linked after confirming its password.
- **Migration `000055_v2_usernames`** (SHA-256 `cafbfc58…` for the first version applied; applied to Lunchvoice `qprfonxvthmaoxfixigk` through the Management API as one transaction, history row `000055`): `lv.accounts.handle` (unique, lowercase, `^[a-z][a-z0-9_]{2,19}$`, no `__`, never an `@`),
  30 reserved platform words, `lv.handle_history` (an old name is held 14 days), a once-in-30-days change interval (the first claim is free), a 30 checks a minute limit, RPCs `lv_handle_get`, `lv_handle_check` (available or not, plus suggestions) and `lv_handle_set` (race-safe),
  **`lv.account_identities` indexed on `lower(email)`** and `lv_link_candidates` (a hint with the display name and username of an existing account that shares the person's verified email; never an email or an id). Rollback: `supabase/rollbacks/000055_v2_usernames.down.sql`.
  Verified in production after applying: column present, 4 RPCs, 30 reserved words, both indexes, latest history version `000055`.
- Front end: `/signin/username` (new `Welcome` page: unique username with a live check and suggestions, optional display name; **empty display name means the username is shown, never the Google or Discord name**) and a gate in `RequireSignIn` that sends any signed-in account without a username there once
  (existing accounts are prompted too; a failed lookup lets the person through). `lvApi` gains `handleGet`, `handleCheck`, `handleSet`, `linkCandidates`; the dev mock gives simulated people a username so existing e2e runs are unchanged.
- Specs added (`02_FEATURE_SPECS.md`): **A8** sign-in methods on one account (link Google, Discord, email; remove but never the last) and **A9** link an existing account found by email, confirmed by signing in to it (both proofs, new account must be empty, audited). Week-4 scope now includes every auth screen (`05_` section 11a).
- Checks: database suite from empty **1810 of 1810**, rollback rehearsal passes (45 new checks in `55_usernames.sql`); `tsc` clean; `npm run test:pr` exit 0.
- Not done and blockers: A8 and A9 builds; the Turnstile bot check; a real sign-up through the beta page; the founder's old accounts are not linked yet; username shown in member lists, mentions and profile pages (E11 later parts).
- Next: Edge enables manual linking and builds A8; Backend and Edge build `lv_identity_link` for A9; Turnstile.

### Operations (production, 2026-11-14: email sending for sign-up and password reset; founder "yes, do it"; A7; Edge)

- Status: deployed and verified (delivery); email sign-in in the browser not yet tested end to end.
- What was done (founder approved creating the key through Composio): a Resend **sending-only API key** named "LunchVoice Supabase Auth", restricted to the verified `lunchvoice.com` domain, was created through Composio and set as the SMTP password in the
  Lunchvoice Supabase Auth settings (host `smtp.resend.com`, port 465, user `resend`, sender `LunchVoice <no-reply@lunchvoice.com>`). The key value went from the tool result straight into the settings call; it is **not written to any file or to this changelog**, but it did pass through the
  agent session, so rotate it if you want (Resend, API Keys). Auth email rate limit raised from 2 to 30 an hour.
- Verified: a test sign-up for `admin+authtest@lunchvoice.com` sent the confirmation; Resend lists "Confirm your email address" from `LunchVoice <no-reply@lunchvoice.com>` as **delivered**. The test auth user was deleted afterwards (auth users: 0).
- Render: `VITE_LV_AUTH_EMAIL=1` and a redeploy; verified `/signin?own=1` now shows the email form (still beta only; everyone else sees the old card).
- Not done: the Supabase email templates are the defaults (plain "Confirm your email address"); the bot check (Turnstile) is off, so enable it before `VITE_LV_AUTH=1` for everyone; a real Google, Discord and email sign-in by the founder; linking the founder's old accounts; publishing the Google consent screen
  after the support-email swap.
- Next: the founder tests at `/signin?own=1`; Edge then links the accounts and brands the email templates.

### Operations (production, 2026-11-14: own sign-in in beta on the live site; Discord provider verified; A7; Edge)

- Status: deployed and verified up to the provider redirects; a full sign-in is not yet tested; email sending not configured.
- Discord: enabled in the Lunchvoice Supabase project; read-only check: `external_discord_enabled` true, client id and secret set (values not read), and `GET /auth/v1/authorize?provider=discord` answers 302 to `discord.com/api/oauth2/authorize`. Google was verified earlier the same way.
- Render (service `srv-d92o4cmrnols73fkioa0`, through Composio): set `VITE_LV_AUTH=beta` and `VITE_LV_AUTH_EMAIL=0` (build-time public flags, not secrets) and redeployed.
- Verified on the live site with headless Chrome: `https://lunchvoice.com/signin?own=1` shows the new screen (Welcome back, Continue with Google, Continue with Discord, legal links, "Use your existing KpnSolute sign-in", join code; email forms hidden);
  a fresh browser on `/signin` still sees the old one-button card, so **no other visitor is affected**. Capture: `docs/frontend/design-research/captures/signin-own-beta.png` (local, ignored).
- Not done: an actual Google and Discord sign-in (the founder tests it; for Google the founder's address must be a test user in Google Auth Platform, Audience); Resend SMTP (needs a sending key; the founder has Resend in Composio and was asked
  to confirm creating it); publishing the Google consent screen (blocked on the support-email swap); linking the founder's old accounts; `VITE_LV_AUTH=1` for everyone.
- Next: the founder signs in at `/signin?own=1` with Google then Discord; Edge fixes what breaks, then sets up Resend and links the accounts.

### Added (A7 beta switch and email toggle; Backend and UI-functional; 2026-11-14)

- Status: tested (unit 15 of 15 for the module, type check, build); not deployed until pushed.
- What changed: `VITE_LV_AUTH=beta` turns LunchVoice's own sign-in on **only for a browser that opened `/signin?own=1`** (remembered in `localStorage` as `lv.own`), so the founder can test Google and Discord on the live site while everyone else keeps
  the existing KpnIdentity sign-in. `VITE_LV_AUTH_EMAIL=0` hides email sign-up, sign-in and password reset (no mail provider yet), leaving Google, Discord and the legacy link. `VITE_LV_AUTH=1` still turns everything on for everyone.
- Why: Google is still in Testing mode (only listed test users can sign in; publishing waits for the support-email swap) and Resend is not configured, so a public switch would show failing options.
- Not done: Render variables (set next), Resend SMTP, publishing the consent screen, linking the founder's accounts.

### Operations (2026-11-14: Google sign-in enabled and verified; Discord redirect added; A7; Edge)

- Status: Google verified at the endpoint level; Discord half done.
- Google: the founder pasted the Client ID and secret and switched on "Enable Sign in with Google" in the Lunchvoice Supabase project. Verified read-only: `external_google_enabled` true, client id and secret set (values not read), and
  `GET /auth/v1/authorize?provider=google` now answers 302 to `accounts.google.com` requesting scopes `email` and `profile` only. Not verified: a full sign-in (the consent screen is in Testing mode, so test users must be added in Google
  Auth Platform, Audience; publishing waits for the support-email swap).
- Discord (LunchVoice bot application, id in the founder's Developer Portal): the redirect URI `https://qprfonxvthmaoxfixigk.supabase.co/auth/v1/callback` was added under OAuth2, Redirects and saved (the page showed it persisted).
  The Client Secret was not viewed or copied by the agent. Still to do by the founder: copy the application's Client ID and Client Secret (Reset Secret if needed) into Supabase, Sign In / Providers, Discord, enable and save.
- Not done: Discord provider enabled, Resend SMTP, the bot check, `VITE_LV_AUTH` on Render, linking the founder's accounts, Google Branding and publishing.

### Operations (Google Cloud, 2026-11-14: OAuth client for LunchVoice sign-in created; founder request; A7; Edge)

- Status: partly done (client created in Google; not yet entered in Supabase; app still in Testing).
- What was done in the founder's Google Cloud project **LunchVoice** (id `lunchvoice`, through the founder's signed-in Chrome, on the founder's request): Google Auth Platform configured (app name LunchVoice, audience External, contact
  email `admin@lunchvoice.com`); **Web application client "LunchVoice sign-in"** created with the single authorised redirect URI `https://qprfonxvthmaoxfixigk.supabase.co/auth/v1/callback`. The client secret is shown once by Google and was
  **not copied or stored by the agent**; the founder pastes the Client ID and secret into the Supabase Google provider.
- Support email: Google only offers the signed-in Google account's own address (or a Google Group the account manages), so the personal Gmail address is set as the support email **for now (founder: "swap before publishing")**.
  It is visible on the consent screen once the app is published. **Do not publish the consent screen before the support email is swapped** to an address on lunchvoice.com (needs a Google account or Group for `admin@lunchvoice.com`).
- Found: the Chrome profile's Supabase login belongs to a different organisation ("Main KpnWorld Suit") and cannot open the Lunchvoice project ("You do not have access to this project"), so the provider page must be opened with the account that owns it.
- Not done: Branding (privacy and terms links, authorised domain `lunchvoice.com`), publishing to production (blocked on the support-email swap), Discord, Resend SMTP, the Render flag.
- Next: founder pastes the Google Client ID and secret into Supabase (Authentication, Sign In / Providers, Google); then Edge continues with Branding.

### Operations (production, 2026-11-14: own sign-in switched on server side; founder "turn on lv auth now"; A7; Backend and Edge)

- Status: deployed (server side) and partly verified. **The sign-in screens are still off (`VITE_LV_AUTH` not set on Render) because Google, Discord and email sending are not configured yet.** Existing sign-in through KpnIdentity is unchanged and still works.
- Applied to the Lunchvoice project (`qprfonxvthmaoxfixigk`), each verified by reading it back:
  1. **Auth settings** (Management API; the project's Auth had 0 users): site URL `https://lunchvoice.com`; redirect allow-list `https://lunchvoice.com/**`, `https://create.lunchvoice.com/**`, `https://pay.lunchvoice.com/**`;
     minimum password length 12; leaked-password protection on; session time-box 720 hours (30 days; the API unit is hours); email confirmation stays required.
  2. **`session` Edge Function deployed (version 16)** from this repository with `supabase functions deploy session --use-api --no-verify-jwt`. Checked: the KpnIdentity path answers as before (400 on an empty body); the own path
     answered 503 before the secret and **401 `lv_invalid_token` for a bogus token after it**, so it is live and fails closed.
  3. **Function secret `LV_OWN_AUTH=1`** set (name only here).
  4. **`identity.trusted_issuers` policy** now lists both issuers (KpnIdentity and `https://qprfonxvthmaoxfixigk.supabase.co/auth/v1`); audit row `policy.trusted_issuer_added` (reason `a7-2026-11-14`).
- Code in this commit: the own sign-in screen gains **"Use your existing KpnSolute sign-in"** so accounts created before the move stay reachable until they are linked.
- Checks: type check clean; function and unit tests as in the A7 entry; the provider authorize endpoints answer 400 for Google and Discord (not enabled yet).
- Not done and blockers: **Google and Discord client IDs and secrets and the Resend SMTP credential are not entered yet** (config reads `external_google_enabled` false, `external_discord_enabled` false, no SMTP host); until they are, turning the screens on would show
  buttons that fail and email sign-up that cannot send its confirmation. After they are: set `VITE_LV_AUTH=1` on Render and redeploy, smoke test, link the founder's accounts (`lv_identity_link` is not built; a founder-run script can attach the new identity to the old account), enable the bot check, remove nothing else.
- Next: the founder enters the credentials; then Edge flips the flag on Render and runs the smoke test.

### Security (automated review of the A7 commit: identity confusion in session renewal; Backend; 2026-11-14)

- Status: tested (unit tests, type check; not deployed, the feature is off by default).
- Finding (MEDIUM, valid): the auto-renewal added in 94d67bf ran for any session, so during the KpnIdentity transition a leftover Auth session in the browser could replace a different identity's session. Also, signing out used
  Supabase's default global scope, which would have signed the person out on every device.
- Fix: a session now records `source: "own"` and its `sub`; only own sessions renew; a renewal that returns a different `sub` ends the session instead of replacing it; the session returned by the exchange must carry a subject (refused
  otherwise); ending a session, signing out and finishing a KpnIdentity sign-in call `signOut({ scope: "local" })` so the Auth refresh token on this device cannot renew anything and other devices stay signed in.
- Checks: `src/lib/lvAuth.test.ts` 14 of 14 (new: a session without a subject is refused; the subject is returned); `tsc --noEmit` clean; full `npm run test:pr` re-run below.
- Not done: an e2e that mixes a KpnIdentity session with a lingering Auth session (needs a live Auth project, part of the spike).

### Added (A7 own sign-in: code behind a flag; A6 functional screens; Backend, Edge and UI-functional; 2026-11-14)

- Status: coded and tested locally. **Not deployed. No Auth provider is enabled. The two-day spike has not run. Production, KpnIdentity and Discord are untouched.**
- What changed: the code for LunchVoice's own sign-in (ADR accepted today), all off by default.
  - **`session` Edge Function** (`supabase/functions/_shared/session.ts`, `session/index.ts`): a second path, `{ kind: "supabase", accessToken }`, for access tokens from the Lunchvoice project's own Supabase Auth. It
    pre-checks issuer, audience, age (600 s) and shape, then asks the issuer (`GET /auth/v1/user`) to confirm the token, takes the verified-email state from the issuer (an unconfirmed email is never marked verified,
    X-19), keeps the single-use replay guard (key `sha256(iss|sub|session_id|iat)`), and issues the same LunchVoice session as before. Fails closed if the issuer cannot confirm. Enabled only when
    `LV_OWN_AUTH` is set; the KpnIdentity path is unchanged and `configFromEnv` now also accepts an own-auth-only setup.
  - **Browser module** `src/lib/lvAuth.ts` and `IdentityProvider` (`own` API): Google and Discord (PKCE, Discord scopes `identify email`), email sign-in and sign-up (12-character hint, neutral errors that never say whether an
    account exists), password reset and set-new-password, the exchange (forces a fresh token first), the `/auth/callback?own=1` finish, auto-renewal of the LunchVoice session two minutes before it ends using the Auth refresh token, and
    sign-out of both sessions. A returned name is never an email (audit HB1). Enabled only when the build sets `VITE_LV_AUTH=1`.
  - **Screens** `src/pages/OwnSignIn.tsx` used by `/signin` when enabled: Continue with Google and Discord, email and password with Show, forgot password, create account with an "I am 13 or older" check, check-inbox and reset
    states, legal links, join-code link. Functional, unstyled for the week-4 redesign.
- Checks: `npm run test:functions` 98 of 98 pass (8 new for the Supabase path); `src/lib/lvAuth.test.ts` 13 of 13; `npm run test:unit` 167 of 167; `tsc --noEmit` clean; `npm run build` passes; `check:design`, `check:routes` pass. **`npm run test:pr` passes (exit 0)**: brain, names, routes, design, brand, scripts 48 of 48, unit 167 of 167, workers 6 of 6, functions 98 of 98, build and bundle checks. Not run: the database suite (no migration changed) and e2e against a live Auth project.
- Not done and blockers: the spike (Google, Discord and email on a branch or scratch project; verified-email linking behaviour; a 30-day session across `lunchvoice.com` and `create.`); the `identity.trusted_issuers` policy still lists only KpnIdentity (adding the own issuer is a
  production data change after the spike); `lv_identity_link` and its pgTAP tests; the "keep me signed in on this device" choice (A1); the Auth project settings (providers, 12-character passwords, SMTP, captcha, session time-box); the founder's
  Google, Discord and Resend actions; the Discord account link (F1); E11 username step; the design pass.
- Next: Mon 11-16 the spike on a branch or scratch project; the founder enters provider secrets in the Supabase dashboard.

### Docs (ADR proposed: LunchVoice leaves KpnIdentity and runs its own sign-in; founder suggestion; A7; Governing; 2026-11-14)

- Status: planned (proposal only; nothing changed in production, KpnIdentity, Discord or the brain files).
- What changed: new `docs/v2/launch-roadmap/ADR_LUNCHVOICE_OWN_SIGN_IN.md` for the founder's idea to break away from KpnIdentity so Discord sign-in uses the LunchVoice bot application. Recommendation: break away
  at launch with LunchVoice's own Supabase Auth (Google, Discord, email), a two-day spike first (go or no-go Wed 2026-11-18), a dual-issuer transition for existing accounts and option A (stay, Discord through a "KpnSolute"
  application) as the fallback. Tracker row A7 added. **The Thursday 11-19 step "add the `create` and `pay` callbacks in KpnIdentity" is on hold** until the founder decides (the `pay` repoint and the Worker secret stay).
- Read-only findings (F): the Lunchvoice project's own Auth has Google and Discord off, email on, confirmation required, no custom SMTP, minimum password length 6, no captcha, no session limits; **KpnIdentity has
  `mailer_autoconfirm` on, so it accepts unverified email addresses** (a finding for the KpnSolute side, recorded here, not changed), Google on, one `compute.kpnsolute.com` callback allowed.
- Not done and blockers: needs the founder's confirmation of option B, of X-19 (verified-email linking) and of losing the shared KpnSolute account for LunchVoice users.
- Next: on confirmation, run the spike Mon 11-16 and amend A6, A1, F1, S-33 and the identity documents.

### Docs (Discord added as a sign-in provider at launch; founder "yes we can add discord too"; A6, X-18; Governing; 2026-11-14)

- Status: planned (approved and specified; KpnIdentity and Discord unchanged).
- What changed: **Discord is now a launch sign-in provider** next to Google and email (spec A6, default X-18 updated). Rules recorded: a separate Discord application named "KpnSolute" for sign-in (not the LunchVoice bot
  application); scopes `identify` and `email` only; a verified email is required; **no account merging by email** (KpnIdentity's automatic identity-linking must be checked and turned off or constrained, because Supabase links
  same-email identities by default); one-click "Link my Discord to LunchVoice" for people who signed in with Discord (F1).
- Founder actions added (Mon 11-30): create the "KpnSolute" Discord application and enter its client ID and secret in KpnIdentity's Discord provider yourself; approve the provider setting.
- Not done and blockers: nothing built; A: how KpnIdentity records a Discord-verified email and whether the token carries the Discord id are to be confirmed in testing.
- Next: Design adds the Discord button to the A6 frames in week 1; Edge configures and tests the provider in week 3.

### Docs (A6 sign-in and sign-up screens like real products; Governing; 2026-11-14)

- Status: planned (specified; nothing built, KpnAuth and production untouched).
- What changed: new spec **A6** (`docs/v2/launch-roadmap/02_FEATURE_SPECS.md`) for a sign-in and sign-up experience in the style of Kahoot, GoDaddy and Supabase (patterns only): provider buttons, email and
  password with show-password and forgot-password, "having trouble" help, sign-up with confirmation and age check, legal links, a trust line, a two-panel desktop layout and a mobile layout.
  **Finding (F):** the real credential screen at `auth.kpnsolute.com` is a generic "KpnSolute Auth" page with no LunchVoice branding, no show-password, no forgot-password and no legal links, reached after LunchVoice's
  own one-button `/signin` step (defects SI1 to SI4 in the UI audit). Decision: keep credentials in KpnAuth (LunchVoice never handles a password) and give KpnAuth a per-client theme; LunchVoice's `/signin`
  becomes the entry card with Google, email and the keep-me-signed-in checkbox (feeds A1). Default X-18: launch with Google and email; Discord is P1 with the founder's yes; Apple, Microsoft, Clever and SSO are not at launch.
- Where it is tracked: `TRACKER.md` row A6 (Design weeks 1 to 2, Edge week 3, `/signin` entry week 4); the UI upgrade ledger row `/signin`.
- Not done and blockers: nothing built. **Founder: tell us where KpnAuth's source and deploys live** (the host is a Cloudflare Worker custom domain; no repository for it is in the KpnSolute GitHub organisation) and approve X-18.
- Next: Design starts the frames in week 1; Edge starts the KpnAuth theme work in week 3 once the source location is known.

### Operations (founder approvals and backup facts; S-60, A1, A4; Governing; 2026-11-14)

- Status: planned (approvals recorded; nothing changed in production, DNS, Stripe or KpnIdentity).
- **Founder approved ("go ahead", 2026-11-14)** the Thursday 11-19 steps of week 1: repoint `pay.lunchvoice.com` from GoDaddy, generate the shared auth Worker secret, and add the `create` and `pay`
  callbacks in KpnIdentity. They are **queued for Thu 11-19, not done today**, because their prerequisites do not exist yet: the `pay` app and its return URLs (A2, B3), the `pay-next` staging host
  with a rehearsed rollback (A4), and the Worker that would use the secret (A1). Repointing `pay` today would take down the existing GoDaddy pay site with nothing behind it (the 2026-11-13 handoff
  forbids that). The KpnIdentity OAuth client "LunchVoice" currently allows exactly one redirect, `https://lunchvoice.com/auth/callback`; Thursday adds the two new callbacks (exact URLs) and
  re-tests sign-in on all three hosts.
- **Supabase facts read today (read-only, Management API with the gitignored token):** the Lunchvoice project is on the **Pro plan** with **daily physical backups** (8 completed, newest
  2026-11-14 10:50 UTC, WAL-G on) and **point-in-time recovery off**. Access: yes, through the `lunchvoice` and `kpnauth` MCP servers and Composio (alias Lunchvoice, KpnIdentity); the backups call
  needs the project token in `.mcp.env`.
- Recommendation for S-60 (founder decides): keep PITR off for launch (it is a recurring paid add-on; A: confirm current price in the dashboard), run the restore drill DR-01 in week 3 to prove
  the daily backup works, and revisit PITR when paying customers exist. Loss window with daily backups is up to about 24 hours.
- Next: Thu 11-19 execute A4 and A1 after the `pay-next` staging checks pass; Mon 11-16 founder answers the PITR question.

### Operations (production, 2026-11-14: HB1 display-name data fix applied; founder "yes"; S-23; Backend)

- Status: verified (data fix applied and checked; the permanent username feature E11 is still planned).
- What changed: the data fix `scripts/data-fixes/2026-11-12_p3_display_names.sql` was applied to production (Lunchvoice `qprfonxvthmaoxfixigk`) on the founder's explicit approval, as one
  atomic block through the `lunchvoice` MCP (the file's `psql` step 2 translated to a `DO` block with the same guard: it aborts unless exactly 2 rows change). Two accounts that had an email as their name
  now show `muttyman` and `mmdwell`; two cached identity names were cleared; the check `accounts_display_name_no_email` is now validated, so an "@" name can never be stored again.
  The old values (the emails) are not recoverable from the database.
- Where: `lv.accounts`, `lv.account_identities`, constraint `accounts_display_name_no_email`; audit row `account.display_name_fixed` (reason `p3-2026-11-12`, accounts 2).
- Checks: before: 2 accounts and 2 identity rows with "@", constraint not validated. After: 0 and 0, constraint validated, audit rows 1, the two new names as previewed. Live: `/kitchen/members` shows no
  email-shaped text and lists the member as `muttyman`.
- Not done: E11 (unique usernames plus display names) so the class of bug cannot return through another path; the grep-style e2e over name positions (S-23 test) is not written yet.
- Next: Backend builds E11 on Mon 11-16 week 1.

### Docs (E11 usernames and display names, the Discord way; Governing; 2026-11-14)

- **Revised same day (founder: "like in discord, every user is unique"):** every account has a **unique username** (`@kpn`) **and** a free, non-unique **display name** set at sign-up and changeable any
  time (3 a day); the display name is never initialised from an email and never contains "@"; hover cards and member lists show both. The username rules below stand.

- Status: planned (specified; nothing built, production untouched).
- What changed: new spec **E11 Usernames (@handles)** in `docs/v2/launch-roadmap/02_FEATURE_SPECS.md`, so people become `@kpn` or `@muttyman`. A forced "Choose your username" step right
  after first sign-in (existing accounts prompted once), 3 to 20 lowercase ASCII characters, unique case-insensitively, reserved platform words, change once every 30 days with a 14-day hold on
  the old name, `/@handle` profile pages, mentions and invites by handle, never shown on anonymous answers, never an email. The handle is a display and lookup name only; identity stays
  `(issuer, subject)` at KpnIdentity, and the step lives in LunchVoice, not in KpnAuth. Added to the pillar table, the spec index, the purpose map and `TRACKER.md` (row E11, P0, week 1).
- Not done and blockers: nothing built. Founder action: claim `@kpn` and `@muttyman` first at the prompt before the waitlist opens (no names are reserved in code).
- Next: Backend starts E11 Wednesday of week 1 (Mon 11-16 start), beside the HB1 data fix.

### Security (HB1 root cause: an email shown as a member's name; S-23, E1; Backend; 2026-11-14)

- Status: tested in preview only; blocked on the founder's approval to apply the data fix. Production not changed.
- What was found (read-only queries on production, Lunchvoice `qprfonxvthmaoxfixigk`): the **code is already fixed**. Migration `000040_v2_display_name_never_email` is applied and
  `lv.safe_display_name` exists; new accounts can never get an "@" name. But **2 old accounts and 2 cached identity rows still hold an email as the display name**, and the check
  constraint `accounts_display_name_no_email` is **not validated** (`convalidated = false`). The data fix `scripts/data-fixes/2026-11-12_p3_display_names.sql` was never run, which is why the
  Kitchen's Members list and Overview show an address. `lv_member_list` returns names only (its source says "never email").
- Preview of the fix (addresses masked): account `8caf07c7…` (`m***@y***.com`) becomes `muttyman`; account `abd556f3…` (`m***@g***.com`) becomes `mmdwell`. Nothing is deleted; membership, roles,
  responses and audit history are untouched; the two old values (which are the emails) are overwritten and cannot be restored from the database afterwards.
- Checks: read-only SELECTs only. Not run: the apply, the post-apply verification, the Members page re-check.
- Not done and blockers: **the founder's approval of this exact file** (the data fix is "not a migration" and needs the owner's explicit approval per its header and the production runbook).
  After approval: run the file's step 2 as one transaction with `expected = 2`, validate the constraint, verify no "@" names remain, re-load `/kitchen/members`, and mark S-23 `verified`.
- Next: apply on the founder's yes (Backend, minutes).

### Docs (live UI audit for the design team; QA agent; 2026-11-14)

- Status: verified (observed on the live site; nothing changed, submitted or deleted).
- What changed: **`docs/frontend/design-research/UI_AUDIT_2026-11-14.md`** records about 70 defects with IDs, severity (P0, P1, P2), where each was seen and a direction, from a
  signed-in desktop walk of the landing, pricing, templates, Discover, how-it-works, status, support, developers, waitlist, My home, Quick Surveys (list, new, editor, results),
  Trends, Settings, Create, Reserve, the respondent player and the Kitchen Hub console (overview, campaigns, members, roles, builder, billing, analytics, settings), plus headless
  Chrome at 390 and 768 px on eight public pages. `UPGRADE_LEDGER.md` now carries the defect IDs on 29 routes.
- **Three P0 findings:** (1) a member's email address is shown as their name on the Hub Members list and Overview (HB1; added as a rule in spec E1 and as S-23, week 1);
  (2) the respondent player's question screen is the plainest screen in the product (PL2); (3) Creator plan copy on `/pricing` still says "coming soon" for features that shipped (P1).
- Also found: inconsistent page widths and navigation (G1, G2), stat tiles stacking edge to edge (G4), grey inputs that look disabled (G6), header actions wrapping in the editor (E1),
  `/templates` is about 25,800 px tall at 390 px with about 80 small targets, and `/status` says "Status reporting isn't wired up yet". No horizontal overflow at 390 or 768 px on the
  eight public pages checked.
- Checks: browser walk (Claude in Chrome) and a headless Chrome script for the phone and tablet captures. Not run: dark and high-contrast themes, keyboard pass, signed-in phone and tablet,
  Lighthouse (the DevTools emulator failed to start), admin, elections, Present mode, console errors.
- Production: not touched. Not done: fixes (week 4, except HB1 in week 1).
- Next: Design agent completes the untested screens in week 1 and builds the shared patterns for week 4.

### Docs (work tracking protocol, tracker, UI upgrade ledger, 500-site design hunt, Pulse; Governing; 2026-11-14)

- Status: planned (specified; nothing built, nothing deployed, production untouched).
- What changed: **every agent must now log its work.** `AGENTS.md` and `CLAUDE.md` (kept identical) gain a **Work Tracking Protocol**: each change
  gets a changelog entry in a fixed format (status from `planned` to `UI-complete`, where, checks run, production state, not done, next) and an updated
  row in the new `docs/v2/launch-roadmap/TRACKER.md` (58 spec rows, 56 security rows, 14 drills, 8 UI rows, all `planned`), so the founder can follow progress and
  completeness. The startup steps and the Definition of Done now require both.
- **Founder approved the roadmap defaults** (X-01 to X-17, "go with urs"): `create` and `pay` through Cloudflare rules, Stripe-hosted checkout and an unchanged webhook,
  the election plan split, and the rest of `00_ROADMAP_4_WEEKS.md` section 10.
- **Hub Pulse added to the launch** as spec E10 (heartbeat, voice, mood check, community goals, weekly recap draft; every Hub plan, Team richer), in the
  social presence pillar, with C6 folded into it. It leaves the "not at launch" list.
- **What exists today gets upgraded:** `docs/frontend/design-research/UPGRADE_LEDGER.md` lists all 63 routes with defects and before/after captures; the founder's two
  screenshots (survey editor header wrapping, grey disabled-looking inputs, stat tiles stacked with no gaps) are recorded as defects; Tier B routes are now reviewed one by
  one, not left to inherit tokens (`05_`, sections 12 to 14).
- **500-site design hunt** planned in `docs/frontend/design-research/SAAS_SITE_HUNT_PLAN.md` (sample frame, capture method, 12-point rubric, Pattern Atlas, 40 chosen
  patterns, shadcn and MIT copy-in component sources, patterns only, never copy). The capture credits need the founder's approval after a 25-site pilot.
- Checks: `npm run check:brain` (brain files identical). Not run: `test:pr`, build (documentation only).
- Not done and blockers: the hunt has not started (week 1 Monday); the tracker has no evidence yet by design.
- Next: week 1 starts Mon 2026-11-16 with R1 (Backend) and the hunt list and pilot (Design).

### Docs (four-week launch roadmap and specs; founder direction 2026-11-14)

- **`docs/v2/launch-roadmap/` (new, six files):** `00_ROADMAP_4_WEEKS.md` (weeks 1 to 3 backend and services, hard freeze
  Fri 2026-12-04, week 4 UI refresh, launch Sat 2026-12-12 17:12 UTC; the 23-item half-built inventory; agent roster; day by
  day plan; founder actions with dates; defaults X-01 to X-17), `01_PURPOSE_AND_ACCESS_MAP.md` (why every feature and service
  exists, who gets it on which plan, entitlement keys, competitor benchmark), `02_FEATURE_SPECS.md` (spec for spec: release
  hygiene, 30-day sign-in, hostname-aware app, Turnstile, Creator purchases, billing proof, armed billing release, creator-
  controlled results, Decisions and "You said, we did", shared results snapshots, advanced analytics, elections, quiz, Live
  Session Lite, notifications, profiles, points, moderation, Discord, API, export, creator dashboard, the Kitchen),
  `03_PLATFORM_DOMAINS_AND_SERVICES.md` (`create`, `pay`, `auth`; Cloudflare rules instead of Render domains; `pay` cutover and
  rollback; email and DNS hygiene), `04_SECURITY_AND_OPERATIONS_HARDENING.md` (S-series and 14 try-out drills) and
  `05_WEEK4_UI_UX_REDESIGN.md` (direction, token proposals T-1 to T-7, landing storyboard, tiers, acceptance).
- **Decisions recorded as defaults, founder may override (`00_` section 10):** `create` and `pay` are served from the same build
  by Cloudflare rules (no Render domain), not a redirect; Stripe-hosted Checkout, webhook unchanged; billing never opens or
  charges unless explicitly armed; Discover stays at `/discover`; status and help stay as paths.
- **Found while writing:** `pay.lunchvoice.com` is still a proxied CNAME to GoDaddy (`paylinks.commerce.godaddy.com`);
  `create` and `auth` have no DNS; Creator plan copy still says "coming soon" for features that shipped (000044, 000047); the
  DMARC report address belongs to GoDaddy's aggregator; no job opens billing at the launch date (by design, now specified as B8).
- **Revised the same day (founder: "that's only one centre"):** the roadmap now stands on four equal pillars (analytics, survey
  design, social presence, connectivity) over one foundation, with an exit criterion per pillar at G3 and a lane-balance rule.
  Added specs Y1 to Y5 (survey design), N1 to N4 (connectivity) and E9 (activity and directory), and a placement table.
- Nothing was built, deployed or changed in production by this entry.

### Operations (production, 2026-11-14: Creator prices, launch date, MCP check)

- **Correction:** the founder re-connected Cloudflare in Composio; `cloudflare_api_key` now lists all three zones with DNS edit rights, so the invalid-token blocker for `pay` and `create` is cleared. Both Composio Supabase accounts (Lunchvoice, KpnIdentity) list the right projects.

- **Added Creator Plus and Creator Pro to `billing.stripe_prices`** (`lv.policy`, audit action `billing.prices_added`; 8 of 9
  products mapped). The plans stay `purchasable=false`: purchases still need a person-scoped checkout, an account-scoped
  entitlement grant in the webhook, renewal/cancel, and an entry in `lv_billing_config`. Planned for the build week.
- **Launch and billing date confirmed as 2026-12-12 17:12 UTC** (founder, admin portal). `BUILD_PLAN_2026-11-21.md` and
  `LAUNCH_PREP_PLAN_2026-11-13.md` now say the older 2026-11-21 and 2026-12-01 dates are superseded.
- **Direct MCP check (2026-11-14):** `lunchvoice` and `kpnauth` Supabase, Cloudflare Workers, Context7, Resend, Stripe and the
  hosted Supabase MCP answer. Render MCP is unauthorized. The Stripe, Resend and hosted Supabase MCPs are linked to other
  accounts (Papercliped Connect; mail.papercliped.co and support.kpnsolute.com; an inactive unrelated project), so
  LunchVoice's Stripe and Render work stays on Composio. `plugin:supabase:supabase` and `supabase-kpnidentity` need `/mcp` auth.

### Operations (production, 2026-11-13: Render rewrites and headers; founder go-ahead)

- **Applied the Render fix** through the Render API (Composio): two rewrites ahead of the catch-all (`/templates` and the
  placeholder `/templates/:slug`, rule ids `rdr-dbru9l8n74is738ap2s0` and `rdr-dbru9don74is738aoar0`) and a replacement
  header set of 8 rules. The placeholder form was tested alone on live pages first. **Before:** 29 rewrites, none for
  `/templates`, so the gallery and all 95 of its pages (the gallery, 12 categories, 82 templates) served the generic app
  shell with the title "LunchVoice"; 5 header rules, HSTS without `includeSubDomains`, no asset or `version.json` cache
  rules. **After:** 31 rewrites with `/*` still last; 8 headers: the 5 existing unchanged except HSTS
  (`max-age=31536000; includeSubDomains`), plus `X-Content-Type-Options: nosniff`, `/assets/*` `public, max-age=31536000,
  immutable` and `/version.json` `no-store`. **Verified live:** the gallery, category pages and template pages return their
  own titles; `/`, `/pricing`, `/products/hubs`, `/use-cases/*`, `/how-it-works` unchanged; `/c/ABC123`, `/surveys/new` and
  unknown paths still get the app shell; all six security headers match `render.yaml` byte for byte; `/version.json` answers
  `no-store`, the hashed bundle `immutable`. Rollback and the full settings: new `docs/ops/RENDER_SETTINGS.md`.
- **SEO titles:** five template names already end in "survey", so their titles and headings read "Parent survey survey
  template". The title and heading now drop the repeated word, in both `src/ui/Seo.tsx` (runtime) and
  `scripts/seo-prerender.mjs` (prerender), which a test keeps equal.
- Docs updated: services log (2a and the Render row), the launch plan (prep item 6 done), the roadmap, `render.yaml`'s banner
  and the brain files (edited together, pointer to `RENDER_SETTINGS.md`). Cloudflare Cache Rules and HSTS were never the
  fix and stay closed.

### Changed (Creator Trends allowance: Plus 5, Pro 10; migration 000054, NOT applied to production)
- Founder decision 2026-11-13: Creator Plus allows 5 Trends, Creator Pro 10. Production still holds Plus 3 / Pro 10 from 000044 (provisional). `000054_v2_creator_trends_allowance` changes only the Plus value and the notes; rollback in `supabase/rollbacks/`. Test 44, the dev mock and the API contract follow. `AGENTS.md` and `CLAUDE.md` record the allowance. Waiting for approval to apply to production (Trends are not purchasable yet, so no customer is affected).
- **Applied to production 2026-11-13** on the founder's "apply" (Lunchvoice `qprfonxvthmaoxfixigk`), as one transaction through Composio. Verified: `trends.max` is free 0, creator_plus 5, creator_pro 10, starter 3, team 5; migration history ends at 000054.

### Docs (deployment truth, connector retest, payment site and creator dashboard decisions; founder 2026-11-13)

- **Deployment truth found and logged.** LunchVoice is a Render **static site** built from `main` (`npm install; npm run build`,
  publish `dist`), not Docker (Docker is used only by the local and CI database tests; the `MJCC-*` services on Render use it).
  **Render has no Blueprint**, so `render.yaml` is not connected and every edit to it since the first setup never reached
  production. Production holds its own 29 rewrites and 5 header rules (an older copy of the file). Consequences: HSTS lacks
  `includeSubDomains`; `/assets/*` and `/version.json` are not cached as intended; **the template gallery is not indexable**
  (`/templates` and template pages without a trailing slash get the generic app shell; with a trailing slash the prerendered
  page is served, so only the rewrites are missing). A banner in `render.yaml` and a comment in `vite.config.ts` now say so.
  The fix is a prep item that waits for the founder's go-ahead because it changes Render settings: replace the header rules and
  add two placeholder rewrites (`/templates/:slug`, `/use-cases/:slug`). `render.yaml` is kept for now: the build's SEO check and
  three tests parse it. An earlier note blaming Cloudflare for the header drift is corrected: Cloudflare Cache Rules and HSTS are
  not the fix.
- **Composio connectors retested with a real call each** (new table in `SERVICES_AND_DEPENDENCIES.md` section 2): render,
  stripe, supabase (both aliases), github, gmail, googledocs, googledrive, google_search_console, resend, canva, context7,
  browserbase and jev work. **`cloudflare_api_key` fails**: it shows connected but Cloudflare rejects its token on every zone and
  DNS call (error 9109, three tries); it needs a new token. Connected in the dashboard does not prove the token works.
- **Stripe is further along than the plan assumed** (read-only, live mode): 7 products and 9 prices at the founder's amounts, a
  live webhook to `billing-webhook` (6 events), Customer Portal configured (cancel at period end, no proration), Stripe Tax active
  but its default product tax code is "general tangible goods" (set a software code). The database maps 6 of 9 prices in
  `billing.stripe_prices` (Creator Plus and Creator Pro are missing and `purchasable = false`), and `billing.launched_at` is
  2026-12-12T17:12Z, which differs from the 2026-12-01 in `BUILD_PLAN_2026-11-21.md` (question Q7). Plan updated.
- **Decisions D-06 to D-08:** one creator dashboard for every plan, like Kahoot, at `create.lunchvoice.com` (section 2b of the
  launch plan: plan card, usage meters and locked controls differ, the layout never does); `pay.lunchvoice.com` is the payment
  site (Stripe), replacing the old GoDaddy-era site, as a Cloudflare Worker; the deployment truth above. Q13 and Q14 answered.
  Roadmap section 9 and the brain files (edited together) record them.
- **Cleanup:** the repository has no stray or dead tracked files (scanned: sizes by area, unreferenced scripts, odd names);
  the only inert file is `render.yaml`. Removed 16 finished local worktrees (7 agent, 9 review), all clean and fully in `main`;
  left the 14 older worktrees from earlier sessions alone (two hold unsaved work).
- No code behaviour, migration, Render, Stripe or Cloudflare setting changed.

### Docs (hostname routing and the lowest-cost rule; founder 2026-11-13)

- **Cost rule recorded** (founder: LunchVoice is built at the lowest possible cost): no new Render custom domains. Render's
  docs (read today) include 2 custom domains on Hobby, 15 on Pro and 25 on Scale per workspace and charge $0.25 a month for
  each extra; the workspace is shared with other KpnSolute services. The LunchVoice site keeps exactly two,
  `lunchvoice.com` and `www`. Decision D-05 in `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md`; a sentence in `AGENTS.md` and
  `CLAUDE.md` (edited together); roadmap section 9.
- **Future routing logged** (`SERVICES_AND_DEPENDENCIES.md` new section 2a, all through Cloudflare, none on Render):
  `auth.lunchvoice.com` is a Worker for the 30-day sign-in cookie; `create.lunchvoice.com` is a Redirect Rule to
  `lunchvoice.com/create` (a Worker later if needed); `pay.lunchvoice.com` is proposed as a Worker for the Stripe webhook
  and return handling (not Stripe's paid custom-domain add-on); `hub.lunchvoice.com` stays the share-preview Worker.
  Roadmap `create.lunchvoice.com` note corrected (it said a Render custom domain was needed).
- **Hostnames read from outside** (public DNS and HTTP): the site and `www` are proxied by Cloudflare to Render; `hub` is
  the Worker; `pay` resolves through Cloudflare but answers 404 (purpose to confirm); `auth` and `create` do not exist;
  there is **no wildcard DNS** (a made-up subdomain does not resolve).
- **Corrections to the services log found while checking** (Composio read the Render account and domains): the live Render
  service is named **Lunchvoice** (`render.yaml` says `lunch-line-survey`) with a different dashboard build command, and
  has only the two custom domains; the Composio Cloudflare connection reads "active" but its token is rejected for zone and
  DNS calls (reconnect it); the workspace holding the service is shared with the `kpnsolute-*`, `KpnCompute` and `MJCC-*`
  services.
- **Header drift found:** production HSTS has no `includeSubDomains` and `/assets/*` and `/version.json` answer
  `public, max-age=0, s-maxage=300`, not the `immutable` and `no-store` in `render.yaml`. Free Cloudflare Cache Rules and the
  HSTS setting would fix both; prep items 6 and 7 and owner action 8 in the launch plan.
- Launch plan: founder actions 8 and 9, agent prep items 6 and 7, a Cloudflare routing row in build week, questions Q13
  (what `pay` was for) and Q14 (`create` or `creator`), and the sign-in design no longer assumes tenant subdomains exist.
- Spelling: the product is "LunchVoice"; no "LunchoVoice" exists in the repository or memory (searched today).
- No code, migration, DNS or setting changed.

### Docs (launch prep: services log, decisions, creator-controlled results, Cloudflare sign-in design; founder 2026-11-13)

- **`docs/ops/SERVICES_AND_DEPENDENCIES.md` (new):** every service that runs LunchVoice (GitHub, Render, both Supabase
  projects, Cloudflare, Resend, Stripe, Discord, Google, the registrar), where each is found in Composio or outside it, the
  7 deployed Edge Functions with versions, secret names and where they are set (no values), the Cloudflare usage log, the
  npm dependencies with their purpose, build and CI tooling, and the founder's open items. Each row says whether it was
  verified live on 2026-11-13 (Composio, Supabase and Cloudflare tools), read from the repo, or needs the owner to confirm.
- **`docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md` (new):** this week is plan and prep, next week (from 2026-11-16) is the launch
  build. Decisions D-01 to D-04: Cloudflare Workers is the edge platform and needs no per-use approval (each use logged);
  results visibility is the creator's choice; the plan for the week. Includes the creator-controlled results design
  (migration 000054: Live, Live including elections and Instant answers for Team Hub and Creator Pro, respondent notices,
  creator confirmation dialogs, safeguards that never turn off), the 30-day sign-in design on a Cloudflare Worker
  (`auth.lunchvoice.com`, host-only `__Host-` cookie, device sessions in 000049, verification list), the owner actions and
  agent prep for this week, a day-by-day build order for next week, and 12 open questions each with a recommended answer.
- **`SESSIONS.md` corrected:** a Worker on `lunchvoice.com/auth/*` does not run in front of Render while the apex is a
  proxied A record (the hub-card README found the same); the proxy question is answered with the Custom Domain design.
- **Roadmap:** `PRODUCT_DIRECTION_2026-11-11.md` section 9 logs the platform decisions.
- **Brain files** (`AGENTS.md` and `CLAUDE.md`, edited together): live results are approved for Creator Plus, Creator Pro,
  Team Hub and Campaign Plus; creator-controlled visibility (live elections for Team Hub and Creator Pro) is recorded as
  approved but not built; pointers to the new docs and the standing Cloudflare approval.
- **Found while checking:** production runs migrations `000029` to `000032` and `000036` to `000038` that `main` does not
  contain (open PRs #59 and #73); point-in-time recovery is off. Both are prep items in the plan.
- No code, migration or setting changed; nothing was deployed.

### Operations (production, 2026-11-13: 000053 live results by plan)

- **Applied 000053** (SHA-256 `a6c0a67d…`) to production through the Management API as the file's own transaction, after
  `test:pr`, 1765/1765 database checks and 53/53 related e2e. Review change before applying: elections never take the
  live path. Pre-check: `lv.analytics_core` present, `analytics_core_waiting` absent, no `batch_no` column, 0 elections,
  16 submissions. Verification: the waiting engine kept; `results.instant` on `creator_plus`, `creator_pro`, `team`;
  `lv_campaign_responses_anon` for `authenticated` only; `lv.submissions.batch_no` not readable by API roles; every
  existing anonymous submission backfilled with a batch; the analytics engine answers.

### Added (live results and individual responses by plan, 000053; not applied to production)

- **Security (review 2026-11-13):** elections never take the live path (`lv.results_instant` is false for
  `mode = 'election'`), so a secret ballot's tally is never shown vote by vote; production's election results code calls
  `lv.analytics_core`.
- Founder decision 2026-11-13: pro users see individual results from guests and signed-in people, and nothing is held
  back for 4 or fewer answers. New entitlement `results.instant` (`team` = Team Hub and Campaign Plus, `creator_plus`,
  `creator_pro`), resolved per survey on the server: the Hub's plan or the creator's own Creator plan. Free Quick Survey,
  Starter Hub and Campaign Starter keep the waiting rules exactly (anonymous waits for 5 answers and for the close).
- On a live plan, totals, charts, rating means, per-question seen/answered and free text show from the first answer for
  identified and anonymous surveys, live and closed. The old engine keeps its rules as `lv.analytics_core_waiting`; a thin
  `lv.analytics_core` wrapper takes the live path. `lv.api_analytics_question` is the 000042 body with three marked edits.
- Safeguards: anonymous individual responses (`lv_campaign_responses_anon`, offset pages) carry answers only, an opaque
  key, a stable hash order, no account, name, time, receipt or submission id; every read is audited and logged; free text is
  shuffled; filters on anonymous surveys stay refused; `campaign.results_instant` makes the player say "The creator can see
  results as they come in." on anonymous surveys (respondents never learn the plan of an identified one).
- Results page: Individual responses list (anonymous rows labelled "Response"), 15 s refresh while open, and on waiting
  plans a quiet "See results live with Creator Plus: opens with billing" note. Studio privacy copy follows the flag.
  Pricing, product, use-case and privacy copy state live results; the Team and Campaign Plus rows too.
- Tests: `supabase/tests/53_results_instant.sql` (every plan family, anonymous and identified, live and closed, below and
  above 5, responses, flag, filters, grants); `24` and `42` updated where a Team Hub or Creator Plus survey now reports live;
  `e2e/liveresults.test.mjs`; `src/lib/livePricing.test.ts`. Rollback `supabase/rollbacks/000053_v2_results_instant.down.sql`.
- Security: individual rows (and free text) of an OPEN anonymous survey are released in groups of 5 (`floor(n / 5) * 5`),
  the group fixed when the answer is written (`lv.submissions.batch_no`, private; anonymous rows keep no arrival time), shown
  in a hash order, with no exact live total (`released` and `next_batch_at` only); after close every row. A single arrival
  therefore never adds a single visible row. The respondent notice says "The creator can see results as they come in.
  Individual answers are shown in groups of 5 and never with your name."
- Security: metadata (summary cards, responses per day, device, source, duration, cross-tabs, quiz totals, webhook
  milestones) keeps the existing anonymous rules (finished, minimum cohort, frozen population) even on a live plan: live
  applies to answer results only (totals, charts, per-question cells, NPS, Trend points, export). `lv.results_gate` and
  `lv.released_participants` read the waiting engine. Totals and charts stay live from the first answer (founder decision).
- Merged with 000044 (Trends, analytics) and 000047 (question types); `supabase/tests/44` expectations for Creator Plus Trend
  points updated. Known trade-off: live totals and charts still change per arrival (founder decision).
### Operations (production, 2026-11-13: 000047 question types)

- **Applied 000047** (SHA-256 `a2ce6408…`) to production through the Management API as the file's own transaction, after
  `test:pr`, 1703/1703 database checks and 63/63 related e2e. Pre-checks: production's kind list was the base five and no
  production-only migration (000029–000032, 000036–000038) redefines the replaced functions. Verification: 21 kinds allowed;
  existing kinds still validated (an off-list choice is refused) and NPS refuses 11; `survey-uploads` private with a 10 MB
  limit and 2 storage policies; the quiz answer key RPC is not callable by `anon`; `templates` slug reserved.

### Added (question types, 82 templates and the template gallery; migration 000047)

- **16 new question types.** Free: face scale, dropdown, number, date. Plus (Starter Hub, Creator Plus): NPS with an automatic
  score, agree scale (5 or 7 points), ranking, image choice, slider, contact fields. Pro (Team Hub, Creator Pro): agree grid,
  quiz scoring, file upload, consent checkbox, typed signature, price ladder, before/after. Every type has an editor in both
  the simple and the Creator studio editor, an accessible phone-first answer control (44px targets, light and dark), server
  settings and per-answer validation, a mock transport and a results shape. Free accounts can preview Plus and Pro types with
  a lock badge that says what unlocks them. Contact, file, consent and signature are for identified surveys only.
- **Migration `000047_v2_question_types`** (additive; rollback `supabase/rollbacks/000047_v2_question_types.down.sql`, tests
  `supabase/tests/47_question_types.sql`). Extends 000042's `lv.check_answer_value`, `lv.kind_options`,
  `lv.kind_allows_jumps`, `lv.kind_is_scale` with `create or replace`, every existing kind verbatim (proven in the test);
  `lv.quick_question_guard` adds the plan gate and the identity rule; `lv.capacity_check` accepts the plan's own kinds.
  New: `lv_kind_tier`, `lv_campaign_quiz`, `lv_quiz_results`, private bucket `survey-uploads`, reserved slug `templates`.
  Not applied to production.
- **82 templates, 12 categories** (45 Free, 22 Plus, 15 Pro) stored as data in `src/config/templates.json`; the original 20
  stay Free. Anonymous by default; identified ones say so on the first line; health templates ask about experience only;
  dietary options are choices, never allergies (the RSVP's "Nut allergy" option became "Nut-free"); Pro group breakdowns follow
  the minimum of 5. Trivia night is valid data but flagged (timed rounds and a leaderboard are not built) and hidden from Use.
- **Public gallery**: `/templates` (search, category and plan filters), `/templates/<category>`, `/templates/<template>`
  (live preview with the real controls, plan badge, locked templates show the plan needed and link to plans), a
  "Recommended for" strip on every use-case page, and the Quick Survey picker reads the same data. All 95 pages are in the
  sitemap, `routes.json`, `render.yaml` and the SEO metadata (app and build checked equal by a test).
- **Security:** the quiz answer key lives in its own column (`lv.campaign_questions.quiz`), never in `config`, so no
  respondent, guest or public read can return it; managers fetch it with `lv_campaign_quiz`.
- **Security:** a file answer must be the submitter's own (`<survey>/<their account>/...`), from a signed-in account (never
  a guest), and the object must exist in the private bucket.
- **Security:** uploads follow the submit rules (`lv.can_participate`, open and identified survey, account and Hub not
  suspended or blocked), the bucket restricts MIME types and size, and one person may store at most 5 files per survey.
- **Security:** the quiz guard fires on any change of kind, settings or key, validates the key against the question as it is
  now, rejects a key on a non-choice kind and keeps the Pro entitlement check.
- Not done / follow-ups: image-choice pictures use https addresses, which the site's CSP (`img-src 'self' data: blob:`) will not
  load until a picture bucket or host is chosen (words always show); `nps`, `slider` and `ranking` are not yet usable in
  Linked Questions rules (only dropdown, image choice and face scale are); respondents do not see their quiz score yet.

### Operations (production, 2026-11-13: 000044 Trends and analytics)

- **Applied 000044** (SHA-256 `e49363a8…`) to production through the Management API as the file's own transaction, after
  `test:pr`, 1634/1634 database checks and 40/40 related e2e. Review change before applying: the device counter trigger on
  `lv.submissions` swallows its own errors, so a counter can never fail a submission. Pre-check: only `000016` defines
  `lv.api_analytics_export` (no production-only migration touched it). Verification: RLS on all four new tables, no
  API-role table access, `lv_trend_create` not callable by `anon`, the guarded device trigger enabled, `trends.max`
  rows live (free 0, Creator Plus 3, Creator Pro 10, Starter 3, Team 5; Creator counts provisional).

### Changed (branding is a full-width step in the Creator studio too)

- The redesigned Branding panel (live preview, Colors/Banner/Logo/Text/Style) did not fit the Creator studio's narrow
  Theme side tab, where its content stayed hidden. Branding is now its own full-width step above the questions on every
  plan; the studio's side panel and phone sheet are named "Question properties". `e2e/studiopro.test.mjs` and
  `e2e/branding.test.mjs` updated.

### Operations (production, 2026-11-13: 000048 branding gradients)

- **Applied 000048** (SHA-256 `21dc6786…`) to production through the Management API as the file's own transaction, after
  `test:pr`, 1535/1535 database checks and 32/32 related e2e (branding, studio, Linked Questions, update notice).
  Verification: `style`, `color2`, `gradient_angle`, `banner_style`, `cosmetics` columns present; the table has no
  API-role access; `anon` may call only `lv_campaign_theme`, which keeps the suspended-Hub and audience visibility rules.

### Added (branding v2: modern panel, color picker, gradients, cosmetics, 000048)

- The Branding panel is now one card with a live preview (right on desktop, on top on phones) and groups Colors, Banner,
  Logo, Text and Style. Colors are two rounded swatches with a pencil badge (Primary and Accent) that open our own
  accessible color picker (`src/ui/ColorPicker.tsx`, no dependency): saturation/value area and hue slider (keyboard operable),
  hex field, `EyeDropper` where the browser has one, curated presets (every one readable on white), and recent colors
  (this browser only). On phones the picker is a bottom sheet. It shows the contrast ratio and offers the nearest readable shade.
- **Gradients**: a theme is Solid or Gradient (two colors, vertical/diagonal/horizontal, six curated presets), painted on the
  welcome card and the thank-you screen; buttons and question screens stay solid, and the text color is picked against the
  worst end of the gradient. Both colors must reach 4.5:1 on white (client and server).
- **Cosmetics** (all optional): banner style (color/gradient, subtle pattern dots/grid/waves, or logo only), corner style
  (rounded/pill), progress bar tint, soft glow on the welcome card (the one-time shine is off under `prefers-reduced-motion`).
  The cover image, the Creator Pro/Team footer toggle and button styles deferred from #75 are included.
- Migration `000048_v2_branding_gradients.sql` (additive columns with checks, extended `lv_campaign_branding_set` and
  `lv_campaign_theme`; rollback `supabase/rollbacks/000048_v2_branding_gradients.down.sql`; tests
  `supabase/tests/48_branding_gradients.sql`). All 000043 rules are kept. Not applied to production.
- The logo is shown as the creator uploaded it, on the banner: no tile, border or padding box, transparency honored. An
  optional subtle drop-shadow (`cosmetics.logo_shadow`, default off) helps a dark logo on a dark color.
- Survey-level customization only: `src/ui/tokens.css` is unchanged. Screenshots: `docs/v2/screenshots/branding/`.

### Added (Creator studio revamp for Creator Plus and Starter Hub)
- Quick Survey editor shows a three-part studio when `survey.branching` is on: a left rail of question thumbnails (number, kind, linked-rule tag, section dividers, a `...` menu with Duplicate, Move up/down, Move to section and Delete with confirm, drag and Alt+Arrow reorder), a canvas with a grouped type picker (Choose / Rate / Write), Required switch, large prompt and colour-and-shape answer tiles, and a right panel with Question (logic) and Theme (branding) tabs. On a phone the rail is a strip and properties open in a sheet.
- Free creators keep the simple editor and see a small preview of the studio. Entitlement is still decided by the server; the UI only reads `features.branching`.
- Fixed a reorder bug where swapping two questions read stale values. New `src/lib/studio.ts` (5 tests), `StudioRail` registered in `/__gallery`, `e2e/studiopro.test.mjs` (3 tests).
- Not built (no approved path): image on a question, NPS, slider, ranking, word-cloud kinds, text length limit, AI start from a description.

### Worker report 2026-11-13 (names, Present mode, studio)
Pieces 1, 2, 4 done and checked (db 1535/0, e2e 171/171, brain, build, design, test:pr). Piece 3 not started: needs Loom verdict and founder approval. Not built: question image, NPS, slider, ranking, word cloud, length limit, AI start. Full report at the end of `docs/v2/handoffs/2026-11-13-names-results-privacy-creator-studio.md`.

### Added (Present mode: live results on a big screen)

- **Present** button on Results opens a full-screen, projector-sized view (`src/ui/PresentMode.tsx`): one question per slide,
  arrow/space/page keys and on-screen buttons to move, Escape to leave. Choice and yes/no questions show bars with count and
  percent, ratings a bar per score and the average, text questions a word cloud plus the answers (identified surveys only).
  A live answer counter, QR code, short link and join code stay in the corner so people can still join; identified surveys
  show a quiet "Just answered: Ana, Jordan" line, anonymous ones never show names.
- It reads the same released results as the Results page and polls every 4 seconds, paused while the tab is hidden. Anything
  the server withholds says "Waiting for more answers" or "Shown when the survey closes", never zero, and no percentage is
  guessed from a partly hidden total. Growing bars stop under reduced motion; colours use the ink/inverse tokens, so it flips
  with light, dark and high contrast. The responses list (audited) is only re-read when the count changes.
- Mock fix: the dev mock now matches the real API for identified surveys (totals and every option show from the first
  answer; only anonymous ones wait for the minimum) and reloads when another tab changes its saved state.
- Tests: `src/lib/present.test.ts` (bars, withheld never zero, ratings, word cloud, names), `e2e/present.test.mjs`
  (a second tab answers under a chosen name and appears within one poll; keys; anonymous shows the withheld message, no
  names, no bars). No migration, no entitlement change.

### Added (respondent names: a signed-in person can change the name on their answers, migration 000052)

- **Change the name on your answers.** On an identified survey the "Answering as {name}" chip has a **Change** button that
  opens a field prefilled with the account name. The choice is remembered on this device for that survey; blank or the
  account name means "use my account name". Anonymous surveys show "Your answers are anonymous" and no name control.
- **000052** adds `lv_api.lv_submit_response(p_campaign, p_answers, p_display_name)` as an overload; the two-argument call
  delegates with a null name (older clients and the Discord path unchanged). The name goes in `lv.submissions.guest_name`
  (documented; `is_guest` says whose it is), is trimmed and collapsed, 1 to 40 characters, control characters refused.
  **An anonymous Campaign ignores it entirely** and stores nothing. It is a label only: identity, one answer per account
  and authorization never read it.
- **Results** show the chosen name with an **Account** tag (was "Member"), or "Guest, unverified" for guests.
- Tests: `supabase/tests/52_respondent_display_name.sql` (clean and store, duplicate keeps the first, blank, two-argument
  call, control characters, 40/41 characters, anonymous crafted call stores nothing, signed-out refused), the studio e2e
  (Change, remembered after reload, creator sees "Account"), and `06_concurrency` now accepts the overload. Rollback:
  `supabase/rollbacks/000052_*.down.sql`. **Not applied to production.**

### Docs (handoff: respondent names, live results, results privacy by plan, Creator studio)

- Added `docs/v2/handoffs/2026-11-13-names-results-privacy-creator-studio.md`: a worker brief for letting signed-in
  respondents change their display name, a Kahoot-style Present mode for results, plan-based results privacy (results wait
  for 5 answers on free and Starter; Creator Plus sees responses live, anonymous included, per founder 2026-11-13) and
  a rail-canvas-panel Creator studio. The plan rule needs a Loom verdict and founder approval before any migration.
- Roadmap: added "Future (not scheduled)" to `docs/v2/PRODUCT_DIRECTION_2026-11-11.md` with `create.lunchvoice.com`,
  a dedicated Kahoot-style creator app (founder, 2026-11-13). Hub URLs stay path-based.

### Operations (production, 2026-11-13: 000052)
- Applied `000052_v2_respondent_display_name` to Lunchvoice `qprfonxvthmaoxfixigk` as its own transaction, on the founder's "make it live", before the frontend deploy. Pre-check: history ended at 000051. Verified: history ends at 000052; `lv_api.lv_submit_response(uuid, jsonb, text)` executable by `authenticated` only (not `anon`); internal `lv.submit_response` not exposed; the two-argument function still callable.

### Operations (production, 2026-11-13: 000045 and 000046)

- **Applied 000045** (SHA-256 `63e2ddf9…`) **and 000046** (`c38e570c…`) to production through the Management API, each as
  the file's own transaction, after `test:pr`, `check:brand`, 1516/1516 database checks and 49/49 related e2e. Pre-check:
  `lv.freeze_questions_after_draft` in production matched the repo's 000027 body. Verification: history now includes
  `000045` and `000046`; `lv_quick_survey_delete` is `authenticated` only; `lv_hub_public_poll` is callable by `anon`
  while `lv.api_hub_public_poll` is not; the trigger lets a Campaign delete cascade.

### Added (audit polish: 404, Hub head, public poll, delete survey, build before sign-in, Creator plans; migrations 000045, 000046)

- **F8, real 404.** An unknown address shows the "This page isn't here." page with the title "Page not found", `noindex` and
  no canonical. Render's static hosting answers every unknown path with the SPA shell through the catch-all rewrite
  (Hub slugs are dynamic, so it cannot tell a missing page from a Hub), so the HTTP status stays 200; the page is
  `noindex` in both the shell and at runtime. No `404.html` was added: Render only serves it when no rewrite matches.
- **F4, per-Hub head.** A Hub's pages set their own title ("<Hub> on LunchVoice"), description (member count and the
  about line) and matching Open Graph/Twitter tags (`useHubHead`, `src/ui/Seo.tsx`), the same text the
  `workers/hub-card` share page shows. Hubs stay `noindex`. The share **image** is still the LunchVoice card: per-Hub
  images are not generated.
- **F5, the Kitchen's poll for visitors (000046).** `lv_hub_public_poll(p_slug)`, callable signed out, returns a public,
  unsuspended Hub's most recent open Campaign that guests may answer (title, description, mode, anonymity, question
  count, closing time, link token); never results, counts or members-only Campaigns. A Hub's page shows it as an
  "Open now" card with "Answer this poll". Private, missing and suspended Hubs answer `poll: null`.
- **P8, delete a Quick Survey (000045).** `lv_quick_survey_delete(p_campaign)` deletes one of the caller's Quick Surveys and
  every answer to it, after one plain confirmation on the survey page. Refused while staff review it (blocked or an open
  report). Also repairs a cascade bug: 000027 had dropped 000015's deletion bypass in `lv.freeze_questions_after_draft`,
  so deleting a published Campaign (Hub, personal space or account deletion) raised `lv_locked`.
- **F6, build before signing in.** `/surveys/new` is open to visitors: they build a Quick Survey (title, up to 10
  questions, or a template) kept only in their browser (`src/lib/surveyDraft.ts`, `src/pages/SurveyDraft.tsx`). Publish
  sends them to sign in and back to `/surveys/new?draft=resume`, where the survey is created, published and opened; if
  publishing is refused it stays a draft in the editor. Nothing is sent to the server before sign-in.
- **Pricing and product pages.** Creator Plus ($5/month) and Creator Pro ($15/month) are shown on `/pricing` as "Opens
  with billing" per-person plans (cannot be bought until their Stripe products exist), with the difference spelled out:
  Creator is one person's own surveys, a Hub is a community with members. Creator Plus lists 15 active / 30 questions,
  Creator Pro 100 / 100 (live limits), Linked Questions and custom branding as available; Trends, results charts, new
  question types and templates appear only as "coming soon". The Team plan no longer says "Enhanced
  Campaign modes" or "Advanced targeting and analytics" (the billing audit found neither delivered): it now says "More
  custom Hub pages" and "Aim identified Campaigns at chosen roles"; the compare table's "Starter/Advanced analytics" cells
  say "Totals and charts" for every plan. The Feedback and Hubs product pages and the home pricing footnote mention the
  Creator plans.
- Tests: `src/lib/surveyDraft.test.ts`, `e2e/auditpolish.test.mjs` (desktop and 390px), the template-link e2e, pgTAP
  `supabase/tests/45_survey_delete.sql` and `46_hub_public_poll.sql`; `14_entitlements.sql` allow-list updated.
  Rollbacks: `supabase/rollbacks/000045_*.down.sql`, `000046_*.down.sql`. Migrations are **not applied** to production.

### Added (new-version notice)

- **"A new version of LunchVoice is ready." notice** with Refresh and dismiss (`src/components/UpdateNotice.tsx`, a Sonner
  toast). The build emits `/version.json` (git SHA + build time, `vite.config.ts`) and embeds the same id in the bundle;
  `render.yaml` serves `/version.json` with `Cache-Control: no-store`. The open app checks every 5 minutes while the tab is
  visible (backoff to 30 minutes on failures, no polling while hidden) and on focus / returning to the tab.
- It never reloads by itself and waits while someone is answering a survey (`useBusy("player", true)` in `Player.tsx`) or
  has a text field focused (`src/lib/busy.ts`), then appears. Survey drafts already persist to localStorage on every
  change, so a refresh keeps them. A lazy route chunk that vanished in a deploy now shows the same Refresh prompt
  (`ChunkErrorBoundary`, `vite:preloadError`) instead of a blank page.
- Tests: `src/lib/updateCheck.test.ts` and `e2e/update.test.mjs`.

### Design report (not implemented): 30-day device sessions

- `docs/backend/SESSIONS.md` records why the first-party HttpOnly refresh cookie was not built: it needs a first-party
  route to the Edge Function, and neither Render rewrites (cookie/POST pass-through undocumented) nor a Supabase custom
  domain (CNAME cloaking, Safari 7-day cap) can be relied on. Options and owner decisions are listed there. No migration,
  Edge Function or setting changed.

### Changed (Logic panel explains where rules go, founder feedback 2026-11-13)

- On the first question the Logic panel now says it is the first question and that rules go on later questions, instead
  of a generic line that read as if logic was missing. When earlier questions exist but none can drive a rule, it says
  to add a choice, yes/no or rating question above or move the question down.

### Operations (production, 2026-11-13: 000050 and 000051)

- **Applied 000050** (SHA-256 `e44eddb1…`) **and 000051** (`2c5cfe51…`) to production (`qprfonxvthmaoxfixigk`) through
  the Management API, each as the file's own transaction, after `test:pr` and 1472/1465 database checks; the e2e
  failures seen under parallel load (comments, community dark mode, bad invite, product pages) all pass on rerun.
  Verification: history `000040`–`000043`, `000050`, `000051`; `lv_campaign_by_code` executable by `authenticated`
  only; `lv_my_context` keeps the suspension block and reports Creator limits (Creator Pro owner: 100/100).

### Added (who is answering: sign in or answer as a guest, founder request 2026-11-13, 000050)

- **Survey links offer sign-in.** On `/c/<code>` a signed-out visitor sees "Have a LunchVoice account? Sign in" next to
  the guest name field (when the creator asks for one); signing in returns them to the same survey.
- **Signed-in people answer with their account.** A signed-in visitor on a survey link is no longer treated as an
  unverified guest: `lv_api.lv_campaign_by_code` (000050, signed-in only) returns the Campaign id when they may take part
  (or manage it), and the player shows "Answering as {name}" on identified surveys. Non-managers get the same
  visibility as the player (published, not blocked, Hub not suspended); others get `lv_not_found`.
- **The builder Preview shows the start step** with "As a guest" and "Signed in" views, so the name and sign-in step no
  longer looks missing when a creator previews their own survey.
- Tests: `supabase/tests/50_campaign_by_code.sql`; `e2e/studio.test.mjs` runs the guest path in a signed-out browser and
  the signed-in path with "Answering as".

### Fixed (My home shows Creator Quick Survey limits, 000051)

- A Creator Pro account saw "Quick Surveys 1/5" on My home although its real limit is 100 active (Creator Plus 15).
  000042 moved every Quick Survey guard to `lv.quick_limit`, but `lv_api.lv_my_context` still reported the free numbers.
  000051 keeps the wrapper body and overrides `quick_surveys.limit` and `question_limit` with the caller's own limits.
  Tests: `supabase/tests/51_context_creator_limits.sql` (free 5/10, Creator Plus 15/30, Creator Pro 100/100).

### Added (Results charts, premium results and Trends, migration 000044, 2026-11-13)

- **Lv chart components** (`src/components/charts/`, import from `.../charts/index`): `LvChartFrame`, `LvBarChart`,
  `LvStarDistribution`, `LvSplitBar`, `LvLineChart`, `LvKpiCard`, `LvWithheld`. They wrap Recharts 3.10.1 (pinned) so no
  screen imports it; grey first with LunchVoice amber as the one accent, existing `--lv-*` tokens only, values on bars,
  bars start at zero, light/dark/high contrast, 375px, an accessible data table behind every chart, "Withheld: fewer than 5
  answers" as a built-in state, and "N saw, M answered" plus an active-filter label on the frame. Components never total
  or average anything; the numbers come from the API. Recharts loads only in the lazy results/Trends chunks.
- **Results page** (all plans): summary cards (responses, completion rate, median time bucket), a star distribution with
  the server's average, sorted choice bars, a yes/no split, a text list; each chart has a type switcher, a "Show data
  table" toggle and "Save as image" (PNG, in the browser). CSV export of released results now also opens for Creator Plus
  and Pro (`analytics.export`, enforced by the server). "Pin to Hub dashboard" is a TODO until a Hub dashboard exists.
- **Premium results** (Team Hub, Creator Pro; `analytics.premium`): responses over time, device type (phone/tablet/computer
  only) and where people came from (link, QR, join code, Discord), and a cross-tab of two choice questions. On anonymous
  surveys every shown cell is at least 5 with complementary suppression (`lv.safe_cells`); a cross-tab is withheld whole
  unless every cell qualifies and no row or column sits in one cell. The Starter Hub sees what unlocks it.
- **Coarse capture, counters only**: the device class is read from the request's User-Agent in an `AFTER INSERT` trigger
  and the source/duration bucket and "started" are reported by the player once per receipt. The User-Agent and IP are never
  stored, and nothing is stored per response, so it cannot be joined to an answer. QR codes carry `?src=qr`.
- **Trends**: a series of surveys asked again (a Hub's Campaigns, or a person's Quick Surveys; one space per Trend). The
  Trend page lists runs in time order with dates and answer counts and compares repeated questions (same kind and wording)
  as a rating average, a choice share or a yes/no split, from privacy-safe per-run results: withheld is a gap, never zero;
  answers are never joined across runs. "Ask again" makes a draft copy already in the Trend. Manage with `campaign.manage`
  (owner of a personal space); reading needs `analytics.read`. `trends.max` (free 0, Creator Plus 3, Creator Pro 10, Starter 3,
  Team 5; Creator counts PROVISIONAL) and `trends.max_pass` (1 on a Campaign pass). Over the limit nothing is deleted and
  everything stays readable; creating, adding and asking again are refused (`lv_limit_reached`).
- Hub tab "Trends"; Quick Surveys page links to `/trends`; routes `/:hub/trends[/:trend]` and `/trends[/:trend]`.
- Rollback `supabase/rollbacks/000044_v2_trends_and_analytics.down.sql` (refuses while a Trend exists); tests
  `supabase/tests/44_trends_and_analytics.sql`, `src/lib/chartData.test.ts`, `e2e/analytics.test.mjs`.

### Security (000044)

- "Ask again" refuses a blocked survey (`lv_locked`), a suspended account or space (`lv_suspended`), and a caller over the
  creation rate limit (`quick.create_per_hour`, `lv_rate_limited`), on top of `campaign.manage`/owner and the Trend limit;
  creating a Trend also refuses a suspended account or space. Database checks prove each refusal and that no copy is made.

### Operations (production, 2026-11-13: 000042 Linked Questions)

- **Applied 000042 to production** (`qprfonxvthmaoxfixigk`) from commit `537f180` (file SHA-256 `5a37f889…`) through the
  Management API as the file's own single transaction, after `test:pr`, 152/152 e2e and 1461/1461 database checks
  (with 000043). Pre-check: `lv.capacity_check` present, `capacity_check_core` absent, latest `000043`. Verification:
  history `000040`–`000043`; `lv.check_answer_value` rejects an off-list choice and a non-boolean yes/no; the elections
  validator (`validate_answers_core`) kept; no new function executable by `anon`; Creator Quick Survey limits live
  (Plus 30 questions / 15 active, Pro 100 / 100). Founder authority: migrations may be applied once tests pass.

### Added (Linked Questions, migration 000042, 2026-11-13)

- **Per-question "show only if" rules and "end survey"**, for Creator Plus or a Starter Hub and above (the existing
  `survey.branching` entitlement, enforced on the server). A question can depend on EARLIER questions, joined with all
  or any: choice and multi choice "is any of / none of", yes/no "is", rating "at least / at most / between". An answer
  can also end the survey. Section rules (000041) keep working. Builder: a "Logic" panel on each question (locked, with
  what unlocks it, for the free plan), a rule tag on the outline, a plain-language publish check and a min/max path
  summary. Player: only the questions on the person's path, progress that follows it, Back keeps every answer, and
  answers to hidden questions are never sent or stored. Results: "N saw, M answered" per question on surveys with paths
  (withheld under 5 on anonymous surveys).
- `lv_analytics_question` (seen/answered and an optional filter by an earlier answer; the filter has no UI yet).
- **Creator limits for Quick Surveys**: `quick.max_questions` and `quick.max_active` for Creator Plus (30 / 15) and Creator
  Pro (100 / 100), kinds/modes as free; the question guard, activation gate and Quick Surveys list resolve the owner's
  Creator family and fall back to free. Founder perks, one `update lv.plan_limits` to change.
- Not in this release (follow-up PR): skip-to-question jumps, answer piping, randomization, results filter control, the full
  click-through path preview. The pure logic for them is already in `src/lib/logic.ts` but the server refuses skip-to.

### Security (migration 000042)

- **Security: answer validation for sectioned campaigns now applies every core check.** The 000041 validator skipped the
  per-answer checks for sectioned Campaigns (option membership, yes/no boolean, text length, multi choice rules). Every shown
  answer now goes through `lv.check_answer_value`, and every path (elections and Campaigns without logic included)
  rejects entries without a question id, ids from another survey and duplicate ids. pgTAP `42_linked_questions.sql`
  proves each rejection.

### Operations (production, 2026-11-13: 000043 survey branding)

- **Security (review 2026-11-13):** `lv_analytics_question` refuses a filter on anonymous Campaigns (`lv_invalid_input`).
  A filter let two queries differ by a few respondents or isolate free text, which the minimum cohort cannot fully
  prevent. Filters remain on identified Campaigns; a cohort-safe partition design is future work.
- **Applied 000043 to production** (`qprfonxvthmaoxfixigk`) from commit `e8c0406` (file SHA-256 `a11dc233…`) through the
  Management API in one transaction (the file's own `begin`/`commit` lines stripped), after `test:pr`, 147/147 e2e and
  1389/1389 database checks. Founder authority: migrations may be applied once tests pass. Verification: RLS on
  `lv.campaign_branding` with no API-role table access; `anon` may call only `lv_campaign_theme`; buckets
  `survey-logos` (1 MB) and `survey-covers` (3 MB) private; 4 storage policies; history version corrected to `000043`.
  Security advisor: no new finding types (definer functions and RLS-without-policy are the established `lv_api` pattern).

### Added (survey branding, paid, 000043)

- **Security (review 2026-11-13):** the public theme (`lv_campaign_theme`) and branding image reads
  (`lv_storage.branding_readable`) now follow the player's visibility: nothing for a suspended Hub, and only for
  link-open Campaigns or people who may take part (`lv.can_participate`). Before, anyone holding a Campaign id could
  read the logo and welcome/thank-you text of an invite-only or members-only survey. Managers still see their own.
  Seven new checks in `supabase/tests/43_survey_branding.sql`.
- **Custom survey branding** for Quick Surveys and Campaigns: brand color (WCAG AA 4.5:1 on white enforced in the editor and
  on save, with a one-click readable shade), logo, optional cover image, welcome headline, thank-you message, rounded or pill
  buttons, and a live start/thank-you preview at 375px and desktop (`src/pages/SurveyBranding.tsx`). Free users see the panel
  locked with what unlocks it. The player applies the theme through `--pt-*` variables scoped to `.lv-ptheme`
  (`src/ui/player-theme.css`, `src/ui/PlayerTheme.tsx`); no global token changes; light and dark derive their own shades; high
  contrast keeps LunchVoice colors. The "Powered by LunchVoice" footer stays unless `survey.remove_footer` (Team, Creator Pro).
- Founder rule: themes work without Hubs and are stored per survey. "Use the Hub's color" is only a preset; `follow_hub` is an
  explicit toggle, so later Hub changes never silently change a survey with its own theme. A downgraded plan keeps the data and
  the player falls back to default styling.
- Migration `000043_v2_survey_branding.sql` (rollback in `supabase/rollbacks/`, tests `supabase/tests/43_survey_branding.sql`):
  `lv.campaign_branding` (RLS, no grants), `lv_campaign_branding_get/_set/_theme`, buckets `survey-logos` (1 MB) and
  `survey-covers` (3 MB) with png/jpg/webp only and storage policies. Not applied to production.
- First release scope: color, logo, welcome headline, thank-you message, preview, locked state. Cover image, the remove-footer
  key and button-style options exist in the API and player but their controls are deferred to a follow-up PR.
- Tests: `src/lib/surveyTheme.test.ts`, `e2e/branding.test.mjs`. Contract: `docs/backend/API_CONTRACT.md`.

### Fixed (MCP: the KpnIdentity wrapper the tests expect is now committed, 2026-11-13)

- `scripts/mcp/supabase-kpnidentity.sh` (the `kpnauth` server) was referenced by `.mcp.json` and tested by
  `scripts/mcp.test.mjs` but never committed, so `test:scripts` failed on `main` with exit 127. It is now committed with
  the matching `supabase.sh`, `doctor.sh` and `.mcp.env.example` changes: the LunchVoice token is
  `LUNCHVOICE_SUPABASE_ACCESS_TOKEN`, and the KpnIdentity server uses its own `KPNIDENTITY_SUPABASE_ACCESS_TOKEN` and
  refuses to reuse the primary token. No secret values are committed.

### Changed

- **Renamed the project MCP servers to `lunchvoice` and `kpnauth`** across every harness config: `.mcp.json` (Claude Code),
  `opencode.json`, `.codex/config.toml`, `.vscode/mcp.json` and `.cursor/mcp.json`. The old names were inconsistent
  (`supabase`, `supabase-local`, `supabase-lunchvoice`, `supabase-kpnidentity`) and actively misleading: `supabase-local`
  pointed at the **production** LunchVoice project, not a local database. VS Code and Cursor also moved off the old
  relative-path `command` form to the same absolute-path `bash -c "exec bash ..."` wrapper the other harnesses use, which is
  what makes the desktop app work on WSL. `scripts/mcp/README.md` documents the new names and why they changed.
  Local-only `.claude/settings.local.json` now allow-lists read-only tools under the new names; `apply_migration`,
  `execute_sql`, `delete_branch`, `reset_branch`, `merge_branch` and `deploy_edge_function` were removed from the
  auto-allow list so they prompt again on a production project.

### Operations (production, 2026-11-13, founder approval in session)

- **Applied 000040 and 000041 to production** (`qprfonxvthmaoxfixigk`) from commit `75cf270` (SHA-256 `8f0f2231…`
  and `0a082d1f…`), through the Management API, one transaction each. Backup on record: daily physical backup
  `2244167446` (2026-11-12 10:45 UTC; point-in-time recovery is off). Pre-check: production runs 7 migrations not on
  `main` (000029–000032, 000036–000038); 000041 was made merge-safe for the elections validator and rehearsed on
  production's exact chain first (see the 000041 entry). Verification: all 15 changed functions hash-identical to the
  rehearsal; none executable by `anon`; `survey.branching`/`survey.branding` rows, Creator products and the publish
  trigger present; migration history corrected to `000040` and `000041`. The P3 data-fix script was **not** run.
- **Founder access grant** (exact SQL shown and approved first): the founder's account received Creator Pro
  (account-scoped, `grant`, no end date) and one unused Team Hub credit, with one audit event
  (`founder-grant-2026-11-13`). Already in place: staff access, the Kitchen on Team Hub.
- **Not deployed:** the frontend for sections lives on `claude/confident-euler-e4uri9`; lunchvoice.com shows it after
  the branch is merged and Render deploys.

### Added (sections and "show only if" rules; Creator plans; founder 2026-11-13)

- **One survey, different questions per person.** A question can start a **section** with a title, an optional line
  under it, and a rule: "show only if [an earlier choice or yes/no question] is any of [answers]". Everyone else skips
  the section. Example: staff see "Your day", center leaders and corporate see "Across departments and centers".
- **Plans.** Sections start at **Creator Plus** and **Starter Hub** (founder 2026-11-13). Creator Plus ($5/month) and
  Creator Pro ($15/month) exist as per-person plans in the entitlement map (migration
  `000041_v2_sections_and_creator_plans`); they cannot be bought until their Stripe products exist. Survey branding
  uses the same plan line (`survey.branding`) and is built next. The brain files record the Creator plans.
- **Merge-safe validator.** Production also runs migrations that are not on `main` yet (000029–000032 from
  `claude/determined-darwin-aa79al`, 000036–000038 elections from `claude/nice-archimedes-5rfw1t-elections`), and
  000037 replaced `lv.validate_answers`. 000041 therefore renames whatever validator is installed to
  `lv.validate_answers_core` and wraps it: Campaigns without sections and every election go through the old one
  unchanged. Sections are refused on elections. Rehearsed on production's exact 38-migration chain plus 000040/000041:
  the same 5 pre-existing check differences before and after (repo tests against other branches' migrations), 23 new
  checks passing, the elections suites passing, and the rollback restoring a validator byte-identical to production's.
- **Server rules** (`lv.validate_answers`): an answer to a hidden question is refused; a required question is required
  only when shown. Publishing refuses a rule that points at a later or missing question, or at an option that no
  longer exists. A lapsed plan never breaks a published survey. Contract: `docs/backend/API_CONTRACT.md`.
- **Builder.** A "Section" panel under each question (from question 2): start a section, title, description, "Who sees
  this section" with the answers as checkboxes, a plain sentence ("Shown when “What is your role?” is Manager or
  Corporate operations. Everyone else skips it."), and a note that anonymous results for the section stay withheld
  under 5 answers. On a free plan the panel says which plans include it, with a link to plans. The question outline
  shows section headers with their rule. The publish checklist shows a broken rule.
- **Answering screen.** Only the sections a person's answers open are shown; the progress bar counts them. The section
  title and line appear above its first question. The welcome screen counts the longest path ("Up to N questions" when
  some people answer fewer). Answers to sections a person backed out of are never sent.
- **Design pass** (design-system skill): tokens only, existing `Badge`, `Field`, `Checkbox`, `Notice` and
  `.lv-inline-link`; the section label is grouped with its question; checked at 390, 768 and 1280 in light, dark and
  high contrast with no horizontal scroll and no overlapping elements (automated box check).
- **Fixed while building:** wrapping the question editor remounted it when a new question was created (caught by the
  save-race test); the section panel is now a sibling.
- **Tests:** `supabase/tests/41_sections_and_creator_plans.sql` (gating, Creator plan on a person only, malformed rule,
  publish checks, hidden and required answers, lapse); `src/lib/sections.test.ts`; `e2e/sections.test.mjs` (build a
  conditional section, free-plan lock, the player shows and drops the section). `db-test-canonical.sh`: 1342 checks,
  0 failed, rollback rehearsal passes.
- **Noticed, not changed:** inline links use the legacy `a { color: var(--accent) }` rule (`src/index.css`), amber on
  white, which is below AA contrast for text. New links here use `.lv-inline-link`. Changing the global rule needs a
  founder decision.

### Fixed (audit P3, founder decision 2026-11-12: a display name is never an email address)

- **Migration `000040_v2_display_name_never_email`:** `lv.safe_display_name(name, email)` keeps a name without "@";
  otherwise it uses the part before the @ with leading and trailing digits trimmed, and "Member" when nothing is left.
  `lv.ensure_account` creates accounts through it and no longer caches an "@" token name in
  `account_identities.display_name` (KpnIdentity sends the email as `name` for email/password sign-ups, which is how
  emails reached member lists). `lv_profile_update` refuses a name containing "@". `lv.accounts` gets
  `CHECK (no "@")`, added `NOT VALID` so the migration applies over the existing rows; new and updated rows are
  checked at once. Rollback: `supabase/rollbacks/000040_…down.sql` (it never puts an email back).
- **Data fix, approval only:** `scripts/data-fixes/2026-11-12_p3_display_names.sql` previews, rewrites the old rows in
  one transaction, refuses to commit when the count differs from the preview, validates the check and writes one
  audit event. Not a migration and not run anywhere. Production preview (read only, 2026-11-12): 2 of 5 accounts
  and 2 cached identity names would change.
- **Tests:** `supabase/tests/40_display_name_never_email.sql` (helper cases, new account from an email-shaped token,
  profile editor, table check). `scripts/db-test-canonical.sh`: 1329 checks, 0 failed; rollback rehearsal passes.
  The dev mock and the Account help text match the rule.

### Fixed (pre-launch audit 2026-11-12, first batch: LunchVoice-side quick wins)

Source: "LunchVoice.com Pre-Launch Audit — Results" and "KpnAuth Review" (2026-11-12). This batch covers the items that
live in this repository and need no database change.

- **P2, withheld shown as "No answers yet":** on a closed anonymous survey under the minimum, the API returns
  `cells: []` with `withheld: true`; `Results.tsx` fell through to "No answers yet", so the creator thought the survey
  failed. It now shows the Withheld bar and "Withheld: this question has fewer than 5 answers…". The dev mock now
  returns the same shape as the real API (000016), which is why this was never caught.
- **P4, the minimum is stated:** results, the withheld explainer, text answers and the Close dialog say "at least 5".
  The number lives in `src/config/privacy.ts` (`ANON_MIN_ANSWERS`), mirroring policy `campaign.min_cohort` (000014);
  the server still decides what is withheld.
- **P1, live-results claim (copy side only):** live anonymous results stay blocked by design (000013: a live tally is
  identity-linked). The homepage lede, "How a survey works" steps, `seo.json`/`index.html` descriptions and the event
  use case no longer promise watching anonymous answers arrive; they say identified surveys fill in live and anonymous
  results open on close with at least 5 answers. Whether to show a live response count is a founder decision.
- **P6, thank-you next step:** "Make your own survey, free" (to `/surveys/new`) beside Done.
- **P7/P9:** Quick Survey Close/Archive dialogs say "survey", the guest toggle no longer mentions Campaign access modes,
  and the screen-reader "Ready to publish." line is gone once a survey is published.
- **F3, invisible focus ring on dark sections (WCAG 2.4.7):** ink surfaces re-scope `--lv-focus` to the existing
  `--lv-on-band` colour (no new token value). Checked on the hero CTA.
- **F7/G6, F10:** `/signin` and the account page say "Google or email" (the auth page leads with email); the join-code
  link wraps at 375px instead of overflowing; a missing join code no longer shows "We can't find that." twice;
  Discover shows "Under 100 active members" instead of "0+ active members".
- **F9:** `/assets/*` is served `Cache-Control: public, max-age=31536000, immutable` (fingerprinted files).
- **F12:** HSTS adds `includeSubDomains` (every lunchvoice.com subdomain must be HTTPS; matches the planned
  auth.lunchvoice.com); the maker mark span gets `role="img"` for its `aria-label`. The homepage's static canonical
  stays omitted on purpose (`scripts/seo-prerender.mjs`: hosts may serve `index.html` for any path); `Seo.tsx` sets it.
- **Tests:** `e2e/studio.test.mjs` (closed anonymous survey under the minimum: Withheld with the number, Close dialog
  wording, no stale readiness line); `e2e/polish.test.mjs` (thank-you next step); `e2e/sitecta.test.mjs` (sign-in copy).
- **Not in this batch:** F2 analytics (needs the founder to pick a tool; it also changes the CSP), F4/F5 per-Hub share
  previews and public Hub activity, F6 build-before-sign-in, F8 real 404 status (Render static rewrites), F11 token
  sprawl, P3 emails as display names (backend: `lv.ensure_account` falls back to the token `name` claim, which
  can be an email; needs a migration plus a production data fix with owner approval), P5 a live Kitchen poll (content),
  P8 deleting Quick Surveys, P10 name shown three ways. KpnAuth items K1–K16 and B1–B9 belong to the
  auth.kpnsolute.com app and the KpnIdentity Supabase project, not this repository.

### Changed (survey creation and Campaign lists, founder assignment 2026-11-12, PR D)

- **New Quick Survey opens on a short template list:** Blank and the first five templates, then "Show all N templates".
  A category lists everything. The chosen template always stays listed. Before, 21 options came before the title, who
  can answer and anonymity; on a 390px phone the title is now reached after six options.
- **The free-limits card** no longer repeats "1 of 5 active" under the meter that already shows "1 / 5".
- **Same words everywhere:** the Campaign list filter "Live" is now "Open", matching the phase badge. Modes read
  "Survey", "Poll", "Rating" and "Feedback" instead of the code values (`modeLabel` in `src/components/ui.tsx`), on
  Campaign cards, the Hub overview rows and the Campaign header, where anonymity also reads "Anonymous" or
  "Identified". The disabled Election mode says "Coming later" instead of the internal "Coming with M2".
- **Tests:** `e2e/surveyflow.test.mjs` (3): the short list and Show all at 390px, a template from the full list stays
  selected, list labels.

### Changed (Hub workspace: setup checklist, plain settings, Connected communities; founder assignment 2026-11-12, PR C)

- **Overview:** the three numbers (live Campaigns, members, plan) run across the top instead of stacking in a narrow
  column. "Get your Hub going" (shown only with no Campaigns) is replaced by **"Set up your Hub"**: describe your Hub,
  pick your Hub color, ask your first question, invite people, connect your Discord server. Every tick comes from
  real state (about line, accent, Campaign count, member count, Discord connections); each open step links to the
  place that does it; there is a progress bar and "N of M done"; it shows only the steps the viewer can act on and
  disappears when they are all done. Discord connections are read only for settings managers. The Plan tile loses its
  green left-edge bar (founder request 2026-11-12); the three tiles share one flat style.
- **Settings:** grouped as "Name and description" and "Who can see it and join". The labels are "Hub name" and "What is
  this Hub for?", and the help text says where the description shows. The address is shown, with a way to ask support
  (owners cannot change it in the app yet; whether they should is a founder decision). Visibility and joining are radio
  choices with one sentence each instead of selects (the joining select truncated "Approval: a manager admits
  reque…"). A line says changing them never removes members (`lv_hub_update` touches no memberships). "Community
  appearance" is now "Hub color" and the checklist links to it (`#appearance`). "Owner only" is now "Ownership and
  deletion", with a line saying only the Owner sees it.
- **Discord tab, "Connected communities":** when nothing is connected, three numbered steps (add the bot, run
  `/lunchvoice connect hub:<slug>` with a copy button, confirm the link). When connected, one card per server with
  its name and date, an auto-post switch with a sentence saying what it does (toast on change, disabled when staff
  turned the server off), role rules in words, and Disconnect behind a confirmation that says nothing in the Hub is
  deleted. A panel says what Discord can and cannot see: LunchVoice never reads server messages (the bot only posts
  to channels), and anonymous Campaigns are answered in LunchVoice. No new API is used.
- **Tests:** `e2e/hubsetup.test.mjs` (3): ticks from real state, Discord connection closes the checklist; plain
  labels, radio choices, address; empty steps with the command, the server card, auto-post toast, disconnect
  confirmation, 390px. The launch-plan UI gate adds Hub settings and its Discord tab.
- **Needs the founder:** the bot's invite link. The repository has none, so step 1 cannot link to it. A decision on
  letting owners change their Hub address (needs a backend function with the reserved-name and quarantine rules). The
  Hub banner's gradient glow (from #66) disagrees with DESIGN.md's "solid surfaces"; left as it is.

### Changed (public site: the "less generated" pass, founder assignment 2026-11-12, PR B)

- **Home page answers what, who, how and what next.** The approved hero is unchanged. The use cases now say who
  LunchVoice is for. "How it works" is one connected four-step sequence: create a survey, share it, collect responses,
  understand results. It replaces three unrelated numbered cards in three fills and becomes a vertical timeline on
  phones. A new "What you can do with LunchVoice" section is a ruled grid of the six products linking to their pages;
  it replaces the "Your Hub" section, whose content now lives on `/products/hubs`. The participant band lists three
  facts instead of an invented "example account" dashboard with made-up numbers.
- **Fewer generated-page tells.** Eyebrows are kept only where they add a fact the heading does not (hero, For
  participants, Founding seats, Built in the open); the four that repeated their heading are gone. Headings rewritten
  as plain statements: "How a survey works", "What you can do with LunchVoice", "Answering is always free." and
  "Free for surveys, from $13 a month for a Hub" (the price comes from `src/config/pricing.ts`). Two light sections in
  a row share one gap instead of stacking two.
- **`/how-it-works`:** the four points are not steps, so the numbers 01 to 04 and the identical cards are gone. They
  are a two-by-two list with hairlines. The privacy questions sit in an open section that links to the Privacy
  product page.
- **Copy accuracy:** `seo.json` (home and use cases) and the use-cases lede no longer name "ideas", "idea boards" or
  "elections", which `main` does not have. They say survey, poll, rating, open feedback and suggestion box.
- **Not changed** (founder decision, recorded in the billing audit): the Team plan's "Enhanced Campaign modes" and
  "Advanced targeting and analytics" lines on `/pricing`.
- **Test:** the homepage shows the four steps, links all six products, keeps at most three section eyebrows and has
  exactly one sample-data illustration.

### Added (product website: six product pages, Products menu, footer; founder assignment 2026-11-12, PR A)

- **Six product pages** at `/products/<slug>`: Hubs, Feedback, Campaigns, LunchVoice for Discord, Developers and Privacy,
  plus the `/products` index (grouped by job: ask a question, run a community, connect your tools). Finished from the
  `wip/product-pages` drafts. Content is `src/config/products.json` (one source for the pages, the menu, the footer, the
  search metadata and the sitemap). Each page: headline and lede, who it is for, a demo drawn with real components
  (labelled as an example), what you get, a "By plan" table read from `lv_plan_limits` (rows with no value in the map are
  left out, never guessed), how it fits with links to related products, price and the billing-driven primary action
  (`src/lib/billingState.ts`). On phones the plan table becomes a stacked list instead of scrolling sideways.
- **Copy checked against `main` and production** (2026-11-12): Campaign modes `survey`, `poll`, `rating`, `feedback`;
  question kinds rating, single and multiple choice, yes or no, short text; Discord commands link, unlink, verify,
  connect, post and setup; production's public `lv_plan_limits` returns every key the pages read (API 10 keys, 60
  requests a minute, 5 webhook endpoints, Team only; shop items 10 and 50; role targeting Team only), so `000024` is
  live in production despite `V2_STATUS_2026-11-12.md` listing it as unapplied. Nothing planned (Pulse, goals, recaps,
  missions, achievements, Trends, Creator plans, AI) or on the elections branch is described.
- **Header:** Products menu (the six with icon and one line, then "All products"; existing `DropdownMenu`, works on the
  ink home header), then Use cases, Pricing, Discover, How it works. The waitlist stays the amber header action. The
  phone sheet lists the products under "Products", then the site links in two columns.
- **Footer:** brand and contact, then four labelled columns: Products (the six), Use it for, Company, Legal. The legal
  page is "Privacy policy" (`/privacy`) so it is not confused with the Privacy product page (`/products/privacy`).
  KpnSolute attribution kept. Footer links are 44px on phones.
- **Routes and search:** `products` and `products/:slug` before the Hub route (`src/main.tsx`, `routes.json`);
  `/products` in `seo.json`; `scripts/seo-prerender.mjs` and `src/ui/Seo.tsx` add one page per product (title,
  description, canonical, Open Graph, sitemap); seven rewrites in `render.yaml`. **The Render dashboard rules are not
  synced from `render.yaml`:** until the founder adds the seven `/products` rewrites there, people get the app (it
  routes) but crawlers get the home page's metadata.
- **Reserved name `products`:** `src/lib/reservedSlugs.ts` and migration `000039_v2_reserve_products.sql` with its
  rollback and test `39_reserve_products.sql` (000036 to 000038 belong to the elections branch). `guidelines` added to
  the frontend list to match `000026`. **Not applied to production; needs founder approval.** Canonical suite: 1319
  checks, 0 failed, rollbacks rehearsed.
- **Mock:** `limitsOut` in `src/lib/mockTransport.ts` returns production's community, shop, export, role-targeting,
  API and webhook keys so development shows the full plan tables.
- **Tests:** `e2e/products.test.mjs` (8: index, every page's h1/table/prices/related/CTA/title/canonical, map-driven
  rows, unknown slug, the menu on both headers, phone sheet, footer columns and every footer link, 360px in three
  themes); the three new routes join the "launch plan UI gate"; the SEO script test accepts `/products/:slug`.

### Operations (2026-11-11, founder request)

- **The LunchVoice Hub moved to `lunchvoice.com/kitchen`.** In production, Hub `b3311357-89cc-4550-90e6-018ee35d40fa` had its
  address changed from `kpnworld` to `kitchen` (one row in `lv.hubs`; `kitchen` was not reserved, held or quarantined, and no
  Discord code or checkout intent pointed at the old address). `kpnworld` is free to claim again and has no redirect.
- **PR #66 merged to `main`** (`e0d4247`) at the founder's request, 17 ahead and 0 behind with both checks green.

### Brand identity system (2026-11-12, founder direction)

- **One logo.** The sharp-cornered LV with the amber speech bubble and smile is the official mark (founder decision).
  The second, rounded LV that the favicon and app icons used is deleted. Every logo, icon, social, video and Canva file
  is now generated from one vector source, `scripts/brand/logo.mjs`, by `npm run brand:build`; the wordmark is
  Bricolage Grotesque 800 converted to outlines. The shapes themselves were not redrawn.
- **Icons are amber** (founder decision): the favicon, app icons and profile picture show the mark in white on an amber
  tile. Under 48px the smile and dots are left off so the mark stays readable.
- **Tagline: "Make every voice count."** (founder decision) replaces "Every voice has a story. Hear it." on the home
  page hero, in the search metadata and on the link-preview image. "Smart feedback. Better cafeterias." is removed from
  every file. The link-preview image address carries `?v=2` so Discord and others fetch the new one.
- **Every version for every background:** horizontal, stacked, symbol, small-size symbol and wordmark, each for light
  backgrounds, dark backgrounds, all ink and all white, all transparent. The old files had ink letters baked in and
  vanished on dark.
- **Kit contents** (`brand/lv-package/`): icons at 16 to 1024px plus ICO, square and maskable shapes; social frames for
  Instagram, Reels, YouTube, Shorts, LinkedIn, Facebook and slides with crop guides; video outros, title card, lower
  third, backgrounds and overlays; a Canva folder with setup steps; a 15-page guidelines PDF; a colour specification
  computed from `src/ui/tokens.css` with measured contrast; typography; an audit of what was wrong. No colour or font
  value changed.
- **Site:** new favicon, Apple and Android icons, maskable icons added to `site.webmanifest`, new link-preview image and
  public logo downloads. `LvMark` now uses a viewBox cropped to the artwork, so the header logo is centred in its box;
  its drawn size is unchanged.
- **`npm run check:brand`** (now part of `test:pr`) checks required files, PNG sizes against their names, transparency,
  the ICO, SVG validity and palette, that `LvMark` matches the master geometry, and that no retired tagline returns.
- Known, not changed: `public/brand/discord-banner.png` has no source and still reads "Ask your community. Hear every
  voice."; the V's point dips below the L by design; details in `brand/lv-package/documentation/AUDIT.md`.

### Added (native design skills for Claude Code and Codex, founder assignment 2026-11-12)

- **Three project skills**, discovered natively by both agents: `design-system` (follow the system on every visible UI
  change), `frontend-design` (polished new screens within the fixed identity; adapted from Anthropic's Apache-2.0
  `frontend-design` skill, with `LICENSE.txt` and `NOTICE.md`), `design-element-authoring` (discover, evaluate,
  specify, design, implement, register, test, document, approve, release; founder approval for new token values and
  global rules). Canonical copies in `.agents/skills/` (Codex), byte-for-byte mirrors in `.claude/skills/`
  (Claude Code); `.gitattributes` pins LF endings so Windows checkouts stay identical.
- **Shared guidance** in `docs/frontend/design-system/`: `README.md` (source order with `tokens.css` first, identity,
  token map, component map, known inconsistencies), `COMPONENT_STANDARDS.md` (rules and the new-component spec),
  `DESIGN_EXTENSIONS.md` (lifecycle, approval table, proposal template, recorded extensions), `AGENT_WORKFLOW.md`
  (invocation, maintenance, verification record).
- **Checks:** `scripts/skills.mjs` (`npm run skills:sync`; validates metadata, references, licence and that both copies
  match), `scripts/check-gallery.mjs` (every reusable component shown at `/__gallery` or exempted with a reason),
  together `npm run check:design`, now part of `test:pr` and `test:light`. `scripts/verify-skills-live.mjs`
  (`npm run skills:verify`) asks the installed CLIs what they discover. 11 script tests; e2e: the gallery renders every
  section in light, dark and high contrast with no errors.
- **Frontend Design Protocol** in `AGENTS.md` and `CLAUDE.md` (identical): when to use each skill, the checks before
  finishing, approval for global changes, explicit invocation commands. UI-only; other tasks skip it.
- **Gallery:** brand (`LvMark`), Hub identity (`HubProfile`, `HubCard`, `ShareHubDialog`), badges, results and charts
  (`ResultBars`, `WithheldTag`, `TextAnswers`, `Bars`, `DistributionColumns`, `TrendLine`, `CountUp`), rows, QR, alerts
  and the full icon set.
- **Verified:** Claude Code 2.1.322 discovers all three (48 skills in the repo, 45 outside) and, in read-only runs with
  prompts that did not name a skill, chose `design-system` for a Hub card, `design-element-authoring` for a progress
  indicator (after checking existing components) and for a warning token (proposal, stopped for approval). Codex CLI
  0.167.2 lists all three from `.agents/skills` in its model-visible prompt (`codex debug prompt-input`). Not verified:
  Codex running the scenarios live (no OpenAI login here).

### Changed

- `.impeccable/config.json`: the font exemptions named Fraunces and Space Grotesk, a retired type system; now Space Mono
  (the data typeface) and Arial (email), with the reason updated. Gallery and `FRONTEND.md` wording follows design
  system 3. `src/ui/HubCover.tsx` removed (unused since the Hub profile header).

### Found (recorded, not changed: needs a founder decision)

- Warnings inside a Hub take the Hub's colour: the `warn` notice uses `--lv-accent`, which `.lv-hubscope` replaces.
  A semantic warning token was proposed by the scenario C run; adopting it needs approval.
- Two duration scales: `--lv-dur-*` in `tokens.css` and `--lv-d1/2/3` in `src/ui/motion.css`.
- `src/index.css` keeps legacy aliases (including the old glossy `--cta-shadow`) for pre-shadcn classes.

### Changed (design system 3: UI element rebuild, Hub identity and sharing, founder direction 2026-11-12)

- **Element rebuild** (tokens and `src/components/shadcn/`, so every page follows): solid surfaces with hairlines instead of
  gradients and glows; rounded-rectangle buttons (pill shape and hover lift gone, springy press kept); disabled buttons
  neutral grey; white input fields with a clear focus ring; selected radio cards, segmented tabs and phone tabs use a tint
  and outline (solid amber kept for answer choices in surveys and status badges); labels in the UI font, sentence case
  (Space Mono only for codes and numbers); badges as small rounded tags at 12px (they were 10.5px); one full-width header
  bar. Segmented filters scroll in one row on phones. `DESIGN.md` documents the rules.
- **Hub profile header** (`src/ui/HubProfile.tsx`): a banner in the Hub's colour with its mark overlapping it, the name,
  address, member count, how to join, visibility and a Share button. Replaces the coloured strip and title on member pages
  and the cover on visitor pages. The visitor join card no longer repeats the about line or shows "public" as a number.
- **Hub card** (`src/components/HubCard.tsx`): the Discord-style card used on Discover, in the share dialog and on the home
  page. Online count, tags and "Est." date render only when the backend sends them (requested in `API_CONTRACT.md`).
- **Share dialog** (`src/components/ShareHub.tsx`): card preview, the `lunchvoice.com/h/<slug>` share link, "Copy invite
  message", the phone share sheet and a QR code. `/h/<slug>` forwards to the Hub in the app (route added, `h` reserved).
- **Share links live on `hub.lunchvoice.com/<slug>`** (deployed 2026-11-12 through the Cloudflare API via Composio).
  lunchvoice.com points at Render with a proxied A record, and Cloudflare only runs a zone's Workers in front of a Render
  site through a proxied CNAME (O2O), so the `lunchvoice.com/h/*` route never fired (checked: responses came straight
  from Render's cache). The Worker now answers on its own Custom Domain: verified live, Discordbot gets "Kitchen on
  LunchVoice", "3 members · Open to join", the about line and `theme-color` #1D4ED8; people get a 302 to
  `lunchvoice.com/kitchen`; an unknown slug gets the neutral card; `/` goes to Discover. The Share dialog copies the
  new link; `lunchvoice.com/h/<slug>` still forwards to the Hub. Bindings: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
  (plain text; the old anon-key secret was dropped). Also set: Render `VITE_SUPABASE_PUBLISHABLE_KEY` on the Lunchvoice
  static site and the Supabase Edge Function secret `LV_PUBLISHABLE_KEY`.
- **Link previews per Hub** (`workers/hub-card`): a Cloudflare Worker for the route `lunchvoice.com/h/*` gives Discord,
  Slack, X, WhatsApp and iMessage a card with the Hub's name, member count, how to join, about line and colour
  (`theme-color`), and sends people on to the Hub. Supabase functions cannot serve HTML and Render cannot vary it per Hub;
  the domain is on Cloudflare. Private and missing Hubs get the same neutral card. 6 tests (`npm run test:workers`, now in
  `test:pr`). **Not deployed:** needs `wrangler deploy` from the founder's Cloudflare account (README in the folder).
- **Badges are icons with a meaning** (Discord-style, founder direction 2026-11-12): `src/config/badges.ts` and
  `IconBadge`. A small coloured icon after a name, each with a tooltip and an accessible label: Owner (crown), Founding Hub
  (sprout, founding plan), Team Hub (star, active Team plan) and Listed on Discover (shield-check, approved listing). Shown
  only when the data says so. Roles in the member list show their own icon. Text badges remain for states that need words
  (an ended plan, Campaign phases).
- **v2 docs brought up to date:** `docs/v2/LAUNCH_PLAN.md` definition of done ticked against evidence (two release items
  wait on the founder); `docs/v2/V2_STATUS_2026-11-12.md` records the evidence for every launch and build-plan item and
  what is waiting on the founder; `docs/v2/handoffs/2026-11-12-ui-design-system-3.md` hands the general UI pass to a
  separate agent. New e2e gate: 8 main routes in light, dark and high contrast at 390, 768 and 1280 with no sideways
  scroll and no console errors. Badge tooltips stack the label over the meaning, left aligned, with an arrow.
- **Ready for Supabase's new API keys** (founder note 2026-11-12: the legacy anon and service-role keys are retired in
  early 2027). The app prefers `VITE_SUPABASE_PUBLISHABLE_KEY` (falls back to the anon key) and sends keys only in the
  `apikey` header: `src/lib/apiKey.ts` strips the copy supabase-js puts in `Authorization: Bearer` when no one is signed
  in, and the sign-in exchange and function calls send `Authorization` only with a person's token. Functions:
  `supabase/functions/_shared/keys.ts` (publishable key from `LV_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS` or the
  legacy anon key; service secrets from `SUPABASE_SECRET_KEYS` or the legacy service-role key; no API key is ever taken
  for a signed-in person). Checkout uses it; the email, webhook and Discord dispatchers accept the new secret keys by
  Bearer or `apikey`. The share-preview Worker uses `SUPABASE_PUBLISHABLE_KEY`, set in `workers/hub-card/wrangler.toml` (public by design;
  verified against production: `lv_plan_limits` answers 200 with the key in `apikey` only). Tests: 3 key tests, 2 header tests, new
  checkout and dispatch cases. Switch-over steps: `docs/backend/PRODUCTION_RESET_RUNBOOK.md`, "Retiring the legacy anon
  and service-role keys".
- **LunchVoice's own Hub:** `COMMUNITY_HUB_SLUG = "kitchen"` in `src/config/contact.ts`. The home page shows a "Pull up a
  seat in the Kitchen" section with its card only while `lv_hub_get("kitchen")` returns a public Hub. The founder creates
  it through the normal flow; nothing is seeded or reserved.

### Fixed (broken link previews, founder report 2026-11-12)

- Every link preview of lunchvoice.com (Discord, Slack, iMessage) ended "Hubs for communities from <meta property=":
  `scripts/seo-prerender.mjs` passed page text to `String.replace` as a replacement string, where "$1" means "group 1",
  so "$13/month" became group 1 plus "3/month" and broke the tag. All replacements are now functions. New test: no tag
  ever appears inside a meta value, and "$13", "$&", "$1$2" and "$$" render as typed.

### Fixed (logo invisible on dark surfaces, founder report 2026-11-12)

- The LunchVoice mark was an `<img>` of a file with ink-coloured letters, so on a dark surface (the survey player's
  "Powered by" line, the dark theme header, sign-in card and Hub footer) only the amber bubble showed. New
  `src/components/LvMark.tsx` draws it inline: the L and V take the text colour of the surface, the bubble and bowl stay
  amber. It replaces the image in the header, footer, sign-in card, Hub "Powered by" and the player, and the CSS colour
  filters that patched the homepage header and footer are removed. `e2e/sitecta.test.mjs` checks the letters contrast
  with their background in light and dark and that no fixed-colour logo image is rendered.

### Changed (waitlist action back in the brand amber, founder feedback 2026-11-11)

- The Hub action ("Join the waitlist" before billing, "Create your Hub" after) is the amber primary button again in the
  header on every page, in the homepage waitlist band and on the Starter Hub card. In the hero it stays outlined beside
  "Start a free survey", which is the primary action there.

### Changed (UI and interaction review, 2026-11-11 handoff)

- **One billing state drives every call to action.** `src/lib/billingState.ts` (pure, 9 unit tests) and
  `src/lib/useBilling.tsx` (loaded once in the page shell) decide the wording and target of the header button, the homepage
  hero, waitlist band and plan cards, the `/pricing` notice and every checkout button. Signed-out visitors read the public
  `lv_plan_limits().billing` (000035); signed-in people also read `lv_billing_config`. Unknown means closed. Before billing:
  "Join the waitlist". After: "Create your Hub" goes to the Hub plans on `/pricing`. "Start a free survey" is the primary
  hero action in both states. While billing is closed no button says "Sign in to buy": the Starter Hub card points at the
  waitlist and the other paid plans are disabled with the reason. **Needs 000035 applied in production** for signed-out
  visitors to see the open state; until then they see closed, which is correct today.
- **Sign-in page** says what happens before the click: sign-in is on auth.kpnsolute.com, run by the company that makes
  LunchVoice, with a Google account. The button reads "Continue to sign in" (also on the invitation page). The identity
  flow sends no provider hint, so a direct "Continue with Google" button needs KpnIdentity to accept one.
- **Pricing:** free plan, then the highlighted Starter Hub, then Team Hub in one row of three; Campaign plans grouped under
  their own heading. On screens up to 860px the compare table becomes a plan picker with one plan's values at a time (no
  sideways scrolling at 360px; the picker stays pinned under the header). "Not set yet" is gone: the "Active Campaigns at
  once" row is built from the backend map (`campaigns.max_active`) and left out if the backend has no value. The survey
  replacement lines are in plain words ("A survey stops counting toward that limit once more than half your members have
  answered").
- **Homepage:** "LunchVoice 2.0" removed and the hero label is one line; the two hero actions sit under the headline; the
  floating amber button under the code card is gone; "Join survey" is never disabled (with no code it says what is missing
  and focuses the field). The result, Hub and account illustrations are labelled "Sample data" / "Example" on screen, the
  fake "Live, updated 2 min ago" line and the "LOGO" placeholder are gone, and the mock Hub uses brand tokens.
- **Accessibility:** new `--lv-accent-text` token for amber text (5.6:1 on the page; plain amber was about 1.8:1), used by
  every accent eyebrow; `--lv-text-min` 12px floor applied to every stylesheet; header buttons, menu button, nav, footer and
  chip links are at least 44px tall; the header action is hidden on `/waitlist` and `/signin`; "Sign in" is in the phone menu.
- **Buttons:** on public pages and the header only the primary keeps the gradient and glow; secondary and ink buttons are
  flat. The pill radius is unchanged on public pages (see the handoff).
- **One brand source:** `DESIGN.md` and `brand/lv-package/README.txt` now describe `src/ui/tokens.css` (Bricolage Grotesque,
  Geist, Space Mono, page `#EEEDEA`, the name as one word). `PRODUCT.md` carries the Campaign Plus price ($39, then $19 per
  week) that `AGENTS.md` and `src/config/pricing.ts` already had.
- `npm run test:pr` now also runs `test:unit`. New e2e: `e2e/sitecta.test.mjs` (both billing states, signed in and out,
  header, phone menu, 360px compare, touch targets, type floor); `e2e/commerce.test.mjs` updated for the closed state.
  Handoff: `docs/v2/handoffs/2026-11-11-ui-interaction-review.md`.

### Fixed (use-case pages blank in production, 2026-11-11)

- **Cause:** PR #63 was squash-merged from a branch that predated PR #62, so its merge commit reverted all of #62: the ten
  `/use-cases/<slug>` pages, `src/config/useCases.json`, the Quick Survey and Campaign templates, the expired-session fix
  (`src/lib/authFailure.ts`), their tests and their `render.yaml` rewrites. The Render dashboard rules (not synced from
  `render.yaml`) still rewrote each slug to `/use-cases/<slug>/index.html`, a file the build no longer wrote, so the host
  answered 200 with an empty body. The sitemap fell from 21 URLs to 11 and the homepage section disappeared for the same reason.
- **Fix:** #62 is re-applied on top of #63 (both sets of changes are kept; nothing from #63 is lost). No Render change is
  needed: the dashboard rules already point at the files this build writes again.
- **Guard:** `scripts/seo-prerender.mjs` now fails the build when an indexable page or any `render.yaml` rewrite destination
  has no non-empty file in `dist/` (`missingOutputs`), and `scripts/seo-prerender.test.mjs` covers it, including one file with
  a heading per use case. A stale-branch revert of the whole feature still needs review to catch; see the handoff.

### Added (000035 staff billing controls, built and tested, NOT yet applied to production)

- **Turn billing on from the staff panel** (founder request 2026-11-11). `supabase/migrations/000035_v2_billing_controls.sql` +
  rollback + `supabase/tests/35_billing_controls.sql` (23 checks) + `supabase/tests/36_paid_plan_delivers.sql` (12 checks; database
  suite 1316/0 with rollback rehearsal). `lv_admin_billing_status` and `lv_admin_billing_set` (schedule a future launch date, clear
  it, open billing with a typed confirmation and every Stripe price set, pause new purchases), all audited and staff-only; the
  public `lv_plan_limits` now carries `billing {open, launch_at, founding_ends_at}`. Setting the date gives every Founding Hub a
  real end date (30 days later); opening turns on the policy flag every purchase path reads and starts the countdown now.
- Staff panel Billing tab is now a console: state, launch date and Founding end date, a checklist, schedule and open controls
  with explanations, typed-confirmation dialogs, a warning when the date has passed with billing still off, and the Stripe
  events below. Hub Billing, Pricing and the disabled purchase buttons say "Billing opens {date}" once a date is set. e2e covers
  schedule, the counter showing the date, opening, purchases unlocking, pausing, missing prices and non-staff access.
- `docs/v2/BILLING_FULFILLMENT_AUDIT_2026-11-11.md`: purchase to access, advertised versus enforced (two Team claims, "enhanced
  Campaign modes" and "advanced analytics", are not delivered yet), and what is still unproven (one real $13 payment).

### Added (ten more Quick Survey templates, and Hub Campaign templates for each plan)

- Quick Survey templates grow from 10 to 20 and gain categories (Customers, Teams and work, Events, Community,
  Decisions) with a filter on `/surveys/new`: Would you recommend us?, Support satisfaction, Product or app feedback,
  Training evaluation, New starter check-in, Event RSVP, Speaker or session feedback, Volunteer interest, Neighbourhood
  priorities, Priority vote. RSVP and Volunteer interest default to Identified (you need to know who replied); a choice
  question can cap picks (`config.max`, "Pick up to 3").
- Hub Campaign templates, grouped by what each plan is for (`src/config/campaignTemplates.ts`), on
  `/:hub/campaigns/new`. Starter Hub (6): polls, ratings and a feedback box, which do not use one of the 2 active
  surveys, plus one monthly survey that says it does. Team Hub (5): four role-targeted templates (Role pulse,
  Volunteer shift feedback, New member check-in, Ask the leads) and a Quarterly community survey. Time-bounded (5):
  Event week feedback, Launch week poll, Season review, Call for ideas, and a Campaign Plus role check-in; the end date is
  set on the draft and can be changed under Schedule.
- Picking one fills the title, creates the draft with its description and questions, and opens the next decision:
  Audience for a role-targeted template (roles belong to each Hub), otherwise Review. A summary shows the mode, answers,
  who can answer, when it runs and the questions before anything is created.
- Honest by construction: role targeting needs identified answers (FB-01), so every targeted template is identified and
  says so; Team templates are shown but disabled, with the reason, on a Hub without the Team family. That is display
  only (`templateOffered`): the backend still decides and refuses with `lv_entitlement_required`. A shared link
  `?template=<id>` preselects an offered template and falls back to Blank for one the plan does not offer.
- `/pricing` gets "Templates for every plan", built from the same data so the counts stay true.
- `src/components/TemplateQuestions.tsx` is shared by the use-case pages and the picker.
- Tests: `src/lib/campaignTemplates.test.ts` (one question for a poll, rating or feedback; targeted means Team and
  identified; windows say when they close; offering is display-only) and `e2e/campaigntemplates.test.mjs` (Starter,
  locked Team templates, a Team Hub landing on Audience, a time-bounded end date, deep links, phone width, pricing).

### Fixed (people left signed in on a dead session saw "Something went wrong on our side")

- Reported: after a while of inactivity, My home showed "Something went wrong on our side. Try again." while the header
  still showed the person signed in. Cause: sessions last at most one hour by design (LC-04, LC-33), but the app checked
  the expiry only when the page loaded, and the real transport turned the backend's `401 JWT expired` (a PostgREST
  error, not an envelope) into `lv_server_error`. A tab left open past the hour kept sending a dead token.
- A refused or expired token now becomes `lv_unauthenticated` (`src/lib/authFailure.ts`: HTTP 401, PGRST301/302/303 or a
  JWT message; a 403 stays a permission error). Edge Function calls (checkout, portal) get the same treatment.
- `IdentityProvider` ends the session when its clock runs out (a timer, plus a re-check when the tab regains focus or
  becomes visible, since background timers are throttled) and whenever the server refuses a token that was sent. Ending
  clears the stored session, shows a toast, and sets a flag; signed-in pages go to `/signin` and keep the path
  (`from`), where a "You were signed out" notice explains why. Signing in again returns to where they were.
- The session lifetime is unchanged (1 hour, a compliance decision). Silent renewal, so people are not interrupted at
  all, needs a backend and CSP decision and is not part of this fix.
- Tests: `src/lib/authFailure.test.ts` (what counts as an ended session and what does not) and `e2e/session.test.mjs`
  (the reported My home case, an expiry while the tab is open, a public page, and a healthy session left alone). In dev
  the mock treats a session whose token is `expired` as a server-refused token.

### Added (use-case pages, four more templates, "more than lunch" positioning)

- Ten public use-case pages at `/use-cases/<slug>` (anonymous employee survey, event feedback form, club and committee
  votes, weekly team pulse survey, customer feedback questionnaire, meeting and workshop feedback, group scheduling
  poll, community suggestion box, menu and dining feedback, member questionnaire). Each shows the template's real
  sample questions, why it works, recommended settings, related pages and a "Use this template" button that opens
  `/surveys/new?template=<id>`. One source, `src/config/useCases.json`, feeds the page, its title, description,
  canonical, prerendered HTML and sitemap entry (21 sitemap URLs). Unknown slugs show the 404 page.
- Four new Quick Survey templates: Anonymous employee survey, Club or committee vote, Member questionnaire, Menu and
  dining feedback (ten in total). The vote template sets Invite only and Anonymous when picked (a ballot should reach
  only the people invited; each signed-in account counts once); other templates leave those settings alone.
- The Use cases hub is rebuilt from the same data and now leads with "The name has lunch in it. The product doesn't."
  The home page gets a use-case band linking to every page. Dining is one use case of ten.
- Honest about elections: the vote page states a LunchVoice poll is a straightforward vote, not a certified election,
  and that a dedicated Election mode is planned (Campaign Election mode is still disabled until M2).
- `render.yaml` gains ten rewrites (one per use-case page, above the catch-all). The Render dashboard needs the same
  ten rules; the file is not synced from the repo. `routes.json` lists `/use-cases/:slug`.
- Card-title links on marketing pages use ink instead of the amber accent for contrast.
- Tests: `scripts/seo-prerender.test.mjs` now covers every use-case page; `e2e/usecases.test.mjs` covers the hub, a
  page's real questions and canonical, the sign-in round trip, the vote defaults and caveat, a 404 and phone width.

### Added (try-it path: Quick Survey templates and go-to-market plan)

- Quick Surveys can start from six templates (Event feedback, Team pulse check, Pick a time or option, Suggestion box,
  Service feedback, Meeting or workshop feedback) on `/surveys/new`. Picking one fills the title (unless the creator
  typed their own) and creates the draft with its questions already added in order; everything stays editable until
  publish. Blank is still the default. `/surveys/new?template=<id>` preselects a template, so each one is a shareable
  marketing link; an unknown id falls back to Blank. Source: `src/config/surveyTemplates.ts` (generic, no customer
  named); `src/lib/surveyTemplates.test.ts` checks limits and the server's question rules; `e2e/templates.test.mjs`
  covers the flow.
- `RequireSignIn` now keeps the query string through sign-in (`from: pathname + search`), so a shared template link
  survives the redirect. `safeReturnTo` already validated queries.
- `docs/frontend/GO_TO_MARKET.md`: audience, the path to trying the product, template links, channel plan, honest
  offers, messaging rules tied to F-11, measurement options and the respondent growth loop, both left as founder
  decisions.

### Operations (2026-11-11, founder-approved: "approved, apply 000029 and ship")

- **Migration numbering and an overwrite caught.** While applying reporting I found production's history already held
  `000029 v2_participation_guest_limits`, `000030 v2_staff_reports`, `000031 v2_kernel_jobs` and `000032 v2_kernel_jobs_install_fix`,
  applied by another track (branch `claude/determined-darwin-aa79al`, not yet on `main`). My reporting migration is therefore
  renumbered **000033** (files, rollback and `supabase/tests/33_reports.sql`). Because both 000030 and my migration replace
  `lv.api_admin_reports`, mine overwrote their grouped survey queue in production for a short time; **000034** restores it
  and keeps my person and Hub reports in the same queue (applied only when `lv.abuse_reports.category` exists, so `main`,
  which lacks 000030, stays valid). Verified on a database with their four migrations plus mine: the queue function holds both
  behaviours and all 24 reporting checks pass. The other track should expect `lv_admin_reports` to accept types `person`
  and `hub` and to carry `details`, `target_*` fields on those items.
- Production audit after 000033: row-level security on every table, nothing in `lv` granted to API roles, reporting calls
  callable by signed-in users only; the signed-out list is unchanged apart from the other track's second `lv_report_abuse`.

### Changed (Hub Console, founder direction 2026-11-11)

- **Hub pages get a calmer, flatter look** (`docs/v2/PRODUCT_DIRECTION_2026-11-11.md` section 6), scoped to `.lv-hubscope` so
  LunchVoice's own pages keep the tactile look. Done by overriding surface tokens, so every card, button and well follows:
  the sections are now a **grouped rail on the left** (Hub, People, Manage) with the current page marked by the Hub's colour;
  cards have hairline borders instead of raised shadows; buttons are rectangular with no glow; the Hub's own accent (indigo
  when a Hub has not chosen one) is the single strong colour, replacing the orange tab underline and orange selected states;
  LunchVoice's pill slider (filters) is kept. Phones keep the bottom bar. Editors (the Campaign Studio) go full width with no
  rail so the question outline and preview have room. e2e checks the rail, the rectangular glow-free buttons, the pill slider
  and the full-width editor.

### Added (000033 reporting, applied to production 2026-11-11)

- **Discord-style reporting** (founder direction 2026-11-11, `docs/v2/PRODUCT_DIRECTION_2026-11-11.md`). A person or a Hub can
  be reported and the report attaches to that account's record and lands in the staff Reports queue.
  `supabase/migrations/000029_v2_reports.sql` + rollback + `supabase/tests/29_reports.sql` (database suite 1279/0 with
  rollback rehearsal): table `lv.user_reports` (nine reasons, details up to 1000, one open report per reporter per target,
  10 a day per reporter), `lv_report_account` (by membership or by one of their comments; reporter and target must share the
  Hub; self-reports refused), `lv_report_hub` (by address), `lv_my_reports`, the staff queue now carries people and Hubs,
  `lv_admin_user_report_decide` (actioned or dismissed with a note), and an open-report count on the Accounts tab. The audit
  never records the reporter and the queue never returns one.
- UI: a shared Report dialog; Report on member rows, on comments ("Report {name}") and a Hub options menu ("Report this
  Hub"); the Support page now leads with "Report something" (a person, a Hub by address, a survey by code) plus "Your
  reports" with their status; staff Reports tab shows people and Hubs with details, repeat-report badges, "Mark actioned"
  with a note and "Suspend account"; dev mock follows the SQL; e2e covers the flows.
- `docs/v2/PRODUCT_DIRECTION_2026-11-11.md`: SurveyMonkey comparison, the social layer, Hub and profile customization
  tiers, reporting design, the "Hub Console" look, and the build order.

### Changed

- **Invitations, as the recipient sees them** (`/j/:code`). A signed-out recipient used to get an error ("Sign in with
  KpnIdentity first") and a "Try another code" button, because the preview needs a signed-in person. They now get an
  explanation (sign in, see which Hub, join), the invite code, and one "Continue with KpnSolute" button that returns to the
  invitation. A signed-in recipient gets a real invitation card: the Hub's colour band, name, address and description
  (from the Hub's own public face when it shows one), public or private and member count, a plain list of what joining
  means (including that owners can see your display name), "Join {Hub}" and "Not now". An unusable code now says it
  may have expired, been used up or withdrawn, and how to get a new one. No backend change. e2e covers all three states.
- Fixed: the Yes/No question drew a three-line menu icon for "No". It now draws a cross (new `close` icon); an e2e test
  checks the check mark and the cross in the Studio preview and fails on the old icon.

### Changed

- The single public contact address is now **admin@lunchvoice.com** (the founder confirmed this is the mailbox that exists;
  `support@` was never confirmed). `src/config/contact.ts` is the one source for every mailto (footer, Support, Terms,
  Privacy, Guidelines, account menu, error screens, suspension notices); also updated in the SEO text, the Organization
  JSON-LD in `index.html`, the invitation-email footer template, tests and the compliance review. The deployed
  `email-dispatch` function still carries the old footer text until it is next redeployed (it sends nothing yet: no
  `RESEND_API_KEY`). Older changelog entries keep the old address as history.

### Operations (2026-11-10, founder-approved: "approved, apply 000028 and ship")

- **Production:** migration 000028 (guest names and Responses) applied to `qprfonxvthmaoxfixigk` from commit `3e2b6f6`
  (file hash `aa6d7cac…` verified) after a rehearsal on a seeded 000027 database; history version normalized. Post-apply
  audit: 142 `lv_api` functions, the same signed-out list plus the second `lv_guest_submit` signature, nothing in `lv`
  granted to `anon`/`authenticated`, RLS on every `lv` table, 2 new triggers, no Campaign has names on, data unchanged.
- **Discord bot profile:** `discord` gained a service-only `POST /discord/profile` that sets the bot's avatar, banner,
  description, and terms and privacy links using the token held in its own secrets (images are served from
  `public/brand/discord-icon.png` and `discord-banner.png`; the function fetches only our own site). Helpers and tests in
  `_shared/discord.ts`.

### Added (000028, built and tested, NOT yet applied to production)

- **Guest names for identified surveys** (founder request 2026-11-10, "like Kahoot") and a **Responses** view.
  `supabase/migrations/000028_v2_guest_names.sql` + rollback + `supabase/tests/28_guest_names.sql`: a per-Campaign setting
  (off, optional, required) for identified Campaigns with guest responses on; the guest's name is typed by them, cleaned,
  at most 40 characters, never verified, and shown as "Guest, unverified". Privacy rules enforced in the database: no name
  can be stored with an anonymous answer, names cannot be turned on for an anonymous Campaign, and a Campaign with names
  on cannot be switched to anonymous; names change only in a draft or while paused before the first answer. New
  `lv_campaign_set_guest_names`, four-argument `lv_guest_submit`, `lv_campaign_responses` (identified only, needs
  `analytics.read`, first page audited), and `guest_names` on `lv_guest_campaign_get` / `lv_campaign_get`. The anon
  allow-list test now expects the second `lv_guest_submit` signature. Canonical DB suite 1255/0 with rollback rehearsal.
- UI: the Guests card in Studio and Quick Surveys offers "Ask guests for a name"; the Identity card disables Anonymous while
  names are on and says why; the respondent player shows a name field before Start (required blocks Start); the thank-you
  line uses it; Results gets a Responses list for identified surveys. Dev mock follows the SQL; privacy text updated.

### Operations (2026-11-10)

- Search Console: `https://lunchvoice.com/sitemap.xml` showed "Sitemap is HTML" (last downloaded Nov 8 07:11 UTC, before the
  SEO deploy and the Render route fix, when the catch-all returned the app page). The sitemap now serves `application/xml`
  with 11 URLs on every address variant (checked as Googlebot) and was resubmitted for `sc-domain:lunchvoice.com`
  (2026-11-10 01:59 UTC, pending); the old error clears when Google next downloads it.

### Fixed

- Staff panel, Waitlist tab: the "Show email" buttons were indented from the Contact column (the quiet button's own
  padding), "None" sat flush, and the rows had different heights. The Contact cell now has a fixed row height and the
  button no longer shifts the text; "None" is muted. Added a one-line summary above the table ("4 of 50 Founding seats
  taken · 46 open · 2 waiting · 3 left a contact email"). e2e measures the alignment and row heights; it fails on the old
  layout.

### Fixed

- Quick Surveys could not be edited while paused: their own editor (`SurveyStudio`) hard-coded "draft only" and never
  got the paused-edit rules added to the Hub Studio with 000027. It now uses the same `editRules`: while a Quick Survey is
  paused its title and description can be edited, and its questions too until the first answer; a notice says what is
  locked and why. Pause, Resume, Close and Archive were already in the header. e2e walks create, publish, pause, edit,
  resume, answer, pause again; it fails on the old editor.

### Fixed

- The thank-you ("Already in. Thanks.") screen inside a Hub's campaign page looked like an excerpt of a full page: the
  embedded player kept the ink variant's `min-height: 100dvh` (it out-ranked the embedded reset), so it was exactly
  one screen tall, off-centre and unframed. Embedded players are now a contained, rounded card aligned with the page
  content, left-aligned, with no Done button (which left the Hub) and no "Made with" line. An e2e test checks the height,
  rounding and alignment at 1100px and 390px, and fails on the old CSS.

### Fixed

- The account menu's "Contact support" entry rendered as a default browser link (blue, underlined) because only the
  menu's buttons inherit colour. It now uses `lv-menu-link` and matches the other entries in both themes; the e2e test
  compares its computed colour, size, weight and underline with "Account settings" and fails on the old markup.

### Operations (2026-11-10, founder-approved: "complete the rewrites")

- **Render routes fixed** on the `Lunchvoice` static site (`srv-d92o4cmrnols73fkioa0`) via a newly connected Render
  toolkit. The live list had the catch-all `/* -> /app.html` at the top priority (so it shadowed every page), the page
  rules as redirects to `/<page>/index.html`, and no `/guidelines`. Replaced with the `render.yaml` list: rewrites
  for `/`, `/how-it-works`, `/use-cases`, `/pricing`, `/waitlist`, `/about`, `/discover`, `/support`, `/privacy`,
  `/terms`, `/guidelines`, then the catch-all last. Previous list kept as a rollback baseline (10 rules, ids
  `rdr-dbo29vrm…`). Live check: every public page serves its prerendered HTML with its own title and canonical URL;
  `/signin`, `/join`, `/settings`, a Hub slug and `/c/<code>` still reach the app shell. (Render's edge keeps a response
  for up to 5 minutes, so a page opened just before the change can show the old title until it expires.)
- Supersedes the earlier note that the `render.yaml` rewrites were not applied: the dashboard list now matches the file.

### Added

- The support mailbox is now linked where people get stuck, not only in the footer: a "Contact support" entry in the
  account menu, a "Still stuck? Write to support@lunchvoice.com" line on every error screen, and the Hub and account
  suspension notices ("To appeal, write to …"). All mailtos come from `src/config/contact.ts` (`supportMailto(subject)`
  prefilled with where the person was); still the single public address. `lunchvoice.com` mail is handled by Microsoft
  365 (MX `lunchvoice-com.mail.protection.outlook.com`); the founder still has to confirm the `support@` mailbox is
  monitored. e2e: the menu link and the appeal link.

### Operations (2026-11-09, founder-approved: "approved, apply 000025, 000026 and 000027 and ship")

- **Production:** migrations 000025 (suspended accounts cannot answer or join), 000026 (reserve platform page names) and
  000027 (edit a paused Campaign) applied to `qprfonxvthmaoxfixigk` one at a time from commit `9cff0d4`, file hashes
  verified (000025 `5f8ce908…`, 000026 `4ef0db15…`, 000027 `19900f73…`), after a rehearsal on a seeded 000024
  database. History versions normalized. Post-apply audit unchanged from the rehearsal: 139 `lv_api` functions, the same
  13 callable signed out, nothing in `lv` granted to `anon`/`authenticated`, RLS on every `lv` table,
  `lv_campaign_get` callable by signed-in users only, 8 names reserved, 2 new triggers, data unchanged (3 accounts,
  3 Hubs, 3 Campaigns). PR #53 merged to `main` (squash `d4ae0c5`); live bundle updated, `/guidelines` and the sitemap
  entry serve.
- Note: the `render.yaml` rewrites for the prerendered pages are not applied by Render (settings live in the dashboard),
  so `/terms` and `/guidelines` are served from the SPA shell; the prerendered files exist at `/<page>/index.html`.

### Added (000027, built and tested, NOT yet applied to production)

- **Edit a paused survey** (founder request 2026-11-09). `supabase/migrations/000027_v2_edit_paused_campaign.sql` +
  rollback + `supabase/tests/27_edit_paused_campaign.sql`: while a Campaign is paused its title, description and
  schedule can always be edited; its mode, anonymity and questions can be edited only until the first answer (member or
  guest), because changing them afterwards would change what existing answers mean or weaken the anonymity people were
  promised. Running, closed and archived Campaigns stay immutable; nothing is deleted; the revision is not changed.
  `lv.campaign_has_responses`, the relaxed question-freeze trigger, `lv.api_campaign_update`, and a `lv_campaign_get`
  wrapper that adds `campaign.has_responses` for managers (the previous function moves to `lv.campaign_get_base`,
  callable by no API role). Canonical DB suite 1222/0 with rollback rehearsal.
- Studio: Details, the identity choice, Questions and Schedule follow `editRules` (paused = editable; locked parts say
  why); the save indicator reads "Saved" when paused. Dev mock follows the SQL. New e2e test (fails on the old Studio).

### Fixed

- Phones (Android reported) got only the number pad on the join-code boxes, so letters could not be typed: `input-otp`
  defaults to `inputMode="numeric"`. The shared `InputOTP` wrapper now sets `inputMode="text"`, capital-letter
  autocapitalize, no autocorrect or autofill, and a Go key; the `/join` code field got the same attributes. New e2e test
  checks the attributes and that `ab12cd` types as `AB12CD` at 390px; it fails on the old component.

### Fixed

- `/connect/discord`: the optional "roles" consent checkbox rendered as a stray empty box with its text underneath (a
  wrapping `ui-row`). Both consent rows now use the one-line `lv-check-row`; a new e2e test measures that the text sits
  beside the box at 1100px and 390px, and fails on the old markup.

### Added (community guidelines, founder-approved 2026-11-08 "publish it")

- `/guidelines` page (seven rules incl. respect anonymity, Hub owner duties, reporting, what we may do incl.
  suspension, appeals by email), linked from the footer, Terms, the Create Hub step ("By creating a Hub you agree…") and
  above every comment thread; route, SEO entry, prerender and `render.yaml` rewrite. It keeps the "legal text pending
  review" banner until a lawyer has read it. The Builder "House rules" starter page is not built yet.
- `supabase/migrations/000026_v2_reserve_platform_pages.sql` + rollback: reserves `guidelines`, `terms`, `privacy`,
  `about`, `status`, `how-it-works`, `use-cases`, `whitelist` so no Hub can claim a name a platform page answers. Built,
  not yet applied to production (needs the founder's approval, together with 000025).

### Changed (000025, built and tested, NOT yet applied to production)

- `supabase/migrations/000025_v2_suspended_participation.sql` + rollback: a suspended account can no longer answer
  Campaigns or join Hubs (founder decision 2026-11-08, reversing the 000023 default). Enforced by table triggers on
  `lv.participation` and `lv.hub_memberships` (`lv_suspended`), so the API and the Discord bot are covered. The account
  can still sign in, read, leave Hubs, delete its Hubs and itself; nothing is deleted. Suite 23 updated and extended
  (1197 checks, 0 failed, full rollback rehearsal). Staff notices and `/admin` copy updated. Needs the founder's
  approval before production apply.
- Discord bot: the Interactions Endpoint URL was accepted by Discord (founder, 2026-11-08); slash command `/lunchvoice`
  registered via a one-time random `EMAIL_DISPATCH_SECRET` created in Supabase (value not retained).

### Operations (2026-11-08, founder-approved: "merge it both you do everything")

- **Production:** migrations 000023 (staff panel) and 000024 (API, webhooks, Discord) applied to `qprfonxvthmaoxfixigk`
  one at a time from commit `81a7deb` (file hashes verified; 000023 `844b98ba…`, 000024 `d6c8b7d8…`), after a rehearsal on a
  seeded 000022 database. Migration history versions normalized to `000023` / `000024`. Post-apply audit matched the
  rehearsal: 139 `lv_api` functions, the same 13 callable signed out, nothing in `lv` granted to `anon`/`authenticated`,
  RLS on every `lv` table, data unchanged (3 accounts, 3 Hubs). PR #52 merged to `main`.
- **Edge Functions `api`, `discord`, `webhook-dispatch` deployed** (v2, `verify_jwt=false`) from single-file Deno bundles
  with a small Node-globals shim (`Buffer`, `process`, `setImmediate`): the Management API deploy cannot take an import
  map, and the bundled database driver needs `Buffer` (the first deploy crashed with `Buffer is not defined`). Live
  checks: unsigned Discord request 401, `/v1` without a key 401, unknown key 401 "Invalid API key" (database reached),
  `webhook-dispatch` without service auth 401.
- `discord` gained a service-role-only `POST /discord/register` that bulk-registers the slash commands using the bot token
  held in the function's secrets, so the token never leaves Supabase.

### Added (LunchVoice API, webhooks and Discord bot, 000024 — not yet applied to production)

- `supabase/migrations/000024_v2_api_discord.sql` + rollback + `supabase/tests/24_api_discord.sql`: Team-only Hub
  API keys (SHA-256 hashed, scoped, rate-limited, revocable, `api.manage` capability), signed webhooks
  (`campaign.published`, `campaign.closed`, identified-only `campaign.responses_milestone`; bodies never logged),
  Discord account links (one-time hashed codes, consent version, the Discord id is never an identity key),
  server-to-Hub connections, per-server role rules with separate role-fact consent, and D-01 (anonymous Campaigns
  are answered only in the LunchVoice player, enforced in the database too). Reserved routes `developers`,
  `connect`, `webhooks`.
- Integration fix: 000024's suspension hook now calls 000023's `lv.hub_suspended` / `lv.account_suspended` (it had
  probed for names that do not exist, so a suspended Hub's keys would have kept working); suite 24 now suspends
  through the real `lv.hub_suspensions` table and checks that lifting it restores the key.
- Edge Functions `api` (`/v1`), `discord` (Ed25519 interactions, fails closed without `DISCORD_PUBLIC_KEY`) and
  `webhook-dispatch`; `scripts/discord-register-commands.mjs`. `_shared/discord.ts` casts its WebCrypto inputs to
  `BufferSource` so `deno check` passes. Local smoke run: unset key 503, signed PING 200 `{"type":1}`, forged
  signature and tampered body 401.
- UI: Hub Settings General/API/Discord tabs, Account Settings Discord card, `/connect/discord`, `/developers`.
- Checks on the merged tree (000023 + 000024): canonical DB 1195/0 with full rollback, functions 84/84, unit
  36/36, e2e 71/71, `test:pr` green, `deno check` clean for `api`, `discord`, `webhook-dispatch`.

### Added (staff panel, 000023 — not yet applied to production)

- `supabase/migrations/000023_v2_staff_panel.sql` + rollback + `supabase/tests/23_staff_panel.sql` (90 checks):
  staff add/revoke by verified email only (recent sign-in required, no self-revoke, last admin kept, audited);
  Hub and account suspension with a required reason, enforced by `lv.assert_not_suspended` row triggers on 17
  content tables (deletes, leaving, reading and answering stay allowed; nothing is deleted; suspended Hubs leave
  Discover); one reports queue for survey and comment reports (reporters never returned); Hub/account lookup (exact
  email only, audited reveal); audit viewer without detail payloads. New error code `lv_suspended`. Every
  `lv_admin_*` function is gated by `lv.admin_denied()` and granted to `authenticated` only.
- `/admin` moved to `src/pages/Admin.tsx` with Overview/audit, Reports, Hubs, Accounts, Staff, Waitlist, Discover,
  Billing and Email tabs; staff entry in the account menu; suspension notices for Hubs and accounts; mock and
  `e2e/staff.test.mjs`. Canonical DB suite 1093/0 with rollback rehearsal, e2e 66/66, unit 29/29.

### Added (plan)

- `docs/v2/API_AND_DISCORD_PLAN.md`: Team-only LunchVoice API (scoped Hub keys, `/v1`, signed webhooks, suppression
  preserved) and the official Discord bot (account link, posting Campaigns, D-01: anonymous Campaigns answered only in
  the LunchVoice player, per-server role rules such as Founding member). No customer is special-cased.

### Operations (2026-11-08, staff)

- Granted platform admin (staff) to the founder's two accounts, "Kpn" and "Game World", via
  `lv.grant_platform_admin` at the founder's request; `/admin` is now available to them.

### Fixed and changed (UX polish pass)

- Production bug: Hub colour swatches rendered blank because `lv_hub_get` returns the palette as `{key,label,hex}`
  objects and the UI painted the objects; the stored accent is a key. `src/lib/accent.ts` resolves key to hex
  everywhere (Hub header, cover, Builder preview, Discover cards); the mock now returns the SQL shape.
- Hub Settings: Reddit-style "Community appearance" editor (labelled swatches with a check, live preview of banner,
  Hub mark, Join button, tabs and a Campaign card; Save/Reset with save state). The accent applies only to the Hub's
  own pages, never to LunchVoice chrome.
- Owner walkthrough fixes: Questions panel no longer shows under other Studio sections; member roles in one menu with
  remove confirmation; revoked invite codes disappear and invites can be emailed; role names keep their casing,
  roles can be edited and deletion asks first; Discover shows a requirements checklist; Hub settings show save state;
  a fresh Hub shows a getting-started card; Builder/Newsroom visibility labels; thank-you screen contrast.
- Poll quick-create (one Single choice question, two empty options, Question focused, poll summary in Review);
  Rating and Feedback starters.
- Respondent player motion from the design tokens only: direction-aware question transitions, gliding progress,
  jelly on choice, spring-filled rating circles with a word per value, staggered welcome, drawn check and a CSS burst
  on thanks; all instant under reduced motion. Creator side: count-up metrics, growing result bars, copy pop, a live
  response counter that never shows a withheld count as a number.
- Tests: unit 29/29, e2e 59/59 (13 new). JS +5.4 kB gzip, CSS +1.8 kB.

### Operations (2026-11-08)

- Billing paused at the founder's request: `billing.provider_ready` back to false (open 07:52-15:41 UTC; one checkout
  session was started, no charge was made; the open Stripe session expires on its own). The paid path was proven up
  to Stripe: a server-created session for exactly $13.00 with automatic tax. Stripe Tax is active (head office set);
  webhook destination enabled with the six events; secrets set; all four Edge Functions deployed from main
  (`session` v3 with LC-13 replay protection).
- F-14: KpnWorld listed on Discover by founder override (public, Team granted, approved entry with its real
  genuine-member count, recorded as a founder decision and in the audit log).

### Operations (production, 2026-11-08)

- Stripe (live account "Lunchvoice"): products `lv_starter_hub`, `lv_team_hub`, `lv_campaign_starter`,
  `lv_campaign_plus`, `lv_hub_reservation` with seven USD tax-exclusive prices at the canonical amounts (lookup keys
  `lv_*`), and the default Customer Portal configuration (cancel at period end, no proration, payment methods,
  invoices; no plan switching or promotion codes). Stripe Tax is pending the founder's head office address.
- Applied 000018-000022 to production under the founder's approval after the gate was met (0 BLOCKER, 0 HIGH).
  Rehearsed first on a database holding 000001-000017 plus production-shaped data (accounts, Hub, personal space,
  Quick Surveys, a hashed invite, waitlist): all applied, link tokens backfilled, the founder's context still works.
  Files hash-verified from `33cf4a7`; 000018 applied and verified alone before 000019-000022. Migration history set
  to 000018-000022. Grant audit: 109 `lv_api` functions, 13 signed-out (as reviewed), nothing PUBLIC, no `lv`
  reachability, RLS everywhere, every definer function pins `search_path`.
- `billing.stripe_prices` holds the Stripe price IDs; `billing.provider_ready` stays false (no checkout yet).
- #47 merged and deployed; 12 live routes (incl. /discover, /reserve) with zero CSP violations; sign-in reads
  "Continue with KpnSolute". Edge Functions `session` (LC-13), `billing-webhook`, `checkout`, `email-dispatch` await
  a CLI deploy by the founder (the Composio deploy tool cannot set `verify_jwt` or an import map).

### Fixed (SEO: public pages served a static noindex)

- Production check: with the Render dashboard rule changed to `/* -> /app.html` but the per-page rules missing or
  below it, every public page was served `app.html` with a static `noindex`, which lets Google drop the page without
  running the app. `app.html` now carries no static robots, canonical or `og:url`; `src/ui/Seo.tsx` sets `noindex` at
  runtime for every path not in `seo.json`, and `robots.txt` still keeps private routes out of crawls. Verified in a
  browser under the live rule set and under the `render.yaml` rules.

### Fixed (SEO: every URL declared a copy of the home page)

- Production check after #48: the Render service's rewrite rules live in its dashboard and still send every path to
  `/index.html`, so `/pricing`, other public pages and every Hub URL were served the landing HTML with a static
  canonical to `/` and `index`. `dist/index.html` now carries no static canonical, robots or `og:url`; `src/ui/Seo.tsx`
  sets them per path at runtime. Safe under both the dashboard rule and the `render.yaml` rules (verified in a browser
  against both). Owner step to mirror the `render.yaml` rules in the dashboard added to `docs/frontend/SEO.md`.

### Added (search engine optimisation)

- Public pages are now readable by search engines and link previews without JavaScript. `src/config/seo.json` is the
  single source of page metadata; `scripts/seo-prerender.mjs` (part of `npm run build`) writes a prerendered HTML file
  per public page (own title, description, canonical, Open Graph/Twitter tags and a static content fallback in
  `#root`), plus `sitemap.xml`, `robots.txt` and `app.html`, the `noindex` shell for all other routes.
- `render.yaml` rewrites the ten public pages to their prerendered files before the catch-all, which now serves
  `app.html`. Account, sign-in, Quick Survey, respondent, invite and every Hub route stay `noindex`; Hubs are never
  indexed (listing them is the Discover feature's job).
- `src/ui/Seo.tsx` keeps title, description, canonical and robots in step on client-side navigation.
- `index.html`: real title and description, canonical, full Open Graph and Twitter card tags, Organization, WebSite
  and SoftwareApplication structured data (JSON-LD data block; the theme script and its CSP hash are unchanged), web
  manifest. New `public/og-image.png` (1200×630), `public/site.webmanifest`, `public/app-icon-512.png`.
- `scripts/seo-prerender.test.mjs` (in `test:pr`) checks pages against `routes.json`, title and description length,
  `render.yaml` rewrites and the CSP hash. Owner steps (Search Console, Bing, canonical host) are in
  `docs/frontend/SEO.md`.

### Compliance (feature-complete gate met)

- Targeted re-review at 8f2feb0: FB-01 closed (attack refused in both directions; forced rows blocked at activation),
  FB-02/04/05 closed; 0 BLOCKER, 0 HIGH. FB-06 (one newly admitted member between two Hub-wide anonymous Campaigns)
  accepted as LOW for launch with a public FAQ disclosure ("Can totals ever reveal one person?"); the structural fix
  (freeze the audience at activation, withhold results across anonymous Campaigns differing by 1-4 members) is
  scheduled after launch. Remaining: LC-08 legal operator name (founder), accepted MEDIUM/LOW items.
- Full e2e suite 46/46; canonical suite 1003 checks, 0 failed.

### Security (FB-01, 000022)

- Full-build compliance re-review found one HIGH (FB-01): two anonymous Campaigns targeted at overlapping roles
  that differ by one member let the creator difference out that member's answer. Role targeting is now for
  identified Campaigns only: a trigger refuses an anonymous, role-targeted Campaign (setting roles on an anonymous
  draft, or switching a role-targeted draft to anonymous, answers `lv_not_available` with an explanation) and the
  activation gate adds `role_targeting_anonymous`. Track A's tests now target roles on identified Campaigns. New
  suite `22_anonymous_role_targeting.sql` (9 checks, including the reproduced attack). The Studio disables
  "Specific roles" on anonymous Campaigns and "Anonymous" while roles are chosen, each with the reason; the mock
  follows the same rule.

### Fixed

- Founder bug report: a new question with options but no question text never saved and the editor did not say why
  (the example placeholder looked like real text). The Question field now has a neutral placeholder and shows
  "Type the question text to save this question." as soon as options are entered; the outline says
  "Not saved yet: type the question text". E2e test added.
- Sign-in button reads "Continue with KpnSolute" (KpnSolute account; Google is one way to sign in to it); the
  waitlist page says the same.
- FB-02: `/privacy` lists community data, payments (Stripe), service emails and their 30-day retention, the
  Discover listing, and Stripe and Resend as processors. FB-04: the leaderboard opt-in says anonymous Campaigns
  count too. FB-05: invite emails say who sent them and how to report abuse (function test added).
- Full-build compliance re-review merged into `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` §8.

### Security and gaps (full build: track A; 000018)

- LC-10: every Campaign has a 128-bit link token for links and QR codes; failed join-code lookups are rate-limited
  per caller and globally. LC-11: guest keys from `crypto.getRandomValues`. LC-12: the database requires
  `aud = authenticated` and `session_kind = lunchvoice` (the deployed `session` function already issues both, checked
  in its deployed bundle). LC-13: single-use ID-token exchange and a 10-minute `iat` limit in `session`. LC-14: strict
  return-path checks (react-router has no fixed 6.x; mitigated). LC-30: bundle check forbids key and secret
  patterns. LC-37: the More sheet is a real modal. NEW-05: Campaign invite tokens stored hashed.
- Gaps closed: Campaign description; server-side option validation; Quick Survey access change while draft; Team
  role targeting (eligibility and thresholds count only role holders); `lv_hub_limits` for managers; new-question
  save race; owner transfer is now an offer the member accepts or declines.

### Fixed (integration)

- Roles page read `custom_slots` as a number, but `lv_role_list` returns `{ used, limit }`: on production the slot
  meter showed an object and "all slots used" never triggered. Types, mock and page now follow the SQL shape.
- An unsaved new question was lost when switching Studio sections; the Questions workbench now stays mounted.
  New e2e test confirmed to fail without the fix.

### Verification (all tracks)

- Canonical suite through 000021: 994 checks, 0 failed, races and full rollback. Function tests 60/60, unit 26/26,
  e2e 44/44, `test:pr` and high-severity audit clean; every UI API call matches its SQL signature.

### Added (full build: track B commerce, email and admin; 000019)

- Stripe-ready checkout end to end: `checkout` Edge Function creating server-side Checkout Sessions (subscriptions
  for Hub plans; Campaign plans as first period + extra weeks so the subtotal equals the intent amount; automatic tax;
  no promotion codes), Customer Portal, `lv_billing_config`, renewals and period-end cancellation in the webhook
  (NEW-01 guarantees kept), Hub Name Reservation purchase and renewal at `/reserve`. Fails closed until the founder
  sets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs and `billing.provider_ready`.
- Transactional email outbox and `email-dispatch` (Resend when `RESEND_API_KEY` is set; otherwise queued) with
  templates E01-E08; never an answer in mail; receipts only for identified Campaigns; deleted with the account.
- Platform admin console `/admin` (waitlist without emails, abuse reports, Campaign block, Discover decisions,
  billing events, outbox); every admin function refuses non-admins.

### Added (full build: track C community and Discover; 000020)

- Custom pages with safe limited markdown and members/public visibility; Newsroom (drafts, publish, pin; public posts
  only on public Hubs); Comments with report, hide and delete moderation and rate limits; opt-in Leaderboard counting
  ended Campaigns only; optional Hub points and a Shop with manual fulfilment (no cash value); public `/discover`
  directory of approved Team Hubs with rounded member counts. Builder add-ons are real (no more "Coming with M2").
  Every community operation refuses personal spaces; guests never post, comment, order or rank.

### Added (integration; 000021)

- A fulfilled shop order queues one E08 email to the member's verified address (placed/cancelled send nothing).

### Verification

- Canonical suite through 000021: 881 checks, 0 failed, races and full rollback rehearsed. Function tests 54/54,
  unit 23/23, e2e 30/30, `test:pr` and high-severity audit clean; 95 UI API calls match their SQL signatures.

### Operations (live verification, 2026-11-07)

- Security headers (LC-04) are live on lunchvoice.com (set in the Render dashboard because the static site is not
  Blueprint-managed): CSP, HSTS, nosniff, referrer and permissions policies, frame blocking. With the CSP active, 10
  live routes load with zero violations and the sign-in redirect to auth.kpnsolute.com works.
- Founder sign-in verified on production: one account, one identity, no duplicate identity pairs; waitlist admission
  granted one Founding credit, consumed once by the founder's Hub (Starter / founding / waitlist, protected Owner).
- UI correction pass (#45) deployed.

### Added (full build plan)

- `docs/v2/BUILD_PLAN_2026-11-21.md`: definition of done for feature-complete (2026-11-21) ahead of the 2026-12-01
  launch, three parallel full-stack tracks (hardening and gaps, commerce/email/admin, community and Discover) with
  migration numbers, ownership rules and build decisions B-01, B-02, C-01, C-02.

### Changed (UI/UX correction pass)

- Hub overview: the stat row is one responsive grid; plan names ("Starter") never wrap per character; the Plan tile is
  a raised card with an amber edge instead of a full orange card, so activity stays primary. The share card states the
  real join mode (open / approval / invite only), shows the full address without clipping, and offers Copy link, QR
  code and Invite (for people who can admit members).
- Campaign Studio rebuilt as Details | Questions | Audience | Schedule | Review with free navigation, a lifecycle
  badge, autosave state, Preview from the draft (no submission) and a lifecycle-derived action (Schedule or Publish
  from draft; Pause, Resume, Close, Archive afterwards; never Publish once live). Publish is disabled with an
  accessible explanation until the Review checklist passes; the server still re-validates and its errors are shown.
- Questions: one Add question; choice options as editable rows (add, remove, reorder by drag or keyboard, 2-10);
  a Required switch mapped to `config.optional`; type changes that drop options ask first.
- Audience, response identity (anonymous / identified) and guest responses are three separate controls; only
  options the backend supports are offered.
- Schedule section (start now or later, end never or later, end after start) with real plan limits from the API.
- Error copy uses the backend's field-specific messages; "Some details need fixing." is only a last resort.
- Quick Surveys keep their single-page flow (Title, Questions, Who can respond, Publish) and share the question editor.
- Review summary labels and values no longer overlap at 390px.
- `npm run test:e2e` (Playwright against the dev mock; not part of `test:pr`): 11 tests covering the corrections,
  including a painted-text overlap check that fails on the old layout. Dev dependency: `playwright`.

### Fixed (Campaign first-question autosave)

- Campaign Studio and Quick Surveys now create the first question at position 1, matching the database constraint that question positions must be greater than zero. This fixes the production autosave error that left a valid first question unsaved with “That value is not allowed.”

### Operations (production, 2026-11-07)

- Applied 000014-000017 to the LunchVoice production project (`qprfonxvthmaoxfixigk`) under the founder's
  conditional approval (F-13) after the gate was met. Pre-checks passed (chain 000001-000013, no data, no slug
  conflicts); backup 2184898828 recorded; files hash-verified from `e375fca`. Migration history versions set to
  000014-000017. Grant audit A-F and policy values matched the runbook exactly.
- Exposed `lv_api` through the Data API (`public,graphql_public,lv_api`; `lv` stays private). This fixes the HTTP 406
  that blocked every app call after sign-in. Signed-out smoke: `lv_my_context` answers `lv_unauthenticated`,
  `lv_waitlist_status` shows 50 open seats, `lv_plan_limits` is public, signed-in functions are refused (401).

### Compliance (launch gate met)

- `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` §7.7: targeted re-review at 5c665e1 confirms 0 BLOCKER and 0 HIGH
  open (NEW-01 reproduced and refused; NEW-02, NEW-06, NEW-08, LC-31, NEW-03, NEW-04, NEW-07 closed). Open: 4 MEDIUM
  (LC-10, LC-12, LC-13, LC-14) and 5 LOW, each with an owner.

### Security (000017 billing hardening)

- NEW-01 (HIGH): `lv.billing_apply_event` grants only for a matching checkout intent with `payment_status` paid (or no
  payment required), currency `usd` and `amount_subtotal` equal to the intent's amount; product, account, Hub, slug
  and weeks come only from the intent. `checkout.session.async_payment_succeeded` is handled; unpaid sessions grant
  nothing. Fixed-price links can no longer over-grant Campaign weeks.
- NEW-02: refunds follow F-08 (partial refunds never revoke; full refunds revoke only unused credits, unstarted
  windows and reservations; Hub subscriptions keep access to the end of the paid period).
- NEW-06: questions marked optional may be skipped by members and guests; required ones may not.
- NEW-08: waitlist seats are never re-issued after an account is deleted (at most 50 Founding grants ever).
- LC-31: the error-contract test uses a synthetic slug.
- Canonical suite: 660 checks, 0 failed, rollback of 000014-000017 rehearsed. Function tests: 24 pass.

### Fixed (compliance re-review, UI side)

- NEW-03: the account-deletion copy no longer promises to delete anonymous written answers (they were never linked to
  the person and cannot be found); it states what is deleted and what stays.
- NEW-04: `/privacy` adds who can see stored data (operator access), provider request logs, the US data region and a
  children statement (not directed at children under 13; schools through adult administrators).
- NEW-07: CSV export neutralises spreadsheet formulas in cells.
- `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` section 7: reconciliation of all 41 original findings on the
  integrated branch (every original BLOCKER and HIGH closed) and new findings NEW-01 to NEW-08.

### Added (launch backend: migrations 000014-000016)

- 000014: one entitlement map (`lv.plan_limits`, products incl. Campaign Plus at 3900 + 1900/week), entitlements and
  Hub credits (`lv_hub_create` consumes a credit; no beta gate), Founding entitlements ending 30 days after
  `billing.launched_at`, the 50-seat waitlist (race-safe; consent version for the optional email; never
  authorization), personal spaces and Quick Surveys (link or invite-only, 5 slots, archive frees a slot, 20 creations
  per hour), the survey threshold gate, fail-closed expiry, `lv_report_abuse` and admin block, explicit grants with an
  anon allow-list and RLS on every table (LC-05), reserved slugs synced with every UI route (LC-24).
- 000015: Hub update/branding, owner transfer, Hub delete with a 30-day slug quarantine and `lv_hub_gone` (LC-27),
  Hub pages, profile update, account delete with irreversible unlinking and free-text removal (LC-16), recent sign-in
  required for destructive actions (LC-22).
- 000016: checkout intents (fail closed), idempotent service-role-only `lv.billing_apply_event`, billing summary,
  Hub Name Reservation lifecycle, strict analytics engine `lv.safe_cells` (LC-01, LC-02), free text only at 5+ in
  random order, export, Discover gate, retention sweep.
- `billing-webhook` Edge Function (Stripe signature check, 503 without the secret) with tests; runbook rewritten for
  the real production state (LC-07), including exposing `lv_api` only after the grant audit.
- Canonical suite: 628 checks, 0 failed, slug and waitlist races, full rollback rehearsal. Function tests: 21 pass.

### Fixed (UI aligned to the real backend)

- `lv_waitlist_join` now receives `p_intended_hub_name` (it was sent as `p_note`, which the Data API would reject);
  `lv_checkout_start` passes `p_slug`; a fully withheld question renders as Withheld, never as "no answers"; the
  merged withheld cell's `null` key is handled; `lv_reauth_required` has copy. Every UI RPC call (59) was checked
  against the SQL signatures by argument name: 0 mismatches.

### Security (LC-04)

- `render.yaml` sets production headers on every path: a Content-Security-Policy built from the app's real runtime
  origins (self, the Lunchvoice Supabase project, the KpnIdentity issuer; the theme pre-paint script pinned by
  sha256; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`), HSTS (1 year),
  `nosniff`, `strict-origin-when-cross-origin`, a restrictive Permissions-Policy and `X-Frame-Options: DENY`.
  Verified against a production build served with these headers: 10 routes and the sign-in redirect to KpnIdentity
  ran with zero CSP violations. Must be re-verified on the live site after deploy.

### Added (launch UI on the shadcn layer)

- One UI system: shadcn components (button, inputs, select, checkbox, radio, switch, tabs, dialog, alert-dialog,
  sheet, menus, popover, tooltip, toasts, badge, card, table, skeleton, progress, accordion, avatar, scroll-area,
  input-otp, alert) restyled to the tactile tokens, plus composite blocks (QuotaMeter, ResultBars with one striped
  withheld bucket, TypedConfirm, QrCode, Notice, EmptyState). `src/components/ui.tsx` is now a thin wrapper over it.
- Launch journey: landing with the waitlist section, `/waitlist` (and `/whitelist` redirecting to it), `/me`
  dashboard, Quick Surveys (`/surveys`, editor, results, `/s/:token` invites) with link, client-side QR and join code,
  `/create` stepper on Hub credits, the rebuilt Hub workspace (overview, Campaigns, Studio, results, members, invites,
  roles, settings with owner transfer and delete, Builder pages, billing, reservation, Discover) and the player.
- Respondent copy derives from the Campaign's settings (LC-03); "Report this survey" on every respondent screen;
  blocked Campaign and "This Hub is no longer available" states.
- `/privacy` plain-language data summary (stored data, anonymity, guests, browser storage keys, subprocessors,
  retention, deletion), `/support` and footer contact (`src/config/contact.ts`, address to confirm), legal operator
  placeholder (LC-08). Reserved slugs gain `how-it-works`, `use-cases`, `whitelist`, `waitlist`, `signup`, `surveys`,
  `s`, `c`, `j`, `brand`, `licenses` (LC-24, UI side).
- Pricing: the founder's capability table, Campaign Plus at $39 for 2 weeks + $19 per week, tax, cancellation and
  refund notes; checkout disabled with a reason.
- Typed `lvApi` and dev-only mock for every launch operation; new error copy (`lv_entitlement_required`,
  `lv_billing_unavailable`, `lv_hub_gone`, `lv_confirmation_mismatch`, `lv_not_available`).
- Dependency: `qrcode` (client-side QR, own chunk). The Hub workspace and Quick Surveys are lazy route chunks
  (JS 238.7 kB gzip in total).

### Changed (founder final decisions, 2026-11-07)

- Campaign Plus is priced: $39 for the first 2 weeks, $19 per additional week (master spec 11.5, `AGENTS.md`,
  `CLAUDE.md`, `LAUNCH_PLAN.md`).
- Master spec gains 11.0 Free Quick Survey (personal space, limits, access modes) and the waitlist rule in section 12.
- `LAUNCH_PLAN.md`: "whitelist" is now "waitlist" and never authorization; founder decisions F-01 to F-13 (strict
  anonymity, deletion with free-text removal, 30-day slug quarantine, abuse brakes, refunds and cancellation, Stripe
  Tax, minors, legal operator, conditional production approval) and the BLOCKER/HIGH-zero launch gate.

### Added (launch compliance review)

- `docs/v2/LAUNCH_PLAN.md` records decisions L-07 to L-14 taken with Jev on the review's founder questions, and lists
  the decisions that stay with the founder (refunds, Campaign Plus price, minors, legal review, production approval).
- `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md`: privacy, security, payments-readiness, policy, legal-surface and
  accessibility review of the launch plan and current code (1 blocker, 7 high, 21 medium, 12 low), a reusable
  re-review checklist and the founder decisions needed. Findings are assigned to the backend and UI work in progress.

### Added (launch plan)

- `docs/v2/LAUNCH_PLAN.md`: the founder direction of 2026-11-07 (free Quick Surveys, 50-seat whitelist launch with a
  free Founding Starter entitlement), the decisions taken for the founder with Jev (L-01 to L-06), architecture
  decisions A-01 to A-05, the launch definition of done, the roadmap and the API contract the backend and UI build to.
  `AGENTS.md` and `CLAUDE.md` point to it.

### Added (shadcn/ui on the design system)

- Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`) and shadcn/ui (`components.json`, Radix, Nova style), with the
  `@/` import alias in `tsconfig.json` and `vite.config.ts`. New runtime dependencies: `radix-ui`,
  `class-variance-authority`, `cn` (shadcn's class merger), `lucide-react`, `tw-animate-css`; `shadcn` is a
  dev dependency (its `tailwind.css` is only read at build time).
- `src/ui/shadcn.css` maps every shadcn variable onto the `--lv-*` tokens, so components follow light, dark and high
  contrast with no per-theme block. It imports no preflight, scopes its reset to `[data-slot]`, and Tailwind scans
  only `src/components/shadcn/`: scanning the whole app generated `container`, `grid`, `hidden` and `table` utilities
  from existing class names. `--muted` is left to `index.css` (muted text); shadcn's muted surface maps to the well.
- First component: `src/components/shadcn/button.tsx`, shown in the dev-only gallery (`/__gallery`). Checked in the
  browser in all three themes; the landing page still has no horizontal scroll at 390px.
- `docs/frontend/FRONTEND.md` documents how to add components and the rules above.

### Added (shadcn MCP server)

- `.mcp.json` registers the shadcn MCP server (`shadcn mcp init --client claude`) so agents can browse, search and get
  add commands for shadcn registry components. Pinned to `shadcn@4.23.0` and started with `npx`; it is not a project
  dependency (the init's devDependency and 218-package lockfile change were dropped). The project has no
  `components.json` yet, so adding components still needs a deliberate shadcn setup first.

### Changed (Campaign Studio)

- Campaign Studio rebuilt as three panes: a numbered questions outline, an editor (prompt and options save when you leave a field) with a live respondent preview, and a Share panel (link, join code, QR placeholder, facts). On phones it is one pane at a time with Outline, Edit and Share tabs. Published Campaigns stay locked and say so.
- In dark mode, amber is no longer used as text on the surfaces that turn light.

### Added (route registry and participant pages)

- `src/config/routes.json`: one entry per route (layout L1 to L11, shell, access, milestone) from the Core Routes map, and `scripts/check-route-layouts.mjs` (in `test:pr` and `test:light`) which fails when a route has no entry or an entry has no route. Tested in `scripts/check-route-layouts.test.mjs`.
- Participant Hub shell (L10): a Hub cover (mark, name, address, visibility) for visitors and for the add-on pages. The six M2 pages (`/:hub/shop`, `leaderboard`, `news`, `news/:post`, `comments`, `p/:page`) exist as honest "Coming with M2" states.
- Hub Builder (`/:hub/builder`, owner): page toggles with a participant tab preview. Saving is disabled and says why (`lv_hub_pages_update` is not available yet).

### Added (respondent player)

- Respondent player rebuilt to the design (L9): welcome with promises (anonymity, skip anything, time), one question per screen with a segmented progress bar and Skip, a review screen with Edit, and a thanks screen. Bare surface: no app header, no signature, Powered by LunchVoice at the foot. Drafts still resume; offline shows a banner and holds the Submit until you are back online.
- Accessible question controls (`src/ui/QuestionControls.tsx`): rating circles, yes/no tiles, single and multi choice with a max-N message, and open text with a counter. Radiogroups use a roving tabindex with arrow keys; selection is the pressed amber surface plus a glyph; jelly motion respects reduced motion.
- `StateScreen` (L11) for not found, error, closed, scheduled, ineligible, offline, empty and loading, in plain words with a next step.

### Changed (v2 UI screens)

- Account home (`/me`) rebuilt to the design: greeting, stat tiles, a "pick up where you left off" card, My Hubs rail with Hub marks, join shortcut. Only data the API provides is shown (no invented streaks or badges).
- Signed-in header pills (Home, Join, Create, Settings) on desktop; shared `BottomTabs` on phones for account and Hub routes: solid surface, no blur, 52px targets, the current tab is the pressed amber surface with `aria-current`, and a More sheet holds the extra Hub sections. The old blurred bottom nav is gone.
- Hub overview is the dashboard layout: live Campaigns, members and roles tiles, an All Campaigns list with phase badges, a People rail for managers, and the share panel. The Hub header shows the Hub mark; the segmented tab strip is desktop only.
- New icons (settings, join, more, back, globe, clock).

### Added (v2 UI foundations)

- `src/ui/tokens.css`: the design system's tokens (core v1.1) as the single source, with light, dark and high-contrast themes selected by `data-theme` on `<html>`. The older variable names in `index.css` now map onto these tokens, so every existing page gains dark and high contrast without per-page CSS.
- `src/ui/theme.ts`, `ThemeControl` and a pre-paint script in `index.html`: Appearance in Settings (System, Light, Dark, High contrast), saved on the device only, no flash of the wrong theme. Selected is the pressed amber surface; the group is a radiogroup with arrow-key navigation.
- Self-hosted fonts (Bricolage Grotesque, Geist, Space Mono; latin and latin-ext only) replace Google Fonts; OFL licence texts ship in `/licenses`. The page now contacts no third-party host.
- `src/ui/ui.css` (shared primitives; first is the segmented control).

### Fixed (v2 UI foundations)

- The landing page scrolled sideways at phone and tablet widths; it no longer does (checked at 320 to 1600 px on 14 public routes).
- The hero eyebrow, step and plan icons and empty-state icon used the on-amber ink colour as foreground on the page, which disappeared in dark mode; they now use the page ink.
- Hard-coded surface colors in `index.css`, `system.css` and `landing.css` now use tokens.

### Added (KpnIdentity sign-in)

- `supabase/functions/session/deno.json`: the function's own import map, so the Supabase deploy bundles `jose` (the shared `supabase/functions/deno.json` is not read by the deploy).

- `[functions.session] verify_jwt = false` in `supabase/config.toml` so redeploys keep the function reachable before sign-in; setup guide records the LunchVoice OAuth client id and the KpnIdentity issuer.

- Real sign-in: **Continue with Google** redirects to KpnIdentity (Supabase Auth OAuth 2.1 server) with
  PKCE S256, state and nonce; `/auth/callback` exchanges the code for an ID token and the new `session`
  Edge Function turns it into a one-hour LunchVoice session with the same `(issuer, subject)`.
- `session` Edge Function: verifies signature (KpnIdentity JWKS, ES256/RS256 only), allow-listed issuer,
  audience, expiry, UUID subject and nonce before anything else; fails closed when unconfigured.
  Tested with `npm run test:functions` (now part of `test:pr`).
- `docs/v2/KPNIDENTITY_SETUP.md`: the flow and every setting it needs. Expired sessions are dropped on load.

### Fixed (tactile surfaces after the handoff pass)

- Price cards were left flat white with a hairline while every other surface moved to the raised gradient, and display
  text asked for weight 900, which the Bricolage variable font clamps to 800. Cards now use the raised surface at the
  28px hero radius and display weight is stated as 800 everywhere.
- The reservation lifecycle on an ink panel needed light rules; it now has that override instead of invisible borders.
- `.commit-msg` is ignored so a temporary commit message can never be committed again.

### Changed (adopt the v2 design handoff's type and tactile layer)

- Type now comes from the v2 design handoff (`tokens/lunchvoice-tokens.css`, `ASSET_MANIFEST.md`): **Bricolage Grotesque**
  for display at weight 800 with -0.045em tracking and 0.88–0.96 leading, **Geist** for UI and body, **Space Mono** kept for
  labels, codes and numbers. Fraunces and Space Grotesk are gone. Fonts load from Google Fonts for now; the manifest asks for
  self-hosting before launch, which is a dependency change and is not done here.
- Adopted the handoff palette and radii: page `#EEEDEA`, line `#DAD8D4`, well `#E9E8E5`, ink gradient `#2E2A25 → #14110F`,
  accent `#FF9A18` with `#E98207` deep, fields at 16px, cards at 24px, hero at 28px.
- Adopted the tactile surface layer everywhere: raised gradient cards with an inner top light, pressed amber CTA
  (`#FFBE5C → #FF9A18 → #F58C0C` with the three-layer shadow), ink-gradient primary buttons, inset wells for inputs,
  segmented tabs with a raised thumb, and spring press motion (`cubic-bezier(.34,1.56,.64,1)`).
- Landing hero rebuilt to the handoff's `7d` treatment: floating pill nav, marker-highlight phrase instead of the italic
  accent, and a "Have a join code?" well card linking to `/join`. The v1 layer (grain, ticker, ghost numerals, reveal)
  stays and matches the handoff's landing.
- Documented the source of the tokens in `index.css` so the next agent can trace them.

### Added (v1 design DNA, and the last UI phases)

- Marketing surface now carries the retired v1 visual language instead of a plain landing: paper grain (SVG turbulence,
  no asset), the amber mono ticker band, amber italic display accent in the hero, a hero gradient with a citrus glow,
  oversized ghost numerals on the how-it-works steps, hover-lift cards, ruled section eyebrows and scroll-reveal in
  `src/pages/Landing.tsx` + `src/styles/landing.css`. Reveals are skipped under `prefers-reduced-motion`.
- Typography hardened: `preconnect` for `fonts.gstatic.com`, hero scale that fits its column at every width, and a
  mobile marketing nav (the desktop links become a scrollable strip) instead of hiding navigation below 720px.
- Full-width sticky marketing header aligned to the 1120px column, at 96% opacity so content cannot bleed through it.
- `src/pages/Pricing.tsx` rebuilt as a real surface: all six canonical plans, the Starter/Team entitlement table, the
  two Campaign windows (Plus stays unpriced), and Hub Name Reservation with its ACTIVE → GRACE → RELEASED lifecycle.
  Every checkout stays disabled with the reason shown; the page says up front that nothing can charge you.
- Hub tabs now expose Billing, Reservation and Discover for the Owner (they had routes but no way in), and a mobile
  bottom tab bar (`ui-bottom-nav`) gives the five most-used Hub surfaces thumb reach.
- Billing, Reservation and Discover surfaces are filled out with the canonical prices, the reservation lifecycle and a
  real member meter toward 700, each still failing closed on the missing endpoint.
- `src/pages/Analytics.tsx` rebuilt on the design system: ink participation panel, per-question distribution bars, and
  suppressed answers grouped into an explicit withheld state. Export stays disabled until an authorized export exists.
- Component gallery covers the new marketing pieces (ticker, price card, lifecycle) and the withheld bar treatment.
- `src/lib/errors.ts`: `lv_policy_undecided` now says an anonymous Campaign publishes results once it closes, instead of
  referring to an unsettled policy.
- Removed dead surfaces: `src/pages/Me.tsx`, `NotFound` in `Public.tsx`, `ComingSoon` in `Pricing.tsx`.

### Added (public landing page)

- Replaced the placeholder hero with a real marketing page: hero with an example Campaign card (including a withheld
  cohort), how-it-works steps, a privacy section explaining anonymous-by-default / withheld-never-zero / guests-stay-guests,
  six use cases (dining only as one), a pricing teaser read from `src/config/pricing.ts`, an FAQ, a closing call to action
  and a footer. Type-led layout in the existing ink/amber/bone tokens.
- Marketing chrome in `Shell`: nav (How it works, Use cases, Pricing) on `/` and `/pricing` only, so in-product Hub routes
  keep the compact header; footer carries the maker's mark.
- `src/components/MakerMark.tsx`: `MakerMark`/`MadeBy` for the KpnSolute signature, using `currentColor` and a documented
  placeholder until the real SVG and typeface are supplied (`--font-maker` token added in `src/styles/landing.css`).
- Anchor targets carry `scroll-margin-top` so sections do not hide under the sticky header; hash links scroll on navigation.
- Verified in the browser at 1280px and 390px: no console errors, no horizontal overflow at 390px.

### Fixed

- Production build: `src/lib/reservedSlugs.test.ts` imports `node:test`, and `tsc -b` type-checks everything under
  `src/`, but `@types/node` was only present transitively through `vite`. A cold Render install resolved it as missing
  and the deploy build failed. Declared `@types/node` in `devDependencies` and committed the lockfile.

### Fixed

- `AGENTS.md`/`CLAUDE.md`: the architecture-map line pointed at `graphify-out/wiki/index.md`, deleted with the v1 map.
  It now says no map exists yet and names `/graphify` as the way to rebuild the v2 one. Both files stay identical.
- Restored the `database` PR job ("Canonical v2 database suite") that PR #26 added and a later squash-merge dropped:
  it runs `scripts/db-test-canonical.sh` against a throwaway Postgres container. Verified locally: 356 checks, 0 failed,
  slug race and rollback rehearsal included.

### Removed (v1 residue)

- Deleted `graphify-out/`: 34 generated files that mapped the v1 app (`Menu_Data_&_Student_Pages`, `Auth_&_App_Shell`,
  `Admin_&_DB_Types`, `Edge_Function_HTTP_Utils`, `Home()`, and a `graph.json` whose v1 vocabulary outweighs everything
  else in the repo). Regenerate it with `/graphify` once the v2 architecture settles; `AGENTS.md` still points at
  `graphify-out/wiki/index.md`, so that reference is dangling until the backend thread regenerates or drops it.
- Deleted `time-log.md`, the v1 work log that opens with the `MJCC-Portal/Interact` clone. Git history keeps it.
- Renamed the package from `lunch-line-survey` to `lunchvoice` and synced the lockfile; the name was the retired
  product's.
- `render.yaml`: replaced the v1 route comment (`/join`, `/survey/:id`, `/admin/*`) with the v2 routes. The service
  `name` stays `lunch-line-survey` on purpose - it is the existing Render service identifier and renaming it here would
  provision a new service, so that change belongs in the Render dashboard.
- `index.html`: `og:title` was `Lunch Voice`; it now matches the brand, `LunchVoice`.

### Frontend baseline rebased onto `main` (`uiv2`)

- The v2 frontend branch is rebased onto `main` at `d45b449` and renamed `uiv2`. Conflicts were resolved in `main`'s
  favour for everything the backend thread owns (`AGENTS.md`, `CLAUDE.md`, `docs/backend/*`, `docs/v2/PRODUCT_SPEC.md`,
  `scripts/db-test-canonical.sh`, `supabase/tests/*`), because the branch copies were older and still pointed the brain
  at the retired repo; the v2 `.env.example` template and this changelog's UI entries were kept.
- Added `scripts/check-customer-names.mjs`, a source guard that fails on `LionCafe`, `MCC`-style customer names,
  `Miami` or `Job Corps` anywhere under `src/`, including tests and fixtures. Wired into `test:pr` and `test:light` so
  CI enforces it.
- `src/lib/reservedSlugs.test.ts` fixtures renamed to synthetic names (`acme-test`, `example-hub`) so the test no longer
  needs a customer name to prove that a business name is not reserved.
- Removed the `edge-functions` Deno job from `.github/workflows/pr-checks.yml`. It ran
  `deno test supabase/functions/_shared/`, but v2 has no `supabase/functions` directory, so it failed on every pull
  request for code that does not exist. Overlaps the intent of draft PR #27; land one or the other, not both.

### Security

- The dev mock API and the simulated sign-in no longer ship in production bundles: they are gated on `import.meta.env.DEV`, a
  production build without Supabase configuration fails closed, and `scripts/check-bundle.mjs` now fails on dev-only strings.
  Adopted the backend's v2 `AGENTS.md`/`CLAUDE.md`; removed `public/tenants`, `legacy/`, the v1 `.env.example` values and
  `docs/backend/DATA_AND_MIGRATION_PLAN.md`.

### Added (read APIs and screens)

- Typed client now covers the full `lv_api` contract (hub get, members, invites, campaigns, submit, analytics, beta). Screens:
  public Hub landing (readable signed out), Campaign list, Campaign Studio (add questions, publish, close, share code),
  respondent player (one question per screen, anonymity notice, receipt), results with explicit "Withheld" states, Members and
  Invitations, `/pricing` from `src/config/pricing.ts` (Campaign Plus has no price; checkout disabled), placeholder
  `/discover`, `/billing`, `/settings`. Create Hub handles `lv_beta_required` with a beta application.
  Walked in the browser against the dev mock (create Hub, publish Campaign, respond, results); no console errors.

### Documentation

- Frontend docs reset to the v2 canonical master spec (2026-10-25): `README.md`, `PRODUCT.md` and `DESIGN.md` rewritten for the
  Hub/Campaign SaaS (Hybrid design direction, canonical pricing, Campaign Plus has no numeric price, Hub Name Reservation);
  new `docs/frontend/FRONTEND.md` (routes, boundaries, mock-to-real replacement table, work order, acceptance test) and
  `docs/frontend/HANDOFF.md`; `MULTI_TENANT_PLAN.md` (v1 plan) removed; history keeps it. `discover` added to the reserved slugs;
  `lioncafe` and `mjcc-admin` removed from them so no customer name is special-cased (regression test added).
  `AGENTS.md`, `CLAUDE.md` and the spec/API contract remain with the backend thread.

### Changed

- **v2 frontend reset (branch `feat/v2-ui`).** Removed every v1 screen and its support code: student/cafeteria routes,
  Content Central and the other admin screens, the `/LionCafe` and subdomain redirects, `AuthProvider`/`Gate`, the MJCC staff
  SSO callback, the organization provider, menu/QR/workbook libraries and the v1 `public.*` types. `src/index.css` was trimmed
  to the shared tokens, buttons, forms, cards, pills and chart styles. Unused dependencies `fflate`, `qrcode` and
  `@types/qrcode` were dropped. Legacy behaviour lives in Git history only. No database, deployment or MJCC data was touched.
- `scripts/check-bundle.mjs` and its test now require `lv_api` markers instead of v1 Supabase markers.
- `AGENTS.md` / `CLAUDE.md` still describe v1 and are intentionally unchanged here (they must stay byte-identical); updating
  them is pending an owner decision on v2 agent notes.

### Added

- v2 frontend foundation: routes `/`, `/signin`, `/me`, `/:hub`, `/:hub/campaigns`, `/:hub/campaigns/:id`, `/:hub/analytics`;
  `src/lib/lvApi.ts` typed client over the 13 `lv_api` functions; `src/lib/reservedSlugs.ts` (system-path reservation, mirrored
  to the backend) with `npm run test:unit`; `src/identity/IdentityProvider.tsx` (simulated sign-in in mock mode only, since the
  KpnIdentity issuer does not exist yet); an in-memory mock transport used when no Supabase env is set.

- Added the canonical v2 fresh-install baseline: `supabase/migrations/000001_v2_core.sql` through `000006_v2_platform.sql`
  (core identity/Hubs/memberships, authorization, campaigns, participation, privacy analytics, platform), each with a matching
  `supabase/rollbacks/*.down.sql`. A **blank database plus these six files is a complete LunchVoice v2 installation**; the
  legacy `public/` migrations in the same directory are v1 and are not part of it. Identity is `(issuer, subject)` with
  `UNIQUE(identity_issuer, identity_subject)`; there is no auth-user-keyed identity, no legacy-auth-user synthesis, no
  `public.profiles` mirror trigger and no dependency on `public.orgs`. For an anonymous Campaign the submission stores no
  account and the participation stores no submission, enforced by triggers, so there is no stored join path from a person to
  their answers. Tables live in schema `lv` and are never exposed; the whole API surface is 13 `lv_api` functions.
- Added `scripts/db-test-canonical.sh`, a fresh-install runner that applies only the canonical migrations to a throwaway
  Postgres, runs every suite, then applies and reverses the full baseline. It **fails on a zero-check run** rather than
  reporting a false green.
- Added tests: `supabase/tests/setup.sql` plus `01_identity` (25), `02_authorization` (28), `03_privacy` (26),
  `04_analytics` (22), `05_acceptance` (50) and `06_concurrency` (11). **162 checks executed, 0 failed**, and the full
  baseline applies to a blank database and rolls back completely.
- Added `docs/backend/PRODUCTION_RESET_RUNBOOK.md`: the not-approved, not-executed procedure for resetting the v1 database,
  including what is destroyed (137 users, 72 responses, 639 answers, 803 ratings, 14 orders), what is preserved, the
  dependency of all six live Edge Functions on `profiles`/`orgs`, how the first v2 administrator and MJCC Hub are created, how
  to prove no old student data survived, and the fact that there is **no rollback** after the schema drop.

### Changed

- **Founder reset, 2026-10-25 (supersedes every earlier entry that preserves, migrates or special-cases v1 or LionCafe).**
  LunchVoice v1 is retired and nothing is preserved, migrated, backfilled, mapped or bridged; LunchVoice builds the platform
  and never a customer Hub. No Hub, owner, role, page, Campaign, slug or fixture for LionCafe or MJCC exists in product code,
  migrations or tests; a customer creates `lioncafe` through the public `lv_hub_create` flow. The earlier entries below that
  mention creating the MJCC Hub, a Dec 11 MJCC launch or a v1 staff-permission fix are historical and no longer apply.
- Added the canonical spec to the repo as `docs/v2/LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md`, and the split worker
  prompts as `docs/v2/handoffs/UI_WORKER.md` and `docs/v2/handoffs/BACKEND_WORKER.md`.
- Rewrote `AGENTS.md` and `CLAUDE.md` (byte-identical) as v2-only: SaaS boundary, identity, one entitlement map (Starter $13/mo,
  Team $29/mo, Campaign Starter $19 for 2 weeks plus $13 per week, Campaign Plus price unset and fail-closed, Hub Name
  Reservation $25 per 12 months with 25-day grace), `lv_api`-only frontend, error contract, privacy rules and thread ownership.
- Rewrote `docs/backend/EXECUTION_ROADMAP.md` to the spec's 14-slice backend order with the entitlement map and the audit of the
  migration chain. Amended `docs/v2/PRODUCT_SPEC.md` (now subordinate to the master spec; MJCC preservation, subdomain/LionCafe
  compatibility and Campaign-Pass-only reservation wording replaced) and `docs/backend/PRODUCTION_RESET_RUNBOOK.md` (the reset
  no longer creates any Hub).
- Audit of migrations 000001-000007: no v1 table dependency, no seed. Fixed two issues: tests created `lioncafe` as their sample
  Hub (now a synthetic Hub), and a draft reserved-slug list carried `mjcc-admin` and `lioncafe-admin` (removed; no customer name
  is reserved). Added a test that no customer name is reserved and that no Hub exists before a customer creates one.

- Added `supabase/migrations/000008_v2_error_envelope.sql` (with rollback and `08_error_contract` tests). All 13 `lv_api` write
  functions now return `{ok:false, error:{code, message, ...}}` for every expected failure; bodies moved to `lv.api_*` behind
  thin wrappers; `lv_gate_blocked` carries `reasons`; caller-caused database rule violations map to `lv_invalid_input`,
  `lv_conflict` or `lv_not_found`; real faults stay exceptional as `lv_server_error` with no detail. `lv_hub_create` now
  validates slug format and display name itself (no raw constraint errors) and writes a `hub.created` audit event. For anonymous
  Campaigns the submission and answer timestamps are coarsened to the day so they never equal the participation timestamp (the
  stored join path found in the spec audit). Existing tests that expected raises now assert error codes.
- Added a two-connection slug race to `scripts/db-test-canonical.sh`: two clients claim one slug at once; exactly one wins, the
  other gets `lv_conflict` and keeps its approval. Suite is now 228 checks plus the race, 0 failed, rollback rehearsal passing.

### Removed

- **v1 removed from the repository (founder authorization 2026-10-26).** Deleted the v1 Edge Functions (`login-start`,
  `staff-login`, `staff-sso`, `staff-status`, `menu-sync`, `send-email` and `_shared`), `supabase/keepalive.sql`, the tracked
  `supabase/.temp/linked-project.json`, `legacy/`, `public/tenants/`, `scripts/check-email-setup.mjs`, the `deploy:functions` and
  `check:email` scripts, the MJCC menu bridge and tenant-map settings in `.env.example`, and all 20 v1 migrations from
  `supabase/migrations/`. The active migration directory now contains only `000001`-`000008`, so `supabase db reset` or `db push`
  produces only the v2 schema; `scripts/db-test-canonical.sh` fails if any other file appears there. Git history keeps v1.
  Not touched here (UI branch owns them): `src/` v1 frontend, `scripts/check-bundle.mjs` and `scripts/release-policy*`.
- **Live production not yet reset.** The backend session's Supabase connector and the local CLI login cannot see project
  `qprfonxvthmaoxfixigk`, so the destructive live steps (drop v1 schema, delete v1 users, retire v1 functions and secrets,
  install v2, deploy v2) are blocked on access and have not been run. See `docs/backend/PRODUCTION_RESET_RUNBOOK.md`.
- Removed `MULTI_TENANT_PLAN.md` and `docs/backend/DATA_AND_MIGRATION_PLAN.md`, which planned v1 org-to-Hub continuity and a data
  migration. Git history keeps them.

### Added

- **Roadmap slices 7, 8, 10 and 11 (branch `feat/v2-collab-participation-api`, stacked on `feat/v2-read-api`; not applied to
  production).** Split with the backend thread: this branch owns migrations `000010`-`000019`; slices 4, 5, 6, 9, 12 and 13 stay
  with the backend thread. Each migration has a rollback and a test suite; documented append-only in `docs/backend/API_CONTRACT.md`.
  - `000010_v2_roles_members.sql`: capability catalogue with groups; custom roles with name and icon; `lv_role_list/create/update/
    delete`, `lv_member_role_assign/unassign`, `lv_hub_join`, `lv_member_leave/admit/reject/remove`. No escalation anywhere (nobody
    grants, edits, deletes, assigns or removes past their own capabilities); Owner role untouchable; the Owner never uses a custom
    slot. Custom-role slots read `lv.custom_role_limit()`, which fails closed until policy `roles.max_custom_per_hub` is set; slice 9
    should replace that body with the entitlement map. Members can leave and rejoin (`left` status); removal stays permanent.
    `lv_invite_redeem` now re-admits someone who left.
  - `000011_v2_campaign_lifecycle.sql`: statuses `paused` and `archived`; Scheduled and Ended are derived from the window
    (`lv.campaign_phase`), so scheduled Campaigns hold their slot from publication and no background job is needed. Publishing writes
    an immutable `lv.campaign_versions` row (questions, participation settings, limit in force). New `lv_campaign_update`,
    `lv_campaign_question_update/remove`, `lv_campaign_schedule`, `lv_campaign_pause/resume` (resume re-checks the cap),
    `lv_campaign_archive`, `lv_campaign_versions`; `lv_campaign_close` now also closes paused or scheduled Campaigns and refuses drafts.
  - `000012_v2_participation_modes.sql`: guest participation (`audience = 'members_and_guests'`) through `lv_guest_campaign_get` and
    `lv_guest_submit` by join code, signed out. Guests never create memberships or count toward member totals; dedup by a hashed
    client key; per-Campaign total and per-minute rate limits, failing closed until policy `participation.guest_rate_per_minute` is set.
    `lv_campaign_set_participation` (draft only).
  - `000013_v2_analytics.sql`: anonymous results publish once finished (closed, archived or past `closes_at`; paused is not finished);
    guests counted apart (`guest_n`) and included in the frozen release population; new `participation_rate` and `rating_summary`
    metrics; `multi_choice` counted per option; `lv_analytics_overview`; `lv.campaign_member_participation()` for the survey unlock
    threshold in slice 9.
  - Tests: `10_roles_members` (46 checks), `11_campaign_lifecycle` (39), `12_participation_modes` (23), `13_analytics` (20).
    `scripts/db-test-canonical.sh`: 356 checks, 0 failed, slug race passing, full apply and rollback rehearsal passing.
  - Not done here: ownership transfer (slice 6), entitlement-driven limits (slice 9), election-mode guest rules (no election mode
    exists yet), true parallel races for the new advisory locks, and `lv_campaign_list/get` still return the stored status (the UI
    derives the phase; folding `phase` into those reads is left to the read-API owner).

- Added `supabase/migrations/000007_v2_read_api.sql` (with rollback and `07_read_api` tests): read API for the v2 frontend
  (`lv_hub_get`, `lv_campaign_list`, `lv_campaign_get`, `lv_member_list`, `lv_invite_list`, `lv_invite_preview`, `lv_beta_status`),
  richer `lv_my_context` (roles, capabilities, platform-admin and beta state), a completed reserved-slug list enforced by a
  trigger, and a no-double-hyphen slug rule. Documented in `docs/backend/API_CONTRACT.md`.

### Added

- Added the canonical v2 fresh-install baseline: `supabase/migrations/000001_v2_core.sql` through `000006_v2_platform.sql`
  (core identity/Hubs/memberships, authorization, campaigns, participation, privacy analytics, platform), each with a matching
  `supabase/rollbacks/*.down.sql`. A **blank database plus these six files is a complete LunchVoice v2 installation**; the
  legacy `public/` migrations in the same directory are v1 and are not part of it. Identity is `(issuer, subject)` with
  `UNIQUE(identity_issuer, identity_subject)`; there is no auth-user-keyed identity, no legacy-auth-user synthesis, no
  `public.profiles` mirror trigger and no dependency on `public.orgs`. For an anonymous Campaign the submission stores no
  account and the participation stores no submission, enforced by triggers, so there is no stored join path from a person to
  their answers. Tables live in schema `lv` and are never exposed; the whole API surface is 13 `lv_api` functions.
- Added `scripts/db-test-canonical.sh`, a fresh-install runner that applies only the canonical migrations to a throwaway
  Postgres, runs every suite, then applies and reverses the full baseline. It **fails on a zero-check run** rather than
  reporting a false green.
- Added tests: `supabase/tests/setup.sql` plus `01_identity` (25), `02_authorization` (28), `03_privacy` (26),
  `04_analytics` (22), `05_acceptance` (50) and `06_concurrency` (11). **162 checks executed, 0 failed**, and the full
  baseline applies to a blank database and rolls back completely.
- Added `docs/backend/PRODUCTION_RESET_RUNBOOK.md`: the not-approved, not-executed procedure for resetting the v1 database,
  including what is destroyed (137 users, 72 responses, 639 answers, 803 ratings, 14 orders), what is preserved, the
  dependency of all six live Edge Functions on `profiles`/`orgs`, how the first v2 administrator and MJCC Hub are created, how
  to prove no old student data survived, and the fact that there is **no rollback** after the schema drop.

### Changed

- **Architecture: LunchVoice v2 starts fresh; D-01 Option D withdrawn.** Google → KpnIdentity → LunchVoice is now the only
  identity path, and the old student dataset is explicitly not migrated. Old student accounts, responses, answers, ratings,
  points, reward history and legacy memberships do not carry into v2; the old production database is v1 / retirement-pending.
  Identity is the `(issuer, subject)` pair with `UNIQUE(identity_issuer, identity_subject)`; email is never the identity key.
  Hubs get independent v2 identities and no longer depend on `public.orgs`; `public.profiles` is not the v2 identity model and
  `role`, `is_staff`, `org_id` and `mjcc_username` are absent from the canonical schema. The legacy survey bridge is removed.
  Recorded in `docs/backend/D01_IDENTITY_SUPERSESSION_2026-10-25.md`, which supersedes parts of the D-01 packet
  (`docs/backend/D01_IDENTITY_DECISION_PACKET.md`), `docs/v2/PRODUCT_SPEC.md` (V2-02), `docs/backend/DATA_AND_MIGRATION_PLAN.md`
  (§2 principle 4) and `docs/backend/EXECUTION_ROADMAP.md`, all of which were amended in the same change so no authoritative
  document still mandates Option D or v1 data continuity.
- **Schedule risk recorded, not softened:** with no fallback, Dec 11 depends on a KpnIdentity issuer that does not yet exist.
  Architecture correctness takes priority over retaining Option D.

### Added

- Added `docs/v2/IDENTITY_CONTRACT.md`: what crosses from KpnIdentity into LunchVoice (`iss`, `sub`, `email`,
  `email_verified`, `name`, `picture`, nonce), the token/session trust model, validation and fail-closed rules, account-linking
  rules (no email merging), verified-vs-unverified behaviour, and the explicit statement that email is not the identity key.
- Added `docs/v2/KPNIDENTITY_SCHEMA_V1.md`: a minimal identity schema (`kpni.profiles`, `kpni.oauth_clients`,
  `kpni.oauth_redirect_uris`, `kpni.security_events`), the Supabase-managed vs application-table split, and the deliberate
  exclusions (MFA, grants, tenancy, billing) that would otherwise make an oversized IAM platform.
- Added `docs/v2/LUNCHVOICE_SCHEMA_V2.md`: the canonical fresh-install schema and its six baseline migrations, the
  `accounts → hub_memberships → membership_roles → role_capabilities` model, and the anonymity boundary.
- Added `docs/backend/V2_MIGRATION_CLASSIFICATION.md`: KEEP / REDESIGN / REMOVE for all 11 prototype migrations with reasons
  and destinations, plus the ported non-SQL assets. Nothing in the prototype stack was deleted.

### Notes

- The prototype stack (`feat/v2-hub-invitations` and the other 10 v2 branches) is unchanged and remains the research record.
  The canonical baseline is built on `feat/v2-canonical-baseline` off `main`, not on the prototype branch.
- No production database was read, written or wiped in this change.

### Added

- Fixed the project-scoped Supabase MCP server failing to start in the Claude desktop app on Windows with WSL (`.mcp.json`). The app launches `bash` from Windows with the
  `\\wsl.localhost\...` repository folder as the working directory, which Windows does not support, so the relative `scripts/mcp/supabase.sh` was never found
  ("Connection closed"). The server is now started by absolute path (`$HOME/projects/lunchvoice/scripts/mcp/supabase.sh`), which assumes the checkout lives there.
  The wrapper, token handling and read/write setting are unchanged. No secret, migration or database change.
- Added pull-request validation (`.github/workflows/pr-checks.yml`). Previously the only
  workflow ran on pushes to `main`, so a PR could merge with no automated checks. The new
  workflow runs on `pull_request`, has read-only permissions and no secrets, and cannot tag,
  release, deploy or push. It runs `check:brain`, new script tests (`node --test scripts/*.test.mjs`),
  the production build, a bundle smoke check, and Deno tests for
  `supabase/functions/_shared/`; it requires a `CHANGELOG.md` update in every PR and runs
  `npm audit --audit-level=high` when the PR touches dependency, auth, org, migration,
  function, workflow or hook paths. Builds now use placeholder (non-secret)
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: without them `src/lib/supabase.ts` throws
  at load and the bundler drops the whole app, so a green build proved little;
  `scripts/check-bundle.mjs` now fails if the bundle lacks the app and Supabase client.
  Added `release-policy.mjs pr <base>` mode and npm scripts `test:pr`, `test:scripts`,
  `check:bundle`. `test:light`, `test:heavy` and `version-release.yml` are unchanged.
  Branch protection (making these checks required) is a separate founder decision; no
  repository setting was changed.
- Added project-scoped MCP server setup (`scripts/mcp/`): the Supabase MCP server now starts through
  `scripts/mcp/supabase.sh`, which loads secrets only from a gitignored, owner-only `.mcp.env` (never from the
  global shell), is scoped to one project with `--project-ref`, starts **read-only** by default, and pins
  `@supabase/mcp-server-supabase@0.13.0` instead of `@latest`. `.mcp.json`, `.cursor/mcp.json` and
  `.vscode/mcp.json` call the wrapper and contain no secrets; `.vscode/mcp.json` now uses VS Code's documented
  `servers` root (it previously used `mcpServers`). Also added a generic `with-env.sh` wrapper for future servers,
  `doctor.sh` (checks the setup and confirms the project ref exists for the token using one read-only API request),
  `.mcp.env.example`, a README, and 6 tests (`scripts/mcp.test.mjs`). `SUPABASE_ACCESS_TOKEN` was removed from
  `.env.example` (it moves to `.mcp.env`). Render MCP is documented but not enabled: its HTTP transport needs an API
  key in the process environment and no key scoping is documented. No secret, migration, resource or deployment.
- Added OpenCode (`opencode.json`) and Codex (`.codex/config.toml`) project configurations for the two independent
  Supabase MCP wrappers, alongside Claude Code's `.mcp.json`. All three clients use the same private `.mcp.env`
  through the wrappers; the config files contain no credentials. Added regression tests confirming the second
  server requires and uses its separate token. Updated the MCP setup guide. No secret, migration, resource,
  or deployment.
- Fixed the Supabase MCP wrappers and doctor to read the `LUNCHVOICE_SUPABASE_*` and
  `KPNIDENTITY_SUPABASE_*` variable names used in `.mcp.env`, while retaining compatibility with the earlier
  unprefixed names. Updated the env example and guide. No credentials were changed.
- Added a signed KpnSolute CloudEvents receiver to the existing `menu-sync`
  function for MJCC menu-day and menu-cycle events. It verifies Standard
  Webhooks signatures against the raw request body, enforces the tenant-to-org
  mapping, and atomically deduplicates and projects menu data into Lunchvoice.
  The existing pull/manual synchronization remains available as a fallback.
- Added the service-role-only event receipt/projection migration and bounded
  CloudEvent request bodies to 256 KiB. Source verification passed Deno check,
  the independent signature test, `check:brain`, and the production build. No
  migration, secret, function deployment, or live subscription was applied.

### Fixed

- Restricted self-service writes to `public.profiles` (migration
  `20261023225534_restrict_profile_self_service_columns`, **applied to production on 2026-10-23** with the
  founder's authorization through the project MCP server, then recorded here with the same version). API roles
  (`anon`, `authenticated`) can no longer INSERT or UPDATE profile rows at table level; signed-in users may update
  only `email` and `display_name` (the app's only client-side profile write, `src/routes/Login.tsx`). Production
  already restricted UPDATE to those two columns, but that grant was never recorded in the migrations, so fresh
  replays did not match; this codifies it. A `BEFORE UPDATE` trigger additionally rejects changes to privileged
  columns (role, staff flag, points, streak, last survey date, org, MJCC username) by any role other than the
  database owner roles and the service role. Profiles are still created by `handle_new_user()` (SECURITY DEFINER,
  owned by `postgres`); points/streak changes still happen in SECURITY DEFINER RPCs; Edge Functions use the service
  role. Verified on a throwaway database replay first, then in production via catalog checks (privileges, trigger,
  unchanged profile counts).
- Fixed the heavy-test selector in `scripts/release-policy.mjs`: it matched
  `src/contexts/Auth`, a directory that does not exist, so a commit touching only
  `src/auth/AuthProvider.tsx` or `src/org/OrgProvider.tsx` skipped the heavy release
  gate. The patterns now live in `scripts/release-patterns.mjs` (covering `src/auth/`,
  `src/org/`, `src/lib/supabase`, `supabase/config.toml`, `.githooks/` and the release
  scripts besides the earlier paths) with regression tests.

- Remediated the three high-severity dependency advisories reported by `npm audit`
  on 2026-10-23 (`vite` 8.1.3 -> 8.3.5, `nanoid` 3.3.17 -> 3.3.20, `source-map-js`
  1.2.1 -> 1.2.2, with the matching `rolldown` 1.1.4 -> 1.2.15 and `postcss`
  8.5.25 -> 8.5.31 updates) by refreshing `package-lock.json` only; `package.json`
  ranges are unchanged and `react-router-dom` moved within 6.x (6.30.4 -> 6.30.6).
  `npm audit --audit-level=high` now exits 0, so the heavy release gate passes
  again. Two moderate `react-router` / `react-router-dom` advisories remain: their fix
  requires React Router 7 (major). Assessment: the app is a client-side SPA with no
  server rendering or hydration, so the `deserializeErrors()` advisory has no
  reachable path; every `<Navigate>`/`navigate()` target in `src/` begins with a fixed
  prefix (`/${org.slug}`, `/LionCafe`, a relative path, or `/`), so the backslash
  open-redirect advisory has no user-controlled leading segment today. This is a
  read-through of the call sites, not a proof; the React Router 7 migration remains
  a separate, scheduled change. Verified with placeholder `VITE_SUPABASE_*`
  values (see below) that the production bundle still contains the same app and
  Supabase client code (519 kB -> 517 kB). No migration, secret or deployment.
- Discovered that `npm run build` without `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` succeeds but produces a near-empty bundle (`src/lib/supabase.ts`
  throws at module load, so the bundler drops everything after it), meaning a "passing
  build" in an environment without those variables proves little. The CI change
  tracks this separately.

- Updated the locked PostCSS toolchain to remove the high-severity source-map
  path-disclosure advisory found by the release audit. Two moderate React
  Router advisories remain because their upstream fix requires the separate
  React Router 7 migration; the high-severity release gate is clean.

- Fixed the Supabase MCP server failing with a permission error in every
  local AI tool (Claude Code, Cursor, VS Code). `.mcp.json`,
  `.cursor/mcp.json`, and `.vscode/mcp.json` all pointed at the hosted
  `mcp.supabase.com` endpoint; the two IDE configs sent no `Authorization`
  header at all, and none had ever been committed, so a fresh clone had no
  working Supabase MCP access regardless of tool. Switched all three to the
  local `npx`-spawned `@supabase/mcp-server-supabase` server, scoped to this
  project via `--project-ref=qprfonxvthmaoxfixigk` and authenticated with
  `SUPABASE_ACCESS_TOKEN` (documented in `.env.example`, same Supabase
  account as KpnCompute). Verified full read/write access to the live
  project via the Management API directly (19 public tables reachable)
  before committing the config.

- Fixed `single_choice`/`yes_no` answers being double-counted in Content
  Central's Results tab: they were tallied correctly as choice-bar options
  but also pushed into the free-text bucket, inflating "Open comments" and
  showing structured picks (e.g. "Yes", "Too small") as if they were quoted
  student comments. Only genuine open-text answers land in the text bucket
  now.
- Fixed the dead "Continue with MJCC" staff sign-in button: `MJCC_STAFF_SSO_URL`
  pointed at `mjcc.kpncompute.com`, whose apex domain no longer resolves in
  DNS. The live portal moved to `mjcc.kpnsolute.com` (confirmed reachable,
  same underlying Render service) — updated the constant and the matching
  README reference. Backend edge functions were unaffected; they already call
  the stable `mjcc-managements.onrender.com` URL directly.
- Applied the `responses`/`join_code` tracking-integrity migration to MJCCv2
  (unique constraint on `responses(session_id, student_id)`, org-scoped
  `join_code`, reserved-column comments). While applying it, found and
  dropped a second, untracked unique constraint on the same `responses`
  columns that predated this change and wasn't recorded in any migration
  file — both enforced the same thing, so the untracked one was removed.
- Applied `20260706153000_add_flame_slider_question_types.sql`, which had
  been written and committed but never actually run against MJCCv2 — the
  `survey_questions.type` check constraint was silently missing `flame` and
  `slider` even though the Question Editor UI already offered both as answer
  types, so creating either would have failed with a database error.
- Made the session duration dropdown reflect what's actually saved:
  previously it always showed a hardcoded "30 minutes" default regardless of
  the session's real `closes_at`, so clicking "Set duration" without
  deliberately changing the dropdown could silently shrink a session that
  was set to close much later. It now seeds from the session's persisted
  duration (mapped to the closest preset) on load.

- Stopped "Set duration" from silently reopening a closed survey session to
  students — it now only updates the auto-lock time, never `is_active`.
  Reopening a session is exclusively a Close/Reopen action, and that action
  (along with Remove/Show in Available) now requires a confirmation naming the
  live student-facing consequence before it fires.
- Stopped every session-card action (Close/Reopen, Set duration, Available
  toggle) from reloading the whole Content Central tab and resetting scroll to
  the top — these now patch local state instead of a full refetch.
- Added a unique constraint on `responses(session_id, student_id)` to close a
  check-then-insert race in `submit_response` that could double-award points
  on a double-submit or retry. Confirmed zero existing duplicate rows before
  applying.
- Re-scoped `sessions.join_code` uniqueness from global to per-`org_id`,
  matching the org-scoped design of the rest of the schema; prevents a
  spurious insert failure if two different orgs happen to generate the same
  join code.
- Fixed double-encoded UTF-8 (mojibake) on the student Surveys page that
  rendered `Loading…` and `·` as garbled characters.
- Replaced the ambiguous "fixed survey" session label with "No linked survey"
  so staff can tell an intentionally template-less session from a broken
  join.
- Made staff sessions expire only after 60 minutes of real inactivity across
  open Lunchvoice tabs, then return staff to the MJCC-backed admin login instead
  of silently dropping them into the student flow.
- Replaced blank legacy dish-idea rows with ranked tag bubbles sourced from
  dynamic survey answers categorized as Ideas, legacy survey ideas, and visible
  Student Voice ideas. Empty answers are ignored and repeated ideas show their
  combined request count.
- Replaced the separate Lunchvoice staff-password flow with a one-time MJCC
  single-sign-on handoff. Staff sessions are now provisioned in MJCCv2 only
  after KpnCompute confirms the live LionCafe role grant, and persisted sessions
  continue to recheck that same grant.
- Fixed Student Voice submissions by sending the authenticated student ID and
  visible status required by the tenant-scoped database insert policy.
- Replaced the displayed-row count with exact Student Voice totals and kind
  counts, refreshed through database events, browser focus, and five-second
  polling. The admin dashboard now includes those totals and Student Voice
  ideas alongside survey ideas.
- Allowed HTTPS tenant subdomains through the staff Edge Function CORS checks
  and stopped transient staff-status failures from signing sudo staff out. Only
  a confirmed upstream access revocation now ends the local session.
- Made Content Central results refresh from database changes, browser focus,
  and a five-second polling fallback. Response totals and trends now use the
  response records directly, including submissions without dynamic answers.
- Disambiguated the admin results embeds from `survey_answers` to
  `survey_questions` and `responses`, preventing PostgREST `PGRST201` errors
  when duplicate database foreign-key relationships are present.

### Added

- Added the project-scoped Supabase MCP skeleton at `.mcp.json`, targeting
  MJCCv2 (`qprfonxvthmaoxfixigk`) without storing credentials in the repository.

- Added a dedicated "Sessions" tab in Content Central, separate from "Launch,"
  with search by title/join code, Active/Closed grouping with counts, a
  visually distinct "Live controls" cluster on each card so staff can tell
  read-only info from student-facing actions, and the QR code now renders
  directly under its own button instead of below three unrelated controls.
- Added a campus-compatible KpnCompute launch path, a short-lived SSO callback,
  and staff QR destination controls for either the Render campus URL or the
  public Lunchvoice URL. QR codes can now be downloaded as high-resolution PNG
  images for flyers. The KpnCompute bridge, MJCCv2 functions, and Interact
  frontend were deployed and verified fail-closed for anonymous/forged access.
- Added three clear student survey access paths: QR links that survive sign-in
  or sign-up and open the intended survey, code entry on the Surveys page, and
  an optional staff-controlled Available surveys list.
- Added an authenticated, tenant-scoped `join_available_session` RPC plus staff
  launch/session controls for opting sessions into student discovery.
- Added wildcard hostname routing so any subscribed organization can use
  `<orgSlug>.lunchvoice.com` while the root and `www` hosts remain the public
  Lunch Voice site. Existing `/:orgSlug` URLs remain compatible.
- Added governing-agent rules for Codex and Claude, including KpnRelay pawn
  operation, Regional Overseer/Synthesis Drive handoffs, standing routine push
  authority, bounded OpenCode/Mimo delegation, credit safeguards, and
  PowerShell-first frontline automation.
- Added staff controls to edit store-item details, stock, point cost, and
  visibility, plus guarded permanent deletion for items without order history.
- Added a one-time, per-staff Content Central tutorial covering survey creation,
  questions, publishing, launching, and results, with an optional replay button.
- Added configurable survey durations for both launch and active-session
  management, ranging from 15 minutes to one week with a manual-close option.
- Established identical `AGENTS.md` and `CLAUDE.md` project-brain instructions.
- Added automatic sequential commit tagging and milestone release automation.
- Added light/heavy test classification and project-brain consistency checks.
- Added the project-specific work-session time log.

### Changed

- Restricted session reads so code-only sessions stay hidden until a student
  joins, while discoverable active sessions and each student's joined history
  remain accessible under RLS.
- Reset the repository package version baseline to `0.0.1` for the new release
  sequence. Historical commits remain untagged; automation begins at current
  `main`.
- Enabled the Windows WSL and Virtual Machine Platform features and staged a
  per-user Docker Desktop installation for isolated local Supabase testing.

## [0.0.1] - Unreleased

- Initial version-policy baseline.
