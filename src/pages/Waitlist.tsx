import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import { Icon } from "../components/Icon";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Progress } from "@/components/shadcn/progress";
import { Badge } from "@/components/shadcn/badge";
import { Eyebrow, Field, LoadingRows, Notice } from "@/components/shadcn/blocks";

/** Version of the contact-email consent text below. Sent as p_consent_version when an email is given. */
export const WAITLIST_CONSENT_VERSION = "2026-11-07";

/**
 * /waitlist: the founder's launch tool (LAUNCH_PLAN founder direction 3; final decisions). It is never authorization:
 * joining needs sign-in, the seat is bound to the verified (issuer, subject), and the first 50 admitted people receive a
 * Founding Hub credit (Starter family, free until paid billing launches and 30 days after). Later joiners wait.
 */
export function Waitlist() {
  const { api, session } = useIdentity();
  const status = useLv(() => api.waitlistStatus(), [api]);
  const [email, setEmail] = useState("");
  const [hubName, setHubName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = status.data;
  const left = s ? Math.max(0, s.seats_total - s.seats_taken) : null;
  const me = s?.me;
  const needsConsent = email.trim().length > 0;

  async function join() {
    if (needsConsent && !consent) return setError("Tick the box to let us store your contact email, or leave the email empty.");
    setBusy(true);
    setError(null);
    const r = await api.waitlistJoin(email.trim() || null, hubName.trim() || null, needsConsent ? WAITLIST_CONSENT_VERSION : null);
    setBusy(false);
    if (!r.ok) return setError(describeError(r.error));
    toast.success(r.status === "admitted" ? "You’re admitted. Your Founding Hub credit is ready." : "You’re on the waitlist.");
    status.reload();
  }

  return (
    <div className="lv-mk">
      <div className="lv-mk-head">
        <Eyebrow accent>Founding seats</Eyebrow>
        <h1>Join the LunchVoice waitlist.</h1>
        <p>
          LunchVoice opens in stages. The first 50 people admitted from the waitlist receive a Founding Hub credit: one
          Starter Hub, free until paid billing launches and for 30 days after. Everyone else waits for billing to open,
          when anyone can buy a plan.
        </p>
      </div>

      <div className="lv-wl">
        <Card variant="ink" aria-live="polite">
          <Eyebrow>Founding seats</Eyebrow>
          {status.loading && !s ? (
            <LoadingRows rows={2} label="Checking seats" />
          ) : status.error ? (
            <Notice tone="error">{describeError(status.error)}</Notice>
          ) : s ? (
            <>
              <p className="lv-wl-big">{left} <span className="ui-muted-inv">of {s.seats_total} left</span></p>
              <Progress value={(s.seats_taken / s.seats_total) * 100} aria-label={`${s.seats_taken} of ${s.seats_total} seats taken`} />
              <p className="lv-wl-small">{s.open ? `${s.seats_taken} people have joined so far.` : "All Founding seats are taken. New joiners wait for billing to open."}</p>
            </>
          ) : null}
        </Card>

        <Card>
          {!session ? (
            <div className="lv-wl-result">
              <h2 className="lv-mk-card-title">Sign in, then join</h2>
              <p className="lv-mk-card-body">Joining needs a LunchVoice sign-in so your place belongs to you. It takes one step with Google.</p>
              <Button asChild variant="primary" size="lg"><Link to="/signin" state={{ from: "/waitlist" }}>Sign in to join</Link></Button>
            </div>
          ) : status.loading && !s ? (
            <LoadingRows rows={3} />
          ) : me?.status === "admitted" ? (
            <div className="lv-wl-result">
              <Badge variant="ok">Admitted · seat {me.position}</Badge>
              <h2 className="lv-wl-big">You’re admitted.</h2>
              <p className="lv-mk-card-body">
                You received a Founding Hub credit. Starter features are free until billing launches, then for 30 more days.
                After that, premium actions lock until you choose a plan. Your data is always kept.
              </p>
              <div className="ui-row">
                <Button asChild variant="primary" size="lg"><Link to="/create">Create your Hub</Link></Button>
                <Button asChild variant="secondary" size="lg"><Link to="/me">Go to my home</Link></Button>
              </div>
            </div>
          ) : me?.status === "waitlisted" ? (
            <div className="lv-wl-result">
              <Badge>Waiting · position {me.position}</Badge>
              <h2 className="lv-wl-big">You’re on the waitlist.</h2>
              <p className="lv-mk-card-body">
                The Founding seats are taken. When billing opens, anyone can buy a Hub. Until then you can make free Quick
                Surveys and join Hubs you’re invited to.
              </p>
              <Button asChild variant="primary" size="lg"><Link to="/surveys/new">Start a Quick Survey</Link></Button>
            </div>
          ) : (
            <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void join(); }}>
              <h2 className="lv-mk-card-title">Join as {session.name}</h2>
              <Field label="Hub name you have in mind (optional)" htmlFor="wl-hub" counter={{ value: hubName.length, max: 60 }}>
                <Input id="wl-hub" value={hubName} maxLength={60} onChange={(e) => setHubName(e.target.value)} placeholder="Northside Running Club" />
              </Field>
              <Field label="Contact email (optional)" htmlFor="wl-email" help="Used only for launch and account updates. Deleted when you delete your account.">
                <Input id="wl-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-describedby="wl-email-help" />
              </Field>
              {needsConsent && (
                <label className="lv-check-row lv-consent">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-describedby="wl-consent-note" />
                  <span>
                    You may store this email to send me launch and account updates.{" "}
                    <Link to="/privacy" className="lv-inline-link">How we handle it</Link>
                  </span>
                </label>
              )}
              <p id="wl-consent-note" className="ui-help lv-m0">No email? No consent needed: you can still join. <Link to="/privacy" className="lv-inline-link">Privacy</Link></p>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" variant="primary" size="lg" disabled={busy || (needsConsent && !consent)}>
                {busy ? "Joining…" : "Join the waitlist"}
              </Button>
            </form>
          )}
        </Card>
      </div>

      <section className="lv-mk-grid" aria-label="How the waitlist works">
        <Card>
          <span className="lv-mk-icon"><Icon name="lock" size={22} /></span>
          <h2 className="lv-mk-card-title">Your place is yours</h2>
          <p className="lv-mk-card-body">A place is tied to your verified sign-in, not to an email address. Joining twice keeps the place you already have.</p>
        </Card>
        <Card>
          <span className="lv-mk-icon"><Icon name="coin" size={22} /></span>
          <h2 className="lv-mk-card-title">Free until billing, plus 30 days</h2>
          <p className="lv-mk-card-body">Nothing here charges money. When paid plans launch, Founding Hub credits stay free for 30 more days, then premium actions lock. Nothing is deleted.</p>
        </Card>
        <Card>
          <span className="lv-mk-icon"><Icon name="survey" size={22} /></span>
          <h2 className="lv-mk-card-title">Ask something today</h2>
          <p className="lv-mk-card-body">Quick Surveys are free for everyone who signs in: up to 5 active surveys of up to 10 questions each.</p>
        </Card>
      </section>
    </div>
  );
}
