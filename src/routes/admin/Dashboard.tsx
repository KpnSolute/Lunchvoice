import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { getPublicMenuStats, type PublicMenuStat } from "../../lib/mjccMenuApi";
import { supabase } from "../../lib/supabase";
import type { DishStat } from "../../types/db";

export function Dashboard() {
  const [stats, setStats] = useState<DishStat[]>([]);
  const [externalTopMeals, setExternalTopMeals] = useState<PublicMenuStat[]>([]);
  const [ideas, setIdeas] = useState<{ idea: string; submitted_at: string }[]>([]);
  const [counts, setCounts] = useState({ responses: 0, orders: 0, pendingOrders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ds }, { data: id }, respCount, orderRows, externalStats] = await Promise.all([
        supabase.from("dish_stats").select("*"),
        supabase.from("responses").select("idea, submitted_at").not("idea", "is", null).order("submitted_at", { ascending: false }).limit(30),
        supabase.from("responses").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("status"),
        getPublicMenuStats(8).catch((e) => {
          console.warn("mjcc_public_menu_stats_failed", e);
          return null;
        }),
      ]);
      setStats(ds ?? []);
      setExternalTopMeals(externalStats?.top_meals ?? []);
      setIdeas((id ?? []) as { idea: string; submitted_at: string }[]);
      const orders = orderRows.data ?? [];
      setCounts({
        responses: respCount.count ?? 0,
        orders: orders.length,
        pendingOrders: orders.filter((o) => o.status === "pending").length,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="card muted">Loading dashboard...</div>;

  return (
    <>
      <div className="row2" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 16 }}>
        {[
          ["Responses", counts.responses],
          ["Orders", counts.orders],
          ["Pending pickups", counts.pendingOrders],
        ].map(([label, n]) => (
          <div key={label} className="card center" style={{ margin: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: "-0.02em", fontSize: 34, color: "var(--accent)" }}>{n}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>{String(label).toUpperCase()}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>KPN compute feed</h2>
        <p className="hint">Most-voted meals received from MJCC public menu stats.</p>
        {externalTopMeals.length === 0 ? (
          <p className="muted">No KPN feedback rows yet.</p>
        ) : (
          externalTopMeals.map((s) => (
            <div key={`${s.cycle_day}-${s.slot}-${s.dish_name}`} className="stat-row">
              <span>
                {s.dish_name} <span className="muted mono" style={{ fontSize: 11 }}>Day {s.cycle_day} {s.slot}</span>
              </span>
              <span className="avg"><Icon name="star-fill" size={13} /> {Number(s.avg_rating ?? 0).toFixed(1)} &middot; {s.response_count} votes</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Dish ratings</h2>
        <p className="hint">Average forks per dish across Lunch Voice responses.</p>
        {stats.length === 0 ? (
          <p className="muted">No ratings yet.</p>
        ) : (
          stats.map((s) => (
            <div key={`${s.dish_name}-${s.slot}`} className="stat-row">
              <span>{s.dish_name} <span className="muted mono" style={{ fontSize: 11 }}>{s.slot}</span></span>
              <span className="avg"><Icon name="star-fill" size={13} /> {Number(s.avg_rating).toFixed(1)} &middot; {s.votes} votes</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Latest dish ideas</h2>
        {ideas.length === 0 ? (
          <p className="muted">No ideas submitted yet.</p>
        ) : (
          ideas.map((i, idx) => (
            <div key={idx} className="item-row">
              <div className="item-name row" style={{ fontWeight: 400, alignItems: "flex-start", gap: 8 }}><Icon name="bulb" size={16} className="muted" /> {i.idea}</div>
              <span className="muted mono" style={{ fontSize: 11 }}>{new Date(i.submitted_at).toLocaleDateString()}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
