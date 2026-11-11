// DEV-ONLY mock of the staff panel (000023): staff management, Hub and account suspension, the unified reports
// queue, lookup and the audit viewer. Imported only by mockTransport.ts, so it never reaches a production bundle.
// It mirrors the backend rules (guards, reveal-before-show, nothing deleted); the backend stays authoritative.
//
// Dev switch: localStorage["lv.mock.admin"] = "1" makes the mock account staff.
import { commerceMock } from "./mockCommerce";

const STORE = "lv.mock.staff";
const ME = "mock-account";
type Base = (fn: string, a: Record<string, unknown>) => unknown;
interface HubLike { hub_id: string; slug: string | null; name: string; kind: string; visibility: string; membership_mode: string; members: { account_id: string; display_name: string; is_owner: boolean; status: string }[] }
interface StateLike { billing_launched_at: string | null; hubs: HubLike[]; reports: { join_code: string; reason: string }[]; discover_applied: string[]; me: { display_name: string } }

// A synthetic directory of other accounts with verified emails (mock only).
const DIRECTORY = [
  { account_id: "acc-2", display_name: "Sam Okafor", email: "sam@example.invalid", created_at: "2026-10-01T10:00:00Z" },
  { account_id: "acc-3", display_name: "Priya Nair", email: "priya@example.invalid", created_at: "2026-10-03T10:00:00Z" },
  { account_id: "acc-founder-2", display_name: "Founder (second account)", email: "founder2@example.invalid", created_at: "2026-09-20T10:00:00Z" },
];

interface Staff {
  staff: { account_id: string; display_name: string; granted_at: string; granted_by_name: string | null }[];
  hubSusp: Record<string, { reason: string; suspended_at: string }>;
  accSusp: Record<string, { reason: string; suspended_at: string }>;
  reports: { type: "survey" | "comment" | "person" | "hub"; id: string; status: string; reasons: string[]; created_at: string; hub_slug: string; title: string; hidden?: boolean; blocked?: boolean;
    /** 000029: people and Hubs. `mine` marks reports sent by the mock account (the real backend keys on the reporter). */
    details?: string | null; staff_note?: string | null; target_name?: string; target_account_id?: string; mine?: boolean }[];
  audit: { id: number; occurred_at: string; actor_account_id: string; actor_name: string; action: string; target: string | null; hub_slug: string | null }[];
}

