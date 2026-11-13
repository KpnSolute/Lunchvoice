# Claude execution handoff: LunchVoice V2 services-first build, unified creator app, and release gates
**Date:** 2026-11-13  
**Founder direction:** Corrects any assertion that the existing UI is complete, that final UI synthesis can precede functional service implementation, or that a scheduled billing date automatically turns sales on.  
**Release target:** 2026-12-12 12:12 PM America/New_York (2026-12-12T17:12:00Z). **Target, not automatic release authority.**  
**Google Docs V2 brief:** https://docs.google.com/document/d/1rlKb7cpDRSilzcTFVrWg6Jtb4nFuEeCVP0GphogTWUc/edit  
**Repository:** https://github.com/KpnSolute/Lunchvoice

> **READ THIS AS AN EXECUTION ASSIGNMENT FOR CLAUDE, NOT AS A STATUS REPORT CLAIMING DELIVERY.** The product is in public beta. Production survey and account data must be protected. A deployment, migration or passing unit test does not prove an end-to-end service or a screen works.

## 0. Startup and scope

You are the governing Claude implementation agent for LunchVoice V2. Read `AGENTS.md` and `CLAUDE.md` and ensure they are byte-for-byte equal, the canonical spec, `docs/v2/LAUNCH_PLAN.md`, `docs/v2/PRODUCT_DIRECTION_2026-11-11.md`, `docs/v2/V2_STATUS_2026-11-12.md`, `docs/v2/BILLING_FULFILLMENT_AUDIT_2026-11-11.md`, relevant `docs/v2/handoffs/`, `docs/backend/API_CONTRACT.md`, `DESIGN.md`, `src/main.tsx`, `src/config/pricing.ts`, `render.yaml`, `CHANGELOG.md` and the latest migration and tests. Reconcile older statements against current GitHub, Render, Supabase, Stripe, Cloudflare and actual UI sessions. Inspect `git status`, outstanding PRs and branches before edits; preserve unrelated work. Do not overwrite parallel agents' work, leak secrets, special-case a customer, restore V1, or silently change product limits.

Use established design-system/frontend-design skills for later UI implementation and synthesis, but **do not start with cosmetic redesign**. Delegate bounded tasks when useful; the governing agent remains accountable for reviewed code, tests, commits, docs, and approvals. Work through tested PRs. Update `CHANGELOG.md` with meaningful progress and keep this register current with real evidence. Production migrations, DNS changes, merchant/billing activation, credential changes, destructive operations and other high-impact external writes require explicit scope authorization and release gates. The founder's request for a roadmap and execution handoff is **not** automatic authorization to charge, flip live billing, or take down the beta.

## 1. Binding product/architecture decisions

