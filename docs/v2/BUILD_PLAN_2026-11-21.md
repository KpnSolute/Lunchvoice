# LunchVoice v2 full build plan (feature-complete by 2026-11-21, public launch 2026-12-01)

Owner: the governing agent. Founder direction 2026-11-07: "fix all issues with the agents; done is when users can
create Hubs and all the features that needed to be shipped". Built today; feature freeze 2026-11-21; public launch
2026-12-01. Binding order: `LAUNCH_PLAN.md` (founder decisions F-01..F-13), then the master spec, then this file.
Nothing here changes settled pricing, entitlements, privacy rules, lifecycle or the Quick Survey model.

## Definition of done (feature-complete)

1. **Anyone can create a Hub** through the one normal path: sign in, get a creator entitlement (waitlist Founding
   credit today; a paid Starter/Team Hub or Campaign plan once the founder adds Stripe keys), create the Hub, become
   the protected Owner. With Stripe keys set, checkout works end to end with no further code: server-created Checkout
   Sessions, webhook deployed, Customer Portal for cancellation, Stripe Tax enabled.
2. **Every spec feature is shipped or explicitly out of scope by founder decision**, including the community surface
   (custom pages with content, Newsroom, Comments with moderation, Leaderboard, Shop with optional Hub points),
   Discover listing and approval, Hub Name Reservation purchase, transactional email (outbox + provider-ready
   dispatcher, design templates E01-E08), platform admin console (waitlist, abuse reports, Campaign block, Discover
   approvals), owner-transfer acceptance, Team role targeting.
3. **Every open compliance finding is fixed** (LC-10, LC-11, LC-12, LC-13, LC-14, LC-30, LC-32, LC-37, NEW-05) and
   every API gap from the UI correction pass is closed (Campaign description, server-side option validation, Quick
   Survey access change, role targeting, plan limits visible to managers, new-question save race).
4. **Proof:** canonical DB suite, function tests, unit tests, e2e suite and production build all pass; compliance
   re-review reports 0 BLOCKER / 0 HIGH; every `lvApi` call matches its SQL signature.
5. **Release:** one PR per track to `main`; production migrations applied only with the founder's explicit approval
   for this build (F-13 covered the launch apply only).

## Tracks (full-stack, parallel, isolated worktrees)

| Track | Scope | Migration | Tests | Edge Functions |
| --- | --- | --- | --- | --- |
| A. Hardening and gaps | LC-10..14, LC-30/32/37, NEW-05, Campaign description, option validation, Quick Survey access change, Team role targeting (audience by role), plan limits for managers, save race, owner-transfer acceptance | `000018_v2_hardening` | `18_*.sql` | `session` (LC-12/13 only, backward compatible) |
| B. Commerce, email, admin | Checkout Sessions, Customer Portal, webhook deploy-ready, reservation purchase, email outbox + dispatcher + templates, platform admin console | `000019_v2_commerce` | `19_*.sql` | `checkout`, `billing-webhook`, `email-dispatch` |
| C. Community and Discover | page content, Newsroom, Comments + moderation, Leaderboard (opt-in, privacy-safe), Shop + Hub points + orders, Discover listing | `000020_v2_community` | `20_*.sql` | none |

### Ownership rules (to keep merges clean)

- Each track owns only its migration, rollback, test file and functions. No track replaces an `lv`/`lv_api` function
  owned by another: A owns Campaign, question, participation, invite and `lv_my_context`; B owns billing, checkout,
  reservation, waitlist, email and admin; C owns pages, Discover and the new community tables. A track that needs
  something from another track's area exposes its own new function instead.
- Shared frontend files (`src/lib/lvApi.ts`, `src/lib/mockTransport.ts`, `src/lib/errors.ts`, `src/main.tsx`,
  `src/config/routes.json`, `src/lib/reservedSlugs.ts`, `docs/backend/API_CONTRACT.md`) are edited by appending a
  clearly delimited block per track (`/* ---- track B: commerce ---- */`), never by reordering existing code.
- Agents do not edit `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`, do not push and never touch production.

## Decisions taken by the governing agent for this build (founder may override)

- B-01 Stripe: server-created Checkout Sessions (`quantity = weeks` for Campaign plans), price IDs stored by product
  in policy `billing.stripe_prices`; secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (names only). Without keys
  every checkout keeps failing closed with `lv_billing_unavailable`.
- B-02 Email: provider-agnostic outbox; the dispatcher sends through Resend when `RESEND_API_KEY` is set and otherwise
  leaves mail queued. No marketing email; only transactional (waitlist, Hub created, invites, reservation, orders).
- C-01 Leaderboard is opt-in per member, counts participation only (never answers), excludes guests, and never shows
  per-Campaign timing.
- C-02 Hub points are optional per Hub (off by default), have no cash value, and Shop orders are fulfilled manually by
  the Hub.
