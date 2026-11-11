import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { slugProblem } from "../lib/reservedSlugs";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { Entitlement, MyContext, ReservationStatus } from "../lib/lvApi";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton } from "../components/ui";
import { ThemeControl } from "../ui/ThemeControl";
import { HubMark } from "../ui/HubMark";
import { Button } from "@/components/shadcn/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Separator } from "@/components/shadcn/separator";
import { AccountDiscord } from "./Integrations"; // track D: api + discord
import {
  EmptyState,
  Eyebrow,
  Field,
  LoadingRows,
  Notice,
  PageHeader,
  PhaseBadge,
  QuotaMeter,
  RowItem,
  RowList,
  SectionTitle,
  StatTile,
  TypedConfirm,
} from "@/components/shadcn/blocks";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null);

/** Plain-language state of the Founding / plan entitlement. Display only. */
export function entitlementLine(e: Entitlement | undefined): { tone: "ok" | "neutral" | "danger"; label: string; body: string } {
  if (!e) return { tone: "neutral", label: "No plan", body: "Quick Surveys are free. A Hub needs a Hub credit: admitted waitlist members receive one, and anyone can buy a plan once billing opens." };
  if (e.state === "expired") return { tone: "danger", label: "Expired", body: "Premium actions are locked. Your Hubs, Campaigns and results are all kept." };
  if (e.source === "waitlist")
    return {
      tone: "ok",
      label: "Founding · Starter",
      body: e.ends_at ? `Free Starter features until ${fmtDate(e.ends_at)}.` : "Free Starter features until paid billing launches, then for 30 more days.",
    };
  return { tone: "ok", label: `${e.family === "team" ? "Team" : "Starter"} plan`, body: e.ends_at ? `Active until ${fmtDate(e.ends_at)}.` : "Active." };
}

/* ------------------------------------------------------------------ /me */

