import { useEffect, useMemo, useState } from "react";
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
  const [posts, setPosts] = useState<VoicePost[]>([]);
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

  async function load() {
    const { data, error } = await supabase
      .from("voice_notes")
      .select("id, kind, body, created_at, menu_day, dish_name, meal_period")
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setErr(error.message);
      return;
    }
    setPosts((data ?? []) as VoicePost[]);
  }

  useEffect(() => {
    load();
    getPublicMenuToday()
      .then(setToday)
      .catch((e) => console.warn("voice_public_menu_today_failed", e));
  }, []);

  async function post() {
    const text = body.trim();
    setErr("");
    setOk("");
    if (text.length < 6) {
      setErr("Write a little more so the review is useful.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("voice_notes").insert({
      kind,
      body: text,
      dish_name: dishName || null,
      menu_day: day,
      meal_period: dishName ? "Meal" : null,
      org_id: org!.id,
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
        <div className="spread">
          <h2>Meal talk</h2>
          <span className="points-badge">{posts.length} posts</span>
        </div>
        {posts.length === 0 ? (
          <p className="muted">No reviews yet. Start the wall.</p>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="item-row">
              <div className="item-name" style={{ fontWeight: 400, fontSize: 14 }}>
                {p.body}
                <small>
                  Anonymous student
                  {p.dish_name ? ` · ${p.dish_name}` : ""}
                  {p.menu_day ? ` · Day ${p.menu_day}` : ""}
                  {` · ${new Date(p.created_at).toLocaleDateString()}`}
                </small>
              </div>
              <span className={`pill ${p.kind === "idea" ? "ready" : "pending"}`}>{p.kind}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
