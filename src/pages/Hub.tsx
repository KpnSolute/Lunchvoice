import { useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import type { HubInfo, HubMembership } from "../lib/lvApi";
import { RESERVED_SLUGS } from "../lib/reservedSlugs";
import { useLv } from "../lib/useLv";
import { NotFound } from "./Public";

export interface HubCtx {
  hub: HubInfo;
  membership: HubMembership | null;
}
export const useHubCtx = () => useOutletContext<HubCtx>();
export const can = (m: HubMembership | null, cap: string) => Boolean(m?.is_owner || m?.capabilities.includes(cap));

// Public Hubs are readable signed out; the backend decides what a non-member sees.
export function HubLayout() {
  const { hub: slug } = useParams();
  const { api, session } = useIdentity();
  const reserved = !slug || RESERVED_SLUGS.has(slug.toLowerCase());
  const q = useLv(() => (reserved ? Promise.resolve({ ok: false as const, error: { code: "lv_not_found" as const, message: "" } }) : api.hubGet(slug)), [api, slug, reserved]);

  if (reserved) return <NotFound />;
  if (q.loading) return <p className="muted" role="status">Loading…</p>;
  if (q.error || !q.data) {
    return (
      <div className="stack">
        <h2>Hub not available</h2>
        <p className="muted">It may not exist, or it may be private.</p>
        {!session && <Link to="/signin" state={{ from: `/${slug}` }}>Sign in</Link>}
        <Link to="/">LunchVoice home</Link>
      </div>
    );
  }
  const { hub, membership } = q.data;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <div className="eyebrow">Hub</div>
        <h1>{hub.name}</h1>
        <p className="muted mono">{hub.member_count} {hub.member_count === 1 ? "member" : "members"} · {hub.visibility}</p>
      </div>
      <nav className="row" aria-label="Hub">
        <NavLink end to={`/${hub.slug}`}>Overview</NavLink>
        <NavLink to={`/${hub.slug}/campaigns`}>Campaigns</NavLink>
        {can(membership, "analytics.read") && <NavLink to={`/${hub.slug}/analytics`}>Analytics</NavLink>}
        {(can(membership, "admin.members.admit") || can(membership, "admin.members.remove")) && <NavLink to={`/${hub.slug}/members`}>Members</NavLink>}
      </nav>
      <Outlet context={{ hub, membership } satisfies HubCtx} />
    </div>
  );
}

export function HubHome() {
  const { hub, membership } = useHubCtx();
  const { session } = useIdentity();
  return (
    <div className="card stack">
      {membership ? (
        <p>You are {membership.is_owner ? "the Owner of" : "a member of"} this Hub. {membership.active_campaigns} active {membership.active_campaigns === 1 ? "Campaign" : "Campaigns"}.</p>
      ) : session ? (
        <p>You are not a member of this Hub yet. Joining is {hub.membership_mode.replace("_", "-")}.</p>
      ) : (
        <p>Sign in to join this Hub.</p>
      )}
      <Link to={`/${hub.slug}/campaigns`}>See Campaigns</Link>
    </div>
  );
}

export function Members() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const members = useLv(() => api.memberList(hub.hub_id), [api, hub.hub_id]);
  const invites = useLv(() => api.inviteList(hub.hub_id), [api, hub.hub_id]);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    setError(null);
    const r = await api.inviteCreate(hub.hub_id);
    if (r.ok) { setCode(r.code); invites.reload(); } else setError(r.error.message);
  }
  async function revoke(id: string) {
    const r = await api.inviteRevoke(id);
    if (r.ok) invites.reload(); else setError(r.error.message);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <div className="notice" role="alert">{error}</div>}
      <section className="card stack">
        <h2>Members</h2>
        {members.loading ? <p className="muted">Loading…</p> : members.error ? <p className="muted">{members.error.message}</p> : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {members.data?.members.map((m) => (
              <li key={m.membership_id}>{m.display_name ?? "Member"} {m.is_owner && <span className="mono muted">owner</span>} {m.status === "pending" && <span className="mono muted">pending</span>}</li>
            ))}
          </ul>
        )}
      </section>
      {can(membership, "admin.members.admit") && (
        <section className="card stack">
          <h2>Invitations</h2>
          <button className="btn btn-primary" onClick={createInvite}>Create invite code</button>
          {code && <div className="notice" role="status">Copy this code now; it is shown only once: <strong className="mono">{code}</strong></div>}
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {invites.data?.invites.map((i) => (
              <li key={i.invite_id} className="row">
                <span className="mono">{i.state}</span><span className="muted">{i.uses} used</span>
                {i.state === "active" && <button className="btn btn-ghost" onClick={() => revoke(i.invite_id)}>Revoke</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
