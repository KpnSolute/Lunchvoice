import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { slugProblem } from "../lib/reservedSlugs";
import { PENDING_API, type HubSummary } from "../lib/lvApi";
import { PLANS } from "../config/pricing";
import {
  Button,
  ButtonLink,
  Card,
  CodeInput,
  Empty,
  ErrorNote,
  Field,
  HubMark,
  Icon,
  Loading,
  Notice,
  PageHead,
  PendingNote,
  Pill,
  RadioGroup,
  Switch,
  TextInput,
  TypedConfirm,
  useTheme,
} from "../ui";

/* ------------------------------------------------------------------ sign in */

const ISSUER = import.meta.env.VITE_KPNIDENTITY_ISSUER as string | undefined;
const CLIENT_ID = import.meta.env.VITE_KPNIDENTITY_CLIENT_ID as string | undefined;

export function SignIn() {
  const { session, canSimulate, signInSimulated, issuerConfigured } = useIdentity();
  const [name, setName] = useState("Dana");
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from ?? "/me";

  function startKpnIdentity() {
    if (!ISSUER || !CLIENT_ID) return;
    const state = crypto.randomUUID();
    sessionStorage.setItem("lv.oauth.state", state);
    const url = new URL("/authorize", ISSUER);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", `${window.location.origin}/auth/callback`);
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", state);
    window.location.assign(url.toString());
  }

  return (
    <div className="wrap page" style={{ maxWidth: 560 }}>
      <PageHead eyebrow="Sign in" title="Welcome back." sub="LunchVoice uses KpnIdentity. Your email is never the identity key: a verified account is." />

      {session ? (
        <Card className="stack">
          <p className="t-title">You are signed in as {session.name}.</p>
          <div className="row">
            <ButtonLink to={from} variant="primary">
              Continue
            </ButtonLink>
            <ButtonLink to="/me" variant="quiet">
              My Hubs
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <Card className="stack">
          <Button variant="primary" size="lg" icon="lock" onClick={startKpnIdentity} disabled={!issuerConfigured || !CLIENT_ID}>
            Sign in with KpnIdentity
          </Button>

          {!issuerConfigured && (
            <Notice tone="warn" title="Single sign-on is not configured on this deployment">
              The app is missing <code className="mono">VITE_KPNIDENTITY_ISSUER</code>, so sign-in fails closed instead of
              pretending to work. You can still join a Campaign with a code, and the reviewer can set the issuer.
            </Notice>
          )}
          {issuerConfigured && !CLIENT_ID && (
            <Notice tone="warn" title="One more value is missing">
              <code className="mono">VITE_KPNIDENTITY_CLIENT_ID</code> is not set, so the KpnIdentity button cannot start a
              request.
            </Notice>
          )}

          <div className="row" style={{ gap: 8 }}>
            <ButtonLink to="/join" variant="raised" icon="campaign">
              Join with a code instead
            </ButtonLink>
            <ButtonLink to="/" variant="quiet">
              Back to LunchVoice
            </ButtonLink>
          </div>

          {canSimulate && (
            <div className="stack stack-sm" style={{ borderTop: "1px solid var(--lv-line)", paddingTop: 16 }}>
              <p className="t-label subtle">Development only</p>
              <Field label="Display name" htmlFor="sim-name" help="The mock identity exists only in dev builds. Production fails closed.">
                <TextInput id="sim-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button
                variant="raised"
                onClick={() => {
                  signInSimulated(name);
                  navigate(from, { replace: true });
                }}
              >
                Mock sign-in
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ join */

export function Join() {
  const { api, session } = useIdentity();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/\s/g, "").toUpperCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (clean.length < 4) return;
    setState("checking");
    setError(null);
    const r = await api.invitePreview(clean);
    if (r.ok) {
      if (!session) {
        navigate("/signin", { state: { from: `/j/${clean}` } });
        return;
      }
      navigate(`/j/${clean}`);
      return;
    }
    // The same six characters can be a Campaign join code instead of an invitation.
    // The player resolves it and explains itself if the Campaign is closed or unknown.
    if (r.error.code === "lv_invalid_code") {
      navigate(`/c/${clean}`);
      return;
    }
    setState("error");
    setError(r.error.message);
  }

  return (
    <div className="wrap page" style={{ maxWidth: 520 }}>
      <PageHead
        eyebrow="Join"
        title="Enter your code."
        sub="A join code opens one Campaign. An invitation code adds you to a Hub. Codes are six characters and never case-sensitive."
      />
      <Card className="stack">
        <form className="stack" onSubmit={submit}>
          <CodeInput label="Join code" value={clean} onChange={setCode} length={6} autoFocus />
          {error && <Notice tone="error" title="That didn't work">{error}</Notice>}
          <Button type="submit" variant="primary" loading={state === "checking"} disabled={clean.length < 4}>
            Continue
          </Button>
        </form>
        {!session && (
          <p className="t-small subtle">
            Some Hubs need a member account. If yours does, you will be asked to <Link to="/signin">sign in</Link> and brought back
            here.
          </p>
        )}
        <p className="t-small subtle">
          Guests can answer without an account and never count as members. That is deliberate.
        </p>
      </Card>
    </div>
  );
}

export function RedeemInvite() {
  const { code = "" } = useParams();
  const { api } = useIdentity();
  const navigate = useNavigate();
  const preview = useLv(() => api.invitePreview(code), [api, code]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    const r = await api.inviteRedeem(code);
    setBusy(false);
    if (r.ok) navigate(`/${preview.data?.hub.slug ?? ""}`);
    else setError(r.error.message);
  }

  return (
    <div className="wrap page" style={{ maxWidth: 560 }}>
      <PageHead eyebrow="Invitation" title="You have been invited." />
      {preview.loading && <Loading label="Checking invitation" />}
      {preview.error && (
        <Card className="stack">
          <Notice tone="error" title="This invitation cannot be used">
            <ErrorNote error={preview.error} />
            It may be invalid, expired, revoked or already used up. Ask the Hub owner for a new one.
          </Notice>
          <ButtonLink to="/join" variant="raised">
            Try a different code
          </ButtonLink>
        </Card>
      )}
      {preview.data && (
        <Card className="stack">
          <div className="row">
            <HubMark name={preview.data.hub.name} slug={preview.data.hub.slug} size={48} />
            <div className="stack stack-sm">
              <p className="t-title">{preview.data.hub.name}</p>
              <p className="t-small subtle mono">/{preview.data.hub.slug}</p>
            </div>
          </div>
          {preview.data.already_member ? (
            <Notice tone="ok" title="You are already a member">
              Opening the Hub will not create a second membership.
            </Notice>
          ) : (
            <p className="t-small muted">Accepting adds you as a member of this Hub. You can leave at any time.</p>
          )}
          {error && <Notice tone="error" title="That didn't work">{error}</Notice>}
          <div className="row">
            <Button variant="primary" loading={busy} onClick={accept}>
              {preview.data.already_member ? "Open the Hub" : "Accept invitation"}
            </Button>
            <ButtonLink to="/" variant="quiet">
              Not now
            </ButtonLink>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ my hubs */

export function Me() {
  const { api, session, signInSimulated, canSimulate } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);

  if (ctx.loading) return <Loading rows={4} label="Loading your Hubs" />;
  if (ctx.error || !ctx.data) return <ErrorNote error={ctx.error} onRetry={ctx.reload} />;

  const { display_name, hubs, beta_status } = ctx.data;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <PageHead
        eyebrow="My Hubs"
        title={`Hello${display_name ? `, ${display_name.split(" ")[0]}` : ""}.`}
        sub="Every Hub you belong to, and where you left off."
        action={
          <ButtonLink to="/create" variant="primary" icon="plus">
            Create a Hub
          </ButtonLink>
        }
      />

      {beta_status !== "approved" && hubs.length === 0 && (
        <Notice tone="info" title="Creating a Hub needs beta approval">
          Participation is open to everyone. Hub creation is invite-first during the beta.{" "}
          <Link to="/beta">Apply for access</Link>.
        </Notice>
      )}

      <section className="stack">
        <div className="row-between">
          <h2 className="t-title">Your Hubs</h2>
          <span className="t-small subtle">{hubs.length} total</span>
        </div>
        {hubs.length === 0 ? (
          <Empty
            icon="home"
            title="No Hubs yet"
            action={
              <div className="row">
                <ButtonLink to="/create" variant="primary" size="sm">
                  Create a Hub
                </ButtonLink>
                <ButtonLink to="/join" variant="raised" size="sm">
                  Join with a code
                </ButtonLink>
              </div>
            }
          >
            A Hub is one community. When you create or join one, it appears here with the Campaigns you can answer.
          </Empty>
        ) : (
          <div className="grid grid-3">
            {hubs.map((h) => (
              <HubCardView key={h.hub_id} hub={h} />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-2">
        <Card className="stack">
          <div className="row-between">
            <h2 className="t-title">Pending invitations</h2>
            <Pill>None</Pill>
          </div>
          <p className="t-small muted">
            Invitations arrive by email or as a link. There is no separate inbox yet; a link opens the invitation directly.
          </p>
          <ButtonLink to="/join" variant="quiet" size="sm" iconRight="arrow-right">
            Enter a code
          </ButtonLink>
        </Card>

        <Card className="stack">
          <div className="row-between">
            <h2 className="t-title">Recently answered</h2>
            <Pill>This month</Pill>
          </div>
          <p className="t-small muted">
            Campaigns you complete show here with their receipt. Receipts prove participation; they never reveal your answers to
            anyone else.
          </p>
        </Card>
      </section>

      {!session && canSimulate && (
        <Card className="stack">
          <p className="t-small muted">You are viewing a signed-out shell. In development you can simulate a session.</p>
          <Button variant="raised" onClick={() => signInSimulated("Dana")}>
            Mock sign-in
          </Button>
        </Card>
      )}
    </div>
  );
}

function HubCardView({ hub }: { hub: HubSummary }) {
  return (
    <Card className="stack">
      <div className="row">
        <HubMark name={hub.name} slug={hub.slug} size={40} />
        <div className="stack stack-sm" style={{ minWidth: 0 }}>
          <p className="t-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {hub.name}
          </p>
          <p className="t-small subtle mono">/{hub.slug}</p>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {hub.is_owner ? <Pill tone="accent">Owner</Pill> : null}
        {hub.roles.slice(0, 2).map((r) => (
          <Pill key={r.key}>{r.name}</Pill>
        ))}
        <Pill tone="quiet">{hub.capabilities.length} capabilities</Pill>
      </div>
      <ButtonLink to={`/${hub.slug}`} variant="raised" size="sm">
        Open Hub
      </ButtonLink>
    </Card>
  );
}

/* ------------------------------------------------------------------ create a hub */

const STEPS = ["Name", "Address", "Visibility", "Review"] as const;

export function CreateHub() {
  const { api } = useIdentity();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [visibility, setVisibility] = useState("public");
  const [plan, setPlan] = useState("starter");
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = slug ? slugProblem(slug) : null;
  const valid = slug.length >= 3 && !problem && !taken;

  useEffect(() => {
    if (!slugTouched && name) {
      const guess = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      setSlug(guess);
    }
  }, [name, slugTouched]);

  useEffect(() => {
    if (!slug || problem) {
      setTaken(false);
      return;
    }
    let live = true;
    setChecking(true);
    const t = window.setTimeout(async () => {
      const r = await api.hubGet(slug);
      if (!live) return;
      setTaken(r.ok);
      setChecking(false);
    }, 320);
    return () => {
      live = false;
      window.clearTimeout(t);
      setChecking(false);
    };
  }, [slug, problem, api]);

  async function create() {
    setBusy(true);
    setError(null);
    const r = await api.hubCreate(slug, name.trim());
    setBusy(false);
    if (r.ok) navigate(`/${r.slug}`);
    else setError(r.error.message);
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <PageHead eyebrow="Create a Hub" title="Give your community an address." sub="Four short steps. Nothing is published until you finish." />

      <div className="segmented" role="group" aria-label="Progress">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className="seg"
            aria-current={i === step ? "step" : undefined}
            style={
              i === step
                ? { background: "var(--lv-pressed-bg)", boxShadow: "var(--lv-pressed-shadow)", color: "var(--lv-on-accent)", fontWeight: 600 }
                : { color: i < step ? "var(--lv-text)" : "var(--lv-subtle)" }
            }
          >
            {i < step && <Icon name="check" size={14} strokeWidth={2.6} />}
            {s}
          </span>
        ))}
      </div>

      <Card className="stack" style={{ gap: 20 }}>
        {step === 0 && (
          <>
            <Field label="Hub name" htmlFor="hub-name" help="This is what members see. You can change it later.">
              <TextInput id="hub-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Northside Running Club" autoFocus />
            </Field>
            <div className="row row-end">
              <Button variant="primary" disabled={name.trim().length < 3} onClick={() => setStep(1)} iconRight="arrow-right">
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field
              label="Hub address"
              htmlFor="hub-slug"
              error={problem === "reserved" ? "That address is reserved by LunchVoice." : problem === "format" ? "Use 3–40 letters, numbers or single hyphens." : taken ? "That address is already taken." : null}
              help={
                <span>
                  Members reach you at <code className="mono">lunchvoice.com/{slug || "your-hub"}</code>. Lowercase letters, numbers
                  and hyphens.
                </span>
              }
            >
              <div className="input-affix">
                <span className="subtle mono">lunchvoice.com/</span>
                <TextInput
                  id="hub-slug"
                  value={slug}
                  maxLength={40}
                  aria-invalid={Boolean(problem || taken) || undefined}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  }}
                  autoFocus
                />
                {checking && <span className="t-small subtle">checking…</span>}
                {!checking && valid && <Icon name="check" size={16} title="Available" />}
              </div>
            </Field>
            <div className="row row-end">
              <Button variant="quiet" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button variant="primary" disabled={!valid} onClick={() => setStep(2)} iconRight="arrow-right">
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <RadioGroup
              label="Hub visibility"
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "public", label: "Public", hint: "Anyone with the link sees your Hub page. Campaigns still decide who may answer." },
                { value: "private", label: "Private", hint: "Only members see anything. A private Hub answers exactly like a missing one." },
              ]}
            />
            <div className="divider" />
            <RadioGroup
              label="Plan"
              value={plan}
              onChange={setPlan}
              options={PLANS.filter((p) => ["starter", "team"].includes(p.id)).map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.priceLabel} ${p.cadence}`,
                hint: p.features[0],
              }))}
            />
            <PendingNote fn={PENDING_API.hubUpdate} what="Saving visibility and plan" />
            <div className="row row-end">
              <Button variant="quiet" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setStep(3)} iconRight="arrow-right">
                Review
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="stack stack-sm">
              <p className="t-label muted">Review</p>
              <div className="row">
                <HubMark name={name || "Your Hub"} slug={slug} size={48} />
                <div className="stack stack-sm">
                  <p className="t-title">{name || "Untitled Hub"}</p>
                  <p className="t-small subtle mono">lunchvoice.com/{slug || "your-hub"}</p>
                </div>
              </div>
            </div>
            <dl className="grid grid-2" style={{ gap: 12 }}>
              <div>
                <dt className="t-label muted">Visibility</dt>
                <dd className="t-ui">{visibility}</dd>
              </div>
              <div>
                <dt className="t-label muted">Plan</dt>
                <dd className="t-ui">{PLANS.find((p) => p.id === plan)?.name}</dd>
              </div>
            </dl>
            <Notice tone="info" title="Visibility and plan are not saved yet">
              <code className="mono">{PENDING_API.hubUpdate}</code> does not exist. The Hub is created with its name and address
              only; the other choices are shown here so you can confirm them, not silently dropped.
            </Notice>
            {error && <Notice tone="error" title="The Hub was not created">{error}</Notice>}
            <div className="row row-end">
              <Button variant="quiet" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" loading={busy} onClick={create}>
                Create Hub
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

export function Settings() {
  const { session, signOut } = useIdentity();
  const { appearance } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [profileName, setProfileName] = useState(session?.name ?? "");
  const [notify, setNotify] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 720 }}>
      <PageHead eyebrow="Settings" title="Your account." sub="Appearance, profile and what happens to your data." />

      <Card className="stack">
        <h2 className="t-title">Appearance</h2>
        <p className="t-small muted">
          This device asks for the <strong>{appearance}</strong> palette — <strong>page</strong> is the light one,{" "}
          <strong>ink</strong> the dark one. LunchVoice keeps no theme setting of its own, so change your system
          appearance and this page follows it. High contrast follows the system&rsquo;s contrast setting too.
        </p>
      </Card>

      <Card className="stack">
        <h2 className="t-title">Profile</h2>
        <Field label="Display name" htmlFor="profile-name" help="Shown to Hub managers. Your email is never shown to other members.">
          <TextInput id="profile-name" ref={nameRef} value={profileName} onChange={(e) => setProfileName(e.target.value)} />
        </Field>
        <PendingNote fn={PENDING_API.profileUpdate} what="Saving your display name" />
        <Switch label="Email me about invitations" description="Only invitations and access changes. No marketing." checked={notify} onChange={setNotify} />
      </Card>

      <Card className="stack">
        <h2 className="t-title">Session</h2>
        <p className="t-small muted">
          {session ? `Signed in as ${session.name}.` : "You are not signed in."} Signing out removes the local session only.
        </p>
        <div className="row">
          <Button variant="raised" onClick={signOut} disabled={!session}>
            Sign out
          </Button>
        </div>
      </Card>

      <Card className="stack">
        <h2 className="t-title" style={{ color: "var(--lv-danger-ink)" }}>
          Delete account
        </h2>
        <p className="t-small muted">
          Deleting your account removes your membership and your profile. It never deletes Hub data you do not own, and a Hub you
          own must be transferred first: the Owner is protected.
        </p>
        <div className="row">
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Delete my account
          </Button>
        </div>
        <TypedConfirm
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="Delete your account?"
          phrase="DELETE"
          confirmLabel="Delete account"
          body={
            <>
              This cannot be undone. <code className="mono">{PENDING_API.accountDelete}</code> does not exist yet, so this button
              would fail closed: nothing is deleted by this build.
            </>
          }
        />
      </Card>

      <p className="t-small subtle">
        Requests go through <code className="mono">lv_api</code> only. This app never reads application tables directly.
      </p>
      <span className="sr-only" aria-live="polite">
        {notify ? "Email notifications on" : "Email notifications off"}
      </span>
    </div>
  );
}
