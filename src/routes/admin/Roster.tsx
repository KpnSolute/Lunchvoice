import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type RosterRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  points: number;
  streak: number;
  created_at: string;
  responses: number;
  orders: number;
};

export function Roster() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase
      .from("student_roster")
      .select("*")
      .then(({ data }) => {
        setRows((data ?? []) as RosterRow[]);
        setLoading(false);
      });
  }, []);

  const shown = rows.filter((r) => {
    const s = q.toLowerCase();
    return !s || (r.display_name ?? "").toLowerCase().includes(s) || (r.email ?? "").toLowerCase().includes(s);
  });

  return (
    <>
      <div className="card">
        <div className="spread">
          <div>
            <h2>Student Roster</h2>
            <p className="hint" style={{ margin: 0 }}>Every registered student with a stable ID so responses stay verifiable. Survey answers themselves remain anonymous in stats.</p>
          </div>
          <span className="points-badge">{rows.length} students</span>
        </div>
        <input style={{ marginTop: 12 }} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="card muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="card muted">No students yet.</div>
      ) : (
        <div className="card">
          {shown.map((r) => (
            <div key={r.id} className="item-row">
              <div className="item-name">
                {r.display_name || "—"}
                <small>{r.email} · id {r.id.slice(0, 8)}</small>
              </div>
              <div className="muted mono" style={{ fontSize: 12, textAlign: "right" }}>
                🍴 {r.points} · 🔥 {r.streak}
                <br />
                {r.responses} surveys · {r.orders} orders
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
