// DEV-ONLY mock of the track B backend (000019): billing config, checkout and Customer Portal (the `checkout` Edge
// Function), Hub invites by email and the platform admin console. Imported only by mockTransport.ts, so it is
// dropped from production bundles with it. It mirrors the backend's rules closely enough to click through the
// flows; the backend stays authoritative.
//
// Dev switches (localStorage):
//   lv.mock.billing = "ready"   billing provider ready: every product on sale, checkout and portal work
//   lv.mock.admin   = "1"       the signed-in mock account is a platform admin
import { slugProblem } from "./reservedSlugs";

const STORE = "lv.mock.commerce";
const DAY = 86_400_000;
const PRODUCTS = ["starter_hub", "team_hub", "campaign_starter", "campaign_plus", "hub_reservation"] as const;

type Base = (fn: string, a: Record<string, unknown>) => unknown;
interface MockHubLike { hub_id: string; slug: string | null; name: string; kind: string; members: { account_id: string; is_owner: boolean }[] }
interface MockStateLike { hubs: MockHubLike[]; reports: { join_code: string; reason: string }[]; discover_applied: string[] }

interface Commerce {
  customer: boolean;
  intents: { product: string; weeks: number | null; slug: string | null; at: string }[];
  reservations: { slug: string; expires_at: string }[];
  events: { id: number; type: string; outcome: string; reason: string | null; received_at: string }[];
  outbox: { id: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }[];
  reports: { report_id: string; status: string; blocked: boolean }[];
  decisions: Record<string, { status: string; note: string | null; decided_at: string }>;
}

