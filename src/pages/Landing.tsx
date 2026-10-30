import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import { MadeBy } from "../components/MakerMark";
import { PLANS } from "../config/pricing";

const TEASER_PLANS = PLANS.filter((p) => p.id === "free" || p.id === "starter" || p.id === "team");

// The amber ticker band is carried over from v1: it states the product in one line
// and gives the page its printed-sheet rhythm.
const TICKER = [
  "Ask your community",
  "Five answer modes",
  "Results you can defend",
  "Withheld is never zero",
  "Guests stay guests",
  "Hubs from $13 a month",
];

// Adds .in to .lv-reveal as it scrolls in. Honours reduced motion and no-observer browsers
// by revealing everything immediately.
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll(".lv-reveal"));
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

const STEPS = [
  {
    icon: "home" as const,
    title: "Create a Hub",
    body: "One page for your community at lunchvoice.com/your-hub. Open to all, open on request, invite only, or closed.",
  },
  {
    icon: "survey" as const,
    title: "Run a Campaign",
    body: "Rating, single choice, multiple choice, yes or no, or an open answer. One question per screen, on a phone, in under a minute.",
  },
  {
    icon: "dashboard" as const,
    title: "Read the whole room",
    body: "Aggregate results that cannot be traced back to a person. Small cohorts are withheld instead of guessed.",
  },
];

const PRIVACY = [
  {
    icon: "lock" as const,
    title: "Anonymous by default",
    body: "Eligibility is proven once and kept apart from the answer itself, so a response never resolves to a name.",
  },
  {
    icon: "voice" as const,
    title: "Withheld, never zero",
    body: "When a cohort is too small to protect the people in it, the number reads withheld. A suppressed value is never reported as 0.",
  },
  {
    icon: "roster" as const,
    title: "Guests stay guests",
    body: "People without an account can answer an open Campaign, and never count as members or toward any threshold.",
  },
];

const USE_CASES = [
  { icon: "home" as const, name: "Schools and campuses", line: "Course feedback and student life, without naming a respondent." },
  { icon: "star" as const, name: "Clubs and societies", line: "Pick a direction, rate an event, settle a small decision." },
  { icon: "roster" as const, name: "Teams and leagues", line: "Availability, feedback on the season, ideas for next year." },
  { icon: "sparkle" as const, name: "Events and meetups", line: "A QR code on the table, results before you pack up." },
  { icon: "bulb" as const, name: "Workplaces", line: "Pulse questions and idea boxes with a defensible privacy floor." },
  { icon: "dashboard" as const, name: "Neighborhoods", line: "Ask a local question once, and see what the street actually thinks." },
];

const FAQ = [
  {
    q: "Can anyone trace an answer back to me?",
    a: "No. LunchVoice proves you were eligible to answer without storing that proof next to your response, and results only show aggregates. When a group is small enough that a total could identify someone, the number is withheld.",
  },
  {
    q: "Why do some results say withheld instead of a number?",
    a: "Because reporting a small number can expose the people behind it, and correcting for that by subtraction would defeat the point. Withheld means the data exists and stays private, not that the answer was zero.",
  },
  {
    q: "Do participants pay?",
    a: "Never. Answering is free forever. Creating a Hub starts at $13 a month, and a single Campaign window costs $19 for the first two weeks.",
  },
  {
    q: "Do I need an account to answer?",
    a: "Not for a Campaign the organiser has opened to guests. Guests can answer a join-code link without creating an account, and they are never counted as members.",
  },
];

