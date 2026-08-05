// menu-sync: bridges MJCCv1 (source of truth for the cafeteria menu) into
// LunchVoice's own menu_cycles/menu_cycle_days tables, and pushes LunchVoice's
// rating aggregates back into MJCCv1's menu_feedback_summary.
//
// verify_jwt: false — matches this project's other internal-bridge functions
// Actual write authorization is enforced in assertSyncAuthorized below.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyKpnSoluteWebhook } from "../_shared/kpnsoluteWebhooks.ts";

const DEFAULT_ORG_SLUG = "LionCafe";
const DEFAULT_MJCC_MENU_API_BASE = "https://mjcc-managements.onrender.com";
const MAX_CLOUDEVENT_BYTES = 256 * 1024;
const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowList = [...new Set([...allowedOrigins, ...devOrigins])];
  const wildcardTenant = (() => {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" && (url.hostname === "lunchvoice.com" || url.hostname === "www.lunchvoice.com" || url.hostname.endsWith(".lunchvoice.com"));
    } catch {
      return false;
    }
  })();
  const allowOrigin = !origin || allowList.includes(origin) || wildcardTenant ? origin || allowList[0] : allowList[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-menu-sync-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

type PublicMenuSlot = { slot_name: string; item_name: string };
type PublicMenuDay = { cycle_day: number; day_of_week: string; meals: Record<string, PublicMenuSlot[]> };
type PublicMenuCycle = { anchor_date: string; days: PublicMenuDay[] };
type KpnCloudEvent = {
  specversion: string; id: string; source: string; type: string; time: string;
  tenantid: string; data: Record<string, unknown>;
};
const MENU_DAY_EVENT = "com.kpnsolute.compute.menu.day.updated.v1";
const MENU_CYCLE_EVENT = "com.kpnsolute.compute.menu.cycle.updated.v1";

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// supabase-js 2.112's ungenerated generic schema resolves query rows to never;
// this Edge Function intentionally uses runtime-validated rows.
// deno-lint-ignore no-explicit-any
async function resolveOrgId(v2: any, orgSlug: string): Promise<string> {
  const { data, error } = await v2
    .from("orgs")
    .select("id")
    .ilike("slug", orgSlug)
    .maybeSingle();
  if (error) throw new Error(`org lookup failed: ${error.message}`);
  if (!data) throw new Error(`Unknown organization: ${orgSlug}`);
  return (data as { id: string }).id;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// deno-lint-ignore no-explicit-any
async function assertSyncAuthorized(req: Request, v2: any, orgSlug: string) {
  const internalToken = Deno.env.get("MENU_SYNC_TOKEN")?.trim();
  const suppliedToken = req.headers.get("x-menu-sync-token")?.trim();
  if (internalToken && suppliedToken && suppliedToken === internalToken) return;

  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "Staff session required");

  const { data: userRes, error: userErr } = await v2.auth.getUser(token);
  if (userErr || !userRes.user) throw new HttpError(401, "Invalid staff session");

  const orgId = await resolveOrgId(v2, orgSlug);
  const { data: profile, error: profileErr } = await v2
    .from("profiles")
    .select("org_id, role, is_staff")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileErr) throw new Error(`profile authorization lookup failed: ${profileErr.message}`);
  const staffProfile = profile as { org_id: string; role: string | null; is_staff: boolean } | null;
  if (!staffProfile?.is_staff && staffProfile?.role !== "admin") throw new HttpError(403, "Staff access required");
  if (staffProfile.org_id !== orgId) throw new HttpError(403, "Staff session does not match organization");
}

// Fold MJCCv1's per-meal rows for one day into LunchVoice's breakfast/lunch/dinner shape.
// Weekdays: Breakfast -> breakfast, Lunch -> lunch, Dinner -> dinner, Snack dropped
//   (Snack is always the same 4 staples already hardcoded client-side in STAPLES).
// Weekend days: no separate Breakfast/Lunch row, just one combined "Brunch" row —
//   its first 4 items are the same staples (breakfast), the rest are the day's
//   lunch dishes. Verified against MJCCv1 day1 Brunch data: last 2 of 6 items
//   ("Char Sui Pork", "Chef's Choice") match CYCLE[0]'s lunchEntree/lunchAlt exactly.
function mjccApiBase(): string {
  return (Deno.env.get("MJCC_MENU_API_BASE") ?? DEFAULT_MJCC_MENU_API_BASE).replace(/\/$/, "");
}

async function fetchPublicMenuCycle(): Promise<PublicMenuCycle> {
  const res = await fetch(`${mjccApiBase()}/api/public/menu/cycle`);
  if (!res.ok) throw new Error(`MJCC public menu API failed: ${res.status}`);
  return await res.json();
}

function mealNames(day: PublicMenuDay, periods: string[]): string[] {
  return periods
    .flatMap((period) => day.meals?.[period] ?? [])
    .map((slot) => slot.item_name)
    .filter(Boolean);
}

