import { useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";

export function Shell() {
  const { session, signOut } = useIdentity();
  return (
    <>
      <header className="wrap row" style={{ justifyContent: "space-between", paddingBottom: 0 }}>
        <Link to="/"><img src="/brand/lunchvoice-wordmark.svg" alt="LunchVoice" height={28} /></Link>
        {session ? (
          <div className="row">
            <Link to="/me">{session.name}</Link>
            <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <Link className="btn btn-primary" to="/signin">Sign in</Link>
        )}
      </header>
      <main className="wrap"><Outlet /></main>
    </>
  );
}

export function Landing() {
  return (
    <div className="stack" style={{ gap: 16, paddingTop: 40 }}>
      <div className="eyebrow">LunchVoice</div>
      <h1>Communities that ask, and listen.</h1>
      <p className="muted">Join or create a Hub, run campaigns, and see aggregate results without exposing who answered.</p>
      <div className="row"><Link className="btn btn-primary" to="/signin">Get started</Link></div>
    </div>
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
      {canSimulate && (
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

export function NotFound() {
  return (
    <div className="stack center" style={{ paddingTop: 60 }}>
      <h2>Nothing here</h2>
      <Link to="/">Back to LunchVoice</Link>
    </div>
  );
}
