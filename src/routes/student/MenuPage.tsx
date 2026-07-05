import { useEffect, useState } from "react";
import { CYCLE, STAPLES, weekdayFor } from "../../lib/menu";
import { getPublicMenuCycle, mealItems, type PublicMenuCycle } from "../../lib/mjccMenuApi";
import { supabase } from "../../lib/supabase";
import type { MenuCycle, MenuCycleDay } from "../../types/db";

type ActiveCycle = MenuCycle & { days: MenuCycleDay[] };

function list(value: unknown): string {
  return Array.isArray(value) ? value.map(String).filter(Boolean).join(" / ") : "";
}

function listApi(day: PublicMenuCycle["days"][number], periods: string[]): string {
  return mealItems(day, periods).join(" / ");
}

export function MenuPage() {
  const [active, setActive] = useState<ActiveCycle | null>(null);
  const [apiCycle, setApiCycle] = useState<PublicMenuCycle | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setApiCycle(await getPublicMenuCycle(true));
        return;
      } catch (e) {
        console.warn("mjcc_public_menu_cycle_failed", e);
      }

      const { data: cycle } = await supabase
        .from("menu_cycles")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cycle) return;
      const { data: days } = await supabase.from("menu_cycle_days").select("*").eq("cycle_id", cycle.id).order("day_number");
      setActive({ ...(cycle as MenuCycle), days: (days ?? []) as MenuCycleDay[] });
    })();
  }, []);

  const hasApiDays = Boolean(apiCycle?.days.length);

  return (
    <>
      <div className="page-head">
        <h2>28-day cycle menu</h2>
        <p className="hint">
          {apiCycle
            ? `Live MJCC API cycle anchored ${apiCycle.anchor_date}`
            : active
              ? `${active.title}${active.version_label ? ` - ${active.version_label}` : ""}`
              : "What's coming up on the line, day by day."}
        </p>
      </div>

      <div className="card">
        <h2>Everyday staples</h2>
        <p className="hint" style={{ margin: 0 }}>{STAPLES.map((s) => s.name).join(" - ")}</p>
      </div>

      <div className="menu-grid">
        {hasApiDays ? apiCycle!.days.map((d) => (
          <div key={d.cycle_day} className="card menu-day">
            <div className="cat-label">Day {d.cycle_day} - {d.day_of_week || weekdayFor(d.cycle_day - 1)}</div>
            <div className="menu-meal"><span className="meal-tag">Breakfast</span> {listApi(d, ["Breakfast"]) || listApi(d, ["Brunch"])}</div>
            <div className="menu-meal"><span className="meal-tag">Lunch</span> {listApi(d, ["Lunch"]) || listApi(d, ["Brunch"])}</div>
            <div className="menu-meal"><span className="meal-tag">Dinner</span> {listApi(d, ["Dinner"])}</div>
            {d.feedback?.length ? (
              <div className="menu-meal">
                <span className="meal-tag">Top rated</span>
                {d.feedback[0].dish_name} ({Number(d.feedback[0].avg_rating ?? 0).toFixed(1)} / {d.feedback[0].response_count} votes)
              </div>
            ) : null}
          </div>
        )) : active?.days.length ? active.days.map((d) => (
          <div key={d.id} className="card menu-day">
            <div className="cat-label">Day {d.day_number} - {d.weekday || weekdayFor(d.day_number - 1)}</div>
            <div className="menu-meal"><span className="meal-tag">Breakfast</span> {list(d.breakfast)}</div>
            <div className="menu-meal"><span className="meal-tag">Lunch</span> {list(d.lunch)}</div>
            <div className="menu-meal"><span className="meal-tag">Dinner</span> {list(d.dinner)}</div>
          </div>
        )) : CYCLE.map(([lunch, lunchAlt, dinner, dinnerAlt], i) => (
          <div key={i} className="card menu-day">
            <div className="cat-label">Day {i + 1} - {weekdayFor(i)}</div>
            <div className="menu-meal"><span className="meal-tag">Lunch</span> {lunch} <span className="muted">or</span> {lunchAlt}</div>
            <div className="menu-meal"><span className="meal-tag">Dinner</span> {dinner} <span className="muted">or</span> {dinnerAlt}</div>
          </div>
        ))}
      </div>
    </>
  );
}
