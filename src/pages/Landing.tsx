import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { USE_CASES } from "../config/useCases";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { useBilling } from "../lib/useBilling";
import { COMMUNITY_HUB_SLUG } from "../config/contact";
import { HubCard } from "../components/HubCard";
import { PLANS } from "../config/pricing";
import { PRODUCTS } from "../config/products";
import { Button } from "@/components/shadcn/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/shadcn/input-otp";
import { Progress } from "@/components/shadcn/progress";

// `/` keeps the design handoff's ink hero (founder decision) and answers, in order: who it is for (use cases), how a
// survey works (four connected steps), what results look like, what LunchVoice offers (the six products), what
// participants get, the waitlist and pricing. Eyebrows stay only where they add a fact the heading does not. Prices come from src/config/pricing.ts; dining is one use case among many.
// Every call to action and billing sentence here comes from useBilling() (src/lib/billingState.ts): "Start a free
// survey" is always the primary action, and the Hub action is the waitlist until billing opens.
// The result, Hub and account panels are illustrations with made-up numbers, and each one says so on screen.

const ROTATOR: [string, string][] = [
  ["Rating scales people tap in seconds", ": stars, choices, yes or no, and a short answer."],
  ["One QR per survey", ": print it, post it anywhere, and answers start."],
  ["Public or private Hubs", ": anonymous for everyone, or members with a LunchVoice account."],
];
const TICKER = ["Clubs", "Classrooms", "Teams", "Events", "Clinics", "Communities", "Libraries", "Campuses", "Dining"];
const BARS = [4, 9, 6, 3, 18, 34, 22, 8, 5, 12, 20, 9];
const JOURNEY: { title: string; body: string }[] = [
  { title: "Create a survey", body: "Start blank or from a template. Ratings, choices, yes or no and short answers, made to tap on a phone." },
  { title: "Share it", body: "Send a link, print the QR code or read out a six-character code. Nobody installs an app." },
  { title: "Collect responses", body: "Answers arrive while people are still answering. On an anonymous survey nobody, including you, sees who said what." },
  { title: "Understand results", body: "A chart and a summary for every question, filled in as answers arrive. Close it when you have what you need." },
];
const PROMISES: { title: string; body: string; icon: IconName }[] = [
  { title: "Anonymous means anonymous", body: "On an anonymous survey the creator sees totals, never your name.", icon: "lock" },
  { title: "No app to install", body: "Answer in the browser, from a link, a QR code or a six-character code.", icon: "join" },
  { title: "Private Hubs stay private", body: "Join with an invite code or by asking. Outsiders cannot see inside.", icon: "shield-check" },
];

function Rotator() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => (x + 1) % ROTATOR.length), 3800);
    return () => window.clearInterval(t);
  }, []);
  const [b, rest] = ROTATOR[i];
  return (
    <div className="lv-l-rotator" aria-live="off">
      <span className="lv-l-rotator-icon"><Icon name="check" size={18} /></span>
      <p key={i}><b>{b}</b>{rest}</p>
    </div>
  );
}

function CodeCard() {
  const [code, setCode] = useState("");
  const [nudge, setNudge] = useState(false);
  const nav = useNavigate();
  const ready = code.length === 6;
  // The button is never disabled (a greyed-out button reads as broken): with no code yet it is the quiet style, and
  // pressing it says what is missing and puts the cursor in the code field.
  function go(form: HTMLFormElement) {
    if (ready) return nav(`/c/${code.toUpperCase()}`);
    setNudge(true);
    form.querySelector<HTMLInputElement>("input")?.focus();
  }
  return (
    <form id="join" className="lv-l-code" onSubmit={(e) => { e.preventDefault(); go(e.currentTarget); }} aria-labelledby="code-h">
      <div className="lv-l-code-head">
        <h2 id="code-h">Got a code?</h2>
        <span className="lv-l-mono">No account needed</span>
      </div>
      <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v.toUpperCase()); setNudge(false); }} aria-label="Six-character join code" aria-describedby="code-hint" pattern="^[A-Za-z0-9]*$">
        <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
      </InputOTP>
      <div className="lv-l-code-foot">
        <Button type="submit" variant={ready ? "ink" : "secondary"} size="lg" data-ready={ready || undefined} data-testid="join-submit">
          Join survey <Icon name="arrow" size={16} />
        </Button>
        <span id="code-hint" role={nudge ? "alert" : undefined} data-nudge={nudge || undefined}>
          {nudge ? "Type the six-character code first." : "Type the code, or scan the QR on the poster."}
        </span>
      </div>
    </form>
  );
}

