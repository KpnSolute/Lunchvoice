import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { beginLogin, MJCC_STAFF_SSO_URL, supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { useOrg } from "../org/OrgProvider";
import { tenantBrand } from "../org/tenantBrand";

type Step = "identifier" | "code";
type StudentMode = "returning" | "new";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const canContinue = (value: string) => isEmail(value);

export function Login() {
  const { session, loading, profile, isAdmin } = useAuth();
  const { org } = useOrg();
  const [step, setStep] = useState<Step>("identifier");
  const [studentMode, setStudentMode] = useState<StudentMode>("returning");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [joinCode] = useState(() => new URLSearchParams(window.location.search).get("code"));
  useEffect(() => {
    if (joinCode) sessionStorage.setItem("pendingJoinCode", joinCode);
  }, [joinCode]);

  if (!loading && session && profile) {
    const pendingJoinCode = joinCode || sessionStorage.getItem("pendingJoinCode");
    if (!isAdmin && pendingJoinCode) {
      return <Navigate to={`/${org.slug}/join?code=${encodeURIComponent(pendingJoinCode)}`} replace />;
    }
    return <Navigate to={isAdmin ? `/${org.slug}/admin` : `/${org.slug}`} replace />;
  }
  if (!loading && session) {
    return <div className="wrap center muted" style={{ paddingTop: 60 }}>Setting up your account...</div>;
  }

  const loginId = identifier.trim();
  const isStudentEmailFlow = step === "code";

  async function continueLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const kind = await beginLogin(loginId, org.slug);
      if (kind === "staff") {
        window.location.assign(MJCC_STAFF_SSO_URL);
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
    if (studentMode === "new" && !name.trim()) {
      setErr("Add a name for your student pass before verifying.");
      return;
    }
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
        ...(studentMode === "new" ? { display_name: name.trim() } : {}),
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

  function reset() {
    setStep("identifier");
    setStudentMode("returning");
    setCode("");
    setName("");
    setErr("");
  }

  const brand = tenantBrand(org.slug);

  return (
    <div className="login-screen">
      {brand?.loginBg && (
        <div className="login-bg" style={{ backgroundImage: `url(${brand.loginBg})` }} />
      )}
      <div className="login-glass center">
        {brand ? (
          <img className="login-logo" src={brand.logo} alt="" />
        ) : (
          <p className="eyebrow tag" style={{ display: "inline-block" }}>Lunch Voice</p>
        )}
        <h2 className="login-title">{org.name}</h2>

        {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}

        {step === "identifier" && (
          <form onSubmit={continueLogin} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              Students use their email. Staff continue through the MJCC portal below.
            </p>
            <input
              type="text"
              inputMode="email"
              autoFocus
              required
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Student email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <button className="btn btn-primary btn-block" disabled={busy || !canContinue(identifier)}>
              {busy ? "Checking..." : "Continue"}
            </button>
            <div className="muted center" style={{ fontSize: 12 }}>Staff access</div>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => window.location.assign(MJCC_STAFF_SSO_URL)}
            >
              Continue with MJCC
            </button>
          </form>
        )}

        {isStudentEmailFlow && (
          <form onSubmit={verifyStudent} className="stack" style={{ marginTop: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              {studentMode === "new" ? (
                <>Create your student pass for <b>{loginId}</b>. This name is for your screen; staff sees your student ID.</>
              ) : (
                <>Enter the code we emailed to <b>{loginId}</b>.</>
              )}
            </p>
            {studentMode === "new" && (
              <input
                type="text"
                autoFocus
                required
                placeholder="Your name or nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <input
              type="text"
              inputMode="numeric"
              autoFocus={studentMode !== "new"}
              required
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mono"
              style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em" }}
            />
            <button className="btn btn-primary btn-block" disabled={busy || !code.trim() || (studentMode === "new" && !name.trim())}>
              {busy ? "Verifying..." : "Verify & sign in"}
            </button>
            <button type="button" className="link-btn" onClick={reset}>Use a different login</button>
          </form>
        )}
      </div>
    </div>
  );
}