export function Me() {
  const { session, api } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);
  const surveys = useLv(() => api.quickSurveyList(), [api]);
  const c = ctx.data;
  const name = c?.display_name || session?.name || "";
  const first = name.split(/\s+/)[0] || "there";

  return (
    <div className="ui-page">
      <PageHeader eyebrow="My home" title={`Hey ${first}.`} sub="Your Hubs, your Quick Surveys and everything waiting on you." />
      {ctx.error && <Notice tone="error">{describeError(ctx.error)}</Notice>}
      {ctx.loading && !c && <LoadingRows rows={4} />}
      {c && (
        <div className="lv-dash">
          <div className="lv-stack">
            <div className="lv-tiles">
              <StatTile tone="ink" label="Hubs" value={c.hubs.length} note={c.hubs.length ? "Communities you belong to" : "None yet"} />
              <StatTile tone="accent" label="Hub credits" value={c.hub_credits} note={c.hub_credits ? "Ready to create a Hub" : "Founding seat or a plan"} />
              <StatTile
                label="Quick Surveys"
                value={`${c.quick_surveys.active}/${c.quick_surveys.limit ?? "–"}`}
                note="Active right now"
              />
            </div>

            <OwnerOffers c={c} onChanged={ctx.reload} />
            <NextStep c={c} />

            <Card>
              <SectionTitle action={<LinkButton to="/surveys/new" variant="ink" size="sm" icon="plus">New Quick Survey</LinkButton>}>Quick Surveys</SectionTitle>
              {surveys.loading && !surveys.data ? (
                <LoadingRows rows={2} />
              ) : (surveys.data?.surveys.length ?? 0) === 0 ? (
                <EmptyState icon={<Icon name="survey" size={22} />} title="Ask your first question">
                  Free for everyone: up to {c.quick_surveys.limit ?? 5} active surveys with up to {c.quick_surveys.question_limit ?? 10} questions each. No Hub needed.
                </EmptyState>
              ) : (
                <>
                  <RowList>
                    {surveys.data!.surveys.slice(0, 5).map((s) => (
                      <RowItem
                        key={s.campaign_id}
                        asChild={<Link to={`/surveys/${s.campaign_id}`} />}
                        title={s.title}
                        sub={`${s.access === "invite" ? "Invite only" : "Anyone with the link"} · ${s.question_count} ${s.question_count === 1 ? "question" : "questions"}`}
                        trailing={<PhaseBadge phase={campaignPhase(s)} />}
                      />
                    ))}
                  </RowList>
                  <LinkButton to="/surveys" variant="quiet" size="sm" icon="arrow">All Quick Surveys</LinkButton>
                </>
              )}
            </Card>

            {c.recent_participation && (
              <Card>
                <SectionTitle>Recently answered</SectionTitle>
                {c.recent_participation.length === 0 ? (
                  <p className="ui-muted lv-m0">Surveys you answer while signed in show up here. Only you can see this list.</p>
                ) : (
                  <RowList>
                    {c.recent_participation.slice(0, 5).map((p) => (
                      <RowItem key={p.campaign_id} title={p.title} sub={p.hub_name ?? "Quick Survey"} trailing={<Badge variant="ok">Answered</Badge>} />
                    ))}
                  </RowList>
                )}
              </Card>
            )}
          </div>

          <aside className="lv-rail" aria-label="My Hubs and status">
            <PlanCard c={c} />
            <Card>
              <SectionTitle>My Hubs</SectionTitle>
              {c.hubs.length === 0 ? (
                <p className="ui-muted lv-m0">A Hub is your community’s home: its Campaigns, its members and its results.</p>
              ) : (
                <RowList>
                  {c.hubs.map((h) => (
                    <RowItem
                      key={h.hub_id}
                      asChild={<Link to={`/${h.slug}`} />}
                      leading={<HubMark name={h.name} size={36} />}
                      title={h.name}
                      sub={`lunchvoice.com/${h.slug}`}
                      trailing={h.is_owner ? <Badge variant="ink">Owner</Badge> : undefined}
                    />
                  ))}
                </RowList>
              )}
            </Card>
            <Card variant="dashed">
              <CardHeader>
                <CardTitle>Got a code?</CardTitle>
                <CardDescription>A Hub invite or a six-character survey code.</CardDescription>
              </CardHeader>
              <LinkButton to="/join" variant="ink" icon="arrow">Enter a code</LinkButton>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function NextStep({ c }: { c: MyContext }) {
  if (c.hub_credits > 0)
    return (
      <Card variant="ink" className="lv-resume-card">
        <div>
          <Eyebrow accent>Your Hub credit is ready</Eyebrow>
          <h2 className="lv-resume-title">Create your Hub</h2>
          <p className="lv-m0 lv-dim">Pick a name and an address. You become its Owner.</p>
        </div>
        <LinkButton to="/create" variant="primary" size="lg">Create your Hub</LinkButton>
      </Card>
    );
  const lead = c.hubs[0];
  if (lead)
    return (
      <Card variant="ink" className="lv-resume-card">
        <div>
          <Eyebrow accent>Pick up where you left off</Eyebrow>
          <h2 className="lv-resume-title">{lead.name}</h2>
          <p className="lv-m0 lv-dim">lunchvoice.com/{lead.slug}</p>
        </div>
        <LinkButton to={`/${lead.slug}`} variant="primary" size="lg">Open Hub</LinkButton>
      </Card>
    );
  if (c.waitlist.status === "none")
    return (
      <Card variant="ink" className="lv-resume-card">
        <div>
          <Eyebrow accent>Founding seats</Eyebrow>
          <h2 className="lv-resume-title">Want a Hub? Join the waitlist.</h2>
          <p className="lv-m0 lv-dim">The first 50 admitted receive a Founding Hub credit: a Starter Hub free until billing launches, plus 30 days.</p>
        </div>
        <LinkButton to="/waitlist" variant="primary" size="lg">Join the waitlist</LinkButton>
      </Card>
    );
  return (
    <Card variant="ink" className="lv-resume-card">
      <div>
        <Eyebrow accent>Waitlisted</Eyebrow>
        <h2 className="lv-resume-title">Ask a question today</h2>
        <p className="lv-m0 lv-dim">Hubs open to everyone when billing launches. Quick Surveys are free now.</p>
      </div>
      <LinkButton to="/surveys/new" variant="primary" size="lg">Start a Quick Survey</LinkButton>
    </Card>
  );
}

function PlanCard({ c }: { c: MyContext }) {
  const founding = c.entitlements.find((e) => e.source === "waitlist" && e.scope === "account") ?? c.entitlements[0];
  const line = entitlementLine(founding);
  const wl = c.waitlist.status;
  return (
    <Card>
      <SectionTitle>Plan and waitlist</SectionTitle>
      <div className="ui-row">
        <Badge variant={wl === "admitted" ? "ok" : wl === "waitlisted" ? "neutral" : "outline"}>
          {wl === "admitted" ? `Founding seat ${c.waitlist.position ?? ""}` : wl === "waitlisted" ? `Waitlist position ${c.waitlist.position ?? ""}` : "Not on the waitlist"}
        </Badge>
        <Badge variant={line.tone}>{line.label}</Badge>
      </div>
      <p className="ui-muted lv-m0">{line.body}</p>
      <QuotaMeter label="Active Quick Surveys" used={c.quick_surveys.active} limit={c.quick_surveys.limit} />
      {wl === "none" && <LinkButton to="/waitlist" variant="secondary" size="sm">Join the waitlist</LinkButton>}
    </Card>
  );
}

/* ------------------------------------------------------------------ /create */

type Step = 0 | 1 | 2;

export function CreateHub() {
  const { api } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [avail, setAvail] = useState<ReservationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = slug ? slugProblem(slug) : null;
  const credits = ctx.data?.hub_credits ?? 0;

  // Suggest an address from the name until the person edits it.
  useEffect(() => {
    if (touched) return;
    setSlug(name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40));
  }, [name, touched]);

  // Live availability (also covers reserved addresses held by someone else).
  useEffect(() => {
    setAvail(null);
    if (!slug || problem) return;
    const t = window.setTimeout(async () => {
      const r = await api.reservationStatus(slug);
      if (r.ok) setAvail(r);
    }, 300);
    return () => window.clearTimeout(t);
  }, [api, slug, problem]);

  // A reserved address (ACTIVE or GRACE) is claimable only by its holder; RELEASED is free again.
  const taken = Boolean(avail && (avail.state === "taken" || ((avail.state === "active" || avail.state === "grace") && !avail.mine)));
  const slugHelp =
    problem === "reserved" ? "That address is reserved for the platform."
    : problem === "format" ? "3 to 40 characters: lowercase letters, numbers and single hyphens."
    : taken ? "That address is taken."
    : avail ? "Available." : "lunchvoice.com/ followed by this address.";

  async function create() {
    setBusy(true);
    setError(null);
    const r = await api.hubCreate(slug, name.trim());
    setBusy(false);
    if (r.ok) {
      toast.success(`${name.trim()} is live at lunchvoice.com/${r.slug}`);
      nav(`/${r.slug}`);
      return;
    }
    setError(describeError(r.error));
  }

  return (
    <div className="ui-page lv-narrow-page">
      <PageHeader eyebrow="New Hub" title="Create your Hub" sub="One address, one community. You become the Owner and can’t be removed from it." actions={<LinkButton to="/me" variant="quiet">Cancel</LinkButton>} />
      {ctx.loading && !ctx.data && <LoadingRows rows={1} />}
      {ctx.data && credits === 0 && (
        <Notice tone="warn" title="You don’t have a Hub credit">
          Admitted people on the <Link to="/waitlist" className="lv-inline-link">waitlist</Link> receive a Founding Hub credit; anyone can buy a plan once billing opens. You can make <Link to="/surveys/new" className="lv-inline-link">free Quick Surveys</Link> today.
        </Notice>
      )}

      <ol className="lv-stepper" aria-label="Steps">
        {["Name", "Address", "Review"].map((label, i) => (
          <li key={label} data-state={i < step ? "done" : i === step ? "current" : "todo"} aria-current={i === step ? "step" : undefined}>
            <span>{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 && (
          <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep(1); }}>
            <Field label="Hub name" htmlFor="hub-name" help="What members will see. You can change it later." counter={{ value: name.length, max: 60 }}>
              <Input id="hub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northside Running Club" maxLength={60} autoFocus />
            </Field>
            <div className="ui-row"><Button type="submit" variant="ink" disabled={!name.trim()}>Next <Icon name="arrow" size={16} /></Button></div>
          </form>
        )}
        {step === 1 && (
          <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); if (!problem && !taken && slug) setStep(2); }}>
            <Field label="Address" htmlFor="hub-slug" help={slugHelp} error={problem || taken ? slugHelp : undefined}>
              <div className="lv-slug">
                <span className="ui-mono">lunchvoice.com/</span>
                <Input id="hub-slug" value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} aria-invalid={Boolean(problem || taken)} aria-describedby="hub-slug-help" autoFocus />
              </div>
            </Field>
            <p className="ui-help lv-m0">The address is a name, not an identity: links and permissions always use the Hub’s permanent id.</p>
            <div className="ui-row">
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              <Button type="submit" variant="ink" disabled={!slug || Boolean(problem) || Boolean(taken)}>Next <Icon name="arrow" size={16} /></Button>
            </div>
          </form>
        )}
        {step === 2 && (
          <div className="lv-stack-16">
            <div className="lv-review-hub">
              <HubMark name={name} size={56} />
              <div>
                <strong className="lv-review-name">{name}</strong>
                <span className="ui-mono ui-muted">lunchvoice.com/{slug}</span>
              </div>
            </div>
            <Separator />
            <ul className="lv-checklist">
              <li><Icon name="check" size={16} />Uses one Hub credit ({credits} available)</li>
              <li><Icon name="check" size={16} />Starter features: 3 custom roles, 3 custom pages, 15 active Campaigns</li>
              <li><Icon name="check" size={16} />Starts invite only and public; change both in settings</li>
              <li><Icon name="check" size={16} />You’re the Owner, and the Owner never uses a role slot</li>
            </ul>
            {error && <Notice tone="error">{error}</Notice>}
            <p className="ui-muted lv-small lv-m0">By creating a Hub you agree to the <Link to="/guidelines">Community Guidelines</Link>.</p>
            <div className="ui-row">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" size="lg" disabled={busy || credits === 0} onClick={create}>{busy ? "Creating…" : "Create Hub"}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ /join and /j/:code */

export function Join() {
  const [code, setCode] = useState("");
  const nav = useNavigate();
  const clean = code.trim().toUpperCase();
  const isSurvey = /^[A-Z0-9]{6}$/.test(clean);
  return (
    <div className="ui-page lv-narrow-page">
      <PageHeader eyebrow="Join" title="Enter a code" sub="A six-character survey code opens the survey. A Hub invite code (like ABCD-2345) opens the invitation." />
      <Card>
        <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); if (clean) nav(isSurvey ? `/c/${clean}` : `/j/${encodeURIComponent(clean)}`); }}>
          <Field label="Code" htmlFor="invite-code" help={clean ? (isSurvey ? "Opens a survey. No account needed for public surveys." : "Opens a Hub invitation.") : undefined}>
            <Input id="invite-code" className="lv-code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="482913 or ABCD-2345" inputMode="text" autoComplete="off" autoCapitalize="characters" autoCorrect="off" enterKeyHint="go" spellCheck={false} aria-describedby="invite-code-help" />
          </Field>
          <div className="ui-row"><Button type="submit" variant="primary" disabled={!clean}>Continue <Icon name="arrow" size={16} /></Button></div>
        </form>
      </Card>
    </div>
  );
}

