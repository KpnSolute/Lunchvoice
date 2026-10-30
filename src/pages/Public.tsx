import { useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { MadeBy } from "../components/MakerMark";
import "../styles/landing.css";

// The marketing chrome (full nav, footer, maker's mark) belongs to the public pages.
// In-product routes keep the compact header so Hub chrome stays the focus.
const MARKETING_ROUTES = new Set([
  "/", "/how-it-works", "/use-cases", "/pricing", "/beta", "/about",
  "/status", "/terms", "/privacy", "/support", "/discover",
]);

export function Shell() {
  const { session, signOut } = useIdentity();
  const { pathname } = useLocation();
  const marketing = MARKETING_ROUTES.has(pathname);

  return (
    <>
      <header className="lv-header">
        <Link to="/" className="lv-brand" aria-label="LunchVoice home">
          <img src="/brand/lunchvoice-mark.svg" alt="" height={28} width={28} />
          <span>LunchVoice</span>
        </Link>

        {marketing && (
          <nav className="lv-nav" aria-label="Main">
            <Link to="/how-it-works">How it works</Link>
            <Link to="/use-cases">Use cases</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/discover">Discover</Link>
          </nav>
        )}

        <div className="lv-header-actions">
          {session ? (
            <>
              <Link className="lv-link-quiet" to="/me">{session.name}</Link>
              <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              {marketing && <Link className="lv-link-quiet" to="/signin">Sign in</Link>}
              <Link className="btn btn-primary" to="/signin">Get started</Link>
            </>
          )}
        </div>
      </header>

      <main className={marketing ? "lv-main" : "wrap"}>
        <Outlet />
      </main>

      {marketing && (
        <footer className="lv-footer">
          <div className="lv-footer-inner">
            <span className="row" style={{ gap: 9 }}>
              <img src="/brand/lunchvoice-mark.svg" alt="" height={22} width={22} />
              <strong style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>LunchVoice</strong>
            </span>
            <nav className="lv-footer-nav" aria-label="Footer">
              <Link to="/how-it-works">How it works</Link>
              <Link to="/use-cases">Use cases</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/discover">Discover</Link>
              <Link to="/about">About</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/support">Support</Link>
              <Link to="/status">Status</Link>
              <Link to="/signin">Sign in</Link>
            </nav>
            <MadeBy />
          </div>
        </footer>
      )}
    </>
  );
}

export function SignIn() {
  const { session, issuerConfigured, canSimulate, signInSimulated } = useIdentity();
  const [name, setName] = useState("Dana");
  const location = useLocation();
  const nav = useNavigate();
  if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/me"} replace />;
  return (
    <div className="card stack" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Sign in</h2>
      {issuerConfigured ? (
        <p className="muted">Continue with Google through KpnIdentity.</p>
      ) : (
        <div className="notice">KpnIdentity is not configured for this build, so Google sign-in is unavailable.</div>
      )}
      {import.meta.env.DEV && canSimulate && (
        <>
          <label className="stack">Simulated display name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn-solid" onClick={() => { signInSimulated(name); nav("/me"); }}>Sign in (simulated)</button>
        </>
      )}
    </div>
  );
}

export function RequireSignIn({ children }: { children: ReactNode }) {
  const { session } = useIdentity();
  const location = useLocation();
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

