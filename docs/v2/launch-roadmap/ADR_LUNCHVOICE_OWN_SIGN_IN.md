# ADR: LunchVoice runs its own sign-in and leaves KpnIdentity (proposed 2026-11-14)

**Status: ACCEPTED by the founder on 2026-11-14 ("yes and today lets work on auth"): option B, X-19 (verified-email linking only) and the loss of the shared KpnSolute account for LunchVoice users. The two-day spike still gates production changes (section 7).** Raised by the founder on 2026-11-14: "break away from KpnID for LunchVoice because only LunchVoice will use Discord, and
that should be the LunchVoice bot app." If accepted this supersedes the identity decision in the canonical master spec (sign-in is Google, then KpnIdentity, then LunchVoice), `IDENTITY_CONTRACT.md`,
the "Identity" bullet in `AGENTS.md` and `CLAUDE.md`, and the Thursday 11-19 step "add the `create` and `pay` callbacks in KpnIdentity". Until it is accepted, nothing in production, KpnIdentity or the
brain files changes.

## 1. What was read today (F, read-only)

| | LunchVoice's own Supabase Auth (`qprfonxvthmaoxfixigk`) | KpnIdentity (`axzwdbizblfkspduqilj`) |
| --- | --- | --- |
| Google sign-in | off | on |
| Discord sign-in | off | off |
| Email and password | on | on |
| Email confirmation | required (`mailer_autoconfirm` false) | **not required (`mailer_autoconfirm` true): addresses are accepted unverified** |
| Custom SMTP | none | none |
| Minimum password length | 6 | 6 |
| Bot check (captcha) | off | off |
| Session limits | none set | none set |
| Redirect allow-list | empty | `https://auth.kpnsolute.com/**` and one `compute.kpnsolute.com` callback |
| Refresh-token rotation | on | on |

How LunchVoice signs people in today: the SPA runs an OAuth 2.1 authorization-code flow with PKCE against KpnIdentity's OAuth server, receives an ID token, and posts it to the `session` Edge Function,
which verifies it (issuer allow-list `KPNIDENTITY_ISSUERS`, one JWKS URL, audience, nonce) and issues a LunchVoice session. An account is keyed by the verified `(issuer, subject)` pair. KpnIdentity
also signs in other KpnSolute products, and the credential screen is a separate Cloudflare Worker whose source repository could not be found (spec A6).

## 2. Options

| Option | What it means | Verdict |
| --- | --- | --- |
| **A. Stay** | Keep KpnIdentity for launch; add Discord there as a KpnSolute-wide provider through a new "KpnSolute" Discord application | Works, but Discord would belong to KpnSolute, not to the LunchVoice bot app; the login screens depend on a Worker we cannot find; KpnIdentity today accepts unverified emails (affects every product on it) |
| **B. Break away at launch (recommended)** | LunchVoice uses **its own Supabase Auth in the Lunchvoice project** with Google, Discord (the LunchVoice bot application) and email; screens built in this repository; KpnIdentity stays accepted as a second issuer during a transition | Gives the founder what was asked, removes the unknown KpnAuth dependency, one repo, one theme. Needs a proven spike first (section 7) |
| **C. Break away after launch** | Ship A now, move later | Lowest launch risk, but the founder's login look and Discord wishes land after launch, and the transition then happens with real users |

## 3. Recommendation: B, gated by a spike

Why:

1. **Discord belongs to LunchVoice.** The LunchVoice bot application is the Discord application people already know; one consent screen, one set of secrets, and a Discord sign-in can link the account to the
   bot (F1) without a second login round trip.
2. **The login screens (spec A6) become ours to build.** In this repository, in the design system, with per-page control, in weeks 1 to 2 instead of week 3 in a repository we cannot locate.
3. **No extra cost.** Supabase Auth is part of the Pro plan the project already pays for (A: confirm the monthly-active-user allowance on the plan page; Pro includes a large allowance).
4. **Better controls are native.** Email confirmation, 12-character passwords with the leaked-password check (a Pro feature, A), Cloudflare Turnstile, custom SMTP through Resend, session time-box (30 days) and
   inactivity limits are settings of the project's own Auth.
