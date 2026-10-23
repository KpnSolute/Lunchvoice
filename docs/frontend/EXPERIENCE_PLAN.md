# LunchVoice v2 frontend experience plan

Planning deliverable, 2026-10-23. Status: **proposal for review; implementation not started**.
Product rules come from [PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md); backend contracts from
[API_AND_AUTHORIZATION_CONTRACTS.md](../backend/API_AND_AUTHORIZATION_CONTRACTS.md); schedule and
scope options from the [execution roadmap](../backend/EXECUTION_ROADMAP.md). The visual design manager
is the Claude Design project linked in [README.md](README.md). Codex is the liaison to that project;
this plan does not require access to the design tab.

**Design status.** The designer has been asked to build the complete experience from login through all
completion and error states and to provide a downloadable implementation handoff. **That work is
underway and not complete.** Every design artifact below is therefore marked **Pending** unless noted
as *prior reference*. Prior references are older prototypes (a tenant-era zip export read at README level only,
and the design chat's own inventory observed 2026-10-23). They are not verified, not authoritative, and
conflict with the product spec in places (section 2).

Conventions: route examples are proposed engineering names (platform route names beyond the confirmed
Hub and discovery hosts are implementation choices under D-09). `lv_*` names are the proposed RPCs from
the API contracts. "Cap" and "gate" behaviours depend on D-04/D-06/D-08 and are rendered as **not yet
available** when undecided, never as unlimited.

## 1. Principles

1. **Never infer permission from a visible button, payment from a redirect, or anonymity from hiding names.**
   The UI is advisory; every action is re-authorized by the server and shows the server's error.
2. **Hub, not tenant.** User-facing language says Hub and Campaign. Cafeteria wording appears only inside the
   LionCafe Hub (as dining features), never in shared navigation.
3. **Mobile-first.** Primary use is a phone in a cafeteria or dorm. Design from 360 px up.
4. **Mocks are labelled.** Any screen built against a mock contract shows a visible "Preview" marker and is
   not evidence of backend readiness.
5. **Preserve LionCafe usability and deep links** until migration parity is approved. The legacy flow is the Winter Survey fallback.

## 2. Design inventory and reconciliation (all Pending until delivered)

Sources of prior reference, not verified: (a) the design chat's inventory observed 2026-10-23 (core platform,
Hub, survey and workspace screens built; most still in an earlier flat style, samples 7d-7f in the newer
tactile direction); (b) a founder-supplied zip export whose handoff README was read, with components not audited.

| Prior-reference item | Conflicts with the v2 spec | Resolution |
| --- | --- | --- |
| "Tenant", workspace, tenant admin/surveyor/viewer roles | Spec: Hubs, up to 6 custom roles, Owner, three permission categories | Spec wins; designer asked to redraw roles and permissions |
| Email-code sign-in for tenants | Spec: central Google OIDC first, Apple later | Spec wins; email OTP stays only as legacy path |
| Public hubs answer without an account | Spec: guest access is an explicit per-Campaign setting; anonymity is separate | Spec wins |
| Billing, discovery, results, people/roles, branding, moderation, plan selection, account settings, privacy/terms, custom pages, news detail, themes, emails, printable QR: missing or partial | Required by spec | Design-manager work; tracked as R-25 |
| `/discover` route | Spec: directory host `discovery.lunchvoice.com` | Spec wins |
| Signature animation: short tail (84 px max), 6 s loop (calm/default/lively 9/6/4 s), amber pulse, static under reduced motion | Not a product rule | Adopt as visual direction after verification |
| `solute-signature-animated.svg` reported stale (old drifting motion, long line) | n/a | **Do not use** that export; request the updated export |
| Platform LunchVoice branding versus KpnSolute attribution | Unresolved | Founder decision (see roadmap resource gaps); designer asked |

**Design-handoff verification checklist** (run on delivery, before any import): record file name, date/version and hash;
check inventory against section 4 (delivered/partial/missing per flow); check tokens and contrast (body text 4.5:1,
non-text controls 3:1, accent never as text on light unless it passes); verify reduced-motion and static states; verify CTA/signature
alignment at 375/768/1280 px; confirm stale exports are replaced; confirm no entitlement, price or limit is invented in prototypes
(for example Campaign Plus price, Team total cap); log every conflict with the spec instead of importing it.

