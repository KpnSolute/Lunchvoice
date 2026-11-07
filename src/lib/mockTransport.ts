import type { LvTransport } from "./lvApi";
import { slugProblem } from "./reservedSlugs";

// DEV-ONLY stand-in for lv_api (excluded from production bundles; see transport.ts and scripts/check-bundle.mjs).
// It mirrors the documented shapes and the launch rules in docs/v2/LAUNCH_PLAN.md closely enough to click through
// the founder's journey, but it is not a policy engine: the backend is authoritative for every rule.
// Real replacement: every case below is an lv_api function in docs/backend/API_CONTRACT.md / LAUNCH_PLAN.md.
//
// State lives in localStorage ("lv.mock.state") so reloads keep it. Dev helpers:
//   localStorage["lv.mock.seed"] = "demo"     seed an admitted founder with a Hub, Campaigns and Quick Surveys
//   localStorage["lv.mock.seed"] = "expired"  the same, with billing launched 40 days ago (Founding expired)
//   localStorage.removeItem("lv.mock.state")  start over

const MIN_COHORT = 5; // L-04
const SEATS_TOTAL = 50; // L-02
const OTHERS_ON_LIST = 37; // synthetic people who joined before you (mock only)
const DAY = 86_400_000;
const STORE = "lv.mock.state";
const SEED = "lv.mock.seed";

const LIMITS = {
  free: { quick_surveys_active: 5, quick_survey_questions: 10, custom_roles: 0, custom_pages: 0, active_campaigns: 0, active_surveys: 0 },
  starter: { custom_roles: 3, custom_pages: 3, active_campaigns: 15, active_surveys: 2, survey_threshold_pct: 50, quick_surveys_active: 5, quick_survey_questions: 10 },
  team: { custom_roles: 6, custom_pages: 10, active_campaigns: 15, active_surveys: 5, survey_threshold_pct: 20, discover_min_members: 700, quick_surveys_active: 5, quick_survey_questions: 10 },
} as const;
const PALETTE = ["#FF9A18", "#14110F", "#2E6B4F", "#2F5D8C", "#8A2E5C", "#6B4FA0"];
const CORE_KINDS = ["rating", "single_choice", "multi_choice", "yes_no", "text"];

type Q = { question_id: string; position: number; kind: string; prompt: string; config: object };
type Resp = { receipt: string; answers: { question_id: string; value: unknown }[]; at: string; guest: boolean };
type C = {
  campaign_id: string; hub_id: string; title: string; mode: string; anonymity: string; status: string; created_at: string;
  join_code: string; questions: Q[]; responses: Resp[]; opens_at: string | null; closes_at: string | null;
  audience: string; access?: string; mine_answered?: boolean;
};
type Ent = { id: string; product: string; family: string; scope: string; hub_id?: string; starts_at: string; ends_at: string | null; source: string };
type Page = { key: string; kind: string; title: string; body?: string | null; position: number; enabled: boolean };
type H = {
  hub_id: string; slug: string | null; name: string; kind: "community" | "personal"; about: string; accent: string | null;
  visibility: string; membership_mode: string; members: { membership_id: string; account_id: string; display_name: string; is_owner: boolean; status: string; roles: string[] }[];
  pages: Page[]; reservation?: { expires_at: string } | null;
};
type State = {
  n: number;
  me: { display_name: string; deleted?: boolean };
  waitlist: { status: "none" | "admitted" | "waitlisted"; position?: number; joined_at?: string; contact_email?: string | null };
  ents: Ent[];
  credits: { family: string; used: boolean; id: string }[];
  hubs: H[];
  campaigns: C[];
  roles: { hub: string; role_id: string; key: string; name: string; icon: string; capabilities: string[] }[];
  invites: { code: string; hub: string; invite_id: string; uses: number; max_uses: number | null; revoked: boolean; created_at: string }[];
  cinvites: { token: string; campaign: string; uses: number; max_uses: number | null; expires_at: string | null; revoked: boolean }[];
  eligible: string[]; // campaign ids this account may answer through a redeemed invite
  billing_launched_at: string | null;
  discover_applied: string[];
  /** Deleted Hubs keep their address for 30 days before anyone can claim it. */
  gone: { slug: string; until: string }[];
  reports: { join_code: string; reason: string }[];
};

const fresh = (name: string): State => ({
  n: 0, me: { display_name: name }, waitlist: { status: "none" }, ents: [], credits: [], hubs: [], campaigns: [], roles: [],
  invites: [], cinvites: [], eligible: [], billing_launched_at: null, discover_applied: [], gone: [], reports: [],
});

let state: State | null = null;

function load(name: string): State {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const saved = JSON.parse(raw) as Partial<State>; return (state = { ...fresh(name), ...saved } as State); }
  } catch { /* storage unavailable */ }
  state = fresh(name);
  try {
    const seed = localStorage.getItem(SEED);
    if (seed === "demo" || seed === "expired") seedDemo(state, seed === "expired");
  } catch { /* ignore */ }
  return state;
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* ignore */ }
}

const iso = (t: number) => new Date(t).toISOString();
const code6 = () => Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

/* ------------------------------------------------------------------ derived */

function foundingEnds(s: State): string | null {
  return s.billing_launched_at ? iso(new Date(s.billing_launched_at).getTime() + 30 * DAY) : null;
}
function entState(e: Ent): "active" | "expired" | "scheduled" {
  const now = Date.now();
  if (new Date(e.starts_at).getTime() > now) return "scheduled";
  if (e.ends_at && new Date(e.ends_at).getTime() <= now) return "expired";
  return "active";
}
function entOut(s: State, e: Ent) {
  const ends = e.source === "waitlist" ? foundingEnds(s) : e.ends_at;
  const withEnds = { ...e, ends_at: ends };
  return { ...withEnds, state: entState(withEnds) };
}
function hubPlan(s: State, hubId: string) {
  const e = s.ents.find((x) => x.hub_id === hubId);
  if (!e) return { family: "free", product: null, ends_at: null, state: "none" };
  const o = entOut(s, e);
  return { family: o.family, product: o.product, ends_at: o.ends_at, state: o.state };
}
function activeFamily(s: State, hubId: string): "free" | "starter" | "team" {
  const p = hubPlan(s, hubId);
  return p.state === "active" ? (p.family as "starter" | "team") : "free";
}
const isGone = (s: State, slug: string) => s.gone.some((g) => g.slug === slug.toLowerCase() && new Date(g.until).getTime() > Date.now());
const isActive = (c: C) => c.status === "active" && (!c.closes_at || new Date(c.closes_at).getTime() > Date.now());
const personal = (s: State) => s.hubs.find((h) => h.kind === "personal");
const isPersonal = (s: State, c: C) => s.hubs.find((h) => h.hub_id === c.hub_id)?.kind === "personal";

