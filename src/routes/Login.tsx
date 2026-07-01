import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase, staffLogin } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Step = "email" | "password" | "code";

// Staff use MJCC cafeteria addresses; everyone else is a student.
const STAFF_DOMAIN = "@mjc-cafeteria.com";
const isStaffEmail = (e: string) => e.trim().toLowerCase().endsWith(STAFF_DOMAIN);
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function Login() {
  const { session, loading } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Preserve a ?code= (from a shared QR/link) across login.
  const [joinCode] = useState(() => new URLSearchParams(window.location.search).get("code"));
  useEffect(() => {
    if (joinCode) sessionStorage.setItem("pendingJoinCode", joinCode);
  }, [joinCode]);

  if (!loading && session) return <Navigate to="/" replace />;

  const staff = isStaffEmail(email);

  // Step 1: email entered → route to staff password or student OTP.
  async function continueEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (staff) {
      setStep("password");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setStep("code");
  }

  async function verifyStudent(e: React.FormEvent) {
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

  async function verifyStaff(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await staffLogin(email.trim(), password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("email");
    setPassword("");
    setCode("");
    setName("");
    setErr("");
  }

  return (
    <div className="wrap" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="card center">
        <p className="eyebrow tag" style={{ display: "inline-block" }}>Miami Job Corps</p>
        <h2 style={{ fontSize: 30, marginTop: 10, marginBottom: 4 }}>The Lunch Line</h2>

        {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}

        {step === "email" && (
          <form onSubmit={continueEmail} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              Enter your email to sign in. Students use their personal email; staff use their
              cafeteria address. New here? We'll set you up automatically.
            </p>
            <input
              type="email" autoFocus required placeholder="you@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary btn-block" disabled={busy || !isValidEmail(email)}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={verifyStaff} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>Staff sign-in for <b>{email}</b>. Enter your cafeteria password.</p>
            <input
              type="password" autoFocus required placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn-primary btn-block" disabled={busy || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" className="link-btn" onClick={reset}>Use a different email</button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyStudent} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>Enter the code we emailed to <b>{email}</b>. New students, add your name so we can greet you.</p>
            <input
              type="text" inputMode="numeric" autoFocus required placeholder="Verification code" value={code}
              onChange={(e) => setCode(e.target.value)} className="mono"
              style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em" }}
            />
            <input
              type="text" placeholder="Your name (new students)" value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn-primary btn-block" disabled={busy || !code.trim()}>
              {busy ? "Verifying…" : "Verify & sign in"}
            </button>
            <button type="button" className="link-btn" onClick={reset}>Use a different email</button>
          </form>
        )}
      </div>
    </div>
  );
}