## 3. Shared requirements (apply to every flow)

### 3.1 States every screen must define

| State | Behaviour |
| --- | --- |
| Loading | Skeleton after 300 ms; no layout shift; announced politely |
| Empty | Explains what belongs here and the next action allowed by the user's capabilities |
| Success / completion | Clear confirmation, what happens next, undo where safe |
| Validation error | Field-level, linked by `aria-describedby`; focus moves to first error |
| `lv_unauthenticated` | Preserve return route, go to sign-in |
| `lv_forbidden` / `lv_not_member` | Explain what is needed (join, ask admin) without revealing private details |
| `lv_not_found` / `lv_hub_mismatch` | Same neutral not-found page (no existence leak across Hubs) |
| `lv_quota_exceeded` | Show used/limit and the next action (close a Campaign, upgrade); `limit: null` shows "not available yet" |
| `lv_gate_unmet` | Show scope, numerator/denominator, unmet requirement, next action |
| `lv_entitlement_missing` | Plan explanation; never a purchase path for an unapproved SKU |
| `lv_policy_undecided` | "Not available yet" state; never treated as allowed |
| `lv_conflict` | Refetch and offer retry |
| `lv_rate_limited` | Wait message with retry time if given |
| Offline / slow network | Participation answers queue locally and say so; privileged actions are blocked, not queued |
| Session expired / revoked | Sign-in with return route; unsaved drafts kept locally where safe |
| Provider outage | Identity or billing outage page with legacy/maintenance guidance |

Every error shows the server's `request_id` in a copyable support detail.

### 3.2 Responsive requirements

Breakpoints to test: **360, 375 (phone), 768 (tablet), 1024, 1280 (desktop)**. No horizontal scroll at 360.
Navigation: bottom tab bar on phone for participant surfaces; sidebar on desktop for creator workspace. The
Hub Builder keeps its three functions (page navigation, live preview, contextual settings) on narrow screens
via a stepped or tabbed layout, not squeezed columns. Touch targets target 44 CSS px (design reference), above the WCAG 2.2 AA minimum of 24 px.
Respect safe-area insets. Charts reflow and keep a data table alternative at every size.

### 3.3 Accessibility requirements (WCAG 2.2 AA baseline)

Keyboard operable everywhere; visible focus (not obscured by sticky bars); logical heading order and landmarks; radiogroups use arrow keys;
errors and toasts announced (`role="status"` / `alert`); form labels and instructions; no color-only state (selected = shape/glyph + color);
contrast per checklist; charts have hidden data tables and focusable points; drag interactions have keyboard alternatives (ranking, page ordering);
reduced-motion path for the signature, jelly/spring, ticker, flaps and shimmer (static final state); screen-reader names for custom role icons;
language attribute; no auto-playing motion longer than 5 s without pause; consent and privacy text readable at 200% zoom.

### 3.4 Acceptance evidence codes

| Code | Evidence |
| --- | --- |
| E1 | Component tests (all states in 3.1 rendered) |
| E2 | Contract tests against the real RPC/Edge Function in staging; mocks do **not** satisfy this |
| E3 | End-to-end run (Playwright or equivalent) at 375, 768 and 1280 px |
| E4 | Automated accessibility scan (axe or equivalent) plus manual keyboard and screen-reader pass; findings logged |
| E5 | Visual review against the delivered design artifact (marked **provisional** if the artifact is missing) |
| E6 | Reduced-motion and high-contrast / forced-colors check |
| E7 | Privacy/denial test: another Hub's user, non-member, guest, revoked role, and anonymous-identity paths |
| E8 | Concurrency/retry check from the UI (double click, stale screen, retry) where state changes |

Each flow row names the codes it requires. Compilation, screenshots alone, or a visible control are never sufficient.

## 4. Flow inventory

Columns: **ID**, flow and key states beyond 3.1, route (proposed), API/data dependencies, permission/entitlement, roadmap item, responsive/accessibility specifics, evidence, design artifact.
Design artifact for every row is **Pending** (designer building) unless "prior reference" is noted; prior references are unverified.

### 4.1 Platform and public

