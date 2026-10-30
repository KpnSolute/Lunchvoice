import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Card, Empty, Notice, Pill, Micro, PageHead } from "../components/ui";
import { MadeBy } from "../components/MakerMark";

function Page({ children }: { children: ReactNode }) {
  return <div className="lv-page">{children}</div>;
}

function Cta({ label = "Get started" }: { label?: string }) {
  return (
    <Link className="ui-btn ui-btn-primary ui-btn-lg" to="/signin">
      {label} <Icon name="arrow" size={17} />
    </Link>
  );
}

/* --------------------------------------------------------------- how it works */

const LOOP = [
  {
    icon: "home" as IconName,
    title: "One Hub, one address",
    body: "Your community lives at lunchvoice.com/your-hub. Choose open, request to join, invite only, or closed, and change it later.",
  },
  {
    icon: "survey" as IconName,
    title: "Campaigns, not forms",
    body: "A Campaign has a phase: draft, scheduled, open, ended. Questions can be edited while it is a draft and are locked once published.",
  },
  {
    icon: "voice" as IconName,
    title: "Five ways to answer",
    body: "Rating, single choice, multiple choice, yes or no, or an open answer. One question per screen, thumb-sized, resumable if the page reloads.",
  },
  {
    icon: "dashboard" as IconName,
    title: "Results you can defend",
    body: "Aggregates only. A cohort below the privacy floor is withheld, and a withheld value is never displayed as zero.",
  },
];

const PRIVACY_FAQ = [
  ["What makes an answer anonymous?", "Eligibility is proven separately from the answer. The database knows you were allowed to answer; it does not keep that proof beside your response."],
  ["Who can see results?", "Only people with the analytics capability on that Hub. Membership alone does not grant it."],
  ["What about guests?", "A Campaign can be opened to guests with a join code. Guests never become members and never count toward thresholds."],
];