function WaitlistBand() {
  const { api } = useIdentity();
  const { state, ctas } = useBilling();
  const status = useLv(() => api.waitlistStatus(), [api]);
  const s = status.data;
  const left = s ? Math.max(0, s.seats_total - s.seats_taken) : null;
  return (
    <section id="waitlist" className="lv-l-section" aria-labelledby="wl-h" data-billing={state.open ? "open" : "closed"}>
      <div className="lv-l-waitlist">
        <div className="lv-l-waitlist-copy">
          <span className="lv-l-eyebrow lv-l-eyebrow-accent">Founding seats</span>
          <h2 id="wl-h" className="lv-l-h2">50 Founding seats. A Hub on us.</h2>
          {state.open ? (
            <p>
              The first 50 people admitted from the waitlist received a Founding Hub credit. Billing is open now, so anyone
              can buy a Hub plan without waiting.
            </p>
          ) : (
            <p>
              LunchVoice opens through a waitlist. Sign in and join: the first 50 people admitted receive a Founding Hub
              credit, a Starter Hub free until paid billing launches and for 30 days after. Everyone else can buy a plan once
              billing opens.
            </p>
          )}
          <div className="lv-l-actions">
            <Button asChild variant="primary" size="lg" data-lv-cta="waitlist-band"><Link to={ctas.hub.to}>{ctas.hub.label}</Link></Button>
          </div>
        </div>
        <div className="lv-l-seats" aria-live="polite">
          <span className="lv-l-mono">Founding seats</span>
          <strong className="lv-l-seats-n">{left === null ? "…" : left}</strong>
          <span>{left === null ? "Checking seats" : left === 1 ? "seat left of 50" : `seats left of ${s!.seats_total}`}</span>
          {s && <Progress value={(s.seats_taken / s.seats_total) * 100} aria-label={`${s.seats_taken} of ${s.seats_total} seats taken`} />}
          {s && !s.open && <span className="lv-l-seats-note">All Founding seats are taken. You can still join and wait for billing to open.</span>}
        </div>
      </div>
    </section>
  );
}

function KitchenBand() {
  const { api } = useIdentity();
  const q = useLv(() => api.hubGet(COMMUNITY_HUB_SLUG), [api]);
  const hub = q.data?.hub;
  // Shown only while LunchVoice's own Hub exists and is public. Nothing is shown in its place.
  if (!hub || hub.visibility !== "public") return null;
  return (
    <section id="kitchen" className="lv-l-section" aria-labelledby="kitchen-h" data-testid="kitchen-band">
      <div className="lv-l-kitchen">
        <div className="lv-l-waitlist-copy">
          <span className="lv-l-eyebrow lv-l-eyebrow-accent">Built in the open</span>
          <h2 id="kitchen-h" className="lv-l-h2">Pull up a seat in the Kitchen.</h2>
          <p>We’re building LunchVoice in the open. The Kitchen is our own Hub: vote on what we make next, rate what just shipped and see the results, the same way your community will.</p>
        </div>
        <HubCard
          hub={hub}
          to={`/${hub.slug}`}
          testId="kitchen-card"
          action={<span className="lv-hcard-fakebtn" aria-hidden="true">Visit the Kitchen</span>}
        />
      </div>
    </section>
  );
}

