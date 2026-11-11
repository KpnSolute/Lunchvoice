# Go-to-market: getting people to try LunchVoice

Status: working plan, 2026-11-11. SEO groundwork is in `docs/frontend/SEO.md`. Founder decisions that bind this plan:
`docs/v2/LAUNCH_PLAN.md` (waitlist launch, 50 Founding seats, F-11 no marketing to minors, F-03 the waitlist is never
authorization). Nothing here names or special-cases any customer.

## Who we are for

Adults who run a group and need honest answers: club and association organisers, event hosts, team leads, community
and neighbourhood managers, instructors and administrators (schools only as adult administrators' use case, F-11),
cafés and canteens as one use case among many. The wedge is **anonymous answers that really are anonymous, with live
totals**, and a free tier that is complete enough to be useful.

One line: *Build a survey in minutes, share it by QR code, see anonymous results live. Free.*

## The path to trying it (what exists now)

1. Search or a shared link lands on a public page (`/`, `/use-cases`, `/pricing`, `/how-it-works`).
2. **Start a free Quick Survey** (`/surveys/new`) needs only a sign-in. No Hub, no card, no waitlist.
3. **Pick a template** (new): Event feedback, Team pulse, Pick a time, Suggestion box, Service feedback, Meeting
   feedback. The draft arrives with its questions, ready to edit and publish.
4. Share by link, QR code, six-character code or invite. Respondents never need an account when guests are allowed.
5. Results are live and privacy-safe. A Hub (`lunchvoice.com/yourname`) and the Founding seat are the upgrade path.

### Shareable template links

These open the template after sign-in (the sign-in redirect keeps the query):

| Use in | Link |
| --- | --- |
| Event organisers | `https://lunchvoice.com/surveys/new?template=event-feedback` |
| Team leads | `https://lunchvoice.com/surveys/new?template=team-pulse` |
| Groups picking a time | `https://lunchvoice.com/surveys/new?template=group-decision` |
| Communities, clubs | `https://lunchvoice.com/surveys/new?template=suggestion-box` |
| Shops, canteens, classes | `https://lunchvoice.com/surveys/new?template=service-feedback` |
| Workshops, meetings | `https://lunchvoice.com/surveys/new?template=meeting-feedback` |

Template ids are permanent once a link is published; add new ids rather than renaming (`src/config/surveyTemplates.ts`).
Add `&utm_source=<channel>` to any link to tell channels apart in whatever analytics is chosen (see Measurement).

## Channels, in order

**Week 1: owned and free**
- Search: already live. In Search Console request indexing for `/`, `/pricing`, `/how-it-works`, `/use-cases`.
- Bing Webmaster Tools (import from Search Console) and Cloudflare Crawler Hints.
- A personal launch post from the founder (LinkedIn, X, Facebook groups they already belong to) with one template link.
  People trust a person describing a real use, not a brand announcement.
- Email signature and `admin@lunchvoice.com` footer line: "Free anonymous surveys: lunchvoice.com".

**Weeks 2-4: communities where adults already run surveys**
- Product directories: Product Hunt (prepare a launch day, ask for feedback not votes), AlternativeTo (list as an
  alternative to Google Forms, SurveyMonkey, Typeform), SaaSHub, BetaList, Indie Hackers.
- Reddit and forums (r/nonprofit, r/sysadmin-style team lead communities, club and event-organiser groups): follow each
  group's self-promotion rules, answer real questions ("how do I run an anonymous staff survey?") with the template
  link, never drop a bare ad.
- Direct outreach to 20-30 organisers of clubs, associations, neighbourhood groups and small teams: offer to set up
  their first survey with them. Their results are your first case studies (with permission, in their words).

**Month 2 onward: content that compounds**
- One page per use case (`/use-cases/anonymous-employee-survey`, `/use-cases/event-feedback-form`, ...), each with
  real copy, the sample questions, and a "Use this template" button. Each is an `seo.json` entry plus a Render
  rewrite. This is the highest-leverage build after launch.
- Comparison pages (LunchVoice vs Google Forms / SurveyMonkey) on anonymity and live results.
- Founder write-ups: "What anonymous really means in a survey tool", "Why a small group's results are withheld".
  These are distinctive, linkable and match the product's actual behaviour.

## Offers that are true today

- **Free Quick Surveys:** 5 active, 10 questions each, for anyone signed in.
- **50 Founding seats:** a Starter Hub free until paid billing launches and 30 days after. Scarcity is real; show the
  live seat count (the landing page already does) and never invent urgency beyond it.
- Do not advertise a price as purchasable until checkout is open on the live site.

## Messaging rules

- Say "anonymous" only where it is true: the creator cannot resolve who answered. Say "totals only" and "small groups
  are withheld", which is also a differentiator.
- No fabricated testimonials, logos, user counts or reviews. Use real quotes only, with permission.
- No marketing aimed at under-18s, and no ad targeting that includes them (F-11).
- Dining is one use case. Keep copy general.

## Measurement (founder decision needed)

There is no analytics today, deliberately: the product's promise is privacy, and any script must pass the CSP and be
disclosed in `/privacy`. Options, least to most invasive:

1. **Search Console only** (already available): impressions, clicks, queries, indexed pages. Free, no script.
2. **Counts from our own database**, shown in the admin console: Quick Surveys created per day, by template; sign-ups;
   waitlist seats. Answers "do people try it?" with no tracking of visitors. Needs a small backend change.
3. **Cookieless web analytics** (e.g. Cloudflare Web Analytics or Plausible): adds a script. Needs a `script-src` and
   `connect-src` change in `render.yaml`, a line in the privacy page, and counsel's view since legal text is pending.

Recommendation: do 1 now and 2 next; defer 3 until legal review is done.

## Growth loop (founder decision needed)

The respondent screens carry only "Powered by LunchVoice". Every respondent is a possible creator, so a quiet "Make your
own survey, free" link on the thank-you screen is the cheapest loop available. It is **not built** because respondents
can be under 18 and F-11 forbids marketing to minors at launch. Decide whether to show it only to signed-in adult
accounts, only after counsel review, or not at all.

## First 30 days: what to track

| Question | Where it shows |
| --- | --- |
| Are we being found? | Search Console: impressions and clicks for `lunchvoice`, "anonymous survey", "event feedback form" |
| Do people try it? | Quick Surveys created, share of those from a template (needs measurement option 2) |
| Do they publish and get answers? | Published surveys with at least one response |
| Is the waitlist moving? | Seats taken out of 50 (public on the landing page) |

## Owner checklist

- [ ] Search Console: re-submit the sitemap, request indexing for the four main pages.
- [ ] Bing Webmaster Tools import; Cloudflare Crawler Hints on.
- [ ] Post the launch message with a template link; pin it.
- [ ] List on AlternativeTo, SaaSHub, BetaList; schedule Product Hunt.
- [ ] Contact 20 organisers personally; record what confuses them.
- [ ] Decide measurement option and the respondent growth loop.
- [ ] Confirm `admin@lunchvoice.com` is monitored; replies are part of the product.
