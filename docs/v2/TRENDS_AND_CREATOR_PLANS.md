# Trends and Creator plans (V2, founder direction 2026-11-11 and 2026-11-12)

Sources: the founder's roadmap Google Doc ("Trends and creator plans", 2026-11-11) and the founder's answers on
2026-11-12: build Hub Trends now, add solo Creator plans, and give each plan features people want that SurveyMonkey
does not offer. Billing has not opened, so the plan structure changes before launch. Everything here is enforced by the
server's entitlement map (`lv.plan_limits`), never by the UI alone.

> **Correction, 2026-11-13.** The founder later set the Creator plans to **Creator Plus at $5 a month** and **Creator
> Pro at $15 a month** (Google Doc "Project Profile - LunchVoice V2", Creator Plans section). Those prices and the
> families `creator_plus` and `creator_pro` are in migration `000041` (branch `claude/confident-euler-e4uri9`). This
> spec first said $12 and $27 and called Trends "Built"; neither is true. **Trends are not built on any branch yet.**
> `000041` sets only prices, `survey.branching` and `survey.branding` for Creator plans. The survey, question and Trend
> limits below are proposals until they are in the map; the profile proposes different ones (Plus: 15 surveys, 30
> questions, 2 Trends; Pro: unlimited surveys and questions, 5 Trends).

## 1. Trends

**A Trend is a group of surveys asked again over time.** You put the same kind of survey in a series (a monthly
pulse, a term-by-term course rating, an event you run every season) and LunchVoice lines the runs up so you can see
what moved. It is LunchVoice's own feature, not a copy of SurveyMonkey's "Programs".

- **Where:** Trends for Hubs (a series of a Hub's Campaigns) and Trends for standalone surveys (a series of your own
  Quick Surveys, in your personal space). A Trend belongs to one space and only holds that space's surveys.
- **What you see:** every run in time order with its dates and how many people answered, and for each question that
  repeats (same kind and wording) how its result changed from run to run: a rating's average, a choice's share, a
  yes/no split. Results come from the same results call as each survey, so every privacy rule still holds: withheld
  stays withheld (a run below the minimum group is shown as withheld, never as zero) and anonymous answers are never
  joined across runs.
- **Ask again:** from a closed survey in a Trend, one action makes a draft copy with the same questions, already in
  the Trend, so the next run is comparable by construction.
- **Who can manage:** in a Hub, people with `campaign.manage`; in a personal space, its owner. Reading a Hub Trend
  needs the results permission (`analytics.read`), like reading a Campaign's results.

### Trends by plan (`trends.max` in the map)

| Plan | Trends |
| --- | --- |
| Free Quick Survey | 0 |
| Creator Plus ($5) | 3 (proposed; profile proposes 2) |
| Creator Pro ($15) | 10 (proposed; profile proposes 5) |
| Starter Hub ($13) | 3 |
| Team Hub ($29) | 5, then $2 a month per extra Trend (add-on, not built: needs quantity in checkout) |
| Campaign Starter / Campaign Plus | 1, with the pass (`trends.max_pass`); read-only when the window ends |

Over the limit (a plan lapses or is downgraded): every Trend stays and can be read; creating Trends and adding
surveys to them is refused until the count fits again. Nothing is deleted.

## 2. Creator plans (solo, no Hub)

For one person who asks a lot but does not run a community. They attach to the person's own space (their Quick
Surveys), never to a Hub, so nobody has to create or join a Hub. Answering stays free for everyone.

Limits for the Creator plans are proposed, not final (see the correction above).

| | Free | **Creator Plus** $5/month | **Creator Pro** $15/month |
| --- | --- | --- | --- |
| Active surveys | 5 | 25 | 100 |
| Questions per survey | 10 | 30 | 50 |
| Feedback types (Poll, Rating, Yes/No, Open feedback, Survey) | ✓ | ✓ | ✓ |
| Trends | – | 3 | 10 |
| Export released results | – | ✓ | ✓ |

### Features that set them apart (what SurveyMonkey does not do)

Status is stated honestly: **Built** is in the product today; **Planned** is designed and must not be advertised as
available until it is built and in the map.

| Feature | Plan | Status | Why people want it |
| --- | --- | --- | --- |
| **Trends with Ask again** | Creator Plus, Pro | Planned (not built) | Repeat a survey and see what moved, without spreadsheets |
| **Anonymity you can prove**: every respondent can see exactly what the creator can and cannot see before they answer, and small groups are withheld automatically | All plans | Built (existing) | Honest answers need trust; SurveyMonkey leaves anonymity to settings |
| **No sign-up answers by link, QR or six-character code** | All plans | Built (existing) | Answering takes seconds on any phone |
| **"You said, we did" page**: publish a privacy-safe results summary and what you changed, at a share link, so the people who answered see the outcome | Pro | Planned | Closing the loop is why people answer next time |
| **Live room**: a presenter screen with a QR code and live totals that reveal only once enough people answered (for talks, classes, events) | Pro | Planned | Live polling without a second tool, and without exposing the first few voters |
| **Post to Discord without a Hub**: share a survey into a server you manage, with the anonymous rules kept | Pro | Planned | Creators live on Discord |
| **Response goal and auto-close**: close at a number of answers or a date, with a progress bar respondents can see | Creator Plus, Pro | Planned | Fair cut-offs, no babysitting |
| **Co-creator**: one collaborator who can edit and read results | Pro | Planned | Solo does not mean alone |
| **Your color on the survey player** | Creator Plus, Pro | Planned (`survey.branding` is on in `000041`) | Recognisable without a Hub |

### Map and products (partly built in `000041`)

- Built: plan families `creator_plus` and `creator_pro` (account-scoped only) in `lv.plan_limits`, `lv.entitlements`,
  `lv.products` and the related checks; products `creator_plus` (500 cents a month) and `creator_pro` (1500) with
  `purchasable = false` until the Stripe prices exist; `survey.branching` and `survey.branding` on for both.
- Not built: `quick.max_active`, `quick.max_questions`, `trends.max` and `analytics.export` for the Creator families
  (proposed above), the Trend records and their `lv_api` functions, and the pricing-page entries.

### Still to decide (founder)

- Final names: decided, Creator Plus and Creator Pro (founder 2026-11-12).
- The exact limits and perks of each Creator plan, including how many Trends.
- Whether Creator Pro includes elections for standalone ballots (today elections need a Hub).
- The Team "$2 per extra Trend" add-on needs quantity support in checkout, the billing webhook and the billing screen.
