# Backend architecture: a modular base to build on (proposal, 2026-11-10)

Status: proposal for the founder and the backend thread. No migration is written or applied by this document. It
keeps every contract in `CLAUDE.md` ("Architecture and Security Contracts") and reorganises how the backend is
*described, extended and scaled*, so the next ten features land in known places.

## 1. Shape (unchanged, and correct)

```
Browser (static React on Render)
   │  LunchVoice session token (ES256, from `session`)
   ▼
PostgREST ── lv_api.*  thin wrappers: catch, envelope, grant        ← the only exposed schema
                │
                ▼
             lv.*      private: tables (RLS on), rules, engines     ← all logic
                ▲
Edge Functions: session · checkout · billing-webhook · api (/v1) · discord · *-dispatch
                ▲
Outside world:  KpnIdentity · Stripe · Resend · Discord · customers' API clients
```

One database is the system. Edge Functions exist only where the database cannot do the job: verifying a foreign
signature, holding a secret, or calling out. That rule stays.

## 2. Problems this proposal solves

1. Nobody can find a module. The code is organised by the week it was written (finding B-5).
2. Modules reach into each other freely, so a change to Campaigns can break Community without a signal.
3. Cross-cutting needs (limits, jobs, events, feature switches) are solved again in each module.
4. The hot path (a guest answering) carries locks and counts that will not survive a busy survey (B-1).

## 3. Modules

Ten modules. Every table, function, test and document section belongs to exactly one. The **kernel** is the only
module others may depend on freely; all other dependencies point one way, down this list.

| # | Module | Owns (tables) | Public operations (prefix) | May call |
| --- | --- | --- | --- | --- |
| 0 | **kernel** | `policy`, `audit_events`, `reserved_slugs`, `capabilities`, `session_exchanges`, rate windows, *new:* `jobs`, `outbox`, `feature_flags`, `product_events` | `lv_capability_catalog` | – |
| 1 | **identity** | `accounts`, `account_identities`, `account_suspensions` | `lv_my_context`, `lv_profile_*`, `lv_account_*` | kernel |
| 2 | **entitlements** | `products`, `plan_limits`, `entitlements`, `hub_credits`, `waitlist_*` | `lv_plan_limits`, `lv_waitlist_*` | kernel, identity |
| 3 | **hubs** | `hubs`, `hub_memberships`, `roles`, `role_capabilities`, `membership_roles`, `hub_invites`, `hub_invite_redemptions`, `owner_transfer_offers`, `hub_tombstones`, `hub_suspensions`, `hub_reservations` | `lv_hub_*`, `lv_member_*`, `lv_role_*`, `lv_invite_*`, `lv_owner_*` | kernel, identity, entitlements |
| 4 | **campaigns** | `campaigns`, `campaign_versions`, `campaign_questions`, `campaign_audience_roles`, `campaign_invites`, `campaign_eligibility` | `lv_campaign_*`, `lv_quick_survey_*` | 0 to 3 |
| 5 | **participation** | `participation`, `guest_participation`, `submissions`, `answers`, `join_code_misses` | `lv_submit_response`, `lv_guest_*` | 0 to 4 |
| 6 | **analytics** | `analytics_releases`, `analytics_query_log`, *later:* `analytics_cells` | `lv_analytics_*`, `lv_campaign_responses` | 0 to 5 (read only) |
| 7 | **community** | `hub_pages`, `hub_community`, `news_posts`, `comments`, `comment_reports`, `comment_report_reviews`, `leaderboard_optins`, `campaign_points`, `shop_items`, `shop_orders`, `discover_*` | `lv_hub_pages_*`, `lv_news_*`, `lv_comment_*`, `lv_shop_*`, `lv_discover_*` | 0 to 4 |
| 8 | **billing** | `billing_customers`, `billing_subscriptions`, `billing_events`, `checkout_intents` | `lv_checkout_*`, `lv_billing_*`, `lv_hub_reservation_*` | kernel, identity, entitlements, hubs |
| 9 | **integrations** | `api_keys`, `webhook_*`, `discord_*`, `email_outbox` | `lv_api_key_*`, `lv_webhook_*`, `lv_discord_*` | any, through that module's public `lv.*` functions only |
| – | **staff** | `platform_admins`, `platform_admin_events`, `abuse_reports`, `beta_*` | `lv_admin_*`, `lv_report_abuse` | any (read), acts through the owning module's functions |