| ID | Flow and states | Route | API / data | Permission / entitlement | Item | Responsive / a11y specifics | Evidence | Design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | Landing: value proposition, waitlist CTA, use cases, "Every voice, counted." candidate headline, signature CTA | `/` | none (static) + waitlist status | public | R-10, R-24 | CTA alignment at 3 breakpoints; ticker static under reduced motion | E3 E4 E5 E6 | Pending (prior ref: Landing) |
| F-02 | Pricing and plan selection: Starter $13/mo, Team $29/mo, Campaign Starter $19 + $13/extra week, name reservation $25/12 mo; **Campaign Plus shown as "pricing pending", not purchasable** | `/pricing` | `lv_entitlements` for signed-in Hub; plan catalog | public; checkout only when approved | R-12 | Comparison collapses to cards; "pending" state has no CTA | E1 E3 E4 E5 | Pending (missing in inventory) |
| F-03 | Waitlist: form, success, duplicate, closed, beta-full | `/waitlist` | `lv_waitlist_join` | public; rate limited | R-10 | Inline validation, no CAPTCHA unless needed | E2 E3 E4 | Pending |
| F-04 | Join by code or QR: 6-digit entry, resolve, error ("no Campaign with that code"), expired, closed, wrong Hub | `/join`, `/s/{code}` | `lv_campaign_resolve` | public or guest token per Campaign | R-14, R-15 | One hidden numeric input with six visual boxes; paste and auto-submit; screen-reader label | E2 E3 E4 E7 | Pending (prior ref: code input) |
| F-05 | Discovery directory: list, search, filter, empty, Hub card with member count | `discovery.lunchvoice.com` | approved public projection | public; only approved Hubs; 699 vs 700 shown only in Hub settings | R-18 | Card grid reflows; focus order | E2 E3 E4 E7 | Pending (missing) |
| F-06 | Public Hub landing: Hub card, public Campaigns, join button, member count, limited actions for non-members | `/{hubSlug}` | `lv_hub_public`, `lv_my_context` | public; actions gated by membership | R-11, R-24 | Header band contrast check | E1 E2 E3 E4 E7 | Pending (prior ref: 4a) |
| F-07 | Private Hub gate: request access, invite code, pending, denied, approved | `/{hubSlug}` | `lv_join_hub` | signed-in account | R-07 | Clear pending state, no data leak | E2 E7 E3 | Pending (prior ref: 4b) |
| F-08 | Legal and support: privacy, terms, support, data request | `/privacy`, `/terms`, `/support` | static + contact | public | R-22 | Readable at 200% zoom | E4 E5 | Pending (missing) |
| F-09 | Not found, reserved name, released slug page, maintenance, outage | any | `lv_hub_public` | public | R-11, R-13 | Neutral copy; never reveals prior owner or private data | E1 E3 E7 | Pending (prior ref: 404 hub) |

### 4.2 Identity and account

| ID | Flow and states | Route | API / data | Permission / entitlement | Item | Responsive / a11y specifics | Evidence | Design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-10 | Sign in with Google: start, return-route preservation, consent in progress | `/signin` | central identity start (D-01) | public | R-06, R-24 | Single primary button; no password fields; Apple shown only as "coming later", not as a working button | E2 E3 E4 | Pending (prior ref: 3a, email-based; conflicts) |
| F-11 | Callback and failure states: cancelled consent, provider error, wrong account, expired link, conflicting account (recovery path), provider outage, revoked access | `/auth/callback` | identity callback; account linking result | public | R-06 | Recovery instructions; support `request_id`; no raw error text | E1 E2 E3 E7 | Pending |
| F-12 | Legacy sign-in (email OTP; MJCC staff bridge) during transition | `/{hubSlug}/login` | existing `login-start`, `staff-login`, `staff-sso` | legacy; must not restore revoked v2 rights | R-06, R-07 | Clearly labelled legacy; timeout messages | E2 E3 E7 | Pending (existing UI is reference) |
| F-13 | Account creation and profile (display name, avatar), first-run | `/account/new` | account row from identity; `lv_my_context` | signed-in | R-07 | Avatar alt text and size limits (asset policy pending) | E1 E2 E3 E4 | Pending (prior ref: 4d) |
| F-14 | Account and Hub switcher: list accepted memberships, pending, switch, create/join Hub | header control | `lv_my_context` | accepted memberships only | R-07, R-24 | Keyboard listbox; searchable at many Hubs | E1 E3 E4 E7 | Pending |
| F-15 | Participant dashboard: my Hubs, my Campaigns, receipts, points per Hub | `/me` | `lv_my_context`, `lv_my_receipts`, `hub_member_stats` | signed-in | R-24 | Mobile bottom tabs; desktop layout variant | E2 E3 E4 | Pending (prior ref: 4e/4f) |
| F-16 | Account settings: identity, privacy, data export/delete request, sessions, sign-out | `/me/settings` | account RPCs (policy D-10) | signed-in | R-22 | Destructive confirm dialog; export wording pending D-10 | E1 E3 E4 | Pending (missing) |
| F-17 | Sign-out, expired session, revoked membership/role mid-session | global | session events; `lv_my_context` refetch | any | R-06, R-08 | Announce loss of access; keep safe drafts | E3 E7 E8 | Pending |

