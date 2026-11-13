// DEV-ONLY stand-in for results analytics and Trends (000044). Mirrors the server rules closely enough to click
// through (privacy minimum, withheld never zero, limits, Ask again); the backend stays authoritative.

const MIN = 5;
const DAY = 86_400_000;
type MC = {
  campaign_id: string; hub_id: string; title: string; description?: string | null; mode: string; anonymity: string; status: string; created_at: string;
  join_code: string; questions: { question_id: string; position: number; kind: string; prompt: string; config: object }[];
  responses: { receipt: string; answers: { question_id: string; value: unknown }[]; at: string; guest: boolean }[];
  opens_at: string | null; closes_at: string | null; audience: string; access?: string; activated_at?: string | null;
};
type Cell = { key: string | null; n: number | null; suppressed: boolean; reason?: string | null };
interface Trend { trend_id: string; hub_id: string; title: string; description: string | null; created_at: string; runs: string[] }
interface Counters { device: Record<string, number>; source: Record<string, number>; duration: Record<string, number>; started: number }

export interface TrendsCtx {
  store: { trends?: Trend[]; context?: Record<string, Counters>; campaigns: MC[]; n: number };
  authed: boolean;
  hubKind(hubId: string): "personal" | "community" | null;
  /** Where the caller can read/manage; personal space is always the caller's. */
  canManage(hubId: string): boolean;
  personalHub(): string | null;
  /** Plan state: how many Trends, premium results, exports. */
  trendMax(hubId: string): number;
  premium(hubId: string): boolean;
  exportAllowed(hubId: string): boolean;
  distribution(c: MC, qid: string): Cell[];
  nextId(prefix: string): string;
}

export const TRENDS_FNS = new Set([
  "lv_trend_list", "lv_trend_get", "lv_trend_create", "lv_trend_update", "lv_trend_delete", "lv_trend_add", "lv_trend_remove",
  "lv_trend_ask_again", "lv_campaign_trend", "lv_analytics_summary", "lv_analytics_premium", "lv_analytics_crosstab",
  "lv_response_context", "lv_response_started",
]);
export const TRENDS_PUBLIC = new Set(["lv_response_context", "lv_response_started"]);

const err = (code: string, message: string, extra: object = {}) => ({ ok: false, error: { code, message, ...extra } });
const finished = (c: MC) => c.status === "closed" || c.status === "archived" || (c.closes_at !== null && new Date(c.closes_at).getTime() <= Date.now());
const runAt = (c: MC) => c.activated_at ?? c.created_at;
const norm = (p: string) => p.trim().replace(/\s+/g, " ").toLowerCase();

function gate(_ctx: TrendsCtx, c: MC | undefined): { ok: false } & ReturnType<typeof err> | null {
  if (!c) return err("lv_not_found", "No such Campaign.") as never;
  if (c.status === "draft") return err("lv_lifecycle_invalid", "Results are not available for a draft") as never;
  if (c.anonymity === "anonymous" && (c.status === "active" || c.status === "paused") && !finished(c))
    return err("lv_policy_undecided", "Anonymous results appear after the Campaign closes") as never;
  return null;
}

function allowance(ctx: TrendsCtx, hubId: string) {
  const max = ctx.trendMax(hubId);
  const used = (ctx.store.trends ?? []).filter((t) => t.hub_id === hubId).length;
  return { max, used, over: used > max, can_create: used < max, can_add: used <= max && max > 0, product: ctx.hubKind(hubId) === "personal" ? "creator_plus" : "starter_hub" };
}
function info(ctx: TrendsCtx, t: Trend) {
  const runs = t.runs.map((id) => ctx.store.campaigns.find((c) => c.campaign_id === id)).filter(Boolean) as MC[];
  return {
    trend_id: t.trend_id, hub_id: t.hub_id, title: t.title, description: t.description, space: ctx.hubKind(t.hub_id), created_at: t.created_at,
    run_count: runs.length, latest_at: runs.length ? runs.map(runAt).sort().at(-1) : null,
  };
}

