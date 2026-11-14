# Purpose and access map

Why every feature and service exists, how it helps a person, who gets it on which plan, and where it stands today.
Prices are the founder's and are not changed here. Plan behavior is evaluated by the backend entitlement map
(`lv.plan_limits`, `lv.feature_allowed`); the keys named below are the keys the build agents add or use. A cell marked
**approved** is a founder decision already in the brain files or the launch plan; a cell marked **proposal** is this
roadmap's recommendation and waits for the founder (default X-11 in `00_`).

## 0. The four pillars

Every row in section 3 belongs to one of four pillars (full table and exit criteria in `00_ROADMAP_4_WEEKS.md` section 1a):
**Analytics** (3.3 and 3.4), **Survey design** (3.1 and 3.7), **Social presence** (3.2 and 3.5), **Connectivity** (3.6 and 3.8).


## 1. Who the product is for

| Person | What they want | What LunchVoice gives them | Pays |
| --- | --- | --- | --- |
| **Participant** (guest or account) | Say something quickly, be sure it is private, see that it mattered | Answer by link, QR or six-character code with no account; an account adds Hubs, points, history | Never. Participation is always free |
| **Member** (of a Hub) | Belong, vote, earn recognition, hear back | A Hub home, Campaigns, results shared with them, decisions, points, profile, notifications | Never |
| **Solo creator** (no Hub) | Ask people things without running a community | Free Quick Surveys, then Creator Plus or Creator Pro | $0, $5 or $15 a month, per person |
| **Hub owner or manager** | Run a community's decisions and show it listens | A Hub with roles, pages, Campaigns, analytics, Decisions, Discord link | Starter $13 or Team $29 a month |
| **Seasonal host** (an event, a term) | A burst of power for a few weeks | Campaign Starter or Campaign Plus passes | $19 and $13 a week, or $39 and $19 a week |
| **Name holder** | Keep an address | Hub Name Reservation | $25 a year |
| **Staff** (LunchVoice) | Keep the platform safe | Admin console, reports queue, billing controls | n/a |

**Participation rights that are never behind a plan** (J: these are the product's moat against Kahoot's participant caps
and SurveyMonkey's response caps; F: Kahoot's free tier caps a live game at 10 players, Mentimeter's free tier at 50
participants a month, per their public pricing pages read 2026-11-14): answering any survey you can reach; joining a
Hub; seeing results the creator chooses to share; an anonymous answer staying anonymous; account export and deletion;
reporting abuse; leaving a Hub. No plan limits how many people may *answer*. Plans limit what a *creator* can run.

## 2. The ladder in outcome words

| Plan (price) | One-line outcome | Who it is for |
| --- | --- | --- |
| Free account ($0) | Ask 5 quick surveys of 10 questions, answer anything, join Hubs | Anyone |
| Creator Plus ($5/mo, person) | Branded, branching, live-result surveys; 15 active, 30 questions; 5 Trends | A person who asks often |
| Creator Pro ($15/mo, person) | Everything in Plus at scale: 100 active, 100 questions, 10 Trends, advanced analytics on your own surveys | A heavy solo creator, a teacher, a freelancer |
| Starter Hub ($13/mo) | A community with 3 roles and 3 pages, 15 Campaigns, sharing results with members, Decisions, Discord link | A club, a team, a small server |
| Team Hub ($29/mo) | Starter plus 6 roles, 10 pages, 5 surveys at a 20% gate, advanced analytics, enhanced modes (all election methods, quizzes, live sessions), API and webhooks, Discover at 700 members | A serious community or organisation |
| Campaign Starter ($19 / 2 wks + $13 per extra week) | Starter features for a season | An event, a term |
| Campaign Plus ($39 / 2 wks + $19 per extra week) | Team features for a season | A tournament, an election season |
| Hub Name Reservation ($25/yr) | Your address is yours | Anyone planning a Hub |

Founding Hubs (the first 50 waitlist seats) keep Starter free until 2027-01-11 (30 days after billing opens).

## 3. Purpose map

State: **Live** (in production and working), **Partial** (exists, not finished), **New** (to build). "Spec" is the ID in
`02_FEATURE_SPECS.md`. Access names the *lowest* plan that has it.

### 3.1 Ask

