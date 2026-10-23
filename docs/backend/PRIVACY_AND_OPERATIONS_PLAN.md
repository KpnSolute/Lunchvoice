# Privacy and operations plan

Planning deliverable, 2026-10-23. Status: **proposal**. Product rules: V2-19, V2-21 and
D-03/D-10 in [PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md). Numeric thresholds, retention periods
and operational-access policy are **TBD (D-10)** and are not invented here. Related roadmap
items: R-13, R-14, R-17, R-19, R-20, R-21 in the [execution roadmap](EXECUTION_ROADMAP.md).
Nothing in this plan authorizes a production change, secret, paid resource or deployment.

## 1. Authentication versus anonymity (they are independent)

| Context | Account | Member | Identity visible to Hub admins |
| --- | --- | --- | --- |
| Signed-in member, identified Campaign | Yes | Yes | Per Campaign setting (explicit consent copy) |
| Signed-in member, **anonymous** Campaign | Yes | Yes | **No**, through any path |
| Signed-in nonmember (audience allows) | Yes | No | Same rules; no membership created |
| Guest (explicitly enabled) | No | No | Campaign privacy policy applies; no perks |

Legacy v1 responses carry `student_id` and are flagged legacy-identified; they are never presented
as anonymous (see [data plan](DATA_AND_MIGRATION_PLAN.md)).

## 2. Anonymity architecture (new Campaigns)

Hiding a display name is not anonymity. Design (Recommendation):

1. **Separate stores.** `participation_receipts` (who participated, for eligibility, dedupe, points,
   gate numerator) and `campaign_responses` (answers) with **no account reference and no joinable key**
   between them for anonymous Campaigns. The receipt proves participation once; the answer set is
   unlinkable. Idempotency uses a one-way receipt token that the response row does not store.
2. **Timing.** Receipt and response timestamps are coarsened (for example to the Campaign's reporting
   interval) so ordering cannot re-identify; exact timestamps are not stored on anonymous answers visible to admins.
3. **Roles.** Hub administrators, including the Owner, query only through suppression-aware views/RPCs;
   no `select` on receipts for anonymous Campaigns; no export of receipts.
4. **Operational access.** Which platform operators may ever access mapping data, under what audit,
   is a policy decision (**D-10**). Default engineering stance: no standing access; break-glass requires the
   founder's approval and an audit record.
5. **Logs and audit.** Admin-visible logs exclude answer bodies and respondent identity; audit events carry
   actor, action, scope and outcome only.
6. **Small cohorts and differencing.** Suppress groups below the approved minimum cohort `k` (**TBD, D-10**);
   apply the same suppression on filters, comparisons, breakdowns, exports and embeds; block differencing by
   limiting repeated overlapping filters and ensuring complementary suppression where a total minus visible groups would reveal a hidden group.
7. **Free text.** Anonymous free-text answers can self-identify. Policy (D-10): moderation before display,
   no raw author fields, optional redaction tooling.

Test matrix (must pass before any anonymous mode is released): raw table access with an admin role; PostgREST
embedding/joins; RPC drill-downs; filter combinations and totals-minus-visible differencing; export files;
embedded analytics tokens; logs and audit payloads; timestamp ordering; Realtime subscriptions; backups visible
to roles; the same checks with a Hub Owner session and with a full-capability custom role.

## 3. Guest proof (D-03)

| Aspect | Recommendation | Open |
| --- | --- | --- |
| Share token | Random 128-bit, stored hashed; bound to Campaign ID + Hub ID + slug generation | Lifespan: default = Campaign close |
| Private share | Token authorizes one Campaign only; never grants Hub access | Revocation UX |
| Dedupe | Per-device token plus hashed network signal with rate limits; documented limits (shared devices exist, e.g. cafeteria kiosks) | Exact signals (D-03) |
| Abuse | Per-token and per-network rate limits, CAPTCHA only if needed (account-free flows are the abuse surface) | Thresholds |
| Perks | No member perks or points; no membership or count effect | Conversion to membership (D-03) |
| Consent | Privacy notice shown before the first answer | Copy |

Disabled, expired, revoked, wrong-Hub, wrong-generation or forged tokens return the same generic denial (no existence leak).

## 4. Exports and embeds

- Exports: aggregate projections only for anonymous Campaigns; field list fixed per mode and plan (plan boundary TBD, D-06);
  capability `community.analytics.export`; every export audited (who, what scope, row/group counts, never contents).
- Embeds: explicit authorization (`community.analytics.publish`), a revocable embed token bound to Hub ID and generation,
  serving a **precomputed or suppression-checked aggregate** and never reading private responses; unpublish invalidates later access
  (cache lifetimes documented and short).
- Public pages and discovery host expose only approved public projections, never member lists or private directory fields.

## 5. Retention and deletion (D-10, TBD)

Not invented here. Questions for the founder: retention of anonymous answers and receipts; export file lifetime; deleted-account behaviour
(responses stay but receipts unlink?); account deletion and data export (`/me/settings` in the design handoff); retention after Hub deletion
(Owner-only); backups retention. Until decided, code paths that would delete responses or private data are not written (Principle: never delete data to resolve a limit).