function summary(ctx: TrendsCtx, c: MC) {
  const sens = c.anonymity === "anonymous";
  const n = c.responses.length;
  const hide = sens && n < MIN;
  const k = ctx.store.context?.[c.campaign_id];
  const started = k?.started ?? 0;
  const dur = Object.entries(k?.duration ?? {});
  const durN = dur.reduce((a, [, v]) => a + v, 0);
  let median: string | null = null;
  if (durN > 0 && durN >= (sens ? MIN : 1)) {
    let cum = 0;
    for (const b of ["lt_1m", "1_3m", "3_10m", "gt_10m"]) { cum += k!.duration[b] ?? 0; if (median === null && cum * 2 >= durN) median = b; }
  }
  return {
    ok: true,
    responses: { n: hide ? null : n, suppressed: hide, released: true },
    completion: { rate: hide || started === 0 || started < n ? null : Math.round((n / started) * 10000) / 10000, started: hide || started < n ? null : started, suppressed: hide, measured: started > 0 && started >= n },
    median_time: { bucket: median, measured: durN >= (sens ? MIN : 1) ? durN : null, suppressed: durN > 0 && durN < (sens ? MIN : 1) },
  };
}

function mean(c: MC, qid: string): { mean: number | null; n: number | null; suppressed: boolean } {
  const vals = c.responses.flatMap((r) => r.answers.filter((a) => a.question_id === qid && typeof a.value === "number").map((a) => a.value as number));
  if (c.anonymity === "anonymous" && c.responses.length < MIN) return { mean: null, n: null, suppressed: true };
  if (vals.length === 0) return { mean: null, n: 0, suppressed: false };
  return { mean: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100, n: vals.length, suppressed: false };
}

function point(ctx: TrendsCtx, c: MC, qid: string | undefined, kind: string) {
  const base = { campaign_id: c.campaign_id, question_id: qid ?? null };
  if (!qid) return { ...base, state: "absent" };
  const g = gate(ctx, c);
  if (g) return { ...base, state: g.error.code === "lv_lifecycle_invalid" ? "draft" : "not_released" };
  if (c.anonymity === "anonymous" && c.responses.length < MIN) return { ...base, state: "withheld" };
  if (kind === "rating") {
    const m = mean(c, qid);
    return m.mean === null ? { ...base, state: "no_answers" } : { ...base, state: "released", mean: m.mean, n: m.n };
  }
  const cells = ctx.distribution(c, qid);
  const anyW = cells.some((x) => x.suppressed);
  const total = c.responses.filter((r) => r.answers.some((a) => a.question_id === qid)).length;
  if (!total) return { ...base, state: "no_answers" };
  return {
    ...base, state: "released", any_withheld: anyW, n: anyW ? null : total,
    options: cells.map((x) => ({ key: x.key, n: x.n, suppressed: x.suppressed, share: anyW || x.suppressed || !total ? null : Math.round(((x.n ?? 0) / total) * 10000) / 10000 })),
  };
}

function trendGet(ctx: TrendsCtx, t: Trend) {
  const camps = t.runs.map((id) => ctx.store.campaigns.find((c) => c.campaign_id === id)).filter(Boolean) as MC[];
  camps.sort((a, b) => Number(a.status === "draft") - Number(b.status === "draft") || runAt(a).localeCompare(runAt(b)));
  const runs = camps.map((c) => {
    const g = gate(ctx, c);
    return {
      campaign_id: c.campaign_id, title: c.title, status: c.status, anonymity: c.anonymity, run_at: runAt(c), activated_at: c.activated_at ?? null,
      closed_at: null, closes_at: c.closes_at, finished: finished(c),
      responses: g ? { n: null, suppressed: false, released: false, reason: c.status === "draft" ? "draft" : "not_released" } : summary(ctx, c).responses,
    };
  });
  const groups = new Map<string, { kind: string; prompt: string; pos: number; ids: Set<string> }>();
  for (const c of camps) for (const q of c.questions) {
    if (q.kind === "text") continue;
    const key = `${q.kind}:${norm(q.prompt)}`;
    const g = groups.get(key) ?? { kind: q.kind, prompt: q.prompt, pos: q.position, ids: new Set() };
    g.ids.add(c.campaign_id); g.pos = Math.min(g.pos, q.position);
    groups.set(key, g);
  }
  const questions = [...groups].filter(([, g]) => g.ids.size >= 2).sort((a, b) => a[1].pos - b[1].pos).map(([key, g]) => ({
    key, kind: g.kind, prompt: g.prompt, runs: g.ids.size,
    points: camps.map((c) => point(ctx, c, c.questions.find((q) => q.kind === g.kind && norm(q.prompt) === norm(g.prompt))?.question_id, g.kind)),
  }));
  return { ok: true, trend: info(ctx, t), runs, questions, can_manage: ctx.canManage(t.hub_id), limit: allowance(ctx, t.hub_id) };
}

