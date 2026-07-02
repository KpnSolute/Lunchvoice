import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Icon, type IconName } from "../../components/Icon";
import { CYCLE, slotsForDay, weekdayFor } from "../../lib/menu";

// Which cycle day "today" maps to. ponytail: simple deterministic pick from the
// day-of-year so the hero shows a real, stable menu without a schedule table.
function todayCycleDay(): number {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const doy = Math.floor((Date.now() - start.getTime()) / 86400000);
  return (doy % CYCLE.length) + 1;
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

  useEffect(() => {
    if (sessionStorage.getItem("pendingJoinCode")) navigate("/join", { replace: true });
  }, [navigate]);

  const day = todayCycleDay();
  const slots = slotsForDay(day);
  const lunch = slots.find((s) => s.slot === "lunchEntree")?.name;
  const dinner = slots.find((s) => s.slot === "dinnerEntree")?.name;

  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          Today · {weekdayFor(day - 1)} · Day {day}
        </p>
        <h1 className="hero-title">How was the food today?</h1>
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
            <span className="quick-ico"><Icon name={t.icon} size={22} /></span>
            <span className="quick-name">{t.name}</span>
            <span className="quick-sub">{t.sub}</span>
          </button>
        ))}
      </div>
    </>
  );
}
