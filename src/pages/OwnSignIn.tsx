// LunchVoice's own sign-in and sign-up screens (spec A6, ADR A7). Functional first: week 4 restyles them with the new tokens.
// Shown only when the build enables VITE_LV_AUTH=1; otherwise the one-button KpnIdentity card in Public.tsx is used.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LvMark } from "../components/LvMark";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Card } from "@/components/shadcn/card";
import { Field, Notice } from "@/components/shadcn/blocks";
import type { OwnAuthApi } from "../identity/IdentityProvider";
import { safeReturnTo } from "../lib/kpnIdentity";
import { MIN_PASSWORD } from "../lib/lvAuth";

type Mode = "signin" | "signup" | "forgot" | "check-inbox" | "reset-sent" | "new-password";

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const DiscordMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

function Legal() {
  return (
    <p className="ui-help lv-m0">
      By continuing you agree to the LunchVoice <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
    </p>
  );
}

/** `legacy` starts the original KpnIdentity sign-in, so accounts created before the move stay reachable until they are linked (ADR section 4). */
export function OwnSignInScreen({ own, from, ended, legacy }: { own: OwnAuthApi; from: string; ended: boolean; legacy?: () => void }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("reset") === "1" && q.get("code") ? "new-password" : "signin";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const returnTo = safeReturnTo(from);

  // The reset email link brings the person back here with a code: open a short recovery session first.
  useEffect(() => {
    if (mode !== "new-password") return;
    own.recover(window.location.search).catch((e: unknown) => { setError(e instanceof Error ? e.message : "This reset link is not valid."); setMode("forgot"); });
  }, [mode, own]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const provider = (kind: "google" | "discord") => run(kind, () => own.oauth(kind, returnTo));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signin") void run("password", async () => { await own.password(email, password); nav(returnTo, { replace: true }); });
    else if (mode === "signup") {
      if (!adult) { setError("Confirm that you are 13 or older to continue."); return; }
      void run("signup", async () => { const r = await own.signUp(email, password, returnTo); if (r.confirmationNeeded) setMode("check-inbox"); else nav(returnTo, { replace: true }); });
    } else if (mode === "forgot") void run("reset", async () => { await own.reset(email); setMode("reset-sent"); });
    else if (mode === "new-password") void run("new-password", async () => { await own.newPassword(password); nav(returnTo, { replace: true }); });
  };

  const title: Record<Mode, string> = {
    signin: "Welcome back",
    signup: "Create your LunchVoice account",
    forgot: "Reset your password",
    "check-inbox": "Check your inbox",
    "reset-sent": "Check your inbox",
    "new-password": "Choose a new password",
  };

  let body: ReactNode;
  if (mode === "check-inbox" || mode === "reset-sent") {
    body = (
      <>
        <p className="ui-muted lv-signin-sub">
          {mode === "check-inbox" ? "We sent a confirmation link to " : "If that address has an account, we sent a reset link to "}
          <strong>{email}</strong>. Open it on this device to continue.
        </p>
        <Button variant="quiet" size="md" onClick={() => { setMode(mode === "check-inbox" ? "signup" : "forgot"); setError(null); }}>Wrong address? Go back</Button>
      </>
    );
  } else {
    const showProviders = mode === "signin" || mode === "signup";
    const emailOn = own.emailEnabled;
    const missing = (mode !== "new-password" && !email) || (mode !== "forgot" && !password);
    body = (
      <form onSubmit={submit} noValidate className="lv-stack">
        {showProviders && (
          <>
            <Button type="button" variant="secondary" size="lg" block disabled={busy !== null} onClick={() => void provider("google")}>
              <GoogleG /> {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </Button>
            <Button type="button" variant="secondary" size="lg" block disabled={busy !== null} onClick={() => void provider("discord")}>
              <DiscordMark /> {busy === "discord" ? "Opening Discord…" : "Continue with Discord"}
            </Button>
            {emailOn && <p className="ui-help lv-m0" role="separator" aria-label="or">or</p>}
          </>
        )}
        {emailOn && mode !== "new-password" && (
          <Field label="Email" htmlFor="own-email">
            <Input id="own-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
        )}
        {emailOn && mode !== "forgot" && (
          <Field label={mode === "new-password" ? "New password" : "Password"} htmlFor="own-password" help={mode !== "signin" ? `At least ${MIN_PASSWORD} characters.` : undefined}>
            <div className="lv-row">
              <Input id="own-password" type={show ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Button type="button" variant="quiet" size="md" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</Button>
            </div>
          </Field>
        )}
        {emailOn && mode === "signin" && (
          <Button type="button" variant="quiet" size="md" onClick={() => { setMode("forgot"); setError(null); }}>Forgot password?</Button>
        )}
        {emailOn && mode === "signup" && (
          <label className="lv-row">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> <span>I am 13 or older</span>
          </label>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {emailOn && <Button type="submit" variant="ink" size="lg" block disabled={busy !== null || missing}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Save password and sign in"}
        </Button>}
        {emailOn && mode === "signin" && (
          <p className="ui-help lv-m0">
            New to LunchVoice? <Button type="button" variant="quiet" size="md" onClick={() => { setMode("signup"); setError(null); }}>Create an account</Button>
          </p>
        )}
        {(mode === "signup" || mode === "forgot") && (
          <Button type="button" variant="quiet" size="md" onClick={() => { setMode("signin"); setError(null); }}>Back to sign in</Button>
        )}
        <Legal />
      </form>
    );
  }

  return (
    <div className="lv-narrow">
      <Card className="lv-signin">
        <LvMark size={44} />
        <h1 className="lv-signin-title">{title[mode]}</h1>
        {ended && mode === "signin" && (
          <Notice tone="info" title="You were signed out">Your session ended. Sign in again to carry on where you were.</Notice>
        )}
        {mode === "signin" && <p className="ui-muted lv-signin-sub">Sign in to LunchVoice.</p>}
        {body}
        {legacy && mode === "signin" && (
          <p className="ui-help lv-m0">
            Had a LunchVoice account before? <Button type="button" variant="quiet" size="md" onClick={legacy}>Use your existing KpnSolute sign-in</Button>
          </p>
        )}
        <Button asChild variant="quiet" size="md" className="lv-signin-join">
          <Link to="/join">Have a join code? Answer without signing in</Link>
        </Button>
      </Card>
    </div>
  );
}
