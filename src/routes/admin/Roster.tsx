import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { studentPublicId } from "../../lib/studentIdentity";
import { supabase } from "../../lib/supabase";

type RosterRow = {
  id: string;
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
      .select("id, points, streak, created_at, responses, orders")
      .then(({ data }) => {
        setRows((data ?? []) as RosterRow[]);
        setLoading(false);
      });
  }, []);

  const shown = rows.filter((r) => {
    const s = q.toLowerCase();
    return !s || studentPublicId(r.id).toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
  });

  return (
    <>
      <div className="card">
        <div className="spread">
          <div>
            <h2>Student Roster</h2>
            <p className="hint" style={{ margin: 0 }}>
              Registered students are shown with stable IDs so responses stay verifiable without exposing student names.
            </p>
          </div>
          <span className="points-badge">{rows.length} students</span>
        </div>
        <input
          style={{ marginTop: 12 }}
          placeholder="Search student ID..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card muted">Loading...</div>
      ) : shown.length === 0 ? (
        <div className="card muted">No students yet.</div>
      ) : (
        <div className="card">
          {shown.map((r) => (
            <div key={r.id} className="item-row">
              <div className="item-name">
                {studentPublicId(r.id)}
                <small>Private profile mapped to id {r.id.slice(0, 8)}</small>
              </div>
              <div className="muted mono" style={{ fontSize: 12, textAlign: "right" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                  <Icon name="coin" size={13} /> {r.points} &middot; <Icon name="flame" size={13} /> {r.streak}
                </span>
                <br />
                {r.responses} surveys &middot; {r.orders} orders
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
