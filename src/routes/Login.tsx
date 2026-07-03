import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { beginLogin, staffLogin, supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Step = "identifier" | "password" | "code";
type StudentMode = "returning" | "new";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isUsername = (value: string) => value.trim().length > 0 && !value.includes("@");
const canContinue = (value: string) => isEmail(value) || isUsername(value);

export function Login() {
  const { session, loading } = useAuth();
  const [step, setStep] = useState<Step>("identifier");
  const [studentMode, setStudentMode] = useState<StudentMode>("returning");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [joinCode] = useState(() => new URLSearchParams(window.location.search).get("code"));
  useEffect(() => {
    if (joinCode) sessionStorage.setItem("pendingJoinCode", joinCode);
  }, [joinCode]);

  if (!loading && session) return <Navigate to="/" replace />;

  const loginId = identifier.trim();
  const isStudentEmailFlow = step === "code";

  async function continueLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const kind = await beginLogin(loginId);
      if (kind === "staff") {
        setStep("password");
        return;
      }
      setStudentMode(kind === "student_new" ? "new" : "returning");
      setStep("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyStudent(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const email = loginId.toLowerCase();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }

    if (data.user) {
      const updates = {
        email,
        ...(studentMode === "new" && name.trim() ? { display_name: name.trim() } : {}),
      };
      const { error: profileErr } = await supabase.from("profiles").update(updates).eq("id", data.user.id);
      if (profileErr) {
        console.error("student_profile_update_failed", profileErr.message);
      }
      if (studentMode === "new" && profileErr) {
        await supabase.auth.signOut();
        setBusy(false);
        setErr("We verified your email, but could not finish your student profile. Try again.");
        return;
      }
    }

    setBusy(false);
  }

  async function verifyStaff(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await staffLogin(loginId, password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("identifier");
    setStudentMode("returning");
    setPassword("");
    setCode("");
    setName("");
    setErr("");
  }

  return (
    <div className="wrap" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="card center">
        <p className="eyebrow tag" style={{ display: "inline-block" }}>Miami Job Corps</p>
        <h2 style={{ fontSize: 30, marginTop: 10, marginBottom: 4 }}>Dining Voice</h2>

        {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}

        {step === "identifier" && (
          <form onSubmit={continueLogin} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              Students use their email every time. Staff use their MJCC sudo username.
            </p>
            <input
              type="text"
              inputMode="email"
              autoFocus
              required
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Student email or staff username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <button className="btn btn-primary btn-block" disabled={busy || !canContinue(identifier)}>
              {busy ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={verifyStaff} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              Sudo sign-in for <b>{loginId}</b>. Enter your MJCC password.
            </p>
            <input
              type="password"
              autoFocus
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary btn-block" disabled={busy || !password}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <button type="button" className="link-btn" onClick={reset}>Use a different login</button>
          </form>
        )}

        {isStudentEmailFlow && (
          <form onSubmit={verifyStudent} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              {studentMode === "new" ? (
                <>Enter the code we emailed to <b>{loginId}</b>, then add your name once.</>
              ) : (
                <>Enter the code we emailed to <b>{loginId}</b>.</>
              )}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              required
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mono"
              style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em" }}
            />
            {studentMode === "new" && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <button className="btn btn-primary btn-block" disabled={busy || !code.trim()}>
              {busy ? "Verifying..." : "Verify & sign in"}
            </button>
            <button type="button" className="link-btn" onClick={reset}>Use a different login</button>
          </form>
        )}
      </div>
    </div>
  );
}