| Feature | Purpose: who is better off, how | Access | Key | State | Spec |
| --- | --- | --- | --- | --- | --- |
| Quick Surveys | A person asks without a Hub or a payment | Free: 5 active, 10 questions, core kinds | `quick.max_active`, `quick.max_questions` | Live | |
| Campaigns (survey, poll, rating, ideas) | A Hub asks its members something and learns | Hub plans; 15 active, surveys capped 2 / 5 | `campaigns.max_active`, `surveys.max_active` | Live | |
| 16 extra question types, 82 templates | Writing a good survey takes minutes, not an hour | Free 45, Plus 22, Pro 15 templates; types by tier | `question.kinds`, template plan | Live (copy stale) | UI copy |
| Linked questions (branching), sections | Respondents only see what applies to them | Creator Plus, Starter Hub and up | `survey.branching` | Live, approved | |
| Survey branding | The survey looks like the creator, not like a form tool | Creator Plus, Starter Hub and up | `survey.branding` | Live, approved | |
| Quiz mode | Learning and play: score people, reveal answers | Plus tier | `quiz.enabled` | Partial | D2 |
| Elections | A community picks people fairly and visibly | Starter: plurality, 1 active. Team and Campaign Plus: three methods, 3 active | `elections.max_active`, `elections.methods` | Partial (PR #73) | D1 |
| Recurring surveys and "Ask again" | See change over time without rebuilding | Creator Plus, Starter Hub and up (Trends allowance) | `trends.max` | Live (Trends 000044), recurrence New | D5, C5 |
| Live Session Lite | Run it in a room: join code, QR, results move on screen | Free (small), larger with plan | `live.max_participants` | Partial (Present mode exists) | D4 |
| Invites, link, QR, code, Hub, Discord | Reach exactly the people you mean | Free for link and invite; Hub and Discord by plan | | Live | |

### 3.2 Answer

| Feature | Purpose | Access | State | Spec |
| --- | --- | --- | --- | --- |
| Guest answering on link surveys | A stranger answers in 20 seconds with no friction | Free, rate limited | Live | |
| Anonymous answers with a visible promise | People tell the truth when they can see what the creator can see | Free | Live | C1 notice |
| Identified answers, change your display name | Accountability where the creator needs it | Free | Live (000052) | |
| Participation receipt | "I did vote" without revealing how | Free | New | D7 |
| Points | A thank-you for taking part, never for what you said | Hub plans (Hub currency) | Partial | E4 |

### 3.3 See

| Feature | Purpose | Access | Key | State | Spec |
| --- | --- | --- | --- | --- | --- |
| Results with suppression | Truthful numbers that cannot out a person | Free (at close and 5 answers) | `campaign.min_cohort` | Live | |
| Live results | Watch the room respond | Creator Plus, Pro, Team, Campaign Plus (approved) | `results.instant` | Live (000053) | |
| Creator-controlled visibility | The creator, not the platform, decides when results appear, and respondents are always told | Live: Plus and up. Live elections and instant answers: Team and Creator Pro (approved) | `results.instant_elections`, `results.instant_rows` | New | C1 |
| Present mode | Show results on a big screen | Free | | Live | |
| Trends | See what moved run to run | Creator Plus 5, Pro 10 (approved); Starter Hub 3, Team Hub 5 (000044) | `trends.max` | Live | C5 |
| Advanced analytics: breakdowns by role, source and time, compare runs, participation funnel, response-rate by role | Understand who is and is not being heard | Team Hub, Creator Pro (own surveys), Campaign Plus | `analytics.breakdown`, `analytics.compare`, `analytics.funnel` | New | C4 |
| Exports of released data | Take the data into a spreadsheet | Creator Plus and up, Starter Hub and up | `analytics.export` | Live (aggregates) | C4 |
| Scheduled digest to managers | The Hub's health arrives by email | Team Hub | `analytics.digest` | New | C7 |
| Embed released results on a page | Show the community's results on the Hub's own page | Team Hub | `analytics.embed` | New (P1) | C8 |

### 3.4 Decide and show impact (the new centre)

| Feature | Purpose | Access | Key | State | Spec |
| --- | --- | --- | --- | --- | --- |
| Decisions log | A Hub writes down what it decided, why, and links the evidence | Every Hub plan | `decisions.log` | New | C2 |
| "You said, we did" (publish a decision and its result to members) | People see that answering changed something, so they answer next time | Starter Hub and up | `decisions.publish` | New | C2, C3 |
| Share results with members | Members see the totals and charts of a closed Campaign | Starter Hub: totals and charts. Team Hub: plus breakdowns and comparisons | `results.share`, `analytics.breakdown` | New | C3 |
| Hub health panel (Pulse Lite) | An owner sees if the community is alive | Every Hub plan, simple; Team richer | `hub.health` | New | C6 |
| Decision posts to Discord | Discuss in Discord, decide in LunchVoice, announce in Discord | Starter Hub and up | `discord.connect` | New | F3 |

### 3.5 Belong

| Feature | Purpose | Access | State | Spec |
| --- | --- | --- | --- | --- |
| Hubs, roles (3 / 6), pages (3 / 10) | A home with structure and authority that is delegated safely | Starter / Team | Live | |
| Profiles and Hub nicknames | Be a person, not a number; keep a different face in each Hub | Free | Partial | E1 |
| Presence, topic tags, badges, Discord card on Hub | See who is here and what the Hub is about | Hub plans | Draft SQL | E2 |
| Notifications and preferences | Not missing what matters; never spammed | Free | New | E3 |
| Points, shop, leaderboard | Fun and recognition that cannot expose an anonymous answer | Hub plans | Partial | E4 |
| News, comments, reactions | The Hub talks to itself | Hub plans | Partial | E5 |
| Reports, blocks, appeals | Safety that works | Free | Partial | E6 |
| Discover | Be found | Team Hub at 700 genuine members | Live (gate), polish New | E8 |
| Founding seats and waitlist | A fair, small start | Free | Live | |

### 3.6 Platform

| Feature | Purpose | Access | State | Spec |
| --- | --- | --- | --- | --- |
| 30-day sign-in on a device | Do not log in every day | Free | New | A1 |
| `create.lunchvoice.com` | The place creators work (like Kahoot's creator) | Free (plan unlocks controls) | New | A2, G6 |
| `pay.lunchvoice.com` | A trustworthy payment and receipts home | Anyone paying | New | A4 |
| Billing, portal, receipts, refunds, Creator purchases | Paying is easy and reversible; people get what they paid for | Anyone paying | Partial | B1 to B7 |
| Hub Name Reservation | Keep your address | $25 / year | Live | B5 |
| API and webhooks | Connect LunchVoice to your tools | Team Hub | Live, docs polish | G1, G2 |
| Account export and deletion | Control over your data | Free | Partial (deletion live, export New) | G3 |
| Admin console | Staff can run billing, reports and servers | Staff | Live | G4 |

### 3.7 Survey design (additions)

| Feature | Purpose | Access | Key | State | Spec |
| --- | --- | --- | --- | --- | --- |
| Finished studio (autosave, undo, drag, mobile) | Making a survey is quick and forgiving | Free | | Partial | Y1 |
| Preview as respondent, test mode, publish checklist | Nobody publishes a broken survey | Free | | Partial (readiness lib) | Y2 |
| Personal and Hub templates, question bank | Reuse your best work | Free 3, Plus 20, Pro 100; Hub plans share | `templates.max_personal`, `templates.max_hub` | New | Y3 |
| Brand kit | Looks like you, in one click, on every survey | Creator Plus, Starter Hub and up | `survey.branding` | Partial | Y4 |
| Co-creator | Solo does not mean alone | Creator Pro (one); Hub managers by role | `cocreator.max` | New (P1) | Y5 |

### 3.8 Connectivity (additions)

| Feature | Purpose | Access | Key | State | Spec |
| --- | --- | --- | --- | --- | --- |
| Share kit (link, code, QR, messages, preview cards) | The survey reaches people where they are | Free (logo on QR: Creator Plus) | | Partial | N1 |
| Invite by email | Reach people outside Hubs and Discord, respectfully | Free 20, Plus and Starter 200, Pro and Team 1,000 | `invites.email_max` | Partial (invites exist, email is New) | N2 |
| Integration recipes | Send results to the tools you use | Team (API) | | New (docs) | N3 |
| Embed an answer link | Put the survey on your own site | Free for link surveys | | New (P1) | N4 |
| Activity feed and directory | A Hub feels alive and findable | Hub plans | `hub.directory_visibility` | New | E9 |

## 4. Entitlement keys this roadmap adds or changes

Existing keys are untouched. All new keys ship with a rollback and a pgTAP test in the migration that introduces them.
"Approved" means a founder decision; the rest are proposals under X-11.

| Key | Free | Creator Plus | Creator Pro | Starter Hub | Team Hub | Campaign Starter | Campaign Plus | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `results.instant` | no | yes | yes | no | yes | no | yes | approved: Plus, Pro, Team, Campaign Plus |
| `results.instant_elections` | no | no | yes | no | yes | no | yes | approved: Team, Pro |
| `results.instant_rows` | no | no | yes | no | yes | no | yes | approved: Team, Pro |
| `decisions.log` | n/a | n/a | n/a | yes | yes | yes | yes | proposal |
| `decisions.publish` | n/a | n/a | n/a | yes | yes | yes | yes | proposal |
| `results.share` (closed-Campaign totals and charts to members) | n/a | n/a | n/a | yes | yes | yes | yes | proposal |
| `analytics.breakdown`, `.compare`, `.funnel` | no | no | yes (own) | no | yes | no | yes | proposal (fills the undelivered Team "advanced analytics" claim) |
| `analytics.digest`, `analytics.embed` | no | no | no | no | yes | no | yes | proposal |
| `elections.max_active` | 0 | 0 | 0 | 1 | 3 | 1 | 3 | proposal (X-03) |
| `elections.methods` | none | none | none | plurality | plurality, approval, ranked | plurality | all three | proposal |
| `quiz.enabled` | per template tier | yes | yes | yes | yes | yes | yes | follows template plan tier |
| `live.max_participants` | 30 | 100 | 200 | 100 | 300 | 100 | 300 | proposal; set so one live session never exceeds the backend plan's realtime or request limits (A: confirm Supabase plan) |
| `discord.connect` | account link only | account link only | account link only | yes | yes | yes | yes | proposal ("server owners with Hub plans") |
| `notifications.digest` | yes | yes | yes | yes | yes | yes | yes | free for everyone |
| `hub.health` | n/a | n/a | n/a | basic | full | basic | full | proposal |

Starter Hub and Campaign Starter do not get live results (`AGENTS.md` approves them for Creator Plus, Creator Pro, Team
Hub and Campaign Plus only). The backend agent reads `lv.plan_limits` on day 1 and reports the live values; it changes none
of them.

**Values already live and not to change:** custom roles 3 / 6; custom pages 3 / 10 (Team provisional, final by X-06);
active Campaigns 15 / 15; active surveys 2 / 5; participation gates more than 50% / at least 20%; Quick Survey 5 active,
10 questions; Creator Plus 15 active and 30 questions; Creator Pro 100 active and 100 questions; Trends Creator Plus 5,
Creator Pro 10.

## 5. Where we stand against the field (F labels, read 2026-11-14; verify on each live page before any marketing claim)

| Product | Price points read | What it optimises | Where LunchVoice is different |
| --- | --- | --- | --- |
| SurveyMonkey | Team Advantage $30 per user per month, Team Premier $92 per user per month, both annual with a 3-user minimum (third-party summary of the live page, snippet read); individual prices hidden until sign-up | Companies collecting data; response quotas (50,000 and 100,000 a year on Team plans) | No response quotas for participants; creators pay a flat price; results go back to the people who answered; anonymity is visible to the respondent |
| Kahoot | Free Go: 10 players per live game; Kahoot+ Bronze $3, Silver $7, Gold $9 and One $19 a month on annual billing, with participant limits of 50, 100, 200 and 800 (student plan page) | Classroom and event games | Persistent communities, anonymous decision-making, no per-game player cap for ordinary surveys; quizzes are a mode, not the product |
| Mentimeter | Free 50 participants a month; Basic $14, Pro $28 per presenter per month (plans page, snippet) | Presentations | A Hub is a standing audience; results and decisions persist |
| Slido | Free: 100 participants per event, 3 polls and 1 quiz per slido (vendor community answer) | Meetings and Q&A | Same as above |
| Discord | Free; the place a community talks | Conversation | LunchVoice is the place it **decides**: a decision log, results and elections tied to roles |
| GitHub | Free for most, paid per seat for teams | Visible history, trust by transparency, roles and permissions | We borrow the model: a Hub's decision history is public or member-visible, permissioned and audited |

**Positioning line (J):** *Discord is where your community talks. LunchVoice is where it decides.* Tagline stays "Make
every voice count." (approved); the second headline "Every voice has a story. Hear it." stays on the home headline only.

## 6. Services and why each exists

| Service | Why it exists | What a person gets from it | Cost posture |
| --- | --- | --- | --- |
| Render static site | Serves the website | Fast pages worldwide, deploy on every merge | Free to host; exactly two custom domains |
| Supabase (Lunchvoice) | The whole backend, Postgres and Edge Functions | Correct, private data with row-level rules | Plan to confirm; PITR decision |
| Supabase (KpnIdentity) | One KpnSolute account across products | Sign in once with Google | Existing |
| Cloudflare (DNS, Workers) | The edge: share previews, 30-day sign-in, payment hostname, redirects | Faster and safer links; one sign-in per device | Free tier; Workers free allowance |
| Stripe | Payments, tax, portal, refunds | Pay by card, get receipts, cancel yourself | Per-transaction fees only |
| Resend | Email | Receipts, invites, notices | Free tier today |
| Discord bot | The community's room next to our decision room | Link your account, vote and see results where you talk | Free |
| PostHog (planned) | Learn what people use, without cookies or identities | A better product | Free tier |
| Sentry (planned) | Know when something breaks before users tell us | Fewer outages | Free tier |
| Cloudflare Turnstile (planned) | Stop bots without a puzzle | Less spam in answers and sign-ups | Free |
| Uptime monitor (planned) | Know if we are down | A status page | Free tier |
| Composio | Our agents' hands (GitHub, Stripe, Render, Cloudflare, Supabase) | Faster, safer operations | Existing |
