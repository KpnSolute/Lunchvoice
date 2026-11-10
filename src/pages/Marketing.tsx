import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { MadeBy } from "../components/MakerMark";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../config/contact";
import { DELETE_COPY } from "./Account";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/shadcn/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Eyebrow, Notice } from "@/components/shadcn/blocks";
import { StateScreen } from "../ui/StateScreen";
import { DiscoverDirectory } from "./lazy";

/** The legal operator is not decided yet. Never invent a company entity (founder decision 8). */
const OPERATOR = "[Legal operator name — pending]";

function Head({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: ReactNode }) {
  return (
    <div className="lv-mk-head">
      <Eyebrow accent>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function LegalPending() {
  return <Notice tone="warn" title="Legal text pending review">This page is a plain-language summary drafted for launch. It is not the reviewed legal text, which replaces it before public sign-ups open.</Notice>;
}

/* --------------------------------------------------------------- how it works */

const LOOP: { icon: IconName; title: string; body: string }[] = [
  { icon: "survey", title: "Ask with a Quick Survey", body: "No Hub needed. Up to 5 active surveys of up to 10 questions, shared by link, QR, a six-character code, or invite links." },
  { icon: "home", title: "Or give your community a Hub", body: "lunchvoice.com/your-hub, with members, roles, pages and Campaigns. Choose open, approval or invite only, and change it later." },
  { icon: "clock", title: "Campaigns have a lifecycle", body: "Draft, scheduled, open, closed. Questions can change while it’s a draft and lock once it’s published." },
  { icon: "dashboard", title: "Results you can defend", body: "Totals only. A group too small to stay anonymous is withheld, and a withheld value is never shown as zero." },
];

const FAQ: [string, string][] = [
  ["What makes an answer anonymous?", "Eligibility is checked apart from the answer. On an anonymous survey the creator sees totals and can’t link an answer to a person."],
  ["Who can see results?", "The creator of a Quick Survey, and on a Hub only people with the results permission. Membership alone doesn’t grant it."],
  ["What about guests?", "A link survey can accept guests who answer without an account. Guests never become members, never count toward thresholds, and are labelled as unverified in results. On an identified survey the creator may ask guests for a name; it is typed by the guest, never verified, and never asked on an anonymous survey."],
  ["Can totals ever reveal one person?", "We withhold small groups, merge hidden answers into one Withheld bucket, hide averages that could give a group away, and keep anonymous Campaigns open to all members rather than to chosen roles. One limit remains: if an anonymous Campaign runs again after exactly one new member joins, comparing the two sets of totals can hint at that person\u2019s answer. We\u2019re adding protection for that; until then, creators can see who joined in the member list."],
  ["Is every question required?", "Unless the creator marks a question optional, it needs an answer. The survey tells you before you start."],
];

export function HowItWorks() {
  return (
    <div className="lv-mk">
      <Head eyebrow="How it works" title="From a question to a decision, without exposing anyone." sub="Quick Surveys for one-off questions, Hubs for communities, and a privacy floor that holds even when someone asks for the raw data." />
      <div className="lv-mk-grid">
        {LOOP.map((s, i) => (
          <Card key={s.title}>
            <div className="ui-spread"><span className="lv-mk-icon"><Icon name={s.icon} size={22} /></span><Eyebrow>{String(i + 1).padStart(2, "0")}</Eyebrow></div>
            <h2 className="lv-mk-card-title">{s.title}</h2>
            <p className="lv-mk-card-body">{s.body}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="lv-mk-card-title">Questions about privacy</h2>
        <Accordion type="single" collapsible>
          {FAQ.map(([q, a]) => <AccordionItem key={q} value={q}><AccordionTrigger>{q}</AccordionTrigger><AccordionContent><p>{a}</p></AccordionContent></AccordionItem>)}
        </Accordion>
      </Card>
      <div className="ui-row">
        <LinkButton to="/surveys/new" variant="primary" size="lg" icon="arrow">Start a Quick Survey</LinkButton>
        <LinkButton to="/waitlist" variant="secondary" size="lg">Join the waitlist</LinkButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ use cases */

const CASES: { icon: IconName; name: string; line: string; ex: string }[] = [
  { icon: "star", name: "Clubs and societies", line: "Settle a decision, rate an event, or float ideas before the next meeting.", ex: "Which night works? · Rate the venue" },
  { icon: "roster", name: "Teams and leagues", line: "Availability, season feedback and next-season planning in one place.", ex: "Who can play Saturday? · Rate the season" },
  { icon: "sparkle", name: "Events and meetups", line: "A QR code on the table, results before you pack up.", ex: "How was tonight? · What should we run next?" },
  { icon: "bulb", name: "Workplaces", line: "Idea boxes and pulse questions with a privacy floor you can point at.", ex: "One change you’d make · Rate the offsite" },
  { icon: "home", name: "School and campus staff", line: "Administrators and staff asking adult colleagues, parents or guardians, with results that never name anyone.", ex: "Rate the parents’ evening · Choose the training day" },
  { icon: "fork", name: "Dining and catering", line: "Menu and service feedback from the people you serve.", ex: "Rate today’s lunch · Which dish should return?" },
];

export function UseCases() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Use cases" title="Dining is one use case. Yours is probably different." sub="Anything a group needs to ask, answer and settle, where the answer matters but the respondent shouldn’t be exposed." />
      <div className="lv-mk-grid">
        {CASES.map((c) => (
          <Card key={c.name}>
            <span className="lv-mk-icon"><Icon name={c.icon} size={22} /></span>
            <h2 className="lv-mk-card-title">{c.name}</h2>
            <p className="lv-mk-card-body">{c.line}</p>
            <Eyebrow>{c.ex}</Eyebrow>
          </Card>
        ))}
      </div>
      <div className="ui-row"><LinkButton to="/surveys/new" variant="primary" size="lg" icon="arrow">Start a Quick Survey</LinkButton></div>
    </div>
  );
}

/* ------------------------------------------------------------------ /beta (older links) */

export function Beta() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Launch" title="The beta became the waitlist." sub="LunchVoice opens through a waitlist. The first 50 admitted people receive a Founding Hub credit." />
      <div className="ui-row"><LinkButton to="/waitlist" variant="primary" size="lg">Go to the waitlist</LinkButton></div>
    </div>
  );
}

/* ------------------------------------------------------------------ about / status */

export function About() {
  return (
    <div className="lv-mk">
      <Head eyebrow="About" title="A community feedback platform, built to keep its promises." sub="LunchVoice by KpnSolute exists because most feedback tools ask people to trust a policy, then publish numbers that quietly identify them." />
      <div className="lv-mk-grid">
        <Card><h2 className="lv-mk-card-title">What we build</h2><p className="lv-mk-card-body">Quick Surveys, Hubs, Campaigns and privacy-safe results for clubs, teams, events, workplaces and neighbourhoods.</p></Card>
        <Card><h2 className="lv-mk-card-title">What we refuse</h2><p className="lv-mk-card-body">No withheld value dressed up as zero, no answer linked to a name on an anonymous survey, and no customer special-cased in the product.</p></Card>
      </div>
      <MadeBy />
    </div>
  );
}

export function Status() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Status" title="Status reporting isn’t wired up yet." sub="No monitoring feed exists, so this page doesn’t pretend to know." />
      <Notice tone="warn">This page becomes useful once the platform has an uptime feed. Until then, write to <a className="lv-inline-link" href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> if something looks broken.</Notice>
    </div>
  );
}

/* ------------------------------------------------------------------ legal */

export function Terms() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Terms" title="Terms of service" sub={<>LunchVoice by KpnSolute. Operated by {OPERATOR}.</>} />
      <LegalPending />
      <div className="lv-mk-prose">
        <h2>Using LunchVoice</h2>
        <p>Answering is free. Quick Surveys are free for signed-in accounts. Hubs and Campaign plans are paid once billing opens; until then nothing is charged. You’re responsible for what you ask and for having a lawful reason to ask it. LunchVoice isn’t aimed at children.</p>
        <h2>Privacy is a product constraint</h2>
        <p>The platform refuses to publish results that could identify a respondent. Asking us to reveal who gave an anonymous answer isn’t a supported request.</p>
        <h2>Plans and cancellation</h2>
        <p>Prices exclude applicable tax. Cancel a Hub plan anytime; access continues to the end of the paid period. Campaign plans are refundable until the Campaign window starts. When paid access ends, premium actions lock; your data is not deleted.</p>
        <h2>Reporting abuse</h2>
        <p>Every survey has a “Report this survey” action. Everything you post or ask must follow the <Link to="/guidelines">Community Guidelines</Link>. We may block a survey that breaks these terms.</p>
        <h2>Contact</h2>
        <p><a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a></p>
      </div>
    </div>
  );
}

