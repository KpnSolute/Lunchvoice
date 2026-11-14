// /signin/username: the step every account passes once (spec E11). Choose a unique username (@name) and, optionally, a display
// name. The name from Google or Discord is never used as the display name: leave it empty and the username is shown.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LvMark } from "../components/LvMark";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Card } from "@/components/shadcn/card";
import { Field, Notice } from "@/components/shadcn/blocks";
import { useIdentity } from "../identity/IdentityProvider";
import { safeReturnTo } from "../lib/kpnIdentity";

const REASON: Record<string, string> = {
  length: "A username is 3 to 20 characters.",
  format: "Use lowercase letters, numbers and underscores, starting with a letter.",
  reserved: "That username is not available.",
  taken: "That username is taken.",
  held: "That username is not available right now.",
};

export function Welcome() {
  const { api, session } = useIdentity();
  const nav = useNavigate();
  const location = useLocation();
  const from = safeReturnTo((location.state as { from?: string } | null)?.from);
  const [existing, setExisting] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [display, setDisplay] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    api.handleGet().then((r) => setExisting(r.ok ? r.handle : null)).catch(() => setExisting(null));
  }, [api]);

  // Live availability check, debounced. Only the newest answer counts.
  useEffect(() => {
    const value = handle.trim().toLowerCase();
    if (!value) { setStatus("idle"); setMessage(null); setSuggestions([]); return; }
    setStatus("checking");
    const mine = ++seq.current;
    const timer = window.setTimeout(() => {
      api.handleCheck(value).then((r) => {
        if (mine !== seq.current) return;
        if (!r.ok) { setStatus("idle"); setMessage(r.error.message); return; }
        if (r.available) { setStatus("ok"); setMessage(null); setSuggestions([]); }
        else { setStatus("bad"); setMessage(REASON[r.reason ?? "format"] ?? "That username is not available."); setSuggestions(r.suggestions ?? []); }
      }).catch(() => { if (mine === seq.current) { setStatus("idle"); setMessage("Could not check right now. You can still try to save."); } });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [handle, api]);

  if (!session) return <Navigate to="/signin" replace />;
  if (existing) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = handle.trim().toLowerCase();
    setBusy(true);
    setError(null);
    try {
      const saved = await api.handleSet(value);
      if (!saved.ok) { setError(saved.error.message); return; }
      // Blank means "show my username"; the provider's name is never used.
      const named = await api.profileUpdate(display.trim() || value);
      if (!named.ok) { setError(named.error.message); return; }
      nav(from, { replace: true });
    } catch {
      setError("We could not save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lv-narrow">
      <Card className="lv-signin">
        <LvMark size={44} />
        <h1 className="lv-signin-title">Choose your username</h1>
        <p className="ui-muted lv-signin-sub">This is how people find and mention you on LunchVoice. Your username is unique. Your display name can be anything and you can change it any time.</p>
        <form onSubmit={submit} noValidate className="lv-stack">
          <Field label="Username" htmlFor="welcome-handle" help="3 to 20 characters: lowercase letters, numbers and underscores.">
            <div className="lv-row">
              <span aria-hidden="true">@</span>
              <Input id="welcome-handle" value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20} />
            </div>
          </Field>
          <p className="ui-help lv-m0" role="status" aria-live="polite">
            {status === "checking" ? "Checking…" : status === "ok" ? "Available" : message ?? ""}
          </p>
          {suggestions.length > 0 && (
            <div className="lv-row" aria-label="Suggestions">
              {suggestions.map((s) => (
                <Button key={s} type="button" variant="secondary" size="md" onClick={() => setHandle(s)}>@{s}</Button>
              ))}
            </div>
          )}
          <Field label="Display name (optional)" htmlFor="welcome-display" help="Shown next to your username. Leave empty to show your username.">
            <Input id="welcome-display" value={display} onChange={(e) => setDisplay(e.target.value)} maxLength={80} autoComplete="nickname" />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="ink" size="lg" block disabled={busy || status === "bad" || !handle.trim()}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
