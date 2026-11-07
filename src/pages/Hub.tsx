import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { RESERVED_SLUGS, slugProblem } from "../lib/reservedSlugs";
import type { HubInfo, HubMembership, HubPage, MembershipMode, PageKind, Role, Visibility } from "../lib/lvApi";
import { describeError, describeGate } from "../lib/errors";
import { CHECKOUT_DISABLED_REASON, PLANS } from "../config/pricing";
import { campaignPhase, LinkButton } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { HubMark } from "../ui/HubMark";
import { HubCover, onAccent } from "../ui/HubCover";
import { StateScreen } from "../ui/StateScreen";
import { BottomTabs, type TabItem } from "../ui/BottomTabs";
import { NotFoundPage } from "./Marketing";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Switch } from "@/components/shadcn/switch";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Badge } from "@/components/shadcn/badge";
import { Separator } from "@/components/shadcn/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import { QrCode } from "@/components/shadcn/blocks/qr";
import {
  CopyField,
  DisabledAction,
  EmptyState,
  Eyebrow,
  Field,
  LoadingRows,
  Metric,
  NavTabs,
  Notice,
  PhaseBadge,
  QuotaMeter,
  RowItem,
  RowList,
  SectionTitle,
  Segmented,
  StatTile,
  TypedConfirm,
} from "@/components/shadcn/blocks";

export interface HubCtx {
  hub: HubInfo;
  membership: HubMembership | null;
  reload: () => void;
}
// Participant-facing add-on pages (M2). They render in the L10 Hub cover shell for everyone.
const ADDON_PAGE = /^\/[^/]+\/(shop|leaderboard|news|comments|p)(\/|$)/;
export const useHubCtx = () => useOutletContext<HubCtx>();
export const can = (m: HubMembership | null, cap: string) => Boolean(m?.is_owner || m?.capabilities.includes(cap));
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const familyName = (f?: string) => (f === "team" ? "Team" : f === "starter" ? "Starter" : "Free");

