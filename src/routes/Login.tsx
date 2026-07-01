import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase, staffLogin } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Mode = "student" | "staff";
type Step = "enter" | "code";

export function Login() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("student");

  // student
  const [step, setStep] = useState<Step>("enter");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // staff
  const [staffEmail, setStaffEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Preserve a ?code= (from a shared QR/link) across login.
  const [joinCode] = useState(() => new URLSearchParams(window.location.search).get("code"));
  useEffect(() => {
    if (joinCode) sessionStorage.setItem("pendingJoinCode", joinCode);
  }, [joinCode]);

  if (!loading && session) return <Navigate to="/" replace />;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    // No emailRedirectTo => Supabase emails a numeric code instead of a magic link.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    // Save the name they typed (OTP signup doesn't carry send-time metadata reliably).
    if (name.trim() && data.user) {
      await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", data.user.id);
    }
    setBusy(false);
    // success => AuthProvider picks up the session and Gate redirects
  }

  async function doStaff(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await staffLogin(staffEmail.trim(), password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="card center">
        <p className="eyebrow tag" style={{ display: "inline-block" }}>Miami Job Corps</p>
        <h2 style={{ fontSize: 30, marginTop: 10 }}>The Lunch Line</h2>

        <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "8px 0 16px" }}>
          <button
            className={mode === "student" ? "btn-mustard" : "btn-ghost"}
            style={{ fontSize: 13, padding: "6px 14px" }}
            onClick={() => { setMode("student"); setErr(""); }}
          >
            Student
          </button>
          <button
            className={mode === "staff" ? "btn-mustard" : "btn-ghost"}
            style={{ fontSize: 13, padding: "6px 14px" }}
            onClick={() => { setMode("staff"); setErr(""); }}
          >
            Staff
          </button>
        </div>

        {err && <div className="notice err">{err}</div>}

        {mode === "student" ? (
          step === "enter" ? (
            <form onSubmit={sendCode} className="stack">
              <p className="hint" style={{ margin: 0 }}>Sign up with your name and personal email. We'll email you a verification code. Your survey answers stay anonymous.</p>
              <input type="text" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-primary btn-block" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
            </form>
          ) : (
            <form onSubmit={verify} className="stack">
              <p className="hint" style={{ margin: 0 }}>Enter the code we sent to <b>{email}</b>.</p>
              <input
                type="text" inputMode="numeric" required placeholder="123456" value={code}
                onChange={(e) => setCode(e.target.value)} className="mono"
                style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em" }}
              />
              <button className="btn-primary btn-block" disabled={busy}>{busy ? "Verifying…" : "Verify & sign in"}</button>
              <button type="button" className="staff-link muted" style={{ background: "none", border: "none", textDecoration: "underline" }}
                onClick={() => { setStep("enter"); setCode(""); setErr(""); }}>
                Use a different email
              </button>
            </form>
          )
        ) : (
          <form onSubmit={doStaff} className="stack">
            <p className="hint" style={{ margin: 0 }}>Staff sign in with your MJCC cafeteria credentials.</p>
            <input type="email" required placeholder="you@mjc-cafeteria.com" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn-primary btn-block" disabled={busy}>{busy ? "Signing in…" : "Staff sign in"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
