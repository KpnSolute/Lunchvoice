// Account settings > Sign-in methods (spec A8). Google, Discord and email are ways to log in to one account, not separate users.
// Needs the browser's own Auth session, so it works for accounts signed in the new way; a KpnSolute sign-in is told how to switch.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import type { SignInMethod } from "../lib/lvAuth";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Field, Notice, SectionTitle } from "@/components/shadcn/blocks";

const LABEL: Record<string, string> = { google: "Google", discord: "Discord", email: "Email and password" };

export function SignInMethods() {
  const { own, session } = useIdentity();
  const [state, setState] = useState<{ methods: SignInMethod[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(() => {
    if (!own || session?.source !== "own") return;
    own.methods().then(setState).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load your sign-in methods."));
  }, [own, session?.source]);
  useEffect(load, [load]);

  if (!own) return null;
  if (session?.source !== "own") {
    return (
      <Card data-testid="account-signin-methods">
        <SectionTitle>Sign-in methods</SectionTitle>
        <p className="ui-muted lv-m0">You signed in with your KpnSolute sign-in. To add Google, Discord or a password to this account, sign in the new way once and link it to this account when asked.</p>
        <div className="ui-row"><Button variant="secondary" onClick={() => { window.location.assign("/signin?own=1"); }}>Sign in the new way</Button></div>
      </Card>
    );
  }

  const has = (p: string) => state?.methods.some((m) => m.provider === p) ?? false;
  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key);
    setError(null);
    try { await fn(); if (done) toast.success(done); load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work. Try again."); } finally { setBusy(null); }
  };
  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    void run("password", async () => { await own.addPasswordMethod(password); setPassword(""); setShowPassword(false); }, "Password added");
  };
  const only = (state?.total ?? 0) <= 1;

  return (
    <Card data-testid="account-signin-methods">
      <SectionTitle>Sign-in methods</SectionTitle>
      <p className="ui-muted lv-m0">Every method here opens this same account. Add one more so you are never locked out.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="lv-stack-8" aria-label="Your sign-in methods">
        {(state?.methods ?? []).map((m) => (
          <li key={m.identity.identity_id} className="ui-row">
            <span><strong>{LABEL[m.provider] ?? m.provider}</strong>{m.addedAt ? <span className="ui-help"> · added {new Date(m.addedAt).toLocaleDateString()}</span> : null}</span>
            <Button variant="secondary" size="sm" disabled={busy !== null || only} title={only ? "Your only way to sign in" : undefined}
              onClick={() => { if (window.confirm(`Remove ${LABEL[m.provider] ?? m.provider} as a way to sign in?`)) void run(m.provider, () => own.removeMethod(m, state!.total), "Method removed"); }}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="ui-row">
        {!has("google") && <Button variant="secondary" disabled={busy !== null} onClick={() => void run("google", () => own.addMethod("google"))}>Add Google</Button>}
        {!has("discord") && <Button variant="secondary" disabled={busy !== null} onClick={() => void run("discord", () => own.addMethod("discord"))}>Add Discord</Button>}
        {!has("email") && own.emailEnabled && !showPassword && <Button variant="secondary" disabled={busy !== null} onClick={() => setShowPassword(true)}>Add a password</Button>}
      </div>
      {showPassword && (
        <form onSubmit={submitPassword} noValidate className="lv-stack-8">
          <Field label="New password" htmlFor="add-password" help="At least 12 characters. You will sign in with your account email and this password.">
            <Input id="add-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={128} />
          </Field>
          <div className="ui-row">
            <Button type="submit" variant="ink" disabled={busy !== null || !password}>{busy === "password" ? "Saving…" : "Save password"}</Button>
            <Button type="button" variant="quiet" onClick={() => { setShowPassword(false); setPassword(""); }}>Cancel</Button>
          </div>
        </form>
      )}
      <p className="ui-help lv-m0">
        Sign-ins that share an email both services have verified join automatically. A different email joins only when you add it here.
        Your Discord server roles are separate: see <Link to="/settings">the Discord card</Link> below.
      </p>
    </Card>
  );
}
