import { useMemo, useState } from "react";
import { Link, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { RESERVED_SLUGS } from "../lib/reservedSlugs";
import { PENDING_API, type HubInfo, type HubMembership, type Member, type Role } from "../lib/lvApi";
import { describeError } from "../lib/errors";
import { PLANS } from "../config/pricing";
import {
  AppHeader,
  BottomTabs,
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  ColorPicker,
  CopyField,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  GateMeter,
  HubMark,
  HubTabs,
  Icon,
  Lifecycle,
  Loading,
  MakerSignature,
  Metric,
  Notice,
  PageHead,
  PendingNote,
  Pill,
  Progress,
  QuotaMeter,
  Segmented,
  Select,
  Switch,
  Table,
  TextInput,
  useToast,
  type Column,
  type TabItem,
} from "../ui";
import { NotFoundPage } from "./Marketing";

export interface HubCtx {
  hub: HubInfo;
  membership: HubMembership | null;
}
export const useHubCtx = () => useOutletContext<HubCtx>();
export const can = (m: HubMembership | null, cap: string) => Boolean(m?.is_owner || m?.capabilities.includes(cap));

/* ------------------------------------------------------------------ shell */

export function HubLayout() {
  const { hub: slug } = useParams();
  const { api, session } = useIdentity();
  const reserved = !slug || RESERVED_SLUGS.has(slug.toLowerCase());
  const q = useLv(
    () =>
      reserved
        ? Promise.resolve({ ok: false as const, error: { code: "lv_not_found" as const, message: "" } })
        : api.hubGet(slug),
    [api, slug, reserved],
  );

  if (reserved) return <NotFoundPage />;
  if (q.loading) {
    return (
      <div className="wrap page">
        <Loading rows={4} label="Loading Hub" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="wrap page" style={{ maxWidth: 620 }}>
        <PageHead
          eyebrow="Hub"
          title="Hub not available"
          sub="It may not exist, or it may be private. A private Hub answers exactly like a missing one, so nobody can probe for one."
        />
        <div className="row">
          {!session && (
            <ButtonLink to="/signin" state={{ from: `/${slug}` }} variant="primary">
              Sign in
            </ButtonLink>
          )}
          <ButtonLink to="/" variant="raised">
            LunchVoice home
          </ButtonLink>
        </div>
      </div>
    );
  }

  const { hub, membership } = q.data;
  const base = `/${hub.slug}`;
  const isManager = Boolean(membership);
  const tabs: TabItem[] = [
    { to: base, label: "Overview", icon: "home", end: true },
    { to: `${base}/campaigns`, label: "Campaigns", icon: "campaign" },
    ...(can(membership, "analytics.read") ? [{ to: `${base}/analytics`, label: "Analytics", icon: "leaderboard" }] : []),
    ...(can(membership, "admin.members.admit") || can(membership, "admin.members.remove")
      ? [{ to: `${base}/members`, label: "Members", icon: "members" }]
      : []),
    ...(can(membership, "admin.members.admit") ? [{ to: `${base}/invites`, label: "Invites", icon: "qr" }] : []),
    ...(can(membership, "admin.roles.manage") ? [{ to: `${base}/roles`, label: "Roles", icon: "roles" }] : []),
    ...(isManager ? [{ to: `${base}/settings`, label: "Settings", icon: "settings" }] : []),
    ...(membership?.is_owner ? [{ to: `${base}/billing`, label: "Billing", icon: "billing" }] : []),
  ];

  const phoneTabs: TabItem[] = [
    { to: base, label: "Home", icon: "home", end: true },
    { to: `${base}/campaigns`, label: "Campaigns", icon: "campaign" },
    ...(can(membership, "analytics.read") ? [{ to: `${base}/analytics`, label: "Analytics", icon: "leaderboard" }] : []),
    ...(can(membership, "admin.members.admit") ? [{ to: `${base}/members`, label: "Members", icon: "members" }] : []),
  ];

  const more = (
    <div className="stack stack-sm">
      {tabs.slice(4).map((t) => (
        <Link key={t.to} to={t.to} className="btn btn-raised" style={{ justifyContent: "flex-start" }}>
          {t.icon && <Icon name={t.icon} size={18} />}
          {t.label}
        </Link>
      ))}
      {tabs.length <= 4 && <p className="t-small subtle">Nothing else to show with your permissions.</p>}
    </div>
  );

  return (
    <div className="has-bottom-tabs">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader hub={{ slug: hub.slug, name: hub.name }} hubs={session ? undefined : undefined} accountName={session?.name} />
      <main id="main" className="page">
        <div className="wrap">
          <div className="row-between" style={{ alignItems: "flex-end", marginBottom: 14 }}>
            <div className="stack stack-sm">
              <Breadcrumbs items={[{ to: "/me", label: "My Hubs" }, { label: hub.name }]} />
              <div className="row">
                <HubMark name={hub.name} slug={hub.slug} size={36} />
                <h1 className="t-display-md">{hub.name}</h1>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Pill>{hub.visibility}</Pill>
                <Pill>{hub.membership_mode.replace("_", " ")}</Pill>
                <span className="t-small subtle mono">/{hub.slug}</span>
              </div>
            </div>
            <div className="row">
              {membership?.is_owner && <Pill tone="accent">Owner</Pill>}
              <span className="t-small subtle">
                {hub.member_count} {hub.member_count === 1 ? "member" : "members"}
              </span>
            </div>
          </div>

          <div className="desktop-tabs">
            <HubTabs items={tabs} />
          </div>

          <Outlet context={{ hub, membership } satisfies HubCtx} />
        </div>
      </main>
      <BottomTabs items={phoneTabs} more={more} />
      <style>{`@media (max-width: 720px){ .desktop-tabs{display:none;} }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

export function HubOverview() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const campaigns = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const [joining, setJoining] = useState(false);
  const [joinState, setJoinState] = useState<"idle" | "pending" | "error">("idle");
  const [joinError, setJoinError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    const r = await api.hubJoin(hub.hub_id);
    setJoining(false);
    if (!r.ok) {
      setJoinError(describeError(r.error));
      setJoinState("error");
      return;
    }
    if (r.status === "pending") setJoinState("pending");
    else window.location.reload();
  }

  const active = campaigns.data?.campaigns.filter((c) => c.status === "active") ?? [];
  const drafts = campaigns.data?.campaigns.filter((c) => c.status === "draft") ?? [];

  if (!membership) {
    return (
      <div className="stack" style={{ gap: 24 }}>
        <Card className="stack">
          <div className="row-between">
            <div className="stack stack-sm" style={{ maxWidth: "52ch" }}>
              <p className="t-label muted">About this Hub</p>
              <h2 className="t-display-md" style={{ fontSize: 26 }}>
                {hub.name}
              </h2>
              <p className="t-small muted">
                {hub.visibility === "private"
                  ? "This Hub is private. Its members and Campaigns are not public."
                  : "This Hub is public. You can see which Campaigns are open, but only eligible members can answer."}
              </p>
            </div>
            <HubMark name={hub.name} slug={hub.slug} size={56} />
          </div>

          {hub.membership_mode === "invite_only" ? (
            <Notice tone="info" title="Invitation only">
              This Hub only accepts people who were invited. Ask a manager for an invitation link, then open it while signed in.
            </Notice>
          ) : joinState === "pending" ? (
            <Notice tone="info" title="Request sent">
              A manager will review it. You cannot see member-only content until then.
            </Notice>
          ) : (
            <div className="row">
              <Button variant="primary" loading={joining} onClick={join}>
                {hub.membership_mode === "approval" ? "Request to join" : "Join this Hub"}
              </Button>
              <ButtonLink to="/join" variant="raised">
                Have a code?
              </ButtonLink>
            </div>
          )}
          {joinState === "error" && <ErrorNote error={joinError} />}
        </Card>

        <section className="stack">
          <h2 className="t-title">Open Campaigns</h2>
          {campaigns.loading && <Loading rows={2} />}
          {active.length === 0 ? (
            <Empty icon="campaign" title="Nothing open right now">
              When a Campaign opens, it appears here with how long it takes and whether answers are anonymous.
            </Empty>
          ) : (
            <div className="grid grid-2">
              {active.map((c) => (
                <Card key={c.campaign_id} className="stack">
                  <div className="row-between">
                    <p className="t-title">{c.title}</p>
                    <Pill tone="accent">{c.mode}</Pill>
                  </div>
                  <p className="t-small muted">
                    {c.question_count} questions · {c.anonymity === "anonymous" ? "Anonymous" : "Signed answers"}
                  </p>
                  <ButtonLink to={`/${hub.slug}/campaigns/${c.campaign_id}`} variant="raised" size="sm">
                    Open
                  </ButtonLink>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="grid grid-4">
        <Card className="stack stack-sm">
          <Metric label="Active Campaigns" value={active.length} hint="of this plan's limit" />
        </Card>
        <Card className="stack stack-sm">
          <Metric label="Members" value={hub.member_count} hint="unique eligible members only" />
        </Card>
        <Card className="stack stack-sm">
          <Metric label="Drafts" value={drafts.length} hint="not visible to members" />
        </Card>
        <Card className="stack stack-sm">
          <Metric label="Plan" value={membership.is_owner ? "Starter" : "—"} raw hint="the backend enforces limits" />
        </Card>
      </section>

      <section className="grid grid-2">
        <Card className="stack">
          <div className="row-between">
            <h2 className="t-title">Participation</h2>
            <Pill tone="accent">Live</Pill>
          </div>
          <GateMeter participating={96} eligible={154} threshold={50} />
          <p className="t-small subtle">
            Fixture numbers. A real gate reads from the Campaign, and guests never count toward it.
          </p>
        </Card>

        <Card className="stack">
          <h2 className="t-title">Quick actions</h2>
          <div className="stack stack-sm">
            <ButtonLink to={`/${hub.slug}/campaigns/new`} variant="primary" icon="plus">
              New Campaign
            </ButtonLink>
            <ButtonLink to={`/${hub.slug}/invites`} variant="raised" icon="qr">
              Invite members
            </ButtonLink>
            <ButtonLink to={`/${hub.slug}/settings`} variant="quiet" icon="builder">
              Open Hub Builder
            </ButtonLink>
          </div>
        </Card>
      </section>

      <section className="stack">
        <div className="row-between">
          <h2 className="t-title">Campaigns</h2>
          <ButtonLink to={`/${hub.slug}/campaigns`} variant="quiet" size="sm" iconRight="arrow-right">
            All Campaigns
          </ButtonLink>
        </div>
        {campaigns.loading && <Loading rows={2} />}
        {campaigns.error && <ErrorNote error={campaigns.error} onRetry={campaigns.reload} />}
        {campaigns.data && campaigns.data.campaigns.length === 0 && (
          <Empty icon="campaign" title="No Campaigns yet" action={<ButtonLink to={`/${hub.slug}/campaigns/new`} variant="primary" size="sm">Create the first one</ButtonLink>}>
            A Campaign is one ask: a survey, poll, rating, idea or election. Draft one, publish it when you are ready.
          </Empty>
        )}
        {campaigns.data && campaigns.data.campaigns.length > 0 && (
          <div className="grid grid-2">
            {campaigns.data.campaigns.slice(0, 4).map((c) => (
              <Card key={c.campaign_id} className="stack">
                <div className="row-between">
                  <p className="t-title">{c.title}</p>
                  <Pill tone={c.status === "active" ? "ok" : c.status === "draft" ? "quiet" : "quiet"}>{c.status}</Pill>
                </div>
                <p className="t-small muted">
                  {c.mode} · {c.question_count} questions · {c.anonymity}
                </p>
                <ButtonLink to={`/${hub.slug}/campaigns/${c.campaign_id}`} variant="quiet" size="sm" iconRight="arrow-right">
                  Open
                </ButtonLink>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ members */

export function Members() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = useLv(() => api.memberList(hub.hub_id), [api, hub.hub_id]);

  const rows = useMemo(() => {
    const all = list.data?.members ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((m) => (m.display_name ?? "").toLowerCase().includes(q)) : all;
  }, [list.data, query]);

  const columns: Column<Member>[] = [
    {
      key: "name",
      header: "Member",
      render: (m) => (
        <div className="row" style={{ gap: 10 }}>
          {can(membership, "admin.members.remove") && !m.is_owner && (
            <Checkbox
              checked={selected.includes(m.membership_id)}
              onChange={(v) => setSelected((s) => (v ? [...s, m.membership_id] : s.filter((x) => x !== m.membership_id)))}
            >
              <span className="sr-only">Select {m.display_name ?? "member"}</span>
            </Checkbox>
          )}
          <span className="t-ui">{m.display_name ?? "Unnamed member"}</span>
          {m.is_owner && <Pill tone="accent">Owner</Pill>}
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (m) => (
        <span className="row" style={{ gap: 4 }}>
          {m.roles.length ? m.roles.map((r) => <Pill key={r.key}>{r.name}</Pill>) : <span className="t-small subtle">No custom role</span>}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (m) => <Pill tone={m.status === "accepted" ? "ok" : "warn"}>{m.status}</Pill> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (m) =>
        m.status === "pending" && can(membership, "admin.members.admit") ? (
          <div className="row row-end">
            <Button
              size="sm"
              variant="raised"
              onClick={async () => {
                const r = await api.memberAdmit(m.membership_id);
                toast(r.ok ? "Member admitted" : "Could not admit member", r.ok ? "ok" : "error");
                list.reload();
              }}
            >
              Admit
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                const r = await api.memberReject(m.membership_id);
                toast(r.ok ? "Request rejected" : "Could not reject", r.ok ? "ok" : "error");
                list.reload();
              }}
            >
              Reject
            </Button>
          </div>
        ) : m.is_owner ? (
          <span className="t-small subtle">Protected</span>
        ) : (
          <Button
            size="sm"
            variant="quiet"
            disabled={!can(membership, "admin.members.remove")}
            onClick={async () => {
              const r = await api.memberRemove(m.membership_id);
              toast(r.ok ? "Member removed" : describeError(r.error as never), r.ok ? "ok" : "error");
              list.reload();
            }}
          >
            Remove
          </Button>
        ),
    },
  ];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead
        eyebrow="Members"
        title="Who is in this Hub."
        sub="Only unique eligible members count toward thresholds. Guests never appear here."
        action={<ButtonLink to={`/${hub.slug}/invites`} variant="raised" icon="qr">Invite</ButtonLink>}
      />

      <div className="row">
        <div className="input-affix" style={{ maxWidth: 320 }}>
          <Icon name="search" size={18} />
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" aria-label="Search members" />
        </div>
        {selected.length > 0 && (
          <div className="row">
            <span className="t-small subtle">{selected.length} selected</span>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              disabled={!can(membership, "admin.members.remove")}
              onClick={async () => {
                setBusy(true);
                let ok = 0;
                for (const id of selected) {
                  const r = await api.memberRemove(id);
                  if (r.ok) ok++;
                }
                setBusy(false);
                setSelected([]);
                toast(`${ok} removed`, ok ? "ok" : "error");
                list.reload();
              }}
            >
              Remove selected
            </Button>
          </div>
        )}
      </div>

      {list.loading && <Loading rows={4} />}
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.data && (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(m) => m.membership_id}
          caption={`Members of ${hub.name}`}
          empty={<Empty icon="members" title="No members match that search">Try a different name, or clear the search.</Empty>}
        />
      )}
      {!can(membership, "admin.members.remove") && (
        <Notice tone="info" title="Read-only view">
          You can see members but not remove them. Your role does not include <code className="mono">admin.members.remove</code>.
        </Notice>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ invites */

export function Invites() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const toast = useToast();
  const [maxUses, setMaxUses] = useState("unlimited");
  const [expiry, setExpiry] = useState("7");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const list = useLv(() => api.inviteList(hub.hub_id), [api, hub.hub_id]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead eyebrow="Invites" title="Bring people in." sub="An invitation is a link with a code. Codes are shown once and can be revoked at any time." />

      <Card className="stack">
        <h2 className="t-title">Create an invitation</h2>
        <div className="grid grid-2">
          <Field label="Uses" htmlFor="max-uses">
            <Select
              id="max-uses"
              label="Uses"
              value={maxUses}
              onChange={setMaxUses}
              options={[
                { value: "unlimited", label: "Unlimited" },
                { value: "1", label: "One person" },
                { value: "10", label: "Ten people" },
              ]}
            />
          </Field>
          <Field label="Expires" htmlFor="expiry">
            <Select
              id="expiry"
              label="Expires"
              value={expiry}
              onChange={setExpiry}
              options={[
                { value: "1", label: "In 1 day" },
                { value: "7", label: "In 7 days" },
                { value: "30", label: "In 30 days" },
                { value: "never", label: "Never" },
              ]}
            />
          </Field>
        </div>
        <div className="row">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const expiresAt =
                expiry === "never" ? undefined : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
              const r = await api.inviteCreate(hub.hub_id, maxUses === "unlimited" ? undefined : Number(maxUses), expiresAt);
              setBusy(false);
              if (r.ok && typeof r === "object" && "code" in r) {
                setCreated(String(r.code));
                toast("Invitation created", "ok");
                list.reload();
              } else {
                toast("Could not create an invitation", "error");
              }
            }}
          >
            Create invitation
          </Button>
          <span className="t-small subtle">Codes are shown once. Copy it before you leave this page.</span>
        </div>
        {created && (
          <div className="stack stack-sm">
            <CopyField label="Invitation code" value={created} />
            <CopyField label="Invitation link" value={`${window.location.origin}/j/${created}`} />
          </div>
        )}
      </Card>

      <section className="stack">
        <h2 className="t-title">Existing invitations</h2>
        {list.loading && <Loading rows={3} />}
        {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
        {list.data && list.data.invites.length === 0 && <Empty icon="qr" title="No invitations yet">Create one above and share the link.</Empty>}
        {list.data && list.data.invites.length > 0 && (
          <Table
            caption={`Invitations for ${hub.name}`}
            rowKey={(i) => i.invite_id}
            rows={list.data.invites}
            columns={[
              { key: "state", header: "State", render: (i) => <Pill tone={i.state === "active" ? "ok" : "quiet"}>{i.state}</Pill> },
              { key: "uses", header: "Uses", render: (i) => <span className="mono t-small">{i.uses}{i.max_uses ? ` / ${i.max_uses}` : ""}</span> },
              {
                key: "expires",
                header: "Expires",
                render: (i) => <span className="t-small muted">{i.expires_at ? new Date(i.expires_at).toLocaleDateString() : "Never"}</span>,
              },
              {
                key: "actions",
                header: "Actions",
                align: "right",
                render: (i) => (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={i.state !== "active"}
                    onClick={async () => {
                      const r = await api.inviteRevoke(i.invite_id);
                      toast(r.ok ? "Invitation revoked" : "Could not revoke", r.ok ? "ok" : "error");
                      list.reload();
                    }}
                  >
                    Revoke
                  </Button>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ roles */

export function Roles() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const toast = useToast();
  const roles = useLv(() => api.roleList(hub.hub_id), [api, hub.hub_id]);
  const catalog = useLv(() => api.capabilityCatalog(), [api]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [caps, setCaps] = useState<string[]>([]);

  const grouped = catalog.data?.groups ?? [];

  async function create() {
    setCreating(true);
    const r = await api.roleCreate(hub.hub_id, name.trim(), "roles", caps);
    setCreating(false);
    if (r.ok) {
      setName("");
      setCaps([]);
      toast("Role created", "ok");
      roles.reload();
    } else {
      toast(describeError(r.error), "error");
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead
        eyebrow="Roles"
        title="Who can do what."
        sub="The Owner is protected and never consumes a custom-role slot. No one can grant a capability they do not hold themselves."
      />

      {roles.loading && <Loading rows={2} />}
      {roles.error && <ErrorNote error={roles.error} onRetry={roles.reload} />}
      {roles.data && (
        <Card className="stack">
          <QuotaMeter label="Custom roles" used={roles.data.slots_used} limit={roles.data.custom_slots} />
        </Card>
      )}

      <div className="stack">
        <h2 className="t-title">Roles</h2>
        {roles.data && roles.data.roles.length === 0 && (
          <Empty icon="roles" title="No custom roles yet">
            Start from a role like Moderator or Analyst and tick only the capabilities it needs.
          </Empty>
        )}
        <div className="grid grid-2">
          {roles.data?.roles.map((r) => <RoleCard key={r.role_id} role={r} onChanged={roles.reload} />)}
        </div>
      </div>

      <Card className="stack">
        <h2 className="t-title">New role</h2>
        <Field label="Role name" htmlFor="role-name" help="Members see this name on their profile and in member lists.">
          <TextInput id="role-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Moderator" />
        </Field>
        <div className="stack stack-sm">
          <p className="t-label muted">Capabilities</p>
          {grouped.map((g) => (
            <div key={g.key} className="stack stack-sm">
              <div className="row-between">
                <span className="t-small" style={{ fontWeight: 600 }}>{g.label}</span>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    setCaps((c) =>
                      g.capabilities.every((x) => c.includes(x.key))
                        ? c.filter((k) => !g.capabilities.some((x) => x.key === k))
                        : Array.from(new Set([...c, ...g.capabilities.map((x) => x.key)])),
                    )
                  }
                >
                  Toggle group
                </Button>
              </div>
              {g.capabilities.map((cap) => (
                <Checkbox
                  key={cap.key}
                  checked={caps.includes(cap.key)}
                  onChange={(v) => setCaps((c) => (v ? [...c, cap.key] : c.filter((k) => k !== cap.key)))}
                >
                  {cap.label} <code className="mono subtle" style={{ fontSize: 11 }}>{cap.key}</code>
                </Checkbox>
              ))}
            </div>
          ))}
        </div>
        <div className="row">
          <Button variant="primary" disabled={!name.trim() || !can(membership, "admin.roles.manage")} loading={creating} onClick={create}>
            Create role
          </Button>
          <span className="t-small subtle">A role can only grant capabilities you already hold.</span>
        </div>
      </Card>
    </div>
  );
}

function RoleCard({ role, onChanged }: { role: Role; onChanged: () => void }) {
  const { api } = useIdentity();
  const toast = useToast();
  return (
    <Card className="stack">
      <div className="row-between">
        <p className="t-title">{role.name}</p>
        <Pill>{role.capabilities.length} capabilities</Pill>
      </div>
      <p className="t-small subtle mono">{role.key}</p>
      <div className="row" style={{ gap: 4 }}>
        {role.capabilities.slice(0, 3).map((c) => (
          <Pill key={c} tone="quiet">
            {c}
          </Pill>
        ))}
        {role.capabilities.length > 3 && <Pill tone="quiet">+{role.capabilities.length - 3}</Pill>}
      </div>
      <span className="t-small subtle">{role.member_count} members</span>
      <Button
        size="sm"
        variant="danger"
        onClick={async () => {
          const r = await api.roleDelete(role.role_id);
          toast(r.ok ? "Role deleted" : "Could not delete role", r.ok ? "ok" : "error");
          onChanged();
        }}
      >
        Delete role
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------ settings + builder */

const HUB_PAGES = [
  { key: "home", label: "Home & Campaigns", state: "live" as const },
  { key: "shop", label: "Shop", state: "m2" as const },
  { key: "leaderboard", label: "Leaderboard", state: "m2" as const },
  { key: "newsroom", label: "Newsroom", state: "m2" as const },
  { key: "comments", label: "Comments", state: "m2" as const },
  { key: "custom", label: "Custom page", state: "m2" as const },
];

export function HubSettings() {
  const { hub } = useHubCtx();
  const [tab, setTab] = useState("branding");
  const [color, setColor] = useState("#FF9A18");
  const [pages, setPages] = useState<Record<string, boolean>>({ home: true, shop: false, leaderboard: false, newsroom: false, comments: true, custom: false });
  const [order, setOrder] = useState(HUB_PAGES.map((p) => p.key));

  const move = (i: number, dir: number) => {
    const next = [...order];
    const to = i + dir;
    if (to < 0 || to >= next.length) return;
    [next[i], next[to]] = [next[to], next[i]];
    setOrder(next);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead eyebrow="Hub settings" title="Make it yours." sub="Branding, visibility and the pages members see. Changes save to the Hub when the update endpoint exists." />

      <Segmented
        label="Settings sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: "branding", label: "Branding" },
          { key: "pages", label: "Pages" },
          { key: "about", label: "About" },
        ]}
      />

      {tab === "branding" && (
        <Card className="stack">
          <h2 className="t-title">Branding</h2>
          <Field label="Hub colour" help="Only contrast-safe colours are offered, so text on top always passes 4.5:1.">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <div className="row">
            <span className="s-raised" style={{ padding: "10px 16px", borderRadius: 999, background: color, color: "#14110F", fontWeight: 600 }}>
              Preview button
            </span>
            <span className="t-small subtle">Ink text on fill · amber is never used as text.</span>
          </div>
          <Field label="Hub mark" htmlFor="hub-logo" help="Image upload is not available yet. Your initials are used as a mark until then.">
            <div className="row">
              <HubMark name={hub.name} slug={hub.slug} size={48} />
              <Button variant="raised" size="sm" disabled>
                Upload a logo
              </Button>
            </div>
          </Field>
          <PendingNote fn={PENDING_API.hubUpdate} what="Saving branding" />
        </Card>
      )}

      {tab === "pages" && (
        <Card className="stack">
          <h2 className="t-title">Pages</h2>
          <p className="t-small muted">Turn pages on, then order them. The Starter plan allows 3 custom pages; Team expands this.</p>
          <div className="stack stack-sm">
            {order.map((key, i) => {
              const page = HUB_PAGES.find((p) => p.key === key)!;
              return (
                <div key={key} className="s-raised row" style={{ padding: 12, borderRadius: 16, gap: 12 }}>
                  <div className="stack stack-sm grow">
                    <span className="t-ui" style={{ fontWeight: 600 }}>{page.label}</span>
                    <span className="t-small subtle">
                      {page.state === "live" ? "Live" : "Coming with M2"}
                    </span>
                  </div>
                  {page.state === "m2" && <Pill tone="quiet">M2</Pill>}
                  <Switch
                    label={`${page.label} enabled`}
                    checked={pages[key]}
                    onChange={(v) => setPages((p) => ({ ...p, [key]: v }))}
                  />
                  <div className="row" style={{ gap: 4 }}>
                    <Button size="sm" variant="quiet" aria-label={`Move ${page.label} up`} onClick={() => move(i, -1)}>
                      <Icon name="chevron-left" size={16} />
                    </Button>
                    <Button size="sm" variant="quiet" aria-label={`Move ${page.label} down`} onClick={() => move(i, 1)}>
                      <Icon name="chevron-right" size={16} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <PendingNote fn={PENDING_API.hubUpdate} what="Saving pages" />
        </Card>
      )}

      {tab === "about" && (
        <Card className="stack">
          <h2 className="t-title">About</h2>
          <p className="t-small muted">
            {hub.name} · <span className="mono">/{hub.slug}</span> · {hub.visibility} · {hub.membership_mode.replace("_", " ")}
          </p>
          <div className="stack stack-sm">
            <p className="t-label muted">Made by KpnSolute</p>
            <MakerSignature still width={160} height={52} href="https://kpnsolute.com" label="Made by KpnSolute" />
          </div>
          <div className="divider" />
          <h3 className="t-title" style={{ color: "var(--lv-danger-ink)" }}>Owner-only zone</h3>
          <p className="t-small muted">Deleting a Hub removes its Campaigns and responses for everyone. Ownership must be transferred first.</p>
          <div className="row">
            <ButtonLink to={`/${hub.slug}/billing`} variant="raised" size="sm">
              Billing
            </ButtonLink>
            <Button variant="danger" size="sm" disabled>
              Delete Hub
            </Button>
          </div>
          <PendingNote fn={PENDING_API.hubDelete} what="Deleting a Hub" />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ billing */

export function HubBilling() {
  const { hub, membership } = useHubCtx();
  const plan = PLANS.find((p) => p.id === "starter")!;
  const plus = PLANS.find((p) => p.id === "campaign_plus")!;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead eyebrow="Billing" title="Plan and entitlements." sub="The backend evaluates entitlements. This page reports state and never activates a plan." back={{ to: `/${hub.slug}`, label: hub.name }} />

      {!membership?.is_owner && (
        <Notice tone="warn" title="Owner-only">
          Billing is visible to the Owner. You can see the plan but not change it.
        </Notice>
      )}

      <Card className="stack">
        <div className="row-between">
          <div className="stack stack-sm">
            <p className="t-label muted">Current plan</p>
            <p className="t-title">{plan.name}</p>
          </div>
          <Pill tone="accent">Preview</Pill>
        </div>
        <p className="t-small muted">
          {plan.priceLabel} {plan.cadence}. Entitlements: {plan.features.slice(0, 3).join(", ")}.
        </p>
        <PendingNote fn={PENDING_API.billingSummary} what="Reading billing state" />
        <div className="row">
          <Button variant="raised" disabled>
            Change plan
          </Button>
          <Button variant="quiet" disabled>
            Download invoices
          </Button>
        </div>
        <p className="t-small subtle">Disabled: checkout is not connected. No payment method is stored in this build.</p>
      </Card>

      <Card className="stack">
        <h2 className="t-title">{plus.name}</h2>
        <p className="t-small muted">
          A Team-family plan for a fixed window. Its price has not been supplied, so it cannot be bought and no number is shown.
        </p>
        <div className="row">
          <Button variant="raised" disabled>
            Unavailable until priced
          </Button>
          <ButtonLink to="/pricing" variant="quiet" size="sm">
            Compare plans
          </ButtonLink>
        </div>
      </Card>

      <Card className="stack">
        <h2 className="t-title">What happens on expiry</h2>
        <ul className="stack stack-sm">
          {["Premium actions fail closed.", "Nothing is deleted.", "Members keep answering what is already open.", "Export stays available."].map((t) => (
            <li key={t} className="row" style={{ gap: 8 }}>
              <Icon name="check" size={15} strokeWidth={2.4} />
              <span className="t-small">{t}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ reservation */

export function HubReservation() {
  const { hub } = useHubCtx();
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 720 }}>
      <PageHead
        eyebrow="Reserve your Hub URL"
        title={`/${hub.slug}`}
        sub="A reservation holds this address while you plan. It grants no features."
        back={{ to: `/${hub.slug}`, label: hub.name }}
      />
      <Card className="stack">
        <div className="row-between">
          <span className="t-label muted">Lifecycle</span>
          <Pill tone="accent">$25 per 12 months</Pill>
        </div>
        <Lifecycle steps={["ACTIVE", "GRACE", "RELEASED"]} current="ACTIVE" />
        <Progress value={365} max={365 + 25} label="Days in the current term including grace" />
        <p className="t-small muted">
          25 days of grace after expiry, then the address is released. A released address never exposes the previous owner's data.
        </p>
        <PendingNote fn={PENDING_API.reservationStatus} what="Reading reservation state" />
        <div className="row">
          <Button variant="primary" disabled>
            Renew for $25
          </Button>
          <ButtonLink to="/pricing" variant="quiet" size="sm">
            How reservations work
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ discover */

export function HubDiscover() {
  const { hub } = useHubCtx();
  const [open, setOpen] = useState(false);
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 720 }}>
      <PageHead eyebrow="Discover" title="Apply to be listed." sub="Listed Hubs are reviewed by a person. Eligibility starts at 700 genuine active members on the Team plan." back={{ to: `/${hub.slug}`, label: hub.name }} />
      <Card className="stack">
        <div className="row-between">
          <span className="t-label muted">Eligibility</span>
          <Pill tone="warn">Not eligible</Pill>
        </div>
        <Progress value={hub.member_count} max={700} label="Genuine active members" />
        <p className="t-small muted">
          {hub.member_count} of 700 genuine active members. Guests and duplicates never count, and the number is not rounded up.
        </p>
        <div className="row">
          <Button variant="raised" disabled>
            Apply to Discover
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
            What counts?
          </Button>
        </div>
        <PendingNote fn={PENDING_API.discoverApply} what="Applying to Discover" />
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="What counts as a genuine member?">
        <p className="t-small muted">
          A genuine member is a verified account with an accepted membership that has been active in the trailing window. Guests,
          duplicate accounts, invited-but-not-accepted people and bot traffic are excluded. The count is computed server-side; this
          page only reports it.
        </p>
        <div className="row row-end">
          <Button variant="raised" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
