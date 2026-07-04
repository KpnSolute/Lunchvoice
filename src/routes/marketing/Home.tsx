import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Icon } from "../../components/Icon";
import "./marketing.css";

// Adds .in when a .mkt-reveal element scrolls into view.
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll(".mkt-reveal");
    if (!("IntersectionObserver" in window)) {
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
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

const TICKER = [
  "Upload menus", "Launch surveys", "Track ratings", "Reward students",
  "Hear every voice", "Plan better lunches",
];

const FEATURES = [
  {
    icon: "menu" as const,
    title: "Menus in minutes",
    body: "Upload a weekly workbook or sync from your existing system — students always see what's for lunch today.",
  },
  {
    icon: "survey" as const,
    title: "Surveys that get answered",
    body: "Quick, anonymous, mobile-first surveys students actually finish. Question packs included.",
  },
  {
    icon: "dashboard" as const,
    title: "A live dashboard",
    body: "Ratings, participation, and trends per dish and per day — decide with data, not guesswork.",
  },
  {
    icon: "store" as const,
    title: "Points & rewards",
    body: "Feedback earns points; points buy rewards in your store. Participation stays high on its own.",
  },
];

export function Home() {
  const navigate = useNavigate();
  const revealRef = useReveal();
  const [slug, setSlug] = useState("");
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function goToOrg() {
    const s = slug.trim();
    if (s) navigate(`/${s}/login`);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("contract_requests").insert({
      org_name: orgName.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      message: message.trim() || null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSubmitted(true);
  }

  return (
    <div className="mkt" ref={revealRef}>
      <nav className="mkt-nav">
        <div className="mkt-inner">
          <a className="mkt-logo" href="/">
            <img src="/brand/lunchvoice-mark.svg" alt="" />
            <b>Lunch Voice</b>
          </a>
          <div className="mkt-nav-links">
            <a href="#features">Product</a>
            <a href="#how">How it works</a>
            <a href="#signin">Sign in</a>
            <a className="mkt-btn mkt-btn-amber sm" href="#contact">Request a demo</a>
          </div>
        </div>
      </nav>

      <header className="mkt-hero noise">
        <div className="mkt-hero-glow g1" />
        <div className="mkt-hero-glow g2" />
        <div className="mkt-inner">
          <div>
            <p className="mkt-eyebrow mkt-rise d1">For cafeteria operators</p>
            <h1 className="mkt-rise d2">
              Every tray has a story. <span className="amber">Hear it.</span>
            </h1>
            <p className="mkt-hero-sub mkt-rise d3">
              Lunch Voice closes the loop between your kitchen and your students —
              publish menus, run anonymous surveys, watch ratings roll in, and reward
              the voices that make your lunch line better.
            </p>
            <div className="mkt-hero-cta mkt-rise d4">
              <a className="mkt-btn mkt-btn-amber" href="#contact">Request a demo</a>
              <a className="mkt-btn mkt-btn-ghost" href="#signin">Org sign in</a>
            </div>
          </div>
          <div className="mkt-hero-art mkt-rise d3" aria-hidden="true">
            <img src="/brand/lunchvoice-mark.svg" alt="" />
          </div>
        </div>
      </header>

      <div className="mkt-ticker" aria-hidden="true">
        <div className="mkt-ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>{t} ◆</span>
          ))}
        </div>
      </div>

      <section className="mkt-section" id="features">
        <div className="mkt-inner">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-eyebrow">What you get</p>
            <h2>One dashboard, the whole feedback loop</h2>
            <p>Everything a food-service contractor needs to run menus and listen to students — nothing you don't.</p>
          </div>
          <div className="mkt-features">
            {FEATURES.map((f, i) => (
              <div className="mkt-feature mkt-reveal" style={{ transitionDelay: `${i * 90}ms` }} key={f.title}>
                <div className="ico"><Icon name={f.icon} /></div>
                <b>{f.title}</b>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section oat" id="how">
        <div className="mkt-inner">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-eyebrow">How it works</p>
            <h2>Live in a lunch period</h2>
          </div>
          <div className="mkt-steps">
            <div className="mkt-step mkt-reveal">
              <b>Get your org</b>
              <p>We set up your branded space — your slug, your menus, your roster. Students join with a QR code.</p>
            </div>
            <div className="mkt-step mkt-reveal" style={{ transitionDelay: "100ms" }}>
              <b>Students rate & respond</b>
              <p>Anonymous ratings and surveys from any phone, right in the lunch line. No app download.</p>
            </div>
            <div className="mkt-step mkt-reveal" style={{ transitionDelay: "200ms" }}>
              <b>You see what works</b>
              <p>Dish-level trends and survey results land on your dashboard the moment they happen.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section" id="signin">
        <div className="mkt-inner">
          <div className="mkt-access">
            <div className="mkt-panel mkt-reveal">
              <h3>Already a Lunch Voice org?</h3>
              <p className="sub">Enter your organization slug to head to your sign-in page.</p>
              <div className="fld">
                <label htmlFor="mkt-slug">Organization slug</label>
                <input
                  id="mkt-slug"
                  type="text"
                  placeholder="e.g. LionCafe"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goToOrg()}
                />
              </div>
              <button className="mkt-btn mkt-btn-dark" onClick={goToOrg} disabled={!slug.trim()}>
                Go to my org <Icon name="arrow" size={16} />
              </button>
            </div>

            <div className="mkt-panel mkt-reveal" style={{ transitionDelay: "120ms" }} id="contact">
              <h3>Request our services</h3>
              <p className="sub">Interested in Lunch Voice for your cafeteria? Drop us a line.</p>
              {submitted ? (
                <div className="mkt-ok">Thanks! We'll be in touch soon.</div>
              ) : (
                <form onSubmit={submitRequest}>
                  <div className="fld">
                    <label htmlFor="mkt-org">Organization name</label>
                    <input id="mkt-org" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="e.g. Miami Job Corps" />
                  </div>
                  <div className="fld">
                    <label htmlFor="mkt-name">Your name</label>
                    <input id="mkt-name" value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder="Full name" />
                  </div>
                  <div className="fld">
                    <label htmlFor="mkt-email">Email</label>
                    <input id="mkt-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required placeholder="you@org.com" />
                  </div>
                  <div className="fld">
                    <label htmlFor="mkt-msg">Message (optional)</label>
                    <textarea id="mkt-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your cafeteria and what you need" />
                  </div>
                  {err && <div className="mkt-err">{err}</div>}
                  <button className="mkt-btn mkt-btn-amber" disabled={busy}>
                    {busy ? "Sending..." : "Send request"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="mkt-footer noise">
        <div className="mkt-inner">
          <img src="/brand/lunchvoice-lockup-dark.svg" alt="Lunch Voice" />
          <span className="fine">© {new Date().getFullYear()} Lunch Voice · Menus, surveys & rewards for cafeterias</span>
        </div>
      </footer>
    </div>
  );
}