function defaultPages(): Page[] {
  return [
    { key: "home", kind: "home", title: "Home", position: 0, enabled: true },
    { key: "campaigns", kind: "campaigns", title: "Campaigns", position: 1, enabled: true },
    { key: "news", kind: "news", title: "Newsroom", position: 2, enabled: false },
    { key: "leaderboard", kind: "leaderboard", title: "Leaderboard", position: 3, enabled: false },
    { key: "shop", kind: "shop", title: "Shop", position: 4, enabled: false },
    { key: "comments", kind: "comments", title: "Comments", position: 5, enabled: false },
  ];
}

/* ------------------------------------------------------------------ seed (dev helper) */

function seedDemo(s: State, expired: boolean) {
  s.waitlist = { status: "admitted", position: OTHERS_ON_LIST + 1, joined_at: iso(Date.now() - 6 * DAY), contact_email: null };
  if (expired) s.billing_launched_at = iso(Date.now() - 40 * DAY);
  const hub: H = {
    hub_id: "hub-seed-1", slug: "northside-running", name: "Northside Running Club", kind: "community",
    about: "Weekly long runs, a monthly social, and a say in the route.", accent: "#2E6B4F", visibility: "public", membership_mode: "approval",
    members: [
      { membership_id: "m-own", account_id: "mock-account", display_name: s.me.display_name, is_owner: true, status: "accepted", roles: [] },
      { membership_id: "m-2", account_id: "acc-2", display_name: "Sam Okafor", is_owner: false, status: "accepted", roles: ["role-seed-1"] },
      { membership_id: "m-3", account_id: "acc-3", display_name: "Priya Nair", is_owner: false, status: "accepted", roles: [] },
      { membership_id: "m-4", account_id: "acc-4", display_name: "Leo Brandt", is_owner: false, status: "pending", roles: [] },
    ],
    pages: defaultPages(),
  };
  s.hubs.push(hub);
  s.ents.push({ id: "ent-seed-1", product: "founding", family: "starter", scope: "hub", hub_id: hub.hub_id, starts_at: s.waitlist.joined_at!, ends_at: null, source: "waitlist" });
  s.credits.push({ id: "cr-seed-1", family: "starter", used: true });
  s.roles.push({ hub: hub.hub_id, role_id: "role-seed-1", key: "coach", name: "coach", icon: "flame", capabilities: ["campaign.manage", "analytics.read"] });
  const answers = (qs: Q[], i: number) => qs.map((q) => ({
    question_id: q.question_id,
    value: q.kind === "rating" ? [5, 4, 5, 3, 4, 5, 4, 2, 5][i % 9] : q.kind === "single_choice" ? ["Tuesday", "Thursday", "Saturday"][i % 3 === 2 && i > 6 ? 2 : i % 2] : q.kind === "yes_no" ? i % 4 !== 0 : "ok",
  }));
  const mk = (id: string, hubId: string, title: string, status: string, n: number, anonymity = "identified", extra: Partial<C> = {}): C => {
    const questions: Q[] = [
      { question_id: `${id}-q1`, position: 0, kind: "rating", prompt: "How was the long run this week?", config: {} },
      { question_id: `${id}-q2`, position: 1, kind: "single_choice", prompt: "Which night works for the social?", config: { options: ["Tuesday", "Thursday", "Saturday"] } },
      { question_id: `${id}-q3`, position: 2, kind: "yes_no", prompt: "Would you bring a friend?", config: {} },
    ];
    return {
      campaign_id: id, hub_id: hubId, title, mode: "survey", anonymity, status, created_at: iso(Date.now() - 4 * DAY), join_code: code6(),
      questions, responses: Array.from({ length: n }, (_, i) => ({ receipt: `r-${id}-${i}`, answers: answers(questions, i), at: iso(Date.now() - (i % 6) * DAY - i * 3_600_000), guest: i % 3 === 0 })),
      opens_at: null, closes_at: status === "active" ? iso(Date.now() + 9 * DAY) : null, audience: "members_and_guests", ...extra,
    };
  };
  s.campaigns.push(mk("cmp-seed-1", hub.hub_id, "Spring route check-in", "active", 14));
  s.campaigns.push(mk("cmp-seed-2", hub.hub_id, "Winter social night", "closed", 22, "anonymous"));
  s.campaigns.push({ ...mk("cmp-seed-3", hub.hub_id, "Kit order sizes", "draft", 0), questions: [] });
  const ps: H = { hub_id: "space-seed", slug: null, name: "Personal space", kind: "personal", about: "", accent: null, visibility: "private", membership_mode: "invite_only", members: [], pages: [] };
  s.hubs.push(ps);
  s.campaigns.push(mk("qs-seed-1", ps.hub_id, "Book club: next month's pick", "active", 8, "anonymous", { access: "link" }));
  s.campaigns.push(mk("qs-seed-2", ps.hub_id, "Team lunch Friday?", "closed", 6, "identified", { access: "invite" }));
  s.campaigns.push({ ...mk("qs-seed-3", ps.hub_id, "Neighbourhood clean-up date", "draft", 0, "anonymous", { access: "link" }) });
  s.n = 100;
}

/* ------------------------------------------------------------------ transport */

export function createMockTransport(displayName = "Dana", signedIn: () => boolean = () => true): LvTransport {
  return {
    async rpc(fn, a = {}) {
      const s = load(displayName);
      const r = handle(s, fn, a, signedIn());
      save();
      // a short delay so loading states are visible in development
      await new Promise((res) => setTimeout(res, 60));
      return r;
    },
  };
}

const err = (code: string, message: string, extra: object = {}) => ({ ok: false, error: { code, message, ...extra } });

