// Track B: commerce. Checkout buttons (enabled only when lv_billing_config says the product is on sale), the Hub
// billing and reservation pages, the reservation purchase page (/reserve) and the platform admin console (/admin).
// Display only: the backend decides every price, limit and permission; checkout amounts come from lv.products.
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { slugProblem } from "../lib/reservedSlugs";
import { describeError } from "../lib/errors";
import type { AdminDiscoverApplication, AdminReport, LvError, ReservationStatus } from "../lib/lvApi";
import { PLANS } from "../config/pricing";
import { CheckoutButton, CheckoutReturnNotice, planOf, useBillingConfig, WeeksField } from "../components/Checkout";
import { useHubCtx } from "./Hub";
import { NotFoundPage } from "./Marketing";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { DisabledAction, EmptyState, Eyebrow, Field, LoadingRows, Notice, PageHeader, QuotaMeter, SectionTitle, StatTile } from "@/components/shadcn/blocks";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const familyName = (f?: string | null) => (f === "team" ? "Team" : f === "starter" ? "Starter" : "Free");

/* ------------------------------------------------------------------ /:hub/billing */

export function HubBilling() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const loc = useLocation();
  const summary = useLv(() => api.billingSummaryV2(hub.hub_id), [api, hub.hub_id]);
  const { config } = useBillingConfig();
  const [weeks, setWeeks] = useState(2);
  const [portalBusy, setPortalBusy] = useState(false);
  const s = summary.data;
  const lim = (k: string) => (s?.limits[k] ?? null) as number | null;
  const owner = Boolean(membership?.is_owner);
  const sub = s?.subscription ?? null;

  async function portal() {
    setPortalBusy(true);
    const r = await api.billingPortal(loc.pathname);
    if (r.ok) { window.location.assign(r.url); return; }
    setPortalBusy(false);
    toast.error(describeError(r.error));
  }

  return (
    <div className="lv-stack-16" data-testid="hub-billing">
      <CheckoutReturnNotice />
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

          {sub && (
            <Card data-testid="hub-subscription">
              <SectionTitle>Subscription</SectionTitle>
              <dl className="lv-kv">
                <dt>Status</dt><dd>{sub.status}</dd>
                <dt>Current period ends</dt><dd>{fmtDate(sub.current_period_end)}</dd>
              </dl>
              {sub.cancel_at_period_end && <Notice tone="info">This subscription is cancelled and ends on {fmtDate(sub.current_period_end)}. Access continues until then and nothing is deleted.</Notice>}
              {sub.manageable
                ? <Button variant="secondary" onClick={portal} disabled={portalBusy || !config?.portal_available} data-testid="manage-subscription">{portalBusy ? "Opening…" : "Manage subscription"}</Button>
                : <p className="ui-help lv-m0">Only the person who pays for this plan can change or cancel it.</p>}
            </Card>
          )}
          {!sub && config?.portal_available && (
            <div className="ui-row"><Button variant="quiet" onClick={portal} disabled={portalBusy} data-testid="manage-subscription">Manage billing</Button></div>
          )}

          <Card>
            <SectionTitle>Change plan</SectionTitle>
            {!owner && <p className="ui-help lv-m0">Only the Owner can buy a plan for this Hub.</p>}
            <div className="lv-price-cards">
              {(["starter_hub", "team_hub"] as const).map((product) => {
                const p = planOf(product)!;
                return (
                  <Card key={product} variant="well" size="sm">
                    <strong>{p.name}</strong>
                    <div className="lv-price-figure"><strong>{p.priceLabel}</strong><span>{p.cadence}</span></div>
                    {owner && <CheckoutButton product={product} config={config} label={`Choose ${p.name}`} hub={hub.hub_id} returnPath={loc.pathname} variant="secondary" />}
                  </Card>
                );
              })}
            </div>
            <p className="ui-help lv-m0">Prices exclude tax, which Stripe calculates at checkout. Cancel anytime; access continues to the end of the paid period.</p>
          </Card>

          {owner && (
            <Card>
              <SectionTitle>Run one Campaign window</SectionTitle>
              <p className="ui-muted lv-m0">A Campaign plan gives this Hub its features for the weeks you choose, with no subscription. Refundable until the window starts.</p>
              <WeeksField id="hub-weeks" value={weeks} onChange={setWeeks} />
              <div className="ui-row">
                {(["campaign_starter", "campaign_plus"] as const).map((product) => {
                  const p = planOf(product)!;
                  return <CheckoutButton key={product} product={product} config={config} label={`${p.name} · ${p.priceLabel} ${p.cadence}`} hub={hub.hub_id} weeks={weeks} returnPath={loc.pathname} variant="secondary" />;
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ /:hub/reservation */

export function HubReservation() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const status = useLv(() => api.reservationStatus(hub.slug), [api, hub.slug]);
  const [check, setCheck] = useState("");
  const [checked, setChecked] = useState<{ slug: string; state: string; canBuy: boolean } | null>(null);
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
              <dt>Reservation</dt><dd>{st.state === "taken" ? "Held by this Hub while it exists" : st.state}</dd>
              {st.expires_at && <><dt>Expires</dt><dd>{fmtDate(st.expires_at)}</dd></>}
              {st.grace_ends_at && <><dt>Grace ends</dt><dd>{fmtDate(st.grace_ends_at)}</dd></>}
            </dl>
          )}
          <div className="lv-price-figure"><strong>{reservation.priceLabel}</strong><span>{reservation.cadence}</span></div>
          <DisabledAction reason="A live Hub already holds its own address. Reserve other names below.">Reserve this address</DisabledAction>
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
          if (slugProblem(slug)) return setChecked({ slug, state: slugProblem(slug) === "reserved" ? "reserved for the platform" : "not a valid address", canBuy: false });
          const r = await api.reservationStatus(slug);
          setChecked({ slug, state: r.ok ? r.state : describeError(r.error), canBuy: r.ok && (r.state === "available" || r.state === "released" || (r.mine && (r.state === "active" || r.state === "grace"))) });
        }}>
          <Field label="Address" htmlFor="res-check"><Input id="res-check" value={check} onChange={(e) => setCheck(e.target.value)} placeholder="harbor-book-circle" /></Field>
          <Button type="submit" variant="ink" disabled={!check.trim()}>Check</Button>
        </form>
        {checked && (
          <Notice tone={checked.canBuy ? "ok" : "info"}>
            lunchvoice.com/{checked.slug}: {checked.state}.{" "}
            {checked.canBuy && <Link className="lv-inline-link" to={`/reserve?slug=${encodeURIComponent(checked.slug)}`}>Reserve it</Link>}
          </Notice>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ /reserve */

function reservable(r: ReservationStatus): "buy" | "renew" | null {
  if (r.state === "available" || r.state === "released") return "buy";
  if (r.mine && (r.state === "active" || r.state === "grace")) return "renew";
  return null;
}

export function Reserve() {
  const { api } = useIdentity();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("slug") ?? "").toLowerCase();
  const [input, setInput] = useState(initial);
  const [status, setStatus] = useState<ReservationStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { config } = useBillingConfig();
  const plan = PLANS.find((p) => p.id === "reservation")!;

  async function look(slug: string) {
    setStatus(null);
    setProblem(null);
    const p = slugProblem(slug);
    if (p) return setProblem(p === "reserved" ? "That name is reserved for the platform." : "Use 3 to 40 lowercase letters, numbers and single hyphens.");
    const r = await api.reservationStatus(slug);
    if (r.ok) setStatus(r); else setProblem(describeError(r.error));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initial) void look(initial); }, [initial]);

  const action = status ? reservable(status) : null;
  return (
    <div className="ui-page lv-narrow-page" data-testid="reserve-page">
      <PageHeader eyebrow="Reserve your Hub URL" title="Hold a name while you plan" sub={`${plan.priceLabel} ${plan.cadence}. A reservation keeps the address only; it doesn't include paid Hub features.`} />
      <div className="lv-stack-16">
        <CheckoutReturnNotice />
        <Card>
          <form className="lv-invite-form" onSubmit={(e) => { e.preventDefault(); const slug = input.trim().toLowerCase(); setParams(slug ? { slug } : {}); void look(slug); }}>
            <Field label="Address" htmlFor="reserve-slug" help="lunchvoice.com/your-name">
              <Input id="reserve-slug" value={input} onChange={(e) => setInput(e.target.value)} placeholder="harbor-book-circle" autoComplete="off" />
            </Field>
            <Button type="submit" variant="ink" disabled={!input.trim()}>Check</Button>
          </form>
          {problem && <Notice tone="warn">{problem}</Notice>}
          {status && (
            <div className="lv-stack-16" data-testid="reserve-status" data-state={status.state}>
              <dl className="lv-kv">
                <dt>Address</dt><dd className="ui-mono">lunchvoice.com/{status.slug}</dd>
                <dt>State</dt><dd>{status.state === "taken" ? "In use or not available" : status.state}{status.mine ? " (yours)" : ""}</dd>
                {status.expires_at && <><dt>Expires</dt><dd>{fmtDate(status.expires_at)}</dd></>}
                {status.grace_ends_at && <><dt>Grace ends</dt><dd>{fmtDate(status.grace_ends_at)}</dd></>}
              </dl>
              {action ? (
                <CheckoutButton product="hub_reservation" config={config} slug={status.slug} returnPath={`/reserve?slug=${status.slug}`}
                  label={action === "renew" ? `Renew for ${plan.priceLabel}` : `Reserve for ${plan.priceLabel}`} />
              ) : (
                <Notice tone="info">This name can't be reserved right now.</Notice>
              )}
            </div>
          )}
        </Card>
        <Card variant="well">
          <div className="lv-lifecycle"><span>ACTIVE · 12 months</span><i aria-hidden="true">→</i><span>GRACE · 25 days</span><i aria-hidden="true">→</i><span>RELEASED</span></div>
          <p className="ui-muted lv-m0">Only you can create a Hub with a reserved name while it is active or in grace. Renew any time before grace ends. A full refund releases the name.</p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ /admin */

function AdminWaitlist() {
  const { api } = useIdentity();
  const list = useLv(() => api.adminWaitlist(200, 0), [api]);
  const [opened, setOpened] = useState<Record<string, string>>({});
  if (list.loading && !list.data) return <LoadingRows rows={4} />;
  if (list.error) return <Notice tone="error">{describeError(list.error)}</Notice>;
  const entries = list.data?.entries ?? [];
  if (!entries.length) return <EmptyState title="Nobody has joined yet" />;
  return (
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
              {!e.has_contact_email ? "None" : opened[e.entry_id] ? <span className="ui-mono">{opened[e.entry_id]}</span> : (
                <Button size="sm" variant="quiet" onClick={async () => {
                  const r = await api.adminWaitlistContact(e.entry_id);
                  if (r.ok) setOpened((o) => ({ ...o, [e.entry_id]: r.contact_email ?? "None" })); else toast.error(describeError(r.error));
                }}>Show email</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AdminReports() {
  const { api } = useIdentity();
  const [status, setStatus] = useState<"open" | "actioned" | "dismissed">("open");
  const list = useLv(() => api.adminAbuseReports(status), [api, status]);
  const [reason, setReason] = useState<Record<string, string>>({});
  async function act(p: Promise<{ ok: boolean; error?: LvError }>, done: string) {
    const r = await p;
    if (r.ok) { toast.success(done); list.reload(); } else if (r.error) toast.error(describeError(r.error));
  }
  const rows: AdminReport[] = list.data?.reports ?? [];
  return (
    <div className="lv-stack-16">
      <div className="ui-row">
        {(["open", "actioned", "dismissed"] as const).map((s) => <Button key={s} size="sm" variant={s === status ? "ink" : "quiet"} onClick={() => setStatus(s)}>{s}</Button>)}
      </div>
      {list.loading && !list.data ? <LoadingRows rows={3} /> : list.error ? <Notice tone="error">{describeError(list.error)}</Notice> : !rows.length ? <EmptyState title="No reports here" /> : rows.map((r) => (
        <Card key={r.report_id} size="sm" data-testid="admin-report">
          <div className="ui-spread"><strong>{r.campaign_title ?? "Deleted Campaign"}</strong>{r.blocked ? <Badge variant="danger">Blocked</Badge> : <Badge variant="neutral">{r.status}</Badge>}</div>
          <p className="ui-muted lv-m0">{r.quick_survey ? "Quick Survey" : r.hub_name ?? "Hub"} · {r.join_code ?? "no code"} · {fmtDate(r.created_at)} · {r.open_reports} open</p>
          <p className="lv-m0">“{r.reason}”</p>
          {r.campaign_id && (
            <div className="ui-row">
              {r.blocked ? (
                <Button size="sm" variant="secondary" onClick={() => act(api.adminCampaignUnblock(r.campaign_id!), "Unblocked")}>Unblock</Button>
              ) : (
                <>
                  <Input aria-label="Block reason" placeholder="Reason (shown in the audit log)" value={reason[r.report_id] ?? ""} maxLength={500}
                    onChange={(e) => setReason((x) => ({ ...x, [r.report_id]: e.target.value }))} className="max-w-[22rem]" />
                  <Button size="sm" variant="danger" disabled={!(reason[r.report_id] ?? "").trim()} onClick={() => act(api.adminCampaignBlock(r.campaign_id!, reason[r.report_id]!), "Campaign blocked")}>Block Campaign</Button>
                </>
              )}
              {r.status === "open" && <Button size="sm" variant="quiet" onClick={() => act(api.adminReportDismiss(r.report_id), "Dismissed")}>Dismiss</Button>}
            </div>
          )}
        </Card>
      ))}
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

export function Admin() {
  const { api } = useIdentity();
  const ov = useLv(() => api.adminOverview(), [api]);
  if (ov.loading && !ov.data) return <div className="ui-page"><LoadingRows rows={4} /></div>;
  // Non-admins see the ordinary not-found page: the console does not announce itself.
  if (ov.error?.code === "lv_forbidden" || ov.error?.code === "lv_unauthenticated") return <NotFoundPage />;
  if (ov.error) return <div className="ui-page"><Notice tone="error">{describeError(ov.error)}</Notice></div>;
  const o = ov.data!;
  return (
    <div className="ui-page" data-testid="admin-console">
      <PageHeader eyebrow="Platform" title="Admin console" sub="Waitlist, abuse reports, Discover applications, billing and email. Every action is audited." />
      <div className="lv-stack-16">
        <div className="ui-grid-3">
          <StatTile label="Waitlist" value={`${o.waitlist.seats_taken}/${o.waitlist.seats_total}`} note={`${o.waitlist.waitlisted} waiting`} />
          <StatTile label="Open reports" value={o.reports_open} note={`${o.campaigns_blocked} blocked`} />
          <StatTile label="Discover" value={o.discover_pending} note="pending" />
          <StatTile label="Email" value={o.email.queued} note={`queued · ${o.email.failed} failed`} />
        </div>
        {!o.billing.provider_ready && <Notice tone="info">Billing is not open (billing.provider_ready is false). Checkout stays off everywhere.</Notice>}
        <Tabs defaultValue="waitlist">
          <TabsList aria-label="Admin sections">
            <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
          <TabsContent value="waitlist"><Card><AdminWaitlist /></Card></TabsContent>
          <TabsContent value="reports"><AdminReports /></TabsContent>
          <TabsContent value="discover"><AdminDiscover /></TabsContent>
          <TabsContent value="billing"><Card><AdminBilling /></Card></TabsContent>
          <TabsContent value="email"><Card><AdminEmail /></Card></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
