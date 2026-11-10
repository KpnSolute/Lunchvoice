// The staff panel (/admin, 000023): overview with the audit log, one reports queue, Hub and account lookup with
// suspension, staff management, and the waitlist, Discover, billing and email views from 000019. Every call is an
// lv_admin_* function that refuses non-staff (lv_forbidden); non-staff see the ordinary not-found page.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { AdminAccountRow, AdminDiscoverApplication, AdminHubRow, AdminReportItem, LvError } from "../lib/lvApi";
import { NotFoundPage } from "./Marketing";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { EmptyState, Field, LoadingRows, Notice, PageHeader, SectionTitle, Segmented, StatTile } from "@/components/shadcn/blocks";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const familyName = (f?: string | null) => (f === "team" ? "Team" : f === "starter" ? "Starter" : "Free");

type Result = { ok: true } | { ok: false; error: LvError };
/** Run a staff action, toast the outcome, reload on success. A stale sign-in gets an explicit hint. */
async function act(p: Promise<Result>, done: string, after?: () => void): Promise<boolean> {
  const r = await p;
  if (r.ok) { toast.success(done); after?.(); return true; }
  toast.error((r.error.code as string) === "lv_reauth_required" ? "For safety, staff changes need a recent sign-in. Sign out, sign in again, then retry." : r.error.message || describeError(r.error));
  return false;
}

/** A short reason field plus one action button (suspend, block). The reason is required and shown to the person. */
function ReasonAction({ label, placeholder, variant = "danger", onSubmit }: { label: string; placeholder: string; variant?: "danger" | "secondary"; onSubmit: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span className="ui-row">
      <Input aria-label={`${label} reason`} placeholder={placeholder} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className="max-w-[20rem]" />
      <Button size="sm" variant={variant} disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); if (await onSubmit(reason.trim())) setReason(""); setBusy(false); }}>{label}</Button>
    </span>
  );
}

/* ------------------------------------------------------------------ overview + audit log */