## 6. Slug release and reclaim safety (V2-13/14)

Test list (all required before reservations ship):

1. Release removes only the exclusive slug claim; the old Hub ID, members, Campaigns, answers, analytics, billing and tokens remain with the old Hub.
2. A new claimant sees none of the old data; old private links, QR codes, cached pages, guest shares, sessions, embeds fail or resolve to nothing.
3. Old public slug links: behaviour (404, reservation landing page, or redirect) is **D-09**; they never resolve to the new owner's private area.
4. Slug generation counter increments on reassignment; every token and share encodes ID + generation.
5. Renewal-vs-release race and delayed/retried release jobs: atomic recheck of current renewal and ownership before release.
6. Concurrent eligible claims produce one winner.

## 7. Jobs, retries and scheduling

| Job | Frequency (Rec.) | Idempotency |
| --- | --- | --- |
| Scheduled Campaign activation/expiry | every minute | `lv_campaign_activate(idempotency_key)`; failed activation records a `job_runs` failure and alerts; never grants unpaid access |
| Reservation reminders | daily | per (reservation, milestone) unique |
| Grace release | daily (with an on-claim recheck) | recheck renewal and ownership atomically; evaluate expiry under one policy in the claim API too |
| Billing event reconciliation | hourly | unique `(provider, event_id)` |
| Analytics refresh (if materialized) | per metric freshness target | deterministic keys |
| Waitlist/invite email | on event | retry with backoff; dead-letter after N attempts |

**Scheduler choice is open (R-20):** options are `pg_cron`/database scheduling on the project's Supabase plan (availability on this project is
**unverified**), scheduled Edge Functions, or an external scheduler (Render cron). Each option needs an owner, an alert path, and a replay test.
Retries use exponential backoff with a dead-letter table reviewed by an operator; replays are safe by construction (idempotent).

Email: the existing `send-email` Edge Function uses Azure Communication Services for the auth email hook; verified sender, delivery/retry
and error behaviour for **new** emails (waitlist, invites, renewal reminders) are unverified. Google sign-in removes the verification-email dependency for the v2 login path; legacy OTP continues to use it during transition.

## 8. Monitoring and alerting (R-20)

Signals: auth failures by reason, activation denials by reason code (`lv_quota_exceeded`, `lv_gate_unmet`), activation failures, job lag and dead letters,
billing event lag and signature failures, reservation deadlines and releases, role/owner changes, membership anomalies, migration reconciliation diffs,
API error rate and latency, Realtime health, TLS/connectivity failures after the Supabase HTTP cipher change (announced to begin no earlier than Nov 10, 2026; include supported-browser testing in staging).
Logs and dashboards are privacy-safe (section 2.5). Alert thresholds, on-call owner and paging route are **unassigned** and must be set before release; no monitoring vendor is assumed.

## 9. Backup, restore and recovery

- Facts unverified for this project: Supabase plan, backup/PITR availability and retention. Check with the project operator (read-only).
- Required before release: a **restore drill** into an isolated project proving that data and auth state recover, with timings recorded.
- Migration safety: each P-phase has a rollback (see data plan); P5 irreversible and separately authorized.
- Job and event recovery runbooks: replay a dead letter; re-run a missed activation window; reconcile billing against provider state.
- Incident playbook skeleton: severity levels, privacy incident path (anonymity breach), identity-provider outage (legacy path or maintenance banner), billing outage, survey-day degraded mode.

## 10. Environments and secrets

Environments: local (Node + Docker + Supabase CLI), CI (Node 22.12.0), staging (non-production identity, data, payment, events), production (separate authority).
Secrets are inventoried by name, purpose, owner, environment and secret-manager reference only; never in docs, PRs, issues or bundles. Public frontend variables remain
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MJCC_MENU_API_BASE`. Future identity and billing secrets are server-side only. The repository is **public**: planning docs must not contain operational secrets or exploit detail for unfixed weaknesses.

## 11. MJCC rehearsal (R-21)

Preconditions: D-12 answers (open/close, operator, questionnaire, audience, anonymity expectation, fallback). Script, executed in staging by the named operator:

1. Seed the LionCafe fixture and a second Hub; run the forward migration; run reconciliation.
2. Operator signs in with a staff identity (legacy bridge path and v2 path as applicable), creates the Winter Survey Campaign from the approved questionnaire, sets audience and schedule.
3. Students (test accounts) join via QR/join code on phones; submit identified/anonymous responses per the approved setting; points awarded.
4. Operator watches results; thresholds and suppression behave; export works.
5. Failure drills: identity outage fallback; job delay; submission retry; rollback of routing/auth/content **without losing accepted responses**.
6. Switch to the **legacy fallback flow** and back; confirm the legacy path stayed intact.
7. Operator and founder sign-off recorded with environment, commit and fixture versions.

Production launch is a separate decision at the confirmed survey opening, with its own deployment and rollback runbook and authority.

## 12. Open items

D-03 (guest), D-10 (thresholds, retention, export, operator access), D-09 (historical-link behaviour), D-12 (survey details), the scheduler choice, monitoring owner, restore capability facts.