export function Guidelines() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Community" title="Community Guidelines" sub="LunchVoice is for asking people things and listening to the answers. These rules apply to every Hub, Campaign, Quick Survey, post, comment and shop item." />
      <LegalPending />
      <div className="lv-mk-prose">
        <h2>The rules</h2>
        <ol>
          <li><strong>Respect people.</strong> No harassment, threats, bullying or hate based on who someone is.</li>
          <li><strong>Respect anonymity.</strong> Don’t try to work out who gave an anonymous answer, pressure people to reveal their answers, or design surveys to single someone out. This is the one rule that is unique to LunchVoice, and we take it seriously.</li>
          <li><strong>Ask honestly.</strong> No surveys that trick people: no collecting passwords, payment details or ID numbers, no phishing, no pretending to be someone you’re not.</li>
          <li><strong>Keep it legal and safe.</strong> No illegal content, no sexual content involving minors, no promoting violence or self-harm, no selling prohibited goods in a Hub shop.</li>
          <li><strong>No spam or manipulation.</strong> No bulk-created surveys, fake accounts or vote stuffing, and no misleading Discover listings. Polls are opinions, not official elections; don’t present them as binding votes unless they are.</li>
          <li><strong>Protect other people’s information.</strong> Don’t post someone’s private details (doxxing), and don’t ask for more personal data than your question needs.</li>
          <li><strong>Respect others’ work.</strong> Don’t post content you don’t have the right to share.</li>
        </ol>
        <h2>Hub owners and moderators</h2>
        <p>Owners and moderators are responsible for their Hub. Use the tools: hide or delete comments, remove members and review reports. A Hub can add its own rules on a custom page; they can be stricter than these, never looser.</p>
        <h2>Reporting</h2>
        <p>Use “Report this survey” or “Report” on a comment, or email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. Reports are confidential: the person you report is never told who reported them.</p>
        <h2>What we may do</h2>
        <p>We may remove content, block a survey, remove a Hub from Discover, or suspend a Hub or an account. A suspended account can still sign in, read, leave Hubs and delete its data, but can’t answer, join, create or post. Answers are never deleted to punish a respondent. To appeal, email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.</p>
      </div>
    </div>
  );
}

