# Product core: what LunchVoice is for (proposal, 2026-11-10)

Status: proposal for the founder. It does not change the master spec, prices or entitlements. It gives every later
decision, feature and sentence of copy one thing to be measured against.

## 1. The one sentence

**LunchVoice lets any group ask its people an honest question and get an honest answer, because the people answering
can trust that they will not be singled out.**

Everything else follows from the second half. Free form builders already exist and are good. What a club leader, a
moderator, a shift manager or a teacher cannot get from them is *credible* anonymity: a tool whose results screen
structurally cannot show who said what, and says so to the respondent before they answer. LunchVoice already has
that engine (minimum cohort, merged withheld bucket, dominance rule, no timestamps on free text). It is the hardest
part of the product to copy and the part the public site talks about least.

## 2. Who it is for

Ranked by how well the product fits them today and how reachable they are for a December launch.

| # | Person | Their question | Why us | Reach |
| --- | --- | --- | --- | --- |
| 1 | **Community moderator** (Discord server, subreddit, gaming clan, creator community; 50 to 5,000 members) | "What do you actually want from this server?" | Members answer in ten seconds with no account; the bot posts it; nobody fears the mods seeing their name | Discord, Reddit; the launch channel |
| 2 | **Organiser of a small group** (club, society, team, congregation, residents' association) | "Did that event work? What next?" | A QR on a slide or a poster; results they can read out | Word of mouth; one organiser brings 20 to 200 respondents |
| 3 | **Frontline manager** (dining, retail, shift work, a school department) | "What is going wrong that nobody tells me?" | Staff will not be honest on a named form | Slower sales; highest willingness to pay; the product's origin |
| 4 | **Respondent** | "Is it safe to say what I think?" | The promise shown before the first question | Arrives by link; becomes 1 to 3 at some rate |

Not at launch: enterprises (procurement, SSO, data-processing agreements), researchers (logic, quotas, panels),
schools collecting data from minors (F-11).

## 3. The loop

```
creator makes a survey  →  shares a link, QR or code  →  people answer in seconds, no account
        ↑                                                            ↓
they make their own   ←  "Made with LunchVoice" on the thank-you  ←  they see their voice counted
        ↑                                                            ↓
        └──────────  creator posts the result or "you said, we did"  ┘
```

The product grows only when this loop turns. Every feature should be judged by which arrow it strengthens. A shop
strengthens none of them. A shareable result card strengthens two.

## 4. Product principles

1. **Ten seconds to answer.** No account, no app, no loading spinner longer than a blink, one question per screen on
   a phone. Anything that slows a respondent needs a strong reason.
2. **The privacy promise is shown, kept and never softened.** Before the first question the respondent reads what
   the creator can and cannot see. Withheld is a state with a reason, never a zero. We never use "anonymous" where a
   join could undo it.
3. **Free is real.** A person can run a useful survey without paying or creating a Hub. Paying buys a home for a
   community (members, roles, pages, more of everything), never the right to see who answered.
4. **Close the loop.** A survey that leads to nothing teaches people to stop answering. The product nudges creators
   to post what changed.
5. **One platform, no special customers.** Every Hub is created through the same public flow.
6. **Calm software.** No streaks, no guilt notifications, no dark patterns on cancel. Playful in the brand, plain in
   the app.

## 5. What LunchVoice should become

Three horizons. Each one is earned by the numbers of the one before; none is scheduled by date alone.

**Horizon 1, launch to about 2,000 creators: the honest poll for communities.**
Quick Surveys and Hubs as they are, made fast, clear and shareable. Discord as the first distribution channel. The
only new product work is on the loop: thank-you invitation, locked-results state, shareable results, live refresh,
Discord sign-in.

**Horizon 2, about 2,000 to 20,000 creators: the community's standing feedback channel.**
Recurring surveys ("weekly pulse" that reopens itself and charts the trend), a templates gallery made by real
communities, "you said, we did" as a first-class post that notifies respondents who opted in, more question kinds
(ranking, scale with labels, image choice), and the two modes the site already wants to promise, built properly:
**idea boards** (submit, upvote, status) and **elections** (eligibility roll, one person one vote, sealed until
close, audit count).

**Horizon 3, beyond: a trust layer other tools use.**
The suppression engine and eligibility proof exposed through the API so other products can ask LunchVoice "collect
this anonymously and give me only what is safe". Embeds for websites. Slack and Microsoft Teams beside Discord.
Organisation accounts that own several Hubs. This is where the higher price points live.

What it should **not** become: a general form builder (payments, file uploads, conditional logic trees), a social
network, or a rewards marketplace. Points and the shop came from the product's first life and pull toward a
different business. They stay as optional pages a Hub owner can add; build no more on them until customers ask twice.

## 6. Vocabulary

One word per thing, in the interface, the docs and the marketing.

| Users see | Meaning | Internal name | Never shown |
| --- | --- | --- | --- |
| **Survey** | Anything you ask (a poll is a one-question survey) | Campaign; Quick Survey when it lives in a personal space | "Campaign" outside paid Hubs, "survey-mode Campaign" |
| **Hub** | A community's home at `lunchvoice.com/name` | Hub (`kind = community`) | "personal space", "tenant" |
| **Code** | The six characters that open a survey | join code | – |
| **Invite** | A link that lets one person into a Hub or a private survey | Hub invite, Campaign invite | "token" |
| **Plan** | What a Hub is on: Free, Hub, Team, or a pass | entitlement, product, family | "entitlement", "family", "credit" |
| **Founding member** | One of the first 50 | waitlist admission + Founding grant | "seat" as a noun for a person |
| **Anonymous** | The creator cannot find out who answered | `anonymity = anonymous` | used loosely |
| **Named** | The creator sees who answered | `anonymity = identified` | "identified" |
| **Guest** | Someone answering without an account | guest | – |
| **Withheld** | Hidden because showing it could single someone out | suppressed, withheld | "0", "N/A", "no data" |

Inside a paid Hub, "Campaign" may remain the label for the planned, scheduled kind of survey, because Hub owners
think in campaigns. Everywhere a free user or a respondent can see, the word is "survey".

## 7. The first five minutes (target experience)

**Respondent** (from a Discord message): tap the link → a screen with the survey title, the Hub or creator name, and
one sentence of promise → Start → one question per screen, large targets → Submit → "Thanks. Your answer is in." →
optional: see results when they open, make your own.

**Creator** (from Reddit): landing → "Make a survey free" → sign in (Google or Discord) → a survey with one example
question already in it → edit, add → Publish → a share sheet with the link, the code and a QR, plus "post to
Discord" → results page showing "0 of 5 answers" with the share controls → at 5, charts appear → "Share the result"
and "Post what you'll do about it".

Success is measured by four numbers (roadmap §5): creators who publish within 10 minutes of signing in, surveys that
reach 5 answers, respondents who start their own survey, and creators who publish a second survey within 30 days.

## 8. Pricing as the user should see it

Decided by the founder on 2026-11-11 (F-16, F-17). Monthly prices are unchanged.

| Card | Price | For | Headline |
| --- | --- | --- | --- |
| **Free** | $0 | anyone | 5 active surveys, 10 questions each, link, QR or code |
| **Hub** | $13 / month | one community | Members, 3 roles, 3 pages, 15 active surveys, export |
| **Team** | $29 / month | larger communities | 6 roles, more pages, role targeting, deeper analytics, API and Discord roles |

Starter Hub and Team Hub also come yearly at two months free: **$130** and **$290** a year, shown with a monthly /
yearly toggle once billing opens. Directly under the cards: "Reserve your Hub URL", $25 per 12 months.

Under the cards, one line: "Only need it for an event? Get a two-week pass from $19." The passes (Campaign Starter,
Campaign Plus) and the URL reservation remain purchasable from checkout and Hub settings; they do not need columns.
The participation-threshold rule is explained in Hub settings at the moment it applies, never on the pricing page.

## 9. Risks to the idea itself

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| "Anonymous poll" is a feature of Discord, Slack and Google Forms | The free alternative is one click away | Lead with what they cannot do: guaranteed-safe results, a home for past surveys, closing the loop, QR in a room |
| Free tier is generous enough that few pay | Revenue lags usage | That is acceptable through Horizon 1. The paid line is community features (members, roles, targeting), which free polls never need |
| The name says lunch | Wrong first impression for a Discord moderator | Own the origin as a story, drop every cafeteria phrase (brand doc §2) |
| Abuse of free anonymous surveys | Harassment and spam ride on anonymity | Already built: reports, staff blocks, suspensions, never in Discover. Add per-guest limits (B-1) and a link scanner on free text before public result sharing ships |
| Minors | Schools are an obvious use case | F-11 stands: adult administrators only, no marketing to minors, counsel before any student-data workflow |
