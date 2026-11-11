# Roadmap and growth: December launch to 200K users (proposal, 2026-11-10)

Status: proposal for the founder. Dates in `BUILD_PLAN_2026-11-21.md` (feature freeze 2026-11-21, public launch
2026-12-01) are taken as fixed. Every number below that is a forecast is labelled as one; none is a measurement.
Third-party prices are from memory of public price lists and must be checked on the vendors' pricing pages before
they are used in a budget.

## 1. An honest reading of "200K users"

LunchVoice today has 3 accounts. 200,000 users one month after launch would require a viral event that cannot be
planned. What can be planned is a product in which each creator reliably brings respondents and some respondents
become creators. So this plan defines the target precisely and gives it a path:

**Target: 200,000 monthly active people**, where a person is counted once in a month if they answered at least one
survey or signed in. Almost all of them are respondents, most of them guests. That is the correct shape for this
product: participation is free and needs no account.

The arithmetic of the target:

| Quantity | Value | Basis |
| --- | --- | --- |
| Monthly active people | 200,000 | target |
| Respondents per active creator per month | ~80 | forecast: one or two surveys to a group of 30 to 300 at a 30 to 40% response rate |
| Active creators needed | ~2,500 | 200,000 ÷ 80 |
| Share of creators on a paid plan | 4 to 6% | forecast; typical for a generous free tier |
| Paying communities | 100 to 150 | |
| Monthly revenue | roughly $1,700 to $2,900 | 100 to 150 × blended ~$17 to $19 |

Two things follow. First, **the number that matters is 2,500 active creators**, and the respondent count is its
consequence. Second, **200K people is not yet a business**: it is a few thousand dollars a month. It is, though, a
product with proof, a distribution engine and almost no cost (§6), which is the right position for a small company
to raise prices, add a higher tier or raise money from.

## 2. Forecast path

A plausible path if the loop numbers in §5 are met. If they are not, no amount of posting fixes it; work on the loop.

| Period | Active creators | Monthly active people | Driven by |
| --- | --- | --- | --- |
| December (launch month) | 300 to 600 | 10,000 to 30,000 | Design partners, Reddit, Show HN, Product Hunt |
| Months 2 to 3 | 800 to 1,200 | 50,000 to 80,000 | Thank-you loop, Discord bot listings, shareable results |
| Months 4 to 6 | 1,500 to 2,500 | 120,000 to 200,000 | Templates, recurring surveys, search traffic, referral |
| Months 7 to 12 | 2,500 to 6,000 | 200,000 to 500,000 | Second integration (Slack or Teams), idea boards, elections |

Reaching 200K in month 1 instead of month 6 requires the same loop plus luck (a large community or creator adopting
it publicly). The plan makes the product ready to convert that luck: the hot-path fix (review B-1) and the cost
model below mean a spike is survivable and nearly free.

## 3. To launch (now to 2026-12-01)

Feature freeze is 2026-11-21. Only the launch list from the review goes in before it; nothing new.

| # | Work | Review ref | Size | Why it cannot wait |
| --- | --- | --- | --- | --- |
| 1 | Guest limits per guest plus a high safety ceiling; counters (F-15) | B-1 | 1 migration | A shared link fails its own audience |
| 2 | Session renewal; keep Studio edits across re-sign-in | B-2 | `session` function + provider | Creators lose work hourly |
| 3 | Landing: lead with "Make a survey free"; remove elections, idea boards, "live" | P-2, P-5 | copy | Honesty and first click |
| 4 | Locked-results state with share controls | P-3 | 1 component | First-run dead end |
| 5 | Thank-you invitation on the guest screen | P-4 | 1 component + beacon | The growth loop |
| 6 | Scheduled jobs: three dispatchers, retention; set the Resend key and sender (F-21) | B-3 | 1 migration + 2 secrets | Email and a privacy promise depend on it |
| 7 | Counters, client error reporter, uptime checks, staff tiles | B-4 | 1 migration + 1 function | Launching blind |
| 8 | Pricing page: three cards, passes line, reservation card under the plans (F-16) | P-7 | UI | Clear first read of the prices |
| 9 | Results auto-refresh every 15 s while a survey is open | P-2 | small | Makes "live" true |
| 10 | Stop using the cafeteria lockup; About page origin story | D-7 | copy | First impression |