function AuditLog() {
  const { api } = useIdentity();
  const [scope, setScope] = useState<"staff" | "all">("staff");
  const [action, setAction] = useState("");
  const [applied, setApplied] = useState("");
  const log = useLv(() => api.adminAudit(scope, applied || null), [api, scope, applied]);
  const events = log.data?.events ?? [];
  return (
    <Card data-testid="admin-audit">
      <SectionTitle>Recent staff actions</SectionTitle>
      <form className="ui-row" onSubmit={(e) => { e.preventDefault(); setApplied(action.trim()); }}>
        <Segmented<"staff" | "all"> value={scope} onValueChange={setScope} options={[{ value: "staff", label: "Staff actions" }, { value: "all", label: "Everything" }]} label="Audit scope" />
        <Input aria-label="Filter by action" placeholder="Action starts with, e.g. hub." value={action} onChange={(e) => setAction(e.target.value)} className="max-w-[16rem]" />
        <Button type="submit" size="sm" variant="secondary">Filter</Button>
      </form>
      {log.loading && !log.data ? <LoadingRows rows={3} /> : log.error ? <Notice tone="error">{describeError(log.error)}</Notice> : !events.length ? <EmptyState title="Nothing recorded yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.occurred_at).toLocaleString()}</TableCell>
                <TableCell>{e.actor_name ?? "System"}</TableCell>
                <TableCell className="ui-mono">{e.action}</TableCell>
                <TableCell className="ui-mono">{e.hub_slug ? `/${e.hub_slug}` : e.target ? `${e.target.slice(0, 8)}…` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="ui-help lv-m0">Only who, what and when. Reasons, answers and payloads are never shown here.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ reports */

function ReportsQueue() {
  const { api } = useIdentity();
  const [status, setStatus] = useState<"open" | "actioned" | "dismissed" | "all">("open");
  const [type, setType] = useState<"all" | "survey" | "comment">("all");
  const list = useLv(() => api.adminReports(status, type), [api, status, type]);
  const items: AdminReportItem[] = list.data?.items ?? [];
  const reload = list.reload;
  return (
    <div className="lv-stack-16" data-testid="admin-reports">
      <div className="ui-row">
        <Segmented<typeof status> value={status} onValueChange={setStatus} label="Report status"
          options={[{ value: "open", label: "Open" }, { value: "actioned", label: "Actioned" }, { value: "dismissed", label: "Dismissed" }, { value: "all", label: "All" }]} />
        <Segmented<typeof type> value={type} onValueChange={setType} label="Report type"
          options={[{ value: "all", label: "All types" }, { value: "survey", label: "Surveys" }, { value: "comment", label: "Comments" }]} />
      </div>
      {list.loading && !list.data ? <LoadingRows rows={3} /> : list.error ? <Notice tone="error">{describeError(list.error)}</Notice> : !items.length ? <EmptyState title="No reports here" /> : items.map((r) => (
        <Card key={`${r.type}-${r.id}`} size="sm" data-testid="admin-report-item" data-type={r.type}>
          <div className="ui-spread">
            <strong>{r.type === "survey" ? r.campaign_title ?? "Deleted Campaign" : "Comment"}</strong>
            <span className="ui-row">
              <Badge variant="outline">{r.type === "survey" ? "Survey" : "Comment"}</Badge>
              <Badge variant={r.status === "open" ? "neutral" : r.status === "actioned" ? "ok" : "outline"}>{r.status}</Badge>
              {r.blocked && <Badge variant="danger">Blocked</Badge>}
              {r.hidden && <Badge variant="danger">Hidden</Badge>}
              {r.hub_suspended && <Badge variant="danger">Hub suspended</Badge>}
            </span>
          </div>
          <p className="ui-muted lv-m0">
            {r.quick_survey ? "Quick Survey" : r.hub_slug ? <Link className="lv-inline-link" to={`/${r.hub_slug}`}>{r.hub_name ?? r.hub_slug}</Link> : "No Hub"}
            {r.type === "survey" && r.join_code && <> · <Link className="lv-inline-link" to={`/c/${r.join_code}`}>open survey</Link></>}
            {" "}· {r.report_count} report{r.report_count === 1 ? "" : "s"} · {fmtDate(r.created_at)}
          </p>
          {r.type === "comment" && r.excerpt && <blockquote className="lv-m0 ui-muted">“{r.excerpt}”</blockquote>}
          <ul className="lv-m0">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <div className="ui-row">
            {r.type === "survey" && r.campaign_id && (r.blocked
              ? <Button size="sm" variant="secondary" onClick={() => act(api.adminCampaignUnblock(r.campaign_id!), "Survey unblocked", reload)}>Unblock survey</Button>
              : <ReasonAction label="Block survey" placeholder="Why (kept in the audit log)" onSubmit={(why) => act(api.adminCampaignBlock(r.campaign_id!, why), "Survey blocked", reload)} />)}
            {r.type === "comment" && r.comment_id && (r.hidden
              ? <Button size="sm" variant="secondary" onClick={() => act(api.adminCommentHide(r.comment_id!, false), "Comment shown", reload)}>Show comment</Button>
              : <Button size="sm" variant="danger" onClick={() => act(api.adminCommentHide(r.comment_id!, true), "Comment hidden", reload)}>Hide comment</Button>)}
            {r.status === "open" && (
              <Button size="sm" variant="quiet" onClick={() => act(r.type === "survey" ? api.adminReportDismiss(r.id) : api.adminCommentReportsDismiss(r.id), "Dismissed", reload)}>Dismiss</Button>
            )}
            {r.hub_id && !r.quick_survey && !r.hub_suspended && (
              <ReasonAction label="Suspend Hub" placeholder="Reason the Owner will see" onSubmit={(why) => act(api.adminHubSuspend(r.hub_id!, why), "Hub suspended", reload)} />
            )}
          </div>
        </Card>
      ))}
      <p className="ui-help lv-m0">Reporters are never shown. Blocking, hiding and suspending keep every record; nothing is deleted.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Hubs */

function HubsLookup() {
  const { api } = useIdentity();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminHubRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  async function search(e?: FormEvent) {
    e?.preventDefault();
    const r = await api.adminHubSearch(q.trim());
    if (r.ok) { setRows(r.hubs); setProblem(null); } else { setRows(null); setProblem(describeError(r.error)); }
  }
  return (
    <Card data-testid="admin-hubs">
      <form className="lv-invite-form" onSubmit={search}>
        <Field label="Hub slug or name" htmlFor="admin-hub-q"><Input id="admin-hub-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="northside" /></Field>
        <Button type="submit" variant="ink" disabled={!q.trim()}>Search</Button>
      </form>
      {problem && <Notice tone="warn">{problem}</Notice>}
      {rows && !rows.length && <EmptyState title="No Hub matches" />}
      {rows?.map((h) => (
        <Card key={h.hub_id} size="sm" variant="well" data-testid="admin-hub-row">
          <div className="ui-spread">
            <strong><Link className="lv-inline-link" to={`/${h.slug}`}>{h.name}</Link> <span className="ui-mono ui-muted">/{h.slug}</span></strong>
            {h.suspension ? <Badge variant="danger">Suspended</Badge> : <Badge variant="ok">Active</Badge>}
          </div>
          <p className="ui-muted lv-m0">{familyName(h.plan?.family)} · {h.plan?.state} · {h.member_count} member{h.member_count === 1 ? "" : "s"} · {h.visibility} · created {fmtDate(h.created_at)} · Owner {h.owner_name ?? "—"} · {h.open_reports} open reports</p>
          {h.suspension ? (
            <div className="ui-row">
              <span className="ui-muted">Suspended {fmtDate(h.suspension.suspended_at)}: {h.suspension.reason}</span>
              <Button size="sm" variant="secondary" onClick={() => act(api.adminHubUnsuspend(h.hub_id), "Hub unsuspended", () => void search())}>Unsuspend</Button>
            </div>
          ) : (
            <ReasonAction label="Suspend Hub" placeholder="Reason the Owner will see" onSubmit={(why) => act(api.adminHubSuspend(h.hub_id, why), "Hub suspended", () => void search())} />
          )}
        </Card>
      ))}
      <p className="ui-help lv-m0">A suspended Hub is hidden from Discover and its members, takes no responses and can't publish. Nothing is deleted.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ accounts */

function AccountsLookup() {
  const { api } = useIdentity();
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<AdminAccountRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string[]>>({});
  async function search(e?: FormEvent) {
    e?.preventDefault();
    const r = await api.adminAccountSearch(email.trim());
    if (r.ok) { setRows(r.accounts); setProblem(null); } else { setRows(null); setProblem(describeError(r.error)); }
  }
  return (
    <Card data-testid="admin-accounts">
      <form className="lv-invite-form" onSubmit={search}>
        <Field label="Verified email (exact)" htmlFor="admin-acc-q" help="Only an exact, verified email finds an account. Results never echo the address.">
          <Input id="admin-acc-q" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
        </Field>
        <Button type="submit" variant="ink" disabled={!email.trim()}>Search</Button>
      </form>
      {problem && <Notice tone="warn">{problem}</Notice>}
      {rows && !rows.length && <EmptyState title="No account has verified that email" />}
      {rows?.map((a) => (
        <Card key={a.account_id} size="sm" variant="well" data-testid="admin-account-row">
          <div className="ui-spread">
            <strong>{a.display_name}</strong>
            <span className="ui-row">{a.is_staff && <Badge variant="ink">Staff</Badge>}{a.suspension ? <Badge variant="danger">Suspended</Badge> : <Badge variant="ok">Active</Badge>}</span>
          </div>
          <p className="ui-muted lv-m0">Joined {fmtDate(a.created_at)} · owns {a.hubs_owned} Hub{a.hubs_owned === 1 ? "" : "s"} · member of {a.memberships}</p>
          <div className="ui-row">
            {revealed[a.account_id]
              ? <span className="ui-mono">{revealed[a.account_id]!.join(", ") || "No verified email"}</span>
              : <Button size="sm" variant="quiet" onClick={async () => {
                  const r = await api.adminAccountEmailReveal(a.account_id);
                  if (r.ok) setRevealed((x) => ({ ...x, [a.account_id]: r.emails })); else toast.error(describeError(r.error));
                }}>Reveal email</Button>}
            {a.suspension ? (
              <>
                <span className="ui-muted">Suspended {fmtDate(a.suspension.suspended_at)}: {a.suspension.reason}</span>
                <Button size="sm" variant="secondary" onClick={() => act(api.adminAccountUnsuspend(a.account_id), "Account unsuspended", () => void search())}>Unsuspend</Button>
              </>
            ) : !a.is_staff && (
              <ReasonAction label="Suspend account" placeholder="Reason the person will see" onSubmit={(why) => act(api.adminAccountSuspend(a.account_id, why), "Account suspended", () => void search())} />
            )}
          </div>
        </Card>
      ))}
      <p className="ui-help lv-m0">A suspended account can still sign in, read, leave Hubs and delete its data, but can't answer Campaigns, join Hubs, create, publish, post, comment or order. Revealing an email is recorded in the audit log.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ staff */

function StaffManager() {
  const { api } = useIdentity();
  const list = useLv(() => api.adminStaffList(), [api]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const staff = list.data?.staff ?? [];
  return (
    <div className="ui-grid-2" data-testid="admin-staff">
      <Card>
        <SectionTitle>Staff</SectionTitle>
        {list.loading && !list.data ? <LoadingRows rows={2} /> : list.error ? <Notice tone="error">{describeError(list.error)}</Notice> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Since</TableHead><TableHead>Added by</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {staff.map((m) => (
                <TableRow key={m.account_id} data-testid="staff-row">
                  <TableCell>{m.display_name}{m.is_me && <> <Badge variant="outline">You</Badge></>}</TableCell>
                  <TableCell>{fmtDate(m.granted_at)}</TableCell>
                  <TableCell>{m.granted_by_name ?? "Operator"}</TableCell>
                  <TableCell>
                    {m.is_me ? <span className="ui-help">Another staff member must remove you</span> : (
                      <Button size="sm" variant="quiet" disabled={staff.length <= 1} onClick={() => act(api.adminStaffRevoke(m.account_id), `${m.display_name} removed from staff`, list.reload)}>Remove</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="ui-help lv-m0">The last staff member can never be removed, and nobody removes themselves.</p>
      </Card>
      <Card>
        <SectionTitle>Add staff</SectionTitle>
        <form className="lv-stack-16" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await api.adminStaffAdd(email.trim());
          setBusy(false);
          if (r.ok) { toast.success(r.already_staff ? "They are already staff" : `${r.display_name ?? "They"} can now open the staff panel`); setEmail(""); list.reload(); }
          else toast.error((r.error.code as string) === "lv_reauth_required" ? "For safety, staff changes need a recent sign-in. Sign out, sign in again, then retry." : r.error.message || describeError(r.error));
        }}>
          <Field label="Their verified email" htmlFor="staff-email" help="They must have signed in to LunchVoice once with this email verified. A display name never finds anyone.">
            <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
          </Field>
          <div className="ui-row"><Button type="submit" variant="ink" disabled={busy || !email.trim()}>{busy ? "Adding…" : "Add to staff"}</Button></div>
        </form>
        <p className="ui-help lv-m0">Adding or removing staff needs a sign-in from the last few minutes. Every change is in the audit log.</p>
      </Card>
    </div>
  );
}
/* ------------------------------------------------------------------ /admin */

function AdminWaitlist() {
  const { api } = useIdentity();
  const list = useLv(() => api.adminWaitlist(200, 0), [api]);
  const ov = useLv(() => api.adminOverviewV2(), [api]);
  const [opened, setOpened] = useState<Record<string, string>>({});
  if (list.loading && !list.data) return <LoadingRows rows={4} />;
  if (list.error) return <Notice tone="error">{describeError(list.error)}</Notice>;
  const entries = list.data?.entries ?? [];
  if (!entries.length) return <EmptyState title="Nobody has joined yet" />;
  const w = ov.data?.waitlist;
  return (
    <div className="lv-stack-16">
      {w && (
        <p className="ui-muted lv-m0" data-testid="waitlist-summary">
          <strong>{w.seats_taken} of {w.seats_total}</strong> Founding seats taken · {Math.max(0, w.seats_total - w.seats_taken)} open · {w.waitlisted} waiting · {w.with_contact} left a contact email
        </p>
      )}
    <Table>
      <TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Intended Hub</TableHead><TableHead>Contact</TableHead></TableRow></TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.entry_id}>
            <TableCell>{e.position}</TableCell>
            <TableCell><Badge variant={e.status === "admitted" ? "ok" : "neutral"}>{e.status}</Badge></TableCell>
            <TableCell>{fmtDate(e.joined_at)}</TableCell>
            <TableCell>{e.intended_hub_name ?? "—"}</TableCell>
            <TableCell>
              <div className="lv-wl-contact">
                {!e.has_contact_email ? <span className="ui-muted">None</span> : opened[e.entry_id] ? <span className="ui-mono">{opened[e.entry_id]}</span> : (
                  <Button size="sm" variant="quiet" onClick={async () => {
                    const r = await api.adminWaitlistContact(e.entry_id);
                    if (r.ok) setOpened((o) => ({ ...o, [e.entry_id]: r.contact_email ?? "None" })); else toast.error(describeError(r.error));
                  }}>Show email</Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function AdminDiscover() {
  const { api } = useIdentity();
  const list = useLv(() => api.adminDiscoverList("all"), [api]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const apps: AdminDiscoverApplication[] = list.data?.applications ?? [];
  async function decide(id: string, approve: boolean) {
    const r = await api.adminDiscoverDecide(id, approve, notes[id] ?? null);
    if (r.ok) { toast.success(approve ? "Approved" : "Rejected"); list.reload(); } else toast.error(describeError(r.error));
  }
  if (list.loading && !list.data) return <LoadingRows rows={3} />;
  if (list.error) return <Notice tone="error">{describeError(list.error)}</Notice>;
  if (!apps.length) return <EmptyState title="No Discover applications" />;
  return (
    <div className="lv-stack-16">
      {apps.map((a) => (
        <Card key={a.application_id} size="sm" data-testid="admin-discover">
          <div className="ui-spread"><strong>{a.hub_name}</strong><Badge variant={a.status === "approved" ? "ok" : a.status === "rejected" ? "danger" : "neutral"}>{a.status}</Badge></div>
          <p className="ui-muted lv-m0">lunchvoice.com/{a.hub_slug} · {familyName(a.family)} · {a.genuine_members_now} genuine active members now ({a.genuine_members_at_apply} at apply)</p>
          <div className="ui-row">
            <Input aria-label="Decision note" placeholder="Note (optional)" maxLength={500} value={notes[a.application_id] ?? a.note ?? ""}
              onChange={(e) => setNotes((x) => ({ ...x, [a.application_id]: e.target.value }))} className="max-w-[22rem]" />
            <Button size="sm" variant="ink" disabled={a.status === "approved"} onClick={() => decide(a.application_id, true)}>Approve</Button>
            <Button size="sm" variant="quiet" disabled={a.status === "rejected"} onClick={() => decide(a.application_id, false)}>Reject</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AdminBilling() {
  const { api } = useIdentity();
  const list = useLv(() => api.adminBillingEvents(200), [api]);
  if (list.loading && !list.data) return <LoadingRows rows={3} />;
  if (list.error) return <Notice tone="error">{describeError(list.error)}</Notice>;
  const events = list.data?.events ?? [];
  if (!events.length) return <EmptyState title="No billing events yet">Stripe events appear here once the webhook is live. Payloads are never stored.</EmptyState>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Type</TableHead><TableHead>Outcome</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}><TableCell>{new Date(e.received_at).toLocaleString()}</TableCell><TableCell className="ui-mono">{e.type}</TableCell>
            <TableCell><Badge variant={e.outcome === "applied" ? "ok" : e.outcome === "rejected" ? "danger" : "neutral"}>{e.outcome}</Badge></TableCell><TableCell>{e.reason ?? "—"}</TableCell></TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AdminEmail() {
  const { api } = useIdentity();
  const box = useLv(() => api.adminEmailOutbox(50), [api]);
  if (box.loading && !box.data) return <LoadingRows rows={3} />;
  if (box.error) return <Notice tone="error">{describeError(box.error)}</Notice>;
  const d = box.data!;
  return (
    <div className="lv-stack-16">
      <div className="ui-row">{Object.entries(d.counts).map(([k, v]) => <Badge key={k} variant="outline">{k}: {v}</Badge>)}</div>
      {!d.recent.length ? <EmptyState title="No mail yet" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Last error</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.recent.map((m) => (
              <TableRow key={m.id}><TableCell>{new Date(m.created_at).toLocaleString()}</TableCell><TableCell className="ui-mono">{m.template}</TableCell>
                <TableCell>{m.status}</TableCell><TableCell>{m.attempts}</TableCell><TableCell>{m.last_error ?? "—"}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="ui-help lv-m0">Addresses and message contents are never shown here. Without a Resend key, mail stays queued.</p>
    </div>
  );
}


/* ------------------------------------------------------------------ the page */

export function Admin() {
  const { api } = useIdentity();
  const ov = useLv(() => api.adminOverviewV2(), [api]);
  const [tab, setTab] = useState("overview");
  if (ov.loading && !ov.data) return <div className="ui-page"><LoadingRows rows={4} /></div>;
  // Non-staff see the ordinary not-found page: the panel does not announce itself.
  if (ov.error?.code === "lv_forbidden" || ov.error?.code === "lv_unauthenticated") return <NotFoundPage />;
  if (ov.error) return <div className="ui-page"><Notice tone="error">{describeError(ov.error)}</Notice></div>;
  const o = ov.data!;
  const open = (o.reports_open ?? 0) + (o.comment_reports_open ?? 0);
  return (
    <div className="ui-page" data-testid="admin-console">
      <PageHeader eyebrow="LunchVoice staff" title="Staff panel" sub="Reports, Hubs, accounts, staff, the waitlist, Discover, billing and email. Every action is audited; nothing here deletes data." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Staff panel sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports">Reports{open ? ` (${open})` : ""}</TabsTrigger>
          <TabsTrigger value="hubs">Hubs</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="lv-stack-16">
            <div className="ui-grid-3">
              <StatTile label="Open reports" value={open} note={`${o.campaigns_blocked} surveys blocked`} />
              <StatTile label="Suspended" value={`${o.hubs_suspended ?? 0} / ${o.accounts_suspended ?? 0}`} note="Hubs / accounts" />
              <StatTile label="Staff" value={o.staff ?? 0} note="active" />
              <StatTile label="Waitlist" value={`${o.waitlist.seats_taken}/${o.waitlist.seats_total}`} note={`${o.waitlist.waitlisted} waiting`} />
              <StatTile label="Discover" value={o.discover_pending} note="pending" />
              <StatTile label="Email" value={o.email.queued} note={`queued · ${o.email.failed} failed`} />
            </div>
            {!o.billing.provider_ready && <Notice tone="info">Billing is not open (billing.provider_ready is false). Checkout stays off everywhere.</Notice>}
            <AuditLog />
          </div>
        </TabsContent>
        <TabsContent value="reports"><ReportsQueue /></TabsContent>
        <TabsContent value="hubs"><HubsLookup /></TabsContent>
        <TabsContent value="accounts"><AccountsLookup /></TabsContent>
        <TabsContent value="staff"><StaffManager /></TabsContent>
        <TabsContent value="waitlist"><Card><AdminWaitlist /></Card></TabsContent>
        <TabsContent value="discover"><AdminDiscover /></TabsContent>
        <TabsContent value="billing"><Card><AdminBilling /></Card></TabsContent>
        <TabsContent value="email"><Card><AdminEmail /></Card></TabsContent>
      </Tabs>
    </div>
  );
}