export function Landing() {
  const plans = ["free", "starter", "team"].map((id) => PLANS.find((p) => p.id === id)!);
  const { state, ctas } = useBilling();

  return (
    <div className="lv-l">
      {/* ---------------- hero (ink) ---------------- */}
      <div className="lv-l-ink">
        <header className="lv-l-hero">
          <div className="lv-l-hero-copy">
            <span className="lv-l-eyebrow"><i aria-hidden="true" />Surveys for any community</span>
            <h1 className="lv-l-h1">Make every voice <em>count.</em></h1>
            <p className="lv-l-lede">
              Build a survey in minutes, share it with one QR code or a six-character code, and watch anonymous answers
              arrive while it’s still happening. Every community gets its own Hub at <b>lunchvoice.com/yourname</b>.
            </p>
            <div className="lv-l-actions" data-testid="hero-actions" data-billing={state.open ? "open" : "closed"}>
              <Button asChild variant="primary" size="lg" data-lv-cta="hero" className="lv-l-cta">
                <Link to={ctas.primary.to}>{ctas.primary.label}</Link>
              </Button>
              <Link className="lv-l-outline-btn lv-l-outline-btn-band" to={ctas.hub.to} data-lv-cta="hero-hub">{ctas.hub.label}</Link>
            </div>
            <Rotator />
          </div>
          <div className="lv-l-hero-side">
            <CodeCard />
          </div>
        </header>
        <div className="lv-l-ticker" aria-hidden="true">
          <div className="lv-l-ticker-track">
            {[...TICKER, ...TICKER].map((w, i) => <span key={i}>{w}<i>·</i></span>)}
          </div>
        </div>
      </div>

      {/* ---------------- more than lunch ---------------- */}
      <section id="uses" className="lv-l-section" aria-labelledby="uses-h">
        <div className="lv-l-head">
          <h2 id="uses-h" className="lv-l-h2">The name has lunch in it. The product doesn’t.</h2>
          <p>LunchVoice is for any group that needs to ask something and trust the answer: clubs, classrooms, teams, events, clinics and neighbourhoods. Each of these starts from a free template.</p>
        </div>
        <ul className="lv-l-chips" data-testid="landing-use-cases">
          {USE_CASES.map((u) => (
            <li key={u.slug}><Link to={`/use-cases/${u.slug}`}><Icon name={u.icon as IconName} size={16} />{u.name}</Link></li>
          ))}
        </ul>
      </section>

      {/* ---------------- how it works: a real sequence, so it is numbered and connected ---------------- */}
      <section id="how" className="lv-l-section" aria-labelledby="how-h">
        <div className="lv-l-head">
          <h2 id="how-h" className="lv-l-h2">How a survey works</h2>
          <p>A Quick Survey is free with any account. You do not need a Hub or a plan for any of these steps.</p>
        </div>
        <ol className="lv-l-journey" data-testid="landing-journey">
          {JOURNEY.map((j, i) => (
            <li key={j.title}>
              <span className="lv-l-journey-n" aria-hidden="true">{i + 1}</span>
              <b>{j.title}</b>
              <p>{j.body}</p>
            </li>
          ))}
        </ol>
        <Link to="/how-it-works" className="lv-l-more">How it works in detail <Icon name="arrow" size={16} /></Link>
      </section>

      {/* ---------------- live results (ink) ---------------- */}
      <section className="lv-l-band lv-l-band-ink" aria-labelledby="live-h">
        <div className="lv-l-split">
          <div className="lv-l-split-copy">
            <h2 id="live-h" className="lv-l-h2">Know before the line clears.</h2>
            <p>Answers land by the minute. Question summaries and charts are built in, and you only ever see totals, never names. A group too small to stay anonymous is withheld, never shown as zero.</p>
          </div>
          <div className="lv-l-live" role="figure" aria-label="Illustration of a results screen, with sample data">
            <div className="lv-l-live-top">
              <span className="lv-l-mono">Results screen</span>
              <span className="lv-l-sample">Sample data</span>
            </div>
            <div className="lv-l-live-metrics">
              <div><strong className="lv-l-amber">412</strong><span>Responses</span></div>
              <div><strong>78%</strong><span>Completion</span></div>
              <div><strong>1:52</strong><span>Median time</span></div>
            </div>
            <div className="lv-l-bars" aria-hidden="true">
              {BARS.map((v, i) => <span key={i} style={{ height: `${Math.round((v / 34) * 100)}%` }} data-peak={i === 5 || undefined} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- products: the way into the six product pages ---------------- */}
      <section id="products" className="lv-l-section" aria-labelledby="products-h">
        <div className="lv-l-head">
          <h2 id="products-h" className="lv-l-h2">What you can do with LunchVoice</h2>
          <p>Free tools for asking anyone. A Hub at <b>lunchvoice.com/yourname</b> for a community that asks again. And a way to bring both to where your people already talk.</p>
        </div>
        <ul className="lv-l-products" data-testid="landing-products">
          {PRODUCTS.map((p) => (
            <li key={p.slug}>
              <Link to={`/products/${p.slug}`}>
                <Icon name={p.icon as IconName} size={22} />
                <b>{p.name}</b>
                <span>{p.line}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/products" className="lv-l-more">All products <Icon name="arrow" size={16} /></Link>
      </section>

      {/* ---------------- for participants (amber) ---------------- */}
      <section id="people" className="lv-l-band lv-l-band-amber" aria-labelledby="people-h">
        <div className="lv-l-split">
          <div className="lv-l-split-copy">
            <span className="lv-l-eyebrow">For participants</span>
            <h2 id="people-h" className="lv-l-h2">Answering is always free.</h2>
            <p>A survey shared by link can let you answer without an account. A free LunchVoice account lets you join private Hubs and answer invite-only surveys.</p>
            <div className="lv-l-actions">
              <Button asChild variant="ink" size="lg"><Link to="/signin">Create free account</Link></Button>
              <Link className="lv-l-outline-btn" to="/join">Join with a code</Link>
            </div>
          </div>
          <ul className="lv-l-promises" data-testid="participant-promises">
            {PROMISES.map((p) => (
              <li key={p.title}><Icon name={p.icon} size={20} /><span><b>{p.title}</b>{p.body}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <WaitlistBand />

      <KitchenBand />

      {/* ---------------- pricing ---------------- */}
      <section id="pricing" className="lv-l-section" aria-labelledby="price-h">
        <div className="lv-l-head">
          <h2 id="price-h" className="lv-l-h2">Free for surveys, from {plans[1].priceLabel} a month for a Hub</h2>
        </div>
        <div className="lv-l-plans">
          {plans.map((p) => (
            <div key={p.id} className={`lv-l-plan${p.id === "starter" ? " lv-l-plan-ink" : ""}`}>
              <div className="lv-l-plan-top"><b>{p.name}</b><span className="lv-l-mono">{p.id === "starter" ? (state.open ? "For one community" : "Founding seat") : p.id === "free" ? "No Hub needed" : "More of everything"}</span></div>
              <div className="lv-l-plan-price"><strong>{p.priceLabel}</strong><span>{p.cadence}</span></div>
              <ul>{p.features.slice(0, 5).map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
              {p.id === "free" && <Button asChild variant="secondary" size="lg" block><Link to={ctas.primary.to}>{ctas.primary.label}</Link></Button>}
              {p.id === "starter" && <Button asChild variant="primary" size="lg" block data-lv-cta="plan-starter"><Link to={ctas.hub.to}>{ctas.hub.label}</Link></Button>}
              {p.id === "team" && <Button asChild variant="secondary" size="lg" block><Link to="/pricing">See every plan</Link></Button>}
            </div>
          ))}
        </div>
        <p className="lv-l-foot">
          Campaign Starter, Campaign Plus and Hub URL reservations are on the <Link to="/pricing">pricing page</Link>. <span data-testid="billing-sentence">{ctas.sentence}</span>
        </p>
      </section>
    </div>
  );
}
