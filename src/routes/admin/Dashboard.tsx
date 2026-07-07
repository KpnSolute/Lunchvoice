import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Bars, TrendLine, dailyTrend, shortDay } from "../../components/charts";
import { getPublicMenuStats, type PublicMenuStat } from "../../lib/mjccMenuApi";
import { supabase } from "../../lib/supabase";
import type { DishStat } from "../../types/db";

const TREND_DAYS = 14;

export function Dashboard() {
  const [stats, setStats] = useState<DishStat[]>([]);
  const [externalTopMeals, setExternalTopMeals] = useState<PublicMenuStat[]>([]);
  const [ideas, setIdeas] = useState<{ idea: string; submitted_at: string }[]>([]);
  const [counts, setCounts] = useState({ responses: 0, orders: 0, pendingOrders: 0 });
  const [recentResponseTimes, setRecentResponseTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - (TREND_DAYS - 1));
      since.setHours(0, 0, 0, 0);
      const [{ data: ds }, { data: id }, respCount, orderRows, externalStats, recentResp] = await Promise.all([
        supabase.from("dish_stats").select("*"),
        supabase.from("responses").select("idea, submitted_at").not("idea", "is", null).order("submitted_at", { ascending: false }).limit(30),
        supabase.from("responses").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("status"),
        getPublicMenuStats(8).catch((e) => {
          console.warn("mjcc_public_menu_stats_failed", e);
          return null;
        }),
        supabase.from("responses").select("submitted_at").gte("submitted_at", since.toISOString()).limit(2000),
      ]);
      setStats(ds ?? []);
      setExternalTopMeals(externalStats?.top_meals ?? []);
      setIdeas((id ?? []) as { idea: string; submitted_at: string }[]);
      setRecentResponseTimes(((recentResp.data ?? []) as { submitted_at: string }[]).map((r) => r.submitted_at));
      const orders = orderRows.data ?? [];
      setCounts({
        responses: respCount.count ?? 0,
        orders: orders.length,
        pendingOrders: orders.filter((o) => o.status === "pending").length,
      });
      setLoading(false);
    })();
  }, []);

  const trend = useMemo(() => dailyTrend(recentResponseTimes, TREND_DAYS), [recentResponseTimes]);
  const topDishes = useMemo(
    () =>
      [...stats]
        .sort((a, b) => Number(b.avg_rating) - Number(a.avg_rating))
        .slice(0, 12)
        .map((s) => ({
          label: s.dish_name ?? "Unknown dish",
          value: Number(Number(s.avg_rating).toFixed(1)),
          hint: `${s.slot} · ${s.votes} vote${s.votes === 1 ? "" : "s"}`,
        })),
    [stats]
  );

  if (loading) return <div className="card muted">Loading dashboard...</div>;

  return (
    <>
      <div className="manager-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          ["Responses", counts.responses],
          ["Orders", counts.orders],
          ["Pending pickups", counts.pendingOrders],
        ].map(([label, n]) => (
          <div key={label} className="metric-tile">
            <div className="num">{n}</div>
            <div className="lbl">{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Responses — last {TREND_DAYS} days</h2>
        <p className="hint">Survey submissions per day across all sessions.</p>
        <TrendLine points={trend} formatLabel={shortDay} />
      </div>

      <div className="card">
        <h2>Top dish ratings</h2>
        <p className="hint">Average forks per dish (1–5) across Lunch Voice responses.</p>
        {topDishes.length === 0 ? <p className="muted">No ratings yet.</p> : (
          <Bars items={topDishes} max={5} format={(v) => v.toFixed(1)} />
        )}
      </div>

      <div className="card">
        <h2>KPN compute feed</h2>
        <p className="hint">Most-voted meals received from MJCC public menu stats.</p>
        {externalTopMeals.length === 0 ? <p className="muted">No KPN feedback rows yet.</p> : (
          <Bars
            max={5}
            format={(v) => v.toFixed(1)}
            items={externalTopMeals.map((s) => ({
              label: s.dish_name,
              value: Number(Number(s.avg_rating ?? 0).toFixed(1)),
              hint: `Day ${s.cycle_day} ${s.slot} · ${s.response_count} votes`,
            }))}
          />
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
