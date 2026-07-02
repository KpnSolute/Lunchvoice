import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { CYCLE, STAPLES, weekdayFor } from "../../lib/menu";
import type { MenuCycle, MenuCycleDay } from "../../types/db";

type ActiveCycle = MenuCycle & { days: MenuCycleDay[] };

function list(value: unknown): string {
  return Array.isArray(value) ? value.map(String).filter(Boolean).join(" / ") : "";
}

export function MenuPage() {
  const [active, setActive] = useState<ActiveCycle | null>(null);

  useEffect(() => {
    (async () => {
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

  return (
    <>
      <div className="page-head">
        <h2>28-day cycle menu</h2>
        <p className="hint">
          {active ? `${active.title}${active.version_label ? ` - ${active.version_label}` : ""}` : "What's coming up on the line, day by day."}
        </p>
      </div>

      <div className="card">
        <h2>Everyday staples</h2>
        <p className="hint" style={{ margin: 0 }}>{STAPLES.map((s) => s.name).join(" - ")}</p>
      </div>

      <div className="menu-grid">
        {active?.days.length ? active.days.map((d) => (
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
