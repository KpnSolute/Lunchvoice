import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Icon, type IconName } from "../../components/Icon";
import { CYCLE, slotsForDay, weekdayFor } from "../../lib/menu";
import { getPublicMenuToday, type PublicMenuDay } from "../../lib/mjccMenuApi";
import {
  currentMealPeriod,
  formatMenuDate,
  mealItemsForPeriod,
  type DisplayMenuDay,
} from "../../lib/menuDisplay";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";
import type { MenuCycleDay } from "../../types/db";

function todayCycleDay(): number {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const doy = Math.floor((Date.now() - start.getTime()) / 86400000);
  return (doy % CYCLE.length) + 1;
}

function cycleDayFromAnchor(anchorDate: string | null | undefined): number | null {
  if (!anchorDate) return null;
  const anchor = new Date(`${anchorDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  anchor.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - anchor.getTime()) / 86400000);
  if (diff < 0) return 1;
  return (diff % CYCLE.length) + 1;
}

function firstMenuItem(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).find(Boolean) : undefined;
}

function apiDisplayDay(day: PublicMenuDay | null): DisplayMenuDay | null {
  if (!day) return null;
  return {
    key: `api-${day.cycle_day}`,
    cycleDay: day.cycle_day,
    cycleWeek: day.cycle_week ?? Math.ceil(day.cycle_day / 7),
    weekday: day.day_of_week,
    date: day.date,
    breakfast: (day.meals.Breakfast ?? day.meals.Brunch ?? []).map((slot) => slot.item_name).filter(Boolean),
    lunch: (day.meals.Lunch ?? day.meals.Brunch ?? []).map((slot) => slot.item_name).filter(Boolean),
    dinner: (day.meals.Dinner ?? []).map((slot) => slot.item_name).filter(Boolean),
  };
}

const tiles: { to: string; name: string; sub: string; icon: IconName }[] = [
  { to: "rate", name: "Rate the dishes", sub: "Stars for anything you've tried", icon: "star" },
  { to: "surveys", name: "Surveys", sub: "Join with a code, earn points", icon: "survey" },
  { to: "store", name: "Store", sub: "Spend your points", icon: "store" },
  { to: "orders", name: "My orders", sub: "Track your pickups", icon: "orders" },
];

export function Home() {
  const { profile } = useAuth();
  const { org } = useOrg();
  const navigate = useNavigate();
  const [cycleDay, setCycleDay] = useState<MenuCycleDay | null>(null);
  const [apiDay, setApiDay] = useState<PublicMenuDay | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("pendingJoinCode")) navigate(`/${org.slug}/join`, { replace: true });
  }, [navigate, org.slug]);

  const day = todayCycleDay();

  useEffect(() => {
    (async () => {
      try {
        setApiDay(await getPublicMenuToday());
        return;
      } catch (e) {
        console.warn("mjcc_public_menu_today_failed", e);
      }

      const { data: cycle } = await supabase
        .from("menu_cycles")
        .select("id, starts_on")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cycle) return;

      const queryDay = cycleDayFromAnchor(cycle.starts_on) ?? day;
      const { data } = await supabase
        .from("menu_cycle_days")
        .select("*")
        .eq("cycle_id", cycle.id)
        .eq("day_number", queryDay)
        .maybeSingle();
      setCycleDay((data ?? null) as MenuCycleDay | null);
    })();
  }, [day]);

  const slots = slotsForDay(day);
  const displayDay = apiDay?.cycle_day ?? cycleDay?.day_number ?? day;
  const displayMenuDay =
    apiDisplayDay(apiDay) ??
    (cycleDay
      ? {
          key: cycleDay.id,
          cycleDay: cycleDay.day_number,
          cycleWeek: Math.ceil(cycleDay.day_number / 7),
          weekday: cycleDay.weekday || weekdayFor(day - 1),
          breakfast: Array.isArray(cycleDay.breakfast) ? cycleDay.breakfast.map(String).filter(Boolean) : [],
          lunch: Array.isArray(cycleDay.lunch) ? cycleDay.lunch.map(String).filter(Boolean) : [],
          dinner: Array.isArray(cycleDay.dinner) ? cycleDay.dinner.map(String).filter(Boolean) : [],
        }
      : {
          key: `static-${day}`,
          cycleDay: day,
          cycleWeek: Math.ceil(day / 7),
          weekday: weekdayFor(day - 1),
          breakfast: [],
          lunch: [slots.find((s) => s.slot === "lunchEntree")?.name, slots.find((s) => s.slot === "lunchAlt")?.name].filter(Boolean) as string[],
          dinner: [slots.find((s) => s.slot === "dinnerEntree")?.name, slots.find((s) => s.slot === "dinnerAlt")?.name].filter(Boolean) as string[],
        });
  const mealNow = currentMealPeriod();
  let mealItems = mealItemsForPeriod(displayMenuDay, mealNow.period.key);
  if (!mealItems.length && mealNow.period.key === "breakfast") mealItems = displayMenuDay.breakfast.length ? displayMenuDay.breakfast : displayMenuDay.lunch;
  const lunch = firstMenuItem(displayMenuDay.lunch);
  const dinner = firstMenuItem(displayMenuDay.dinner);
  const weekday = apiDay?.day_of_week || cycleDay?.weekday || weekdayFor(day - 1);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">On the menu today</p>
        <h1 className="hero-title">
          {weekday} &middot; Day {displayDay}
        </h1>
        {apiDay?.date && <p className="hero-date">{formatMenuDate(apiDay.date)}</p>}
        <div className="hero-meal hero-meal-live">
          <div className="lbl">{mealNow.status} &middot; {mealNow.period.hours}</div>
          <div className="val">{mealNow.period.label}</div>
          <ul className="hero-menu-list">
            {mealItems.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
            {!mealItems.length && <li>Menu items are being prepared for this period.</li>}
          </ul>
        </div>
        <div className="today-mini-grid">
          <div className="hero-meal">
            <div className="lbl">Lunch</div>
            <div className="val">{lunch || "No lunch posted"}</div>
          </div>
          <div className="hero-meal">
            <div className="lbl">Dinner</div>
            <div className="val">{dinner || "No dinner posted"}</div>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => navigate(`/${org.slug}/rate?day=${displayDay}`)}>
          Rate today's meals
          <Icon name="arrow" size={18} />
        </button>
      </section>

      <div className="spread" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>
            Hey{profile?.display_name ? `, ${profile.display_name}` : ""}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>Rate dishes and take surveys to earn points.</div>
        </div>
        <div className="center">
          <div className="stat-num">{profile?.points ?? 0}</div>
          <div className="stat-lbl">
            Points
            {profile && profile.streak > 0 && (
              <>
                <Icon name="flame" size={13} /> {profile.streak}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="quick-grid">
        {tiles.map((t) => (
          <button key={t.to} className="quick-card" onClick={() => navigate(`/${org.slug}/${t.to}`)}>
            <span className="arrow-peek"><Icon name="arrow" size={16} /></span>
            <span className="quick-ico"><Icon name={t.icon} size={20} /></span>
            <span className="quick-name">{t.name}</span>
            <span className="quick-sub">{t.sub}</span>
          </button>
        ))}
      </div>
    </>
  );
}