### 4.3 Participation

| ID | Flow and states | Route | API / data | Permission / entitlement | Item | Responsive / a11y specifics | Evidence | Design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-18 | Campaign landing: title, window, audience, anonymity disclosure, consent copy, start | `/{hubSlug}/c/{campaignId}` | `lv_campaign_resolve` | per audience rule; guest only if enabled | R-14, R-15 | Anonymity statement visible before first answer | E2 E3 E4 E7 | Pending (prior ref: 3f) |
| F-19 | Question flow, one per screen: rating, slider, yes/no, single, multi, NPS, short and long text, ranking; progress, back, skip, save draft | `/{hubSlug}/c/{id}/q/{n}` | question revision; `lv_submit_response` | audience rule | R-15 | Arrow keys in radiogroups; ranking keyboard alternative; 44 px targets | E1 E3 E4 E6 | Pending (prior ref: 3g, tactile 7c) |
| F-20 | Poll, election (**contract TBD, D-08**), seasonal activity | same | mode contracts TBD | per D-08 | R-15 | Placeholder screens labelled "contract pending"; election vote edit/timing rules not designed until approved | E1 | Pending (election/seasonal: not designed) |
| F-21 | Completion: receipt, points awarded, share/next Campaign; duplicate-submit message; submission retry | `/{hubSlug}/c/{id}/done` | `lv_submit_response` result, `lv_my_receipts` | participant | R-14, R-15 | Announce success; no identity shown for anonymous | E2 E3 E8 | Pending (prior ref: 3h) |
| F-22 | Not open yet, closed, expired, wrong Hub, audience denied, already submitted, offline queue, guest token expired/revoked | same | `lv_campaign_resolve` errors | any | R-14 | Generic denial for forged tokens | E1 E3 E7 | Pending (prior ref: closed/offline) |
| F-23 | Points, leaderboard (groups by default; individuals only if opted in), shop, orders | `/{hubSlug}/store`, `/leaderboard` | `hub_member_stats`, `points_ledger`, shop RPCs | accepted member; hidden from signed-out | R-16 | Opt-in privacy copy; table alternative | E1 E2 E3 E4 E7 | Pending (prior ref: 5b/5c) |
| F-24 | Newsroom list and post detail; Comments (pre-moderated, anonymous display names) | `/{hubSlug}/news`, `/comments` | page/content RPCs | follows page audience; posting needs capability | R-16 | Moderation status visible to author | E1 E2 E3 E4 E7 | Pending (prior ref: 5d/5e; post detail missing) |
| F-25 | Legacy dining: menu, rate dish, voice notes, orders (LionCafe) | `/{hubSlug}/menu`, `/rate`, `/voice`, `/orders` | existing tables/RPCs | accepted member of LionCafe | R-11, R-19 | Parity with current UI; no regression | E3 E4 | Existing UI is the reference |

### 4.4 Creator workspace

