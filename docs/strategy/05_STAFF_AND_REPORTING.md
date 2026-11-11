# Staff panel and the reporting system: review and refinement (proposal, 2026-11-11)

Status: proposal for the founder. Nothing in this document is built. "Reporting" here means **abuse reports**: a
person telling LunchVoice that a survey or a comment is harmful. It reads the code at `5d29758` plus migration 000029.

## 1. What exists

**Staff panel** (`/admin`, `src/pages/Admin.tsx`, migration 000023). Nine tabs: Overview, Reports, Hubs, Accounts,
Staff, Waitlist, Discover, Billing, Email. It is invisible to non-staff (they get the ordinary not-found page),
every action is audited, and nothing in it deletes data. That foundation is right.

**Reports.** Two sources feed one queue:

| Source | Who can report | Where | Stored as |
| --- | --- | --- | --- |
| Survey | Anyone, signed out included | "Report this survey" on every respondent screen | `lv.abuse_reports` (survey, free-text reason, reporter if signed in, status) |
| Comment | Signed-in members | Under a comment in a Hub | `lv.comment_reports` (one per person per comment), decision in `lv.comment_report_reviews` |

Staff actions: dismiss, block or unblock a survey, hide or show a comment, suspend a Hub or an account with a reason
the owner sees. Reporters are never shown to anyone. Suspension notices carry an appeal address.

## 2. Gaps, in order of how soon they will hurt

| # | Gap | Evidence | Why it matters |
| --- | --- | --- | --- |
| R-1 | **Nobody is told a report arrived.** The queue only shows a count when a staff member opens `/admin`. | no notification on insert | With one founder as the whole staff, a harmful survey can sit for days. Email now works, so this is cheap to fix. |
| R-2 | **Reporting can be switched off by one person.** At most 20 reports a minute are accepted *for the whole platform*, behind one lock. | `000014:1341-1345` | The same mistake as the old guest limit: one script sending 20 junk reports a minute silences every real one. |
| R-3 | **The reason category is lost.** The form offers four reasons (harmful, scam, asks for private information, other) and the app glues the label onto the text. | `src/pages/ReportSurvey.tsx:29` | Staff cannot sort or filter; a phishing report looks the same as "I didn't like the question". |
| R-4 | **Survey reports are not grouped.** Ten people reporting one survey make ten rows. Comment reports are already grouped per comment. | `lv_admin_reports` | The worst content produces the most noise, and the count that matters (distinct reporters) is not shown. |
| R-5 | **Nothing happens until staff act.** A survey reported by many different people keeps collecting answers. | no threshold | For phishing, hours matter. |
| R-6 | **Several things cannot be reported at all:** a Hub (name, cover text, pages), a news post, a guest's typed name, a free-text answer shown to a creator. | only `lv_report_abuse` (by survey code) and `lv_comment_report` exist | Guest names (000028) and Hub pages are user-written text visible to others. |
| R-7 | **The creator learns nothing and cannot respond.** A blocked survey just stops. Hub and account suspensions have a reason and an appeal address; a survey block shows its reason only to staff. | `lv.campaigns.blocked_reason` | Honest creators hit by a mistaken block have no path back except guessing to email. |
| R-8 | **Hub owners are not part of moderation for their own Hub.** Moderators see comment report counts, but survey reports about a Hub's own Campaigns go only to LunchVoice. | `000020:673` | Most problems inside a community are best handled by that community first. |
| R-9 | **The Overview tab shows operations, not the product.** Open reports, suspensions, staff, waitlist, Discover, email. No signups, surveys published, answers, or whether scheduled jobs ran. | `lv.api_admin_overview` | It is the one screen the founder will look at daily; it should answer "is it working and is it growing". |
| R-10 | **No record of how fast reports are handled.** Reports have a created time and a status, no decided time or decider (comments have both). | `lv.abuse_reports` columns | The roadmap sets a target (median under 24 hours) that cannot be measured. |

## 3. Proposed design

One migration in the **staff** module (`000030_v2_staff_reports`), one small UI pass. No new module, no new service.

### 3.1 One report shape

Keep both tables (they have different uniqueness rules) and give them the same fields:

| Field | Values |
| --- | --- |
| `category` | `harmful`, `scam`, `private_info`, `spam`, `other` (a real column; the form already collects it) |
| `detail` | optional text, 400 characters |
| `target_kind` | `survey`, `comment`, later `hub`, `news_post`, `guest_name` |
| `status` | `open`, `actioned`, `dismissed` |
| `decided_at`, `decided_by` | set by every staff decision |

`lv_report_abuse` gains `p_category`; the old two-argument call keeps working and files under `other`.

### 3.2 Limits that cannot silence reporting (R-2)