1. **Existing UI is NOT complete.** Features may exist in source while hidden, unfinished, mock-only, broken in production or insufficiently integrated. Record distinct lifecycle stages: planned → coded → deployed → *verified end to end* → UI complete. Never infer one from another. Do not call the product 'feature complete' until every required user journey passes real testing.
2. **One creator home:** all signed-in creator users land on `create.lunchvoice.com` and access a shared dashboard/application. This includes Free Quick Survey, Creator Plus ($5/month), Creator Pro ($15/month), Campaign passes, Starter Hub ($13/month), Team Hub ($29/month), users with multiple Hubs and Hub members with scoped permissions. Free gets a useful studio and dashboard, not a marketing teaser. Entitlements are resolved server-side. A personal Creator subscription follows the account across authorized Hubs; Hub entitlements remain tied to the Hub.
3. **Public/respondent home:** `lunchvoice.com` remains the landing site, public Hub/discovery entry, survey join-by-link/QR/code and guest/player experience. Respondents do not have to sign in unless the survey requires it. Preserve existing public campaign URLs and `/{hubSlug}` routing; no implicit customer-specific subdomains.
4. **Payment:** `pay.lunchvoice.com` is a first-party LunchVoice billing frontend **backed by the existing correct LunchVoice Stripe merchant**. Payment details are handled by Stripe Checkout/Embedded Checkout; never capture raw cards. Support plan review, checkout, authenticated return, payment state, receipts/invoices, Stripe portal, cancellation, downgrade, failed payments and refunds. It currently has a Cloudflare CNAME to GoDaddy paylinks; *do not redirect this before the new app, TLS, return URLs, merchant onboarding, signed webhooks and rollback are verified*.
5. **Operational help/status:** `status.lunchvoice.com` and `help.lunchvoice.com` are desired public V2 properties, with functional /status and /support acceptable temporary fallbacks if independent sites would threaten core launch. `developers.lunchvoice.com` / `api.lunchvoice.com` are later V2 or V2.x; keep `/developers` initially. `insights`, `events`, `research`, `enterprise`, `community` are optional V3 / later. Do not duplicate `auth.kpnsolute.com`; share existing KpnIdentity with explicitly tested cross-host sessions and callbacks.
6. **All systems are actually integrated before final UI synthesis.** Do not declare the app complete because layout components exist; do not mock backend capabilities in production.
7. **Do not accidentally auto-charge everyone:** a global launch enables *the ability to purchase* for eligible users, not automatic subscription enrollment or charges. Existing founding grants expire according to approved policy, without charging anyone without consent. If the founder intended automatic upgrades, reject that interpretation without explicit purchase authorization.

## 2. Correct dependency order and hard acceptance gates

### Phase A: Verify, stabilize, contract
- Inventory the real default branch and deployed commit; map every capability to files, migrations, API contracts, service configuration, entitlement and tests.
- Diagnose and patch priority beta regressions, especially the real external-company Compute survey: Linked Questions (conditional rules/skip/end/shuffle/piping), customization/branding, Save/Reload, answer changes, duplicate submissions and privacy.
- Define server authorization, exact billing schema/price mapping, Discord statistics APIs and the subdomain session model first. Build missing DB/RLS and migrations with a rollback strategy.
- Gate A: canonical DB/permissions tests and live-safe external survey acceptance pass, with no destroyed existing data.

### Phase B: Implement and integrate ALL required services
- Finish survey storage/validation, 21 question kinds and 82-template integrity, Campaign lifecycle, personal/Hubs/memberships, Trends/Ask Again and results analytics. Resolve any incomplete provider services before UI relies on them.
- Finish Discord bot installation/permissions, connect/unlink, server stats sync and API, post delivery health, retries, error feedback. Do not claim 'stats' based on a guild row alone.
- Finish Stripe server-side account-scoped Creator fulfillment + Hub/Campaign fulfillment, subscription lifecycle and webhook verification. Add an audited, **separately armed, idempotent** scheduled billing release controlled by staff (only after explicit go/no-go), merchant readiness, price/webhook checks and emergency pause. A scheduled date by itself cannot open checkout. Track potential no-op/billing-off outcome after missed time.
- Configure and exercise staging domain/TLS/host routing for `create` and `pay`, carefully test KpnIdentity and cross-origin callbacks/CSP. Prepare GoDaddy DNS cutover with documented rollback; do not execute production cutover without approval.
- Gate B: real API/provider integrations pass signed-in and non-owner, renewal, failure, resume and rate-limit/privacy tests. There are no paid plan claims without working services.

### Phase C: Finish FUNCTIONAL frontend UI
- Only after backend contracts work, build or repair the actual `create.lunchvoice.com` authenticated shell and dashboard, Creator and Starter Studios, Campaign Studio, Hub Console, Trends/Results, integrations, settings and account billing with real APIs. Use one repo and one shared design system where possible; hostname-aware routing rather than separate disconnected SPAs.
- The dashboard must work with no Hub, one Hub, multiple Hubs, delegated Hub role, Free, Creator Plus/Pro and Hub Starter/Team; show personal surveys, drafts, recent results, templates, Trends, recent Hubs, notifications/status, create actions and subscription state. Provide discoverable navigation; never hide paid features without an understandable upgrade or permission explanation.
- Build full form states and safe autosave behavior: loading, empty, error, offline/retry, success, purchase unavailable, not entitled, suspended, expired, signed-out, anonymous player and mobile.
- Gate C: real authenticated Playwright smoke tests prove the complete journey for every supported plan and role on desktop and phone; human usability evaluation confirms the UI is actually finished. No simulated response data in production.

