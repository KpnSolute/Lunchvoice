import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { slotsForDay, STAPLES, weekdayFor, type Slot } from "../../lib/menu";
import { Confetti } from "../../components/Confetti";
import type { Session } from "../../types/db";

type RatingRow = { dish_name: string; slot: Slot; rating: number };

function ForkRow({
  name,
  label,
  value,
  onPick,
}: {
  name: string;
  label?: string;
  value: number;
  onPick: (n: number) => void;
}) {
  return (
    <div className="item-row">
      <div className="item-name">
        {name}
        {label && <small>{label}</small>}
      </div>
      <div className="forks">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`fork-btn${n <= value ? " active" : ""}`}
            onClick={() => onPick(n)}
            aria-label={`${n} forks`}
          >
            🍴
          </button>
        ))}
      </div>
    </div>
  );
}

export function Survey() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<Record<string, RatingRow>>({});
  const [feedback, setFeedback] = useState("");
  const [idea, setIdea] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);
  const [shownPoints, setShownPoints] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data, error } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
      if (error) setErr(error.message);
      else setSession(data);
      // already completed? bounce back home
      const { data: existing } = await supabase.from("responses").select("id").eq("session_id", sessionId).maybeSingle();
      if (existing) {
        navigate("/", { replace: true });
        return;
      }
      setLoading(false);
    })();
  }, [sessionId, navigate]);

  const daySlots = useMemo(() => (session?.menu_day ? slotsForDay(session.menu_day) : []), [session]);

  function pick(key: string, dish_name: string, slot: Slot, rating: number) {
    setRatings((r) => ({ ...r, [key]: { dish_name, slot, rating } }));
  }

  // count-up animation for the celebration screen
  useEffect(() => {
    if (awarded === null) return;
    let n = 0;
    const step = Math.max(1, Math.round(awarded / 30));
    const id = setInterval(() => {
      n = Math.min(awarded, n + step);
      setShownPoints(n);
      if (n >= awarded) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, [awarded]);

  async function submit() {
    setErr("");
    const rows = Object.values(ratings);
    if (rows.length === 0 && !feedback.trim() && !idea.trim()) {
      setErr("Rate at least one dish or leave a note first.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_response", {
      p_session_id: sessionId!,
      p_ratings: rows,
      p_feedback: feedback,
      p_idea: idea,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await refreshProfile();
    setAwarded(data ?? session?.points_reward ?? 0);
  }

  if (loading) return <div className="card muted">Loading survey…</div>;

  if (awarded !== null) {
    return (
      <>
        <Confetti fire={1} />
        <div className="card celebrate">
          <h2>🍴 Ticket printed!</h2>
          <div className="big">+{shownPoints}</div>
          <p className="muted">points added to your account</p>
          <div className="stack" style={{ maxWidth: 280, margin: "16px auto 0" }}>
            <button className="btn-primary btn-block" onClick={() => navigate("/store")}>Spend in the store →</button>
            <button className="btn-ghost btn-block" onClick={() => navigate("/")}>Back to home</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="card">
        <h2>{session?.title}</h2>
        <p className="hint">
          {session?.description || "Tap the forks — one for “pass,” five for “make this every rotation.”"}
          {session?.menu_day ? ` · Day ${session.menu_day}, ${weekdayFor(session.menu_day - 1)}` : ""}
          {" · "}<b>{session?.points_reward} pts</b>
        </p>
      </div>

      {daySlots.length > 0 && (
        <div className="card">
          <h2>Rate today's menu <span className="tag">forks up</span></h2>
          {daySlots.map((s) => (
            <ForkRow
              key={s.slot}
              name={s.name}
              label={s.label}
              value={ratings[s.slot]?.rating ?? 0}
              onPick={(n) => pick(s.slot, s.name, s.slot, n)}
            />
          ))}
        </div>
      )}

      <div className="card">
        <h2>Everyday staples</h2>
        <p className="hint">On the line most days, cycle day or not.</p>
        {STAPLES.map((s) => (
          <ForkRow
            key={s.id}
            name={s.name}
            value={ratings[`staple:${s.id}`]?.rating ?? 0}
            onPick={(n) => pick(`staple:${s.id}`, s.name, "staple", n)}
          />
        ))}
      </div>

      <div className="card">
        <h2>Tell us more</h2>
        <p className="hint">Taste, portion size, temperature, wait time?</p>
        <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. The BBQ wings were great, but the grill line was slow." />
      </div>

      <div className="card">
        <h2>Pitch a new dish</h2>
        <p className="hint">One thing you wish showed up in the rotation?</p>
        <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. Loaded nachos with real cheese sauce" />
      </div>

      {err && <div className="notice err">{err}</div>}
      <button className="btn-primary btn-block" disabled={busy} onClick={submit}>
        {busy ? "Printing ticket…" : `Submit & earn ${session?.points_reward} pts`}
      </button>
    </>
  );
}