| ID | Flow and states | Route | API / data | Permission / entitlement | Item | Responsive / a11y specifics | Evidence | Design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-26 | Hub creation onboarding: name, slug (reserved/taken/available), visibility, plan state ("beta access" if manual grant; checkout only when billing exists) | `/create` | slug check RPC, `lv_entitlements`, `lv_beta_admit` | signed-in; beta admission cap; plan per D-06/D-07 | R-10, R-12 | Slug rules shown live; reserved names explained | E2 E3 E4 E8 | Pending (missing; prior ref: "create organization" footer) |
| F-27 | Workspace overview: active counts vs caps, gate status, recent results | `/{hubSlug}/admin` | `lv_entitlements`, `lv_gate_status` | any role with relevant capability | R-09, R-24 | Used/limit with text, not color-only | E2 E3 E4 | Pending (prior ref: 3c/3d) |
| F-28 | Campaign list; template picker; create draft | `/admin/campaigns` | `lv_campaign_create` | `community.campaign.draft` | R-15 | Table becomes cards on phone | E2 E3 E4 | Pending (list partial; picker missing) |
| F-29 | Campaign builder: questions, revision, preview | `/admin/campaigns/{id}/build` | `lv_campaign_update` | `community.campaign.draft` | R-15 | Reorder with keyboard; mobile preview | E1 E2 E3 E4 | Pending (prior ref: 3e) |
| F-30 | Share and schedule: QR, join code, link, poster, audience (members/roles), guest toggle, anonymity toggle, schedule (America/New_York shown) | `/admin/campaigns/{id}/share` | schedule RPCs, share token RPC | `community.campaign.audience`, `.activate` | R-14, R-15 | Time shown with zone; DST note on Nov 1 | E2 E3 E4 E7 | Pending (prior ref: 3e share panel; poster missing) |
| F-31 | Activation: success, `lv_quota_exceeded`, `lv_gate_unmet`, entitlement missing, undecided policy, double-click/retry | within F-30 | `lv_campaign_activate` | capability + entitlement | R-09 | Show numerator/denominator, scope, next action | E2 E3 E4 E8 | Pending |
| F-32 | Results and analytics: live and historical, comparisons, trends, breakdowns, suppressed small groups, freshness label | `/admin/campaigns/{id}/results` | `lv_analytics_query` | `community.analytics.view` | R-17 | Hidden data table; "suppressed" explained | E2 E3 E4 E7 | Pending (results page missing; chart styles prior ref) |
| F-33 | Exports and embeds: create, revoke, audit trail | within F-32 | export/embed RPCs | `.analytics.export`, `.publish`; plan boundary D-06 | R-17 | Revoke confirms; embed shows aggregate-only notice | E2 E7 E8 | Pending (missing) |
| F-34 | People: members, join requests, invites, suspend/remove, directory visibility | `/admin/people` | membership RPCs | `admin.members.*` | R-07 | Bulk actions keyboard-safe | E2 E3 E4 E7 | Pending (missing) |
| F-35 | Roles and permissions: up to 3/6 custom roles, name, icon, group and individual toggles, assign, **Owner transfer** (two-step), cannot delete Hub except Owner | `/admin/roles` | role RPCs, `lv_owner_transfer_*` | `admin.roles.manage`; Owner-only for delete/transfer | R-08 | Slot meter; icon alt text policy; destructive dialogs | E2 E3 E4 E7 E8 | Pending (missing; prior roles model conflicts) |
| F-36 | Hub Builder (three panels): page navigation, live preview (desktop/mobile), contextual settings; drafts and publish | `/admin/builder` | page RPCs | `structure.*`; page quota (3 Starter) | R-16 | Stepped layout on phone; preview parity | E1 E2 E3 E4 E5 | Pending (prior ref: 5a) |
| F-37 | Pages: Home & Campaigns, Shop, Leaderboard, Newsroom, Comments, custom, external links; view/edit/publish and audience are independent | `/admin/pages` | page RPCs | `structure.pages.*` | R-16 | External-link warning; sanitized content | E2 E3 E4 E7 | Pending (custom pages missing) |
| F-38 | Branding: logo, color (contrast-checked), preview | `/admin/branding` | branding RPCs | `structure.branding.edit` | R-16 | Reject failing contrast with explanation | E1 E3 E4 | Pending (missing) |
| F-39 | Currency, shop items, redemptions queue | `/admin/shop` | shop RPCs | `structure.currency.edit`, `community.shop.manage` | R-16 | Approve/deny with undo | E2 E3 E4 | Pending (redemptions missing) |
| F-40 | Moderation queue (comments, free text) | `/admin/moderation` | moderation RPCs | `community.moderate` | R-14, R-16 | Privacy: no author identity for anonymous | E2 E3 E7 | Pending (missing) |
| F-41 | Billing and plan: current plan/grant (subscription, `manual` beta access, seasonal window with activation-based dates), renewal, name reservation term and grace, invoices | `/admin/billing` | entitlement/billing RPCs | `admin.billing.*` | R-12, R-13 | Three clocks shown separately; undecided prices absent | E2 E3 E4 E7 | Pending (missing) |
| F-42 | Seasonal Campaign purchase/schedule: choose weeks, price breakdown ($19 + $13 per extra week), schedule start, "window starts at activation" notice; **Plus disabled** | `/admin/seasonal` | price calculator, checkout (only if billing ships) | `admin.billing.manage` | R-12 | Price shown with formula; never copies Starter price to Plus | E2 E3 E4 E8 | Pending (missing) |
| F-43 | Discovery application: eligibility (699 no / 700 yes), apply, status, delisted | `/admin/discovery` | `lv_discovery_apply` | `admin.discovery.apply` | R-18 | Plain-language eligibility | E2 E3 E4 E7 | Pending (missing) |
| F-44 | Hub settings: membership mode, directory visibility, delete Hub (Owner), retention notice | `/admin/settings` | settings RPCs | `admin.settings.edit`; delete Owner-only | R-08 | Delete needs typed confirmation; policy pending D-10 | E2 E3 E4 E7 | Pending (prior ref: 4c visibility) |
| F-45 | Beta invitation: accept admission, terms (as approved), first Hub | invite link | `lv_beta_admit` | invited account | R-10 | Terms text pending D-07 | E2 E3 E4 | Pending (missing) |