const PUBLIC = new Set(["lv_plan_limits", "lv_waitlist_status", "lv_hub_get", "lv_invite_preview", "lv_guest_campaign_get", "lv_guest_submit", "lv_hub_reservation_status", "lv_capability_catalog", "lv_hub_pages_get", "lv_report_abuse"]);

function handle(s: State, fn: string, a: Record<string, unknown>, authed: boolean): unknown {
  const id = (p: string) => `${p}-${++s.n}`;
  if (!authed && !PUBLIC.has(fn)) return err("lv_unauthenticated", "Sign in to continue");
  const hubById = (h: unknown) => s.hubs.find((x) => x.hub_id === h);
  const hubBySlug = (slug: unknown) => s.hubs.find((x) => x.kind === "community" && x.slug === String(slug).toLowerCase());
  const camp = (c: unknown) => s.campaigns.find((x) => x.campaign_id === c);
  const owns = (h: H | undefined) => Boolean(authed && h?.members.some((m) => m.account_id === "mock-account" && m.is_owner));
  const caps = ["hub.settings.manage", "admin.members.admit", "admin.members.remove", "admin.roles.manage", "campaign.manage", "analytics.read", "analytics.export", "billing.view"];
  const row = (c: C) => ({
    campaign_id: c.campaign_id, title: c.title, mode: c.mode, anonymity: c.anonymity, status: c.status, opens_at: c.opens_at, closes_at: c.closes_at,
    created_at: c.created_at, question_count: c.questions.length, has_responded: Boolean(c.mine_answered), join_code: c.status === "draft" ? undefined : c.join_code,
    access: c.access, response_count: c.responses.length >= MIN_COHORT ? c.responses.length : null,
  });
  const qsActive = () => s.campaigns.filter((c) => isPersonal(s, c) && isActive(c)).length;

  switch (fn) {
    /* ---------------- context and entitlements ---------------- */
    case "lv_my_context": {
      const answered = s.campaigns.filter((c) => c.mine_answered);
      return {
        ok: true, account_id: "mock-account", display_name: s.me.display_name, email_verified: true, is_platform_admin: false,
        hubs: s.hubs.filter((h) => h.kind === "community" && h.members.some((m) => m.account_id === "mock-account" && m.status === "accepted")).map((h) => {
          const me = h.members.find((m) => m.account_id === "mock-account")!;
          return { hub_id: h.hub_id, slug: h.slug, name: h.name, kind: "community", is_owner: me.is_owner, roles: [], capabilities: me.is_owner ? caps : [], plan: hubPlan(s, h.hub_id) };
        }),
        entitlements: s.ents.map((e) => entOut(s, e)),
        hub_credits: s.credits.filter((c) => !c.used).length,
        quick_surveys: { active: qsActive(), limit: LIMITS.free.quick_surveys_active, question_limit: LIMITS.free.quick_survey_questions },
        waitlist: { status: s.waitlist.status, position: s.waitlist.position },
        recent_participation: answered.map((c) => ({ campaign_id: c.campaign_id, title: c.title, hub_name: hubById(c.hub_id)?.kind === "community" ? hubById(c.hub_id)!.name : null, answered_at: c.created_at })),
      };
    }
    case "lv_plan_limits":
      return {
        ok: true,
        families: LIMITS,
        products: [
          { product: "starter_hub", family: "starter", price_cents: 1300, interval: "month", purchasable: false },
          { product: "team_hub", family: "team", price_cents: 2900, interval: "month", purchasable: false },
          { product: "campaign_starter", family: "starter", price_cents: 1900, interval: "first 2 weeks, then 1300 per week", purchasable: false },
          { product: "campaign_plus", family: "team", price_cents: 3900, interval: "first 2 weeks, then 1900 per week", purchasable: false },
          { product: "hub_reservation", family: "free", price_cents: 2500, interval: "12 months", purchasable: false },
        ],
      };

    /* ---------------- waitlist ---------------- */
    case "lv_waitlist_status": {
      const taken = Math.min(SEATS_TOTAL, OTHERS_ON_LIST + (s.waitlist.status === "admitted" ? 1 : 0));
      return {
        ok: true, seats_total: SEATS_TOTAL, seats_taken: taken, open: taken < SEATS_TOTAL,
        ...(authed ? { me: { status: s.waitlist.status, position: s.waitlist.position, joined_at: s.waitlist.joined_at } } : {}),
      };
    }
    case "lv_waitlist_join": {
      if (s.waitlist.status !== "none") return { ok: true, status: s.waitlist.status, position: s.waitlist.position };
      const email = a.p_contact_email ? String(a.p_contact_email) : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("lv_invalid_input", "That email doesn't look right", { missing: ["p_contact_email"] });
      const position = OTHERS_ON_LIST + 1;
      const admitted = position <= SEATS_TOTAL;
      s.waitlist = { status: admitted ? "admitted" : "waitlisted", position, joined_at: iso(Date.now()), contact_email: email };
      if (!admitted) return { ok: true, status: "waitlisted", position };
      const ent: Ent = { id: id("ent"), product: "founding", family: "starter", scope: "account", starts_at: iso(Date.now()), ends_at: null, source: "waitlist" };
      s.ents.push(ent);
      s.credits.push({ id: id("cr"), family: "starter", used: false });
      return { ok: true, status: "admitted", position, granted: entOut(s, ent) };
    }

    /* ---------------- account ---------------- */
    case "lv_profile_update": {
      const name = String(a.p_display_name ?? "").trim();
      if (name.length < 1 || name.length > 60) return err("lv_invalid_input", "Display name must be 1 to 60 characters");
      s.me.display_name = name;
      for (const h of s.hubs) for (const m of h.members) if (m.account_id === "mock-account") m.display_name = name;
      return { ok: true, account: { account_id: "mock-account", display_name: name } };
    }
    case "lv_account_delete": {
      if (a.p_confirm !== "DELETE") return err("lv_confirmation_mismatch", "Type DELETE to confirm");
      if (s.hubs.some((h) => h.kind === "community" && owns(h))) return err("lv_owner_protected", "Transfer or delete the Hubs you own first");
      state = fresh(s.me.display_name);
      return { ok: true };
    }

    /* ---------------- hubs ---------------- */
    case "lv_hub_create": {
      const slug = String(a.p_slug).toLowerCase();
      const name = String(a.p_name ?? "").trim();
      if (!name) return err("lv_invalid_input", "A Hub needs a name");
      if (slugProblem(slug)) return err("lv_invalid_input", "That Hub address is not allowed");
      if (hubBySlug(slug) || isGone(s, slug)) return err("lv_conflict", "That Hub address is taken");
      const credit = s.credits.find((c) => !c.used);
      if (!credit) return err("lv_entitlement_required", "Creating a Hub needs a Hub credit", { product: "starter_hub" });
      credit.used = true;
      const hub: H = {
        hub_id: id("hub"), slug, name, kind: "community", about: "", accent: null, visibility: "public", membership_mode: "invite_only",
        members: [{ membership_id: id("mem"), account_id: "mock-account", display_name: s.me.display_name, is_owner: true, status: "accepted", roles: [] }],
        pages: defaultPages(),
      };
      s.hubs.push(hub);
      const founding = s.ents.find((e) => e.source === "waitlist");
      s.ents.push({ id: id("ent"), product: founding ? "founding" : "starter_hub", family: credit.family, scope: "hub", hub_id: hub.hub_id, starts_at: iso(Date.now()), ends_at: null, source: founding ? "waitlist" : "grant" });
      return { ok: true, hub_id: hub.hub_id, slug };
    }
    case "lv_hub_get": {
      const h = hubBySlug(a.p_slug);
      if (!h && isGone(s, String(a.p_slug))) return err("lv_hub_gone", "This Hub is no longer available");
      if (!h) return err("lv_not_found", "Hub not found");
      const me = authed ? h.members.find((m) => m.account_id === "mock-account" && m.status === "accepted") : undefined;
      if (h.visibility === "private" && !me) return err("lv_not_found", "Hub not found");
      return {
        ok: true,
        hub: {
          hub_id: h.hub_id, slug: h.slug, name: h.name, visibility: h.visibility, membership_mode: h.membership_mode,
          member_count: h.members.filter((m) => m.status === "accepted").length, about: h.about, accent: h.accent, accent_palette: PALETTE,
          ...(me ? { plan: hubPlan(s, h.hub_id) } : {}),
        },
        membership: me
          ? { is_owner: me.is_owner, roles: s.roles.filter((r) => me.roles.includes(r.role_id)).map((r) => ({ key: r.key, name: r.name })), capabilities: me.is_owner ? caps : [], active_campaigns: s.campaigns.filter((c) => c.hub_id === h.hub_id && isActive(c)).length }
          : null,
      };
    }
    case "lv_hub_update": {
      const h = hubById(a.p_hub);
      if (!h) return err("lv_not_found", "Hub not found");
      if (!owns(h)) return err("lv_forbidden", "Only managers can change settings");
      if (a.p_display_name != null) {
        const n = String(a.p_display_name).trim();
        if (!n || n.length > 60) return err("lv_invalid_input", "Name must be 1 to 60 characters");
        h.name = n;
      }
      if (a.p_visibility != null) h.visibility = String(a.p_visibility);
      if (a.p_membership_mode != null) h.membership_mode = String(a.p_membership_mode);
      if (a.p_about != null) h.about = String(a.p_about).slice(0, 500);
      if (a.p_accent != null) {
        if (!PALETTE.includes(String(a.p_accent))) return err("lv_invalid_input", "Pick a color from the palette");
        h.accent = String(a.p_accent);
      }
      return { ok: true, hub: { hub_id: h.hub_id, slug: h.slug, name: h.name, visibility: h.visibility, membership_mode: h.membership_mode, about: h.about, accent: h.accent } };
    }
    case "lv_owner_transfer": {
      const h = hubById(a.p_hub);
      if (!h) return err("lv_not_found", "Hub not found");
      if (!owns(h)) return err("lv_forbidden", "Only the Owner can transfer ownership");
      if (a.p_confirm !== h.slug) return err("lv_confirmation_mismatch", "Type the Hub address to confirm");
      const target = h.members.find((m) => m.membership_id === a.p_membership && m.status === "accepted" && !m.is_owner);
      if (!target) return err("lv_not_accepted", "Pick an accepted member");
      for (const m of h.members) m.is_owner = m === target;
      return { ok: true };
    }
    case "lv_hub_delete": {
      const h = hubById(a.p_hub);
      if (!h) return err("lv_not_found", "Hub not found");
      if (!owns(h)) return err("lv_forbidden", "Only the Owner can delete a Hub");
      if (a.p_confirm !== h.slug) return err("lv_confirmation_mismatch", "Type the Hub address to confirm");
      s.hubs = s.hubs.filter((x) => x !== h);
      if (h.slug) s.gone.push({ slug: h.slug, until: iso(Date.now() + 30 * DAY) });
      s.campaigns = s.campaigns.filter((c) => c.hub_id !== h.hub_id);
      s.ents = s.ents.filter((e) => e.hub_id !== h.hub_id);
      return { ok: true };
    }
    case "lv_hub_pages_get": {
      const h = hubById(a.p_hub);
      if (!h) return err("lv_not_found", "Hub not found");
      const manager = owns(h);
      return { ok: true, pages: manager ? h.pages : h.pages.filter((p) => p.enabled), custom_slots: { used: h.pages.filter((p) => p.kind === "custom").length, limit: LIMITS[activeFamily(s, h.hub_id)].custom_pages } };
    }
    case "lv_hub_pages_update": {
      const h = hubById(a.p_hub);
      if (!h) return err("lv_not_found", "Hub not found");
      if (!owns(h)) return err("lv_forbidden", "Only the Owner can change pages");
      const pages = (a.p_pages as Page[]) ?? [];
      const custom = pages.filter((p) => p.kind === "custom").length;
      const fam = activeFamily(s, h.hub_id);
      if (custom > 0 && fam === "free") return err("lv_entitlement_required", "Custom pages need an active plan", { product: "starter_hub" });
      if (custom > LIMITS[fam].custom_pages) return err("lv_limit_reached", "Custom page limit reached", { limit: LIMITS[fam].custom_pages, used: custom });
      if (!pages.some((p) => p.kind === "home" && p.enabled)) return err("lv_invalid_input", "Home is always on");
      h.pages = pages.map((p, i) => ({ ...p, position: i }));
      return { ok: true, pages: h.pages };
    }
    case "lv_member_list": {
      const h = hubById(a.p_hub);
      if (!h || !owns(h)) return err("lv_forbidden", "Not allowed");
      return {
        ok: true,
        members: h.members.map((m) => ({ ...m, accepted_at: m.status === "accepted" ? iso(Date.now() - 3 * DAY) : null, roles: s.roles.filter((r) => m.roles.includes(r.role_id)).map((r) => ({ key: r.key, name: r.name })) })),
      };
    }

    /* ---------------- Hub invitations ---------------- */
    case "lv_invite_create": {
      const code = `${code6().slice(0, 4)}-${code6().slice(0, 4)}`;
      const inv = { code, hub: String(a.p_hub), invite_id: id("inv"), uses: 0, max_uses: (a.p_max_uses as number) ?? null, revoked: false, created_at: iso(Date.now()) };
      s.invites.push(inv);
      return { ok: true, invite_id: inv.invite_id, code, shown_once: true };
    }
    case "lv_invite_list":
      return {
        ok: true,
        invites: s.invites.filter((i) => i.hub === a.p_hub).map((i) => ({
          invite_id: i.invite_id, max_uses: i.max_uses, uses: i.uses, expires_at: null, revoked_at: i.revoked ? i.created_at : null, created_at: i.created_at,
          state: i.revoked ? "revoked" : i.max_uses !== null && i.uses >= i.max_uses ? "exhausted" : "active",
        })),
      };
    case "lv_invite_preview": {
      const i = s.invites.find((x) => x.code === String(a.p_code).toUpperCase() && !x.revoked);
      const h = i && hubById(i.hub);
      if (!h) return err("lv_invalid_code", "That invitation is not valid");
      return { ok: true, hub: { hub_id: h.hub_id, slug: h.slug, name: h.name }, already_member: authed && h.members.some((m) => m.account_id === "mock-account") };
    }
    case "lv_invite_redeem": {
      const i = s.invites.find((x) => x.code === String(a.p_code).toUpperCase() && !x.revoked);
      const h = i && hubById(i.hub);
      if (!i || !h) return err("lv_invalid_code", "That invitation is not valid");
      i.uses++;
      return { ok: true, hub_id: h.hub_id, already_member: true };
    }
    case "lv_invite_revoke": {
      const i = s.invites.find((x) => x.invite_id === a.p_invite);
      if (i) i.revoked = true;
      return { ok: true };
    }

    /* ---------------- Quick Surveys ---------------- */
    case "lv_quick_survey_create": {
      const title = String(a.p_title ?? "").trim();
      if (!title) return err("lv_invalid_input", "A survey needs a title");
      const access = String(a.p_access);
      if (access !== "link" && access !== "invite") return err("lv_invalid_input", "Access must be link or invite");
      let space = personal(s);
      if (!space) {
        space = { hub_id: id("space"), slug: null, name: "Personal space", kind: "personal", about: "", accent: null, visibility: "private", membership_mode: "invite_only", members: [], pages: [] };
        s.hubs.push(space);
      }
      const c: C = {
        campaign_id: id("qs"), hub_id: space.hub_id, title, mode: "survey", anonymity: String(a.p_anonymity ?? "anonymous"), status: "draft",
        created_at: iso(Date.now()), join_code: code6(), questions: [], responses: [], opens_at: null, closes_at: null,
        audience: access === "link" && a.p_guests !== false ? "members_and_guests" : "members", access,
      };
      s.campaigns.push(c);
      return { ok: true, campaign: row(c) };
    }
    case "lv_quick_survey_list": {
      const space = personal(s);
      const surveys = space ? s.campaigns.filter((c) => c.hub_id === space.hub_id && c.status !== "archived").map(row) : [];
      return { ok: true, surveys, active: qsActive(), limit: LIMITS.free.quick_surveys_active };
    }
    case "lv_campaign_invite_create": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Survey not found");
      if (c.access !== "invite") return err("lv_invalid_input", "Invites are for invite-only surveys");
      const inv = { token: Array.from({ length: 22 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join(""), campaign: c.campaign_id, uses: 0, max_uses: (a.p_max_uses as number) ?? null, expires_at: (a.p_expires_at as string) ?? null, revoked: false };
      s.cinvites.push(inv);
      return { ok: true, invite: { token: inv.token, max_uses: inv.max_uses, uses: 0, expires_at: inv.expires_at } };
    }
    case "lv_campaign_invite_list":
      return { ok: true, invites: s.cinvites.filter((i) => i.campaign === a.p_campaign && !i.revoked).map(({ campaign, ...i }) => i) };
    case "lv_campaign_invite_revoke": {
      const i = s.cinvites.find((x) => x.token === a.p_token);
      if (i) i.revoked = true;
      return { ok: true };
    }
    case "lv_campaign_invite_redeem": {
      const i = s.cinvites.find((x) => x.token === a.p_token && !x.revoked);
      if (!i) return err("lv_invalid_code", "That invitation is not valid");
      if (i.max_uses !== null && i.uses >= i.max_uses) return err("lv_invalid_code", "That invitation is used up");
      if (i.expires_at && new Date(i.expires_at).getTime() < Date.now()) return err("lv_invalid_code", "That invitation has expired");
      i.uses++;
      if (!s.eligible.includes(i.campaign)) s.eligible.push(i.campaign);
      const c = camp(i.campaign)!;
      return { ok: true, campaign_id: c.campaign_id, join_code: null };
    }

    /* ---------------- campaigns ---------------- */
    case "lv_campaign_list":
      return { ok: true, campaigns: s.campaigns.filter((c) => c.hub_id === a.p_hub && c.status !== "archived").map(row) };
    case "lv_campaign_get": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      const h = hubById(c.hub_id)!;
      const manage = h.kind === "personal" || owns(h);
      if (!manage && c.access === "invite" && !s.eligible.includes(c.campaign_id)) return err("lv_not_found", "Campaign not found");
      const limit = h.kind === "personal" ? LIMITS.free.quick_survey_questions : null;
      const reasons = [c.questions.length ? "" : "no_questions", c.status === "draft" ? "" : "not_draft"].filter(Boolean);
      return {
        ok: true,
        campaign: {
          campaign_id: c.campaign_id, hub_id: c.hub_id, title: c.title, mode: c.mode, anonymity: c.anonymity, status: c.status, revision: 1,
          opens_at: c.opens_at, closes_at: c.closes_at, audience: c.audience, space: h.kind, access: c.access, question_limit: limit,
        },
        questions: c.questions, has_responded: Boolean(c.mine_answered), receipt_id: c.mine_answered ? `r-${c.campaign_id}-me` : null,
        can_respond: isActive(c) && !c.mine_answered, can_manage: manage, join_code: c.status === "draft" ? undefined : c.join_code,
        gate: { ok: reasons.length === 0, reasons },
      };
    }
    case "lv_campaign_create": {
      const h = hubById(a.p_hub);
      if (!h || !owns(h)) return err("lv_forbidden", "Not allowed");
      const c: C = { campaign_id: id("cmp"), hub_id: h.hub_id, title: String(a.p_title), mode: String(a.p_mode), anonymity: String(a.p_anonymity ?? "anonymous"), status: "draft", created_at: iso(Date.now()), join_code: code6(), questions: [], responses: [], opens_at: null, closes_at: null, audience: "members" };
      s.campaigns.push(c);
      return { ok: true, campaign_id: c.campaign_id };
    }
    case "lv_campaign_question_add": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (c.status !== "draft") return err("lv_locked", "Questions cannot change after publishing");
      if (!CORE_KINDS.includes(String(a.p_kind))) return err("lv_invalid_input", "That question kind isn't available");
      if (isPersonal(s, c) && c.questions.length >= LIMITS.free.quick_survey_questions)
        return err("lv_limit_reached", "Quick Surveys have up to 10 questions", { limit: LIMITS.free.quick_survey_questions, used: c.questions.length });
      const q = { question_id: id("q"), position: c.questions.length, kind: String(a.p_kind), prompt: String(a.p_prompt), config: (a.p_config as object) ?? {} };
      c.questions.push(q);
      return { ok: true, question_id: q.question_id };
    }
    case "lv_campaign_question_update": {
      const c = s.campaigns.find((x) => x.questions.some((q) => q.question_id === a.p_question));
      const q = c?.questions.find((x) => x.question_id === a.p_question);
      if (!c || !q) return err("lv_not_found", "Question not found");
      if (c.status !== "draft") return err("lv_locked", "Questions cannot change after publishing");
      if (a.p_prompt != null) q.prompt = String(a.p_prompt);
      if (a.p_config != null) q.config = a.p_config as object;
      if (a.p_position != null) {
        const to = Math.max(0, Math.min(c.questions.length - 1, Number(a.p_position)));
        c.questions.splice(c.questions.indexOf(q), 1);
        c.questions.splice(to, 0, q);
        c.questions.forEach((x, i) => (x.position = i));
      }
      return { ok: true };
    }
    case "lv_campaign_question_remove": {
      const c = s.campaigns.find((x) => x.questions.some((q) => q.question_id === a.p_question));
      if (!c) return err("lv_not_found", "Question not found");
      if (c.status !== "draft") return err("lv_locked", "Questions cannot change after publishing");
      c.questions = c.questions.filter((q) => q.question_id !== a.p_question);
      c.questions.forEach((x, i) => (x.position = i));
      return { ok: true };
    }
    case "lv_campaign_update": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (c.status !== "draft") return err("lv_locked", "Only a draft can be edited");
      if (a.p_title) c.title = String(a.p_title);
      return { ok: true };
    }
    case "lv_campaign_set_participation": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (c.status !== "draft") return err("lv_locked", "Participation is part of the published version");
      if (c.access === "invite" && a.p_audience === "members_and_guests") return err("lv_invalid_input", "Invite-only surveys can't take guests");
      c.audience = String(a.p_audience);
      return { ok: true };
    }
    case "lv_campaign_activate":
    case "lv_campaign_schedule": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (c.status !== "draft") return err("lv_lifecycle_invalid", "Only a draft can be published");
      if (!c.questions.length) return err("lv_gate_blocked", "no_questions", { reasons: ["no_questions"] });
      if (isPersonal(s, c)) {
        if (qsActive() >= LIMITS.free.quick_surveys_active)
          return err("lv_limit_reached", "You have 5 active Quick Surveys", { limit: LIMITS.free.quick_surveys_active, used: qsActive() });
      } else {
        const fam = activeFamily(s, c.hub_id);
        if (fam === "free") return err("lv_entitlement_required", "This Hub's plan has ended; premium actions are locked", { product: "starter_hub" });
        const active = s.campaigns.filter((x) => x.hub_id === c.hub_id && isActive(x));
        if (active.length >= LIMITS[fam].active_campaigns) return err("lv_limit_reached", "Active Campaign limit reached", { limit: LIMITS[fam].active_campaigns, used: active.length });
        const surveys = active.filter((x) => x.mode === "survey").length;
        if (c.mode === "survey" && surveys >= LIMITS[fam].active_surveys) return err("lv_limit_reached", "Active survey limit reached", { limit: LIMITS[fam].active_surveys, used: surveys });
      }
      if (fn === "lv_campaign_schedule") {
        c.opens_at = (a.p_opens_at as string) ?? null;
        c.closes_at = (a.p_closes_at as string) ?? null;
      }
      c.status = "active";
      return { ok: true };
    }
    case "lv_campaign_pause": {
      const c = camp(a.p_campaign);
      if (!c || c.status !== "active") return err("lv_lifecycle_invalid", "Only a running Campaign can be paused");
      c.status = "paused";
      return { ok: true };
    }
    case "lv_campaign_resume": {
      const c = camp(a.p_campaign);
      if (!c || c.status !== "paused") return err("lv_lifecycle_invalid", "Only a paused Campaign can resume");
      c.status = "active";
      return { ok: true };
    }
    case "lv_campaign_close": {
      const c = camp(a.p_campaign);
      if (!c || (c.status !== "active" && c.status !== "paused")) return err("lv_lifecycle_invalid", "Only a running Campaign can close");
      c.status = "closed";
      return { ok: true };
    }
    case "lv_campaign_archive": {
      const c = camp(a.p_campaign);
      if (!c || (c.status !== "closed" && c.status !== "draft")) return err("lv_lifecycle_invalid", "Close it first");
      if (c.status === "draft") s.campaigns = s.campaigns.filter((x) => x !== c);
      else c.status = "archived";
      return { ok: true };
    }

    /* ---------------- respond ---------------- */
    case "lv_submit_response": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (!isActive(c)) return err("lv_closed", "This Campaign is not accepting responses");
      if (c.mine_answered) return { ok: true, receipt_id: `r-${c.campaign_id}-me`, duplicate: true };
      c.mine_answered = true;
      c.responses.push({ receipt: `r-${c.campaign_id}-me`, answers: a.p_answers as Resp["answers"], at: iso(Date.now()), guest: false });
      return { ok: true, receipt_id: `r-${c.campaign_id}-me`, duplicate: false };
    }
    case "lv_guest_campaign_get": {
      const c = s.campaigns.find((x) => x.join_code === String(a.p_join_code).toUpperCase());
      if (!c || c.status === "draft" || c.audience !== "members_and_guests") return err("lv_not_found", "Campaign not found");
      const h = hubById(c.hub_id)!;
      return {
        ok: true,
        campaign: { campaign_id: c.campaign_id, hub_id: c.hub_id, title: c.title, mode: c.mode, anonymity: c.anonymity, status: c.status, revision: 1, opens_at: c.opens_at, closes_at: c.closes_at, space: h.kind },
        hub: { name: h.kind === "community" ? h.name : null },
        questions: c.questions, has_responded: false, receipt_id: null, can_respond: isActive(c), can_manage: false, join_code: c.join_code,
      };
    }
    case "lv_guest_submit": {
      const c = s.campaigns.find((x) => x.join_code === String(a.p_join_code).toUpperCase());
      if (!c) return err("lv_not_found", "Campaign not found");
      if (!isActive(c)) return err("lv_closed", "This Campaign is not accepting responses");
      const receipt = id("rcpt");
      c.responses.push({ receipt, answers: a.p_answers as Resp["answers"], at: iso(Date.now()), guest: true });
      return { ok: true, receipt_id: receipt, duplicate: false };
    }

    /* ---------------- analytics ---------------- */
    case "lv_analytics_query": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (c.status === "draft") return err("lv_lifecycle_invalid", "Results are not available for a draft");
      if (c.anonymity === "anonymous" && (c.status === "active" || c.status === "paused")) return err("lv_policy_undecided", "Anonymous results appear after the Campaign closes");
      const members = c.responses.filter((r) => !r.guest).length;
      const guests = c.responses.filter((r) => r.guest).length;
      if (a.p_metric === "participant_count")
        return { ok: true, metric: "participant_count", n: members >= MIN_COHORT ? members : null, suppressed: members < MIN_COHORT, guest_n: guests >= MIN_COHORT ? guests : null, guest_suppressed: guests < MIN_COHORT };
      {
        const q = c.questions.find((x) => x.question_id === a.p_question);
        if (q?.kind === "text") {
          const t = texts(c, q.question_id);
          return { ok: true, metric: "answer_distribution", question_id: q.question_id, cells: [], texts: t, texts_withheld: t === null };
        }
      }
      return { ok: true, metric: "answer_distribution", question_id: a.p_question, cells: distribution(c, String(a.p_question)) };
    }
    case "lv_analytics_export": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "Campaign not found");
      if (isPersonal(s, c) || activeFamily(s, c.hub_id) === "free") return err("lv_entitlement_required", "Exports need an active Hub plan", { product: "starter_hub" });
      if (c.status === "draft") return err("lv_lifecycle_invalid", "Nothing to export yet");
      if (c.anonymity === "anonymous" && c.status !== "closed" && c.status !== "archived") return err("lv_policy_undecided", "Anonymous results appear after the Campaign closes");
      const rows = c.questions.filter((q) => q.kind !== "text").flatMap((q) => distribution(c, q.question_id).map((cell) => ({ question_id: q.question_id, prompt: q.prompt, answer: cell.key, n: cell.n, suppressed: cell.suppressed })));
      return { ok: true, rows };
    }

    /* ---------------- roles and membership ---------------- */
    case "lv_capability_catalog":
      return {
        ok: true,
        groups: [
          { key: "hub", label: "Hub", capabilities: [{ key: "hub.settings.manage", label: "Manage Hub settings" }] },
          { key: "members", label: "Members", capabilities: [{ key: "admin.members.admit", label: "Admit and reject requests" }, { key: "admin.members.remove", label: "Remove members" }] },
          { key: "roles", label: "Roles", capabilities: [{ key: "admin.roles.manage", label: "Create and edit roles" }] },
          { key: "campaigns", label: "Campaigns", capabilities: [{ key: "campaign.manage", label: "Create and run Campaigns" }] },
          { key: "analytics", label: "Analytics", capabilities: [{ key: "analytics.read", label: "Read results" }, { key: "analytics.export", label: "Export results" }] },
          { key: "billing", label: "Billing", capabilities: [{ key: "billing.view", label: "See plan and usage" }] },
        ],
      };
    case "lv_role_list": {
      const fam = activeFamily(s, a.p_hub as string);
      const roles = s.roles.filter((r) => r.hub === a.p_hub);
      const h = hubById(a.p_hub);
      return { ok: true, roles: roles.map(({ hub, ...r }) => ({ ...r, is_owner: false, member_count: h?.members.filter((m) => m.roles.includes(r.role_id)).length ?? 0 })), custom_slots: LIMITS[fam].custom_roles, slots_used: roles.length };
    }
    case "lv_role_create": {
      const fam = activeFamily(s, a.p_hub as string);
      if (fam === "free") return err("lv_entitlement_required", "Custom roles need an active plan", { product: "starter_hub" });
      const used = s.roles.filter((r) => r.hub === a.p_hub).length;
      if (used >= LIMITS[fam].custom_roles) return err("lv_limit_reached", "Custom role limit reached", { limit: LIMITS[fam].custom_roles, used });
      const r = { hub: String(a.p_hub), role_id: id("role"), key: String(a.p_name).toLowerCase().replace(/\s+/g, "-"), name: String(a.p_name), icon: String(a.p_icon), capabilities: (a.p_capabilities as string[]) ?? [] };
      s.roles.push(r);
      return { ok: true, role_id: r.role_id };
    }
    case "lv_role_update": {
      const r = s.roles.find((x) => x.role_id === a.p_role);
      if (!r) return err("lv_not_found", "Role not found");
      if (a.p_name) r.name = String(a.p_name);
      if (a.p_icon) r.icon = String(a.p_icon);
      if (a.p_capabilities) r.capabilities = a.p_capabilities as string[];
      return { ok: true };
    }
    case "lv_role_delete":
      s.roles = s.roles.filter((x) => x.role_id !== a.p_role);
      for (const h of s.hubs) for (const m of h.members) m.roles = m.roles.filter((x) => x !== a.p_role);
      return { ok: true };
    case "lv_hub_join":
      return { ok: true, membership_id: id("mem"), status: "pending" };
    case "lv_member_leave":
      return err("lv_owner_protected", "The Owner cannot leave");
    case "lv_member_admit":
    case "lv_member_reject":
    case "lv_member_remove": {
      for (const h of s.hubs) {
        const m = h.members.find((x) => x.membership_id === a.p_membership);
        if (!m) continue;
        if (m.is_owner) return err("lv_owner_protected", "The Owner can't be removed");
        if (fn === "lv_member_admit") m.status = "accepted";
        else h.members = h.members.filter((x) => x !== m);
      }
      return { ok: true };
    }
    case "lv_member_role_assign":
    case "lv_member_role_unassign": {
      for (const h of s.hubs) {
        const m = h.members.find((x) => x.membership_id === a.p_membership);
        if (!m) continue;
        m.roles = m.roles.filter((x) => x !== a.p_role);
        if (fn === "lv_member_role_assign") m.roles.push(String(a.p_role));
      }
      return { ok: true };
    }

    /* ---------------- billing-ready, reservation, Discover ---------------- */
    case "lv_checkout_start":
      return err("lv_billing_unavailable", "Billing opens soon");
    case "lv_billing_summary": {
      const h = hubById(a.p_hub);
      if (!h || !owns(h)) return err("lv_forbidden", "Owner or billing.view only");
      const fam = activeFamily(s, h.hub_id);
      const plan = hubPlan(s, h.hub_id);
      const ent = s.ents.find((e) => e.hub_id === h.hub_id);
      const active = s.campaigns.filter((c) => c.hub_id === h.hub_id && isActive(c));
      return {
        ok: true,
        plan: { family: plan.family, product: plan.product, state: plan.state, starts_at: ent?.starts_at ?? null, ends_at: plan.ends_at },
        limits: LIMITS[(plan.family === "free" ? "free" : plan.family) as keyof typeof LIMITS] ?? LIMITS[fam],
        usage: { custom_roles: s.roles.filter((r) => r.hub === h.hub_id).length, custom_pages: h.pages.filter((p) => p.kind === "custom").length, active_campaigns: active.length, active_surveys: active.filter((c) => c.mode === "survey").length },
        reservation: h.reservation ? { slug: h.slug, state: "active", expires_at: h.reservation.expires_at, mine: true } : null,
      };
    }
    case "lv_hub_reservation_status": {
      const slug = String(a.p_slug ?? "").toLowerCase();
      if (slugProblem(slug)) return err("lv_invalid_input", "That address is not allowed");
      const h = hubBySlug(slug);
      if (!h) return { ok: true, slug, state: isGone(s, slug) ? "taken" : "available", mine: false };
      if (h.reservation) return { ok: true, slug, state: "active", expires_at: h.reservation.expires_at, grace_ends_at: iso(new Date(h.reservation.expires_at).getTime() + 25 * DAY), mine: owns(h) };
      return { ok: true, slug, state: "taken", mine: owns(h) };
    }
    case "lv_discover_apply": {
      const h = hubById(a.p_hub);
      if (!h || !owns(h)) return err("lv_forbidden", "Only the Owner can apply");
      const reasons: string[] = [];
      if (activeFamily(s, h.hub_id) !== "team") reasons.push("team_family_required");
      if (h.members.filter((m) => m.status === "accepted").length < LIMITS.team.discover_min_members) reasons.push("members_below_700");
      if (reasons.length) return err("lv_gate_blocked", "Not eligible yet", { reasons });
      s.discover_applied.push(h.hub_id);
      return { ok: true, status: "submitted" };
    }

    case "lv_report_abuse": {
      const reason = String(a.p_reason ?? "").trim();
      if (!reason) return err("lv_invalid_input", "Tell us what is wrong");
      s.reports.push({ join_code: String(a.p_join_code ?? ""), reason: reason.slice(0, 500) });
      return { ok: true };
    }

    default:
      return err("lv_not_found", `Mock does not implement ${fn}`);
  }
}