const STORED: [string, string][] = [
  ["Your sign-in", "The verified KpnIdentity issuer and subject (your KpnSolute account, signed in with Google). This is your identity; your email is never used as one."],
  ["Profile", "Your display name, and the email address cached from your sign-in."],
  ["Waitlist contact email", "Optional. Only if you give it and agree; used for launch and account updates; deleted when you delete your account."],
  ["Answers", "What you answer on surveys and Campaigns. On anonymous surveys the creator sees totals only and can’t link an answer to you. On identified surveys the creator sees who answered; a guest’s name, if the survey asks for one, is what the guest typed."],
  ["Hubs and memberships", "Hubs you create or join, your roles in them, and invitations."],
  ["Community activity", "In Hubs that switch them on: posts and comments you write, reports you file, whether you opted in to the leaderboard, Hub points and shop orders. The leaderboard shows only members who opt in, and only how many of the Hub’s ended Campaigns (anonymous ones included) they took part in, never what they answered."],
  ["Payments", "If you buy a plan, Stripe handles your card and billing details. We keep your Stripe customer reference and which plan you bought, never your card number."],
  ["Emails we send", "Only service emails: waitlist confirmation, Hub created, invitations someone sends you, reservation reminders, receipts for identified Campaigns (never anonymous ones, and never your answers) and shop order updates. Queued emails are kept up to 30 days after sending, then deleted, and are deleted with your account."],
  ["Discover", "Approved Team Hubs can be listed publicly at /discover with their name, category and a member count rounded down to the nearest 100. Quick Surveys and private Hubs are never listed."],
];

const STORAGE_KEYS: [string, string, string][] = [
  ["lv.session", "localStorage", "Keeps you signed in on this device until the session expires or you sign out."],
  ["lv.theme", "localStorage", "Your light, dark or high-contrast choice."],
  ["lv-draft-<survey>", "localStorage", "Answers in progress, so a reload doesn’t lose them. Removed after you submit."],
  ["lv-guest-key-<code>", "localStorage", "A random key that lets a guest answer a survey once. It isn’t linked to who you are."],
  ["lv.signin.pending", "sessionStorage", "One-time values for the sign-in redirect. Removed when sign-in finishes."],
];