Per caller: 5 reports a minute and one open report per caller per survey (a repeat returns "received" and stores
nothing). Platform-wide ceiling raised to 300 a minute as a database safeguard only. Same pattern and the same
counter table as migration 000029. The response stays identical for known and unknown codes.

### 3.3 The queue (R-4)

Group survey reports per survey: title, Hub, **distinct reporters**, categories with counts, first and latest report,
the newest three details. Sort by a simple priority: `scam` and `private_info` first, then by distinct reporters,
then by age. Filters: status, category, kind.

### 3.4 Tell staff (R-1)

When a survey or comment gets its **first** open report, and again when it crosses 3 and 10 distinct reporters, queue
one email to staff (new template `staff_report`): what was reported, category, count, a link to the queue. Never the
reporter, never the detail text (it can contain personal information). Sent from `hello@`, to every active staff
account's verified email. Later: the same event to a private Discord channel through the existing bot.

### 3.5 Automatic pause (R-5) — founder decision

Proposal: when a survey reaches **5 distinct signed-in reporters, or 10 distinct callers, within 24 hours**, it stops
accepting answers ("This survey is paused while we review it") until staff decide. It is a pause, not a block:
nothing is deleted, the creator is emailed, and one click by staff restores it. Thresholds are policy rows.
Risk: a group could mass-report a survey they dislike to pause it. Mitigations: signed-in reporters weigh more, the
pause is temporary and visible to staff at once, and staff can mark a survey "reviewed, keep open", which exempts it.

### 3.6 Tell the creator (R-7)

A blocked or paused survey shows its creator a notice with the category (never the reporters), the community
guidelines link and the appeal address. One email per action (`survey_blocked`). Unblocking sends nothing.

### 3.7 More things to report (R-6)

In this order, each a small addition once the shape in 3.1 exists: a guest's typed name on the Responses list (the
creator reports it; staff can clear the name, the answer stays) → a Hub from its public page → a news post.
Free-text answers are deliberately last: on an anonymous survey there is nobody to act against, so the action is
"hide this text", by the creator, without staff.

### 3.8 Hub owners first (R-8)

Give Hub roles a `moderation.reports` capability (Owner by default). Its holders see reports about their own Hub's
Campaigns and comments and can pause their own Campaign or hide a comment. LunchVoice staff still see everything and
are the only ones who can block, suspend or dismiss platform-wide. Reporters stay hidden from Hub moderators too.
This can wait until Hubs with real communities exist.

### 3.9 Overview that answers "is it working" (R-9, R-10)

Replace the tile row with three rows, fed by the counters proposed in the backend architecture document (§8):

| Row | Tiles |
| --- | --- |
| Growth, today and 7 days | New accounts · Surveys published · Answers · Surveys that closed with 5+ answers |
| Health | Scheduled jobs (last success of each) · Email queued / failed · Answers refused by a limit · Client errors |
| Trust | Open reports by category · Median time to decision (7 days) · Surveys paused or blocked · Suspensions |

Billing and waitlist keep their own tabs. Stripe keys are already set on the project; the Overview should state
whether checkout is open instead of a notice that appears only when it is closed.

## 4. Support questions are not reports

Questions and enquiries go to `admin@lunchvoice.com` (founder, 2026-11-11); service email (verification, plan and
credit notices, invites) comes from `hello@lunchvoice.com` with replies routed to `admin@`. That split is now the
dispatcher's default. No ticket system is proposed: below roughly 20 messages a week a mailbox is the right tool. The
"Contact support" links already prefill where the person was.

## 5. Order and size

| Step | Contains | Size |
| --- | --- | --- |
| 1 | 3.1 category, 3.2 limits, 3.3 grouped queue, decided-at | one migration, one tab |
| 2 | 3.4 staff email, 3.6 creator notice and email | two templates, needs the dispatcher schedule |
| 3 | 3.9 Overview | needs the counters migration |
| 4 | 3.5 automatic pause | after the founder decides the thresholds |
| 5 | 3.7 more targets, 3.8 Hub moderators | after launch |

Steps 1 and 2 belong before the December launch: they are what lets one person run moderation.

**Status 2026-11-11:** step 1 and the staff email from step 2 are built as migration 000030 (R-1, R-2, R-3, R-4, R-10),
with the scheduled-jobs card from step 3 in 000031. Not yet built: the creator notice (3.6), the growth and trust
tiles (3.9), automatic pause (3.5), more report targets (3.7), Hub moderators (3.8).

## 6. Decisions needed

1. Automatic pause: yes or no, and the thresholds (proposed 5 signed-in or 10 callers in 24 hours).
2. Who receives report emails: every staff account, or one address.
3. Whether Hub owners see reports about their own Hub at launch or later (proposed: later).
