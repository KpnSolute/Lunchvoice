import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { USE_CASES } from "../config/useCases";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { PLANS } from "../config/pricing";
import { Button } from "@/components/shadcn/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/shadcn/input-otp";
import { Progress } from "@/components/shadcn/progress";

// `/` is built 1:1 from the design handoff's "LunchVoice v2 Landing" (founder decision): ink hero with the join-code
// card, amber ticker, three steps, live results, your Hub, for participants, pricing. The founder's launch adds the
// waitlist section. Prices come from src/config/pricing.ts; dining is one use case among many.

const ROTATOR: [string, string][] = [
  ["Rating scales people tap in seconds", ": stars, choices, yes or no, and a short answer."],
  ["One QR per survey", ": print it, post it anywhere, and answers start."],
  ["Public or private Hubs", ": anonymous for everyone, or members with a LunchVoice account."],
];
const TICKER = ["Clubs", "Classrooms", "Teams", "Events", "Clinics", "Communities", "Libraries", "Campuses", "Dining"];
const BARS = [4, 9, 6, 3, 18, 34, 22, 8, 5, 12, 20, 9];

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
  const nav = useNavigate();
  const go = () => code.length === 6 && nav(`/c/${code.toUpperCase()}`);
  return (
    <form id="join" className="lv-l-code" onSubmit={(e) => { e.preventDefault(); go(); }} aria-labelledby="code-h">
      <div className="lv-l-code-head">
        <h2 id="code-h">Got a code?</h2>
        <span className="lv-l-mono">No account needed</span>
      </div>
      <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v.toUpperCase())} aria-label="Six-character join code" pattern="^[A-Za-z0-9]*$">
        <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
      </InputOTP>
      <div className="lv-l-code-foot">
        <Button type="submit" variant="ink" size="lg" disabled={code.length < 6}>
          Join survey <Icon name="arrow" size={16} />
        </Button>
        <span>or scan the QR on the poster</span>
      </div>
    </form>
  );
}