let st: Staff | null = null;
const now = () => new Date().toISOString();
function load(s: StateLike): Staff {
  if (st) return st;
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return (st = JSON.parse(raw) as Staff);
  } catch { /* storage unavailable */ }
  const hub = s.hubs.find((h) => h.kind === "community");
  st = {
    staff: [
      { account_id: "acc-founder-2", display_name: "Founder (second account)", granted_at: "2026-11-01T09:00:00Z", granted_by_name: null },
      { account_id: ME, display_name: s.me.display_name, granted_at: "2026-11-01T09:05:00Z", granted_by_name: "Founder (second account)" },
    ],
    hubSusp: {},
    accSusp: {},
    reports: hub ? [
      { type: "survey", id: "rep-s1", status: "open", reasons: ["Asks people for their passwords"], created_at: now(), hub_slug: hub.slug ?? "", title: "Spring route check-in" },
      { type: "comment", id: "cm-1", status: "open", reasons: ["Insults another member", "Abusive"], created_at: now(), hub_slug: hub.slug ?? "", title: "You all run like snails, idiots." },
    ] : [],
    audit: [{ id: 1, occurred_at: "2026-11-01T09:05:00Z", actor_account_id: "acc-founder-2", actor_name: "Founder (second account)", action: "staff.added", target: ME, hub_slug: null }],
  };
  return st;
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch { /* ignore */ } }
const admin = () => { try { return localStorage.getItem("lv.mock.admin") === "1"; } catch { return false; } };
const err = (code: string, message: string) => ({ ok: false, error: { code, message } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Dev switch: localStorage["lv.mock.stripe_prices"] = "missing" simulates unset Stripe prices (the backend reads lv.policy).
const flagGaps = (): string[] => { try { return localStorage.getItem("lv.mock.stripe_prices") === "missing" ? ["starter_hub", "team_hub", "hub_reservation", "campaign_starter", "campaign_plus"] : []; } catch { return []; } };

// Writes the backend refuses for a suspended Hub (lv.suspension_guard triggers).
const HUB_WRITES = new Set(["lv_campaign_create", "lv_invite_create", "lv_hub_update", "lv_role_create", "lv_news_save", "lv_hub_pages_update",
  "lv_community_update", "lv_shop_item_save", "lv_comment_add", "lv_discover_apply", "lv_hub_join"]);

export function staffMock(s: StateLike, fn: string, a: Record<string, unknown>, authed: boolean, base: Base): unknown {
  if (a.__base) return undefined;
  const d = load(s);
  const audit = (action: string, target: string | null, hub: string | null = null) => {
    d.audit.unshift({ id: (d.audit[0]?.id ?? 0) + 1, occurred_at: now(), actor_account_id: ME, actor_name: s.me.display_name, action, target, hub_slug: hub });
  };
  const hubById = (id: unknown) => s.hubs.find((h) => h.hub_id === id);

  // Staff flag in the context (the backend reads lv.is_platform_admin).
  if (fn === "lv_my_context") {
    const r = base(fn, a) as { ok: boolean };
    return r.ok ? { ...r, is_platform_admin: admin() } : r;
  }
  // Suspension effects on ordinary calls.
  if (fn === "lv_hub_get") {
    const r = base(fn, a) as { ok: boolean; hub?: { hub_id: string }; membership?: { is_owner?: boolean } | null };
    const sus = r.ok && r.hub ? d.hubSusp[r.hub.hub_id] : undefined;
    if (!sus || !r.hub) return r;
    return { ...r, hub: { ...r.hub, suspension: { suspended: true, suspended_at: sus.suspended_at, ...(r.membership?.is_owner || admin() ? { reason: sus.reason } : {}) } } };
  }
  if (HUB_WRITES.has(fn) && typeof a.p_hub === "string" && d.hubSusp[a.p_hub]) {
    return err("lv_suspended", "This Hub is suspended, so nothing new can be created or published in it.");
  }
  if (fn === "lv_admin_overview") {
    const r = commerceMock(s as never, fn, a, authed) as Record<string, unknown>;
    if (!r || (r as { ok?: boolean }).ok === false) return r;
    return { ...r, comment_reports_open: d.reports.filter((x) => x.type === "comment" && x.status === "open").length,
      reports_open: d.reports.filter((x) => x.type === "survey" && x.status === "open").length,
      hubs_suspended: Object.keys(d.hubSusp).length, accounts_suspended: Object.keys(d.accSusp).length, staff: d.staff.length };
  }
  const mine = ["lv_admin_staff_list", "lv_admin_staff_add", "lv_admin_staff_revoke", "lv_admin_hub_suspend", "lv_admin_hub_unsuspend",
    "lv_admin_account_suspend", "lv_admin_account_unsuspend", "lv_admin_reports", "lv_admin_comment_hide", "lv_admin_comment_reports_dismiss",
    "lv_admin_hub_search", "lv_admin_account_search", "lv_admin_account_email_reveal", "lv_admin_audit", "lv_admin_report_dismiss", "lv_admin_campaign_block",
    "lv_admin_user_report_decide", "lv_admin_billing_status", "lv_admin_billing_set"];

  // 000029: reporting a person or a Hub, and the reporter's own list. Any signed-in person; never staff-only.
  if (fn === "lv_report_hub" || fn === "lv_report_account" || fn === "lv_my_reports") {
    if (!authed) return err("lv_unauthenticated", "Sign in with KpnIdentity first.");
    if (fn === "lv_my_reports") {
      return { ok: true, reports: d.reports.filter((r) => r.mine && (r.type === "person" || r.type === "hub")).map((r) => ({
        report_id: r.id, kind: r.type, label: r.type === "person" ? r.target_name ?? "A person" : r.title, reason: r.reasons[0], status: r.status, created_at: r.created_at })) };
    }
    const REASONS = ["harassment", "hate", "threats", "sexual_content", "scam", "impersonation", "spam", "privacy", "other"];
    if (!REASONS.includes(String(a.p_reason))) return err("lv_invalid_input", "Choose a reason.");
    const details = String(a.p_details ?? "").trim() || null;
    if (fn === "lv_report_hub") {
      const h = s.hubs.find((x) => x.kind === "community" && x.slug === String(a.p_slug ?? "").trim().toLowerCase());
      if (!h) return err("lv_not_found", "No Hub lives at that address.");
      if (h.members.some((m) => m.account_id === ME && m.is_owner)) return err("lv_invalid_input", "You can't report your own Hub.");
      if (d.reports.some((r) => r.mine && r.type === "hub" && r.hub_slug === h.slug && r.status === "open")) return { ok: true, duplicate: true };
      const id = `rep-${d.reports.length + 1}-${Date.now()}`;
      d.reports.unshift({ type: "hub", id, status: "open", reasons: [String(a.p_reason)], created_at: now(), hub_slug: h.slug ?? "", title: h.name, details, mine: true });
      save();
      return { ok: true, report_id: id, duplicate: false };
    }
    const h = hubById(a.p_hub);
    if (!h || !h.members.some((m) => m.account_id === ME)) return err("lv_not_found", "No such person.");
    if ((a.p_membership == null) === (a.p_comment == null)) return err("lv_invalid_input", "Say who you are reporting.");
    const member = a.p_membership != null ? (h.members as { account_id: string; display_name: string; membership_id?: string }[]).find((m) => m.membership_id === a.p_membership) ?? h.members.find((m) => m.account_id !== ME) : undefined;
    const targetId = member?.account_id ?? "acc-3";
    if (targetId === ME) return err("lv_invalid_input", "You can't report yourself.");
    if (d.reports.some((r) => r.mine && r.type === "person" && r.target_account_id === targetId && r.status === "open")) return { ok: true, duplicate: true };
    const id = `rep-${d.reports.length + 1}-${Date.now()}`;
    d.reports.unshift({ type: "person", id, status: "open", reasons: [String(a.p_reason)], created_at: now(), hub_slug: h.slug ?? "", title: "", details, target_name: member?.display_name ?? "Comment author", target_account_id: targetId, mine: true });
    save();
    return { ok: true, report_id: id, duplicate: false };
  }
  if (!mine.includes(fn)) return undefined;
  if (!authed) return err("lv_unauthenticated", "Sign in to continue");
  if (!admin()) return err("lv_forbidden", "This needs a platform administrator.");

  const out = (() => {
    switch (fn) {
      case "lv_admin_staff_list":
        return { ok: true, staff: d.staff.map((x) => ({ ...x, is_me: x.account_id === ME })) };
      case "lv_admin_staff_add": {
        const email = String(a.p_email ?? "").trim().toLowerCase();
        if (!EMAIL.test(email)) return err("lv_invalid_input", "Enter the email address they sign in with.");
        const p = DIRECTORY.find((x) => x.email === email);
        if (!p) return err("lv_not_found", "No account has verified that email. They need to sign in to LunchVoice once first.");
        if (d.staff.some((x) => x.account_id === p.account_id)) return { ok: true, account_id: p.account_id, already_staff: true };
        d.staff.push({ account_id: p.account_id, display_name: p.display_name, granted_at: now(), granted_by_name: s.me.display_name });
        audit("staff.added", p.account_id);
        return { ok: true, account_id: p.account_id, already_staff: false, display_name: p.display_name };
      }
      case "lv_admin_staff_revoke": {
        if (a.p_account === ME) return err("lv_conflict", "You can't remove yourself. Ask another staff member.");
        if (!d.staff.some((x) => x.account_id === a.p_account)) return err("lv_not_found", "That account is not staff.");
        if (d.staff.length <= 1) return err("lv_conflict", "The last staff member can't be removed.");
        d.staff = d.staff.filter((x) => x.account_id !== a.p_account);
        audit("staff.revoked", String(a.p_account));
        return { ok: true };
      }
      case "lv_admin_hub_suspend":
      case "lv_admin_hub_unsuspend": {
        const h = hubById(a.p_hub);
        if (!h || h.kind !== "community") return err("lv_not_found", "No such Hub.");
        if (fn === "lv_admin_hub_suspend") {
          const reason = String(a.p_reason ?? "").trim();
          if (!reason || reason.length > 500) return err("lv_invalid_input", "A suspension needs a reason of up to 500 characters. The Owner sees it.");
          d.hubSusp[h.hub_id] = { reason, suspended_at: now() };
          audit("hub.suspended", h.hub_id, h.slug);
          return { ok: true, suspended: true };
        }
        if (!d.hubSusp[h.hub_id]) return err("lv_not_found", "That Hub is not suspended.");
        delete d.hubSusp[h.hub_id];
        audit("hub.unsuspended", h.hub_id, h.slug);
        return { ok: true, suspended: false };
      }
      case "lv_admin_account_suspend":
      case "lv_admin_account_unsuspend": {
        const id = String(a.p_account ?? "");
        if (!DIRECTORY.some((x) => x.account_id === id) && id !== ME) return err("lv_not_found", "No such account.");
        if (fn === "lv_admin_account_suspend") {
          if (id === ME) return err("lv_conflict", "You can't suspend yourself.");
          if (d.staff.some((x) => x.account_id === id)) return err("lv_conflict", "Remove them from staff before suspending the account.");
          const reason = String(a.p_reason ?? "").trim();
          if (!reason) return err("lv_invalid_input", "A suspension needs a reason of up to 500 characters. The person sees it.");
          d.accSusp[id] = { reason, suspended_at: now() };
          audit("account.suspended", id);
          return { ok: true, suspended: true };
        }
        if (!d.accSusp[id]) return err("lv_not_found", "That account is not suspended.");
        delete d.accSusp[id];
        audit("account.unsuspended", id);
        return { ok: true, suspended: false };
      }
      case "lv_admin_reports": {
        const status = String(a.p_status ?? "open"), type = String(a.p_type ?? "all");
        if (!["open", "actioned", "dismissed", "all"].includes(status) || !["survey", "comment", "person", "hub", "all"].includes(type)) return err("lv_invalid_input", "Unknown status or type.");
        const items = d.reports.filter((r) => (status === "all" || r.status === status) && (type === "all" || r.type === type)).map((r) => {
          const h = s.hubs.find((x) => x.slug === r.hub_slug);
          const common = { type: r.type, id: r.id, status: r.status, reasons: r.reasons, report_count: r.reasons.length, created_at: r.created_at,
            hub_id: h?.hub_id ?? null, hub_name: h?.name ?? null, hub_slug: r.hub_slug, quick_survey: false, hub_suspended: Boolean(h && d.hubSusp[h.hub_id]) };
          if (r.type === "person" || r.type === "hub") {
            return { ...common, details: r.details ?? null, staff_note: r.staff_note ?? null, target_account_id: r.target_account_id ?? null, target_name: r.target_name ?? null,
              target_suspended: r.target_account_id ? Boolean(d.accSusp[r.target_account_id]) : null,
              target_open_reports: r.target_account_id ? d.reports.filter((o) => o.type === "person" && o.target_account_id === r.target_account_id && o.status === "open").length : null };
          }
          return r.type === "survey"
            ? { ...common, campaign_id: "cmp-seed-1", campaign_title: r.title, join_code: "SEED01", blocked: Boolean(r.blocked) }
            : { ...common, comment_id: r.id, post_id: null, excerpt: r.title, hidden: Boolean(r.hidden), author_suspended: false, author_account_id: "acc-3" };
        });
        return { ok: true, items };
      }
      case "lv_admin_billing_status":
      case "lv_admin_billing_set": {
        const open = () => { try { return localStorage.getItem("lv.mock.billing") === "ready"; } catch { return false; } };
        const setOpen = (on: boolean) => { try { if (on) localStorage.setItem("lv.mock.billing", "ready"); else localStorage.removeItem("lv.mock.billing"); } catch { /* ignore */ } };
        const status = () => {
          const launch = s.billing_launched_at;
          return { open: open(), launch_at: launch, founding_ends_at: launch ? new Date(new Date(launch).getTime() + 30 * 86_400_000).toISOString() : null,
            launch_passed_billing_off: !open() && Boolean(launch) && new Date(launch!).getTime() <= Date.now() };
        };
        const extra = { price_gaps: flagGaps(), founding_hubs: 1, paying_hubs: 0, events_7d: 0, applied_7d: 0, rejected_7d: 0 };
        if (fn === "lv_admin_billing_status") return { ok: true, ...status(), ...extra };
        const action = String(a.p_action);
        if (!["schedule", "clear", "open", "pause"].includes(action)) return err("lv_invalid_input", "Choose schedule, clear, open or pause.");
        if (action === "schedule") {
          if (open()) return err("lv_conflict", "Billing is already on, so the launch date can't move.");
          const at = a.p_launch_at ? new Date(String(a.p_launch_at)).getTime() : NaN;
          if (!(at > Date.now())) return err("lv_invalid_input", "Pick a launch date in the future. To start billing now, use Open billing.");
          if (at > Date.now() + 400 * 86_400_000) return err("lv_invalid_input", "That date is more than a year away.");
          s.billing_launched_at = new Date(at).toISOString();
          audit("billing.scheduled", null);
        } else if (action === "clear") {
          if (open()) return err("lv_conflict", "Billing is on. Pause it first; the launch date stays once billing has started.");
          s.billing_launched_at = null;
          audit("billing.schedule_cleared", null);
        } else if (action === "open") {
          if (a.p_confirm !== "OPEN BILLING") return err("lv_invalid_input", "Type OPEN BILLING to confirm.");
          const gaps = flagGaps();
          if (gaps.length) return err("lv_not_available", `Stripe prices are not set for: ${gaps.join(", ")}. Billing can't open until every product has one.`);
          if (!open()) {
            setOpen(true);
            if (!s.billing_launched_at || new Date(s.billing_launched_at).getTime() > Date.now()) s.billing_launched_at = now();
            audit("billing.opened", null);
          }
        } else {
          if (a.p_confirm !== "PAUSE BILLING") return err("lv_invalid_input", "Type PAUSE BILLING to confirm.");
          if (open()) { setOpen(false); audit("billing.paused", null); }
        }
        return { ok: true, ...status() };
      }
      case "lv_admin_user_report_decide": {
        const r = d.reports.find((x) => x.id === a.p_report && (x.type === "person" || x.type === "hub"));
        if (!r) return err("lv_not_found", "No such report.");
        if (!["actioned", "dismissed"].includes(String(a.p_status))) return err("lv_invalid_input", "Choose actioned or dismissed.");
        const note = String(a.p_note ?? "").trim();
        if (note.length > 500) return err("lv_invalid_input", "Keep the note to 500 characters.");
        r.status = String(a.p_status);
        r.staff_note = note || null;
        audit(`report.${r.status}`, r.id, r.hub_slug);
        return { ok: true, status: r.status };
      }
      case "lv_admin_comment_hide": {
        const r = d.reports.find((x) => x.type === "comment" && x.id === a.p_comment);
        if (!r) return err("lv_not_found", "No such comment.");
        r.hidden = a.p_hidden !== false;
        if (r.hidden) r.status = "actioned";
        audit(r.hidden ? "comment.hidden_by_staff" : "comment.shown_by_staff", r.id, r.hub_slug);
        return { ok: true, hidden: r.hidden };
      }
      case "lv_admin_comment_reports_dismiss":
      case "lv_admin_report_dismiss": {
        const r = d.reports.find((x) => x.id === (a.p_comment ?? a.p_report) && x.status === "open");
        if (!r) return err("lv_not_found", "No open report for that item.");
        r.status = "dismissed";
        audit(r.type === "comment" ? "comment_report.dismissed" : "abuse.dismissed", r.id, r.hub_slug);
        return { ok: true, status: "dismissed" };
      }
      case "lv_admin_campaign_block": {
        const r = d.reports.find((x) => x.type === "survey" && x.status === "open");
        if (!String(a.p_reason ?? "").trim()) return err("lv_invalid_input", "A block needs a reason of up to 500 characters.");
        if (r) { r.blocked = true; r.status = "actioned"; }
        audit("campaign.blocked", String(a.p_campaign));
        return { ok: true, blocked: true };
      }
      case "lv_admin_hub_search": {
        const q = String(a.p_query ?? "").trim().toLowerCase();
        if (!q || q.length > 80) return err("lv_invalid_input", "Search with 1 to 80 characters of a slug or name.");
        const hubs = s.hubs.filter((h) => h.kind === "community" && ((h.slug ?? "").includes(q) || h.name.toLowerCase().includes(q))).map((h) => {
          const owner = h.members.find((m) => m.is_owner);
          return { hub_id: h.hub_id, slug: h.slug, name: h.name, created_at: "2026-11-01T09:00:00Z", visibility: h.visibility, membership_mode: h.membership_mode,
            plan: { family: "starter", product: "founding", state: "active" }, member_count: h.members.filter((m) => m.status === "accepted").length,
            owner_account_id: owner?.account_id ?? ME, owner_name: owner?.display_name ?? null,
            suspension: d.hubSusp[h.hub_id] ?? null, open_reports: d.reports.filter((r) => r.hub_slug === h.slug && r.status === "open").length };
        });
        return { ok: true, hubs };
      }
      case "lv_admin_account_search": {
        const email = String(a.p_email ?? "").trim().toLowerCase();
        if (!EMAIL.test(email)) return err("lv_invalid_input", "Search with a full email address.");
        return { ok: true, accounts: DIRECTORY.filter((x) => x.email === email).map((x) => ({ account_id: x.account_id, display_name: x.display_name,
          created_at: x.created_at, hubs_owned: 0, memberships: 1, is_staff: d.staff.some((y) => y.account_id === x.account_id), suspension: d.accSusp[x.account_id] ?? null,
          open_reports: d.reports.filter((r) => r.type === "person" && r.target_account_id === x.account_id && r.status === "open").length })) };
      }
      case "lv_admin_account_email_reveal": {
        const p = DIRECTORY.find((x) => x.account_id === a.p_account);
        if (!p) return err("lv_not_found", "No such account.");
        audit("admin.email_revealed", p.account_id);
        return { ok: true, account_id: p.account_id, emails: [p.email] };
      }
      case "lv_admin_audit": {
        const scope = String(a.p_scope ?? "staff"), action = a.p_action ? String(a.p_action) : null;
        if (!["staff", "all"].includes(scope)) return err("lv_invalid_input", "Unknown scope or filter.");
        return { ok: true, events: d.audit.filter((e) => (!action || e.action.startsWith(action)) && (!a.p_actor || e.actor_account_id === a.p_actor)) };
      }
    }
    return undefined;
  })();
  save();
  return out;
}