Founder actions that no agent can take: add the Resend API key as the `RESEND_API_KEY` function secret (the domain is already verified; F-21), decide on Stripe before or after launch (the product
works without it; Founding members are free until billing opens plus 30 days), supply the legal operator name for
the legal pages (F-12), have the Terms and Privacy text reviewed, recruit the 10 design partners.

**Launch gate** (in addition to the existing definition of done): a load rehearsal in which 200 simulated guests
answer one survey within 60 seconds on a staging database with no refusals and no errors; a stranger completes the
creator path in under 5 minutes without help; the four funnel counters record a full pass.

## 4. After launch

### Days 1 to 60: make the loop turn

| Work | Strengthens | Review ref |
| --- | --- | --- |
| Discord sign-in through KpnIdentity, then email code | creator activation | P-8 |
| Shareable results page and image (opt-in, released aggregates only) | creator → new audience | P-9 |
| QR poster and slide layouts | creator → respondents | – |
| `results.unlocked` email: "your survey reached 5 answers" | creator return | architecture §5 |
| Ten starter templates (event feedback, server pulse, meeting check-out, ...) | time to first publish | – |
| Annual Hub plans ($130, $290) and the referral month, with billing (F-17, F-18) | revenue, creator → creator | P-7 |
| Billing live (Stripe keys, Tax, portal) once 20 communities ask for paid features | revenue | – |
| Contract tests, e2e in CI, module map | speed of every later change | B-5, B-6 |
| Design consolidation, `check:design` | consistency | D-2 to D-6 |

### Days 60 to 180: become a habit

Recurring surveys with trend charts · "you said, we did" posts that notify opted-in respondents · three more
question kinds (ranking, labelled scale, image choice) · referral credit · Slack app · idea boards as a real mode ·
Hub-level trends for Team · analytics rollups when the trigger in architecture §7 is reached.

### Days 180 to 365: widen

Elections as a real mode (eligibility roll, sealed results, audit count) · organisation accounts owning several
Hubs · embeds · Microsoft Teams · a third tier above Team for organisations (SSO, data-processing agreement,
priority support), priced by quote. This tier is where the business model matures; do not price it until five
organisations ask.

## 5. The numbers to run the company by

Measured with the cookieless counters in architecture §8. One screen in the staff panel, reviewed weekly.

| Stage | Metric | Launch target (forecast) | If below |
| --- | --- | --- | --- |
| Activation | Signed-in creators who publish a survey within 10 minutes | 50% | Shorten the editor; start with a template |
| First value | Published surveys that reach 5 answers within 7 days | 40% | Share sheet, locked-results nudge, QR |
| **Viral loop** | Respondents who click the thank-you invitation · of those, who publish | 3% · 25% | Wording, placement, landing after click |
| Retention | Creators who publish a second survey within 30 days | 30% | Recurring surveys, unlock email |
| Revenue | Active creators with a Hub who pay (after billing opens) | 5% | Check what paid features free users ask for |
| Trust | Abuse reports per 1,000 surveys; median time to staff action | < 2 · < 24 h | More limits; pre-moderation of shared results |
| Health | Refused answers (`lv_rate_limited`) per 10,000 | < 1 | Raise burst; investigate |

The viral coefficient is the product of three of these: respondents per survey × invitation click rate × publish
rate. At 40 × 3% × 25% each survey creates 0.3 new creators. Above about 0.5 growth compounds without marketing;
that number, more than any feature, decides whether 200K arrives in six months or two years.

## 6. Cost: scaling cheaply

The architecture is already the cheap one: a static site, one Postgres, a handful of functions. Guests, the bulk of
all users, cost nothing in authentication.

**Load at 200,000 monthly active people (forecast):** about 600,000 submissions and 3 to 4 million answer rows a
month (well under 1 GB of new data), an average of one submission every four seconds, peaks of 20 to 50 per second
for a few minutes when a large community posts a survey.

