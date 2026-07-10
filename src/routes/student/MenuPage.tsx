import { useEffect, useState } from "react";
import { STAPLES } from "../../lib/menu";
import { getPublicMenuCycle, getPublicMenuToday, type PublicMenuCycle, type PublicMenuDay } from "../../lib/mjccMenuApi";
import {
  displayDaysFromApi,
  displayDaysFromCycle,
  displayDaysFromStatic,
  formatMenuDate,
  groupMenuWeeks,
  type DisplayMenuDay,
} from "../../lib/menuDisplay";
import { supabase } from "../../lib/supabase";
import type { MenuCycle, MenuCycleDay } from "../../types/db";

type ActiveCycle = MenuCycle & { days: MenuCycleDay[] };

function MealList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="menu-meal-block">
      <div className="meal-tag">{label}</div>
      {items.length ? (
        <ul className="menu-item-list">
          {items.map((item, index) => <li key={`${label}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <div className="menu-empty">No items scheduled</div>
      )}
    </div>
  );
}

export function MenuPage() {
  const [active, setActive] = useState<ActiveCycle | null>(null);
  const [apiCycle, setApiCycle] = useState<PublicMenuCycle | null>(null);
  const [apiToday, setApiToday] = useState<PublicMenuDay | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cycle, today] = await Promise.all([getPublicMenuCycle(true), getPublicMenuToday()]);
        setApiCycle(cycle);
        setApiToday(today);
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

  const days: DisplayMenuDay[] = apiCycle?.days.length
    ? displayDaysFromApi(apiCycle)
    : active?.days.length
      ? displayDaysFromCycle(active)
      : displayDaysFromStatic();
  const todayCycleDay = apiToday?.cycle_day;
  const weeks = groupMenuWeeks(days);

  return (
    <>
      <div className="page-head">
        <h2>Cycle menu</h2>
        <p className="hint">
          {apiCycle
            ? `Live MJCC API cycle anchored ${formatMenuDate(apiCycle.anchor_date) || apiCycle.anchor_date}`
            : active
              ? `${active.title}${active.starts_on ? ` - anchored ${formatMenuDate(active.starts_on)}` : ""}`
              : "Fallback cycle shown until the live menu feed is available."}
        </p>
      </div>

      <div className="menu-staples">
        <div>
          <div className="eyebrow">Everyday staples</div>
          <h2>Always available</h2>
        </div>
        <div className="staple-row">
          {STAPLES.map((s) => <span key={s.name} className="staple-chip">{s.name}</span>)}
        </div>
      </div>

      {weeks.map((week) => (
        <section key={week[0]?.cycleWeek} className="menu-week">
          <div className="menu-week-head">
            <div>
              <span className="eyebrow">Week {week[0]?.cycleWeek}</span>
              <h2>Days {week[0]?.cycleDay}-{week[week.length - 1]?.cycleDay}</h2>
            </div>
            <span>{week[0]?.date ? `${formatMenuDate(week[0].date)} - ${formatMenuDate(week[week.length - 1].date)}` : "28-day rotation"}</span>
          </div>
          <div className="menu-grid">
            {week.map((day) => (
              <article key={day.key} className={`menu-day ${day.cycleDay === todayCycleDay ? "is-today" : ""}`}>
                <div className="menu-day-head">
                  <div>
                    <div className="cat-label">Day {day.cycleDay}</div>
                    <h3>{day.weekday}</h3>
                    {day.date && <span>{formatMenuDate(day.date)}</span>}
                  </div>
                  {day.cycleDay === todayCycleDay && <span className="pill ready">today</span>}
                </div>
                <MealList label="Breakfast" items={day.breakfast} />
                <MealList label="Lunch" items={day.lunch} />
                <MealList label="Dinner" items={day.dinner} />
                {day.feedback?.length ? (
                  <div className="menu-top-rated">
                    <span>Top rated</span>
                    <b>{day.feedback[0].dish_name}</b>
                    <small>{Number(day.feedback[0].avg_rating ?? 0).toFixed(1)} rating / {day.feedback[0].response_count} votes</small>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