### 4.5 Operator, messages and print

| ID | Flow and states | Route | API / data | Permission / entitlement | Item | Responsive / a11y specifics | Evidence | Design |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-46 | Winter Survey operator view (needed for the **Dec 11** MJCC launch; must be accepted by the operator before the **Dec 9** review): create from the approved questionnaire, schedule, live participation, close, results, **switch to legacy fallback** | within F-27..F-32 | as above + fallback runbook | operator role (to be named, D-12) | R-21 | Phone-friendly live counts; unmistakable fallback control | E2 E3 E4 E7 E8 | Pending (questionnaire/dates not provided; D-12 open) |
| F-47 | Email templates: waitlist confirmation, beta admission, invite, join approval, renewal and grace reminders, receipts | n/a | email provider (ACS verification unverified) | n/a | R-20 | Plain-text alternative; localized dates in America/New_York | E4 E5 | Pending (missing) |
| F-48 | Printable QR poster | `/admin/campaigns/{id}/poster` | share token | `community.campaign.activate` | R-15 | Print stylesheet; contrast | E4 E5 | Pending (missing) |
| F-49 | Themes: dark and high-contrast tokens | global | none | any | R-24 | Forced-colors outline on raised controls | E4 E6 | Pending (missing) |

## 5. Navigation model

- **Platform header:** logo, Pricing, Discover (link to the discovery host), Sign in or account/Hub switcher. No cafeteria items.
- **Hub navigation:** only enabled pages appear; "Home & Campaigns" is always on; order and labels come from the Hub's configuration.
- **Participant bottom tabs (phone):** Home, Campaigns, Shop (if enabled), Me.
- **Creator workspace sidebar:** Overview, Campaigns, People, Roles, Pages/Builder, Branding, Shop, Moderation, Billing, Discovery, Settings; items appear only if the user holds a capability (server still enforces).
- **Reserved platform paths** (see roadmap R-11) are registered before the Hub catch-all so `/pricing`, `/me`, `/join`, `/signin`, `/waitlist`, `/create` never resolve as Hubs.

## 6. Reusable components (build once, in `src/ui/`)

Buttons and icon buttons; inputs (text, select/listbox, code input, search, counters); toggle/checkbox/radio/segmented/stepper;
question widgets (rating, slider, yes/no, single, multi, NPS, text, ranking); cards and surfaces; navigation (header, sidebar, bottom tabs, breadcrumb);
Hub switcher; slot meter and gate meter (used/limit, numerator/denominator, next action); permission matrix editor; role chip with icon;
page tree and live preview frame; chart set (line/area, bars, stacked distribution, donut) with data-table companion and suppression state;
feedback components (alert, toast with undo, empty, skeleton, error with `request_id`); dialogs (confirm destructive, typed confirmation);
signature component (static and animated variants, reduced-motion safe). Existing code to reuse or adapt: `Layout`, `Icon`, `charts`, `QRCard`, `Confetti`, `ContentCentral`.

