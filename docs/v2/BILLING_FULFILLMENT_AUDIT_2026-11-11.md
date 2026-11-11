# Billing: do people get what they pay for? (audit, 2026-11-11)

Question (founder): turn billing on from the staff panel, set the launch date, start the countdown for everyone, let people
buy plans, and confirm they receive what they pay for.

## How billing is switched on (000035)

Two policy values already drove everything; they could only be set by SQL. The staff panel (Billing tab) now owns them:

| Policy | Meaning | Staff control |
| --- | --- | --- |
| `billing.launched_at` | Founding entitlements end 30 days after it (`lv.effective_end`), so setting it gives every Founding Hub a real end date | **Set launch date** (future dates only, billing off), **Clear date** |
| `billing.provider_ready` | Checkout may start; every purchase path fails closed without it | **Open billing now** (typed `OPEN BILLING`), **Pause new purchases** (typed `PAUSE BILLING`) |

Opening requires every Stripe price in `billing.stripe_prices` (all five products are set in production), stamps the launch
date at "now" when none is set or it is still ahead, and is audited. Pausing stops new purchases only; paid access and the
Founding countdown are untouched. The public plan limits now carry `billing {open, launch_at, founding_ends_at}`, so every
Hub's "Ends" row and every "Billing opens soon" line shows the real date. Scheduling a date does not open billing by itself:
if the date passes with billing off, the staff panel warns, and Founding Hubs keep 30 days of buffer before they lose anything.

## Purchase to access (verified)

`checkout` (server-created Stripe Checkout Session, price from `billing.stripe_prices`, Stripe Tax) -> `billing-webhook`
(signature checked) -> `lv.billing_apply_event`:

- a grant needs a matching intent, status paid, USD, and `amount_subtotal` equal to the intent's price (NEW-01); metadata is never
  trusted; the same intent can never grant twice;
- a Hub subscription becomes a `billing` entitlement on that Hub (or a Hub credit for a Hub not created yet); `invoice.paid`
  extends it; cancelling keeps access to the end of the paid period; refunds follow NEW-02 (suite 17);
- suite 36 proves the chain end to end in the database: a Starter Hub hits its limits (3 roles, no role targeting), a verified
  Team payment arrives, the same Hub is on Team, gets 6 roles and role targeting, a repeat event grants nothing more, and a
  cancellation leaves it on Team until the period ends with nothing deleted.

## Advertised versus enforced

| Advertised | Enforced by | State |
| --- | --- | --- |
| Starter: 3 custom roles, 3 custom pages, 15 active Campaigns, 2 active surveys, survey replacement above 50% | `plan_limits` (roles, pages, campaigns, surveys, threshold) | enforced |
| Team: 6 roles, expanded pages (10), 5 active surveys, replacement at 20% | `plan_limits` | enforced |
| Team: advanced role targeting | `campaigns.role_targeting` (FB-01 limits it to identified Campaigns) | enforced |
| Team: Discover eligibility at 700 members | `discover.min_members` | enforced |
| Team: API keys and webhooks (not advertised on the card) | `api.*`, `webhooks.*` | enforced; **add to the card** |
| Campaign Starter / Plus: Starter / Team features for the paid window | time-bounded entitlements | enforced |
| Reserve your Hub URL: keeps the address, 25-day grace | `hub_reservations` | enforced |
| Your Hub colour (both plans) | accent palette | delivered |
| **Team: "Enhanced Campaign modes"** | nothing distinguishes them yet | **not delivered** |
| **Team: "Advanced analytics"** (capability table) | no separate analytics tier exists | **not delivered** |

## Not yet proven

- A real completed payment has not run through the live webhook. The path is proven up to Stripe Checkout (session created,
  $13.00, automatic tax) and in the database suites; the last link needs one $13 test purchase and refund before launch.

## Decision needed before billing opens

Either remove the two undelivered claims from the Team card and capability table, or build them. A cheap honest version of
"advanced analytics" is filtering results by role and by source (now possible because Hubs have roles and guests are tagged).
"Enhanced Campaign modes" needs a definition (for example ranking, matrix or NPS questions, or branching).