function WaitlistBand() {
  const { api } = useIdentity();
  const status = useLv(() => api.waitlistStatus(), [api]);
  const s = status.data;
  const left = s ? Math.max(0, s.seats_total - s.seats_taken) : null;
  return (
    <section id="waitlist" className="lv-l-section" aria-labelledby="wl-h">
      <div className="lv-l-waitlist">
        <div className="lv-l-waitlist-copy">
          <span className="lv-l-eyebrow lv-l-eyebrow-accent">Founding seats</span>
          <h2 id="wl-h" className="lv-l-h2">50 Founding seats. A Hub on us.</h2>
          <p>
            LunchVoice opens through a waitlist. Sign in and join: the first 50 people admitted receive a Founding Hub
            credit, a Starter Hub free until paid billing launches and for 30 days after. Everyone else can buy a plan once
            billing opens.
          </p>
          <div className="lv-l-actions">
            <Button asChild variant="primary" size="lg"><Link to="/waitlist">Join the waitlist</Link></Button>
            <Button asChild variant="secondary" size="lg"><Link to="/surveys/new">Or start a free Quick Survey</Link></Button>
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

export function Landing() {
  const plans = ["free", "starter", "team"].map((id) => PLANS.find((p) => p.id === id)!);

  return (
    <div className="lv-l">
      {/* ---------------- hero (ink) ---------------- */}
      <div className="lv-l-ink">
        <header className="lv-l-hero">
          <div className="lv-l-hero-copy">
            <span className="lv-l-eyebrow"><i aria-hidden="true" />LunchVoice 2.0<span>· surveys for any community</span></span>
            <h1 className="lv-l-h1">Every voice has a story. <em>Hear it.</em></h1>
            <p className="lv-l-lede">
              Build a survey in minutes, share it with one QR code or a six-character code, and watch anonymous answers
              arrive while it’s still happening. Every community gets its own Hub at <b>lunchvoice.com/yourname</b>.
            </p>
            <Rotator />
          </div>
          <div className="lv-l-hero-side">
            <CodeCard />
            <div className="lv-l-cta-row">
              <Button asChild variant="primary" size="lg" data-lv-cta="hero" className="lv-l-cta">
                <Link to="/waitlist">Create your Hub</Link>
              </Button>
            </div>
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
          <span className="lv-l-eyebrow lv-l-eyebrow-muted">Use cases</span>
          <h2 id="uses-h" className="lv-l-h2">The name has lunch in it. The product doesn’t.</h2>
        </div>
        <ul className="lv-l-chips" data-testid="landing-use-cases">
          {USE_CASES.map((u) => (
            <li key={u.slug}><Link to={`/use-cases/${u.slug}`}><Icon name={u.icon as IconName} size={16} />{u.name}</Link></li>
          ))}
        </ul>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section id="how" className="lv-l-section" aria-labelledby="how-h">
        <div className="lv-l-head">
          <span className="lv-l-eyebrow lv-l-eyebrow-muted">How it works</span>
          <h2 id="how-h" className="lv-l-h2">Build it, share it, hear it. Same afternoon.</h2>
        </div>
        <ol className="lv-l-steps">
          <li className="lv-l-step lv-l-step-light">
            <div><span className="lv-l-step-n">01</span><span className="lv-l-step-icon"><Icon name="survey" size={20} /></span></div>
            <b>Build</b>
            <p>Start from a blank page or a Quick Survey. Five question types, all built to tap on a phone.</p>
          </li>
          <li className="lv-l-step lv-l-step-amber">
            <div><span className="lv-l-step-n">02</span><span className="lv-l-step-icon"><Icon name="join" size={20} /></span></div>
            <b>Share</b>
            <p>Print a QR poster, send a link, or give out a six-character code. No app download.</p>
          </li>
          <li className="lv-l-step lv-l-step-ink">
            <div><span className="lv-l-step-n">03</span><span className="lv-l-step-icon"><Icon name="voice" size={20} /></span></div>
            <b>Hear</b>
            <p>See answers arrive, post a “you said, we did” update, and close the loop.</p>
          </li>
        </ol>
      </section>

      {/* ---------------- live results (ink) ---------------- */}
      <section className="lv-l-band lv-l-band-ink" aria-labelledby="live-h">
        <div className="lv-l-split">
          <div className="lv-l-split-copy">
            <span className="lv-l-eyebrow lv-l-eyebrow-accent">Live results</span>
            <h2 id="live-h" className="lv-l-h2">Know before the line clears.</h2>
            <p>Answers land by the minute. Question summaries and charts are built in, and you only ever see totals, never names. A group too small to stay anonymous is withheld, never shown as zero.</p>
          </div>
          <div className="lv-l-live" aria-label="Sample results">
            <div className="lv-l-live-top">
              <span className="lv-l-mono"><i aria-hidden="true" />Live · Sample survey</span>
              <span className="lv-l-mono lv-l-dim">updated 2 min ago</span>
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

      {/* ---------------- your Hub ---------------- */}
      <section id="hubs" className="lv-l-section" aria-labelledby="hub-h">
        <div className="lv-l-head">
          <span className="lv-l-eyebrow lv-l-eyebrow-muted">Your Hub</span>
          <h2 id="hub-h" className="lv-l-h2">A home for your surveys, in your colors.</h2>
          <p>Every Hub gets <b>lunchvoice.com/yourname</b>. Add pages as your community grows, and choose who gets in.</p>
        </div>
        <div className="lv-l-hubgrid">
          <div className="lv-l-browser" aria-hidden="true">
            <div className="lv-l-browser-bar"><span><i>lunchvoice.com/</i><b>yourname</b></span></div>
            <div className="lv-l-browser-cover">
              <div><span className="lv-l-logo">LOGO</span><b>Your community</b></div>
              <div className="lv-l-browser-tabs"><span data-on>Campaigns</span><span>News</span><span>Leaderboard</span><span>Comments</span></div>
            </div>
            <div className="lv-l-browser-body">
              <div className="lv-l-browser-row"><div><b>Monthly pulse</b><span>7 questions · ~2 min</span></div><em data-live>Live</em></div>
              <div className="lv-l-browser-row"><div><b>Event feedback</b><span>Opens Friday</span></div><em>Scheduled</em></div>
              <p>Powered by <b>LunchVoice</b></p>
            </div>
          </div>
          <div className="lv-l-modes">
            <div className="lv-l-mode lv-l-mode-light">
              <span><Icon name="globe" size={22} /></span>
              <div><b>Public</b><p>Anyone with the link, QR or code can answer, anonymously and with no account.</p></div>
            </div>
            <div className="lv-l-mode lv-l-mode-ink">
              <span><Icon name="lock" size={22} /></span>
              <div><b>Private</b><p>Only members signed in with a LunchVoice account. Approve requests or send invite codes.</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- for participants (amber) ---------------- */}
      <section id="people" className="lv-l-band lv-l-band-amber" aria-labelledby="people-h">
        <div className="lv-l-split">
          <div className="lv-l-split-copy">
            <span className="lv-l-eyebrow">For participants</span>
            <h2 id="people-h" className="lv-l-h2">One account. Every voice you’ve given.</h2>
            <p>A free LunchVoice account lets you join private Hubs, answer invite-only surveys, and see what changed because you spoke up. Creators still see only totals.</p>
            <div className="lv-l-actions">
              <Button asChild variant="ink" size="lg"><Link to="/signin">Create free account</Link></Button>
              <Link className="lv-l-outline-btn" to="/join">Join with a code</Link>
            </div>
          </div>
          <div className="lv-l-stats" aria-label="Example account">
            <div data-tone="ink"><span>Surveys answered</span><strong>37</strong></div>
            <div><span>Hubs joined</span><strong>3</strong></div>
            <div><span>Quick Surveys made</span><strong>2</strong></div>
            <div data-tone="ink"><span>Changes made</span><strong>4</strong></div>
          </div>
        </div>
      </section>

      <WaitlistBand />

      {/* ---------------- pricing ---------------- */}
      <section id="pricing" className="lv-l-section" aria-labelledby="price-h">
        <div className="lv-l-head">
          <span className="lv-l-eyebrow lv-l-eyebrow-muted">Pricing</span>
          <h2 id="price-h" className="lv-l-h2">Free to start. Grow when you’re ready.</h2>
        </div>
        <div className="lv-l-plans">
          {plans.map((p) => (
            <div key={p.id} className={`lv-l-plan${p.id === "starter" ? " lv-l-plan-ink" : ""}`}>
              <div className="lv-l-plan-top"><b>{p.name}</b><span className="lv-l-mono">{p.id === "starter" ? "Founding seat" : p.id === "free" ? "No Hub needed" : "More of everything"}</span></div>
              <div className="lv-l-plan-price"><strong>{p.priceLabel ?? "Price not set"}</strong><span>{p.cadence}</span></div>
              <ul>{p.features.slice(0, 5).map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
              {p.id === "free" && <Button asChild variant="secondary" size="lg" block><Link to="/surveys/new">Start a Quick Survey</Link></Button>}
              {p.id === "starter" && <Button asChild variant="primary" size="lg" block><Link to="/waitlist">Join the waitlist</Link></Button>}
              {p.id === "team" && <Button asChild variant="secondary" size="lg" block><Link to="/pricing">See every plan</Link></Button>}
            </div>
          ))}
        </div>
        <p className="lv-l-foot">
          Campaign Starter, Campaign Plus and Hub URL reservations are on the <Link to="/pricing">pricing page</Link>. Checkout opens when billing launches; nothing here charges money.
        </p>
      </section>
    </div>
  );
}