export function Privacy() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Privacy" title="What we store, and what we deliberately don’t." sub={<>LunchVoice by KpnSolute. Operated by {OPERATOR}.</>} />
      <LegalPending />
      <div className="lv-mk-prose">
        <h2>What we store</h2>
        <ul>{STORED.map(([k, v]) => <li key={k}><strong>{k}.</strong> {v}</li>)}</ul>
        <h2>Anonymity</h2>
        <p>On an anonymous survey we check that you may answer separately from what you answer, so results can’t be traced back to you. A group too small to stay anonymous is withheld, never shown as zero. Written answers on anonymous surveys appear only once enough people have answered, in random order, without names or times. On an identified survey the creator can see who answered, and you’re told before you start.</p>
        <h2>Who can see stored data</h2>
        <p>People who run LunchVoice can access the database to operate, secure and support the service. Anonymous answers are stored without any link to who gave them, so that access can’t tie them to you either.</p>
        <p>Our hosting and database providers keep standard request logs, such as IP address and browser, for security and operations.</p>
        <p>Data is stored in the United States (database in US West, sign-in in US East).</p>
        <h2>Children</h2>
        <p>LunchVoice is not directed at children under 13, and we don’t knowingly collect their personal information. Schools and organisations use it through adult administrators.</p>
        <h2>Guests</h2>
        <p>Guests answer link surveys without an account. They never become members, never count toward member totals or thresholds, and can’t see private Hub content. Results label guest responses as unverified. On an identified survey the creator can choose to ask guests for a name (optional or required). A guest types it themselves, it is not verified, and the creator sees it next to that guest’s answers. An anonymous survey never asks for or stores a name.</p>
        <h2>On this device</h2>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Where</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
          <TableBody>{STORAGE_KEYS.map(([k, w, why]) => <TableRow key={k}><TableCell className="ui-mono">{k}</TableCell><TableCell>{w}</TableCell><TableCell>{why}</TableCell></TableRow>)}</TableBody>
        </Table>
        <p className="ui-help lv-m0">No cookies, analytics or advertising trackers. Fonts are served from our own site.</p>
      </Card>
      <div className="lv-mk-prose">
        <h2>How long we keep it</h2>
        <ul>
          <li>Survey and Campaign data: while the account or Hub that owns it exists.</li>
          <li>Logs: 12 months.</li>
          <li>Sent or failed emails: up to 30 days.</li>
          <li>Guest rate-limit data: 7 days.</li>
          <li>A deleted Hub’s address is held for 30 days before anyone can claim it. A reused address never shows the previous Hub’s data.</li>
        </ul>
        <h2>Deleting your account</h2>
        <p>{DELETE_COPY} Your Quick Surveys, waitlist place and waitlist contact email are deleted too. If you own a Hub, transfer or delete it first.</p>
        <h2>Who processes data for us</h2>
        <ul>
          <li><strong>Supabase</strong>: database and server functions.</li>
          <li><strong>Render</strong>: hosting of this website.</li>
          <li><strong>KpnIdentity (KpnSolute) and Google</strong>: sign-in.</li>
          <li><strong>Stripe</strong>: payments, invoices and tax calculation, only if you buy a plan.</li>
          <li><strong>Resend</strong>: delivery of the service emails above.</li>
        </ul>
        <h2>Contact</h2>
        <p>Questions, access or deletion requests: <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.</p>
      </div>
    </div>
  );
}

export function Support() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Support" title="Get help" sub="Write to us. A person reads every message." />
      <div className="lv-mk-grid">
        <Card>
          <span className="lv-mk-icon"><Icon name="join" size={22} /></span>
          <h2 className="lv-mk-card-title">Email</h2>
          <p className="lv-mk-card-body"><a className="lv-inline-link" href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a></p>
          <p className="lv-mk-card-body">For account, privacy and deletion requests too. Never send passwords or sign-in codes.</p>
        </Card>
        <Card>
          <span className="lv-mk-icon"><Icon name="lock" size={22} /></span>
          <h2 className="lv-mk-card-title">Something wrong with a survey?</h2>
          <p className="lv-mk-card-body">Use “Report this survey” on the survey itself. Reports go to LunchVoice, not to the creator.</p>
        </Card>
      </div>
      <div className="ui-row"><LinkButton to="/privacy" variant="secondary">Privacy summary</LinkButton><LinkButton to="/" variant="quiet">Back to LunchVoice</LinkButton></div>
    </div>
  );
}

/* ------------------------------------------------------------------ discover */

export function Discover() {
  return (
    <div className="lv-mk">
      <Head eyebrow="Discover" title="Discover" sub="A directory of large public Hubs that chose to be found." />
      <DiscoverDirectory />
      <p className="ui-help lv-m0"><Badge>Team plan</Badge> Discover eligibility is part of the Team Hub plan. Quick Surveys and personal spaces are never listed.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ not found */

export function NotFoundPage() {
  return (
    <StateScreen
      kind="notfound"
      title="This page isn’t here."
      detail="The link may be old, or the Hub may be private. A private Hub answers exactly like a missing one, on purpose."
      action={<div className="ui-row"><LinkButton to="/" variant="primary">LunchVoice home</LinkButton><LinkButton to="/join" variant="secondary">Enter a code</LinkButton></div>}
    />
  );
}
