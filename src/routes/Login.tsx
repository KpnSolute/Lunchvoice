import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Preserve a ?code= (from a shared QR/link) across the magic-link round trip.
  const [next] = useState(() => new URLSearchParams(window.location.search).get("code"));
  useEffect(() => {
    if (next) sessionStorage.setItem("pendingJoinCode", next);
  }, [next]);

  if (!loading && session) return <Navigate to="/" replace />;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="wrap" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="card center">
        <p className="eyebrow tag" style={{ display: "inline-block" }}>Miami Job Corps</p>
        <h2 style={{ fontSize: 30, marginTop: 10 }}>The Lunch Line</h2>
        <p className="hint">Rate the menu, earn points, redeem rewards. Sign in with your school email — that's your only login.</p>

        {sent ? (
          <div className="notice ok">
            Check your email — we sent a magic link to <b>{email}</b>. Open it on this device to sign in.
          </div>
        ) : (
          <form onSubmit={send} className="stack">
            {err && <div className="notice err">{err}</div>}
            <input
              type="email"
              required
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary btn-block" disabled={busy}>
              {busy ? "Sending…" : "Send me a magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