function tenantOrgSlug(tenantId: string): string {
  let mapping: Record<string, string> = { mjcc: DEFAULT_ORG_SLUG };
  const configured = Deno.env.get("KPNSOLUTE_TENANT_ORG_MAP")?.trim();
  if (configured) {
    try { mapping = JSON.parse(configured); }
    catch { throw new HttpError(500, "KPNSOLUTE_TENANT_ORG_MAP is invalid JSON"); }
  }
  const orgSlug = mapping[tenantId];
  if (!orgSlug) throw new HttpError(403, `Tenant is not mapped: ${tenantId}`);
  return orgSlug;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, `${name} must be an object`);
  return value as Record<string, unknown>;
}

function normalizeWebhookDay(value: unknown) {
  const day = object(value, "menu day");
  const meals = object(day.meals, "menu day meals") as Record<string, PublicMenuSlot[]>;
  const publicDay: PublicMenuDay = {
    cycle_day: Number(day.cycle_day),
    day_of_week: String(day.day_of_week ?? ""),
    meals,
  };
  if (!Number.isInteger(publicDay.cycle_day) || publicDay.cycle_day < 1) throw new HttpError(422, "cycle_day is invalid");
  return {
    day_number: publicDay.cycle_day,
    weekday: publicDay.day_of_week,
    breakfast: mealNames(publicDay, ["Breakfast", "Brunch"]),
    lunch: mealNames(publicDay, ["Lunch", "Brunch"]),
    dinner: mealNames(publicDay, ["Dinner"]),
  };
}

async function handleKpnSoluteEvent(req: Request, rawBody: string) {
  const secret = required("KPNSOLUTE_EVENTS_SIGNING_SECRET");
  const verdict = await verifyKpnSoluteWebhook(secret, req.headers, rawBody);
  if (!verdict.ok) throw new HttpError(401, verdict.reason ?? "Invalid webhook signature");

  const event = object(JSON.parse(rawBody), "CloudEvent") as unknown as KpnCloudEvent;
  if (event.specversion !== "1.0" || !event.id || !event.time || !event.tenantid) throw new HttpError(422, "Invalid CloudEvents envelope");
  if (![MENU_DAY_EVENT, MENU_CYCLE_EVENT].includes(event.type)) throw new HttpError(422, `Unsupported event type: ${event.type}`);
  if (!Number.isFinite(Date.parse(event.time))) throw new HttpError(422, "CloudEvent time is invalid");

  const orgSlug = tenantOrgSlug(event.tenantid);
  const v2 = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const orgId = await resolveOrgId(v2, orgSlug);
  const eventData = object(event.data, "CloudEvent data");
  const sourceDays = event.type === MENU_DAY_EVENT ? [eventData] : eventData.days;
  if (!Array.isArray(sourceDays) || sourceDays.length === 0) throw new HttpError(422, "CloudEvent contains no menu days");
  const days = sourceDays.map(normalizeWebhookDay);
  const anchorDate = typeof eventData.anchor_date === "string"
    ? eventData.anchor_date
    : typeof (sourceDays[0] as Record<string, unknown>).anchor_date === "string"
      ? String((sourceDays[0] as Record<string, unknown>).anchor_date)
      : null;

  const { data, error } = await v2.rpc("apply_kpnsolute_menu_event", {
    target_webhook_id: req.headers.get("webhook-id"),
    target_org_id: orgId,
    target_tenant_id: event.tenantid,
    target_source_event_id: event.id,
    target_event_type: event.type,
    target_occurred_at: event.time,
    target_anchor_date: anchorDate,
    target_days: days,
  });
  if (error) throw new Error(`CloudEvents menu projection failed: ${error.message}`);
  const result = data?.[0] ?? {};
  return json(req, {
    accepted: true,
    duplicate: Boolean(result.duplicate),
    cycle_id: result.cycle_id ?? null,
    days_applied: Number(result.days_applied ?? 0),
  }, 202);
}

async function syncMenu(orgSlug: string) {
  const v2 = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const orgId = await resolveOrgId(v2, orgSlug);

  const publicCycle = await fetchPublicMenuCycle();
  if (!publicCycle.days?.length) throw new Error("MJCC public menu API returned no days");

  let { data: cycle } = await v2
    .from("menu_cycles")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!cycle) {
    const { data: created, error: createErr } = await v2
      .from("menu_cycles")
      .insert({ title: "MJCCv1 28-day cycle menu", is_active: true, starts_on: publicCycle.anchor_date, org_id: orgId })
      .select("id")
      .single();
    if (createErr) throw new Error(`menu_cycles insert failed: ${createErr.message}`);
    cycle = created;
  }

  const rows = publicCycle.days.map((day) => ({
    cycle_id: cycle.id,
    day_number: day.cycle_day,
    weekday: day.day_of_week,
    breakfast: mealNames(day, ["Breakfast", "Brunch"]),
    lunch: mealNames(day, ["Lunch", "Brunch"]),
    dinner: mealNames(day, ["Dinner"]),
    org_id: orgId,
  }));

  const { error: upsertErr } = await v2.from("menu_cycle_days").upsert(rows, { onConflict: "cycle_id,day_number" });
  if (upsertErr) throw new Error(`menu_cycle_days upsert failed: ${upsertErr.message}`);

  const syncedAt = new Date().toISOString();
  const { error: stampErr } = await v2
    .from("menu_cycles")
    .update({ starts_on: publicCycle.anchor_date, version_label: `MJCC public API sync ${publicCycle.anchor_date}`, updated_at: syncedAt })
    .eq("id", cycle.id);
  if (stampErr) throw new Error(`menu_cycles sync stamp failed: ${stampErr.message}`);

  return { cycle_id: cycle.id, days_synced: rows.length, source_anchor_date: publicCycle.anchor_date, synced_at: syncedAt };
}