export function Landing() {
  const { hash } = useLocation();
  const revealRef = useReveal();

  // The header links to in-page sections (/#how, /#use-cases). Router navigation does not
  // scroll to a hash on its own, so honour it whenever it changes.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="lv-landing" ref={revealRef}>
      {/* ---------- hero ---------- */}
      <section className="lv-hero" aria-labelledby="lv-hero-title">
        <div className="lv-hero-copy">
          <p className="lv-eyebrow lv-rise">Community feedback, private by design</p>
          <h1 id="lv-hero-title" className="lv-h1 lv-rise lv-rise-2">
            Ask your community.
            <br />
            <em>Hear the whole room.</em>
          </h1>
          <p className="lv-sub lv-rise lv-rise-3">
            LunchVoice gives any group a Hub and a set of Campaigns — ratings, polls, surveys and open
            ideas — with results that stay honest about who answered.
          </p>
          <div className="lv-cta-row lv-rise lv-rise-4">
            <Link className="btn btn-primary lv-btn-lg" to="/signin">
              Get started
              <Icon name="arrow" size={18} />
            </Link>
            <a className="btn btn-ghost lv-btn-lg" href="#how">
              See how it works
            </a>
          </div>
          <p className="lv-micro">
            Free for participants · Hubs from $13/month · No credit card to create an account
          </p>

          <div className="lv-metrics" aria-label="At a glance">
            <div><b>$0</b><span>to answer, always</span></div>
            <div><b>5</b><span>answer modes</span></div>
            <div><b>0</b><span>names in results</span></div>
          </div>
        </div>

        <div className="lv-hero-art">
        <figure className="lv-preview" aria-label="Example of a Campaign and its results">
          <div className="lv-preview-top">
            <span className="lv-chip">Example Campaign</span>
            <span className="lv-lock">
              <Icon name="lock" size={13} /> Anonymous
            </span>
          </div>
          <p className="lv-preview-q">How useful was tonight&rsquo;s meetup?</p>
          <ul className="lv-bars">
            {[
              { label: "Very useful", pct: 46 },
              { label: "Useful", pct: 31 },
              { label: "Mixed", pct: 14 },
            ].map((r) => (
              <li key={r.label}>
                <span className="lv-bar-label">{r.label}</span>
                <span className="lv-bar-track" aria-hidden="true">
                  <b style={{ width: `${r.pct}%` }} />
                </span>
                <span className="lv-bar-value">{r.pct}%</span>
              </li>
            ))}
            <li>
              <span className="lv-bar-label">Not useful</span>
              <span className="lv-bar-track lv-bar-withheld" aria-hidden="true" />
              <span className="lv-bar-value lv-withheld">Withheld</span>
            </li>
          </ul>
          <figcaption className="lv-preview-note">
            <Icon name="voice" size={14} /> 38 responses · a small cohort is withheld, never shown as zero
          </figcaption>
        </figure>

        <Link className="lv-code-card lv-rise lv-rise-3" to="/join">
          <div>
            <div className="lv-code-title">Have a join code?</div>
            <span className="lv-code-hint ui-mono">Six characters, on your invitation</span>
          </div>
          <span className="lv-code-cells" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <i key={i} />
            ))}
          </span>
          <Icon name="arrow" size={18} />
        </Link>
        </div>
      </section>

      {/* ---------- ticker ---------- */}
      <div className="lv-ticker" aria-hidden="true">
        <div className="lv-ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={`${t}-${i}`}>{t} ◆</span>
          ))}
        </div>
      </div>

      {/* ---------- how it works ---------- */}
      <section id="how" className="lv-section" aria-labelledby="lv-how-title">
        <header className="lv-section-head">
          <p className="lv-eyebrow">How it works</p>
          <h2 id="lv-how-title" className="lv-h2">
            Three steps from a question to a decision.
          </h2>
        </header>
        <ol className="lv-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lv-reveal" data-step={String(i + 1).padStart(2, "0")} style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="lv-step-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="lv-step-icon">
                <Icon name={s.icon} size={20} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- privacy ---------- */}
      <section className="lv-band" aria-labelledby="lv-privacy-title">
        <div className="lv-band-inner">
          <header className="lv-section-head">
            <p className="lv-eyebrow">Privacy is the product</p>
            <h2 id="lv-privacy-title" className="lv-h2">
              An answer you give is not an answer you can be blamed for.
            </h2>
            <p className="lv-lead">
              Most feedback tools ask people to trust a promise. LunchVoice enforces the promise in the
              database, then refuses to publish anything that would break it.
            </p>
          </header>
          <div className="lv-grid-3">
            {PRIVACY.map((p, i) => (
              <article key={p.title} className="lv-card lv-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                <span className="lv-icon-dot">
                  <Icon name={p.icon} size={20} />
                </span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- use cases ---------- */}
      <section id="use-cases" className="lv-section" aria-labelledby="lv-uc-title">
        <header className="lv-section-head">
          <p className="lv-eyebrow">Built for any community</p>
          <h2 id="lv-uc-title" className="lv-h2">
            Dining is one use case. Yours is probably different.
          </h2>
        </header>
        <div className="lv-grid-3">
          {USE_CASES.map((u, i) => (
            <article key={u.name} className="lv-card lv-card-quiet lv-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
              <span className="lv-icon-dot">
                <Icon name={u.icon} size={20} />
              </span>
              <h3>{u.name}</h3>
              <p>{u.line}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- pricing teaser ---------- */}
      <section className="lv-section lv-pricing" aria-labelledby="lv-price-title">
        <header className="lv-section-head">
          <p className="lv-eyebrow">Pricing</p>
          <h2 id="lv-price-title" className="lv-h2">
            Free to answer. Pay to create.
          </h2>
        </header>
        <div className="lv-grid-3">
          {TEASER_PLANS.map((p, i) => (
            <article key={p.id} className="lv-card lv-plan lv-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
              <h3>{p.name}</h3>
              <p className="lv-price">
                <span>{p.priceLabel}</span>
                <small>{p.cadence}</small>
              </p>
              <ul className="lv-plan-list">
                {p.features.map((f) => (
                  <li key={f}>
                    <Icon name="check" size={15} />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="lv-pricing-foot">
          <Link to="/pricing">
            See every plan, including single-Campaign windows <Icon name="arrow" size={15} />
          </Link>
        </p>
      </section>

      {/* ---------- faq ---------- */}
      <section className="lv-section" aria-labelledby="lv-faq-title">
        <header className="lv-section-head">
          <p className="lv-eyebrow">Questions</p>
          <h2 id="lv-faq-title" className="lv-h2">
            The things people ask before they answer.
          </h2>
        </header>
        <div className="lv-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <Icon name="plus" size={18} />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- closing cta ---------- */}
      <section className="lv-cta-band" aria-labelledby="lv-cta-title">
        <h2 id="lv-cta-title" className="lv-h2">
          Start with one question.
        </h2>
        <p>Create a Hub, invite the people who care, and get an answer you can act on.</p>
        <Link className="btn btn-primary lv-btn-lg" to="/signin">
          Get started
          <Icon name="arrow" size={18} />
        </Link>
        <MadeBy className="lv-cta-made" />
      </section>
    </div>
  );
}