## 7. Data and permission dependency map (summary)

| Flow area | Contracts | Capability / entitlement gates | Cross-Hub / privacy tests |
| --- | --- | --- | --- |
| Identity, account, Hub switch | `lv_my_context`, identity callback | accepted membership | two Hubs, pending, revoked |
| Participation | `lv_campaign_resolve`, `lv_submit_response`, `lv_my_receipts` | audience, guest proof | anonymous identity paths, forged token |
| Creator workspace | campaign RPCs, `lv_entitlements`, `lv_gate_status` | `community.*`, caps, gate | cross-Hub IDs, last-slot race |
| Roles and ownership | role RPCs, owner transfer | `admin.roles.manage`, Owner-only | escalation, zero/two Owners |
| Builder and pages | page RPCs | `structure.*`, 3-page quota | view/edit/publish independence |
| Analytics | `lv_analytics_query`, export/embed | `community.analytics.*`, plan | suppression, differencing |
| Billing and reservations | entitlement/billing RPCs, events | `admin.billing.*` | forged success, duplicate events, slug reclaim |
| Discovery and beta | discovery/waitlist RPCs | eligibility, 50-owner cap | 699/700; 50th/51st |

## 8. Plan-dependent UI rules

- Starter and Team limits shown only as approved: 3 vs 6 custom roles (Owner excluded), 3 Starter custom pages, 15 Starter active Campaigns,
  2 Starter / 5 Team active Surveys, gates >50% / >=20% (within caps). Team total Campaign cap, page allocation and mode matrix: **TBD**, rendered as "not yet available".
- **Campaign Plus** has no price and no purchase control anywhere until approved (D-08).
- If billing is postponed (roadmap 8.2), billing screens show "Beta access" / "Checkout opens later" states and no payment fields.
- Name reservation UI shows term and the 25-calendar-day grace as separate states; timezone boundaries pending D-09.

## 9. Acceptance and delivery sequence