5. **The launch plan's riskiest dependencies disappear:** "where does KpnAuth live", the KpnIdentity provider change, and the cross-project callback approvals.

Costs and risks (all with mitigations):

| Risk | Mitigation |
| --- | --- |
| Identity is security-critical and the window is four weeks | A spike on Mon and Tue of week 1 proves the whole path on a test project or branch before anything is changed in production; go or no-go Wed 11-18 (section 7); fallback is option A |
| Existing accounts (the founder's, a few members) are keyed to KpnIdentity | Dual issuer: the `session` function accepts both issuers for a transition; a person signs in the old way once and **links** the new identity on purpose (`lv_identity_link`), never by email; the founder's own accounts are linked by a founder-approved script |
| One KpnSolute account no longer works across products for LunchVoice users | The founder accepts this ("only LunchVoice will use Discord"); the copy "One KpnSolute account works for every Hub" changes |
| Supabase links sign-ins that share a verified email into one user by default | Decision X-19 (section 9): accept verified-email linking **only when both providers verified the email**, and amend the identity contract's "never merge by email" to say so; Discord must return a verified email or the person confirms one |
| Email deliverability for confirmations and resets | Custom SMTP through Resend (domains already verified); the founder supplies the SMTP credentials in the Supabase dashboard |
| Google and Discord applications need redirect URIs for the Lunchvoice project's auth callback | Founder actions (section 6) |
| Less abstraction if LunchVoice ever wants cross-product sign-in again | A later move back to a shared issuer is possible because accounts are keyed by `(issuer, subject)` |

## 4. Design if accepted

- **Sign-in methods:** Google, Discord (scopes `identify` and `email`), email and password. Built with the `supabase-js` client already in the project (`signInWithOAuth`, `signInWithPassword`, `signUp`,
  `resetPasswordForEmail`) on screens in this repository (spec A6: two-panel layout, providers first, show-password, forgot-password, trouble link, sign-up, legal links, trust line).
- **Backend path:** the SPA signs in with Supabase Auth and posts the resulting access token to the **`session` function**, which verifies it against the Lunchvoice project's issuer
  (`https://qprfonxvthmaoxfixigk.supabase.co/auth/v1`, JWKS from the project) and issues the LunchVoice session as today. `KPNIDENTITY_ISSUERS` becomes `LV_IDENTITY_ISSUERS` with two entries and one JWKS per
  issuer. `lv.account_identities` is unchanged: `(issuer, subject)` where subject is the Auth user id. No custom crypto, no password ever reaches our code or database.
- **30-day sign-in (A1):** unchanged in design (the device cookie through the `auth.lunchvoice.com` Worker) so `lunchvoice.com`, `create.` and `pay.` share one sign-in; the spike also tests Supabase's own
  session time-box with cookie storage on `.lunchvoice.com` as a simpler alternative (a JavaScript-readable cookie is less safe than the HttpOnly device cookie, so it is a fallback, not the default).
- **E11:** after the callback the person lands on the username and display-name step. The sign-in name from Google or Discord never becomes the display name if it contains "@".
- **F1:** a person who signed in with Discord is linked automatically (the Discord user id comes from the Auth identity, read server-side by the `session` function), with a consent line; the `/lunchvoice link`
  command and the Account-settings button remain for Google and email users.
- **Auth settings to set (founder approves each; applied through the Management API or Composio with the secrets entered by the founder, never in chat):** site URL `https://lunchvoice.com`; redirect allow-list
  for `https://lunchvoice.com/**`, `https://create.lunchvoice.com/**`, `https://pay.lunchvoice.com/**` (and `pay-next` during staging); Google and Discord providers; email confirmation on; minimum password length 12
  and leaked-password protection; Resend SMTP; Turnstile captcha; session time-box 30 days; refresh-token rotation on (already); manual linking as decided in X-19.
- **KpnIdentity:** untouched for other products. The unverified-email setting there (`mailer_autoconfirm` true) is a finding for the KpnSolute side and is recorded in the changelog, not fixed here.

## 5. What changes in the plan if accepted

| Item | Change |
| --- | --- |
| A6 sign-in screens | Built in this repository (UI-functional with Backend), week 2 Mon to Wed, not in KpnAuth in week 3; no per-client theme work |
| A1 30-day sign-in | Same design; the shared secret and Worker still needed |
| A7 (new) | Own sign-in: the spike, the `session` change, the settings, the account-link flow, the retirement of the old issuer after 90 days |
| F1 | Simpler for Discord sign-ins |
| S-33 | The KpnIdentity settings B1 to B6 stop being LunchVoice launch items; the Lunchvoice project's own Auth settings replace them |
| Thursday 11-19 | **The KpnIdentity callbacks step is cancelled** (the `pay` repoint and the Worker secret stay) |
| Founder action "where does KpnAuth live" | No longer needed for LunchVoice |
| Docs to update when accepted | Canonical spec identity section, `IDENTITY_CONTRACT.md`, `AGENTS.md` and `CLAUDE.md` identity bullet (edited together), `SERVICES_AND_DEPENDENCIES.md`, `SESSIONS.md` |

## 6. Founder actions if accepted

1. **Google Cloud (OAuth client):** add the Lunchvoice project's auth callback `https://qprfonxvthmaoxfixigk.supabase.co/auth/v1/callback` as an authorised redirect and rename the app to "LunchVoice"
   (or create a LunchVoice client); enter the client ID and secret in the Lunchvoice project's Google provider yourself.
2. **Discord developer portal (the LunchVoice bot application):** add the same callback as a redirect, enable the `identify` and `email` scopes for OAuth, and enter the client ID and secret in the Lunchvoice
   project's Discord provider yourself.
3. **Resend:** create an SMTP credential for the Lunchvoice project's Auth and enter it in the Supabase dashboard.
4. Approve each auth setting in section 4 one at a time.
5. Decide X-19 and confirm the loss of the shared KpnSolute account for LunchVoice users.

## 7. The spike (Mon 11-16 to Tue 11-17) and the gate (Wed 11-18)

On a Supabase **branch** of the Lunchvoice project or a scratch project (never production): enable Google, Discord and email; build the minimal sign-in; prove the token reaches `session` and yields a session;
prove the verified-email linking behaviour for Google plus Discord with the same address, with an unverified Discord email, and with two different addresses; prove a 30-day session on `lunchvoice.com` and
`create.lunchvoice.com`; prove the dual-issuer path with an existing KpnIdentity account and the explicit link. **Go** if all pass and no setting needs a paid add-on; **no-go** falls back to option A with
Discord through a "KpnSolute" application.

## 8. Tests (if accepted)

pgTAP: the same `(issuer, subject)` never creates two accounts; two issuers, two accounts unless explicitly linked; link requires proof of the old identity; unverified emails never link. Function tests: wrong
issuer, wrong audience, expired, replayed token. e2e: Google, Discord and email sign-in and sign-up; wrong password message; forgot password; confirmation; lockout and Turnstile; the E11 step; the 30-day choice;
the old-issuer link flow; 390 and 1440 px; keyboard only.

## 9. Decisions needed from the founder

1. **Confirm option B** (break away at launch, spike first, fallback A), or choose A or C.
2. **X-19: verified-email linking.** Accept that a Google and a Discord sign-in with the same verified email become one account, and amend the contract's "never merge by email" to "never merge by an unverified
   email, and never across different emails".
3. **Accept the loss of the shared KpnSolute account** for LunchVoice users, with the old sign-in kept for 90 days after launch for existing accounts to link.
