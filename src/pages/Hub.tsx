import { LvMark } from "../components/LvMark";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { RESERVED_SLUGS, slugProblem } from "../lib/reservedSlugs";
import type { HubInfo, HubMembership, Member, HubPage, MembershipMode, PageKind, Role, Visibility } from "../lib/lvApi";
import { describeError, describeGate } from "../lib/errors";
import { PLANS } from "../config/pricing";
import { useBillingReason } from "../lib/billingNotice";
import { SUPPORT_EMAIL, supportMailto } from "../config/contact";
import { ReportDialog } from "../components/ReportDialog";
import { campaignPhase, LinkButton, modeLabel } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { HubMark } from "../ui/HubMark";
import { HubProfile } from "../ui/HubProfile";
import { ShareHubDialog } from "../components/ShareHub";
import { IconBadge } from "../components/IconBadge";
import { accentVars, onAccent } from "../lib/accent";
import { HubAppearance } from "./HubAppearance";
import { StateScreen } from "../ui/StateScreen";
import { BottomTabs, type TabItem } from "../ui/BottomTabs";
import { NotFoundPage } from "./Marketing";
import { CommunityNav, CommunityPage, PageEditor } from "./Community";
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
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { ConfirmAction } from "./Studio";
/* ---- track D: api + discord ---- */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Progress } from "@/components/shadcn/progress";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { HubApiSettings, HubDiscordSettings } from "./Integrations";
/* ---- end track D ---- */
import { QrCode } from "@/components/shadcn/blocks/qr";
import {
  CopyField,
  DisabledAction,
  EmptyState,
  Eyebrow,
  Field,
  LoadingRows,
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
  /* ---- staff panel: Hub suspension (000023) ---- */
  // Members and visitors see a neutral state; the Owner keeps the workspace with the reason. Nothing is deleted.
  if (hub.suspension?.suspended && !membership?.is_owner) {
    return <StateScreen kind="notfound" title="This Hub is suspended." detail="It isn’t available right now. Nothing has been deleted." action={<LinkButton to="/" variant="secondary">LunchVoice home</LinkButton>} />;
  }
  /* ---- end staff panel ---- */
  const ctx: HubCtx = { hub, membership, reload: q.reload };

  // Visitors, and everyone on a participant page, get the Hub cover (L10), not the workspace chrome.
  if (!membership || ADDON_PAGE.test(pathname)) {
    return (
      <div className="lv-l10 lv-hubscope" style={accentVars(hub.accent_hex ?? null)}>
        <HubProfile
          hub={hub}
          actions={
            <>
              <ShareHubDialog hub={hub} trigger={<Button variant="secondary" data-testid="hub-share-open"><Icon name="join" size={16} />Share</Button>} />
              {membership && <LinkButton to={base} variant="primary">Open workspace</LinkButton>}
            </>
          }
        />
        <div className="lv-l10-body"><CommunityNav slug={hub.slug} hubId={hub.hub_id} /><Outlet context={ctx} /></div>
        <p className="lv-powered">Powered by <LvMark size={16} /> <strong>LunchVoice</strong></p>
      </div>
    );
  }

  const owner = membership.is_owner;
  const tabs = [
    { to: base, label: "Overview", end: true },
    { to: `${base}/campaigns`, label: "Campaigns" },
    ...(can(membership, "analytics.read") ? [{ to: `${base}/analytics`, label: "Analytics" }, { to: `${base}/trends`, label: "Trends" }] : []),
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
    <div className="ui-page lv-hubscope" style={accentVars(hub.accent_hex ?? null)} data-accent={hub.accent ?? undefined}>
      <HubProfile
        hub={hub}
        owner={owner}
        compact
        actions={
          <>
            {plan?.state === "expired" && <Badge variant="danger">{familyName(plan.family)} · ended</Badge>}
            <ShareHubDialog hub={hub} trigger={<Button variant="secondary" size="md" data-testid="hub-share-open"><Icon name="join" size={16} />Share</Button>} />
            {!owner && session && <HubReportMenu hub={hub} />}
          </>
        }
      />
      {/* ---- staff panel: Hub suspension ---- */}
      {hub.suspension?.suspended && (
        <Notice tone="error" title="This Hub is suspended" className="lv-suspended-notice">
          LunchVoice staff suspended it{hub.suspension.reason ? `: ${hub.suspension.reason}` : "."} Members can’t see it, its Campaigns don’t take responses and nothing new can be published. Everything is kept. To appeal, write to <a href={supportMailto("Appeal: Hub suspension")}>{SUPPORT_EMAIL}</a>.
        </Notice>
      )}
      {plan?.state === "expired" && (
        <Notice tone="warn" title="This Hub’s plan has ended">Premium actions are locked: new Campaigns can’t be published and roles and pages can’t change. Everything you made is kept.</Notice>
      )}
      {/* Editors (the Campaign Studio) take the full width: no rail, so the question outline and preview have room. */}
      <div className={/\/studio$/.test(pathname) ? "lv-hubshell lv-hubshell-editor" : "lv-hubshell"}>
        {!/\/studio$/.test(pathname) && <HubRail items={tabs} icons={ICONS} />}
        <div className="lv-hubmain">
          <CommunityNav slug={hub.slug} hubId={hub.hub_id} />
          <Outlet context={ctx} />
        </div>
      </div>
      <BottomTabs label="Hub sections" items={bottom} more={more} />
    </div>
  );
}

