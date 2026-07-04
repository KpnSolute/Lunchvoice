import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";
import { Icon } from "../../components/Icon";
import type { Session } from "../../types/db";

type JoinedSession = Session & { completed: boolean };

export function Surveys() {
  const navigate = useNavigate();
  const { org } = useOrg();
  const [sessions, setSessions] = useState<JoinedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      // sessions the student joined + whether they've already responded
      const { data: members } = await supabase
        .from("session_members")
        .select("session_id, sessions(*)")
        .order("joined_at", { ascending: false });
      const { data: responses } = await supabase.from("responses").select("session_id");
      const done = new Set((responses ?? []).map((r) => r.session_id));
      const list = (members ?? [])
        .map((m) => m.sessions as unknown as Session)
        .filter(Boolean)
        .map((s) => ({ ...s, completed: done.has(s.id) }));
      setSessions(list);
      setLoading(false);
    })();
  }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { data, error } = await supabase.rpc("join_session", { p_code: code.trim() });
    if (error) setErr(error.message);
    else navigate(`/${org.slug}/survey/${data}`);
  }

  const open = sessions.filter((s) => !s.completed && s.is_active);
  const past = sessions.filter((s) => s.completed || !s.is_active);

  return (
    <>
      <div className="page-head">
        <h2>Surveys</h2>
        <p className="hint">Complete a survey to earn points, then spend them in the store.</p>
      </div>

      <div className="card">
        <h2>Join a survey</h2>
        <p className="hint">Got a code from staff? Enter it or scan the QR they shared.</p>
        <form onSubmit={join} className="spread" style={{ gap: 10 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            className="mono"
            style={{ flex: 1, textTransform: "uppercase", letterSpacing: ".1em" }}
          />
          <button className="btn btn-solid">Join</button>
        </form>
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      <div className="card">
        <h2>Your surveys <span className="tag">{open.length} open</span></h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : open.length === 0 ? (
          <p className="muted">No open surveys. Join one above to get started.</p>
        ) : (
          open.map((s) => (
            <div key={s.id} className="item-row">
              <div className="item-name">
                {s.title}
                <small>{s.points_reward} pts{s.menu_day ? ` · Day ${s.menu_day}` : ""}</small>
              </div>
              <button className="btn btn-primary" onClick={() => navigate(`/${org.slug}/survey/${s.id}`)}>Start <Icon name="arrow" size={16} /></button>
            </div>
          ))
        )}
        {past.length > 0 && (
          <>
            <p className="muted mono" style={{ marginTop: 16, fontSize: 11 }}>DONE / CLOSED</p>
            {past.map((s) => (
              <div key={s.id} className="item-row">
                <div className="item-name" style={{ opacity: 0.7 }}>{s.title}</div>
                <span className="pill collected">{s.completed ? "completed" : "closed"}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
