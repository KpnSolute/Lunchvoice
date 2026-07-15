import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../components/Icon";
import { CYCLE, weekdayFor } from "../../lib/menu";
import { getPublicMenuToday, mealItems, type PublicMenuDay } from "../../lib/mjccMenuApi";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";

type VoicePost = {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  menu_day: number | null;
  dish_name: string | null;
  meal_period: string | null;
};

const kinds = [
  { value: "review", label: "Review" },
  { value: "idea", label: "Idea" },
  { value: "shoutout", label: "Shoutout" },
];

const officialKindLabels: Record<string, string> = {
  announcement: "Announcement",
  bonus: "Prize bonus",
  special: "Menu special",
  event: "MJCC event",
  result: "Survey result",
};

function isOfficial(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(officialKindLabels, kind);
}

function todayCycleDay(): number {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const doy = Math.floor((Date.now() - start.getTime()) / 86400000);
  return (doy % CYCLE.length) + 1;
}

function fallbackDishOptions(day: number): string[] {
  const slots = CYCLE[day - 1] ?? [];
  return slots.map(String).filter(Boolean);
}

export function Voice() {
  const { org } = useOrg();
  const { session } = useAuth();
  const [posts, setPosts] = useState<VoicePost[]>([]);
  const [counts, setCounts] = useState({ total: 0, reviews: 0, ideas: 0, shoutouts: 0 });
  const [today, setToday] = useState<PublicMenuDay | null>(null);
  const [kind, setKind] = useState("review");
  const [dishName, setDishName] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const day = today?.cycle_day ?? todayCycleDay();
  const dishOptions = useMemo(() => {
    const live = mealItems(today, ["Lunch", "Brunch", "Dinner"]);
    return live.length ? live : fallbackDishOptions(day);
  }, [day, today]);

  const load = useCallback(async () => {
    const [feed, total, reviews, ideas, shoutouts] = await Promise.all([
      supabase
        .from("voice_notes")
        .select("id, kind, body, created_at, menu_day, dish_name, meal_period")
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible"),
      supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible").eq("kind", "review"),
      supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible").eq("kind", "idea"),
      supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("status", "visible").eq("kind", "shoutout"),
    ]);
    const error = feed.error ?? total.error ?? reviews.error ?? ideas.error ?? shoutouts.error;
    if (error) {
      setErr(error.message);
      return;
    }
    setPosts((feed.data ?? []) as VoicePost[]);
    setCounts({
      total: total.count ?? 0,
      reviews: reviews.count ?? 0,
      ideas: ideas.count ?? 0,
      shoutouts: shoutouts.count ?? 0,
    });
  }, []);

  useEffect(() => {
    load();
    getPublicMenuToday()
      .then(setToday)
      .catch((e) => console.warn("voice_public_menu_today_failed", e));
    const channel = supabase
      .channel("student-voice-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_notes" }, load)
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

  async function post() {
    const text = body.trim();
    setErr("");
    setOk("");
    if (text.length < 6) {
      setErr("Write a little more so the review is useful.");
      return;
    }
    if (!session?.user || !org) {
      setErr("Your session is not ready. Sign in again and retry.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("voice_notes").insert({
      kind,
      body: text,
      dish_name: dishName || null,
      menu_day: day,
      meal_period: dishName ? "Meal" : null,
      org_id: org.id,
      student_id: session.user.id,
      status: "visible",
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setBody("");
    setDishName("");
    setOk("Posted anonymously.");
    load();
  }

  return (
    <>
      <div className="page-head">
        <h2>Student Voice</h2>
        <p className="hint">A fully anonymous review wall for meals, ideas, and shoutouts.</p>
      </div>

      {ok && <div className="notice ok">{ok}</div>}
      {err && <div className="notice err">{err}</div>}

      <div className="card">
        <div className="spread">
          <div>
            <h2>Post a meal review</h2>
            <p className="hint" style={{ margin: 0 }}>
              {today ? `${today.day_of_week}, Day ${today.cycle_day}` : `${weekdayFor(day - 1)}, Day ${day}`}
            </p>
          </div>
          <span className="anon-pill"><span className="anon-dot" /> Anonymous</span>
        </div>

        <div className="row2" style={{ marginTop: 12 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <select value={dishName} onChange={(e) => setDishName(e.target.value)}>
            <option value="">General cafeteria note</option>
            {dishOptions.map((dish) => <option key={dish} value={dish}>{dish}</option>)}
          </select>
        </div>

        <textarea
          rows={4}
          value={body}
          maxLength={600}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What should other students know? Keep it real, useful, and respectful."
          style={{ marginTop: 12 }}
        />
        <div className="input-help"><span>No names are shown with posts.</span><b>{body.length}/600</b></div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={busy || body.trim().length < 6} onClick={post}>
          <Icon name="voice" size={16} /> {busy ? "Posting..." : "Post anonymously"}
        </button>
      </div>

      <div className="card">
        <div className="manager-grid">
          {[
            ["All voices", counts.total],
            ["Reviews", counts.reviews],
            ["Ideas", counts.ideas],
            ["Shoutouts", counts.shoutouts],
          ].map(([label, value]) => (
            <div key={label} className="metric-tile">
              <div className="num">{value}</div>
              <div className="lbl">{label}</div>
            </div>
          ))}
        </div>
        <div className="spread">
          <h2>Meal talk</h2>
          <span className="points-badge">{counts.total} posts</span>
        </div>
        {posts.length === 0 ? (
          <p className="muted">No reviews yet. Start the wall.</p>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="item-row">
              <div className="item-name" style={{ fontWeight: 400, fontSize: 14 }}>
                {p.body}
                <small>
                  {isOfficial(p.kind) ? "Lunch Voice update" : "Anonymous student"}
                  {p.dish_name ? ` · ${p.dish_name}` : ""}
                  {p.menu_day ? ` · Day ${p.menu_day}` : ""}
                  {` · ${new Date(p.created_at).toLocaleDateString()}`}
                </small>
              </div>
              <span className={`pill ${isOfficial(p.kind) || p.kind === "idea" ? "ready" : "pending"}`}>{officialKindLabels[p.kind] ?? p.kind}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
