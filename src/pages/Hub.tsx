import { useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { RESERVED_SLUGS } from "../lib/reservedSlugs";
import type { HubInfo, HubMembership, Role } from "../lib/lvApi";
import { PENDING_API } from "../lib/lvApi";
import { Btn, Card, CopyField, Empty, ErrorNote, Loading, Meter, Metric, Micro, Notice, PageHead, PhaseBadge, Pill, Tabs, campaignPhase } from "../components/ui";
import { HubMark } from "../ui/HubMark";
import { HubCover } from "../ui/HubCover";
import { StateScreen } from "../ui/StateScreen";
import { Icon, type IconName } from "../components/Icon";
import { BottomTabs, type TabItem } from "../ui/BottomTabs";
import { describeError } from "../lib/errors";
import { NotFoundPage } from "./Marketing";

export interface HubCtx {
  hub: HubInfo;
  membership: HubMembership | null;
}
// Participant-facing add-on pages (M2). They render in the L10 Hub cover shell for everyone.
const ADDON_PAGE = /^\/[^/]+\/(shop|leaderboard|news|comments|p)(\/|$)/;
export const useHubCtx = () => useOutletContext<HubCtx>();
export const can = (m: HubMembership | null, cap: string) => Boolean(m?.is_owner || m?.capabilities.includes(cap));

export function HubLayout() {
  const { hub: slug } = useParams();
  const { pathname } = useLocation();
  const { api, session } = useIdentity();
  const reserved = !slug || RESERVED_SLUGS.has(slug.toLowerCase());
  const q = useLv(
    () => (reserved ? Promise.resolve({ ok: false as const, error: { code: "lv_not_found" as const, message: "" } }) : api.hubGet(slug)),
    [api, slug, reserved],
  );

  if (reserved) return <NotFoundPage />;
  if (q.loading) return <div className="ui-page"><Loading rows={3} label="Loading Hub" /></div>;
  if (q.error || !q.data) {
    return (
      <div className="ui-page" style={{ maxWidth: 620 }}>
        <PageHead eyebrow="Hub" title="Hub not available" sub="It may not exist, or it may be private. A private Hub answers exactly like a missing one." />
        <div className="ui-row">
          {!session && <Link className="ui-btn ui-btn-primary" to="/signin" state={{ from: `/${slug}` }}>Sign in</Link>}
          <Link className="ui-btn ui-btn-outline" to="/">LunchVoice home</Link>
        </div>
      </div>
    );
  }

  const { hub, membership } = q.data;
  const base = `/${hub.slug}`;

  // Participants (visitors, and members on a participant page) get the Hub cover, not the workspace chrome (L10).
  if (!membership || ADDON_PAGE.test(pathname)) {
    return (
      <div className="lv-l10">
        <HubCover
          name={hub.name}
          slug={hub.slug}
          pills={<span className="lv-cover-pill">{hub.visibility === "public" ? "Public" : "Private"} · {hub.membership_mode.replace("_", " ")}</span>}
          action={!session ? <Link className="ui-btn ui-btn-outline lv-cover-btn" to="/signin" state={{ from: base }}>Sign in</Link> : membership ? <Link className="ui-btn ui-btn-outline lv-cover-btn" to={base}>Open workspace</Link> : undefined}
        />
        <div className="lv-l10-body">
          <Outlet context={{ hub, membership } satisfies HubCtx} />
        </div>
        <p className="lv-powered">Powered by <img src="/brand/lunchvoice-mark.svg" alt="" height={16} width={16} /> <strong>LunchVoice</strong></p>
      </div>
    );
  }

  const tabs = [
    { to: base, label: "Overview", end: true },
    { to: `${base}/campaigns`, label: "Campaigns" },
    ...(can(membership, "analytics.read") ? [{ to: `${base}/analytics`, label: "Analytics" }] : []),
    ...(can(membership, "admin.members.admit") || can(membership, "admin.members.remove") ? [{ to: `${base}/members`, label: "Members" }] : []),
    ...(can(membership, "admin.members.admit") ? [{ to: `${base}/invites`, label: "Invites" }] : []),
    ...(can(membership, "admin.roles.manage") ? [{ to: `${base}/roles`, label: "Roles" }] : []),
    ...(membership ? [{ to: `${base}/settings`, label: "Settings" }] : []),
    ...(membership?.is_owner ? [{ to: `${base}/builder`, label: "Builder" }] : []),
    ...(membership?.is_owner
      ? [
          { to: `${base}/billing`, label: "Billing" },
          { to: `${base}/reservation`, label: "Reservation" },
          { to: `${base}/discover`, label: "Discover" },
        ]
      : []),
  ];

  // Phones: Overview, Campaigns, Analytics, Members and a More sheet that holds everything else.
  const ICONS: Record<string, IconName> = {
    Overview: "home", Campaigns: "survey", Analytics: "voice", Members: "roster",
    Invites: "join", Roles: "roster", Settings: "settings", Builder: "dashboard", Billing: "coin", Reservation: "lock", Discover: "sparkle",
  };
  const asTab = (t: { to: string; label: string; end?: boolean }): TabItem => ({ ...t, icon: ICONS[t.label] ?? "dashboard" });
  const primary = ["Overview", "Campaigns", "Analytics", "Members"];
  const bottom = tabs.filter((t) => primary.includes(t.label)).map(asTab);
  const more = tabs.filter((t) => !primary.includes(t.label)).map(asTab);

  return (
    <div className="ui-page">
      <div className="ui-spread" style={{ alignItems: "flex-end", marginBottom: 14 }}>
        <div className="ui-row" style={{ gap: 16, alignItems: "center" }}>
          <HubMark name={hub.name} size={64} />
          <div>
            <Micro accent>Hub</Micro>
            <h1 className="ui-display ui-display-lg" style={{ margin: "4px 0 6px" }}>{hub.name}</h1>
            <div className="ui-row ui-gap-8">
              <Pill>{hub.visibility}</Pill>
              <Pill>{hub.membership_mode.replace("_", " ")}</Pill>
              <span className="ui-muted ui-mono" style={{ fontSize: 12 }}>/{hub.slug}</span>
            </div>
          </div>
        </div>
        {membership?.is_owner && <Pill tone="accent">Owner</Pill>}
      </div>
      <div className="lv-hubtabs"><Tabs items={tabs} /></div>
      <div style={{ marginTop: 20 }}>
        <Outlet context={{ hub, membership } satisfies HubCtx} />
      </div>
      <BottomTabs label="Hub sections" items={bottom} more={more} />
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

export function HubOverview() {
  const { hub, membership } = useHubCtx();
  const { api, session } = useIdentity();
  const { code } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const denied = { ok: false as const, error: { code: "lv_forbidden" as const, message: "" } };
  const campaigns = useLv(() => (membership ? api.campaignList(hub.hub_id) : Promise.resolve(denied)), [api, hub.hub_id, Boolean(membership)]);
  const people = useLv(
    () => (can(membership, "admin.members.admit") || can(membership, "admin.members.remove") ? api.memberList(hub.hub_id) : Promise.resolve(denied)),
    [api, hub.hub_id, Boolean(membership)],
  );

  async function join() {
    setBusy(true);
    const r = await api.hubJoin(hub.hub_id);
    setBusy(false);
    if (r.ok) setPending(r.status === "pending");
    else setError(describeError(r.error));
  }

  if (!membership) {
    return (
      <div className="ui-grid-2">
        <Card>
          <Micro>Membership</Micro>
          <h2 className="ui-display ui-display-md" style={{ margin: "8px 0 6px" }}>
            {hub.membership_mode === "open" ? "This Hub is open to join." : hub.membership_mode === "approval" ? "Join requests are reviewed by a manager." : "This Hub is invite only."}
          </h2>
          <p className="ui-muted" style={{ margin: "0 0 14px" }}>
            Campaigns, members and results stay private until you're a member.
          </p>
          {error && <Notice tone="err">{error}</Notice>}
          {pending && <Notice tone="info">Request sent. A manager will review it.</Notice>}
          {!session ? (
            <Link className="ui-btn ui-btn-primary" to="/signin" state={{ from: `/${hub.slug}` }}>Sign in to join</Link>
          ) : hub.membership_mode === "invite_only" ? (
            <Link className="ui-btn ui-btn-outline" to="/join">Use an invite code</Link>
          ) : (
            <Btn variant="primary" onClick={join} disabled={busy}>{busy ? "Working…" : hub.membership_mode === "open" ? "Join this Hub" : "Request to join"}</Btn>
          )}
        </Card>
        <Card quiet>
          <Micro>About this Hub</Micro>
          <div className="ui-row ui-gap-16" style={{ marginTop: 12 }}>
            <Metric value={hub.member_count} label="members" />
            <Metric value={hub.visibility} label="visibility" />
            <Metric value={hub.membership_mode.replace("_", " ")} label="joining" />
          </div>
        </Card>
      </div>
    );
  }

  const rows = campaigns.data?.campaigns ?? [];
  const live = rows.filter((c) => campaignPhase(c) === "open").length;
  const accepted = people.data?.members.filter((m) => m.status === "accepted") ?? [];
  const waiting = people.data?.members.filter((m) => m.status === "pending").length ?? 0;
  const manager = can(membership, "campaign.manage");

  return (
    <div className="lv-dash">
      <div className="lv-stack">
        <div className="lv-tiles">
          <div className="lv-tile lv-tile-ink">
            <span className="lv-tile-label">Live Campaigns</span>
            <span className="lv-tile-value">{live}</span>
            <span className="lv-tile-note">{rows.length} in total</span>
          </div>
          <div className="lv-tile">
            <span className="lv-tile-label">Members</span>
            <span className="lv-tile-value">{hub.member_count}</span>
            <span className="lv-tile-note">{waiting > 0 ? `${waiting} waiting on you` : "Everyone is in"}</span>
          </div>
          <div className="lv-tile">
            <span className="lv-tile-label">Custom roles</span>
            <span className="lv-tile-value">{membership.roles.length}</span>
            <span className="lv-tile-note">{membership.is_owner ? "You are the owner" : "Roles you hold"}</span>
          </div>
        </div>

        <div className="lv-panel">
          <div className="ui-spread" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>All Campaigns</h2>
            {manager && <Link className="ui-btn ui-btn-ink ui-btn-sm" to={`/${hub.slug}/campaigns/new`}>New Campaign</Link>}
          </div>
          {campaigns.loading ? (
            <Loading rows={3} />
          ) : rows.length === 0 ? (
            <p className="ui-muted" style={{ margin: 0 }}>No Campaigns yet. A Campaign is one set of questions with a lifecycle: draft, scheduled, open, closed.</p>
          ) : (
            <ul className="lv-rows">
              {rows.slice(0, 6).map((c) => (
                <li key={c.campaign_id}>
                  <Link to={`/${hub.slug}/campaigns/${c.campaign_id}`} className="lv-row">
                    <span className="lv-row-main">
                      <span className="lv-row-title">{c.title}</span>
                      <span className="lv-row-sub">{c.mode} · {c.question_count} questions</span>
                    </span>
                    <PhaseBadge phase={campaignPhase(c)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {code && <Notice tone="ok">Joined through invite {code}.</Notice>}
      </div>

      <aside className="lv-rail" aria-label="Hub details">
        {(can(membership, "admin.members.admit") || can(membership, "admin.members.remove")) && (
          <div className="lv-panel">
            <div className="ui-spread" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>People</h2>
              {waiting > 0 && <Link to={`/${hub.slug}/members`} className="lv-link">{waiting} waiting</Link>}
            </div>
            <ul className="lv-rows">
              {accepted.slice(0, 4).map((m) => (
                <li key={m.membership_id} className="lv-row">
                  <HubMark name={m.display_name ?? "Member"} size={34} />
                  <span className="lv-row-main">
                    <span className="lv-row-title">{m.display_name ?? "Member"}</span>
                  </span>
                  <span className="lv-row-sub">{m.is_owner ? "Owner" : m.roles[0]?.name ?? "Member"}</span>
                </li>
              ))}
            </ul>
            <Link to={`/${hub.slug}/members`} className="lv-link" style={{ display: "inline-block", marginTop: 10 }}>All members</Link>
          </div>
        )}
        <div className="lv-panel lv-panel-ink">
          <span className="lv-eyebrow-mono" style={{ color: "var(--lv-accent)" }}>Share your Hub</span>
          <p style={{ margin: "8px 0 12px", fontSize: 14, opacity: 0.85 }}>Share the Hub address; joining follows the Hub's mode.</p>
          <CopyField value={`https://lunchvoice.com/${hub.slug}`} />
        </div>
        {membership.roles.length > 0 && (
          <div className="lv-panel">
            <h3 style={{ margin: "0 0 8px", font: "600 16px/1.3 var(--lv-font-ui)" }}>Your roles</h3>
            <div className="ui-row ui-gap-8">{membership.roles.map((r) => <Pill key={r.key} tone="muted">{r.name}</Pill>)}</div>
            <p className="ui-help" style={{ marginTop: 10 }}>The server decides what these allow; this page only reflects it.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ members */

export function Members() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const members = useLv(() => api.memberList(hub.hub_id), [api, hub.hub_id]);
  const roles = useLv(() => api.roleList(hub.hub_id), [api, hub.hub_id]);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>) {
    const r = await fn();
    if (r.ok) members.reload();
    else setError(describeError(r.error as never));
  }

  const accepted = members.data?.members.filter((m) => m.status === "accepted") ?? [];
  const pendingReq = members.data?.members.filter((m) => m.status === "pending") ?? [];

  return (
    <div className="ui-stack ui-gap-16">
      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}

      {pendingReq.length > 0 && (
        <Card>
          <Micro accent>Waiting on you</Micro>
          <div className="ui-table-wrap" style={{ marginTop: 8 }}>
            <table className="ui-table">
              <thead><tr><th>Member</th><th>Requested</th><th /></tr></thead>
              <tbody>
                {pendingReq.map((m) => (
                  <tr key={m.membership_id}>
                    <td>{m.display_name ?? "Member"}</td>
                    <td className="ui-muted">{m.accepted_at ? new Date(m.accepted_at).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="ui-row" style={{ justifyContent: "flex-end" }}>
                        <Btn size="sm" variant="primary" onClick={() => act(() => api.memberAdmit(m.membership_id))}>Admit</Btn>
                        <Btn size="sm" variant="quiet" onClick={() => act(() => api.memberReject(m.membership_id))}>Reject</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="ui-spread" style={{ marginBottom: 8 }}>
          <Micro>Members</Micro>
          <span className="ui-help">{accepted.length} accepted</span>
        </div>
        {members.loading && <Loading rows={3} />}
        {members.error && <ErrorNote error={members.error} />}
        {!members.loading && accepted.length === 0 && <Empty icon="roster" title="No members yet">Nobody has joined this Hub. Share the address or send an invite.</Empty>}
        {accepted.length > 0 && (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead><tr><th>Member</th><th>Roles</th><th /></tr></thead>
              <tbody>
                {accepted.map((m) => (
                  <tr key={m.membership_id}>
                    <td>
                      <span>{m.display_name ?? "Member"}</span>
                      {m.is_owner && <span style={{ marginLeft: 8 }}><Pill tone="accent">Owner</Pill></span>}
                    </td>
                    <td>
                      <div className="ui-row ui-gap-4">
                        {m.roles.length === 0 ? <span className="ui-muted" style={{ fontSize: 13 }}>—</span> : m.roles.map((r) => <Pill key={r.key}>{r.name}</Pill>)}
                      </div>
                    </td>
                    <td>
                      <div className="ui-row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {can(membership, "admin.roles.manage") && !m.is_owner && (roles.data?.roles ?? []).map((r) => {
                          const has = m.roles.some((mr) => mr.key === r.key);
                          return (
                            <Btn key={r.role_id} size="sm" variant={has ? "ink" : "outline"}
                              onClick={() => act(() => (has ? api.memberRoleUnassign(m.membership_id, r.role_id) : api.memberRoleAssign(m.membership_id, r.role_id)))}>
                              {r.name}
                            </Btn>
                          );
                        })}
                        {can(membership, "admin.members.remove") && !m.is_owner && (
                          <Btn size="sm" variant="quiet" onClick={() => act(() => api.memberRemove(m.membership_id))}>Remove</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ui-help" style={{ marginTop: 12 }}>
          Emails are never shown. The Owner is protected and cannot be removed or demoted.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ invites */

export function Invites() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const invites = useLv(() => api.inviteList(hub.hub_id), [api, hub.hub_id]);
  const [maxUses, setMaxUses] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const r = await api.inviteCreate(hub.hub_id, maxUses ? Number(maxUses) : undefined);
    if (r.ok) { setCode(r.code); invites.reload(); }
    else setError(describeError(r.error));
  }
  async function revoke(id: string) {
    const r = await api.inviteRevoke(id);
    if (r.ok) invites.reload(); else setError(describeError(r.error));
  }

  return (
    <div className="ui-stack ui-gap-16">
      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}

      <Card>
        <Micro accent>New invite</Micro>
        <p className="ui-muted" style={{ margin: "8px 0 14px", fontSize: 14 }}>
          The code is shown once. Anyone with it can join according to the Hub's joining mode.
        </p>
        <div className="ui-row" style={{ alignItems: "flex-end" }}>
          <div className="ui-field" style={{ margin: 0, maxWidth: 180 }}>
            <label className="ui-label" htmlFor="max-uses">Max uses</label>
            <input id="max-uses" className="ui-input" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="Unlimited" />
          </div>
          <Btn variant="primary" onClick={create} icon="plus">Create invite</Btn>
        </div>
        {code && (
          <div style={{ marginTop: 16 }}>
            <CopyField label="Shown once — copy it now" value={code} />
            <p className="ui-help" style={{ marginTop: 8 }}>Invite link: https://lunchvoice.com/j/{code}</p>
          </div>
        )}
      </Card>

      <Card>
        <Micro>Issued invites</Micro>
        {invites.loading && <Loading rows={2} />}
        {invites.error && <ErrorNote error={invites.error} />}
        {!invites.loading && (invites.data?.invites.length ?? 0) === 0 && (
          <div style={{ marginTop: 10 }}><Empty icon="survey" title="No invites yet">Create one when you're ready for someone to join.</Empty></div>
        )}
        {(invites.data?.invites.length ?? 0) > 0 && (
          <div className="ui-table-wrap" style={{ marginTop: 8 }}>
            <table className="ui-table">
              <thead><tr><th>State</th><th>Uses</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {invites.data!.invites.map((i) => (
                  <tr key={i.invite_id}>
                    <td><Pill tone={i.state === "active" ? "ok" : "muted"}>{i.state}</Pill></td>
                    <td className="ui-mono">{i.uses}{i.max_uses ? ` / ${i.max_uses}` : ""}</td>
                    <td className="ui-muted">{i.expires_at ? new Date(i.expires_at).toLocaleDateString() : "Never"}</td>
                    <td style={{ textAlign: "right" }}>
                      {i.state === "active" && <Btn size="sm" variant="quiet" onClick={() => revoke(i.invite_id)}>Revoke</Btn>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ roles */

export function Roles() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const roles = useLv(() => api.roleList(hub.hub_id), [api, hub.hub_id]);
  const catalog = useLv(() => api.capabilityCatalog(), [api]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("star");
  const [caps, setCaps] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const ICONS = ["star", "home", "survey", "voice", "roster", "dashboard", "bulb", "flame", "sparkle", "lock"];

  async function create() {
    setCreating(true);
    setError(null);
    const r = await api.roleCreate(hub.hub_id, name.trim().toLowerCase(), icon, caps);
    setCreating(false);
    if (r.ok) { setName(""); setCaps([]); roles.reload(); }
    else setError(describeError(r.error));
  }
  async function remove(role: Role) {
    const r = await api.roleDelete(role.role_id);
    if (r.ok) roles.reload(); else setError(describeError(r.error));
  }
  function toggle(key: string) {
    setCaps((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  }

  const slots = roles.data?.custom_slots ?? null;
  const used = roles.data?.slots_used ?? 0;

  return (
    <div className="ui-stack ui-gap-16">
      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}

      <Card>
        <div className="ui-spread" style={{ marginBottom: 12 }}>
          <Micro>Custom roles</Micro>
          {slots === null ? (
            <span className="ui-help">Plan limit not set yet</span>
          ) : (
            <div style={{ minWidth: 200 }}><Meter value={used} max={slots} label="slots used" /></div>
          )}
        </div>

        {roles.loading && <Loading rows={2} />}
        {roles.error && <ErrorNote error={roles.error} />}
        {!roles.loading && (roles.data?.roles.length ?? 0) === 0 && (
          <Empty icon="lock" title="No custom roles yet">Every member is just a member until you give them a role. The Owner always has everything.</Empty>
        )}
        {(roles.data?.roles.length ?? 0) > 0 && (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead><tr><th>Role</th><th>Capabilities</th><th>Members</th><th /></tr></thead>
              <tbody>
                {roles.data!.roles.map((r) => (
                  <tr key={r.role_id}>
                    <td><div className="ui-row ui-gap-8"><Icon name={(r.icon as never) ?? "star"} size={16} /><strong>{r.name}</strong></div></td>
                    <td className="ui-muted" style={{ fontSize: 13 }}>{r.capabilities.length} of {catalog.data ? catalog.data.groups.reduce((n, g) => n + g.capabilities.length, 0) : "…"}</td>
                    <td className="ui-mono">{r.member_count}</td>
                    <td style={{ textAlign: "right" }}><Btn size="sm" variant="quiet" onClick={() => remove(r)}>Delete</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <Micro accent>New role</Micro>
        <div className="ui-grid-2" style={{ marginTop: 12, alignItems: "start" }}>
          <div>
            <div className="ui-field">
              <label className="ui-label" htmlFor="role-name">Name</label>
              <input id="role-name" className="ui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Event lead" maxLength={40} />
            </div>
            <div className="ui-field">
              <span className="ui-label">Icon</span>
              <div className="ui-row ui-gap-4">
                {ICONS.map((i) => (
                  <button key={i} type="button" className={`ui-btn ui-btn-sm ${icon === i ? "ui-btn-ink" : "ui-btn-outline"}`} aria-pressed={icon === i} onClick={() => setIcon(i)} aria-label={i}>
                    <Icon name={i as never} size={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="ui-label">Capabilities</span>
            {catalog.loading && <Loading rows={2} />}
            {catalog.data?.groups.map((g) => (
              <div key={g.key} style={{ marginTop: 10 }}>
                <div className="ui-spread">
                  <Micro>{g.label}</Micro>
                  <button type="button" className="ui-btn ui-btn-quiet ui-btn-sm"
                    onClick={() => setCaps((c) => (g.capabilities.every((x) => c.includes(x.key)) ? c.filter((k) => !g.capabilities.some((x) => x.key === k)) : Array.from(new Set([...c, ...g.capabilities.map((x) => x.key)]))))}>
                    Toggle group
                  </button>
                </div>
                <div className="ui-stack ui-gap-4" style={{ marginTop: 6 }}>
                  {g.capabilities.map((cap) => (
                    <label key={cap.key} className="ui-check">
                      <input type="checkbox" checked={caps.includes(cap.key)} onChange={() => toggle(cap.key)} />
                      <span>{cap.label} <code className="ui-mono ui-muted" style={{ fontSize: 11 }}>{cap.key}</code></span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ui-row" style={{ marginTop: 16 }}>
          <Btn variant="primary" disabled={!name.trim() || creating} onClick={create}>{creating ? "Creating…" : "Create role"}</Btn>
          <span className="ui-help">No one can grant a capability they don't hold themselves.</span>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ pending surfaces */

function Pending({ title, sub, fn, children }: { title: string; sub: string; fn: string; children?: ReactNode }) {
  return (
    <div className="ui-stack ui-gap-16">
      <Card>
        <div className="ui-row ui-gap-8" style={{ marginBottom: 8 }}>
          <Icon name="lock" size={18} />
          <strong>{title}</strong>
          <Pill tone="accent">Not available yet</Pill>
        </div>
        <p className="ui-muted" style={{ margin: "0 0 10px" }}>{sub}</p>
        <p className="ui-help">
          Waiting on <code className="ui-mono">{fn}</code>. The UI is built; the endpoint is not. Nothing here pretends to save.
        </p>
      </Card>
      {children}
    </div>
  );
}

export function HubSettings() {
  const { hub, membership } = useHubCtx();
  return (
    <Pending
      title="Hub settings"
      sub="Name, visibility, joining mode and the email-domain restriction are read-only until the settings write lands."
      fn={PENDING_API.hubUpdate}
    >
      <Card>
        <Micro>Current state</Micro>
        <div className="ui-grid-3" style={{ marginTop: 12 }}>
          <div><Micro>Name</Micro><p style={{ margin: "4px 0 0", fontFamily: "var(--font-display)", fontSize: 18 }}>{hub.name}</p></div>
          <div><Micro>Visibility</Micro><p style={{ margin: "4px 0 0" }}>{hub.visibility}</p></div>
          <div><Micro>Joining</Micro><p style={{ margin: "4px 0 0" }}>{hub.membership_mode.replace("_", " ")}</p></div>
        </div>
        {membership?.is_owner && (
          <>
            <hr className="ui-rule" style={{ margin: "18px 0" }} />
            <Micro>Owner only</Micro>
            <p className="ui-muted" style={{ margin: "6px 0 12px", fontSize: 14 }}>
              Deleting this Hub and transferring ownership need {PENDING_API.hubDelete} and {PENDING_API.ownerTransfer}. Both stay disabled.
            </p>
            <div className="ui-row">
              <Btn variant="danger" disabled>Delete Hub</Btn>
              <Btn variant="outline" disabled>Transfer ownership</Btn>
            </div>
          </>
        )}
      </Card>
    </Pending>
  );
}

const BILLING_REPORTS = [
  "Active plan and renewal date",
  "Custom role slots in use",
  "Active Campaigns against the plan limit",
  "Active Survey-mode Campaigns against the limit",
  "Current participation against the replacement threshold",
  "Campaign windows, their length and their remaining days",
];

export function HubBilling() {
  return (
    <Pending title="Billing" sub="No billing service is connected, so this page reports nothing rather than inventing a plan or a balance." fn={PENDING_API.billingSummary}>
      <div className="ui-grid-2">
        <Card>
          <div className="ui-spread">
            <Micro>Current plan</Micro>
            <Pill>Not reported</Pill>
          </div>
          <p className="ui-muted" style={{ margin: "10px 0 14px", fontSize: 14 }}>
            Paid access fails closed until billing reports a live entitlement. Premium actions stay disabled; nothing is deleted while a plan lapses.
          </p>
          <div className="ui-row">
            <Btn variant="primary" disabled>Manage plan</Btn>
            <Btn variant="outline" disabled>Invoices</Btn>
          </div>
        </Card>
        <Card quiet>
          <Micro>Canonical prices</Micro>
          <ul className="lv-plan-list" style={{ marginTop: 10 }}>
            <li><Icon name="check" size={15} />Starter Hub · $13/month</li>
            <li><Icon name="check" size={15} />Team Hub · $29/month</li>
            <li><Icon name="check" size={15} />Campaign Starter · $19 first 2 weeks, then $13/week</li>
            <li><Icon name="check" size={15} />Hub Name Reservation · $25 per 12 months</li>
          </ul>
          <p className="ui-help" style={{ marginTop: 12 }}>
            Campaign Plus has no authoritative price yet, so it is not listed with one.
          </p>
        </Card>
      </div>
      <Card>
        <Micro>What this page will report</Micro>
        <div className="ui-stack ui-gap-8" style={{ marginTop: 10 }}>
          {BILLING_REPORTS.map((row) => (
            <div key={row} className="ui-spread" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{row}</span>
              <Pill>Not reported</Pill>
            </div>
          ))}
        </div>
      </Card>
    </Pending>
  );
}

export function HubReservation() {
  return (
    <Pending
      title="Hub Name Reservation"
      sub="$25 per 12 months and $25 to renew, with a 25-day grace period. A reservation grants no features."
      fn={PENDING_API.reservationStatus}
    >
      <div className="ui-grid-2">
        <Card>
          <div className="ui-spread">
            <Micro>This address</Micro>
            <Pill>Not reported</Pill>
          </div>
          <p className="ui-muted" style={{ margin: "10px 0 14px", fontSize: 14 }}>
            Reservation state, expiry and renewal date come from the reservation service. Until it exists, no expiry is
            displayed and nothing can be purchased.
          </p>
          <div className="ui-row">
            <Btn variant="primary" disabled>Reserve this address</Btn>
            <Btn variant="outline" disabled>Renew for 12 months</Btn>
          </div>
        </Card>
        <Card quiet>
          <Micro>Lifecycle</Micro>
          <div className="lv-lifecycle" style={{ margin: "12px 0" }}>
            <span>ACTIVE</span><i aria-hidden="true">→</i><span>GRACE · 25 days</span><i aria-hidden="true">→</i><span>RELEASED</span>
          </div>
          <p className="ui-muted" style={{ margin: 0, fontSize: 14 }}>
            After the grace period the address is released and may be claimed by another creator. A released address never
            exposes a previous owner&rsquo;s data.
          </p>
        </Card>
      </div>
    </Pending>
  );
}

export function HubDiscover() {
  const { hub } = useHubCtx();
  return (
    <Pending
      title="Discover eligibility"
      sub="Team Hubs can apply once they reach 700 genuine active members. Approval is not guaranteed."
      fn={PENDING_API.discoverApply}
    >
      <Card>
        <div className="ui-grid-2" style={{ alignItems: "center" }}>
          <Metric value={hub.member_count} label="members" hint="Guests never count toward this number." />
          <div className="ui-stack ui-gap-8">
            <Meter value={Math.min(hub.member_count, 700)} max={700} label="progress to 700 active members" />
            <span className="ui-help">
              Listing also needs an active Team plan and an approved application. Nothing is listed automatically, and no Hub
              is ever seeded into Discover.
            </span>
          </div>
        </div>
        <hr className="ui-rule" style={{ margin: "18px 0" }} />
        <div className="ui-row">
          <Btn variant="primary" disabled>Apply for Discover</Btn>
          <Link className="ui-btn ui-btn-outline" to="/discover">See the public directory</Link>
        </div>
      </Card>
    </Pending>
  );
}

/* ------------------------------------------------------------------ participant add-on pages (M2) */

const ADDONS: Record<string, { title: string; body: string }> = {
  shop: { title: "Shop", body: "Members will spend participation points on rewards the Hub offers. Points count completed Campaigns, never the content of answers." },
  leaderboard: { title: "Leaderboard", body: "Groups will be ranked by participation. Individual names appear only for members who opt in." },
  news: { title: "Newsroom", body: "Hub managers will post updates here, including what changed because of your answers." },
  post: { title: "News post", body: "A single Newsroom post will open here." },
  comments: { title: "Comments", body: "Members will discuss the Hub here. New comments are reviewed before they appear." },
  page: { title: "Custom page", body: "Hub managers will be able to add their own pages." },
};

export function HubAddon({ kind }: { kind: keyof typeof ADDONS }) {
  const { hub } = useHubCtx();
  const a = ADDONS[kind]!;
  return (
    <StateScreen
      kind="empty"
      title={`${a.title} is coming with M2.`}
      detail={a.body}
      action={<Link className="ui-btn ui-btn-outline" to={`/${hub.slug}`}>Back to {hub.name}</Link>}
    />
  );
}

/* ------------------------------------------------------------------ Hub Builder (owner) */

const PAGE_MODULES = [
  { key: "home", label: "Home and Campaigns", note: "Always on", fixed: true },
  { key: "shop", label: "Shop", note: "Coming with M2", fixed: false },
  { key: "leaderboard", label: "Leaderboard", note: "Coming with M2", fixed: false },
  { key: "news", label: "Newsroom", note: "Coming with M2", fixed: false },
  { key: "comments", label: "Comments", note: "Coming with M2", fixed: false },
  { key: "custom", label: "Custom pages", note: "Coming with M2", fixed: false },
] as const;

export function HubBuilder() {
  const { hub, membership } = useHubCtx();
  const [on, setOn] = useState<Record<string, boolean>>({ home: true });
  if (!membership?.is_owner) return <Card><Notice tone="warn">Only the Hub owner can change which pages the Hub shows.</Notice></Card>;
  const tabs = PAGE_MODULES.filter((m) => on[m.key] || m.fixed);

  return (
    <div className="lv-dash">
      <div className="lv-stack">
        <div className="lv-panel">
          <h2>Hub pages</h2>
          <p className="ui-muted" style={{ margin: "0 0 8px", fontSize: 14.5 }}>Choose which pages participants see in {hub.name}. Home and Campaigns is always on.</p>
          <ul className="lv-rows">
            {PAGE_MODULES.map((m) => (
              <li key={m.key} className="lv-row">
                <span className="lv-row-main">
                  <span className="lv-row-title">{m.label}</span>
                  <span className="lv-row-sub">{m.note}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.fixed || Boolean(on[m.key])}
                  aria-label={`${m.label} page`}
                  disabled={m.fixed}
                  className="lv-switch"
                  onClick={() => setOn((s) => ({ ...s, [m.key]: !s[m.key] }))}
                />
              </li>
            ))}
          </ul>
          <Notice tone="info">Saving Hub pages needs <code>lv_hub_pages_update</code>, which isn't available yet. Your choices below are a preview only, so nothing is saved.</Notice>
        </div>
      </div>
      <aside className="lv-rail" aria-label="Preview">
        <div className="lv-panel">
          <h3 style={{ margin: "0 0 10px", font: "600 16px/1.3 var(--lv-font-ui)" }}>Preview: participant tabs</h3>
          <div className="lv-preview-tabs" role="list">
            {tabs.map((m) => <span role="listitem" key={m.key} className="lv-preview-tab">{m.key === "home" ? "Home" : m.label}</span>)}
          </div>
          <p className="ui-help" style={{ marginTop: 10 }}>Pages that aren't live yet show a "Coming with M2" screen.</p>
        </div>
      </aside>
    </div>
  );
}
