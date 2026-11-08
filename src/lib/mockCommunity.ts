// DEV-ONLY (track C): the mock for the community and Discover lv_api functions (000020). Imported only by
// mockTransport.ts, so it never reaches a production bundle. It follows the backend rules in
// supabase/migrations/000020_v2_community.sql closely enough to click through; the backend stays authoritative.

type Fam = "free" | "starter" | "team";
type Member = { membership_id: string; account_id: string; display_name: string; is_owner: boolean; status: string; roles: string[] };
type Page = { key: string; kind: string; title: string; body?: string | null; position: number; enabled: boolean; visibility?: string };
type Hub = { hub_id: string; slug: string | null; name: string; kind: "community" | "personal"; about: string; accent: string | null; visibility: string; membership_mode: string; members: Member[]; pages: Page[] };
type Camp = { campaign_id: string; hub_id: string; title: string; status: string; closes_at: string | null; anonymity: string; mine_answered?: boolean };

type Post = { post_id: string; hub_id: string; author: string; title: string; body: string; status: "draft" | "published"; visibility: "members" | "public"; pinned: boolean; published_at: string | null; created_at: string; updated_at: string };
type Comment = { comment_id: string; hub_id: string; post_id: string | null; author: string; author_name: string; body: string; hidden: boolean; created_at: string; reports: string[] };
type Item = { item_id: string; hub_id: string; name: string; description: string; price_points: number; stock: number | null; active: boolean };
type Order = { order_id: string; hub_id: string; item_id: string; item_name: string; account: string; member_name: string; points: number; status: "placed" | "fulfilled" | "cancelled"; created_at: string; updated_at: string };
export type CommunityState = {
  seeded: string[];
  settings: Record<string, { points_enabled: boolean; discover_category: string | null }>;
  posts: Post[];
  comments: Comment[];
  optins: { hub: string; account: string }[];
  /** synthetic ended-Campaign counts for seeded people (mock only); the signed-in person is counted from campaigns */
  counts: Record<string, number>;
  points: Record<string, number>; // campaign_id -> points
  earned: { hub: string; account: string; campaign: string; points: number }[];
  items: Item[];
  orders: Order[];
  /** Discover: approved applications (the platform admin decides; track B). Dev helper only. */
  approved: string[];
};

export interface CommunityCtx {
  s: { n: number; hubs: Hub[]; campaigns: Camp[]; roles: { role_id: string; capabilities: string[] }[]; community?: CommunityState; discover_applied?: string[] };
  authed: boolean;
  family: (hub: string) => Fam;
}

const ME = "mock-account";
const MIN_LIMITS: Record<Fam, { addons: boolean; items: number }> = { free: { addons: false, items: 0 }, starter: { addons: true, items: 10 }, team: { addons: true, items: 50 } };
const CATEGORIES = [
  ["sports_fitness", "Sports and fitness"], ["arts_culture", "Arts and culture"], ["books_learning", "Books and learning"],
  ["neighbourhood", "Neighbourhood"], ["faith", "Faith"], ["clubs_hobbies", "Clubs and hobbies"], ["work_professional", "Work and professional"],
  ["health_wellbeing", "Health and wellbeing"], ["environment", "Environment"], ["other", "Other"],
].map(([key, label]) => ({ key, label }));
const ADDONS = ["news", "comments", "leaderboard", "shop"] as const;
const COMMENT_MAX = 1000;
const COMMENTS_PER_MINUTE = 5;
const MAX_PINNED = 3;

export const COMMUNITY_PUBLIC = ["lv_discover_list", "lv_news_list", "lv_news_get"];
export const COMMUNITY_FNS = new Set([
  "lv_hub_pages_get", "lv_hub_pages_update", "lv_community_get", "lv_community_update", "lv_news_list", "lv_news_get", "lv_news_save",
  "lv_news_publish", "lv_news_pin", "lv_news_delete", "lv_comment_list", "lv_comment_add", "lv_comment_delete", "lv_comment_hide",
  "lv_comment_report", "lv_leaderboard_get", "lv_leaderboard_opt", "lv_shop_get", "lv_shop_item_save", "lv_shop_order_place",
  "lv_shop_order_list", "lv_shop_order_update", "lv_campaign_points_set", "lv_discover_list",
]);

const err = (code: string, message: string, extra: object = {}) => ({ ok: false, error: { code, message, ...extra } });
const now = () => new Date().toISOString();

