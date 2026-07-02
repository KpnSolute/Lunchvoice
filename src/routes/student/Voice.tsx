import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Note = { id: string; kind: string; body: string; created_at: string };

export function Voice() {
  const [feedback, setFeedback] = useState("");
  const [idea, setIdea] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("voice_notes")
      .select("id, kind, body, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setNotes(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function send(kind: "feedback" | "idea", body: string, clear: () => void) {
    setErr("");
    setOk("");
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("voice_notes").insert({ kind, body: body.trim() });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    clear();
    setOk("Sent — thanks for speaking up!");
    load();
  }

  return (
    <>
      <div className="page-head">
        <h2>Your voice</h2>
        <p className="hint">Tell the kitchen what's working and what's not. Staff only see it anonymously.</p>
      </div>

      {ok && <div className="notice ok">{ok}</div>}
      {err && <div className="notice err">{err}</div>}

      <div className="card">
        <h2>Feedback</h2>
        <p className="hint">Taste, portion size, temperature, wait time?</p>
        <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. The BBQ wings were great, but the grill line was slow." />
        <button className="btn-primary btn-block" style={{ marginTop: 10 }} disabled={busy || !feedback.trim()}
          onClick={() => send("feedback", feedback, () => setFeedback(""))}>
          Send feedback
        </button>
      </div>

      <div className="card">
        <h2>Pitch a new dish</h2>
        <p className="hint">One thing you wish showed up in the rotation?</p>
        <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. Loaded nachos with real cheese sauce" />
        <button className="btn-mustard btn-block" style={{ marginTop: 10 }} disabled={busy || !idea.trim()}
          onClick={() => send("idea", idea, () => setIdea(""))}>
          Pitch it
        </button>
      </div>

      {notes.length > 0 && (
        <div className="card">
          <h2>You said</h2>
          {notes.map((n) => (
            <div key={n.id} className="item-row">
              <div className="item-name" style={{ fontWeight: 400, fontSize: 14 }}>
                {n.body}
                <small>{new Date(n.created_at).toLocaleDateString()}</small>
              </div>
              <span className={`pill ${n.kind === "idea" ? "ready" : "pending"}`}>{n.kind}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