async function syncFeedback(orgSlug: string) {
  const v1 = createClient(required("MJCCV1_URL"), required("MJCCV1_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const v2 = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const orgId = await resolveOrgId(v2, orgSlug);

  const { data: cycle } = await v2
    .from("menu_cycles")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!cycle) throw new Error(`No active menu_cycles row for ${orgSlug}. Run the menu sync first.`);

  const { data: days, error: daysErr } = await v2
    .from("menu_cycle_days")
    .select("day_number, lunch, dinner")
    .eq("cycle_id", cycle.id);
  if (daysErr) throw new Error(`menu_cycle_days read failed: ${daysErr.message}`);

  // dish name -> {cycle_day, slot}, built from the synced menu content so the
  // rating aggregation below can map response_ratings rows back to a day+slot.
  const dishLocation = new Map<string, { cycle_day: number; slot: string }>();
  for (const d of days ?? []) {
    const lunch = Array.isArray(d.lunch) ? d.lunch.map(String) : [];
    const dinner = Array.isArray(d.dinner) ? d.dinner.map(String) : [];
    if (lunch[0]) dishLocation.set(lunch[0], { cycle_day: d.day_number, slot: "lunchEntree" });
    if (lunch[1]) dishLocation.set(lunch[1], { cycle_day: d.day_number, slot: "lunchAlt" });
    if (dinner[0]) dishLocation.set(dinner[0], { cycle_day: d.day_number, slot: "dinnerEntree" });
    if (dinner[1]) dishLocation.set(dinner[1], { cycle_day: d.day_number, slot: "dinnerAlt" });
  }

  // response_ratings is the richer, per-day-slot source (dish_ratings has no day context).
  const { data: ratings, error: ratingsErr } = await v2
    .from("response_ratings")
    .select("dish_name, slot, rating")
    .in("slot", ["lunchEntree", "lunchAlt", "dinnerEntree", "dinnerAlt"]);
  if (ratingsErr) throw new Error(`response_ratings read failed: ${ratingsErr.message}`);

  const agg = new Map<string, { cycle_day: number; slot: string; dish_name: string; sum: number; count: number }>();
  for (const r of ratings ?? []) {
    const loc = dishLocation.get(r.dish_name);
    if (!loc || loc.slot !== r.slot) continue; // only trust ratings whose slot matches where the dish actually is
    const key = `${loc.cycle_day}:${loc.slot}`;
    const cur = agg.get(key) ?? { cycle_day: loc.cycle_day, slot: loc.slot, dish_name: r.dish_name, sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    agg.set(key, cur);
  }

  const summaryRows = [...agg.values()].map((a) => ({
    cycle_day: a.cycle_day,
    slot: a.slot,
    dish_name: a.dish_name,
    avg_rating: Math.round((a.sum / a.count) * 100) / 100,
    response_count: a.count,
    updated_at: new Date().toISOString(),
  }));

  if (summaryRows.length) {
    const { error: pushErr } = await v1
      .from("menu_feedback_summary")
      .upsert(summaryRows, { onConflict: "cycle_day,slot" });
    if (pushErr) throw new Error(`menu_feedback_summary upsert failed: ${pushErr.message}`);
  }

  return { rows_pushed: summaryRows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (req.headers.has("webhook-id")) {
    try {
      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_CLOUDEVENT_BYTES) {
        return json(req, { error: `CloudEvent exceeds ${MAX_CLOUDEVENT_BYTES} bytes` }, 413);
      }
      return await handleKpnSoluteEvent(req, rawBody);
    } catch (e) {
      console.error("kpnsolute_menu_event_failed", e instanceof Error ? e.message : e);
      return json(req, { error: e instanceof Error ? e.message : "CloudEvents menu sync failed" }, e instanceof HttpError ? e.status : 500);
    }
  }
  let action = "sync-menu";
  let orgSlug = DEFAULT_ORG_SLUG;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action) action = String(body.action);
    if (body?.org) orgSlug = String(body.org);
  } catch {
    // no body -> default action
  }

  try {
    const v2 = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    await assertSyncAuthorized(req, v2, orgSlug);
    if (action === "sync-feedback") return json(req, await syncFeedback(orgSlug));
    if (action === "sync-menu") return json(req, await syncMenu(orgSlug));
    return json(req, { error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("menu_sync_failed", action, e instanceof Error ? e.message : e);
    const status = e instanceof HttpError ? e.status : 500;
    return json(req, { error: e instanceof Error ? e.message : "menu-sync failed" }, status);
  }
});
