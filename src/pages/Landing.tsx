import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bars,
  Button,
  ButtonLink,
  Card,
  CodeInput,
  Icon,
  MakerSignature,
  Pill,
  replaySignature,
  useReveal,
  useRotator,
  useTickerPause,
} from "../ui";
import { PLANS } from "../config/pricing";

const TICKER = [
  "Surveys",
  "Polls",
  "Ratings",
  "Ideas",
  "Anonymous by default",
  "Unique members only",
  "No adverts",
  "You own the data",
];

const PROOFS = [
  "Harbor Book Circle collected 212 responses in a week.",
  "Oakridge Parents replaced a survey after 61% participation.",
  "Northside Running Club runs a rating every month.",
];

const STEPS = [
  {
    title: "Create your Hub",
    body: "Pick an address, choose a plan and invite your people. A Hub is one community with its own pages and campaigns.",
  },
  {
    title: "Build a Campaign",
    body: "Surveys, polls, ratings, ideas or elections. Choose who can answer, and whether answers are anonymous.",
  },
  {
    title: "Read results you can trust",
    body: "Only unique eligible members count. Small groups are withheld, never guessed and never reported as zero.",
  },
];

const USE_CASES = [
  { title: "Workplaces", body: "Pulse checks and engagement surveys where anonymity is the point.", icon: "members" as const },
  { title: "Campuses", body: "Course feedback and student ideas, with departments as roles.", icon: "campaign" as const },
  { title: "Parents and schools", body: "Ask families what they need, then show them what changed.", icon: "news" as const },
  { title: "Faith and community groups", body: "Low-friction polls for people who will not make an account.", icon: "home" as const },
  { title: "Sports clubs", body: "Session ratings, kit votes and seasonal ideas.", icon: "leaderboard" as const },
  { title: "Neighbourhoods", body: "Local decisions with guest links that stay private.", icon: "comments" as const },
];

const FAQ = [
  {
    q: "How is participation counted?",
    a: "Only unique eligible members count toward a threshold. Guests, duplicates and bots are excluded, so a 50% threshold means half of your real members.",
  },
  {
    q: "What does anonymous mean here?",
    a: "The creator cannot resolve a respondent from the data they see. Eligibility proof and answers are stored separately, and small cohorts are withheld rather than shown.",
  },
  {
    q: "Can someone answer without an account?",
    a: "Yes, when a Campaign allows guests. Guests use a private link or a join code, never create a membership, and never count toward member totals.",
  },
  {
    q: "What happens if I stop paying?",
    a: "Premium actions fail closed. Nothing is deleted, and your data is still there when access resumes or you export it.",
  },
  {
    q: "Is there a free plan?",
    a: "Participation is always free for members. Running a Hub starts at $13 a month, and a time-bounded Campaign Starter is $19 for the first two weeks.",
  },
];

