import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Bars,
  Button,
  ButtonLink,
  Card,
  Field,
  HubMark,
  Icon,
  MakerMark,
  Notice,
  PageHead,
  Pill,
  Textarea,
} from "../ui";
import { useLv } from "../lib/useLv";
import { useIdentity } from "../identity/IdentityProvider";

/* ------------------------------------------------------------------ how it works */

export function HowItWorks() {
  const steps = [
    {
      title: "A Hub is your community",
      body: "Every Hub has its own address, pages, members and roles. It is one community, not one survey. Hubs are public or private, open, approval-only or invite-only.",
    },
    {
      title: "A Campaign is one ask",
      body: "Pick a mode: survey, poll, rating, idea or election. Write the questions, choose who can answer, set the window, then publish.",
    },
    {
      title: "Results respect the group",
      body: "Counts come from unique eligible members. A cohort below the minimum is withheld. While an anonymous Campaign is open, results stay closed.",
    },
  ];
  return (
    <div className="wrap page">
      <PageHead
        eyebrow="How it works"
        title="From question to answer in an afternoon."
        sub="LunchVoice is a platform for any community. Set up a Hub once, then run Campaigns whenever you need to hear from people."
      />
      <div className="grid grid-3">
        {steps.map((s, i) => (
          <Card key={s.title} className="stack">
            <span className="ghost-num">{String(i + 1).padStart(2, "0")}</span>
            <p className="t-title">{s.title}</p>
            <p className="t-small muted">{s.body}</p>
          </Card>
        ))}
      </div>

      <section className="section-sm">
        <div className="s-ink panel stack">
          <p className="t-label" style={{ opacity: 0.75 }}>
            The five answer modes
          </p>
          <div className="grid grid-4">
            {[
              ["Rating", "1–5 with a custom icon set"],
              ["Single choice", "One answer from a list"],
              ["Multi choice", "Several answers, with a cap"],
              ["Yes / no", "Two clear options"],
              ["Open text", "A sentence or two"],
            ].map(([t, b]) => (
              <div key={t} className="s-raised" style={{ padding: 16, borderRadius: 18 }}>
                <p className="t-ui" style={{ fontWeight: 600 }}>
                  {t}
                </p>
                <p className="t-small" style={{ color: "var(--lv-muted)" }}>
                  {b}
                </p>
              </div>
            ))}
          </div>
          <p className="t-small" style={{ opacity: 0.75 }}>
            NPS, sliders and ranking exist behind a flag; their contracts are not decided, so no Hub routes to them.
          </p>
        </div>
      </section>

      <section className="section-sm">
        <div className="section-head">
          <p className="t-label muted">What you can count on</p>
          <h2 className="t-display-md">Thresholds that mean what they say.</h2>
        </div>
        <div className="grid grid-2">
          {[
            ["Unique eligible members", "Guests, duplicates and bots are excluded from every threshold and total."],
            ["Withheld, never zero", "A suppressed cohort shows as withheld with a reason. It is never reported as 0."],
            ["Anonymous by default", "Eligibility proof and answers are stored separately, so a creator cannot resolve a respondent."],
            ["Expired access fails closed", "Premium actions stop. Data is never deleted to resolve an unpaid state."],
          ].map(([t, b]) => (
            <Card key={t} className="stack stack-sm">
              <p className="t-title">{t}</p>
              <p className="t-small muted">{b}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="row">
        <ButtonLink to="/create" variant="primary" size="lg">
          Create your Hub
        </ButtonLink>
        <ButtonLink to="/pricing" variant="raised" size="lg">
          See pricing
        </ButtonLink>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ use cases */

const CASES = [
  { title: "Workplaces", body: "Pulse checks, engagement surveys and anonymous ideas. Roles map to departments.", icon: "members" as const },
  { title: "Campus life", body: "Course feedback, society elections, and student ideas with real eligibility.", icon: "campaign" as const },
  { title: "Parents and schools", body: "Ask families what they need and show them what changed afterwards.", icon: "news" as const },
  { title: "Faith groups", body: "Polls and sign-ups for people who will not make an account.", icon: "home" as const },
  { title: "Sports clubs", body: "Session ratings, kit votes and seasonal planning.", icon: "leaderboard" as const },
  { title: "Neighbourhoods", body: "Local decisions with private guest links.", icon: "comments" as const },
  { title: "Hospitality teams", body: "Dining is one use case: menu ratings, service feedback and shift ideas.", icon: "kitchen" as const },
  { title: "Nonprofits", body: "Volunteer feedback and programme ideas, with board-level reporting.", icon: "shop" as const },
  { title: "Member associations", body: "Elections and consultations where turnout and eligibility matter.", icon: "roles" as const },
];

export function UseCases() {
  return (
    <div className="wrap page">
      <PageHead
        eyebrow="Use cases"
        title="If people share a place, they have opinions."
        sub="LunchVoice is a general platform. A Hub can be a workplace, a club, a school community or a dining hall."
      />
      <div className="grid grid-3">
        {CASES.map((c) => (
          <Card key={c.title} className="stack">
            <span className="s-well" style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 14 }}>
              <Icon name={c.icon} size={20} />
            </span>
            <p className="t-title">{c.title}</p>
            <p className="t-small muted">{c.body}</p>
          </Card>
        ))}
      </div>
      <div className="row" style={{ marginTop: 28 }}>
        <ButtonLink to="/create" variant="primary" size="lg">
          Create your Hub
        </ButtonLink>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ beta */

export function Beta() {
  const { api, session } = useIdentity();
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const status = useLv(() => api.betaStatus(), [api]);

  async function apply() {
    setState("sending");
    const r = await api.betaApply(note.trim() || undefined);
    if (r.ok) {
      setState("done");
      status.reload();
    } else {
      setState("error");
      setMessage(r.error.message);
    }
  }

  const current = status.data?.status ?? "none";

  return (
    <div className="wrap page wrap-narrow">
      <PageHead
        eyebrow="Beta"
        title="Creating a Hub is invite-first."
        sub="Beta access is reviewed by a person. Approval is what unlocks Hub creation during the beta; participation stays free for everyone."
      />
      {current !== "none" && (
        <Notice tone={current === "approved" ? "ok" : current === "rejected" ? "error" : "info"} title={`Application status: ${current}`}>
          {current === "approved" ? "You can create a Hub now." : "You will hear back by email. Nothing else is required."}
        </Notice>
      )}
      {current === "none" || current === "rejected" ? (
        <Card className="stack" style={{ marginTop: 16 }}>
          <Field label="What will you use your Hub for?" htmlFor="beta-note" help="A sentence or two is plenty. This is read by a person.">
            <Textarea id="beta-note" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="We run a running club of about 120 people and want monthly session ratings." />
          </Field>
          {state === "error" && <Notice tone="error" title="That didn't send">{message}</Notice>}
          {state === "done" ? (
            <Notice tone="ok" title="Application received">
              You will get an email when it is reviewed.
            </Notice>
          ) : (
            <div className="row">
              <Button variant="primary" loading={state === "sending"} disabled={!session} onClick={apply}>
                Apply for beta access
              </Button>
              {!session && (
                <span className="t-small subtle">
                  <a href="/signin">Sign in</a> first so we know who to reply to.
                </span>
              )}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ about */

export function About() {
  return (
    <div className="wrap page wrap-narrow">
      <PageHead eyebrow="About" title="Built by KpnSolute." sub="LunchVoice is a community feedback platform: Hubs for communities, Campaigns for the questions they need answered." />
      <div className="stack" style={{ gap: 20 }}>
        <p className="t-body muted">
          Most feedback tools optimise for collecting more data. LunchVoice optimises for collecting less, and trusting it more.
          A respondent should be able to answer honestly without being identified, and an organiser should be able to act on a result
          without wondering whether it was real.
        </p>
        <Card className="stack">
          <p className="t-label muted">Principles</p>
          <ul className="stack stack-sm">
            {[
              "Participation is always free.",
              "Anonymous means the creator cannot resolve the respondent.",
              "Suppressed data is withheld, never reported as zero.",
              "Expired access fails closed and never deletes data.",
              "The platform builds the software, not customer Hubs.",
            ].map((p) => (
              <li key={p} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <Icon name="check" size={15} strokeWidth={2.4} />
                <span className="t-small">{p}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="stack stack-sm">
          <p className="t-label muted">Made by KpnSolute</p>
          <MakerMark still={false} />
          <p className="t-small subtle">The signature is shared across every KpnSolute product.</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ status */

const STATUS = [
  { name: "LunchVoice app", state: "Operational", detail: "Web app, Hub pages and the respondent player." },
  { name: "Identity (KpnIdentity)", state: "Degraded", detail: "Sign-in is in preview. Invite codes work without it." },
  { name: "Database", state: "Operational", detail: "lv_api is responding normally." },
  { name: "Email delivery", state: "Preview", detail: "Templates exist; sending is not enabled yet." },
  { name: "Payments", state: "Not available", detail: "Checkout is closed while Campaign Plus is unpriced." },
];

export function Status() {
  return (
    <div className="wrap page wrap-narrow">
      <PageHead eyebrow="Status" title="Service status." sub="This is a fixture status page: it shows the intended surface, not a live probe. Do not read it as a real-time signal." />
      <div className="stack">
        {STATUS.map((s) => (
          <Card key={s.name} className="row-between" as="div">
            <div className="stack stack-sm">
              <p className="t-ui" style={{ fontWeight: 600 }}>
                {s.name}
              </p>
              <p className="t-small subtle">{s.detail}</p>
            </div>
            <Pill tone={s.state === "Operational" ? "ok" : s.state === "Degraded" ? "warn" : "quiet"}>{s.state}</Pill>
          </Card>
        ))}
      </div>
      <Notice tone="info" title="Fixtures, not probes" >
        A live status feed needs a monitoring service and an incident contract. Neither exists yet.
      </Notice>
    </div>
  );
}

/* ------------------------------------------------------------------ legal */

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const title = kind === "terms" ? "Terms of service" : "Privacy notice";
  return (
    <div className="wrap page wrap-narrow">
      <PageHead eyebrow={kind === "terms" ? "Legal" : "Privacy"} title={title} sub="Legal text pending review." />
      <Notice tone="warn" title="Placeholder: not legal advice">
        This page is a layout with clearly marked placeholder copy. Real terms and privacy text must be written and reviewed by a
        qualified person before launch. Do not treat anything below as binding.
      </Notice>
      <div className="stack" style={{ marginTop: 20 }}>
        {(kind === "terms"
          ? ["Who may use LunchVoice", "Plans, renewals and expiry", "Acceptable use", "Data ownership", "Cancellation and deletion", "Liability"]
          : ["What we collect", "Why we collect it", "Anonymity and suppression", "Cookies and storage", "Retention and export", "Your rights"]
        ).map((h) => (
          <section key={h} className="stack stack-sm">
            <h2 className="t-title">{h}</h2>
            <p className="t-small muted">
              Legal text pending review. This section will describe {h.toLowerCase()} in plain language, with the specific
              commitments the product actually makes.
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ support */

export function Support() {
  return (
    <div className="wrap page wrap-narrow">
      <PageHead eyebrow="Support" title="Get unstuck." sub="Most questions are about access, codes and anonymous results. Start here." />
      <div className="grid grid-2">
        {[
          ["I have a join code", "Open the Campaign directly. You do not need an account unless the Hub requires membership.", "/join", "Enter a code"],
          ["I cannot sign in", "Sign-in runs on KpnIdentity. If the issuer is not configured, use a join code instead.", "/signin", "Sign-in help"],
          ["A number says withheld", "The cohort was too small to report. That is deliberate: withheld is not zero.", "/how-it-works", "How results work"],
          ["I need my data", "Export is available to members with permission. Account deletion never removes Hub data you do not own.", "/settings", "Account settings"],
        ].map(([t, b, to, label]) => (
          <Card key={t} className="stack">
            <p className="t-title">{t}</p>
            <p className="t-small muted">{b}</p>
            <ButtonLink to={to} variant="quiet" size="sm" iconRight="arrow-right">
              {label}
            </ButtonLink>
          </Card>
        ))}
      </div>
      <Card className="stack" style={{ marginTop: 20 }}>
        <p className="t-title">Still stuck?</p>
        <p className="t-small muted">
          Email <a href="mailto:support@lunchvoice.com">support@lunchvoice.com</a> with your Hub address and what you expected to
          happen. Never send a password or a join code.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ discover */

export function Discover() {
  const fixtures = import.meta.env.DEV;
  return (
    <div className="wrap page">
      <PageHead
        eyebrow="Discover"
        title="Find a community to join."
        sub="Discover opens when Hubs qualify. A Hub becomes eligible at 700 genuine active members on the Team plan, and a person reviews every application."
      />
      {fixtures ? (
        <div className="stack">
          <Notice tone="info" title="Development fixtures">
            These cards are sample data and appear only in development builds.
          </Notice>
          <div className="grid grid-3">
            {[
              { name: "Northside Running Club", slug: "northside", members: 412, about: "Weekly runs, session ratings and kit votes." },
              { name: "Harbor Book Circle", slug: "harbor", members: 168, about: "Monthly picks and reading polls." },
              { name: "Oakridge Parents", slug: "oakridge", members: 903, about: "School community feedback and events." },
            ].map((h) => (
              <Card key={h.slug} className="stack">
                <div className="row">
                  <HubMark name={h.name} slug={h.slug} size={40} />
                  <div className="stack stack-sm">
                    <p className="t-title">{h.name}</p>
                    <p className="t-small subtle">{h.members} active members</p>
                  </div>
                </div>
                <p className="t-small muted">{h.about}</p>
                <ButtonLink to={`/${h.slug}`} variant="raised" size="sm">
                  Visit Hub
                </ButtonLink>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="stack">
          <Bars
            items={[
              { label: "Your Hub", value: 380, hint: "of 700 needed" },
              { label: "Eligible Hubs today", value: 0 },
            ]}
            max={700}
          />
          <p className="t-small muted">
            No Hubs are listed yet. Applying needs 700 genuine active members; the threshold counts unique eligible members, never
            guests.
          </p>
          <div className="row">
            <ButtonLink to="/pricing" variant="raised">
              See Team plan
            </ButtonLink>
            <ButtonLink to="/create" variant="quiet">
              Create a Hub
            </ButtonLink>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ not found */

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="wrap page wrap-narrow">
      <div className="stack" style={{ gap: 12 }}>
        <p className="t-label muted">404</p>
        <h1 className="t-display-lg">Nothing here.</h1>
        <p className="t-body muted">
          <code className="mono">{pathname}</code> is not a page. If you followed a link to a Hub, it may have been released: a
          released address never exposes a previous owner's data.
        </p>
        <div className="row">
          <ButtonLink to="/" variant="primary">
            LunchVoice home
          </ButtonLink>
          <ButtonLink to="/join" variant="raised">
            Join with a code
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
