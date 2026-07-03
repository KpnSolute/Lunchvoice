// menu-sync: bridges MJCCv1 (source of truth for the cafeteria menu) into
// LunchVoice's own menu_cycles/menu_cycle_days tables, and pushes LunchVoice's
// rating aggregates back into MJCCv1's menu_feedback_summary.
//
// verify_jwt: false — matches this project's other internal-bridge functions
// (staff-login, login-start). It reads/writes with the service-role key itself,
// so JWT verification on the incoming request adds no real protection; anyone
// scripting this without a Supabase session (e.g. a Render cron hitting it on
// a schedule, see report) should be able to call it directly.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LION_CAFE_ORG_ID = "150d0e42-7ddd-4180-868e-954f202d272c";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL: Record<string, string> = {
  Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday",
};

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function parseItems(raw: unknown): string[] {
  if (typeof raw !== "string") return Array.isArray(raw) ? raw.map(String) : [];
  if (!raw.startsWith("[")) return [raw].filter(Boolean);
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

type Entry = { day_of_week: string; week_number: number; meal_type: string; items: unknown };

// Fold MJCCv1's per-meal rows for one day into LunchVoice's breakfast/lunch/dinner shape.
// Weekdays: Breakfast -> breakfast, Lunch -> lunch, Dinner -> dinner, Snack dropped
//   (Snack is always the same 4 staples already hardcoded client-side in STAPLES).
// Weekend days: no separate Breakfast/Lunch row, just one combined "Brunch" row —
//   its first 4 items are the same staples (breakfast), the rest are the day's
//   lunch dishes. Verified against MJCCv1 day1 Brunch data: last 2 of 6 items
//   ("Char Sui Pork", "Chef's Choice") match CYCLE[0]'s lunchEntree/lunchAlt exactly.
function foldDay(entries: Entry[]): { breakfast: string[]; lunch: string[]; dinner: string[] } {
  const by = Object.fromEntries(entries.map((e) => [e.meal_type, parseItems(e.items)]));
  if (by["Brunch"]) {
    const brunch = by["Brunch"];
    return { breakfast: brunch.slice(0, 4), lunch: brunch.slice(4), dinner: by["Dinner"] ?? [] };
  }
  return { breakfast: by["Breakfast"] ?? [], lunch: by["Lunch"] ?? [], dinner: by["Dinner"] ?? [] };
}

async function syncMenu() {
  const v1 = createClient(required("MJCCV1_URL"), required("MJCCV1_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const v2 = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: entries, error: entriesErr } = await v1
    .from("menu_entries")
    .select("cycle_id, day_of_week, week_number, meal_type, items")
    .order("week_number")
    .limit(1000);
  if (entriesErr) throw new Error(`menu_entries read failed: ${entriesErr.message}`);
  if (!entries?.length) throw new Error("MJCCv1 menu_entries returned no rows");

  const activeCycleId = entries[0].cycle_id;
  const active = entries.filter((e) => e.cycle_id === activeCycleId);

  let { data: cycle } = await v2
    .from("menu_cycles")
    .select("id")
    .eq("org_id", LION_CAFE_ORG_ID)
    .eq("is_active", true)
    .maybeSingle();
  if (!cycle) {
    const { data: created, error: createErr } = await v2
      .from("menu_cycles")
      .insert({ title: "MJCCv1 28-day cycle menu", is_active: true, org_id: LION_CAFE_ORG_ID })
      .select("id")
      .single();
    if (createErr) throw new Error(`menu_cycles insert failed: ${createErr.message}`);
    cycle = created;
  }

  // day_number 1-28, day1 = Sunday of week1 (LunchVoice's numbering, per task spec).
  const rows = [];
  for (let week = 1; week <= 4; week++) {
    for (let d = 0; d < 7; d++) {
      const dow = WEEKDAYS[d];
      const dayEntries = active.filter((e) => e.week_number === week && e.day_of_week === dow);
      const { breakfast, lunch, dinner } = foldDay(dayEntries);
      rows.push({
        cycle_id: cycle.id,
        day_number: (week - 1) * 7 + d + 1,
        weekday: WEEKDAY_FULL[dow],
        breakfast,
        lunch,
        dinner,
        org_id: LION_CAFE_ORG_ID,
      });
    }
  }

  const { error: upsertErr } = await v2.from("menu_cycle_days").upsert(rows, { onConflict: "cycle_id,day_number" });
  if (upsertErr) throw new Error(`menu_cycle_days upsert failed: ${upsertErr.message}`);

  return { cycle_id: cycle.id, days_synced: rows.length };
}

async function syncFeedback() {
  const v1 = createClient(required("MJCCV1_URL"), required("MJCCV1_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const v2 = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: cycle } = await v2
    .from("menu_cycles")
    .select("id")
    .eq("org_id", LION_CAFE_ORG_ID)
    .eq("is_active", true)
    .maybeSingle();
  if (!cycle) throw new Error("No active menu_cycles row for LionCafe — run the menu sync first");

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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let action = "sync-menu";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action) action = String(body.action);
  } catch {
    // no body -> default action
  }

  try {
    if (action === "sync-feedback") return json(await syncFeedback());
    if (action === "sync-menu") return json(await syncMenu());
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("menu_sync_failed", action, e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "menu-sync failed" }, 500);
  }
});
