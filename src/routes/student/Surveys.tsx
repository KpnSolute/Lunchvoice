import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";
import { Icon } from "../../components/Icon";
import type { Session } from "../../types/db";

type SessionSummary = Pick<Session, "id" | "title" | "description" | "points_reward" | "is_active" | "opens_at" | "closes_at" | "menu_day" | "show_on_dashboard">;
type JoinedSession = SessionSummary & { completed: boolean };

function isOpen(session: SessionSummary): boolean {
  const now = Date.now();
  return session.is_active
    && (!session.opens_at || new Date(session.opens_at).getTime() <= now)
    && (!session.closes_at || new Date(session.closes_at).getTime() > now);
}

export function Surveys() {
  const navigate = useNavigate();
  const { org } = useOrg();
  const [sessions, setSessions] = useState<JoinedSession[]>([]);
  const [available, setAvailable] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      // sessions the student joined + whether they've already responded
      const [memberRes, responseRes, availableRes] = await Promise.all([
        supabase
          .from("session_members")
          .select("session_id, sessions(id, title, description, points_reward, is_active, opens_at, closes_at, menu_day, show_on_dashboard)")
          .order("joined_at", { ascending: false }),
        supabase.from("responses").select("session_id"),
        supabase
          .from("sessions")
          .select("id, title, description, points_reward, is_active, opens_at, closes_at, menu_day, show_on_dashboard")
          .eq("show_on_dashboard", true)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
      ]);
      if (memberRes.error || responseRes.error || availableRes.error) {
        setErr(memberRes.error?.message || responseRes.error?.message || availableRes.error?.message || "Could not load surveys.");
      }
      const members = memberRes.data ?? [];
      const responses = responseRes.data ?? [];
      const done = new Set((responses ?? []).map((r) => r.session_id));
      const list = (members ?? [])
        .map((m) => m.sessions as unknown as SessionSummary)
        .filter(Boolean)
        .map((s) => ({ ...s, completed: done.has(s.id) }));
      const joinedIds = new Set(list.map((session) => session.id));
      setSessions(list);
      setAvailable(((availableRes.data ?? []) as unknown as SessionSummary[]).filter((session) => isOpen(session) && !joinedIds.has(session.id)));
      setLoading(false);
    })();
  }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { data, error } = await supabase.rpc("join_session", { p_code: code.trim().toUpperCase() });
    if (error) setErr(error.message);
    else if (!data || String(data).includes("not found")) setErr(String(data || "Session not found or closed."));
    else navigate(`/${org.slug}/survey/${data}`);
  }

  async function joinAvailable(sessionId: string) {
    setErr("");
    const { data, error } = await supabase.rpc("join_available_session", { p_session_id: sessionId });
    if (error) setErr(error.message);
    else if (!data || String(data).includes("not found")) setErr(String(data || "Session not found or closed."));
    else navigate(`/${org.slug}/survey/${data}`);
  }

  const open = sessions.filter((s) => !s.completed && isOpen(s));
  const past = sessions.filter((s) => s.completed || !isOpen(s));

  return (
    <>
      <div className="page-head">
        <h2>Surveys</h2>
        <p className="hint">Scan a QR for direct access, enter a session code, or choose an available survey below.</p>
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
        <h2>Available surveys <span className="tag">{available.length} available</span></h2>
        {loading ? (
          <p className="muted">Loadingâ€¦</p>
        ) : available.length === 0 ? (
          <p className="muted">No public sessions are available right now. You can still join a private session with its QR or code.</p>
        ) : (
          available.map((session) => (
            <div key={session.id} className="item-row">
              <div className="item-name">
                {session.title}
                <small>{session.points_reward} pts{session.menu_day ? ` Â· Day ${session.menu_day}` : ""}{session.description ? ` Â· ${session.description}` : ""}</small>
              </div>
              <button className="btn btn-primary" onClick={() => joinAvailable(session.id)}>Join & start <Icon name="arrow" size={16} /></button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Your joined surveys <span className="tag">{open.length} open</span></h2>
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