/* ------------------------------------------------------------------ layout */

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
  if (q.loading && !q.data) return <div className="ui-page"><LoadingRows rows={3} label="Loading Hub" /></div>;
  if (q.error?.code === "lv_hub_gone") {
    return <StateScreen kind="notfound" title="This Hub is no longer available." detail="Its Owner deleted it. Nothing from it is shown here." action={<LinkButton to="/" variant="secondary">LunchVoice home</LinkButton>} />;
  }
  if (q.error || !q.data) {
    return (
      <StateScreen
        kind="notfound"
        title="Hub not available."
        detail="It may not exist, or it may be private. A private Hub answers exactly like a missing one."
        action={<div className="ui-row">{!session && <LinkButton to="/signin" state={{ from: `/${slug}` }} variant="primary">Sign in</LinkButton>}<LinkButton to="/" variant="secondary">LunchVoice home</LinkButton></div>}
      />
    );
  }

  const { hub, membership } = q.data;
  const base = `/${hub.slug}`;
  const ctx: HubCtx = { hub, membership, reload: q.reload };

  // Visitors, and everyone on a participant page, get the Hub cover (L10), not the workspace chrome.
  if (!membership || ADDON_PAGE.test(pathname)) {
    return (
      <div className="lv-l10">
        <HubCover
          name={hub.name}
          slug={hub.slug}
          accent={hub.accent}
          pills={<span className="lv-cover-pill">{hub.visibility === "public" ? "Public" : "Private"} · {hub.membership_mode.replace("_", " ")}</span>}
          action={!session ? <LinkButton to="/signin" state={{ from: base }} variant="secondary">Sign in</LinkButton> : membership ? <LinkButton to={base} variant="secondary">Open workspace</LinkButton> : undefined}
        />
        <div className="lv-l10-body"><Outlet context={ctx} /></div>
        <p className="lv-powered">Powered by <img src="/brand/lunchvoice-mark.svg" alt="" height={16} width={16} /> <strong>LunchVoice</strong></p>
      </div>
    );
  }

  const owner = membership.is_owner;
  const tabs = [
    { to: base, label: "Overview", end: true },
    { to: `${base}/campaigns`, label: "Campaigns" },
    ...(can(membership, "analytics.read") ? [{ to: `${base}/analytics`, label: "Analytics" }] : []),
    ...(can(membership, "admin.members.admit") || can(membership, "admin.members.remove") ? [{ to: `${base}/members`, label: "Members" }] : []),
    ...(can(membership, "admin.members.admit") ? [{ to: `${base}/invites`, label: "Invites" }] : []),
    ...(can(membership, "admin.roles.manage") ? [{ to: `${base}/roles`, label: "Roles" }] : []),
    ...(can(membership, "hub.settings.manage") ? [{ to: `${base}/settings`, label: "Settings" }] : []),
    ...(owner ? [{ to: `${base}/builder`, label: "Builder" }] : []),
    ...(owner || can(membership, "billing.view") ? [{ to: `${base}/billing`, label: "Billing" }] : []),
    ...(owner ? [{ to: `${base}/reservation`, label: "Reservation" }, { to: `${base}/discover`, label: "Discover" }] : []),
  ];
  const ICONS: Record<string, IconName> = {
    Overview: "home", Campaigns: "survey", Analytics: "voice", Members: "roster", Invites: "join", Roles: "star",
    Settings: "settings", Builder: "dashboard", Billing: "coin", Reservation: "lock", Discover: "sparkle",
  };
  const asTab = (t: { to: string; label: string; end?: boolean }): TabItem => ({ ...t, icon: ICONS[t.label] ?? "dashboard" });
  const primary = ["Overview", "Campaigns", "Analytics", "Members"];
  const bottom = tabs.filter((t) => primary.includes(t.label)).map(asTab);
  const more = tabs.filter((t) => !primary.includes(t.label)).map(asTab);
  const plan = hub.plan;

  return (
    <div className="ui-page">
      <div className="lv-hubhead">
        <div className="lv-hubhead-main">
          <span className="lv-hubmark-wrap" style={hub.accent ? { background: hub.accent, color: onAccent(hub.accent) } : undefined}><HubMark name={hub.name} size={64} /></span>
          <div>
            <Eyebrow accent>Hub</Eyebrow>
            <h1>{hub.name}</h1>
            <div className="ui-row">
              <Badge>{hub.visibility}</Badge>
              <Badge>{hub.membership_mode.replace("_", " ")}</Badge>
              <span className="ui-muted ui-mono lv-small">/{hub.slug}</span>
            </div>
          </div>
        </div>
        <div className="ui-row">
          {plan && <Badge variant={plan.state === "active" ? "ok" : plan.state === "expired" ? "danger" : "neutral"}>{familyName(plan.family)}{plan.state === "expired" ? " · expired" : ""}</Badge>}
          {owner && <Badge variant="ink">Owner</Badge>}
        </div>
      </div>
      {plan?.state === "expired" && (
        <Notice tone="warn" title="This Hub’s plan has ended">Premium actions are locked: new Campaigns can’t be published and roles and pages can’t change. Everything you made is kept.</Notice>
      )}
      <div className="lv-hubtabs-wrap"><NavTabs items={tabs} label="Hub sections" /></div>
      <Outlet context={ctx} />
      <BottomTabs label="Hub sections" items={bottom} more={more} />
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

export function HubOverview() {
  const { hub, membership } = useHubCtx();
  const { api, session } = useIdentity();
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
          <Eyebrow>Membership</Eyebrow>
          <h2 className="lv-detail-title">
            {hub.membership_mode === "open" ? "This Hub is open to join." : hub.membership_mode === "approval" ? "Join requests are reviewed by a manager." : "This Hub is invite only."}
          </h2>
          {hub.about && <p className="lv-m0">{hub.about}</p>}
          <p className="ui-muted lv-m0">Campaigns, members and results stay private until you’re a member.</p>
          {error && <Notice tone="error">{error}</Notice>}
          {pending && <Notice tone="ok">Request sent. A manager will review it.</Notice>}
          {!session ? (
            <LinkButton to="/signin" state={{ from: `/${hub.slug}` }} variant="primary">Sign in to join</LinkButton>
          ) : hub.membership_mode === "invite_only" ? (
            <LinkButton to="/join" variant="secondary">Use an invite code</LinkButton>
          ) : (
            <Button variant="primary" onClick={join} disabled={busy || pending}>{busy ? "Working…" : hub.membership_mode === "open" ? "Join this Hub" : "Request to join"}</Button>
          )}
        </Card>
        <Card variant="well">
          <Eyebrow>About this Hub</Eyebrow>
          <div className="ui-grid-2"><Metric value={hub.member_count} label="Members" hint="Guests never count." /><Metric value={hub.visibility} label="Visibility" /></div>
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
        <div className="lv-tiles lv-tiles-3" data-testid="hub-stats">
          <StatTile tone="ink" label="Live Campaigns" value={live} note={`${rows.length} in total`} />
          <StatTile label="Members" value={hub.member_count} note={waiting > 0 ? `${waiting} waiting on you` : "Everyone is in"} />
          <StatTile
            tone="edge"
            label="Plan"
            value={familyName(hub.plan?.family)}
            note={hub.plan?.state === "active" ? (hub.plan.ends_at ? `Until ${fmtDate(hub.plan.ends_at)}` : hub.plan.product === "founding" ? "Founding · active" : "Active") : "Premium actions locked"}
          />
        </div>
        <Card>
          <SectionTitle action={manager ? <LinkButton to={`/${hub.slug}/campaigns/new`} variant="ink" size="sm" icon="plus">New Campaign</LinkButton> : undefined}>Campaigns</SectionTitle>
          {campaigns.loading && !campaigns.data ? (
            <LoadingRows rows={3} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<Icon name="survey" size={22} />} title="No Campaigns yet">A Campaign is one set of questions with a lifecycle: draft, scheduled, open, closed.</EmptyState>
          ) : (
            <RowList>
              {rows.slice(0, 6).map((c) => (
                <RowItem key={c.campaign_id} asChild={<Link to={`/${hub.slug}/campaigns/${c.campaign_id}`} />} title={c.title} sub={`${c.mode} · ${c.question_count} questions`} trailing={<PhaseBadge phase={campaignPhase(c)} />} />
              ))}
            </RowList>
          )}
        </Card>
      </div>
      <aside className="lv-rail" aria-label="Hub details">
        {(can(membership, "admin.members.admit") || can(membership, "admin.members.remove")) && (
          <Card>
            <SectionTitle action={waiting > 0 ? <LinkButton to={`/${hub.slug}/members`} variant="quiet" size="sm">{waiting} waiting</LinkButton> : undefined}>People</SectionTitle>
            <RowList>
              {accepted.slice(0, 4).map((m) => (
                <RowItem key={m.membership_id} leading={<HubMark name={m.display_name ?? "Member"} size={34} />} title={m.display_name ?? "Member"} trailing={<span className="ui-muted lv-small">{m.is_owner ? "Owner" : m.roles[0]?.name ?? "Member"}</span>} />
              ))}
            </RowList>
            <LinkButton to={`/${hub.slug}/members`} variant="quiet" size="sm" icon="arrow">All members</LinkButton>
          </Card>
        )}
        <HubShareCard hub={hub} canInvite={can(membership, "admin.members.admit")} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ share card */

const JOIN_COPY: Record<MembershipMode, { title: string; body: string }> = {
  open: { title: "Open Hub", body: "Anyone signed in can join." },
  approval: { title: "Approval Hub", body: "Anyone can ask to join. A manager admits each request." },
  invite_only: { title: "Invite-only Hub", body: "Only people you invite can join." },
};

/** Share the Hub address. The copy follows the Hub's actual joining mode. */
export function HubShareCard({ hub, canInvite }: { hub: HubInfo; canInvite: boolean }) {
  const url = `https://lunchvoice.com/${hub.slug}`;
  const copy = JOIN_COPY[hub.membership_mode];
  const [copied, setCopied] = useState(false);
  return (
    <Card data-testid="hub-share">
      <div className="lv-stack-8">
        <h2 className="lv-share-h">{copy.title}</h2>
        <p className="ui-muted lv-m0">{copy.body}</p>
      </div>
      <p className="lv-share-url" data-testid="hub-share-url">
        <span className="ui-muted">lunchvoice.com/</span>{hub.slug}
      </p>
      <div className="lv-share-actions">
        <Button
          variant="ink"
          size="sm"
          aria-live="polite"
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Link copied"); window.setTimeout(() => setCopied(false), 1600); }
            catch { toast.error("Couldn’t copy. Select the address and copy it."); }
          }}
        >
          <Icon name={copied ? "check" : "join"} size={16} />{copied ? "Copied" : "Copy link"}
        </Button>
        <Dialog>
          <DialogTrigger asChild><Button variant="secondary" size="sm">QR code</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>QR code for {hub.name}</DialogTitle>
              <DialogDescription>Scanning it opens lunchvoice.com/{hub.slug}. {copy.body}</DialogDescription>
            </DialogHeader>
            <QrCode value={url} label={`QR code for lunchvoice.com/${hub.slug}`} size={220} />
          </DialogContent>
        </Dialog>
        {canInvite && <LinkButton to={`/${hub.slug}/invites`} variant="secondary" size="sm">Invite</LinkButton>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ members */

export function Members() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const members = useLv(() => api.memberList(hub.hub_id), [api, hub.hub_id]);
  const roles = useLv(() => api.roleList(hub.hub_id), [api, hub.hub_id]);
  const [query, setQuery] = useState("");

  async function act(fn: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>, done: string) {
    const r = await fn();
    if (r.ok) { toast.success(done); members.reload(); }
    else toast.error(describeError(r.error as never));
  }
  const match = (n: string | null) => (n ?? "Member").toLowerCase().includes(query.toLowerCase());
  const accepted = members.data?.members.filter((m) => m.status === "accepted" && match(m.display_name)) ?? [];
  const pendingReq = members.data?.members.filter((m) => m.status === "pending") ?? [];

  return (
    <div className="lv-stack-16">
      {pendingReq.length > 0 && (
        <Card>
          <SectionTitle>Waiting on you</SectionTitle>
          <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
            <TableBody>
              {pendingReq.map((m) => (
                <TableRow key={m.membership_id}>
                  <TableCell>{m.display_name ?? "Member"}</TableCell>
                  <TableCell>
                    <div className="lv-member-actions">
                      <Button size="sm" variant="ink" onClick={() => act(() => api.memberAdmit(m.membership_id), "Admitted")}>Admit</Button>
                      <Button size="sm" variant="quiet" onClick={() => act(() => api.memberReject(m.membership_id), "Rejected")}>Reject</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Card>
        <SectionTitle action={<span className="ui-muted lv-small">{accepted.length} shown</span>}>Members</SectionTitle>
        <Field label="Search members" htmlFor="m-search"><Input id="m-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name" /></Field>
        {members.loading && !members.data && <LoadingRows rows={3} />}
        {members.error && <Notice tone="error">{describeError(members.error)}</Notice>}
        {members.data && accepted.length === 0 && <EmptyState icon={<Icon name="roster" size={22} />} title={query ? "No one matches" : "No members yet"}>Share the address or send an invite.</EmptyState>}
        {accepted.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Roles</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {accepted.map((m) => (
                <TableRow key={m.membership_id}>
                  <TableCell><span className="lv-member-name">{m.display_name ?? "Member"} {m.is_owner && <Badge variant="ink">Owner</Badge>}</span></TableCell>
                  <TableCell><div className="ui-row">{m.roles.length === 0 ? <span className="ui-muted">—</span> : m.roles.map((r) => <Badge key={r.key}>{r.name}</Badge>)}</div></TableCell>
                  <TableCell>
                    <div className="lv-member-actions">
                      {can(membership, "admin.roles.manage") && !m.is_owner && (roles.data?.roles ?? []).map((r) => {
                        const has = m.roles.some((mr) => mr.key === r.key);
                        return (
                          <Button key={r.role_id} size="sm" variant={has ? "ink" : "secondary"} aria-pressed={has}
                            onClick={() => act(() => (has ? api.memberRoleUnassign(m.membership_id, r.role_id) : api.memberRoleAssign(m.membership_id, r.role_id)), has ? `Removed ${r.name}` : `Gave ${r.name}`)}>
                            {r.name}
                          </Button>
                        );
                      })}
                      {can(membership, "admin.members.remove") && !m.is_owner && <Button size="sm" variant="quiet" onClick={() => act(() => api.memberRemove(m.membership_id), "Removed")}>Remove</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="ui-help lv-m0">Emails are never shown. The Owner is protected and can’t be removed or demoted. Guests are never members.</p>
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

  async function create() {
    const r = await api.inviteCreate(hub.hub_id, maxUses ? Number(maxUses) : undefined);
    if (r.ok) { setCode(r.code); invites.reload(); toast.success("Invite created. Copy it now."); }
    else toast.error(describeError(r.error));
  }
  async function revoke(id: string) {
    const r = await api.inviteRevoke(id);
    if (r.ok) { invites.reload(); toast.success("Invite revoked"); } else toast.error(describeError(r.error));
  }

  return (
    <div className="lv-stack-16">
      <Card>
        <SectionTitle>New invite</SectionTitle>
        <p className="ui-muted lv-m0">The code is shown once. Anyone with it can join according to the Hub’s joining mode.</p>
        <div className="lv-invite-form">
          <Field label="Max uses" htmlFor="max-uses" help="Leave empty for no limit.">
            <Input id="max-uses" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="No limit" aria-describedby="max-uses-help" />
          </Field>
          <Button variant="primary" onClick={create}><Icon name="plus" size={16} />Create invite</Button>
        </div>
        {code && (
          <>
            <CopyField label="Shown once: copy it now" value={code} />
            <CopyField label="Invite link" value={`https://lunchvoice.com/j/${code}`} />
          </>
        )}
      </Card>
      <Card>
        <SectionTitle>Issued invites</SectionTitle>
        {invites.loading && !invites.data && <LoadingRows rows={2} />}
        {invites.error && <Notice tone="error">{describeError(invites.error)}</Notice>}
        {invites.data && invites.data.invites.length === 0 && <EmptyState icon={<Icon name="join" size={22} />} title="No invites yet">Create one when you’re ready for someone to join.</EmptyState>}
        {(invites.data?.invites.length ?? 0) > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>State</TableHead><TableHead>Uses</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {invites.data!.invites.map((i) => (
                <TableRow key={i.invite_id}>
                  <TableCell><Badge variant={i.state === "active" ? "ok" : "neutral"}>{i.state}</Badge></TableCell>
                  <TableCell className="ui-mono">{i.uses}{i.max_uses ? ` / ${i.max_uses}` : ""}</TableCell>
                  <TableCell className="ui-muted">{i.expires_at ? fmtDate(i.expires_at) : "Never"}</TableCell>
                  <TableCell className="text-right">{i.state === "active" && <Button size="sm" variant="quiet" onClick={() => revoke(i.invite_id)}>Revoke</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ roles */

const ROLE_ICONS: IconName[] = ["star", "home", "survey", "voice", "roster", "dashboard", "bulb", "flame", "sparkle", "lock"];

export function Roles() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const roles = useLv(() => api.roleList(hub.hub_id), [api, hub.hub_id]);
  const catalog = useLv(() => api.capabilityCatalog(), [api]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconName>("star");
  const [caps, setCaps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const total = catalog.data ? catalog.data.groups.reduce((n, g) => n + g.capabilities.length, 0) : null;
  const slots = roles.data?.custom_slots ?? null;
  const used = roles.data?.slots_used ?? 0;
  const full = slots !== null && used >= slots;

  async function create() {
    setBusy(true);
    const r = await api.roleCreate(hub.hub_id, name.trim().toLowerCase(), icon, caps);
    setBusy(false);
    if (r.ok) { setName(""); setCaps([]); roles.reload(); toast.success("Role created"); }
    else toast.error(describeError(r.error));
  }
  async function remove(role: Role) {
    const r = await api.roleDelete(role.role_id);
    if (r.ok) { roles.reload(); toast.success("Role deleted"); } else toast.error(describeError(r.error));
  }
  const toggle = (key: string) => setCaps((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  return (
    <div className="lv-stack-16">
      <Card>
        <SectionTitle>Custom roles</SectionTitle>
        <QuotaMeter label="Role slots" used={used} limit={slots} hint="The Owner never uses a slot." />
        {roles.loading && !roles.data && <LoadingRows rows={2} />}
        {roles.error && <Notice tone="error">{describeError(roles.error)}</Notice>}
        {roles.data && roles.data.roles.length === 0 && <EmptyState icon={<Icon name="star" size={22} />} title="No custom roles yet">Every member is just a member until you give them a role. The Owner always has everything.</EmptyState>}
        {(roles.data?.roles.length ?? 0) > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Permissions</TableHead><TableHead>Members</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {roles.data!.roles.map((r) => (
                <TableRow key={r.role_id}>
                  <TableCell><span className="lv-member-name"><Icon name={(ROLE_ICONS.includes(r.icon as IconName) ? r.icon : "star") as IconName} size={16} /><strong>{r.name}</strong></span></TableCell>
                  <TableCell className="ui-muted">{r.capabilities.length} of {total ?? "…"}</TableCell>
                  <TableCell className="ui-mono">{r.member_count}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="quiet" onClick={() => remove(r)}>Delete</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <SectionTitle>New role</SectionTitle>
        {full && <Notice tone="warn">All {slots} role slots are in use. Delete a role, or move to a plan with more slots once billing opens.</Notice>}
        <div className="ui-grid-2">
          <Field label="Name" htmlFor="role-name" counter={{ value: name.length, max: 40 }}>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Event lead" maxLength={40} disabled={full} />
          </Field>
          <Field label="Icon">
            <Segmented<IconName> label="Role icon" value={icon} onValueChange={setIcon} disabled={full} options={ROLE_ICONS.slice(0, 6).map((i) => ({ value: i, label: <Icon name={i} size={16} /> }))} />
          </Field>
        </div>
        <div className="lv-caps">
          {catalog.loading && !catalog.data && <LoadingRows rows={2} />}
          {catalog.data?.groups.map((g) => (
            <div key={g.key} className="lv-cap-group">
              <Eyebrow>{g.label}</Eyebrow>
              {g.capabilities.map((cap) => (
                <label key={cap.key} className="lv-check-row">
                  <Checkbox checked={caps.includes(cap.key)} onCheckedChange={() => toggle(cap.key)} disabled={full} />
                  <span>{cap.label} <code>{cap.key}</code></span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="ui-row">
          <Button variant="primary" disabled={!name.trim() || busy || full} onClick={create}>{busy ? "Creating…" : "Create role"}</Button>
          <span className="ui-help">No one can grant a permission they don’t hold themselves.</span>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

export function HubSettings() {
  const { hub, membership, reload } = useHubCtx();
  const { api } = useIdentity();
  const nav = useNavigate();
  const [name, setName] = useState(hub.name);
  const [about, setAbout] = useState(hub.about ?? "");
  const [visibility, setVisibility] = useState<Visibility>(hub.visibility);
  const [mode, setMode] = useState<MembershipMode>(hub.membership_mode);
  const [accent, setAccent] = useState<string | null>(hub.accent ?? null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [heir, setHeir] = useState<string>("");
  const owner = membership?.is_owner;
  const members = useLv(() => (owner ? api.memberList(hub.hub_id) : Promise.resolve({ ok: true as const, members: [] })), [api, hub.hub_id, owner]);
  const heirs = members.data?.members.filter((m) => m.status === "accepted" && !m.is_owner) ?? [];
  const palette = hub.accent_palette ?? [];
  const dirty = name.trim() !== hub.name || about !== (hub.about ?? "") || visibility !== hub.visibility || mode !== hub.membership_mode || accent !== (hub.accent ?? null);

  async function save() {
    setSaving(true);
    const r = await api.hubUpdate(hub.hub_id, {
      display_name: name.trim() !== hub.name ? name.trim() : undefined,
      about: about !== (hub.about ?? "") ? about : undefined,
      visibility: visibility !== hub.visibility ? visibility : undefined,
      membership_mode: mode !== hub.membership_mode ? mode : undefined,
      accent: accent && accent !== hub.accent ? accent : undefined,
    });
    setSaving(false);
    if (r.ok) { toast.success("Settings saved"); reload(); } else toast.error(describeError(r.error));
  }

  return (
    <div className="lv-stack-16">
      <Card>
        <SectionTitle>Hub details</SectionTitle>
        <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Name" htmlFor="h-name" counter={{ value: name.length, max: 60 }}>
            <Input id="h-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="About" htmlFor="h-about" help="Shown on the Hub’s landing page." counter={{ value: about.length, max: 500 }}>
            <Textarea id="h-about" value={about} maxLength={500} onChange={(e) => setAbout(e.target.value)} aria-describedby="h-about-help" />
          </Field>
          <div className="ui-grid-2">
            <Field label="Visibility" htmlFor="h-vis" help={visibility === "private" ? "Only members can see it. To everyone else it looks like it doesn’t exist." : "Anyone with the address can see the landing page."}>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger id="h-vis"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Joining" htmlFor="h-mode">
              <Select value={mode} onValueChange={(v) => setMode(v as MembershipMode)}>
                <SelectTrigger id="h-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open: anyone signed in can join</SelectItem>
                  <SelectItem value="approval">Approval: a manager admits requests</SelectItem>
                  <SelectItem value="invite_only">Invite only: invite codes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Hub color" help="Only colors that keep text readable are offered.">
            <div className="lv-swatches" role="radiogroup" aria-label="Hub color">
              {palette.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={accent === c} aria-label={c} className="lv-swatch" style={{ background: c }} onClick={() => setAccent(c)} />
              ))}
              {palette.length === 0 && <span className="ui-muted">No palette from the server yet.</span>}
            </div>
          </Field>
          <div className="ui-row"><Button type="submit" variant="ink" disabled={!dirty || saving || !name.trim()}>{saving ? "Saving…" : "Save settings"}</Button></div>
        </form>
      </Card>

      {owner && (
        <Card>
          <SectionTitle>Owner only</SectionTitle>
          {dangerError && <Notice tone="error">{dangerError}</Notice>}
          <div className="lv-stack-16">
            <div className="lv-stack-8">
              <strong>Transfer ownership</strong>
              <p className="ui-muted lv-m0">The new Owner gets everything, and you become a regular member.</p>
              {heirs.length === 0 ? (
                <p className="ui-help lv-m0">Only accepted members can become Owner. Invite someone first.</p>
              ) : (
                <div className="lv-invite-form">
                  <Field label="New Owner" htmlFor="heir">
                    <Select value={heir} onValueChange={setHeir}>
                      <SelectTrigger id="heir"><SelectValue placeholder="Pick a member" /></SelectTrigger>
                      <SelectContent>{heirs.map((m) => <SelectItem key={m.membership_id} value={m.membership_id}>{m.display_name ?? "Member"}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <TypedConfirm
                    trigger={<Button variant="secondary" disabled={!heir}>Transfer</Button>}
                    title="Transfer ownership?"
                    description={`${heirs.find((m) => m.membership_id === heir)?.display_name ?? "This member"} becomes the Owner of ${hub.name}. You can’t undo this yourself.`}
                    phrase={hub.slug}
                    actionLabel="Transfer ownership"
                    busy={busy}
                    onConfirm={async (typed) => {
                      setBusy(true);
                      const r = await api.ownerTransfer(hub.hub_id, heir, typed);
                      setBusy(false);
                      if (!r.ok) { setDangerError(describeError(r.error)); return false; }
                      toast.success("Ownership transferred");
                      reload();
                      return true;
                    }}
                  />
                </div>
              )}
            </div>
            <Separator />
            <div className="lv-stack-8">
              <strong>Delete this Hub</strong>
              <p className="ui-muted lv-m0">Deletes the Hub, its Campaigns, members and results. Its address is held for 30 days before anyone can claim it.</p>
              <div className="ui-row">
                <TypedConfirm
                  trigger={<Button variant="danger">Delete Hub</Button>}
                  title={`Delete ${hub.name}?`}
                  description="This deletes the Hub with its Campaigns, members and results. It can’t be undone. The address is held for 30 days before anyone can claim it."
                  phrase={hub.slug}
                  actionLabel="Delete Hub"
                  busy={busy}
                  onConfirm={async (typed) => {
                    setBusy(true);
                    const r = await api.hubDelete(hub.hub_id, typed);
                    setBusy(false);
                    if (!r.ok) { setDangerError(describeError(r.error)); return false; }
                    toast.success(`${hub.name} was deleted`);
                    nav("/me");
                    return true;
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ billing */

export function HubBilling() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const summary = useLv(() => api.billingSummary(hub.hub_id), [api, hub.hub_id]);
  const s = summary.data;
  const lim = (k: string) => (s?.limits[k] ?? null) as number | null;
  return (
    <div className="lv-stack-16">
      {summary.loading && !s && <LoadingRows rows={4} />}
      {summary.error && <Notice tone="error">{describeError(summary.error)}</Notice>}
      {s && (
        <>
          <div className="ui-grid-2">
            <Card variant="ink">
              <Eyebrow accent>Current plan</Eyebrow>
              <h2 className="lv-resume-title">{familyName(s.plan.family)}{s.plan.product === "founding" ? " · Founding" : ""}</h2>
              <dl className="lv-kv lv-kv-ink">
                <dt>State</dt><dd>{s.plan.state}</dd>
                <dt>Started</dt><dd>{fmtDate(s.plan.starts_at)}</dd>
                <dt>Ends</dt><dd>{s.plan.ends_at ? fmtDate(s.plan.ends_at) : s.plan.product === "founding" ? "30 days after billing opens" : "—"}</dd>
              </dl>
              {s.plan.state !== "active" && <p className="lv-m0">Premium actions are locked. Nothing has been deleted.</p>}
            </Card>
            <Card>
              <SectionTitle>Usage</SectionTitle>
              <QuotaMeter label="Custom roles" used={s.usage.custom_roles} limit={lim("roles.max_custom")} />
              <QuotaMeter label="Custom pages" used={s.usage.custom_pages} limit={lim("pages.max_custom")} />
              <QuotaMeter label="Active Campaigns" used={s.usage.active_campaigns} limit={lim("campaigns.max_active")} />
              <QuotaMeter label="Active surveys" used={s.usage.active_surveys} limit={lim("surveys.max_active")} />
            </Card>
          </div>
          <Card>
            <SectionTitle>Change plan</SectionTitle>
            <div className="lv-price-cards">
              {PLANS.filter((p) => p.id === "starter" || p.id === "team").map((p) => (
                <Card key={p.id} variant="well" size="sm">
                  <strong>{p.name}</strong>
                  <div className="lv-price-figure"><strong>{p.priceLabel}</strong><span>{p.cadence}</span></div>
                </Card>
              ))}
            </div>
            <DisabledAction reason={CHECKOUT_DISABLED_REASON}>Choose a plan</DisabledAction>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ reservation */

export function HubReservation() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const status = useLv(() => api.reservationStatus(hub.slug), [api, hub.slug]);
  const [check, setCheck] = useState("");
  const [checked, setChecked] = useState<{ slug: string; state: string } | null>(null);
  const reservation = PLANS.find((p) => p.id === "reservation")!;
  const st = status.data;

  useEffect(() => setChecked(null), [check]);

  return (
    <div className="lv-stack-16">
      <div className="ui-grid-2">
        <Card>
          <SectionTitle>This address</SectionTitle>
          <p className="ui-mono lv-m0">lunchvoice.com/{hub.slug}</p>
          {status.loading && !st ? <LoadingRows rows={1} /> : status.error ? <Notice tone="error">{describeError(status.error)}</Notice> : st && (
            <dl className="lv-kv">
              <dt>Reservation</dt><dd>{st.state === "taken" ? "Not reserved (in use by this Hub)" : st.state}</dd>
              {st.expires_at && <><dt>Expires</dt><dd>{fmtDate(st.expires_at)}</dd></>}
              {st.grace_ends_at && <><dt>Grace ends</dt><dd>{fmtDate(st.grace_ends_at)}</dd></>}
            </dl>
          )}
          <div className="lv-price-figure"><strong>{reservation.priceLabel}</strong><span>{reservation.cadence}</span></div>
          <DisabledAction reason={CHECKOUT_DISABLED_REASON}>Reserve this address</DisabledAction>
        </Card>
        <Card variant="well">
          <SectionTitle>How a reservation works</SectionTitle>
          <div className="lv-lifecycle"><span data-on={st?.state === "active" || undefined}>ACTIVE</span><i aria-hidden="true">→</i><span data-on={st?.state === "grace" || undefined}>GRACE · 25 days</span><i aria-hidden="true">→</i><span data-on={st?.state === "released" || undefined}>RELEASED</span></div>
          <p className="ui-muted lv-m0">A reservation keeps an address for 12 months and grants no paid features. After it expires there are 25 days to renew; then the address is released. A released address never shows a previous owner’s data.</p>
        </Card>
      </div>
      <Card>
        <SectionTitle>Check another address</SectionTitle>
        <form className="lv-invite-form" onSubmit={async (e) => {
          e.preventDefault();
          const slug = check.trim().toLowerCase();
          if (slugProblem(slug)) return setChecked({ slug, state: slugProblem(slug) === "reserved" ? "reserved for the platform" : "not a valid address" });
          const r = await api.reservationStatus(slug);
          setChecked({ slug, state: r.ok ? r.state : describeError(r.error) });
        }}>
          <Field label="Address" htmlFor="res-check"><Input id="res-check" value={check} onChange={(e) => setCheck(e.target.value)} placeholder="harbor-book-circle" /></Field>
          <Button type="submit" variant="ink" disabled={!check.trim()}>Check</Button>
        </form>
        {checked && <Notice tone={checked.state === "available" ? "ok" : "info"}>lunchvoice.com/{checked.slug}: {checked.state}.</Notice>}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Discover */

export function HubDiscover() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [sent, setSent] = useState(false);
  async function apply() {
    setBusy(true);
    setReasons(null);
    const r = await api.discoverApply(hub.hub_id);
    setBusy(false);
    if (r.ok) { setSent(true); toast.success("Application sent"); }
    else if (r.error.code === "lv_gate_blocked") setReasons(describeGate(r.error.reasons));
    else toast.error(describeError(r.error));
  }
  return (
    <div className="ui-grid-2">
      <Card>
        <SectionTitle>Discover eligibility</SectionTitle>
        <p className="ui-muted lv-m0">Team Hubs can apply to be listed in Discover once they reach 700 genuine active members. Approval isn’t automatic. Quick Surveys are never listed.</p>
        <QuotaMeter label="Genuine active members" used={Math.min(hub.member_count, 700)} limit={700} hint="Guests, duplicates and bots never count." />
        <QuotaMeter label="Plan" used={hub.plan?.family === "team" ? 1 : 0} limit={1} hint={hub.plan?.family === "team" ? "Team plan" : "Needs the Team plan"} />
        {reasons && <Notice tone="warn" title="Not eligible yet">{reasons.join(" ")}</Notice>}
        {sent ? <Notice tone="ok">Application sent. We’ll review it.</Notice> : <Button variant="primary" onClick={apply} disabled={busy}>{busy ? "Checking…" : "Apply for Discover"}</Button>}
      </Card>
      <Card variant="well">
        <SectionTitle>What Discover is</SectionTitle>
        <p className="ui-muted lv-m0">A public directory of large, active communities that chose to be found. Nothing is listed automatically and no Hub is ever seeded into it.</p>
        <LinkButton to="/discover" variant="secondary">See the directory</LinkButton>
      </Card>
    </div>
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
  return <StateScreen kind="empty" title={`${a.title} is coming with M2.`} detail={a.body} action={<LinkButton to={`/${hub.slug}`} variant="secondary">Back to {hub.name}</LinkButton>} />;
}

/* ------------------------------------------------------------------ Hub Builder (owner) */

const KIND_LABEL: Record<PageKind, string> = { home: "Home", campaigns: "Campaigns", custom: "Custom page", shop: "Shop", leaderboard: "Leaderboard", news: "Newsroom", comments: "Comments" };
const ADDON_KINDS: PageKind[] = ["shop", "leaderboard", "news", "comments"];

export function HubBuilder() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const data = useLv(() => api.hubPagesGet(hub.hub_id), [api, hub.hub_id]);
  const [pages, setPages] = useState<HubPage[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  useEffect(() => { if (data.data) setPages(data.data.pages); }, [data.data]);

  if (!membership?.is_owner) return <Notice tone="warn">Only the Hub Owner can change which pages the Hub shows.</Notice>;
  if (data.loading && !pages) return <LoadingRows rows={4} />;
  if (data.error) return <Notice tone="error">{describeError(data.error)}</Notice>;
  if (!pages) return null;

  const limit = data.data?.custom_slots.limit ?? null;
  const custom = pages.filter((p) => p.kind === "custom").length;
  const dirty = JSON.stringify(pages) !== JSON.stringify(data.data?.pages);
  const move = (i: number, by: number) => setPages((ps) => { const next = [...ps!]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); return next.map((p, j) => ({ ...p, position: j })); });

  async function save() {
    setSaving(true);
    const r = await api.hubPagesUpdate(hub.hub_id, pages!);
    setSaving(false);
    if (r.ok) { toast.success("Pages saved"); data.reload(); } else toast.error(describeError(r.error));
  }

  return (
    <div className="lv-builder">
      <Card>
        <SectionTitle action={<Button variant="ink" size="sm" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save pages"}</Button>}>Hub pages</SectionTitle>
        <QuotaMeter label="Custom page slots" used={custom} limit={limit} />
        <div>
          {pages.map((p, i) => {
            const fixed = p.kind === "home";
            const soon = ADDON_KINDS.includes(p.kind) || p.kind === "custom";
            return (
              <div key={p.key} className="lv-page-row">
                <span className="lv-outline-move">
                  <Button variant="quiet" size="icon-sm" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevron" size={14} className="lv-rot180" /></Button>
                  <Button variant="quiet" size="icon-sm" aria-label={`Move ${p.title} down`} disabled={i === pages.length - 1} onClick={() => move(i, 1)}><Icon name="chevron" size={14} /></Button>
                </span>
                <div className="lv-page-row-main">
                  <strong>{p.title}</strong>
                  <span>{KIND_LABEL[p.kind]}{fixed ? " · always on" : soon ? " · Coming with M2" : ""}</span>
                </div>
                {p.kind === "custom" && <Button variant="quiet" size="sm" onClick={() => setPages((ps) => ps!.filter((x) => x.key !== p.key))}>Remove</Button>}
                <Switch aria-label={`${p.title} page`} checked={p.enabled} disabled={fixed} onCheckedChange={(on) => setPages((ps) => ps!.map((x) => (x.key === p.key ? { ...x, enabled: on } : x)))} />
              </div>
            );
          })}
        </div>
        <form className="lv-invite-form" onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          setPages((ps) => [...ps!, { key: `custom-${Date.now().toString(36)}`, kind: "custom", title: newTitle.trim(), body: "", position: ps!.length, enabled: true }]);
          setNewTitle("");
        }}>
          <Field label="New custom page" htmlFor="new-page"><Input id="new-page" value={newTitle} maxLength={40} onChange={(e) => setNewTitle(e.target.value)} placeholder="Route maps" disabled={limit !== null && custom >= limit} /></Field>
          <Button type="submit" variant="secondary" disabled={!newTitle.trim() || (limit !== null && custom >= limit)}><Icon name="plus" size={16} />Add page</Button>
        </form>
        {limit !== null && custom >= limit && <p className="ui-help lv-m0">All {limit} custom page slots are in use.</p>}
        {limit === 0 && <p className="ui-help lv-m0">Custom pages need an active Hub plan.</p>}
      </Card>
      <Card variant="well">
        <Eyebrow>Preview: what members see</Eyebrow>
        <div className="lv-preview-phone">
          <div className="lv-preview-cover" style={{ background: hub.accent ?? "#14110f", color: hub.accent ? onAccent(hub.accent) : "#fff" }}>
            <b>{hub.name}</b>
            <nav aria-label="Preview tabs">
              {pages.filter((p) => p.enabled).map((p) => <span key={p.key} data-soon={p.kind !== "home" && p.kind !== "campaigns" ? "" : undefined}>{p.title}</span>)}
            </nav>
          </div>
          <Card size="sm"><strong>Campaigns</strong><span className="ui-muted lv-small">Live Campaigns appear here.</span></Card>
        </div>
        <p className="ui-help lv-m0">Pages that aren’t built yet show a “Coming with M2” screen to members.</p>
      </Card>
    </div>
  );
}