function state(ctx: CommunityCtx): CommunityState {
  const s = ctx.s;
  s.community ??= { seeded: [], settings: {}, posts: [], comments: [], optins: [], counts: {}, points: {}, earned: [], items: [], orders: [], approved: [] };
  const c = s.community;
  // The demo Hub gets some community content (its add-on pages stay off until the Owner turns them on).
  for (const h of s.hubs) {
    if (h.hub_id !== "hub-seed-1" || c.seeded.includes(h.hub_id)) continue;
    c.seeded.push(h.hub_id);
    const t = now();
    c.posts.push({ post_id: "post-seed-1", hub_id: h.hub_id, author: "acc-2", title: "New Sunday route", body: "# What changed\nYou asked for a flatter loop, so the **Sunday long run** now follows the river.\n\n- Meet at the boathouse\n- Map: https://example.org/route", status: "published", visibility: "public", pinned: true, published_at: t, created_at: t, updated_at: t });
    c.posts.push({ post_id: "post-seed-2", hub_id: h.hub_id, author: "acc-2", title: "Kit order closes Friday", body: "Members: sizes are in the Kit order Campaign.", status: "published", visibility: "members", pinned: false, published_at: t, created_at: t, updated_at: t });
    c.comments.push({ comment_id: "cmt-seed-1", hub_id: h.hub_id, post_id: "post-seed-1", author: "acc-3", author_name: "Priya Nair", body: "Much better for my knees, thank you!", hidden: false, created_at: t, reports: [] });
    c.optins.push({ hub: h.hub_id, account: "acc-2" }, { hub: h.hub_id, account: "acc-3" });
    c.counts = { "acc-2": 2, "acc-3": 1 };
    c.items.push({ item_id: "item-seed-1", hub_id: h.hub_id, name: "Club socks", description: "Reflective, one size.", price_points: 30, stock: 4, active: true });
    c.items.push({ item_id: "item-seed-2", hub_id: h.hub_id, name: "Water bottle", description: "", price_points: 500, stock: null, active: true });
    c.settings[h.hub_id] = { points_enabled: true, discover_category: "sports_fitness" };
    c.points["cmp-seed-1"] = 10;
    c.earned.push({ hub: h.hub_id, account: ME, campaign: "cmp-seed-2", points: 40 });
  }
  return c;
}

/** Runs after the core mock handled a call: records points for a new participation, extends the catalogue. */
export function communityAfter(ctx: CommunityCtx, fn: string, a: Record<string, unknown>, r: unknown, answeredBefore: boolean) {
  const res = r as { ok?: boolean; duplicate?: boolean; groups?: unknown[] };
  if (!res?.ok) return;
  if (fn === "lv_capability_catalog") {
    res.groups = [...(res.groups ?? []), { key: "community", label: "Community", capabilities: [
      { key: "community.post", label: "Write and publish Newsroom posts" },
      { key: "community.moderate", label: "Moderate comments" },
      { key: "community.shop", label: "Run the Shop, set Campaign points and fulfil orders" },
    ] }];
  }
  if (fn === "lv_submit_response" && !res.duplicate && !answeredBefore) {
    const c = state(ctx);
    const camp = ctx.s.campaigns.find((x) => x.campaign_id === a.p_campaign);
    if (!camp) return;
    const pts = c.points[camp.campaign_id] ?? 0;
    if (pts > 0 && pointsLive(ctx, camp.hub_id)) c.earned.push({ hub: camp.hub_id, account: ME, campaign: camp.campaign_id, points: pts });
  }
}

function pointsLive(ctx: CommunityCtx, hub: string) {
  return Boolean(state(ctx).settings[hub]?.points_enabled) && MIN_LIMITS[ctx.family(hub)].addons;
}