export function HowItWorks() {
  return (
    <Page>
      <PageHead
        eyebrow="How it works"
        title="From a question to a decision, without exposing anyone."
        sub="LunchVoice is a Hub, a set of Campaigns, and a privacy floor that holds even when someone asks for the raw data."
      />
      <div className="ui-stack ui-gap-16">
        {LOOP.map((s, i) => (
          <div key={s.title} className="ui-card">
            <div className="ui-row ui-gap-12" style={{ alignItems: "flex-start" }}>
              <span className="ui-micro" style={{ minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ color: "var(--accent-ink)" }}><Icon name={s.icon} size={20} /></span>
              <div className="ui-stack ui-gap-4">
                <h2 className="ui-display ui-display-md">{s.title}</h2>
                <p className="ui-muted" style={{ margin: 0, maxWidth: "62ch" }}>{s.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="ui-display ui-display-md" style={{ margin: "34px 0 14px" }}>Questions about privacy</h2>
      <div className="ui-grid-2">
        {PRIVACY_FAQ.map(([q, a]) => (
          <Card key={q} quiet>
            <h3 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontSize: 17 }}>{q}</h3>
            <p className="ui-muted" style={{ margin: 0, fontSize: 14.5 }}>{a}</p>
          </Card>
        ))}
      </div>

      <div className="ui-row" style={{ marginTop: 28 }}><Cta /></div>
    </Page>
  );
}

/* ------------------------------------------------------------------ use cases */

const CASES = [
  { icon: "home" as IconName, name: "Schools and campuses", line: "Course feedback, student life, and staff pulse checks — without a named respondent.", ex: "Rate this week's session · Choose next term's topic" },
  { icon: "star" as IconName, name: "Clubs and societies", line: "Settle a decision, rate an event, or float ideas before the next meeting.", ex: "Which night works? · Rate the venue" },
  { icon: "roster" as IconName, name: "Teams and leagues", line: "Availability, season feedback, and next-season planning in one place.", ex: "Who can play Saturday? · Rate the season" },
  { icon: "sparkle" as IconName, name: "Events and meetups", line: "A QR code on the table, results before you pack up.", ex: "How was tonight? · What should we run next?" },
  { icon: "bulb" as IconName, name: "Workplaces", line: "Idea boxes and pulse questions with a privacy floor you can point at.", ex: "One change you'd make · Rate the offsite" },
  { icon: "dashboard" as IconName, name: "Neighborhoods", line: "Ask a local question once, and see what the street actually thinks.", ex: "Which improvement first? · Rate the clean-up" },
];

export function UseCases() {
  return (
    <Page>
      <PageHead
        eyebrow="Use cases"
        title="Dining is one use case. Yours is probably different."
        sub="Anything a group needs to ask, answer, and settle — where the answer matters but the respondent shouldn't be exposed."
      />
      <div className="ui-grid-2">
        {CASES.map((c) => (
          <Card key={c.name}>
            <span className="ui-empty-icon"><Icon name={c.icon} size={22} /></span>
            <h2 className="ui-display ui-display-md" style={{ margin: "12px 0 6px" }}>{c.name}</h2>
            <p className="ui-muted" style={{ margin: "0 0 12px", fontSize: 14.5 }}>{c.line}</p>
            <Micro>{c.ex}</Micro>
          </Card>
        ))}
      </div>
      <div className="ui-row" style={{ marginTop: 28 }}><Cta /></div>
    </Page>
  );
}

/* ------------------------------------------------------------------ beta */

export function Beta() {
  return (
    <Page>
      <PageHead
        eyebrow="Waitlist"
        title="The waitlist opens shortly."
        sub="We are finishing the last pieces of the platform before inviting Hub owners. Participants and invitees can already sign in."
      />
      <Card>
        <div className="ui-row ui-gap-8" style={{ marginBottom: 10 }}>
          <Pill tone="accent">Opening soon</Pill>
          <Micro>No waitlist form yet</Micro>
        </div>
        <p className="ui-muted" style={{ margin: 0 }}>
          The public waitlist service is not deployed, so there is nothing to submit here — and we would rather show
          nothing than accept an address we cannot keep safely. Once it is live this page will post you to the queue and
          tell you exactly what is stored, for how long, and how to ask for removal.
        </p>
      </Card>

      <div className="ui-grid-2" style={{ marginTop: 16 }}>
        <Card quiet>
          <Micro>What beta includes</Micro>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 14.5, lineHeight: 1.7 }}>
            <li>One Hub you own, with roles, invites and members</li>
            <li>Campaigns in rating, poll, survey and feedback modes</li>
            <li>Privacy-safe results with withheld cohorts</li>
          </ul>
        </Card>
        <Card quiet>
          <Micro>Already invited?</Micro>
          <p className="ui-muted" style={{ margin: "10px 0 12px", fontSize: 14.5 }}>
            If someone sent you an invite link, you can sign in and join that Hub now.
          </p>
          <Link className="ui-btn ui-btn-outline" to="/signin">Sign in</Link>
        </Card>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ about / status */

export function About() {
  return (
    <Page>
      <PageHead
        eyebrow="About"
        title="A community feedback platform, built to keep its promises."
        sub="LunchVoice is made by KpnSolute. It exists because most feedback tools ask people to trust a policy, then publish numbers that quietly identify them."
      />
      <div className="ui-grid-2">
        <Card>
          <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>What we build</h3>
          <p className="ui-muted" style={{ margin: 0, fontSize: 14.5 }}>
            Hubs, Campaigns and privacy-safe analytics for schools, clubs, teams, events, workplaces and neighbourhoods.
          </p>
        </Card>
        <Card>
          <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>What we refuse</h3>
          <p className="ui-muted" style={{ margin: 0, fontSize: 14.5 }}>
            No college of respondents behind a "member count", no suppressed value dressed up as zero, and no customer
            special-cased in the product.
          </p>
        </Card>
      </div>
      <div style={{ marginTop: 24 }}><MadeBy /></div>
    </Page>
  );
}

export function Status() {
  return (
    <Page>
      <PageHead eyebrow="Status" title="Status reporting is not wired up yet." sub="No monitoring feed exists, so this page will not pretend to know." />
      <Notice tone="warn">
        This page becomes useful once the platform has an uptime feed. Until then, treat it as a placeholder rather than
        a promise: nothing here is polling.
      </Notice>
    </Page>
  );
}

/* ------------------------------------------------------------------ legal */

export function Terms() {
  return (
    <Page>
      <PageHead eyebrow="Terms" title="Terms of service" sub="Draft. Pending legal review before launch." />
      <Notice tone="warn">This text is a placeholder drafted for the build, not a legal document. It must be replaced before public sign-ups open.</Notice>
      <div className="ui-stack ui-gap-16" style={{ marginTop: 16, maxWidth: "70ch" }}>
        <section>
          <h2 className="ui-display ui-display-md">Using LunchVoice</h2>
          <p className="ui-muted">Participation is free. Hub creation is a paid subscription or a time-bounded Campaign window. You are responsible for what you ask your community and for the lawful basis you rely on.</p>
        </section>
        <section>
          <h2 className="ui-display ui-display-md">Privacy is a product constraint, not a setting</h2>
          <p className="ui-muted">The platform refuses to publish results that could identify a respondent. Asking us to reveal a respondent is not a supported request.</p>
        </section>
        <section>
          <h2 className="ui-display ui-display-md">Cancellation</h2>
          <p className="ui-muted">Lapsing paid access fails closed for premium actions. It never deletes your data.</p>
        </section>
      </div>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page>
      <PageHead eyebrow="Privacy" title="What we store, and what we deliberately don't." sub="Draft. Pending legal review." />
      <Notice tone="warn">Placeholder copy for the build. Replace with reviewed policy text before launch.</Notice>
      <div className="ui-stack ui-gap-16" style={{ marginTop: 16, maxWidth: "70ch" }}>
        <section>
          <h2 className="ui-display ui-display-md">Identity</h2>
          <p className="ui-muted">You sign in through KpnIdentity. LunchVoice stores the verified issuer and subject pair, never your email address as an identity key.</p>
        </section>
        <section>
          <h2 className="ui-display ui-display-md">Answers</h2>
          <p className="ui-muted">Eligibility and answers are kept apart, so an anonymous response cannot be resolved to the person who gave it. Guests are never counted as members.</p>
        </section>
        <section>
          <h2 className="ui-display ui-display-md">Results</h2>
          <p className="ui-muted">Only aggregates are published, and a cohort below the minimum is withheld instead of shown. Free-text answers are not published.</p>
        </section>
      </div>
    </Page>
  );
}

export function Support() {
  return (
    <Page>
      <PageHead eyebrow="Support" title="Support" sub="A contact channel is not configured yet." />
      <Card>
        <p className="ui-muted" style={{ margin: 0 }}>
          Until a support inbox is connected, this page is honest about having nowhere to send a ticket. If you reached
          this page from a Hub you own, the Hub settings page will carry the operator contact once that exists.
        </p>
      </Card>
      <div className="ui-row" style={{ marginTop: 16 }}><Link className="ui-btn ui-btn-outline" to="/">Back to LunchVoice</Link></div>
    </Page>
  );
}

/* ------------------------------------------------------------------ discover */

export function Discover() {
  return (
    <Page>
      <PageHead
        eyebrow="Discover"
        title="Discover"
        sub="A directory of public Hubs, once Team Hubs qualify for listing."
      />
      <Empty
        icon="star"
        title="No Hubs are listed yet"
        action={<Link className="ui-btn ui-btn-outline" to="/pricing">See what Discover needs</Link>}
      >
        Discover is empty by design: Hubs appear here only after they reach 700 genuine active members and are approved.
        Nothing is seeded or invented to fill the page.
      </Empty>
    </Page>
  );
}

/* ------------------------------------------------------------------ not found */

export function NotFoundPage() {
  return (
    <div className="lv-page">
      <div className="ui-stack ui-gap-16" style={{ padding: "64px 0", maxWidth: "52ch" }}>
        <Micro accent>404</Micro>
        <h1 className="ui-display ui-display-xl">This page isn&rsquo;t here.</h1>
        <p className="ui-muted" style={{ margin: 0 }}>
          The link may be old, or the Hub may be private. A private Hub answers exactly like a missing one, on purpose.
        </p>
        <div className="ui-row">
          <Link className="ui-btn ui-btn-primary" to="/">LunchVoice home</Link>
          <Link className="ui-btn ui-btn-outline" to="/discover">Browse Discover</Link>
        </div>
      </div>
    </div>
  );
}
