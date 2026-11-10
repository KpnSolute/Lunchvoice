# Brand and launch marketing (proposal, 2026-11-10)

Status: proposal for the founder. Copy here is ready to adapt and post, and none of it has been published. Nothing
in it promises a feature that is not live at `5d29758`; lines that depend on unbuilt work are marked.

## 1. Positioning

**For** people who run a group (a Discord server, a club, a team, a shift),
**who** need to know what their people really think,
**LunchVoice is** a survey tool
**that** people answer in seconds and trust to keep them anonymous,
**unlike** a form builder or a chat poll, which either show who voted or leave you guessing whether they do.

Category: community feedback. Not "forms", not "employee engagement".

## 2. The name

"LunchVoice" will be read as a cafeteria product by anyone who has not seen it. Two honest options:

| Option | Cost | Verdict |
| --- | --- | --- |
| Rename before launch | New domain, lost search history, relabel everything, three weeks before launch | No |
| **Keep the name, own the story, remove every cafeteria cue** | One paragraph on the About page and a copy pass | **Recommended** |

The story, in the founder's voice, for the About page and for every "why is it called that?" reply:

> LunchVoice started in a lunch line. The people eating had opinions and no safe way to give them, and the people
> cooking had no way to hear them. We built a way to ask. It turned out every group has a lunch line: a place where
> people know what's wrong and nobody's asking. So the name stayed.

Remove: "Know before the line clears", "scan the QR on the poster" as the hero visual's only scene, the brand
package tagline "Smart feedback. Better cafeterias.", and food imagery anywhere except the dining use-case card.

## 3. Brand rules

| | |
| --- | --- |
| Name | **LunchVoice**. One word. "LunchVoice by KpnSolute" in footers and legal text |
| Tagline | **Every voice. No names.** |
| Alternates | "Ask honestly. Hear honestly." (public hero) · "The poll your people will answer truthfully." (ads, Reddit) |
| One-liner | Anonymous surveys your community can answer in ten seconds, with results that never single anyone out. |
| Colors | Ink `#14110F`, Amber `#FF9A18`, Bone `#EEEDEA`, White `#FFFFFF`. Amber is the accent, never a background for text blocks |
| Type | Bricolage Grotesque for headlines, Geist for everything else, Space Mono for codes and numbers |
| Mark | `public/brand/lunchvoice-mark.svg` on ink or bone. Do not recolor, outline, rotate or place on photographs |
| Imagery | The product itself: a phone with one question, a results card, a QR on a real surface. No stock photos of smiling teams, no AI illustration |
| Shape language | Soft, pressable, rounded. Circles for ratings, pills for actions |

To fix in the asset package (`brand/lv-package/`): the wordmark is set in Georgia with the cafeteria tagline and the
name as two words; the README lists Cream `#FAF7F2` and Oat `#EFE7DC`, which the product does not use. Redraw the
lockup with the mark plus "LunchVoice" in Bricolage Grotesque 700, no tagline, and update the color list to the four
above. Until then use the mark alone.

## 4. Voice

Four traits, each with a limit.

| We are | Which means | But never |
| --- | --- | --- |
| **Plain** | Short words, short sentences, the specific thing | Curt or technical |
| **Warm** | We talk to one person; we assume good intent | Gushing, exclamation marks, emoji |
| **Honest** | We say what the product does and does not do, including limits | Hedging everything into mush |
| **Quietly confident** | We state the privacy promise as a fact because it is enforced in the database | Attacking competitors by name |

The word "anonymous" is used only where the product enforces it. For named surveys we say "named".

## 5. Messages by audience

| Audience | Their worry | Lead message | Proof |
| --- | --- | --- | --- |
| Discord / community moderator | "Members won't be honest if mods can see" | Ask your server anything. Not even you can see who said what. | Results show totals; groups under 5 are withheld; guests need no account |
| Club or event organiser | "Nobody fills in forms" | One QR code. Ten seconds. Done before they leave the room. | One question per screen, no app, no sign-in |
| Manager | "I only hear what people think I want to hear" | The feedback people won't say to your face, safely. | Anonymous by design; free-text shown unlinked and unordered |
| Respondent | "Is this really anonymous?" | The person who made this can't find out who you are. | The promise screen before the first question |

## 6. Landing page (rewrite of the top of `/`)

- **Eyebrow:** Anonymous surveys for any community
- **Headline:** Ask honestly. Hear honestly.
- **Sub:** Make a survey in a minute, share one link or QR code, and get answers people would never put their name
  on. You see totals. Never names.
- **Primary button:** Make a survey free → `/surveys/new`
- **Secondary:** Have a code? Enter it → `/join`
- **Trust row:** No app. No account to answer. Small groups are withheld, never guessed.

Sections, in order: (1) how it works in three steps: ask, share, hear; (2) the privacy promise with a picture of the
withheld state, the thing no competitor shows; (3) Hubs: a home for your community's surveys; (4) Discord: post a
survey to your server; (5) use cases; (6) pricing strip, three cards; (7) Founding members band: "The first 50
communities get a Hub free"; (8) the origin story in two lines.

Copy to remove or correct now (review P-2): "idea boards and elections" in `src/config/seo.json` and the JSON-LD in
`index.html`; "watch anonymous answers arrive" and "answers land by the minute" until results refresh on their own.

## 7. Launch plan for channels

Principle: **the product is its own advertisement.** Every survey answered shows LunchVoice to a new person. So the
launch job is to get surveys run in front of real groups, and marketing spend of money is zero.