export function communityHandle(ctx: CommunityCtx, fn: string, a: Record<string, unknown>): unknown {
  const s = ctx.s;
  const c = state(ctx);
  const hubById = (id: unknown) => s.hubs.find((h) => h.hub_id === id);
  const meIn = (h: Hub) => (ctx.authed ? h.members.find((m) => m.account_id === ME && m.status === "accepted") : undefined);
  const hasCap = (h: Hub, cap: string) => {
    const m = meIn(h);
    return Boolean(m && (m.is_owner || s.roles.some((r) => m.roles.includes(r.role_id) && r.capabilities.includes(cap))));
  };
  const reader = (h: Hub | undefined): "member" | "visitor" | null =>
    !h || h.kind !== "community" ? null : meIn(h) ? "member" : h.visibility === "public" ? "visitor" : null;
  const pageOn = (h: Hub, kind: string) => h.pages.some((p) => p.kind === kind && p.enabled);
  const allowed = (h: Hub) => MIN_LIMITS[ctx.family(h.hub_id)].addons;
  const addons = (h: Hub) => Object.fromEntries(ADDONS.map((k) => [k, { enabled: pageOn(h, k), allowed: allowed(h) }]));
  /** lv.require_member */
  const member = (h: Hub | undefined, what: string) => {
    const r = reader(h);
    if (!r) return err("lv_not_found", "No such Hub.");
    if (!ctx.authed) return err("lv_unauthenticated", "Sign in with KpnIdentity first.");
    if (r !== "member") return err("lv_forbidden", `${what} is for members of this Hub.`);
    return null;
  };
  const addon = (h: Hub, kind: string, write: boolean) => {
    if (!pageOn(h, kind)) return err("lv_not_available", "This Hub has not turned this page on.", { kind });
    if (write && !allowed(h)) return err("lv_entitlement_required", "This Hub's plan does not include this page right now. Everything is kept.", { product: "starter_hub", kind });
    return null;
  };
  const premium = (h: Hub) => (meIn(h) && ctx.family(h.hub_id) === "free" ? err("lv_entitlement_required", "This Hub has no active plan. Premium actions are locked; your data is kept.", { product: "starter_hub" }) : null);
  const id = (p: string) => `${p}-${++s.n}`;
  const nameOf = (h: Hub, acc: string) => h.members.find((m) => m.account_id === acc)?.display_name ?? "Former member";
  const postOut = (p: Post, isMember: boolean) => ({
    post_id: p.post_id, title: p.title, body: p.body, status: p.status, visibility: p.visibility, pinned: p.pinned, published_at: p.published_at, updated_at: p.updated_at,
    author_name: nameOf(hubById(p.hub_id)!, p.author), comment_count: isMember ? c.comments.filter((x) => x.post_id === p.post_id && !x.hidden).length : null,
  });
  const balance = (hub: string) =>
    c.earned.filter((e) => e.hub === hub && e.account === ME).reduce((n, e) => n + e.points, 0) -
    c.orders.filter((o) => o.hub_id === hub && o.account === ME && o.status !== "cancelled").reduce((n, o) => n + o.points, 0);
  const ended = (x: Camp) => x.status === "closed" || x.status === "archived" || ((x.status === "active" || x.status === "paused") && Boolean(x.closes_at) && new Date(x.closes_at!).getTime() <= Date.now());
  const countOf = (hub: string, acc: string) => (acc === ME ? s.campaigns.filter((x) => x.hub_id === hub && x.mine_answered && ended(x)).length : c.counts[acc] ?? 0);
  const orderOut = (o: Order, manager: boolean) => ({ order_id: o.order_id, item_id: o.item_id, item_name: o.item_name, points: o.points, status: o.status, created_at: o.created_at, updated_at: o.updated_at, ...(manager ? { member_name: o.member_name } : {}) });
  const isPublicVisible = (h: Hub, p: Page) =>
    p.kind === "home" || p.kind === "campaigns" ||
    (h.visibility === "public" && p.kind === "custom" && p.visibility === "public") ||
    (h.visibility === "public" && p.kind === "news" && c.posts.some((x) => x.hub_id === h.hub_id && x.status === "published" && x.visibility === "public"));

  switch (fn) {
    /* ---------------- pages ---------------- */
    case "lv_hub_pages_get": {
      const h = hubById(a.p_hub);
      const r = reader(h);
      if (!r) return err("lv_not_found", "No such Hub.");
      const manage = hasCap(h!, "hub.settings.manage");
      const pages = h!.pages.map((p) => ({ ...p, visibility: p.visibility ?? "members" }))
        .filter((p) => (manage || p.enabled) && (r === "member" || isPublicVisible(h!, p)));
      return { ok: true, pages, custom_slots: { used: h!.pages.filter((p) => p.kind === "custom").length, limit: ctx.family(h!.hub_id) === "free" ? 0 : ctx.family(h!.hub_id) === "team" ? 10 : 3 }, addons: addons(h!) };
    }
    case "lv_hub_pages_update": {
      const h = hubById(a.p_hub);
      if (!h || h.kind !== "community") return err("lv_not_found", "No such Hub.");
      if (!hasCap(h, "hub.settings.manage")) return err("lv_forbidden", "missing capability hub.settings.manage");
      const prem = premium(h); if (prem) return prem;
      const pages = (a.p_pages as Page[]) ?? [];
      const seen = new Set<string>();
      for (const p of pages) {
        if (!p.title?.trim() || p.title.trim().length > 80) return err("lv_invalid_input", "A page title is 1 to 80 characters.");
        if ((p.body ?? "").length > 20000) return err("lv_invalid_input", "A page body is at most 20000 characters.");
        if (p.visibility && !["members", "public"].includes(p.visibility)) return err("lv_invalid_input", "Page visibility is members or public.");
        if (p.kind !== "custom" && seen.has(p.kind)) return err("lv_invalid_input", `A Hub has one ${p.kind} page.`);
        seen.add(p.kind);
        if ((ADDONS as readonly string[]).includes(p.kind) && p.enabled && !allowed(h)) return err("lv_entitlement_required", `This plan does not include the ${p.kind} page.`, { product: "team_hub", kind: p.kind });
      }
      const custom = pages.filter((p) => p.kind === "custom").length;
      const limit = ctx.family(h.hub_id) === "team" ? 10 : 3;
      if (custom > limit) return err("lv_limit_reached", `This plan allows ${limit} custom pages.`, { limit, used: custom });
      h.pages = pages.map((p, i) => ({ ...p, title: p.title.trim(), position: i, enabled: p.kind === "home" || p.kind === "campaigns" ? true : p.enabled, visibility: p.kind === "custom" ? p.visibility ?? "members" : "members" }));
      if (!h.pages.some((p) => p.kind === "home")) h.pages.unshift({ key: "home", kind: "home", title: "Home", position: 0, enabled: true, visibility: "members" });
      return { ok: true, pages: h.pages };
    }

    /* ---------------- settings ---------------- */
    case "lv_community_get": {
      const h = hubById(a.p_hub);
      const no = member(h, "The community area"); if (no) return no;
      const st = c.settings[h!.hub_id] ?? { points_enabled: false, discover_category: null };
      return {
        ok: true, settings: st, categories: CATEGORIES, addons: addons(h!),
        discover: { status: c.approved.includes(h!.hub_id) ? "approved" : s.discover_applied?.includes(h!.hub_id) ? "submitted" : "none" },
        can: { post: hasCap(h!, "community.post"), moderate: hasCap(h!, "community.moderate"), shop: hasCap(h!, "community.shop"), settings: hasCap(h!, "hub.settings.manage") },
        me: { leaderboard_opt_in: c.optins.some((o) => o.hub === h!.hub_id && o.account === ME), points: st.points_enabled ? balance(h!.hub_id) : null },
      };
    }
    case "lv_community_update": {
      const h = hubById(a.p_hub);
      if (!h || h.kind !== "community") return err("lv_not_found", "No such Hub.");
      const prem = premium(h); if (prem) return prem;
      if (!hasCap(h, "hub.settings.manage")) return err("lv_forbidden", "missing capability hub.settings.manage");
      const cat = a.p_discover_category as string | null;
      if (cat && !CATEGORIES.some((x) => x.key === cat)) return err("lv_invalid_input", "Choose a category from the list.");
      if (a.p_points_enabled === true && !allowed(h)) return err("lv_entitlement_required", "Hub points need a plan that includes the Shop.", { product: "starter_hub" });
      const st = (c.settings[h.hub_id] ??= { points_enabled: false, discover_category: null });
      if (typeof a.p_points_enabled === "boolean") st.points_enabled = a.p_points_enabled;
      if (cat !== null && cat !== undefined) st.discover_category = cat || null;
      return communityHandle(ctx, "lv_community_get", { p_hub: h.hub_id });
    }

    /* ---------------- newsroom ---------------- */
    case "lv_news_list": {
      const h = hubById(a.p_hub);
      const r = reader(h);
      if (!r) return err("lv_not_found", "No such Hub.");
      if (!pageOn(h!, "news")) return err("lv_not_available", "This Hub has not turned the Newsroom on.", { kind: "news" });
      const canPost = r === "member" && hasCap(h!, "community.post");
      const drafts = Boolean(a.p_include_drafts) && canPost;
      const posts = c.posts.filter((p) => p.hub_id === h!.hub_id && (p.status === "published" || drafts) && (r === "member" || p.visibility === "public"))
        .sort((x, y) => Number(y.status === "draft") - Number(x.status === "draft") || Number(y.pinned) - Number(x.pinned) || (y.published_at ?? "").localeCompare(x.published_at ?? ""));
      return { ok: true, can_post: canPost, posts: posts.map((p) => postOut(p, r === "member")) };
    }
    case "lv_news_get": {
      const p = c.posts.find((x) => x.post_id === a.p_post);
      const h = p && hubById(p.hub_id);
      const r = reader(h);
      if (!p || !r || !pageOn(h!, "news") || (p.status === "draft" && !(r === "member" && hasCap(h!, "community.post"))) || (r === "visitor" && p.visibility !== "public"))
        return err("lv_not_found", "No such post.");
      return { ok: true, post: postOut(p, r === "member"), hub_id: p.hub_id, can_post: r === "member" && hasCap(h!, "community.post"), comments_enabled: r === "member" && p.status === "published" && pageOn(h!, "comments") };
    }
    case "lv_news_save": {
      const h = hubById(a.p_hub);
      const no = member(h, "The Newsroom"); if (no) return no;
      const prem = premium(h!); if (prem) return prem;
      if (!hasCap(h!, "community.post")) return err("lv_forbidden", "missing capability community.post");
      const off = addon(h!, "news", true); if (off) return off;
      const title = String(a.p_title ?? "").trim();
      const vis = (a.p_visibility as "members" | "public") ?? "members";
      if (!title || title.length > 140) return err("lv_invalid_input", "A title is 1 to 140 characters.");
      if (String(a.p_body ?? "").length > 20000) return err("lv_invalid_input", "A post is at most 20000 characters.");
      if (vis === "public" && h!.visibility !== "public") return err("lv_invalid_input", "Only a public Hub can publish posts publicly.");
      let p = a.p_post ? c.posts.find((x) => x.post_id === a.p_post && x.hub_id === h!.hub_id) : undefined;
      if (a.p_post && !p) return err("lv_not_found", "No such post.");
      if (!p) { p = { post_id: id("post"), hub_id: h!.hub_id, author: ME, title, body: String(a.p_body ?? ""), status: "draft", visibility: vis, pinned: false, published_at: null, created_at: now(), updated_at: now() }; c.posts.push(p); }
      else Object.assign(p, { title, body: a.p_body == null ? p.body : String(a.p_body), visibility: vis, updated_at: now() });
      return { ok: true, post: postOut(p, true) };
    }
    case "lv_news_publish":
    case "lv_news_pin":
    case "lv_news_delete": {
      const p = c.posts.find((x) => x.post_id === a.p_post);
      if (!p) return err("lv_not_found", "No such post.");
      const h = hubById(p.hub_id)!;
      const no = member(h, "The Newsroom"); if (no) return no;
      if (!hasCap(h, "community.post")) return err("lv_not_found", "No such post.");
      if (fn === "lv_news_delete") { c.posts = c.posts.filter((x) => x !== p); c.comments = c.comments.filter((x) => x.post_id !== p.post_id); return { ok: true }; }
      const prem = premium(h); if (prem) return prem;
      const off = addon(h, "news", true); if (off) return off;
      if (fn === "lv_news_publish") {
        if (a.p_publish === false) Object.assign(p, { status: "draft", pinned: false });
        else Object.assign(p, { status: "published", published_at: p.published_at ?? now() });
      } else {
        const on = a.p_pinned !== false;
        if (on && p.status !== "published") return err("lv_invalid_input", "Publish the post before pinning it.");
        if (on && !p.pinned && c.posts.filter((x) => x.hub_id === h.hub_id && x.pinned).length >= MAX_PINNED) return err("lv_limit_reached", `A Hub can pin ${MAX_PINNED} posts.`, { limit: MAX_PINNED, used: MAX_PINNED });
        p.pinned = on;
      }
      p.updated_at = now();
      return { ok: true, post: postOut(p, true) };
    }

    /* ---------------- comments ---------------- */
    case "lv_comment_list":
    case "lv_comment_add": {
      const h = hubById(a.p_hub);
      const no = member(h, fn === "lv_comment_add" ? "Commenting" : "Comments"); if (no) return no;
      const post = (a.p_post as string | null) ?? null;
      if (post && !c.posts.some((x) => x.post_id === post && x.hub_id === h!.hub_id && x.status === "published")) return err("lv_not_found", "No such post.");
      if (!pageOn(h!, "comments") || (post && !pageOn(h!, "news"))) return err("lv_not_available", "This Hub has not turned comments on.", { kind: "comments" });
      const mod = hasCap(h!, "community.moderate");
      if (fn === "lv_comment_list") {
        return {
          ok: true, can_moderate: mod, can_comment: allowed(h!), max_length: COMMENT_MAX,
          comments: c.comments.filter((x) => x.hub_id === h!.hub_id && x.post_id === post && (!x.hidden || mod)).map((x) => ({
            comment_id: x.comment_id, body: x.body, created_at: x.created_at, author_name: x.author_name, mine: x.author === ME, hidden: x.hidden,
            reported_by_me: x.reports.includes(ME), ...(mod ? { report_count: x.reports.length } : {}),
          })),
        };
      }
      const prem = premium(h!); if (prem) return prem;
      const off = addon(h!, "comments", true); if (off) return off;
      const body = String(a.p_body ?? "").trim();
      if (!body) return err("lv_invalid_input", "Write something first.");
      if (body.length > COMMENT_MAX) return err("lv_invalid_input", `A comment is at most ${COMMENT_MAX} characters.`, { limit: COMMENT_MAX, used: body.length });
      const recent = c.comments.filter((x) => x.hub_id === h!.hub_id && x.author === ME && Date.now() - new Date(x.created_at).getTime() < 60_000).length;
      if (recent >= COMMENTS_PER_MINUTE) return err("lv_rate_limited", "You are commenting very quickly. Wait a minute and try again.");
      const cm = { comment_id: id("cmt"), hub_id: h!.hub_id, post_id: post, author: ME, author_name: nameOf(h!, ME), body, hidden: false, created_at: now(), reports: [] };
      c.comments.push(cm);
      return { ok: true, comment_id: cm.comment_id };
    }
    case "lv_comment_delete":
    case "lv_comment_hide":
    case "lv_comment_report": {
      const cm = c.comments.find((x) => x.comment_id === a.p_comment);
      if (!cm) return err("lv_not_found", "No such comment.");
      const h = hubById(cm.hub_id)!;
      const no = member(h, "Comments"); if (no) return no;
      const mod = hasCap(h, "community.moderate");
      if (fn === "lv_comment_delete") {
        if (cm.author !== ME && !mod) return err("lv_forbidden", "Only the author or a moderator can delete this comment.");
        c.comments = c.comments.filter((x) => x !== cm);
        return { ok: true };
      }
      if (fn === "lv_comment_hide") {
        if (!mod) return err("lv_forbidden", "missing capability community.moderate");
        cm.hidden = a.p_hidden !== false;
        return { ok: true, hidden: cm.hidden };
      }
      if (cm.hidden && !mod) return err("lv_not_found", "No such comment.");
      if (cm.author === ME) return err("lv_invalid_input", "You cannot report your own comment.");
      const reason = String(a.p_reason ?? "").trim();
      if (!reason || reason.length > 500) return err("lv_invalid_input", "Say briefly what is wrong (up to 500 characters).");
      if (cm.reports.includes(ME)) return { ok: true, already_reported: true };
      cm.reports.push(ME);
      return { ok: true, already_reported: false };
    }

    /* ---------------- leaderboard ---------------- */
    case "lv_leaderboard_get": {
      const h = hubById(a.p_hub);
      const no = member(h, "The leaderboard"); if (no) return no;
      const off = addon(h!, "leaderboard", false); if (off) return off;
      const rows = c.optins.filter((o) => o.hub === h!.hub_id && h!.members.some((m) => m.account_id === o.account && m.status === "accepted"))
        .map((o) => ({ display_name: nameOf(h!, o.account), campaigns: countOf(h!.hub_id, o.account), me: o.account === ME }))
        .sort((x, y) => y.campaigns - x.campaigns || x.display_name.localeCompare(y.display_name));
      const distinct = [...new Set(rows.map((r) => r.campaigns))];
      return {
        ok: true,
        me: { opted_in: c.optins.some((o) => o.hub === h!.hub_id && o.account === ME), campaigns: countOf(h!.hub_id, ME) },
        entries: rows.map((r) => ({ rank: distinct.indexOf(r.campaigns) + 1, ...r })),
      };
    }
    case "lv_leaderboard_opt": {
      const h = hubById(a.p_hub);
      const no = member(h, "The leaderboard"); if (no) return no;
      if (a.p_opt_in) {
        const off = addon(h!, "leaderboard", true); if (off) return off;
        if (!c.optins.some((o) => o.hub === h!.hub_id && o.account === ME)) c.optins.push({ hub: h!.hub_id, account: ME });
      } else c.optins = c.optins.filter((o) => !(o.hub === h!.hub_id && o.account === ME));
      return { ok: true, opted_in: Boolean(a.p_opt_in) };
    }

    /* ---------------- shop ---------------- */
    case "lv_shop_get": {
      const h = hubById(a.p_hub);
      const no = member(h, "The Shop"); if (no) return no;
      const off = addon(h!, "shop", false); if (off) return off;
      const manage = hasCap(h!, "community.shop");
      const pts = Boolean(c.settings[h!.hub_id]?.points_enabled);
      return {
        ok: true, points_enabled: pts, can_order: pts && allowed(h!), balance: balance(h!.hub_id), can_manage: manage,
        item_limit: MIN_LIMITS[ctx.family(h!.hub_id)].items,
        items: c.items.filter((i) => i.hub_id === h!.hub_id && (i.active || manage)).map(({ hub_id, ...i }) => i),
        my_orders: c.orders.filter((o) => o.hub_id === h!.hub_id && o.account === ME).map((o) => orderOut(o, false)),
        campaign_points: manage ? s.campaigns.filter((x) => x.hub_id === h!.hub_id && x.status !== "archived").map((x) => ({ campaign_id: x.campaign_id, title: x.title, status: x.status, points: c.points[x.campaign_id] ?? 0 })) : null,
      };
    }
    case "lv_shop_item_save": {
      const h = hubById(a.p_hub);
      const no = member(h, "The Shop"); if (no) return no;
      const prem = premium(h!); if (prem) return prem;
      if (!hasCap(h!, "community.shop")) return err("lv_forbidden", "missing capability community.shop");
      const off = addon(h!, "shop", true); if (off) return off;
      const cur = a.p_item ? c.items.find((i) => i.item_id === a.p_item && i.hub_id === h!.hub_id) : undefined;
      if (a.p_item && !cur) return err("lv_not_found", "No such item.");
      const name = String(a.p_name ?? cur?.name ?? "").trim();
      const price = (a.p_price_points as number | null) ?? cur?.price_points ?? null;
      if (!name || name.length > 80) return err("lv_invalid_input", "An item name is 1 to 80 characters.");
      if (price === null || !Number.isInteger(price) || price < 1 || price > 1_000_000) return err("lv_invalid_input", "A price is 1 to 1,000,000 points.");
      const stockIn = a.p_stock as number | null;
      if (stockIn !== null && stockIn !== undefined && stockIn < -1) return err("lv_invalid_input", "Stock cannot be negative.");
      const active = (a.p_active as boolean | null) ?? cur?.active ?? true;
      const used = c.items.filter((i) => i.hub_id === h!.hub_id && i.active && i !== cur).length;
      const limit = MIN_LIMITS[ctx.family(h!.hub_id)].items;
      if (active && used >= limit) return err("lv_limit_reached", `This plan allows ${limit} active Shop items.`, { limit, used });
      const stock = stockIn === -1 ? null : stockIn ?? cur?.stock ?? null;
      const item: Item = cur ?? { item_id: id("item"), hub_id: h!.hub_id, name, description: "", price_points: price, stock, active };
      Object.assign(item, { name, price_points: price, stock, active, description: (a.p_description as string | null) ?? item.description });
      if (!cur) c.items.push(item);
      const { hub_id, ...out } = item;
      return { ok: true, item: out };
    }
    case "lv_shop_order_place": {
      const it = c.items.find((i) => i.item_id === a.p_item);
      if (!it) return err("lv_not_found", "No such item.");
      const h = hubById(it.hub_id)!;
      const no = member(h, "The Shop"); if (no) return no;
      const prem = premium(h); if (prem) return prem;
      const off = addon(h, "shop", true); if (off) return off;
      if (!pointsLive(ctx, h.hub_id)) return err("lv_not_available", "This Hub has not turned points on.", { kind: "points" });
      if (!it.active) return err("lv_not_found", "No such item.");
      if (it.stock !== null && it.stock <= 0) return err("lv_out_of_stock", "This item is out of stock.");
      const bal = balance(h.hub_id);
      if (bal < it.price_points) return err("lv_insufficient_points", "You do not have enough points for this item yet.", { balance: bal, price: it.price_points });
      if (it.stock !== null) it.stock -= 1;
      const o: Order = { order_id: id("order"), hub_id: h.hub_id, item_id: it.item_id, item_name: it.name, account: ME, member_name: nameOf(h, ME), points: it.price_points, status: "placed", created_at: now(), updated_at: now() };
      c.orders.push(o);
      return { ok: true, order: orderOut(o, false), balance: bal - it.price_points };
    }
    case "lv_shop_order_list": {
      const h = hubById(a.p_hub);
      const no = member(h, "The Shop"); if (no) return no;
      if (!hasCap(h!, "community.shop")) return err("lv_forbidden", "missing capability community.shop");
      return { ok: true, orders: c.orders.filter((o) => o.hub_id === h!.hub_id && (!a.p_status || o.status === a.p_status)).sort((x, y) => Number(y.status === "placed") - Number(x.status === "placed") || y.created_at.localeCompare(x.created_at)).map((o) => orderOut(o, true)) };
    }
    case "lv_shop_order_update": {
      const o = c.orders.find((x) => x.order_id === a.p_order);
      if (!o) return err("lv_not_found", "No such order.");
      const h = hubById(o.hub_id)!;
      const no = member(h, "The Shop"); if (no) return no;
      const manage = hasCap(h, "community.shop");
      if (!manage && o.account !== ME) return err("lv_not_found", "No such order.");
      if (a.p_status !== "fulfilled" && a.p_status !== "cancelled") return err("lv_invalid_input", "Status is fulfilled or cancelled.");
      if (a.p_status === "fulfilled" && !manage) return err("lv_forbidden", "Only the Hub marks an order fulfilled.");
      if (o.status !== "placed") return err("lv_lifecycle_invalid", "Only an open order can change.");
      o.status = a.p_status;
      o.updated_at = now();
      if (o.status === "cancelled") { const it = c.items.find((i) => i.item_id === o.item_id); if (it && it.stock !== null) it.stock += 1; }
      return { ok: true, order: orderOut(o, manage) };
    }
    case "lv_campaign_points_set": {
      const camp = s.campaigns.find((x) => x.campaign_id === a.p_campaign);
      const h = camp && hubById(camp.hub_id);
      if (!camp || !h || h.kind !== "community") return err("lv_not_found", "No such Campaign.");
      const no = member(h, "Hub points"); if (no) return no;
      if (!hasCap(h, "community.shop")) return err("lv_forbidden", "missing capability community.shop");
      const prem = premium(h); if (prem) return prem;
      const p = a.p_points as number;
      if (!Number.isInteger(p) || p < 0 || p > 1000) return err("lv_invalid_input", "Points per Campaign are 0 to 1000.");
      c.points[camp.campaign_id] = p;
      return { ok: true, campaign_id: camp.campaign_id, points: p };
    }

    /* ---------------- discover ---------------- */
    case "lv_discover_list": {
      const q = String(a.p_query ?? "").trim().toLowerCase();
      const cat = (a.p_category as string | null) || null;
      if (q.length > 80) return err("lv_invalid_input", "Search is at most 80 characters.");
      if (cat && !CATEGORIES.some((x) => x.key === cat)) return err("lv_invalid_input", "Unknown category.");
      const hubs = s.hubs
        .filter((h) => h.kind === "community" && h.visibility === "public" && c.approved.includes(h.hub_id) && ctx.family(h.hub_id) === "team")
        .filter((h) => !cat || c.settings[h.hub_id]?.discover_category === cat)
        .filter((h) => !q || h.name.toLowerCase().includes(q) || (h.slug ?? "").includes(q) || h.about.toLowerCase().includes(q))
        .map((h) => {
          const genuine = h.members.filter((m) => m.status === "accepted").length;
          return { slug: h.slug, name: h.name, about: h.about.slice(0, 280), accent: h.accent, category: c.settings[h.hub_id]?.discover_category ?? null, membership_mode: h.membership_mode, members_rounded: Math.floor(genuine / 100) * 100 };
        });
      return { ok: true, categories: CATEGORIES, hubs };
    }
  }
  return undefined;
}