/** A disabled purchase button that says when billing opens (the real date once staff have set one). */
function BillingDisabled({ children }: { children: React.ReactNode }) {
  const reason = useBillingReason();
  return <DisabledAction reason={reason}>{children}</DisabledAction>;
}

/** The Hub's sections as a rail, grouped like a channel list (Hub Console). Phones keep the bottom bar. */
const RAIL_GROUPS: { heading: string; labels: string[] }[] = [
  { heading: "Hub", labels: ["Overview", "Campaigns", "Analytics"] },
  { heading: "People", labels: ["Members", "Invites", "Roles"] },
  { heading: "Manage", labels: ["Settings", "Builder", "Billing", "Reservation", "Discover"] },
];
function HubRail({ items, icons }: { items: { to: string; label: string; end?: boolean }[]; icons: Record<string, IconName> }) {
  return (
    <nav className="lv-hubrail" aria-label="Hub sections">
      {RAIL_GROUPS.map((g) => {
        const links = items.filter((i) => g.labels.includes(i.label));
        if (!links.length) return null;
        return (
          <div className="lv-rail-group" key={g.heading}>
            <p className="lv-rail-heading">{g.heading}</p>
            {links.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className="lv-rail-link" data-slot="nav-tab">
                <Icon name={icons[i.label] ?? "dashboard"} size={18} />
                {i.label}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

/** "Report this Hub" for anyone who is not its owner (000029). Staff review it; the Hub's owner is never told who reported. */
function HubReportMenu({ hub }: { hub: HubInfo }) {
  const { api } = useIdentity();
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="quiet" aria-label="Hub options" data-testid="hub-options"><Icon name="more" size={18} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)} data-testid="report-hub">Report this Hub</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        title={`Report ${hub.name}`}
        description="LunchVoice staff review it and can act on the Hub. Its owner is never told who reported it."
        onSend={async (reason, details) => {
          const r = await api.reportHub(hub.slug, reason, details);
          if (!r.ok) return describeError(r.error);
          toast.success(r.duplicate ? "You’ve already reported this Hub. Staff will review it." : "Report sent to LunchVoice staff");
          return null;
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ overview */

type SetupStep = { key: string; title: string; body: string; to: string; done: boolean };

/**
 * "Set up your Hub" for the people who can act on it. Every tick comes from real state (the Hub's about line and
 * colour, its Campaigns, its member count, its Discord connections); nothing is ticked because it was clicked.
 * It disappears once every step it shows is done.
 */
function HubSetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((x) => x.done).length;
  if (steps.length === 0 || done === steps.length) return null;
  return (
    <Card data-testid="getting-started">
      <div className="lv-setup-head">
        <SectionTitle>Set up your Hub</SectionTitle>
        <span className="lv-setup-count" data-testid="setup-progress">{done} of {steps.length} done</span>
      </div>
      <Progress value={(done / steps.length) * 100} aria-label={`${done} of ${steps.length} setup steps done`} />
      <ol className="lv-setup">
        {steps.map((x) => (
          <li key={x.key} data-done={x.done || undefined} data-testid={`setup-${x.key}`}>
            <span className="lv-setup-tick" aria-hidden="true">{x.done && <Icon name="check" size={14} />}</span>
            {x.done ? (
              <span className="lv-setup-text"><b>{x.title}</b></span>
            ) : (
              <Link to={x.to} className="lv-setup-text"><b>{x.title}</b><span>{x.body}</span></Link>
            )}
            <span className="sr-only">{x.done ? "(done)" : "(to do)"}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}


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
  const settingsManager = Boolean(membership?.is_owner || can(membership, "hub.settings.manage"));
  const discord = useLv(() => (settingsManager ? api.discordConnections(hub.hub_id) : Promise.resolve(denied)), [api, hub.hub_id, settingsManager]);

  async function join() {
    setBusy(true);
    const r = await api.hubJoin(hub.hub_id);
    setBusy(false);
    if (r.ok) setPending(r.status === "pending");
    else setError(describeError(r.error));
  }

  if (!membership) {
    return (
      <Card className="lv-hub-joincard" data-testid="hub-join">
        <h2 className="lv-detail-title">
          {hub.membership_mode === "open" ? "This Hub is open to join." : hub.membership_mode === "approval" ? "Join requests are reviewed by a manager." : "This Hub is invite only."}
        </h2>
        <p className="ui-muted lv-m0">Campaigns, members and results stay private until you’re a member. Answering is always free.</p>
        {error && <Notice tone="error">{error}</Notice>}
        {pending && <Notice tone="ok">Request sent. A manager will review it.</Notice>}
        <div className="ui-row">
          {!session ? (
            <LinkButton to="/signin" state={{ from: `/${hub.slug}` }} variant="primary" size="lg">Sign in to join</LinkButton>
          ) : hub.membership_mode === "invite_only" ? (
            <LinkButton to="/join" variant="secondary" size="lg">Use an invite code</LinkButton>
          ) : (
            <Button variant="primary" size="lg" onClick={join} disabled={busy || pending}>{busy ? "Working…" : hub.membership_mode === "open" ? "Join this Hub" : "Request to join"}</Button>
          )}
        </div>
      </Card>
    );
  }

  const rows = campaigns.data?.campaigns ?? [];
  const live = rows.filter((c) => campaignPhase(c) === "open").length;
  const accepted = people.data?.members.filter((m) => m.status === "accepted") ?? [];
  const waiting = people.data?.members.filter((m) => m.status === "pending").length ?? 0;
  const manager = can(membership, "campaign.manage");
  const steps: SetupStep[] = [];
  if (settingsManager) {
    steps.push({ key: "about", title: "Describe your Hub", body: "Add an about line so visitors know what it is for.", to: `/${hub.slug}/settings`, done: Boolean(hub.about?.trim()) });
    steps.push({ key: "colour", title: "Pick your Hub color", body: "It shows on your banner, icon and Campaign cards.", to: `/${hub.slug}/settings#appearance`, done: Boolean(hub.accent) });
  }
  if (manager && campaigns.data) {
    steps.push({ key: "campaign", title: "Ask your first question", body: "A quick poll takes a minute.", to: `/${hub.slug}/campaigns/new`, done: rows.length > 0 });
  }
  if (can(membership, "admin.members.admit")) {
    steps.push({ key: "invite", title: "Invite people", body: "Share a code or send it by email.", to: `/${hub.slug}/invites`, done: hub.member_count > 1 });
  }
  if (settingsManager && discord.data) {
    steps.push({ key: "discord", title: "Connect your Discord server", body: "Optional: post Campaigns where your community already talks.", to: `/${hub.slug}/settings?tab=discord`, done: discord.data.connections.length > 0 });
  }

  return (
    <div className="lv-hub-overview">
        <div className="lv-tiles lv-tiles-3" data-testid="hub-stats">
          <StatTile tone="ink" label="Live Campaigns" value={live} note={`${rows.length} in total`} />
          <StatTile label="Members" value={hub.member_count} note={waiting > 0 ? `${waiting} waiting on you` : hub.member_count <= 1 ? "Just you so far" : "No requests waiting"} />
          <StatTile
            label="Plan"
            value={familyName(hub.plan?.family)}
            note={hub.plan?.state === "active" ? (hub.plan.ends_at ? `Until ${fmtDate(hub.plan.ends_at)}` : hub.plan.product === "founding" ? "Founding · active" : "Active") : "Premium actions locked"}
          />
        </div>
    <div className="lv-dash">
      <div className="lv-stack">
        <HubSetupChecklist steps={steps} />
        <Card>
          <SectionTitle action={manager ? <LinkButton to={`/${hub.slug}/campaigns/new`} variant="ink" size="sm" icon="plus">New Campaign</LinkButton> : undefined}>Campaigns</SectionTitle>
          {campaigns.loading && !campaigns.data ? (
            <LoadingRows rows={3} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<Icon name="survey" size={22} />} title="No Campaigns yet">A Campaign is one set of questions with a lifecycle: draft, scheduled, open, closed.</EmptyState>
          ) : (
            <RowList>
              {rows.slice(0, 6).map((c) => (
                <RowItem key={c.campaign_id} asChild={<Link to={`/${hub.slug}/campaigns/${c.campaign_id}`} />} title={c.title} sub={`${modeLabel(c.mode)} · ${c.question_count} questions`} trailing={<PhaseBadge phase={campaignPhase(c)} />} />
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
                <RowItem key={m.membership_id} leading={<HubMark name={m.display_name ?? "Member"} size={34} />} title={m.display_name ?? "Member"} trailing={m.is_owner ? <span className="ui-row"><IconBadge kind="owner" /><span className="ui-muted lv-small">Owner</span></span> : <span className="ui-muted lv-small">{m.roles[0]?.name ?? "Member"}</span>} />
              ))}
            </RowList>
            <LinkButton to={`/${hub.slug}/members`} variant="quiet" size="sm" icon="arrow">All members</LinkButton>
          </Card>
        )}
        <HubShareCard hub={hub} canInvite={can(membership, "admin.members.admit")} />
      </aside>
    </div>
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
          data-popped={copied || undefined}
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
  const [reporting, setReporting] = useState<Member | null>(null);

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
                  <TableCell><span className="lv-member-name">{m.display_name ?? "Member"} {m.is_owner && <IconBadge kind="owner" />}</span></TableCell>
                  <TableCell><div className="ui-row">{m.roles.length === 0 ? <span className="ui-muted">—</span> : m.roles.map((r) => {
                    const icon = roles.data?.roles.find((x) => x.key === r.key)?.icon;
                    return <span key={r.key} className="lv-role-pill"><Icon name={(icon && ROLE_ICONS.includes(icon as IconName) ? icon : "star") as IconName} size={14} />{r.name}</span>;
                  })}</div></TableCell>
                  <TableCell>
                    <div className="lv-member-actions">
                      {can(membership, "admin.roles.manage") && !m.is_owner && (roles.data?.roles.length ?? 0) > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="secondary" aria-label={`Roles for ${m.display_name ?? "member"}`}>Roles <Icon name="chevron" size={14} /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Roles for {m.display_name ?? "this member"}</DropdownMenuLabel>
                            {roles.data!.roles.map((r) => {
                              const has = m.roles.some((mr) => mr.key === r.key);
                              return (
                                <DropdownMenuCheckboxItem
                                  key={r.role_id}
                                  checked={has}
                                  onSelect={(e) => e.preventDefault()}
                                  onCheckedChange={() => act(() => (has ? api.memberRoleUnassign(m.membership_id, r.role_id) : api.memberRoleAssign(m.membership_id, r.role_id)), has ? `${r.name} removed from ${m.display_name ?? "member"}` : `${m.display_name ?? "Member"} is now ${r.name}`)}
                                >
                                  {r.name}
                                </DropdownMenuCheckboxItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button size="sm" variant="quiet" onClick={() => setReporting(m)} aria-label={`Report ${m.display_name ?? "member"}`}>Report</Button>
                      {can(membership, "admin.members.remove") && !m.is_owner && (
                        <ConfirmAction
                          trigger={<Button size="sm" variant="quiet">Remove</Button>}
                          title={`Remove ${m.display_name ?? "this member"}?`}
                          body="They lose access to members-only Campaigns and pages. Answers they already gave stay in results. They can join again the way the Hub allows."
                          action="Remove member"
                          onConfirm={() => act(() => api.memberRemove(m.membership_id), `${m.display_name ?? "Member"} removed`)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="ui-help lv-m0">Emails are never shown. The Owner is protected and can’t be removed or demoted. Guests are never members.</p>
      </Card>
      <ReportDialog
        open={Boolean(reporting)}
        onOpenChange={(o) => { if (!o) setReporting(null); }}
        title={`Report ${reporting?.display_name ?? "this member"}`}
        description="LunchVoice staff review it and can act on the account. They are never told who reported them, and Hub owners can’t see who did."
        onSend={async (reason, details) => {
          const r = await api.reportAccount(hub.hub_id, { membership: reporting!.membership_id }, reason, details);
          if (!r.ok) return describeError(r.error);
          toast.success(r.duplicate ? "You’ve already reported them. Staff will review it." : "Report sent to LunchVoice staff");
          return null;
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ invites */

export function Invites() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const invites = useLv(() => api.inviteList(hub.hub_id), [api, hub.hub_id]);
  const [maxUses, setMaxUses] = useState("");
  const [fresh, setFresh] = useState<{ id: string; code: string } | null>(null);
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    const r = await api.inviteCreate(hub.hub_id, maxUses ? Number(maxUses) : undefined);
    setCreating(false);
    if (r.ok) { setFresh({ id: r.invite_id, code: r.code }); invites.reload(); toast.success("Invite created. Copy it now: it’s shown once."); }
    else toast.error(describeError(r.error));
  }
  async function revoke(id: string) {
    const r = await api.inviteRevoke(id);
    if (r.ok) {
      // A revoked code must not stay on screen looking usable.
      if (fresh?.id === id) setFresh(null);
      invites.reload();
      toast.success("Invite revoked. The code no longer works.");
    } else toast.error(describeError(r.error));
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
          <Button variant="primary" onClick={create} disabled={creating}><Icon name="plus" size={16} />{creating ? "Creating…" : "Create invite"}</Button>
        </div>
        {fresh && (
          <div className="lv-stack-16" data-testid="fresh-invite">
            <CopyField label="Invite code (shown once)" value={fresh.code} />
            <CopyField label="Invite link" value={`https://lunchvoice.com/j/${fresh.code}`} />
            <EmailInvite hubId={hub.hub_id} code={fresh.code} />
          </div>
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

/** Send the fresh invite by email (lv_invite_email_send, 000019). The address is used for this one message. */
function EmailInvite({ hubId, code }: { hubId: string; code: string }) {
  const { api } = useIdentity();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  async function send() {
    setBusy(true);
    const r = await api.inviteEmailSend(hubId, code, to.trim());
    setBusy(false);
    if (!r.ok) return void toast.error(describeError(r.error));
    setSent((s) => [...s, to.trim()]);
    toast.success(r.already_sent ? `Already sent to ${to.trim()}` : `Invite emailed to ${to.trim()}`);
    setTo("");
  }
  return (
    <form className="lv-invite-form" onSubmit={(e) => { e.preventDefault(); if (to.trim()) void send(); }}>
      <Field label="Email this invite (optional)" htmlFor="invite-email" help="Used only to send this invite.">
        <Input id="invite-email" type="email" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" aria-describedby="invite-email-help" />
      </Field>
      <Button type="submit" variant="secondary" disabled={!to.trim() || busy}>{busy ? "Sending…" : "Send"}</Button>
      {sent.length > 0 && <p className="ui-help lv-m0 lv-wide" role="status">Sent to {sent.join(", ")}.</p>}
    </form>
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
  const slots = roles.data?.custom_slots.limit ?? null;
  const used = roles.data?.custom_slots.used ?? 0;
  const full = slots !== null && used >= slots;

  async function create() {
    setBusy(true);
    const r = await api.roleCreate(hub.hub_id, name.trim(), icon, caps);
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
                  <TableCell className="text-right">
                    <div className="lv-member-actions">
                      <EditRole role={r} groups={catalog.data?.groups ?? []} onSaved={roles.reload} />
                      <ConfirmAction
                        trigger={<Button size="sm" variant="quiet">Delete</Button>}
                        title={`Delete the ${r.name} role?`}
                        body={r.member_count ? `${r.member_count} ${r.member_count === 1 ? "member loses" : "members lose"} its permissions. Their membership stays.` : "Nobody holds it yet."}
                        action="Delete role"
                        onConfirm={() => remove(r)}
                      />
                    </div>
                  </TableCell>
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

function EditRole({ role, groups, onSaved }: { role: Role; groups: { key: string; label: string; capabilities: { key: string; label: string }[] }[]; onSaved: () => void }) {
  const { api } = useIdentity();
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<string[]>(role.capabilities);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setCaps(role.capabilities); }}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissions for {role.name}</DialogTitle>
          <DialogDescription>Changes apply to everyone who holds this role.</DialogDescription>
        </DialogHeader>
        <div className="lv-caps">
          {groups.map((g) => (
            <div key={g.key} className="lv-cap-group">
              <Eyebrow>{g.label}</Eyebrow>
              {g.capabilities.map((c) => (
                <label key={c.key} className="lv-check-row">
                  <Checkbox checked={caps.includes(c.key)} onCheckedChange={() => setCaps((x) => (x.includes(c.key) ? x.filter((k) => k !== c.key) : [...x, c.key]))} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="ui-row">
          <Button variant="primary" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await api.roleUpdate(role.role_id, { capabilities: caps });
            setBusy(false);
            if (!r.ok) return void toast.error(describeError(r.error));
            toast.success(`${role.name} updated`);
            setOpen(false);
            onSaved();
          }}>{busy ? "Saving…" : "Save permissions"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ settings */

/* ---- track D: api + discord ---- */
// Hub Settings: General, plus API (Owner or api.manage) and Discord (hub.settings.manage) tabs. ?tab=api deep-links.
export function HubSettings() {
  const { hub, membership } = useHubCtx();
  const [params, setParams] = useSearchParams();
  const showApi = can(membership, "api.manage");
  const showDiscord = can(membership, "hub.settings.manage");
  if (!showApi && !showDiscord) return <HubGeneralSettings />;
  const tab = params.get("tab") === "api" && showApi ? "api" : params.get("tab") === "discord" && showDiscord ? "discord" : "general";
  return (
    <Tabs value={tab} onValueChange={(v) => setParams(v === "general" ? {} : { tab: v }, { replace: true })}>
      <TabsList aria-label="Settings sections">
        <TabsTrigger value="general">General</TabsTrigger>
        {showApi && <TabsTrigger value="api">API</TabsTrigger>}
        {showDiscord && <TabsTrigger value="discord">Discord</TabsTrigger>}
      </TabsList>
      <TabsContent value="general"><HubGeneralSettings /></TabsContent>
      {showApi && <TabsContent value="api"><HubApiSettings hub={hub} membership={membership} /></TabsContent>}
      {showDiscord && <TabsContent value="discord"><HubDiscordSettings hub={hub} membership={membership} /></TabsContent>}
    </Tabs>
  );
}
/* ---- end track D ---- */

function HubGeneralSettings() {
  const [savedOnce, setSavedOnce] = useState(false);
  const { hub, membership, reload } = useHubCtx();
  const { api } = useIdentity();
  const nav = useNavigate();
  const [name, setName] = useState(hub.name);
  const [about, setAbout] = useState(hub.about ?? "");
  const [visibility, setVisibility] = useState<Visibility>(hub.visibility);
  const [mode, setMode] = useState<MembershipMode>(hub.membership_mode);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [heir, setHeir] = useState<string>("");
  const owner = membership?.is_owner;
  const members = useLv(() => (owner ? api.memberList(hub.hub_id) : Promise.resolve({ ok: true as const, members: [] })), [api, hub.hub_id, owner]);
  const heirs = members.data?.members.filter((m) => m.status === "accepted" && !m.is_owner) ?? [];
  const dirty = name.trim() !== hub.name || about !== (hub.about ?? "") || visibility !== hub.visibility || mode !== hub.membership_mode;

  async function save() {
    setSaving(true);
    const r = await api.hubUpdate(hub.hub_id, {
      display_name: name.trim() !== hub.name ? name.trim() : undefined,
      about: about !== (hub.about ?? "") ? about : undefined,
      visibility: visibility !== hub.visibility ? visibility : undefined,
      membership_mode: mode !== hub.membership_mode ? mode : undefined,
    });
    setSaving(false);
    if (r.ok) { setSavedOnce(true); toast.success("Settings saved"); reload(); } else toast.error(describeError(r.error));
  }

  return (
    <div className="lv-stack-16">
      <Card>
        <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <SectionTitle>Name and description</SectionTitle>
          <Field label="Hub name" htmlFor="h-name" counter={{ value: name.length, max: 60 }}>
            <Input id="h-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="What is this Hub for?" htmlFor="h-about" help="One or two sentences. Shown on your Hub’s page, its share card and Discover." counter={{ value: about.length, max: 500 }}>
            <Textarea id="h-about" value={about} maxLength={500} onChange={(e) => setAbout(e.target.value)} aria-describedby="h-about-help" placeholder="Weekly long runs, a monthly social, and a say in the route." />
          </Field>
          <div className="lv-settings-address" data-testid="settings-address">
            <span className="ui-help">Address</span>
            <span className="lv-settings-address-url">lunchvoice.com/<b>{hub.slug}</b></span>
            <span className="ui-help">Addresses cannot be changed in the app yet. <a className="lv-inline-link" href={supportMailto(`Change the address of ${hub.slug}`)}>Ask support</a> if you need a different one.</span>
          </div>
          <Separator />
          <SectionTitle>Who can see it and join</SectionTitle>
          <fieldset className="lv-settings-group">
            <legend>Who can see this Hub</legend>
            <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as Visibility)} aria-label="Who can see this Hub" className="ui-grid-2">
              <RadioCard value="public" title="Public" description="Anyone with the address sees the Hub’s page. Campaigns and results stay for members." />
              <RadioCard value="private" title="Private" description="Only members can see it. To everyone else the address looks like it doesn’t exist." />
            </RadioGroup>
          </fieldset>
          <fieldset className="lv-settings-group">
            <legend>How people join</legend>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as MembershipMode)} aria-label="How people join" className="lv-settings-modes">
              <RadioCard value="open" title="Open" description="Anyone signed in can join straight away." />
              <RadioCard value="approval" title="By approval" description="People ask to join and a manager admits them." />
              <RadioCard value="invite_only" title="Invite only" description="Only people with an invite code can join." />
            </RadioGroup>
          </fieldset>
          <p className="ui-help lv-m0">Changing these never removes anyone who is already a member.</p>
          <div className="ui-row lv-settings-save">
            <Button type="submit" variant="ink" disabled={!dirty || saving || !name.trim()}>{saving ? "Saving…" : "Save settings"}</Button>
            <span className="lv-save" role="status" aria-live="polite" data-status={saving ? "saving" : dirty ? "dirty" : savedOnce ? "saved" : "idle"} data-testid="settings-save-state">
              <span className="lv-save-dot" aria-hidden="true" />
              {saving ? "Saving…" : dirty ? "Unsaved changes" : savedOnce ? "All changes saved" : "No changes"}
            </span>
          </div>
        </form>
      </Card>
      {can(membership, "hub.settings.manage") && <HubAppearance hub={hub} reload={reload} />}

      {owner && (
        <Card>
          <SectionTitle>Ownership and deletion</SectionTitle>
          <p className="ui-help lv-m0">Only you, the Owner, see this section.</p>
          {dangerError && <Notice tone="error">{dangerError}</Notice>}
          <div className="lv-stack-16">
            <div className="lv-stack-8">
              <strong>Transfer ownership</strong>
              <p className="ui-muted lv-m0">The member you pick gets an offer. Once they accept, they become the Owner and you become a regular member. Until then nothing changes.</p>
              <PendingOwnerOffer hubId={hub.hub_id} />
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
                    description={`${heirs.find((m) => m.membership_id === heir)?.display_name ?? "This member"} is offered ownership of ${hub.name}. When they accept, they become the Owner. You can’t undo that yourself.`}
                    phrase={hub.slug}
                    actionLabel="Send ownership offer"
                    busy={busy}
                    onConfirm={async (typed) => {
                      setBusy(true);
                      const r = await api.ownerTransfer(hub.hub_id, heir, typed);
                      setBusy(false);
                      if (!r.ok) { setDangerError(describeError(r.error)); return false; }
                      toast.success("Offer sent. They become the Owner once they accept.");
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
            <BillingDisabled>Choose a plan</BillingDisabled>
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
          <BillingDisabled>Reserve this address</BillingDisabled>
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
        <ul className="lv-reqs" aria-label="Requirements">
          <li data-met={hub.plan?.family === "team" || undefined}><span aria-hidden="true">{hub.plan?.family === "team" ? "✓" : "–"}</span>Team plan <span className="ui-muted">{hub.plan?.family === "team" ? "· met" : `· this Hub is on ${familyName(hub.plan?.family)}`}</span></li>
          <li data-met={hub.member_count >= 700 || undefined}><span aria-hidden="true">{hub.member_count >= 700 ? "✓" : "–"}</span>700 genuine active members <span className="ui-muted">· {hub.member_count >= 700 ? "met" : `${700 - hub.member_count} to go`}</span></li>
        </ul>
        {reasons && <Notice tone="warn" title="Not eligible yet">{reasons.join(" ")}</Notice>}
        {sent ? <Notice tone="ok">Application sent. We’ll review it.</Notice> : <Button variant="primary" onClick={apply} disabled={busy}>{busy ? "Checking…" : "Apply for Discover"}</Button>}
      </Card>
      <DiscoverListing />
      <Card variant="well">
        <SectionTitle>What Discover is</SectionTitle>
        <p className="ui-muted lv-m0">A public directory of large, active communities that chose to be found. Nothing is listed automatically and no Hub is ever seeded into it.</p>
        <LinkButton to="/discover" variant="secondary">See the directory</LinkButton>
      </Card>
    </div>
  );
}

/** Track C: the Hub's Discover category and listing status (lv_community_get / lv_community_update). */
function DiscoverListing() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const q = useLv(() => api.communityGet(hub.hub_id), [api, hub.hub_id]);
  if (!q.data) return null;
  const status = q.data.discover.status;
  return (
    <Card data-testid="discover-listing">
      <SectionTitle>Listing</SectionTitle>
      <p className="ui-muted lv-m0">{status === "approved" ? (hub.visibility === "public" && hub.plan?.family === "team" ? "Listed in Discover." : "Approved, but hidden while the Hub is private or not on the Team plan.") : status === "submitted" ? "Application under review." : status === "rejected" ? "Not approved this time." : "Not applied yet."}</p>
      <Field label="Category shown in Discover" htmlFor="discover-category">
        <Select value={q.data.settings.discover_category ?? "none"} onValueChange={async (v) => {
          const r = await api.communityUpdate(hub.hub_id, { discoverCategory: v === "none" ? "" : v });
          if (r.ok) { toast.success("Category saved"); q.reload(); } else toast.error(describeError(r.error));
        }}>
          <SelectTrigger id="discover-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category</SelectItem>
            {q.data.categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </Card>
  );
}

/* ------------------------------------------------------------------ participant add-on pages (track C) */

export function HubAddon({ kind }: { kind: "shop" | "leaderboard" | "news" | "post" | "comments" | "page" }) {
  return <CommunityPage kind={kind} />;
}

/* ------------------------------------------------------------------ Hub Builder (owner) */

const KIND_LABEL: Record<PageKind, string> = { home: "Home", campaigns: "Campaigns", custom: "Custom page", shop: "Shop", leaderboard: "Leaderboard", news: "Newsroom", comments: "Comments" };
const ADDON_KINDS: PageKind[] = ["news", "comments", "leaderboard", "shop"];
const ADDON_HELP: Partial<Record<PageKind, string>> = {
  news: "Posts by people with the Newsroom role. Public posts are possible on a public Hub.",
  comments: "Members discuss the Hub and news posts. Moderators can hide and delete.",
  leaderboard: "Opt-in only. Counts ended Campaigns taken part in, never answers.",
  shop: "Optional Hub points. Items have point prices; you hand orders over yourself.",
};
type Addons = Record<string, { enabled: boolean; allowed: boolean }>;

export function HubBuilder() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const data = useLv(() => api.hubPagesGet(hub.hub_id), [api, hub.hub_id]);
  const [pages, setPages] = useState<HubPage[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // Every add-on page is listed; a missing one appears switched off until the Owner turns it on.
  const withAddons = (ps: HubPage[]) => [
    ...ps,
    ...ADDON_KINDS.filter((k) => !ps.some((p) => p.kind === k)).map((k, i) => ({ key: k, kind: k, title: KIND_LABEL[k], body: null, position: ps.length + i, enabled: false, visibility: "members" as const })),
  ];
  useEffect(() => { if (data.data) setPages(withAddons(data.data.pages)); }, [data.data]);

  if (!membership?.is_owner) return <Notice tone="warn">Only the Hub Owner can change which pages the Hub shows.</Notice>;
  if (data.loading && !pages) return <LoadingRows rows={4} />;
  if (data.error) return <Notice tone="error">{describeError(data.error)}</Notice>;
  if (!pages) return null;

  const addons = (data.data as unknown as { addons?: Addons })?.addons ?? {};
  const limit = data.data?.custom_slots.limit ?? null;
  const custom = pages.filter((p) => p.kind === "custom").length;
  const dirty = JSON.stringify(pages) !== JSON.stringify(withAddons(data.data?.pages ?? []));
  const move = (i: number, by: number) => setPages((ps) => { const next = [...ps!]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); return next.map((p, j) => ({ ...p, position: j })); });
  const update = (key: string, patch: Partial<HubPage>) => setPages((ps) => ps!.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save() {
    setSaving(true);
    const r = await api.hubPagesUpdate(hub.hub_id, pages!.map((p, i) => ({ ...p, title: p.title.trim() || KIND_LABEL[p.kind], position: i })));
    setSaving(false);
    if (r.ok) { toast.success("Pages saved"); data.reload(); window.dispatchEvent(new Event("lv:pages-changed")); } else toast.error(describeError(r.error));
  }

  return (
    <div className="lv-builder">
      <Card>
        <SectionTitle action={<Button variant="ink" size="sm" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save pages"}</Button>}>Hub pages</SectionTitle>
        <QuotaMeter label="Custom page slots" used={custom} limit={limit} />
        <div data-testid="builder-pages">
          {pages.map((p, i) => {
            const fixed = p.kind === "home" || p.kind === "campaigns";
            const addon = ADDON_KINDS.includes(p.kind);
            const notInPlan = addon && addons[p.kind] && !addons[p.kind].allowed;
            return (
              <div key={p.key}>
                <div className="lv-page-row">
                  <span className="lv-outline-move">
                    <Button variant="quiet" size="icon-sm" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevron" size={14} className="lv-rot180" /></Button>
                    <Button variant="quiet" size="icon-sm" aria-label={`Move ${p.title} down`} disabled={i === pages.length - 1} onClick={() => move(i, 1)}><Icon name="chevron" size={14} /></Button>
                  </span>
                  <div className="lv-page-row-main">
                    <strong>{p.title}</strong>
                    <span>{KIND_LABEL[p.kind]}{fixed ? " · always on" : notInPlan ? " · not in this plan" : addon ? ` · ${ADDON_HELP[p.kind]}` : p.visibility === "public" ? " · public" : " · members"}</span>
                  </div>
                  {p.kind === "custom" && <Button variant="quiet" size="sm" aria-expanded={open === p.key} onClick={() => setOpen(open === p.key ? null : p.key)}>{open === p.key ? "Done" : "Edit"}</Button>}
                  {p.kind === "custom" && <Button variant="quiet" size="sm" onClick={() => setPages((ps) => ps!.filter((x) => x.key !== p.key))}>Remove</Button>}
                  <Switch aria-label={`${p.title} page`} checked={p.enabled} disabled={fixed || (notInPlan && !p.enabled)} onCheckedChange={(on) => update(p.key, { enabled: on })} />
                </div>
                {p.kind === "custom" && open === p.key && <PageEditor page={p} publicHub={hub.visibility === "public"} onChange={(np) => update(p.key, np)} />}
              </div>
            );
          })}
        </div>
        <form className="lv-invite-form" onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          const key = `page-${Date.now().toString(36)}`;
          setPages((ps) => [...ps!, { key, kind: "custom", title: newTitle.trim(), body: "", position: ps!.length, enabled: true, visibility: "members" }]);
          setOpen(key);
          setNewTitle("");
        }}>
          <Field label="New custom page" htmlFor="new-page"><Input id="new-page" value={newTitle} maxLength={80} onChange={(e) => setNewTitle(e.target.value)} placeholder="Route maps" disabled={limit !== null && custom >= limit} /></Field>
          <Button type="submit" variant="secondary" disabled={!newTitle.trim() || (limit !== null && custom >= limit)}><Icon name="plus" size={16} />Add page</Button>
        </form>
        {limit !== null && custom >= limit && <p className="ui-help lv-m0">All {limit} custom page slots are in use.</p>}
        {limit === 0 && <p className="ui-help lv-m0">Custom pages need an active Hub plan.</p>}
      </Card>
      <Card variant="well">
        <Eyebrow>Preview: what members see</Eyebrow>
        <div className="lv-preview-phone">
          <div className="lv-preview-cover" style={{ background: hub.accent_hex ?? "#14110f", color: hub.accent_hex ? onAccent(hub.accent_hex) : "#fff" }}>
            <b>{hub.name}</b>
            <nav aria-label="Preview tabs">
              {pages.filter((p) => p.enabled).map((p) => <span key={p.key}>{p.title}</span>)}
            </nav>
          </div>
          <Card size="sm"><strong>Campaigns</strong><span className="ui-muted lv-small">Live Campaigns appear here.</span></Card>
        </div>
        <p className="ui-help lv-m0">Visitors see only Home, Campaigns, public custom pages and public news. Shop, Leaderboard and Comments are for members.</p>
      </Card>
    </div>
  );
}

/* ---- track A: hardening ---- */

/** The Owner's pending ownership offer (000018), with a way to withdraw it. */
function PendingOwnerOffer({ hubId }: { hubId: string }) {
  const { api } = useIdentity();
  const status = useLv(() => api.ownerTransferStatus(hubId), [api, hubId]);
  const offer = status.data?.offer;
  if (!offer) return null;
  return (
    <div data-testid="owner-offer"><Notice title="Ownership offer pending">
      {offer.to_display_name ?? "The member"} hasn’t answered yet. The offer ends {new Date(offer.expires_at).toLocaleDateString()}.{" "}
      <Button variant="quiet" size="sm" onClick={async () => { const r = await api.ownerTransferCancel(hubId); if (r.ok) { toast.success("Offer withdrawn"); status.reload(); } else toast.error(describeError(r.error)); }}>Withdraw offer</Button>
    </Notice></div>
  );
}