### Phase D: FINAL UI SYNTHESIS (only after A+B+C accepted)
- **Not yet done. Do not call this a completed stage.** Consolidate established brand/logo, tokens, typography, navigation hierarchy, layout, cards, controls, charts, and clear paid-vs-free surfaces across the public app, creator home, Hub Console and payment flows.
- Apply installed frontend-design/design-system skills with real existing UI structure, visual reference checks and responsive/a11y analysis. Use a restrained native LunchVoice identity rather than copying Kahoot, Discord or SurveyMonkey.
- Harmonize state handling, CTAs, microcopy, animations, form affordances, empty states, accessibility, mobile navigation and keyboard flows. Build polished visuals **around completed real services**, not placeholders.
- Gate D: consistent experience, 390/768/1280px and light/dark/high-contrast coverage, screen reader/keyboard checks, no inaccessible links and no missing feature surfaces.

### Phase E: Production readiness and cutover
- Rehearse complete production-safe flows, security/privacy audit, Stripe test mode and tightly authorized live verification, legal operator and terms/refunds, monitoring and support. Check deployment and rollback plans and external DNS. Freeze only after tests and owner acceptance.
- Go/no-go date: Dec 10–11; target Dec 12 12:12 PM EST only when all gates pass. If not, beta remains safely available and checkout remains off. Do not force a date by claiming work is complete.

## 3. Service register with baseline evidence, acceptance and proposed dates

**Truthfulness rule:** State comes from the Nov 13 snapshot; re-verify at task start. No invented percentages. Due dates are targets, not estimates of remaining effort.

| Service and entry point | Audited baseline | Required proof before 'Done' | Target |
| --- | --- | --- | --- |
| Public site + survey respondent/player (`lunchvoice.com`) | Deployed; QA required | mobile/guest/link/QR/join/share and anonymous privacy smoke | Nov 17 |
| Identity, sessions, Hub membership (`create` + KpnIdentity) | Backend implemented; cross-host unknown | sign in/out, deep links, token refresh, multi-role separation | Nov 19 |
| Unified creator dashboard and library (`create/home`) | Not yet deployed as subdomain | Free, account creator, multi-Hub dashboard functional | Nov 23 |
| Starter Studio (`create/surveys`) | Exists in source; unfinished UX | real create/save/publish/respond/results on phone | Nov 18 |
| Creator Studio (`create/surveys`) | Rail/canvas/properties in source; incomplete end-to-end UX | correct plan access, logic/branding/reorder/mobile | Nov 21 |
| Linked Questions and survey logic | Migration 000042 deployed; rushed changes | 20+ question role-branch case, server/player parity | Nov 17 |
| Survey personalization and branding | 000043/000048 deployed; needs QA | save/reload/cover/theme/contrast/public render and permissions | Nov 18 |
| 21 question kinds and 82 templates | 000047 deployed; UI paths in repo | all kinds, safety and locked templates in published surveys | Nov 24 |
| Campaigns and passes | Backend/UI implemented; integration QA | schedule, invite, expiry, extensions, targeting and rights | Nov 25 |
| Hubs, roles and community surfaces | Implemented; integration QA | cross-owner/member, scope, roles, pages, moderation | Nov 25 |
| Results, advanced analytics and Present mode | Code + 000044 schema; privacy rule/UX gaps | released/withheld analytics, premium charts/export, projection | Nov 27 |
| Trends and Ask Again | Schema and UI implemented; no real Trends as of snapshot | real repeat campaign history and entitlement limits | Nov 27 |
| Discord connection and guild metrics | One guild and connection; stats RPC not found | real bot command, secure sync, post outcome and failure recovery | Nov 28 |
| Public API/webhooks/dev docs | Partially implemented | scoped keys, secret rotation, retry, rate limit, Discord docs | Nov 28 |
| Creator/Hubs/Campaign Stripe fulfillment (`pay`) | Five product prices configured; Creator Stripe catalog exists; provider_ready=false | account/Hubs scopes, subscriptions, signed events, refunds, portal | Dec 2 |
| Staff scheduled billing enablement | Date scheduled in policy; NO cron launch job | armed/audited/idempotent gated activation; no unauthorized charges | Dec 3 |
| Creator domain/TLS/auth routing | `create` DNS not present at audit | staged host, redirects, callback, cookie/session, fallback | Nov 23 |
| Payment domain migration from GoDaddy | pay CNAME still GoDaddy | functional Stripe app, production-safe DNS cutover/rollback | Dec 2 |
| Public service status and support | standalone hosts not verified | working independent monitoring + documented help/support | Dec 4 |
| Staff operations and launch readiness | Existing staff panel; missing automated release | real operational checks, billing, Discord and incident dashboard | Dec 4 |
| Onboarding and Hub Pulse Lite | Proposed | implement only if P0/P1 accepted; otherwise defer | Dec 5 optional |
| Security/accessibility/operations | Continuous verification | no blocker/high risks; backup, monitoring, RLS, browsers | Dec 9 |
| Final UI synthesis | **NOT COMPLETE, cannot start as final phase before service/UI gates** | consistent polished UI on functional systems with human approval | Dec 5–9 conditional |
| Release candidate and launch | Not approved | end-to-end plan/merchant/DNS/rollback signoff | Dec 10–12 |