export function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const proof = useRotator(PROOFS.length);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const ticker = useTickerPause<HTMLDivElement>();
  const steps = useReveal<HTMLDivElement>();
  const cases = useReveal<HTMLDivElement>();

  const starter = PLANS.find((p) => p.id === "starter")!;
  const team = PLANS.find((p) => p.id === "team")!;

  const go = (to: string) => {
    replaySignature();
    navigate(to);
  };

  return (
    <div className="wrap">
      <section className="hero">
        <div className="hero-grid">
          <div className="stack stagger" style={{ gap: 20 }}>
            <p className="t-label muted">Hubs · Campaigns · Private results</p>
            <h1 className="t-display-xl">
              Ask your community.
              <br />
              <span className="marker">Keep it private.</span>
            </h1>
            <p className="lede">
              LunchVoice gives any community a Hub of its own: surveys, polls, ratings and ideas with privacy-safe results.
              Participation is free, always.
            </p>

            <div className="cta-signature" aria-hidden="true">
              <MakerSignature
                target="[data-lv-cta=hero]"
                still={false}
                color="currentColor"
                width="100%"
                height="100%"
                duration={2000}
              />
            </div>

            <div className="cta-row">
              <span data-lv-cta-anchor="" />
              <Button variant="primary" size="lg" data-lv-cta="hero" onClick={() => go("/create")}>
                Create your Hub
              </Button>
              <ButtonLink to="/how-it-works" variant="raised" size="lg">
                See how it works
              </ButtonLink>
            </div>

            <p className="t-small muted" aria-live="polite" style={{ minHeight: 20 }}>
              {PROOFS[proof]}
            </p>
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <Card className="stack">
              <div className="row-between">
                <p className="t-label muted">Have a join code?</p>
                <Pill tone="accent">No account needed</Pill>
              </div>
              <CodeInput label="Join code" value={code} onChange={setCode} length={6} />
              <Button
                variant="raised"
                disabled={code.replace(/\s/g, "").length < 4}
                onClick={() => navigate(`/c/${code.replace(/\s/g, "")}`)}
              >
                Open the Campaign
              </Button>
              <p className="t-small subtle">
                Joining a Hub with an invitation? <a href="/join">Use the invite link</a>.
              </p>
            </Card>

            <Card className="stack">
              <div className="row-between">
                <div className="stack stack-sm">
                  <p className="t-label muted">Example result</p>
                  <p className="t-title">Which session should we add on Saturdays?</p>
                </div>
                <Pill>Rating</Pill>
              </div>
              <Bars
                items={[
                  { label: "Morning run", value: 41 },
                  { label: "Track session", value: 28 },
                  { label: "Long trail", value: 19 },
                  { label: "New members", value: null, withheld: true },
                ]}
                format={(v) => String(v)}
              />
              <p className="t-small subtle">
                Small groups are withheld, never shown as zero. 88 of 154 members answered.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <div className="ticker" ref={ticker.ref} data-paused={ticker.paused} aria-hidden="true">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              {TICKER.map((t) => (
                <span key={t}>
                  ◆ {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="section" ref={steps.ref}>
        <div className="section-head">
          <p className="t-label muted">How it works</p>
          <h2 className="t-display-lg">Three steps, no spreadsheets.</h2>
        </div>
        <div className={`grid grid-3 reveal ${steps.shown ? "" : ""}`} data-shown={steps.shown}>
          {STEPS.map((s, i) => (
            <div key={s.title} className="stack">
              <span className="ghost-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="t-title">{s.title}</h3>
              <p className="t-small muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-sm">
        <div className="s-ink panel">
          <div className="stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 10, maxWidth: "52ch" }}>
              <p className="t-label" style={{ opacity: 0.75 }}>
                Privacy is the product
              </p>
              <h2 className="t-display-lg">Anonymous means you cannot work it out.</h2>
            </div>
            <div className="grid grid-3">
              {[
                { t: "Separated by design", b: "Eligibility proof and answers never live in the same place." },
                { t: "Withheld, not rounded", b: "Cohorts below the minimum are withheld. The UI says so instead of showing zero." },
                { t: "Unique members only", b: "Guests, duplicates and bots are excluded from every threshold." },
              ].map((c) => (
                <div key={c.t} className="s-raised" style={{ padding: 20, borderRadius: "var(--lv-radius-card)" }}>
                  <p className="t-title" style={{ marginBottom: 6 }}>
                    {c.t}
                  </p>
                  <p className="t-small" style={{ color: "var(--lv-muted)" }}>
                    {c.b}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" ref={cases.ref}>
        <div className="section-head">
          <p className="t-label muted">Use cases</p>
          <h2 className="t-display-lg">One platform, any community.</h2>
          <p className="t-body muted">Dining is one use case. Your Hub is whatever your community needs it to be.</p>
        </div>
        <div className="grid grid-3 reveal" data-shown={cases.shown}>
          {USE_CASES.map((u) => (
            <Card key={u.title} className="stack">
              <span className="s-well" style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 14 }}>
                <Icon name={u.icon} size={20} />
              </span>
              <p className="t-title">{u.title}</p>
              <p className="t-small muted">{u.body}</p>
            </Card>
          ))}
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <ButtonLink to="/use-cases" variant="quiet" iconRight="arrow-right">
            All use cases
          </ButtonLink>
        </div>
      </section>

      <section className="section-sm">
        <div className="section-head">
          <p className="t-label muted">Pricing</p>
          <h2 className="t-display-lg">Start small. Grow when it works.</h2>
        </div>
        <div className="grid grid-2">
          {[starter, team].map((p) => (
            <Card key={p.id} className="stack" style={{ padding: 28 }}>
              <div className="row-between">
                <p className="t-title">{p.name}</p>
                <Pill>{p.id === "starter" ? "Starter" : "Team"}</Pill>
              </div>
              <p className="t-display-md" style={{ fontSize: 40 }}>
                {p.priceLabel}
                <span className="t-small subtle" style={{ marginLeft: 8, fontWeight: 400 }}>
                  {p.cadence}
                </span>
              </p>
              <ul className="stack stack-sm">
                {p.features.slice(0, 4).map((f) => (
                  <li key={f} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                    <Icon name="check" size={15} strokeWidth={2.4} />
                    <span className="t-small">{f}</span>
                  </li>
                ))}
              </ul>
              <ButtonLink to="/pricing" variant="raised">
                Compare plans
              </ButtonLink>
            </Card>
          ))}
        </div>
        <p className="t-small subtle" style={{ marginTop: 12 }}>
          Participation is free for members. Checkout is not open yet: this build shows plan terms, not a payment flow.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="t-label muted">Questions</p>
          <h2 className="t-display-lg">Before you start.</h2>
        </div>
        <div>
          {FAQ.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={f.q} className="faq-item">
                <button
                  type="button"
                  className="faq-trigger"
                  aria-expanded={open}
                  aria-controls={`faq-${i}`}
                  id={`faq-btn-${i}`}
                  onClick={() => setOpenFaq(open ? null : i)}
                >
                  {f.q}
                  <span className="faq-chev">
                    <Icon name="chevron-down" size={20} />
                  </span>
                </button>
                {open && (
                  <div className="faq-panel t-small" role="region" id={`faq-${i}`} aria-labelledby={`faq-btn-${i}`}>
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section-sm" style={{ paddingBottom: 64 }}>
        <div className="s-ink panel stack" style={{ gap: 20 }}>
          <p className="t-label" style={{ opacity: 0.75 }}>
            Ready when you are
          </p>
          <h2 className="t-display-lg">Give your community a place to answer.</h2>
          <div className="cta-signature" aria-hidden="true">
            <MakerSignature target="[data-lv-cta=closing]" still={false} color="currentColor" width="100%" height="100%" />
          </div>
          <div className="cta-row">
            <Button variant="primary" size="lg" data-lv-cta="closing" onClick={() => go("/create")}>
              Create your Hub
            </Button>
            <ButtonLink to="/pricing" variant="quiet" size="lg">
              See pricing
            </ButtonLink>
          </div>
          <p className="t-small" style={{ opacity: 0.72 }}>
            Free to join. No advertising. Your community's data stays yours.
          </p>
        </div>
      </section>
    </div>
  );
}
