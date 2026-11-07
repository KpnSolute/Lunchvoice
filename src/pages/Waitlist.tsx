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
import { Textarea } from "@/components/shadcn/textarea";
import { Progress } from "@/components/shadcn/progress";
import { Badge } from "@/components/shadcn/badge";
import { Eyebrow, Field, LoadingRows, Notice } from "@/components/shadcn/blocks";

/**
 * /waitlist: the founder's launch gate (LAUNCH_PLAN founder direction 3, L-01..L-03, L-12).
 * Joining needs sign-in; the seat is bound to the verified (issuer, subject). The first 50 are admitted with a
 * Founding entitlement (one Starter Hub credit, free until billing launches + 30 days); later joiners are waitlisted.
 */
export function Waitlist() {
  const { api, session } = useIdentity();
  const status = useLv(() => api.waitlistStatus(), [api]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = status.data;
  const left = s ? Math.max(0, s.seats_total - s.seats_taken) : null;
  const me = s?.me;

  async function join() {
    setBusy(true);
    setError(null);
    const r = await api.waitlistJoin(email.trim() || null, note.trim() || null);
    setBusy(false);
    if (!r.ok) return setError(describeError(r.error));
    toast.success(r.status === "admitted" ? "You're in. Your Founding seat is ready." : "You're on the waitlist.");
    status.reload();
  }

  return (
    <div className="lv-mk">
      <div className="lv-mk-head">
        <Eyebrow accent>Founding waitlist</Eyebrow>
        <h1>50 free Founding seats. Then everyone else.</h1>
        <p>
          LunchVoice opens to its first creators through this waitlist. It is a launch tool, not a permission: everyone can buy a plan once billing opens. The first 50 people who sign in and join get a
          Founding seat: one Starter Hub, free until paid billing launches and for 30 more days after that.
        </p>
      </div>

      <div className="lv-wl">
        <Card variant="ink" aria-live="polite">
          <Eyebrow>Seats</Eyebrow>
          {status.loading && !s ? (
            <LoadingRows rows={2} label="Checking seats" />
          ) : status.error ? (
            <Notice tone="error">{describeError(status.error)}</Notice>
          ) : s ? (
            <>
              <p className="lv-wl-big">{left} <span className="ui-muted-inv">of {s.seats_total} left</span></p>
              <Progress value={(s.seats_taken / s.seats_total) * 100} aria-label={`${s.seats_taken} of ${s.seats_total} seats taken`} />
              <p className="lv-wl-small">{s.open ? `${s.seats_taken} creators have joined so far.` : "All 50 seats are taken. New joiners go on the waitlist."}</p>
            </>
          ) : null}
        </Card>

        <Card>
          {!session ? (
            <div className="lv-wl-result">
              <h2 className="lv-mk-card-title">Sign in, then join</h2>
              <p className="lv-mk-card-body">Joining needs a LunchVoice sign-in so your seat belongs to you. It takes one step with Google.</p>
              <Button asChild variant="primary" size="lg"><Link to="/signin" state={{ from: "/waitlist" }}>Sign in to join</Link></Button>
            </div>
          ) : status.loading && !s ? (
            <LoadingRows rows={3} />
          ) : me?.status === "admitted" ? (
            <div className="lv-wl-result">
              <Badge variant="ok">Admitted · seat {me.position}</Badge>
              <h2 className="lv-wl-big">You’re in.</h2>
              <p className="lv-mk-card-body">
                Your Founding seat includes one Starter Hub credit. Starter features are free until billing launches, then
                for 30 more days. After that, premium actions lock until you choose a plan. Your data is always kept.
              </p>
              <div className="ui-row">
                <Button asChild variant="primary" size="lg"><Link to="/create">Create your Hub</Link></Button>
                <Button asChild variant="secondary" size="lg"><Link to="/me">Go to my home</Link></Button>
              </div>
            </div>
          ) : me?.status === "waitlisted" ? (
            <div className="lv-wl-result">
              <Badge>Waitlisted · position {me.position}</Badge>
              <h2 className="lv-wl-big">You’re on the waitlist.</h2>
              <p className="lv-mk-card-body">
                The 50 Founding seats are taken. When billing launches, anyone can buy a Hub. Until then you can make free
                Quick Surveys and join Hubs you’re invited to.
              </p>
              <Button asChild variant="primary" size="lg"><Link to="/surveys/new">Start a Quick Survey</Link></Button>
            </div>
          ) : (
            <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void join(); }}>
              <h2 className="lv-mk-card-title">Join as {session.name}</h2>
              <Field
                label="Contact email (optional)"
                htmlFor="wl-email"
                help={<>Used only for launch and account updates. Deleted when you delete your account. <Link to="/privacy" className="lv-inline-link">Privacy</Link></>}
              >
                <Input id="wl-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-describedby="wl-email-help" />
              </Field>
              <Field label="What will you ask your community? (optional)" htmlFor="wl-note" counter={{ value: note.length, max: 280 }}>
                <Textarea id="wl-note" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="Our running club wants a say in the weekend routes." />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                {busy ? "Joining…" : s && !s.open ? "Join the waitlist" : "Join the waitlist"}
              </Button>
            </form>
          )}
        </Card>
      </div>

      <section className="lv-mk-grid" aria-label="How the waitlist works">
        <Card>
          <span className="lv-mk-icon"><Icon name="lock" size={22} /></span>
          <h2 className="lv-mk-card-title">Your seat is yours</h2>
          <p className="lv-mk-card-body">A seat is tied to your verified sign-in, not to an email address. Joining twice keeps the seat you already have.</p>
        </Card>
        <Card>
          <span className="lv-mk-icon"><Icon name="coin" size={22} /></span>
          <h2 className="lv-mk-card-title">Free until billing, plus 30 days</h2>
          <p className="lv-mk-card-body">Nothing here charges money. When paid plans launch, Founding seats stay free for 30 more days, then premium actions lock. Nothing is deleted.</p>
        </Card>
        <Card>
          <span className="lv-mk-icon"><Icon name="survey" size={22} /></span>
          <h2 className="lv-mk-card-title">No seat? Ask anyway</h2>
          <p className="lv-mk-card-body">Quick Surveys are free for everyone who signs in: up to 5 active surveys of up to 10 questions each.</p>
        </Card>
      </section>
    </div>
  );
}