let c: Commerce | null = null;
function load(): Commerce {
  if (c) return c;
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return (c = JSON.parse(raw) as Commerce);
  } catch { /* storage unavailable */ }
  return (c = { customer: false, intents: [], reservations: [], events: [], outbox: [], reports: [], decisions: {} });
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(c)); } catch { /* ignore */ }
}
const flag = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const ready = () => flag("lv.mock.billing") === "ready";
const admin = () => flag("lv.mock.admin") === "1";
const iso = (t: number) => new Date(t).toISOString();
const err = (code: string, message: string) => ({ ok: false, error: { code, message } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reservationOf(slug: string) {
  return load().reservations.find((r) => r.slug === slug);
}
function resState(expires: string) {
  const t = new Date(expires).getTime();
  return Date.now() < t ? "active" : Date.now() < t + 25 * DAY ? "grace" : "released";
}

/** lv_api functions. Returns undefined for anything that is not track B's (the base mock answers it). */
export function commerceMock(s: MockStateLike, fn: string, a: Record<string, unknown>, authed: boolean): unknown {
  if (a.__base) return undefined;
  const st = load();
  switch (fn) {
    case "lv_billing_config": {
      if (!authed) return err("lv_unauthenticated", "Sign in to continue");
      const on = ready();
      return { ok: true, provider_ready: on, checkout_available: on, products: Object.fromEntries(PRODUCTS.map((p) => [p, on])), portal_available: on && st.customer };
    }
    case "lv_hub_reservation_status": {
      const slug = String(a.p_slug ?? "").toLowerCase();
      const r = reservationOf(slug);
      if (!r) return undefined;
      const state = resState(r.expires_at);
      if (state === "released") return undefined;
      return { ok: true, slug, state, mine: authed, ...(authed ? { expires_at: r.expires_at, grace_ends_at: iso(new Date(r.expires_at).getTime() + 25 * DAY) } : {}) };
    }
    case "lv_invite_email_send": {
      if (!authed) return err("lv_unauthenticated", "Sign in to continue");
      if (!EMAIL.test(String(a.p_to ?? ""))) return err("lv_invalid_input", "That email address does not look right.");
      if (!String(a.p_code ?? "").trim()) return err("lv_invalid_code", "That invite code is not live for this Hub.");
      st.outbox.unshift({ id: `mail-${Date.now()}`, template: "hub_invite", status: "queued", attempts: 0, last_error: null, created_at: iso(Date.now()), sent_at: null });
      save();
      return { ok: true, queued: true, already_sent: false };
    }
  }
  if (!fn.startsWith("lv_admin_")) return undefined;
  if (!authed) return err("lv_unauthenticated", "Sign in to continue");
  if (!admin()) return err("lv_forbidden", "This needs a platform administrator.");

  const reports = s.reports.map((r, i) => {
    const id = `rep-${i + 1}`;
    const extra = st.reports.find((x) => x.report_id === id);
    return { report_id: id, status: extra?.status ?? "open", reason: r.reason, created_at: iso(Date.now() - i * 3_600_000),
      campaign_id: `cmp-reported-${i + 1}`, campaign_title: "Reported survey", join_code: r.join_code, blocked: extra?.blocked ?? false,
      hub_name: null, hub_slug: null, quick_survey: true, open_reports: 1 };
  });
  const apps = s.discover_applied.map((hubId) => {
    const h = s.hubs.find((x) => x.hub_id === hubId);
    const d = st.decisions[hubId];
    return { application_id: hubId, status: d?.status ?? "submitted", hub_id: hubId, hub_slug: h?.slug ?? "", hub_name: h?.name ?? "Hub",
      genuine_members_at_apply: 700, genuine_members_now: 700, family: "team", applied_at: iso(Date.now() - 2 * DAY),
      decided_at: d?.decided_at ?? null, note: d?.note ?? null };
  });
  const entries = Array.from({ length: 6 }, (_, i) => ({ entry_id: `wl-${i + 1}`, status: i < 4 ? "admitted" : "waitlisted", position: i < 4 ? i + 1 : i - 3,
    joined_at: iso(Date.now() - (10 - i) * DAY), has_contact_email: i % 2 === 0, intended_hub_name: i % 3 === 0 ? "Harbor Book Circle" : null }));

  switch (fn) {
    case "lv_admin_overview":
      return { ok: true, waitlist: { seats_total: 50, seats_taken: 4, admitted: 4, waitlisted: 2, with_contact: 3 },
        reports_open: reports.filter((r) => r.status === "open").length, campaigns_blocked: reports.filter((r) => r.blocked).length,
        discover_pending: apps.filter((x) => x.status === "submitted").length,
        billing: { provider_ready: ready(), events_7d: st.events.length, rejected_7d: st.events.filter((e) => e.outcome === "rejected").length },
        email: { queued: st.outbox.filter((m) => m.status === "queued").length, sent: st.outbox.filter((m) => m.status === "sent").length, failed: 0 } };
    case "lv_admin_waitlist":
      return { ok: true, total: entries.length, entries };
    case "lv_admin_waitlist_contact": {
      const e = entries.find((x) => x.entry_id === a.p_entry);
      if (!e) return err("lv_not_found", "No such waitlist entry.");
      return { ok: true, entry_id: e.entry_id, contact_email: e.has_contact_email ? `founder${e.position}@example.invalid` : null };
    }
    case "lv_admin_abuse_reports": {
      const want = String(a.p_status ?? "open");
      return { ok: true, reports: reports.filter((r) => want === "all" || r.status === want) };
    }
    case "lv_admin_report_dismiss": {
      const r = reports.find((x) => x.report_id === a.p_report && x.status === "open");
      if (!r) return err("lv_not_found", "No open report with that id.");
      st.reports = [...st.reports.filter((x) => x.report_id !== r.report_id), { report_id: r.report_id, status: "dismissed", blocked: r.blocked }];
      save();
      return { ok: true, status: "dismissed" };
    }
    case "lv_admin_campaign_block":
    case "lv_admin_campaign_unblock": {
      const r = reports.find((x) => x.campaign_id === a.p_campaign);
      if (!r) return err("lv_not_found", "No such Campaign.");
      const block = fn === "lv_admin_campaign_block";
      if (block && !String(a.p_reason ?? "").trim()) return err("lv_invalid_input", "A block needs a reason of up to 500 characters.");
      st.reports = [...st.reports.filter((x) => x.report_id !== r.report_id), { report_id: r.report_id, status: block ? "actioned" : r.status, blocked: block }];
      save();
      return { ok: true, blocked: block };
    }
    case "lv_admin_discover_list": {
      const want = String(a.p_status ?? "submitted");
      return { ok: true, applications: apps.filter((x) => want === "all" || x.status === want) };
    }
    case "lv_admin_discover_decide": {
      const app = apps.find((x) => x.application_id === a.p_application);
      if (!app) return err("lv_not_found", "No such application.");
      const status = a.p_approve ? "approved" : "rejected";
      st.decisions[app.application_id] = { status, note: (a.p_note as string | null) ?? null, decided_at: iso(Date.now()) };
      save();
      return { ok: true, status };
    }
    case "lv_admin_billing_events":
      return { ok: true, events: st.events };
    case "lv_admin_email_outbox": {
      const counts: Record<string, number> = {};
      const byTemplate: Record<string, number> = {};
      for (const m of st.outbox) { counts[m.status] = (counts[m.status] ?? 0) + 1; byTemplate[m.template] = (byTemplate[m.template] ?? 0) + 1; }
      return { ok: true, counts, by_template: byTemplate, recent: st.outbox.slice(0, 50) };
    }
    default:
      return err("lv_not_found", `Mock does not implement ${fn}`);
  }
}

/** The `checkout` Edge Function. `base` reaches the main mock (for reservation status and Hub ownership). */
export function commerceInvoke(fn: string, body: Record<string, unknown>, authed: boolean, base: Base): unknown {
  if (fn !== "checkout") return err("lv_not_found", `Mock does not implement ${fn}`);
  if (!authed) return err("lv_unauthenticated", "Sign in to continue.");
  if (!ready()) return err("lv_billing_unavailable", "Paid plans are not on sale yet. Nothing was charged.");
  const st = load();
  const back = typeof body.return_path === "string" && body.return_path.startsWith("/") && !body.return_path.startsWith("//") ? body.return_path : "/me";
  const withQ = (p: string, q: string) => p + (p.includes("?") ? "&" : "?") + q;

  if (body.action === "portal") {
    if (!st.customer) return err("lv_not_found", "There is no subscription to manage on this account.");
    return { ok: true, url: withQ(back, "portal=returned") };
  }
  if (body.action !== "checkout") return err("lv_invalid_input", "Unknown action.");
  const product = String(body.product ?? "");
  if (!(PRODUCTS as readonly string[]).includes(product)) return err("lv_invalid_input", "That product cannot be bought.");
  const weeks = typeof body.weeks === "number" ? body.weeks : null;
  if ((product === "campaign_starter" || product === "campaign_plus") && (weeks === null || weeks < 2 || weeks > 104)) return err("lv_invalid_input", "Choose at least 2 weeks.");
  let slug: string | null = null;
  if (product === "hub_reservation") {
    slug = String(body.slug ?? "").toLowerCase();
    if (slugProblem(slug)) return err("lv_invalid_input", "Hub names are 3 to 40 characters: lowercase letters, numbers and single hyphens.");
    const mine = reservationOf(slug);
    const status = (mine && resState(mine.expires_at) !== "released" ? { state: "active" } : base("lv_hub_reservation_status", { p_slug: slug, __base: true })) as { state?: string; ok?: boolean };
    if (!mine && status.state !== "available") return err("lv_conflict", "That Hub name is not available to reserve.");
    // Simulate the webhook: the reservation starts (or extends) for 12 months.
    const start = mine && resState(mine.expires_at) !== "released" ? new Date(mine.expires_at).getTime() : Date.now();
    st.reservations = [...st.reservations.filter((r) => r.slug !== slug), { slug, expires_at: iso(start + 365 * DAY) }];
    st.outbox.unshift({ id: `mail-${Date.now()}`, template: "reservation_confirmed", status: "queued", attempts: 0, last_error: null, created_at: iso(Date.now()), sent_at: null });
  }
  st.customer = true;
  st.intents.push({ product, weeks, slug, at: iso(Date.now()) });
  st.events.unshift({ id: st.events.length + 1, type: "checkout.session.completed", outcome: "applied", reason: null, received_at: iso(Date.now()) });
  save();
  return { ok: true, url: withQ(back, "checkout=success"), intent_id: `intent-${st.intents.length}` };
}
