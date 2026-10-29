import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { slugProblem } from "../lib/reservedSlugs";
import { useLv } from "../lib/useLv";
import { Btn, Card, Empty, ErrorNote, Loading, Micro, Notice, PageHead, Pill } from "../components/ui";
import { Icon } from "../components/Icon";
import { describeError } from "../lib/errors";
import type { BetaStatus } from "../lib/lvApi";

/* ------------------------------------------------------------------ /me */

const BETA_COPY: Record<BetaStatus, { tone: "muted" | "accent" | "ok" | "danger"; label: string; body: string }> = {
  none: { tone: "muted", label: "No application", body: "Creating a Hub needs an approved beta application. Participants never do." },
  pending: { tone: "accent", label: "Under review", body: "Your beta application is with us. You'll get an answer at your KpnIdentity email." },
  approved: { tone: "ok", label: "Approved", body: "You can create a Hub now." },
  rejected: { tone: "danger", label: "Not approved", body: "This application was declined. You can keep participating in Hubs you're invited to." },
  consumed: { tone: "ok", label: "Used", body: "Your approval created a Hub. A second Hub needs a paid plan." },
};

export function Me() {
  const { session } = useIdentity();
  const { api } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);
  const c = ctx.data;
  const beta = c ? BETA_COPY[c.beta_status] : null;

  return (
    <div className="ui-page">
      <PageHead
        eyebrow="Account"
        title={c?.display_name ? `Hi, ${c.display_name}` : session?.name ? `Hi, ${session.name}` : "Your account"}
        sub="Your Hubs, your beta state, and everything waiting on you."
        actions={<Link className="ui-btn ui-btn-primary" to="/create">Create a Hub</Link>}
      />

      {ctx.error && <ErrorNote error={ctx.error} />}
      {ctx.loading && <Loading rows={2} />}

      {c && (
        <>
          <div className="ui-grid-2" style={{ marginBottom: 18 }}>
            <Card quiet>
              <Micro>Beta application</Micro>
              <div className="ui-row ui-gap-8" style={{ margin: "8px 0 6px" }}>
                <Pill tone={beta!.tone}>{beta!.label}</Pill>
              </div>
              <p className="ui-muted" style={{ margin: 0, fontSize: 14 }}>{beta!.body}</p>
            </Card>
            <Card quiet>
              <Micro>Identity</Micro>
              <p className="ui-muted" style={{ margin: "8px 0 0", fontSize: 14 }}>
                Signed in through KpnIdentity. LunchVoice keeps your verified issuer and subject, never your email as an identity key.
              </p>
            </Card>
          </div>

          <h2 className="ui-display ui-display-md" style={{ margin: "26px 0 12px" }}>Your Hubs</h2>
          {c.hubs.length === 0 ? (
            <Empty
              icon="home"
              title="You're not in any Hubs yet"
              action={
                <div className="ui-row">
                  <Link className="ui-btn ui-btn-primary" to="/create">Create a Hub</Link>
                  <Link className="ui-btn ui-btn-outline" to="/join">Join with an invite code</Link>
                </div>
              }
            >
              A Hub is your community's home: its Campaigns, its members, and its results. Create one, or redeem an invite someone sent you.
            </Empty>
          ) : (
            <div className="ui-grid-2">
              {c.hubs.map((h) => (
                <Link key={h.hub_id} to={`/${h.slug}`} className="ui-card" style={{ color: "inherit" }}>
                  <div className="ui-spread">
                    <h3 className="ui-display ui-display-md" style={{ margin: 0 }}>{h.name}</h3>
                    {h.is_owner && <Pill tone="accent">Owner</Pill>}
                  </div>
                  <Micro>/{h.slug}</Micro>
                  <div className="ui-row ui-gap-8" style={{ marginTop: 10 }}>
                    {h.roles.length === 0 ? <span className="ui-muted" style={{ fontSize: 13 }}>No custom roles</span> : h.roles.map((r) => <Pill key={r.key}>{r.name}</Pill>)}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="ui-row" style={{ marginTop: 22 }}>
            <Link className="ui-btn ui-btn-outline" to="/join">Join with an invite code</Link>
            <Link className="ui-btn ui-btn-quiet" to="/settings">Settings</Link>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ /create */

export function CreateHub() {
  const { api } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBeta, setNeedsBeta] = useState(false);

  const problem = slug ? slugProblem(slug.toLowerCase()) : null;
  const beta = ctx.data?.beta_status;

  async function create() {
    setBusy(true);
    setError(null);
    const r = await api.hubCreate(slug.toLowerCase(), name.trim());
    setBusy(false);
    if (r.ok) {
      nav(`/${r.slug}`);
      return;
    }
    if (r.error.code === "lv_beta_required") setNeedsBeta(true);
    else setError(describeError(r.error));
  }

  async function applyBeta() {
    const r = await api.betaApply();
    if (r.ok) ctx.reload();
    else setError(describeError(r.error));
  }

  return (
    <div className="ui-page">
      <PageHead
        eyebrow="New Hub"
        title="Create a Hub"
        sub="One address, one community. You become the Owner and cannot be removed from it."
        actions={<Link className="ui-btn ui-btn-quiet" to="/me">Back to account</Link>}
      />

      {ctx.loading && <Loading rows={1} />}
      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}

      {(needsBeta || beta === "pending" || beta === "none") && (
        <div style={{ marginBottom: 16 }}>
          {beta === "pending" && <Notice tone="info">Your beta application is under review. Creating a Hub unlocks when it's approved.</Notice>}
          {beta === "none" && (
            <Notice tone="info">
              <div className="ui-spread">
                <span>Creating a Hub needs an approved beta application. Participation stays free.</span>
                <Btn size="sm" variant="outline" onClick={applyBeta}>Apply for the beta</Btn>
              </div>
            </Notice>
          )}
          {beta === "rejected" && <Notice tone="warn">This account's beta application was declined. You can still join Hubs you're invited to.</Notice>}
          {needsBeta && beta !== "none" && beta !== "pending" && <Notice tone="warn">Creating a Hub needs an approved beta application.</Notice>}
        </div>
      )}

      <div className="ui-grid-2">
        <Card>
          <div className="ui-field">
            <label className="ui-label" htmlFor="hub-name">Hub name</label>
            <input id="hub-name" className="ui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Runners" maxLength={60} />
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="hub-slug">Address</label>
            <div className="ui-row" style={{ flexWrap: "nowrap" }}>
              <span className="ui-mono ui-muted" style={{ fontSize: 13 }}>lunchvoice.com/</span>
              <input
                id="hub-slug"
                className="ui-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="riverside-runners"
                aria-invalid={Boolean(problem)}
                aria-describedby="hub-slug-help"
              />
            </div>
            <span id="hub-slug-help" className="ui-help">
              {problem === "reserved" ? "That address is reserved for the platform." : problem === "format" ? "3–40 characters: lowercase letters, numbers and single hyphens." : "3–40 characters: lowercase letters, numbers and single hyphens."}
            </span>
          </div>
          <Btn variant="primary" block disabled={!name.trim() || !slug || Boolean(problem) || busy} onClick={create}>
            {busy ? "Creating…" : "Create Hub"}
          </Btn>
          <p className="ui-help" style={{ marginTop: 10 }}>
            The address is a name, not an identity: links and permissions always use the Hub's immutable id.
          </p>
        </Card>

        <Card quiet>
          <Micro>What you get as Owner</Micro>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8, fontSize: 14.5 }}>
            <li>An Owner seat that never consumes a custom-role slot</li>
            <li>Roles, invites and membership decisions</li>
            <li>Campaigns in rating, poll, survey and feedback modes</li>
            <li>Privacy-safe results with withheld cohorts</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ /join and /j/:code */

export function Join() {
  const [code, setCode] = useState("");
  const nav = useNavigate();
  return (
    <div className="ui-page">
      <PageHead eyebrow="Invitation" title="Join with an invite code" sub="Paste the code from your invitation. It works once per person." />
      <Card>
        <div className="ui-field">
          <label className="ui-label" htmlFor="invite-code">Invite code</label>
          <input id="invite-code" className="ui-input ui-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-2345" />
        </div>
        <Btn variant="primary" disabled={!code.trim()} onClick={() => nav(`/j/${encodeURIComponent(code.trim())}`)} icon="arrow">
          Open invitation
        </Btn>
      </Card>
    </div>
  );
}

export function RedeemInvite() {
  const { code = "" } = useParams();
  const { api, session } = useIdentity();
  const nav = useNavigate();
  const preview = useLv(() => api.invitePreview(code), [api, code]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setError(null), [code]);

  async function redeem() {
    setBusy(true);
    const r = await api.inviteRedeem(code);
    setBusy(false);
    if (r.ok) nav(`/${(preview.data?.hub.slug ?? "").toString()}`);
    else setError(describeError(r.error));
  }

  return (
    <div className="ui-page" style={{ maxWidth: 560 }}>
      <PageHead eyebrow="Invitation" title="You've been invited" />
      {preview.loading && <Loading rows={2} />}
      {preview.error && (
        <Card>
          <Notice tone="err">{describeError(preview.error)}</Notice>
          <Link className="ui-btn ui-btn-outline" to="/join">Try another code</Link>
        </Card>
      )}
      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}
      {preview.data && (
        <Card>
          <Micro>Hub</Micro>
          <h2 className="ui-display ui-display-lg" style={{ margin: "6px 0 4px" }}>{preview.data.hub.name}</h2>
          <p className="ui-muted ui-mono" style={{ margin: "0 0 16px", fontSize: 13 }}>lunchvoice.com/{preview.data.hub.slug}</p>
          {preview.data.already_member ? (
            <div className="ui-stack ui-gap-12">
              <Notice tone="ok">You're already a member of this Hub.</Notice>
              <Link className="ui-btn ui-btn-primary" to={`/${preview.data.hub.slug}`}>Open the Hub</Link>
            </div>
          ) : session ? (
            <Btn variant="primary" onClick={redeem} disabled={busy} icon="check">{busy ? "Joining…" : "Join this Hub"}</Btn>
          ) : (
            <div className="ui-stack ui-gap-12">
              <Notice tone="info">Sign in to accept. Your invite code is kept and you'll come straight back here.</Notice>
              <Link className="ui-btn ui-btn-primary" to="/signin" state={{ from: `/j/${code}` }}>Sign in to join</Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ /settings (local only) */

export function Settings() {
  return (
    <div className="ui-page">
      <PageHead eyebrow="Settings" title="Settings" sub="Local preferences only. Account and notification settings have no API yet." />
      <Card>
        <div className="ui-row ui-gap-8" style={{ marginBottom: 8 }}>
          <Icon name="lock" size={18} />
          <strong>Not available yet</strong>
        </div>
        <p className="ui-muted" style={{ margin: 0 }}>
          Profile editing, notification preferences and account deletion need `lv_profile_update`, `lv_notification_prefs`
          and `lv_account_delete`. Until those ship, this page reports the gap instead of pretending to save.
        </p>
      </Card>
    </div>
  );
}
