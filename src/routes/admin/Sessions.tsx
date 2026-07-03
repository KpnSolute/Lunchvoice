import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { useOrg } from "../../org/OrgProvider";
import { QRCard } from "../../components/QRCard";
import { CYCLE, weekdayFor } from "../../lib/menu";
import type { Session } from "../../types/db";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function Sessions() {
  const { profile } = useAuth();
  const { org } = useOrg();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [menuDay, setMenuDay] = useState<number | "">("");
  const [reward, setReward] = useState(50);
  const [err, setErr] = useState("");
  const [showQr, setShowQr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("sessions").select("*").order("created_at", { ascending: false });
    setSessions(data ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) {
      setErr("Give the session a title.");
      return;
    }
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        join_code: genCode(),
        menu_day: menuDay === "" ? null : Number(menuDay),
        points_reward: reward,
        created_by: profile!.id,
        org_id: org.id,
      })
      .select()
      .single();
    if (error) {
      setErr(error.message);
      return;
    }
    setTitle("");
    setDescription("");
    setMenuDay("");
    setReward(50);
    setShowQr(data.id);
    load();
  }

  async function toggleActive(s: Session) {
    await supabase.from("sessions").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  }

  return (
    <>
      <div className="card">
        <h2>New survey session</h2>
        <p className="hint">Creates a shareable join code + QR. Pick a menu day so students rate that day's dishes.</p>
        <form onSubmit={create}>
          <div className="field-block">
            <label className="field">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1 Lunch Check-in" />
          </div>
          <div className="field-block">
            <label className="field">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to students" />
          </div>
          <div className="row2">
            <div className="field-block">
              <label className="field">Menu day (optional)</label>
              <select value={menuDay} onChange={(e) => setMenuDay(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Staples only</option>
                {CYCLE.map((_, i) => (
                  <option key={i} value={i + 1}>Day {i + 1} — {weekdayFor(i)}</option>
                ))}
              </select>
            </div>
            <div className="field-block">
              <label className="field">Points reward</label>
              <input type="number" min={0} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
            </div>
          </div>
          {err && <div className="notice err">{err}</div>}
          <button className="btn btn-primary btn-block">Create session</button>
        </form>
      </div>

      {sessions.map((s) => (
        <div key={s.id} className="card">
          <div className="spread">
            <div>
              <h2 style={{ marginBottom: 2 }}>{s.title} <span className={`pill ${s.is_active ? "ready" : "collected"}`}>{s.is_active ? "active" : "closed"}</span></h2>
              <p className="muted" style={{ margin: 0 }}>
                Code <b className="mono">{s.join_code}</b> · {s.points_reward} pts
                {s.menu_day ? ` · Day ${s.menu_day}` : " · staples only"}
              </p>
            </div>
            <div className="stack" style={{ alignItems: "flex-end" }}>
              <button className="btn btn-solid" style={{ fontSize: 13, padding: "7px 12px" }}
                onClick={() => setShowQr(showQr === s.id ? null : s.id)}>
                {showQr === s.id ? "Hide QR" : "Show QR"}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 13, padding: "7px 12px" }} onClick={() => toggleActive(s)}>
                {s.is_active ? "Close" : "Reopen"}
              </button>
            </div>
          </div>
          {showQr === s.id && (
            <div style={{ marginTop: 16 }}>
              <QRCard code={s.join_code} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
