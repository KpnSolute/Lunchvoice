import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Icon, type IconName } from "../../components/Icon";
import { CYCLE, slotsForDay, weekdayFor } from "../../lib/menu";
import { supabase } from "../../lib/supabase";
import type { MenuCycleDay } from "../../types/db";

// Which cycle day "today" maps to. ponytail: simple deterministic pick from the
// day-of-year so the hero shows a real, stable menu without a schedule table.
function todayCycleDay(): number {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const doy = Math.floor((Date.now() - start.getTime()) / 86400000);
  return (doy % CYCLE.length) + 1;
}

function firstMenuItem(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).find(Boolean) : undefined;
}

const tiles: { to: string; name: string; sub: string; icon: IconName }[] = [
  { to: "/rate", name: "Rate the dishes", sub: "Stars for anything you've tried", icon: "star" },
  { to: "/surveys", name: "Surveys", sub: "Join with a code, earn points", icon: "survey" },
  { to: "/store", name: "Store", sub: "Spend your points", icon: "store" },
  { to: "/orders", name: "My orders", sub: "Track your pickups", icon: "orders" },
];

export function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [cycleDay, setCycleDay] = useState<MenuCycleDay | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("pendingJoinCode")) navigate("/join", { replace: true });
  }, [navigate]);

  const day = todayCycleDay();

  useEffect(() => {
    (async () => {
      const { data: cycle } = await supabase
        .from("menu_cycles")
        .select("id")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cycle) return;
      const { data } = await supabase
        .from("menu_cycle_days")
        .select("*")
        .eq("cycle_id", cycle.id)
        .eq("day_number", day)
        .maybeSingle();
      setCycleDay((data ?? null) as MenuCycleDay | null);
    })();
  }, [day]);

  const slots = slotsForDay(day);
  const lunch = firstMenuItem(cycleDay?.lunch) ?? slots.find((s) => s.slot === "lunchEntree")?.name;
  const dinner = firstMenuItem(cycleDay?.dinner) ?? slots.find((s) => s.slot === "dinnerEntree")?.name;
  const weekday = cycleDay?.weekday || weekdayFor(day - 1);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">On the menu today</p>
        <h1 className="hero-title">
          {weekday} · Day {day}
        </h1>
        <div className="hero-meal">
          <div className="lbl">Lunch</div>
          <div className="val">{lunch}</div>
        </div>
        <div className="hero-meal">
          <div className="lbl">Dinner</div>
          <div className="val">{dinner}</div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => navigate(`/rate?day=${day}`)}>
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
          <button key={t.to} className="quick-card" onClick={() => navigate(t.to)}>
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