## 4. Critical observed discrepancies requiring investigation

- Production `lv.policy` had `billing.launched_at = "2026-12-12T17:12:00Z"`, `billing.provider_ready = false`. Five active `cron.job` entries handled counter trim, Discord dispatch, email dispatch, retention and webhook dispatch. **No billing launch job was present.** `000035`'s staff `open` RPC requires typed `OPEN BILLING` and writes `provider_ready=true` manually. It may reset a future launch date to now. Design a distinct idempotent scheduled path and QA.
- `billing.stripe_prices` mapped the original five paid product families only; no Creator Plus/Pro mappings were observed. Product records for Creator Plus and Creator Pro were `purchasable=false`. The real Stripe products/prices were created on the LunchVoice merchant account and should be verified there, not recreated. Do not switch them live until fulfillment works and authorization is granted.
- Production `lv.plan_limits` held provisional Creator Trends quotas **Plus 3 / Pro 10** even though the newer Google Doc proposed **2 / 5**. Resolve founder decision rather than silently changing actual paid value or marketing copy.
- Discord database had one guild and connection and the dispatch cron, but no deployed `discord_stats_due`/`discord_stats_set` functions. Existing `supabase/functions/discord` is not proof of full bot/stats service health.
- As of audit `create.lunchvoice.com` was not an observed DNS record. `pay.lunchvoice.com` was a proxied CNAME to `paylinks.commerce.godaddy.com`. `hub.lunchvoice.com` was already used for a Cloudflare Worker share-card service; do not repurpose it.
- The Render LunchVoice static site `interact-3npi.onrender.com` had deployed Git commit `11dc12cc82c41fb01a862aa6e87aa931d0d3a1bb` live around 2026-11-13 14:35 UTC. Deploy success is not functional acceptance.
- The original V2 status document is dated Nov 12 and contains stale claims about production migration status. Verify against actual `supabase_migrations.schema_migrations`; do not copy stale 'not applied' statements into a current status.
- The newer handoffs and changelog describe survey response naming, Present mode and 82 templates; verify all are visible and accurate in production with appropriate privacy. Plan-based instant anonymous results was still merely a proposed entitlement in the handoff. Anonymous results must respect canonical suppression; **never loosen privacy as a UI shortcut**.

