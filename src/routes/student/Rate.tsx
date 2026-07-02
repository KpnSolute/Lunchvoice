import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Icon } from "../../components/Icon";
import { RATE_CATEGORIES, RATED_DISHES, type RatedDish } from "../../lib/menu";

type Stat = { avg: number; votes: number };

function StarRow({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div className="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? "on" : ""}
          onClick={() => onPick(n)}
          aria-label={`${n} stars`}
        >
          <Icon name={n <= value ? "star-fill" : "star"} size={22} />
        </button>
      ))}
    </div>
  );
}

export function Rate() {
  const [cat, setCat] = useState("All");
  const [mine, setMine] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: my, error: e1 }, { data: st }] = await Promise.all([
        supabase.from("dish_ratings").select("dish_key, rating"),
        supabase.from("dish_rating_stats").select("*"),
      ]);
      if (e1) setErr(e1.message);
      setMine(Object.fromEntries((my ?? []).map((r) => [r.dish_key, r.rating])));
      setStats(
        Object.fromEntries(
          (st ?? []).map((s) => [s.dish_key!, { avg: Number(s.avg_rating ?? 0), votes: s.votes ?? 0 }])
        )
      );
    })();
  }, []);

  async function rate(d: RatedDish, n: number) {
    setErr("");
    const prev = mine[d.key];
    setMine((m) => ({ ...m, [d.key]: n }));
    // keep the shown average honest without a refetch
    setStats((s) => {
      const cur = s[d.key] ?? { avg: 0, votes: 0 };
      const votes = prev ? cur.votes : cur.votes + 1;
      const total = cur.avg * cur.votes - (prev ?? 0) + n;
      return { ...s, [d.key]: { avg: Math.round((total / votes) * 10) / 10, votes } };
    });
    const { error } = await supabase
      .from("dish_ratings")
      .upsert(
        { dish_key: d.key, dish_name: d.name, category: d.category, rating: n, updated_at: new Date().toISOString() },
        { onConflict: "student_id,dish_key" }
      );
    if (error) setErr(error.message);
  }

  const cats = cat === "All" ? RATE_CATEGORIES : [cat];

  return (
    <>
      <div className="page-head">
        <h2>Rate the dishes</h2>
        <p className="hint">Tap the stars for anything you've tried. Rate as many or as few as you like.</p>
      </div>

      <div className="chips">
        {["All", ...RATE_CATEGORIES].map((c) => (
          <button key={c} className={`chip${cat === c ? " active" : ""}`} onClick={() => setCat(c)}>
            {c === "All" ? "All" : c}
          </button>
        ))}
      </div>

      {err && <div className="notice err">{err}</div>}

      {cats.map((c) => (
        <section key={c}>
          <div className="cat-label">{c}</div>
          <div className="dish-grid">
          {RATED_DISHES.filter((d) => d.category === c).map((d) => {
            const my = mine[d.key];
            const st = stats[d.key];
            return (
              <div key={d.key} className="dish-card">
                <div className="dish-info">
                  <div className="dish-name">{d.name}</div>
                  <div className="dish-meta">
                    {my ? `You rated ${my}/5` : null}
                    {my && st ? " · " : null}
                    {st ? `${st.avg} avg${my ? "" : ` · ${st.votes} rating${st.votes === 1 ? "" : "s"}`}` : null}
                    {!my && !st ? "Not rated yet" : null}
                  </div>
                </div>
                <StarRow value={my ?? 0} onPick={(n) => rate(d, n)} />
              </div>
            );
          })}
          </div>
        </section>
      ))}
    </>
  );
}