export function RedeemInvite() {
  const { code = "" } = useParams();
  const { api, session } = useIdentity();
  const nav = useNavigate();
  // The preview needs a signed-in person (it limits code guessing), so a signed-out visitor gets an explanation instead.
  const preview = useLv(
    () => (session ? api.invitePreview(code) : Promise.resolve({ ok: false as const, error: { code: "lv_unauthenticated" as const, message: "" } })),
    [api, code, session?.name],
  );
  // The Hub's own public face (colour, description, size), when the Hub shows it to a non-member.
  const slug = preview.data?.hub.slug ?? null;
  const face = useLv(() => (slug ? api.hubGet(slug) : Promise.resolve({ ok: false as const, error: { code: "lv_not_found" as const, message: "" } })), [api, slug]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function redeem() {
    setBusy(true);
    const r = await api.inviteRedeem(code);
    setBusy(false);
    if (r.ok) { toast.success("You’re in. Welcome."); nav(`/${preview.data?.hub.slug ?? ""}`); }
    else setError(describeError(r.error));
  }

  const shownCode = code.trim().toUpperCase();

  // Signed out: say what this is and what happens, then sign in and come straight back.
  if (!session) {
    return (
      <div className="ui-page lv-narrow-page lv-invite" data-testid="invite-signed-out">
        <PageHeader eyebrow="Invitation" title="You’ve been invited to a Hub" sub="Someone wants you in their community on LunchVoice." />
        <Card className="lv-invite-card">
          <ol className="lv-invite-steps">
            <li><span className="lv-step-n">1</span><div><strong>Sign in</strong><p>Use your KpnSolute account (Google works). It’s free.</p></div></li>
            <li><span className="lv-step-n">2</span><div><strong>See which Hub it is</strong><p>You’ll see the Hub before you accept anything.</p></div></li>
            <li><span className="lv-step-n">3</span><div><strong>Join</strong><p>Accepting makes you a member. You can leave any time.</p></div></li>
          </ol>
          {shownCode && <p className="lv-invite-code ui-mono">Invite code {shownCode}</p>}
          <LinkButton to="/signin" state={{ from: `/j/${code}` }} variant="primary" size="lg" icon="arrow">Continue with KpnSolute</LinkButton>
          <p className="ui-help lv-m0">Didn’t expect this? Close the page; nothing happens unless you accept.</p>
        </Card>
      </div>
    );
  }

  if (preview.loading && !preview.data) {
    return <div className="ui-page lv-narrow-page"><LoadingRows rows={3} label="Opening your invitation" /></div>;
  }

  if (preview.error || !preview.data) {
    return (
      <div className="ui-page lv-narrow-page lv-invite" data-testid="invite-invalid">
        <PageHeader eyebrow="Invitation" title="This invitation can’t be used" sub="It may have expired, been used up, or been withdrawn." />
        <Card className="lv-invite-card">
          <p className="lv-m0">Ask whoever invited you to send a new one. Codes look like <span className="ui-mono">ABCD-2345</span>.</p>
          {preview.error && <p className="ui-help lv-m0">{describeError(preview.error)}</p>}
          <div className="ui-row">
            <LinkButton to="/join" variant="primary">Enter a different code</LinkButton>
            <LinkButton to="/me" variant="quiet">Go to my home</LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  const hub = preview.data.hub;
  const info = face.data?.hub;
  const hex = info?.accent_hex ?? null;
  return (
    <div className="ui-page lv-narrow-page lv-invite" data-testid="invite">
      <PageHeader eyebrow="Invitation" title="You’re invited" />
      {error && <Notice tone="error">{error}</Notice>}
      <Card className="lv-invite-card" style={hex ? ({ "--invite-accent": hex } as React.CSSProperties) : undefined}>
        {hex && <div className="lv-invite-band" aria-hidden="true" />}
        <div className="lv-invite-head">
          <HubMark name={hub.name} size={72} />
          <div>
            <span className="lv-eyebrow-mono">Join this Hub</span>
            <h2 className="lv-invite-name">{hub.name}</h2>
            <span className="ui-mono ui-muted">lunchvoice.com/{hub.slug}</span>
          </div>
        </div>
        {info?.about && <p className="lv-invite-about">{info.about}</p>}
        {info && (
          <div className="ui-row">
            <Badge variant="outline">{info.visibility === "public" ? "Public Hub" : "Private Hub"}</Badge>
            {info.member_count > 0 && <Badge variant="outline">{info.member_count} {info.member_count === 1 ? "member" : "members"}</Badge>}
          </div>
        )}
        {preview.data.already_member ? (
          <>
            <Notice tone="ok">You’re already a member of this Hub.</Notice>
            <LinkButton to={`/${hub.slug}`} variant="primary">Open the Hub</LinkButton>
          </>
        ) : (
          <>
            <ul className="lv-invite-points">
              <li><Icon name="check" size={18} />You become a member of {hub.name}.</li>
              <li><Icon name="check" size={18} />You can answer its surveys and polls.</li>
              <li><Icon name="check" size={18} />Its owners can see your display name in the member list.</li>
              <li><Icon name="check" size={18} />You can leave any time from the Hub.</li>
            </ul>
            <div className="ui-row">
              <Button variant="primary" size="lg" onClick={redeem} disabled={busy} data-testid="invite-join">{busy ? "Joining…" : `Join ${hub.name}`}</Button>
              <LinkButton to="/me" variant="quiet">Not now</LinkButton>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ /settings (account) */

// Founder decision: what account deletion does (also summarised on /privacy).
export const DELETE_COPY =
  "We delete your profile, sign-in links, memberships and invitations. Your multiple-choice and rating answers stay only as anonymous totals, and the written answers you gave on identified surveys are deleted. Answers you gave on anonymous surveys were never linked to you, so they can’t be found and stay only in those results.";

export function Settings() {
  const { api, session, signOut } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);
  const nav = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const current = name ?? ctx.data?.display_name ?? session?.name ?? "";
  const owned = ctx.data?.hubs.filter((h) => h.is_owner) ?? [];

  async function saveName() {
    setSaving(true);
    const r = await api.profileUpdate(current.trim());
    setSaving(false);
    if (r.ok) {
      toast.success("Name saved");
      ctx.reload();
    } else toast.error(describeError(r.error));
  }

  async function deleteAccount(typed: string) {
    setDeleting(true);
    setDelError(null);
    const r = await api.accountDelete(typed);
    setDeleting(false);
    if (!r.ok) {
      setDelError(r.error.code === "lv_owner_protected" ? "You still own a Hub. Transfer ownership or delete the Hub first, then try again." : describeError(r.error));
      return false;
    }
    signOut();
    nav("/");
    toast.success("Your account was deleted.");
    return true;
  }

  return (
    <div className="ui-page lv-narrow-page">
      <PageHeader eyebrow="Account" title="Settings" sub="Your profile, how LunchVoice looks on this device, and your account." />
      <div className="lv-stack-16">
        <Card>
          <SectionTitle>Profile</SectionTitle>
          <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
            <Field label="Display name" htmlFor="display-name" help="Shown to Hub managers on identified Campaigns and member lists. Never on anonymous answers." counter={{ value: current.length, max: 60 }}>
              <Input id="display-name" value={current} maxLength={60} onChange={(e) => setName(e.target.value)} aria-describedby="display-name-help" />
            </Field>
            <div className="ui-row"><Button type="submit" variant="ink" disabled={saving || !current.trim()}>{saving ? "Saving…" : "Save name"}</Button></div>
          </form>
          <p className="ui-help lv-m0">You sign in through KpnIdentity. LunchVoice keeps your verified sign-in, never your email as an identity key.</p>
        </Card>

        {/* ---- track D: api + discord ---- */}
        <AccountDiscord />

        <Card>
          <SectionTitle>Appearance</SectionTitle>
          <p className="ui-muted lv-m0">Saved on this device. System follows your device setting.</p>
          <ThemeControl />
        </Card>

        <Card>
          <SectionTitle>Session</SectionTitle>
          <div className="ui-row">
            <Button variant="secondary" onClick={() => { signOut(); nav("/"); }}><Icon name="logout" size={16} />Sign out</Button>
          </div>
        </Card>

        <Card>
          <SectionTitle>Delete account</SectionTitle>
          <p className="ui-muted lv-m0">
            {DELETE_COPY} Your Quick Surveys, your waitlist seat and any waitlist contact email go too.
          </p>
          {owned.length > 0 && (
            <Notice tone="warn">You own {owned.map((h) => h.name).join(", ")}. Transfer ownership or delete {owned.length === 1 ? "that Hub" : "those Hubs"} first.</Notice>
          )}
          <div className="ui-row">
            <TypedConfirm
              trigger={<Button variant="danger">Delete account</Button>}
              title="Delete your account?"
              description={`This can’t be undone. ${DELETE_COPY}`}
              phrase="DELETE"
              actionLabel="Delete account"
              busy={deleting}
              error={delError}
              onConfirm={deleteAccount}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---- track A: hardening ---- */

/** Ownership offers addressed to me (000018): nothing changes until I accept. */
function OwnerOffers({ c, onChanged }: { c: MyContext; onChanged: () => void }) {
  const { api } = useIdentity();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const offers = c.owner_transfer_offers ?? [];
  if (!offers.length) return null;
  return (
    <>
      {offers.map((o) => (
        <Card key={o.offer_id} data-testid="owner-offer-incoming">
          <SectionTitle>Become the Owner of {o.hub_name}?</SectionTitle>
          <p className="lv-m0">{o.from_display_name ?? "The Owner"} offered you ownership. As Owner you control the Hub, its plan and its members. The offer ends {new Date(o.expires_at).toLocaleDateString()}.</p>
          <div className="ui-row">
            <Button variant="primary" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await api.ownerTransferAccept(o.offer_id);
              setBusy(false);
              if (!r.ok) return void toast.error(describeError(r.error));
              toast.success(`You are now the Owner of ${o.hub_name}`);
              nav(`/${r.slug}`);
            }}>Accept ownership</Button>
            <Button variant="secondary" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await api.ownerTransferDecline(o.offer_id);
              setBusy(false);
              if (!r.ok) return void toast.error(describeError(r.error));
              toast.success("Offer declined");
              onChanged();
            }}>Decline</Button>
          </div>
        </Card>
      ))}
    </>
  );
}