## 5. Explicit acceptance scenarios (write tests first and retain evidence)

1. **Compute external-company survey:** create 21-question fixture, assign staff/leadership branches, answer and go back, verify only appropriate questions and data persist; branding survives reload; anonymous vs identified correctly withheld; publish/share; mobile form submit; no schema/answer mismatch.
2. **Free first-login:** register/sign in, land at `create.lunchvoice.com/home`, no Hub yet, create an allowed Quick Survey, use free editor, edit and publish, receive legal/limit message for paid capability, access public survey from `lunchvoice.com`.
3. **Creator Plus/Pro:** same dashboard, entitlements persist across authorized Hubs, correct studio/logic/theme/types/trends/analytics and only approved quotas; subscription cancellation locks only premium actions at the right time and never destroys content.
4. **Hub owner and member:** personal/Hub switcher, owner-only settings/roles, invited member cannot see billing/other Hub data without authorization, community submissions work, late/expired Campaign behavior correct.
5. **Discord:** connect guild using bot flow, approve permissions, configure channel, observe real dispatch outcome and stats, handle revoked permissions and reconnect without exposing Discord tokens.
6. **Stripe test flow:** offer matching plan and price, authenticated checkout creation, signed webhook exactly once, granting right account or Hub, retry/duplicate/out-of-order handling, expiration, failed payment, cancel/refund, customer portal. Never enable a live product before end-to-end tests.
7. **Scheduled billing:** staff sets date without opening checkout, separately arms when all gates meet, scheduler runs once at or after time with audited status, blocked readiness leaves closed, manual pause stops new buys without revoking valid entitlements, Founding grant countdown correct.
8. **Subdomain resilience:** all `create/pay/public` routes deep-link and refresh, sign in/out and callback, CSP/CORS, SSL, 404s, staging->production/rollback. Don't delete existing GoDaddy record until the approved cutover.
9. **Visual completion:** after gates, all main routes have consistent navigation/branding on mobile/desktop/light/dark, real error/empty/loading/upgrade states, keyboard and screen reader access. Do not call this passed before a human owner walkthrough.

## 6. Claude's immediate execution instructions

**Do not stop at writing a prettier plan.** Start making bounded, tested changes in the repo after completing startup checks. Prioritize:
1. Reconcile present code/migrations/deployments/PRs with this matrix and Google Docs. Open/maintain a per-service tracker, with actual owner, blockers, acceptance status and linked evidence. Avoid unnecessary repeat work. Establish which exact services are genuinely missing.
2. Reproduce and protect the Compute survey's new Linked Questions/branding behavior with non-customer fixtures and unit/e2e tests; fix any verified regressions before broader changes.
3. Implement or stage the missing backend contracts and integrations, with separately reviewable PRs and clear DB rollback tests. Lead with paid plan fulfillment and staff release scheduling, plus Discord stats. Complete the survey/Campaign/Hub/Trends/results services. **Do not open live billing automatically while doing so.**
4. Implement creator-home routing/auth and a working dashboard for EVERY creator on `create.lunchvoice.com`, using real data, while preserving the beta and approved custom-domain cutovers.
5. Only after backend/service acceptance, complete functional Starter Studio and Creator Studio and all remaining UI flows, then perform the **final** unified UI synthesis. Track each acceptance gate and defer noncritical features without falsely claiming they ship.
6. Execute all available check suites and report commands/results. Produce implementable PRs, GitHub issue updates, `CHANGELOG.md`, and updated docs. For each completed service give: feature, route/subdomain, verified deployed commit, tests (including mobile/roles), production state, remaining risk and next action. Flag blockers honestly. Do not claim work completed if it is only specified.

**Completion response required from Claude:** a dated service matrix of VERIFIED vs PARTIAL vs MISSING, exact code PRs/commits and migrations, real test evidence, deployed vs staged domains, safe billing status, unresolved founder decisions, risks to Dec 12, and the next concrete executable step. The final UI synthesis must be reported as pending until all services and functional UI have passed their gates.