### 7.1 Sequence

| When | What | Goal |
| --- | --- | --- |
| Now to launch −14 days | Fix the launch list (review §4). Recruit 10 **design partners**: communities the founder can reach personally, each runs one real survey | 10 real surveys, 300+ real answers, 5 quotes with permission |
| Launch −14 to −1 | Open the LunchVoice Discord (the KpnWorld Hub is its home). Post build notes twice a week. Ask partners for the single most confusing moment | A fixed list of the top 10 confusions |
| Launch week | Reddit posts (below), one per community per week at most. Show HN. Product Hunt on the Tuesday | 500 creators, 5,000 respondents |
| Weeks 2 to 6 | Discord bot directory listings; weekly "community of the week" result card; reply to every piece of feedback within a day | 30% of new creators arriving by referral |

### 7.2 Reddit

Rules that keep a founder from being banned: read each subreddit's self-promotion rule first; post as a person,
say you built it; give the useful thing in the post itself; answer every comment; never post the same text twice.

**r/SideProject, r/indiehackers (builder story)**

> **I built an anonymous survey tool that refuses to show results until it's safe**
>
> I kept seeing the same thing in groups I'm part of: someone runs an "anonymous" poll, three people answer, and
> everyone can work out who said what.
>
> So LunchVoice withholds results until at least 5 people have answered, merges tiny groups into one "withheld"
> bucket, and never shows free-text answers with a time or an order. The person who made the survey can't get
> around it. I can't either without touching the database.
>
> Answering needs no account: link, QR or a 6-character code. Making surveys is free (5 active, 10 questions).
> Paid plans are for communities that want members, roles and their own page.
>
> It's live at lunchvoice.com. I'd like to know where the privacy model is still weak, and whether the first two
> minutes make sense. Tear it apart.

**r/discordapp-adjacent and server-admin communities (use case)**

> **Mods: how do you find out what your server actually thinks?**
>
> Reaction polls show who voted, so people vote the way the loudest person did. I built a bot that posts a survey
> to a channel; members answer in the browser in a few seconds, no account, and mods only ever see totals. Under 5
> answers, nothing is shown at all.
>
> Free for the basics. Looking for 20 servers to try it and tell me what's missing. Happy to set it up with you.

**r/teachers, r/nonprofit, r/smallbusiness (problem first, adults only; F-11)**

> **A way to get honest feedback from a room in under a minute**
>
> Put a QR code on the last slide. People scan, tap through 3 questions, done. You see the totals on your screen.
> No names, no accounts, no app. Free for small surveys. I made it; feedback welcome.

### 7.3 Discord

- The LunchVoice server: `#announcements`, `#show-your-survey`, `#feedback` (answered by the founder daily),
  `#help`. Founding members get a role through the bot's role rules, which is also the live demo of that feature.
- First message in any server the bot joins: three lines. What it does, the one command to post a survey, the
  privacy promise. No onboarding wall.
- A weekly survey *about LunchVoice*, run on LunchVoice, with the result posted. The product explaining itself.

### 7.4 Word of mouth (built into the product)

| Surface | Mechanism | Status |
| --- | --- | --- |
| Guest thank-you screen | "Made with LunchVoice. Ask your own group something. Free." | to build (review P-4) |
| Shared results card | An image and public page a creator can post | to build (review P-9) |
| QR poster | A print-ready sheet with the code and "Powered by LunchVoice" | QR exists; poster layout to build |
| Founding member badge | A Discord role and a mark on the Hub page | role rules exist |
| Referral | "Give a community one free month of Hub; get one when they subscribe" | after billing is live; **Founder decision** |

## 8. Launch kit

**Product Hunt tagline (60 characters):** Anonymous surveys your community will actually answer

**Description (260):** Ask your Discord server, club or team anything. People answer in ten seconds with no account.
You see totals, never names, and small groups are withheld so nobody can be singled out. Free to start.

**First comment (founder):** the origin story from §2, then the three things that are different (withheld results,
no-account answering, Hubs), then one honest limit ("there are five question types today; logic and branching are
not here yet"), then a question to the audience.

**Short posts**

1. Most "anonymous" polls aren't. Three people answer and everyone knows who said what. LunchVoice shows nothing
   until five have answered. lunchvoice.com
2. A QR code, three questions, ten seconds. That is the whole feedback form.
3. We withhold results more often than any survey tool you've used. That's the feature.
4. Your Discord poll shows who voted. Ask yourself what that does to the answers.

**Email to a design partner**

> Subject: Would you run one survey with your group?
>
> Hi [name], I've built LunchVoice, a way to ask a group something and get honest answers because nobody, including
> the person asking, can see who said what. I'm looking for ten communities to try it before it opens in December.
> It takes about five minutes to set up and I'll do it with you. In return you get a Hub free as a Founding member,
> and I get to learn where it's confusing. Could we try it with [group] this week?

**Screenshots to prepare (six):** the question screen on a phone; the privacy promise; results with a withheld
bucket; "2 of 5 answers" locked state; a Hub page in a Hub color; the Discord post with the Answer button.

## 9. What we do not do

- No paid ads before the four loop numbers in the roadmap are healthy. Ads pour water into a leaky bucket.
- No marketing to minors; schools only through adult administrators (F-11).
- No fake counts, invented testimonials or "trusted by" logos. Quotes only with written permission.
- No claim of elections, idea boards, live results or integrations beyond Discord and the API until each is live.
- No marketing email. Transactional only (B-02).
- No comparison pages that name competitors until there is a customer who switched and will say why.