export function trendsHandle(ctx: TrendsCtx, fn: string, a: Record<string, unknown>): unknown {
  const st = ctx.store;
  const trends = (st.trends ??= []);
  const contexts = (st.context ??= {});
  const camp = (id: unknown) => st.campaigns.find((c) => c.campaign_id === id);

  if (fn === "lv_response_started") {
    const c = camp(a.p_campaign);
    if (!c || c.status !== "active") return err("lv_not_found", "No such Campaign.");
    (contexts[c.campaign_id] ??= { device: {}, source: {}, duration: {}, started: 0 }).started++;
    return { ok: true };
  }
  if (fn === "lv_response_context") {
    const rec = st.campaigns.find((c) => c.responses.some((r) => r.receipt === a.p_receipt));
    if (!rec) return err("lv_not_found", "No such receipt.");
    const src = a.p_source as string | null;
    if (src && !["link", "qr", "code", "discord"].includes(src)) return err("lv_invalid_input", "Source is link, qr, code or discord.");
    const k = (contexts[rec.campaign_id] ??= { device: {}, source: {}, duration: {}, started: 0 });
    const marks = ((st as unknown as { marks?: string[] }).marks ??= []);
    if (marks.includes(String(a.p_receipt))) return { ok: true, recorded: false };
    marks.push(String(a.p_receipt));
    if (src) k.source[src] = (k.source[src] ?? 0) + 1;
    if (typeof a.p_seconds === "number") {
      const b = a.p_seconds < 60 ? "lt_1m" : a.p_seconds < 180 ? "1_3m" : a.p_seconds < 600 ? "3_10m" : "gt_10m";
      k.duration[b] = (k.duration[b] ?? 0) + 1;
    }
    return { ok: true, recorded: true };
  }
  if (!ctx.authed) return err("lv_unauthenticated", "Sign in with KpnIdentity first.");

  switch (fn) {
    case "lv_trend_list": {
      const hub = (a.p_hub as string | null) ?? ctx.personalHub();
      if (!hub) return { ok: true, trends: [], can_manage: true, limit: { max: 0, used: 0, over: false, can_create: false, can_add: false, product: "creator_plus" } };
      return { ok: true, trends: trends.filter((t) => t.hub_id === hub).map((t) => info(ctx, t)), can_manage: ctx.canManage(hub), limit: allowance(ctx, hub) };
    }
    case "lv_trend_get": {
      const t = trends.find((x) => x.trend_id === a.p_trend);
      return t ? trendGet(ctx, t) : err("lv_not_found", "No such Trend.");
    }
    case "lv_trend_create": {
      const hub = (a.p_hub as string | null) ?? ctx.personalHub();
      if (!hub || !ctx.hubKind(hub)) return err("lv_not_found", "No such Hub.");
      if (!ctx.canManage(hub)) return err("lv_forbidden", "Managing Trends requires campaign.manage.");
      const title = String(a.p_title ?? "").trim();
      if (!title || title.length > 120) return err("lv_invalid_input", "A Trend needs a name of 1 to 120 characters.");
      const al = allowance(ctx, hub);
      if (!al.can_create) return err("lv_limit_reached", al.max === 0 ? "Trends come with a paid plan." : "This space has reached its Trend limit.", { limit: al.max, used: al.used, product: al.product });
      const ids = (a.p_campaigns as string[] | null) ?? [];
      for (const id of ids) {
        const c = camp(id);
        if (!c || c.hub_id !== hub) return err("lv_invalid_input", "A Trend only holds surveys from its own space.");
        if (trends.some((t) => t.runs.includes(id))) return err("lv_conflict", "That survey is already in a Trend.");
      }
      const t: Trend = { trend_id: ctx.nextId("trend"), hub_id: hub, title, description: String(a.p_description ?? "").trim() || null, created_at: new Date().toISOString(), runs: [...ids] };
      trends.push(t);
      return { ok: true, trend: info(ctx, t) };
    }
    case "lv_trend_update": case "lv_trend_delete": case "lv_trend_add": case "lv_trend_remove": {
      const t = trends.find((x) => x.trend_id === a.p_trend);
      if (!t) return err("lv_not_found", "No such Trend.");
      if (!ctx.canManage(t.hub_id)) return err("lv_forbidden", "Managing Trends requires campaign.manage.");
      if (fn === "lv_trend_delete") { st.trends = trends.filter((x) => x !== t); return { ok: true }; }
      if (fn === "lv_trend_update") {
        if (a.p_title != null) { const v = String(a.p_title).trim(); if (!v || v.length > 120) return err("lv_invalid_input", "A Trend needs a name of 1 to 120 characters."); t.title = v; }
        if (a.p_description != null) t.description = String(a.p_description).trim() || null;
        return { ok: true, trend: info(ctx, t) };
      }
      const id = String(a.p_campaign);
      if (fn === "lv_trend_remove") {
        if (!t.runs.includes(id)) return err("lv_not_found", "That survey is not in this Trend.");
        t.runs = t.runs.filter((x) => x !== id);
        return { ok: true, trend: info(ctx, t) };
      }
      const al = allowance(ctx, t.hub_id);
      if (!al.can_add) return err("lv_limit_reached", "This space holds more Trends than its plan allows. Trends stay readable; adding surveys waits until the count fits.", { limit: al.max, used: al.used, product: al.product });
      const c = camp(id);
      if (!c || c.hub_id !== t.hub_id) return err("lv_invalid_input", "A Trend only holds surveys from its own space.");
      if (trends.some((x) => x.runs.includes(id))) return err("lv_conflict", "That survey is already in a Trend.");
      t.runs.push(id);
      return { ok: true, trend: info(ctx, t) };
    }
    case "lv_trend_ask_again": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "No such Campaign.");
      if (!ctx.canManage(c.hub_id)) return err("lv_forbidden", "Asking again requires campaign.manage.");
      const t = trends.find((x) => x.runs.includes(c.campaign_id));
      if (!t) return err("lv_invalid_input", "Add this survey to a Trend first.");
      if (!finished(c)) return err("lv_lifecycle_invalid", "Ask again once this survey has closed.");
      const al = allowance(ctx, c.hub_id);
      if (!al.can_add) return err("lv_limit_reached", "This space holds more Trends than its plan allows. Trends stay readable; asking again waits until the count fits.", { limit: al.max, used: al.used, product: al.product });
      const id = ctx.nextId("cmp");
      const map = new Map(c.questions.map((q) => [q.question_id, `${id}-${q.position}`]));
      st.campaigns.push({
        ...c, campaign_id: id, status: "draft", created_at: new Date().toISOString(), activated_at: null, opens_at: null, closes_at: null,
        join_code: Math.random().toString(36).slice(2, 8).toUpperCase(), responses: [],
        questions: c.questions.map((q) => ({ ...q, question_id: map.get(q.question_id)! })),
      });
      t.runs.push(id);
      return { ok: true, campaign_id: id, trend_id: t.trend_id, space: ctx.hubKind(c.hub_id) };
    }
    case "lv_campaign_trend": {
      const c = camp(a.p_campaign);
      if (!c) return err("lv_not_found", "No such Campaign.");
      const t = trends.find((x) => x.runs.includes(c.campaign_id));
      const al = allowance(ctx, c.hub_id);
      return { ok: true, trend: t ? info(ctx, t) : null, can_manage: ctx.canManage(c.hub_id), can_ask_again: Boolean(t) && ctx.canManage(c.hub_id) && finished(c) && al.can_add, limit: al };
    }
  }
  // results
  const c = camp(a.p_campaign);
  const g = gate(ctx, c);
  if (g) return g;
  if (fn === "lv_analytics_summary") return summary(ctx, c!);
  if (!ctx.premium(c!.hub_id))
    return err("lv_entitlement_required", "Responses over time, device, source and cross-tabs come with Team Hub or Creator Pro.", { product: ctx.hubKind(c!.hub_id) === "personal" ? "creator_pro" : "team_hub", feature: "analytics.premium" });
  const sens = c!.anonymity === "anonymous";
  const block = (cells: { key: string; n: number }[]) => {
    const kept = cells.filter((x) => x.n > 0);
    const total = kept.reduce((s, x) => s + x.n, 0);
    if (sens && (kept.length === 1 || kept.some((x) => x.n < MIN))) return { cells: [] as Cell[], withheld: true, reason: kept.length === 1 ? "dominance" : "below_min_cohort" };
    return { cells: kept.map((x) => ({ key: x.key, n: x.n, suppressed: false })), withheld: total === 0 ? false : false, reason: null };
  };
  if (fn === "lv_analytics_premium") {
    const k = contexts[c!.campaign_id];
    const days = new Map<string, number>();
    for (const r of c!.responses) days.set(r.at.slice(0, 10), (days.get(r.at.slice(0, 10)) ?? 0) + 1);
    const known = (rec: Record<string, number>) => Object.values(rec).reduce((s, v) => s + v, 0);
    const withUnknown = (rec: Record<string, number>) => {
      const out = Object.entries(rec).map(([key, n]) => ({ key, n }));
      const rest = c!.responses.length - Math.min(known(rec), c!.responses.length);
      return rest > 0 ? [...out, { key: "unknown", n: rest }] : out;
    };
    return { ok: true, over_time: block([...days].sort().map(([key, n]) => ({ key, n }))), device: block(withUnknown(k?.device ?? {})), source: block(withUnknown(k?.source ?? {})) };
  }
  // lv_analytics_crosstab
  const qr = c!.questions.find((q) => q.question_id === a.p_row);
  const qc = c!.questions.find((q) => q.question_id === a.p_col);
  const okKind = (k?: string) => k === "single_choice" || k === "multi_choice" || k === "yes_no";
  if (!qr || !qc || qr === qc || !okKind(qr.kind) || !okKind(qc.kind)) return err("lv_invalid_input", "Choose two different choice or yes/no questions of this survey.");
  const tally = new Map<string, number>();
  let total = 0;
  for (const r of c!.responses) {
    const x = r.answers.find((v) => v.question_id === qr.question_id);
    const y = r.answers.find((v) => v.question_id === qc.question_id);
    if (!x || !y) continue;
    total++;
    for (const xv of Array.isArray(x.value) ? x.value : [x.value]) for (const yv of Array.isArray(y.value) ? y.value : [y.value]) {
      const key = `${String(xv)}\u0000${String(yv)}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  const cells = [...tally].map(([k, n]) => { const [row, col] = k.split("\u0000"); return { row: row!, col: col!, n, suppressed: false }; });
  const rows = new Set(cells.map((x) => x.row)); const cols = new Set(cells.map((x) => x.col));
  const dominant = [...rows].some((r) => cells.filter((x) => x.row === r).length === 1) || [...cols].some((cc) => cells.filter((x) => x.col === cc).length === 1);
  if (sens && total > 0 && (cells.some((x) => x.n < MIN) || dominant))
    return { ok: true, row_question_id: qr.question_id, col_question_id: qc.question_id, n: null, cells: [], withheld: true, reason: dominant && !cells.some((x) => x.n < MIN) ? "dominance" : "below_min_cohort" };
  return { ok: true, row_question_id: qr.question_id, col_question_id: qc.question_id, n: total, cells, withheld: false, reason: null };
}

/** Demo counters so the premium panels show something in development. */
export function demoContext(campaigns: MC[], ids: string[]): Record<string, Counters> {
  const out: Record<string, Counters> = {};
  for (const id of ids) {
    const c = campaigns.find((x) => x.campaign_id === id);
    if (!c) continue;
    const n = c.responses.length;
    out[id] = { device: { mobile: Math.round(n * 0.6), desktop: Math.round(n * 0.3), tablet: n - Math.round(n * 0.6) - Math.round(n * 0.3) }, source: { link: Math.round(n * 0.5), qr: Math.round(n * 0.3), code: n - Math.round(n * 0.5) - Math.round(n * 0.3) }, duration: { lt_1m: Math.round(n * 0.3), "1_3m": Math.round(n * 0.5), "3_10m": n - Math.round(n * 0.8) }, started: Math.round(n * 1.25) };
  }
  return out;
}
export { DAY };