### Rules of the module system

1. **A module's tables are written only by that module's functions.** Another module that needs a change calls a
   function. (Analytics reads participation tables; that is the one standing exception, and it never writes.)
2. **Dependencies point down the list.** Campaigns may ask entitlements "is this allowed"; entitlements never
   mentions a Campaign. When a lower module must react to a higher one, it listens to an event (§5), it is not called.
3. **Every public operation is a pair:** `lv.api_<name>` holds the logic and returns the envelope;
   `lv_api.lv_<name>` is a one-line wrapper that catches unexpected faults. Grants are per function; `anon` gets only
   the allow-listed signed-out surface. (This is today's practice, written down.)
4. **Limits are asked, never computed locally.** One function, `lv.limit_check(hub, key, requested)`, reads
   `lv.plan_limits` through the active entitlement and returns allow or the standard `lv_limit_reached` envelope.
   No module contains a number.
5. **A feature that is not finished or not launched sits behind a flag** (`lv.feature_enabled(hub, key)`), not
   behind UI hiding alone.

### Making modules visible without rewriting history

The migration chain stays the deployment truth and is never edited. Three additions make the modules real:

- **`supabase/modules/MODULES.md`**: the table above, plus for each module its tables, public operations, the events
  it emits and consumes, and its test files. This is the map an agent reads first.
- **`supabase/modules/<module>/current.sql`**: a generated, read-only snapshot of the module's *current* function
  bodies, dumped from a freshly migrated database by a script (`scripts/db-snapshot-modules.sh`, run inside the
  canonical test job). It answers "what does `lv_campaign_get` do today" in one file instead of five. CI fails when
  the snapshot is stale, so it cannot drift.
- **Migration naming from now on:** `0000NN_v2_<module>_<change>.sql`, one module per migration where possible
  (`000029_v2_participation_guest_limits.sql`). A migration that must touch two modules says so in its header.

A catalog test enforces rule 1 cheaply: every `lv` function carries a comment tag `module:<name>`; the test lists
functions whose body writes to a table owned by another module and fails on any not on a short allow-list.

## 4. Kernel services (build once, use everywhere)

| Service | What it is | Replaces |
| --- | --- | --- |
| **Policy** | `lv.policy` key/value, exists | – |
| **Limits** | `lv.limit_check`, one entry point over `plan_limits` | per-module limit code in `000014`, `000018`, `000020` |
| **Feature flags** | `lv.feature_flags(key, scope, hub_id, enabled, note)`; `lv.feature_enabled(hub, key)`; returned in `lv_my_context` and `lv_hub_get` so the UI can hide entry points | ad-hoc "Coming with M2" states; for unfinished features only; no Labs switch (F-20) |
| **Outbox** | one `lv.outbox(id, topic, payload, run_after, attempts, state)` with a dispatcher per channel (email, webhook, Discord) reading its own topic | three separate outbox tables; migrate lazily, new channels use the shared one |
| **Jobs** | `lv.jobs(name, schedule, last_started, last_ok, last_error)` registered with `pg_cron`; each job is a function that records its own run | undefined scheduling (review B-3) |
| **Events** | §5 | direct cross-module calls |
| **Rate limits** | `lv.rate_take(scope, key, limit, window)`, exists for integrations; reuse for guests and sign-in | bespoke counting in the guest path |
| **Audit** | `lv.audit(...)`, exists | – |

Jobs to register at launch:

| Job | Schedule | Does |
| --- | --- | --- |
| `dispatch-email` | every minute | calls `email-dispatch` through `pg_net` when the outbox is non-empty |
| `dispatch-webhooks` | every minute | same for `webhook-dispatch` |
| `dispatch-discord` | every minute | same for `discord/dispatch` |
| `retention` | 03:17 daily | `lv.retention_sweep()` (logs after 365 days, guest hashes after 7) |
| `entitlement-expiry-notice` | hourly | queues "your plan ends in 3 days" email once |
| `rate-window-trim` | every 10 minutes | deletes expired rate windows |

Each dispatcher call carries the service bearer the functions already verify. The staff panel shows `lv.jobs`, so a
stuck job is visible to a human.

## 5. Domain events

A small, explicit list of facts that modules announce. An event is a row in `lv.outbox` with a topic; consumers are
functions registered for that topic. Delivery is at-least-once; consumers are idempotent on the event id.

| Event | Emitted by | Consumers today | Consumers later |
| --- | --- | --- | --- |
| `account.created` | identity | – | welcome email, funnel counter |
| `hub.created` | hubs | email (exists) | funnel counter |
| `member.joined` | hubs | Discord role sync | notifications |
| `campaign.published` | campaigns | webhooks, Discord auto-post | notifications to members |
| `campaign.closed` | campaigns | webhooks | "share your result" email |
| `response.received` | participation | analytics counter | rollups (§7), milestone webhooks, live results |
| `results.unlocked` | analytics | – | "your survey reached 5 answers" email (the single most useful notification) |
| `entitlement.changed` | entitlements | API keys pause, webhooks pause | Discord role sync |
| `report.filed` | staff | – | staff alert |

Rule: an event payload never contains an answer, a respondent identity or a guest key. It carries ids and counts
that are already safe to release.

## 6. The hot path: answering

This is the only path that sees real traffic, so it gets its own design. Target: one guest answer costs one short
transaction, a fixed number of index lookups, and no lock shared with other respondents.

Today (`lv.api_guest_submit`): per-Campaign advisory lock → duplicate lookup → `count(*)` of all guests →
`count(*)` of the last minute → validate → 3 inserts. Under a burst, every respondent queues behind one lock and the
eleventh in a minute is refused.

Proposed:

1. **Duplicate check without a Campaign lock.** `guest_participation (campaign_id, key_hash)` is unique. Insert it
   first with `on conflict do nothing returning`; no row back means "already answered", return the stored receipt.
2. **Counters, not counts.** `lv.campaign_counters(campaign_id, guest_total, member_total, updated_at)` updated with
   one `update ... set guest_total = guest_total + 1 where guest_total < limit returning`. One row lock held for
   microseconds; the guest cap is enforced by the `where`.
3. **Two limits with different jobs (F-15: a guest is never refused because other people are answering):**
   - `participation.guest_per_key_per_minute` (suggest 3): stops one browser hammering. Keyed on the guest hash.
   - `participation.safety_ceiling_per_minute` (suggest 600 on every plan): protects the database only. It is sized
     so a full lecture hall or a busy Discord channel never meets it, and reaching it raises a staff alert, because
     it means an attack or a number that should be raised. Use `lv.rate_take`.
   Both are policy rows, never constants (F-02). The host's own `guest_limit` (a total they choose) is unchanged.
4. **Abuse is handled where it is cheap:** a staff "pause guest answers" switch per Campaign (exists as a block),
   report-abuse (exists), and an optional proof-of-work or Turnstile challenge that turns on automatically for a
   Campaign that reaches its burst ceiling three minutes in a row. No CAPTCHA by default: it breaks the ten-second
   promise.
5. **Emit `response.received`** with the Campaign id only.

The member path (`lv_submit_response`) gets the same counter and event; it already has no global lock problem.

Load expectation: at the 200K-monthly-user target (roadmap §6) the system receives on the order of 600,000 submissions
a month, an average of one every four seconds and a realistic peak of 20 to 50 a second for minutes at a time.
A small Postgres instance handles that with the design above; it does not with a global advisory lock and two
table counts per answer.

## 7. Analytics at scale (later, on a trigger)

Trigger: any Campaign above about 20,000 submissions, or live results enabled. Not before.

- `lv.analytics_cells(campaign_id, question_id, option_key, n)` and `lv.analytics_question(campaign_id,
  question_id, n, sum)` maintained by the `response.received` consumer in small batches.
- `lv.safe_cells` runs on the cells, unchanged. Suppression is applied at read time, always, so the rollup holds no
  decision about what is safe.
- Role-segmented analytics (Team) keep reading raw rows until they are slow; segments multiply cells and the
  privacy rules for small segments are stricter.
- Free text is never rolled up.

Live results are then a 15-second poll of a cheap read; no websockets are needed. Below the cohort the page shows
only the total number of answers, never a per-option figure, so watching answers arrive reveals nothing about any
one person. That rule must survive the rollup.

## 8. Observability without tracking people

- **`lv.product_events(day, event, n)`**: daily counters only, incremented by the domain-event consumers
  (`account.created`, `campaign.published`, `response.received`, `results.unlocked`) and by a signed-out
  `lv_api.lv_beacon(p_event)` for the three client-only steps (landing viewed, survey started, thank-you CTA
  clicked). The beacon accepts a fixed list of event names, stores no identity, no IP and no user agent, and is rate
  limited. This gives the funnel in roadmap §5 with nothing to disclose in the privacy policy beyond "we count".
- **Errors:** the frontend posts unexpected faults (`lv_server_error`, render errors) to a small Edge Function that
  writes `lv.client_errors(day, route, code, message_hash, n)`. Messages are truncated and hashed; no payloads.
- **Health:** `lv_api.lv_health()` returns database time and the age of the oldest unsent outbox row. An external
  uptime service checks it, the session function and the site every minute. The `/status` page reads the same call.
- **Staff panel tiles:** signups today, surveys published, answers, surveys that reached cohort, jobs last success,
  outbox depth, open abuse reports.

## 9. Sessions

- Keep the 1-hour access token (short is right for a token in browser storage).
- Add **renewal** in the `session` function: at sign-in also issue an opaque, rotating renewal token stored hashed in
  `lv.session_renewals` (family id, expiry 30 days, rotated on every use, whole family revoked on reuse). The browser
  calls `session/renew` shortly before expiry.
- Suspension and account deletion revoke the family, which today's stateless hour cannot do faster than 60 minutes.
- Sign-out revokes the family server-side.

## 10. How to add a feature (the recipe)

Any developer or agent follows these steps; reviewers check them in this order.

1. **Name the module** it belongs to (§3). If it fits none, it is probably a new module and needs a line in
   `MODULES.md` before any SQL.
2. **Write the contract first** in `docs/backend/API_CONTRACT.md`: operation name, arguments, success shape, every
   error code, who may call it signed out.
3. **Migration** `0000NN_v2_<module>_<change>.sql` with its rollback in `supabase/rollbacks/`:
   tables with RLS on and no direct grants; `lv.api_*` logic; `lv_api.lv_*` wrapper; explicit grants; a
   `module:<name>` comment on each function.
4. **Limits** through `lv.limit_check` with a new `plan_limits` key per family. **Launch state** through a feature
   flag, default off.
5. **Events:** emit one if another module might care; never call upward.
6. **Tests** in `supabase/tests/NN_<module>_<change>.sql`: the happy path, each error code, the authorization matrix
   (signed out, non-member, member without the capability, member with it, Owner, suspended), concurrency if it
   claims a scarce thing, and the anon allow-list.
7. **Privacy check:** does any output let a creator resolve a respondent on an anonymous Campaign, alone or joined
   with another output? If the feature returns counts, it goes through `lv.safe_cells`.
8. **Frontend:** a typed method in `lvApi.ts`, the mock mirrors it, the route is added to `routes.json`, and
   top-level names go to `lv.reserved_slugs`.
9. **Docs and memory:** `MODULES.md`, the user guide if users can see it, `CHANGELOG.md`.
10. **Run** `scripts/db-test-canonical.sh`, `npm run test:pr`, and the e2e suite.

## 11. What to defer on purpose

| Not now | Until |
| --- | --- |
| Splitting into services, queues or a separate API server | never, unless a single module needs to scale independently of Postgres |
| Read replicas | sustained database CPU above 60% after rollups exist |
| Websocket or realtime results | polling is measurably insufficient |
| Multi-region | a paying customer requires data residency |
| Table partitioning of `answers` | above roughly 200 million rows |
| A second database for analytics | exports or segment queries hold locks that the hot path can feel |