| Item | Launch | At 200K monthly people | Notes |
| --- | --- | --- | --- |
| Supabase, LunchVoice project (Pro) | ~$25 | ~$25 to $60 | Possibly one compute step up for peak headroom |
| Supabase, KpnIdentity project (Pro) | ~$25 | ~$25 | Only signed-in people count as auth users: creators and members, roughly 10 to 15% of people, inside the plan's included allowance |
| Render static site | $0 | $0 to $20 | Static; bandwidth is the only variable |
| Email (Resend) | $0 | ~$20 | Transactional only |
| Domain, Microsoft 365 mailbox | ~$10 | ~$10 | Existing |
| Uptime monitoring, error intake | $0 | $0 to $20 | Free tiers; error intake is our own function |
| **Total** | **~$60 / month** | **~$100 to $160 / month** | Verify each vendor's current price list |

Payment costs come out of revenue, not the budget: card processing is roughly 3% plus a fixed fee per charge, which
on a $13 charge is about 5 to 6%, plus smaller percentages for subscription billing and automatic tax. Check
Stripe's current pricing before modelling margins. Annual plans at two months free (F-17) cut the fixed-fee share and
improve cash.

**Rules that keep it cheap**

1. Do not add a server. Anything that seems to need one is a database function, an Edge Function or a scheduled job.
2. Guests never touch authentication.
3. No third-party analytics, session replay or chat widget: each is a monthly bill, a privacy disclosure and a
   Content-Security-Policy exception.
4. No file uploads until a paying customer needs them (storage and egress are the classic surprise bill, and uploads
   are the classic abuse vector).
5. Free limits (5 active surveys, 10 questions, burst ceiling) are the cost control. They are policy rows, so they
   can be tightened in one statement if abuse appears.
6. Scale by trigger, never in advance:

| Trigger | Action |
| --- | --- |
| Database CPU above 60% for an hour during peaks | One compute size up |
| A Campaign above ~20,000 submissions, or results pages above 1 s | Analytics rollups (architecture §7) |
| More than 1 refused answer per 10,000 | Raise burst ceilings; check for one abusive survey first |
| Outbox older than 5 minutes | Dispatcher batch size, then frequency |
| Support mail above 20 a week | Help centre from the user guide, then a part-time support person |
| Revenue above ~$5,000 a month | Legal review of terms, a proper status page, a paid error tracker |

## 7. Business model notes

- **Free must stay generous.** It is the acquisition channel. Its cost per user is close to zero.
- **What people pay for is community, not questions:** members, roles, targeting, a branded home, history, export,
  integrations. Keep every privacy protection identical on every plan; privacy is never an upsell.
- **Passes are the on-ramp for events** and a good first purchase. Present them as an option at checkout, not as
  separate columns.
- **Founding members are the reference customers.** Fifty communities using it free are worth more than their
  subscription revenue; ask each for a quote and a case after their second survey.
- **Biggest revenue lever later:** a tier for organisations. Do not build SSO or procurement paperwork until asked.
- **Runway reality:** at the costs above the product can run for years without revenue. The scarce resource is the
  founder's attention, so every "should we build X" is answered by which arrow of the loop (product core §3) X
  strengthens.

## 8. Risks

| Risk | Likelihood | Impact | Response |
| --- | --- | --- | --- |
| Launch traffic refuses answers | High today | Severe | Launch item 1 and the load rehearsal |
| Abuse through anonymous free surveys | Medium | High | Limits, reports, staff blocks exist; per-guest limits; no public sharing of free text; shared results are opt-in |
| The loop does not turn (coefficient under 0.2) | Medium | High | It becomes a sales-led product for managers (audience 3); the product still works, growth is slower and paid |
| A single founder is the support desk, operator and reviewer | High | Medium | User guide and help centre first; status page; scheduled jobs visible in the staff panel |
| Legal text still placeholder at launch | Medium | High | Review before billing opens at the latest; no minors' data |
| Platform dependency on Discord | Low | Medium | The link and QR work everywhere; add Slack in days 60 to 180 |
| Agents drift from the system as it grows | Medium | Medium | Module map, contract tests, `check:design`, one spec revision after launch |
