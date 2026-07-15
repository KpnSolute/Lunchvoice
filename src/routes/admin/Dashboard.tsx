import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Bars, TrendLine, dailyTrend, shortDay } from "../../components/charts";
import { getPublicMenuStats, type PublicMenuStat } from "../../lib/mjccMenuApi";
import { supabase } from "../../lib/supabase";
import type { DishStat } from "../../types/db";

const TREND_DAYS = 14;
const TOP_IDEA_LIMIT = 12;

type IdeaRow = { idea: string; submitted_at: string; source: string };
type TopIdea = IdeaRow & { count: number; sources: string[] };
type SurveyIdeaAnswer = {
  value: unknown;
  created_at: string;
  survey_questions: { category: string | null } | null;
};

function ideaText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ");
  return "";
}

function rankIdeas(rows: IdeaRow[]): TopIdea[] {
  const grouped = new Map<string, TopIdea>();
  for (const row of rows) {
    const idea = row.idea.trim().replace(/\s+/g, " ");
    if (!idea) continue;
    const key = idea.toLocaleLowerCase();
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...row, idea, count: 1, sources: [row.source] });
      continue;
    }
    current.count += 1;
    if (!current.sources.includes(row.source)) current.sources.push(row.source);
    if (Date.parse(row.submitted_at) > Date.parse(current.submitted_at)) {
      current.idea = idea;
      current.submitted_at = row.submitted_at;
      current.source = row.source;
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
    .slice(0, TOP_IDEA_LIMIT);
}

export function Dashboard() {
  const [stats, setStats] = useState<DishStat[]>([]);
  const [externalTopMeals, setExternalTopMeals] = useState<PublicMenuStat[]>([]);
  const [ideas, setIdeas] = useState<TopIdea[]>([]);
  const [counts, setCounts] = useState({ responses: 0, voices: 0, reviews: 0, ideas: 0, orders: 0, pendingOrders: 0 });
  const [recentResponseTimes, setRecentResponseTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
      const since = new Date();
      since.setDate(since.getDate() - (TREND_DAYS - 1));
      since.setHours(0, 0, 0, 0);
      const [{ data: ds }, { data: responseIdeas }, surveyIdeaAnswers, voiceIdeas, respCount, voiceCount, reviewCount, ideaCount, orderRows, recentResp] = await Promise.all([
        supabase.from("dish_stats").select("*"),
        supabase.from("responses").select("idea, submitted_at").not("idea", "is", null).order("submitted_at", { ascending: false }).limit(500),
        supabase
          .from("survey_answers")
          .select("value, created_at, survey_questions!survey_answers_question_id_fkey(category)")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("voice_notes").select("body, created_at").eq("status", "visible").eq("kind", "idea").order("created_at", { ascending: false }).limit(500),
        supabase.from("responses").select("id", { count: "exact", head: true }),
        supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible"),
        supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible").eq("kind", "review"),
        supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible").eq("kind", "idea"),
        supabase.from("orders").select("status"),
        supabase.from("responses").select("submitted_at").gte("submitted_at", since.toISOString()).limit(2000),
      ]);
      setStats(ds ?? []);
      const mergedIdeas: IdeaRow[] = [
        ...((responseIdeas ?? []) as { idea: string; submitted_at: string }[]).map((item) => ({ ...item, source: "Survey" })),
        ...((surveyIdeaAnswers.data ?? []) as unknown as SurveyIdeaAnswer[])
          .filter((item) => item.survey_questions?.category?.toLocaleLowerCase() === "ideas")
          .map((item) => ({ idea: ideaText(item.value), submitted_at: item.created_at, source: "Survey" })),
        ...((voiceIdeas.data ?? []) as { body: string; created_at: string }[]).map((item) => ({ idea: item.body, submitted_at: item.created_at, source: "Student Voice" })),
      ];
      setIdeas(rankIdeas(mergedIdeas));
      setRecentResponseTimes(((recentResp.data ?? []) as { submitted_at: string }[]).map((r) => r.submitted_at));
      const orders = orderRows.data ?? [];
      setCounts({
        responses: respCount.count ?? 0,
        voices: voiceCount.count ?? 0,
        reviews: reviewCount.count ?? 0,
        ideas: ideaCount.count ?? 0,
        orders: orders.length,
        pendingOrders: orders.filter((o) => o.status === "pending").length,
      });
      setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-dashboard-feedback")
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "survey_answers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_notes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    const timer = window.setInterval(load, 5000);
    const refresh = () => load();
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    getPublicMenuStats(8)
      .then((externalStats) => setExternalTopMeals(externalStats?.top_meals ?? []))
      .catch((e) => console.warn("mjcc_public_menu_stats_failed", e));
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
      <div className="manager-grid">
        {[
          ["Responses", counts.responses],
          ["Student voices", counts.voices],
          ["Voice reviews", counts.reviews],
          ["Voice ideas", counts.ideas],
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
        <h2>Top dish ideas</h2>
        <p className="hint">Most-requested ideas from surveys and Student Voice.</p>
        {ideas.length === 0 ? (
          <p className="muted">No ideas submitted yet.</p>
        ) : (
          <div className="idea-cloud">
            {ideas.map((idea) => (
              <span
                key={idea.idea.toLocaleLowerCase()}
                className="idea-bubble"
                title={`${idea.count} mention${idea.count === 1 ? "" : "s"} · ${idea.sources.join(" + ")} · latest ${new Date(idea.submitted_at).toLocaleDateString()}`}
              >
                <Icon name="bulb" size={15} />
                <span>{idea.idea}</span>
                {idea.count > 1 && <b>{idea.count}</b>}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