// L-07: withheld options are merged into ONE "withheld" bucket, so the presence of a single small option is not revealed.
function distribution(c: C, questionId: string) {
  const q = c.questions.find((x) => x.question_id === questionId);
  const counts = new Map<string, number>();
  for (const opt of (q?.config as { options?: string[] })?.options ?? []) counts.set(opt, 0);
  if (q?.kind === "rating") for (const k of ["1", "2", "3", "4", "5"]) counts.set(k, 0);
  if (q?.kind === "yes_no") for (const k of ["true", "false"]) counts.set(k, 0);
  for (const r of c.responses)
    for (const x of r.answers)
      if (x.question_id === questionId)
        for (const v of Array.isArray(x.value) ? x.value : [x.value]) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  const shown = [...counts].filter(([, k]) => k >= MIN_COHORT).map(([key, k]) => ({ key, n: k, suppressed: false, reason: null }));
  const hidden = [...counts].some(([, k]) => k > 0 && k < MIN_COHORT) || (shown.length > 0 && shown.length < counts.size);
  return hidden ? [...shown, { key: "withheld", n: null, suppressed: true, reason: "below_min_cohort" }] : shown;
}

// L-10: free-text answers are released as an unordered list only once the Campaign has enough answers.
function texts(c: C, questionId: string): string[] | null {
  const all = c.responses.flatMap((r) => r.answers.filter((x) => x.question_id === questionId && typeof x.value === "string" && x.value.trim()).map((x) => String(x.value)));
  if (c.responses.length < MIN_COHORT) return null;
  return all.sort(() => Math.random() - 0.5);
}