**Milestones (founder message relayed 2026-10-23):** M1 = MJCC Hub and Winter Survey launch **Dec 11** (go/no-go
recommended **Dec 9**, final checks Dec 10); M2 = v2 main public release **Dec 23**. Flows in steps 1-3 and 7 below
are M1 candidates (what the Winter Survey and MJCC Hub need); steps 4-6 are M2 candidates unless the founder pulls them into M1
([roadmap section 5.1](../backend/EXECUTION_ROADMAP.md#51-milestone-mapping-proposal-founder-decides-what-belongs-to-m1-versus-m2)).
The designer's handoff is needed by **Nov 6** (shell, participation, operator flows) and **Nov 13** (all M1 flows).

1. **Foundation (R-24):** tokens, `src/ui/` primitives, F-10..F-15, F-27 shell with mock contracts labelled Preview; E1, E4, E5-provisional.
2. **Participation (R-14/R-15):** F-04, F-18..F-22; E2 against staging, E3, E4, E6, E7.
3. **Workspace core (R-08/R-09):** F-26..F-31, F-34, F-35; E2, E3, E4, E7, E8.
4. **Community and Builder (R-16):** F-23, F-24, F-36..F-40.
5. **Analytics and discovery (R-17/R-18):** F-32, F-33, F-43.
6. **Commerce (R-12/R-13) if approved:** F-02, F-41, F-42.
7. **Release (R-21/R-22):** F-46, full E3/E4/E6 regression, operator rehearsal.

A flow is "done" only when its listed evidence codes are attached to the PR and the design status is either delivered-and-verified or explicitly "provisional".

## 10. Questions and asset requests for Codex to relay

To the Claude Design manager (answers or artifacts needed; mark each as delivered / partial / not planned):

**Scope and state coverage**
1. Please provide a **state matrix** for every screen in section 4: loading, empty, success, validation error, denied, not found, quota/gate, undecided ("not available yet"), conflict, offline, session expired, provider outage. Confirm which are designed.
2. Which screens remain missing from your inventory? We expect at least: plan selection, account settings, discovery, privacy/terms, custom pages, news detail, results, people/roles, branding, redemptions, moderation, billing, themes, emails, printable QR poster, Hub creation onboarding, beta invitation, waitlist, auth callback failures.
3. Please draw **Hub-based** (not tenant) navigation; remove cafeteria language from shared navigation; keep dining inside the LionCafe Hub.

**Identity and roles**
4. Sign-in is **Google first** (Apple later, no email verification). Provide sign-in, callback failure (cancelled, provider error, wrong account, conflicting account, outage), and sign-out/expired states. Apple must appear only as "coming later".
5. Roles: up to 3 (Starter) or 6 (Team) **custom** roles plus a protected Owner that uses no slot; each role has a name and icon; permissions come in three categories (Administration, Hub Appearance & Structure, Community & Campaigns) with **group-wide and individual toggles**; only the Owner can delete or transfer the Hub (two-step transfer). Please provide the editor, slot meter, assignment, and transfer flows. What icon set and upload rules do you propose?

**Participation and privacy**
6. Provide **guest** and **anonymous** disclosure patterns (they are different): when the person is signed in, a guest, or anonymous, and what the Hub administrators can and cannot see. Draft consent copy for review.
7. Question types: please include **ranking** and the poll, election and seasonal-activity placeholders labelled "contract pending" (election/poll/seasonal rules are not decided).

**Quotas, gates, plans**
8. Provide a quota/gate component showing used/limit, numerator/denominator, scope, unmet requirement and next action. Undecided limits must render as "not available yet", not unlimited.
9. Pricing: Starter $13/month, Team $29/month, Campaign Starter $19 for 2 weeks +$13 per extra week, name reservation $25 per 12 months (25-day grace). **Campaign Plus price is not decided: show "pricing pending" with no purchase button.** Do not invent Team caps or extra prices.
10. Provide "Beta access / checkout opens later" billing states in case billing is postponed.

**Analytics, Builder, discovery**
11. Analytics: charts with data-table alternatives, suppressed small-cohort state, freshness label, export and embed flows (embed shows aggregate-only notice).
12. Hub Builder: confirm the three-panel layout (page navigation, live preview, contextual settings) and give the **narrow-screen** layout; show view/edit/publish as separate permissions and the 3-page Starter slot meter.
13. Discovery: eligibility states (699 not eligible / 700 may apply), application status, and delisted.

**Visual system and assets**
14. Deliver tokens as **CSS custom properties and a TypeScript export** with light, dark and high-contrast themes; list contrast ratios for text and controls; confirm the accent is never used as text on light unless compliant.
15. Signature: provide the **updated** animated SVG (the existing `solute-signature-animated.svg` is reported to carry the old drifting motion and long line), the reduced-motion static version, the real signature path to replace the stand-in lettering, CTA alignment specs at 375/768/1280, and calm/default/lively timings.
16. Branding attribution: LunchVoice-only on platform surfaces versus a KpnSolute mark. Which does the design assume, and what options do you recommend? (Founder decision.)
17. Fonts: confirm licenses and self-hosting versus a font service for Bricolage Grotesque, Geist and Space Mono (or the final set), and provide an asset manifest.
18. Email templates (waitlist, beta admission, invite, join approval, renewal and grace reminders, receipts) with plain-text versions; printable QR poster with print specs.
19. Handoff format: a **downloadable package** with artifact-to-screen mapping, version/date, change log from the prior export, per-screen annotations (breakpoints, states, keyboard order, focus, ARIA names), icon set as SVG with accessible names, and a list of which prototype behaviours are illustrative only (no entitlement, price or limit should be invented in prototypes).

Returned artifacts will be verified with the checklist in section 2 before any import.

## 11. Risks and dependencies

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Design handoff late | Visual acceptance only provisional; rework later | Build to tokens and component rules; keep E5 provisional; R-25 latest delivery Nov 13 |
| Prototype entitlements differ from spec | Wrong limits or prices ship | Verification checklist; spec wins; log conflicts |
| Backend contracts not ready for UI | Mock-only screens | Label Preview; E2 required before "done" |
| Route namespace collision | Platform pages unreachable or claimable as Hubs | R-11 reserved names and route order |
| Accessibility debt from motion-heavy direction | Failing reduced-motion / focus | E4/E6 gates on every PR |
| D-12 unresolved | Operator flow undefined | Fallback to legacy flow; keep F-46 provisional |
