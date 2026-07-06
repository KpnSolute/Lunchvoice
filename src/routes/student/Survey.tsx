import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";
import { useAuth } from "../../auth/AuthProvider";
import { slotsForDay, STAPLES, weekdayFor, type Slot } from "../../lib/menu";
import { Confetti } from "../../components/Confetti";
import { Icon } from "../../components/Icon";
import type { Json, MenuCycleDay, Session, SurveyQuestion, SurveyTemplate } from "../../types/db";

type RatingRow = { dish_name: string; slot: Slot; rating: number };
type SurveySession = Session & {
  survey_templates?: (SurveyTemplate & { survey_questions?: SurveyQuestion[] }) | null;
};

function toJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => toJson(v));
  return null;
}

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
      <div className="rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= value ? "on" : ""}
            onClick={() => onPick(n)}
            aria-label={`${n} forks`}
          >
            <Icon name="fork" size={22} />
          </button>
        ))}
      </div>
    </div>
  );
}

function DynamicQuestion({
  question,
  value,
  onChange,
  onToggle,
}: {
  question: SurveyQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  onToggle: (option: string) => void;
}) {
  const options = Array.isArray(question.options) ? question.options.map(String) : [];

  return (
    <div className="dynamic-question">
      <div className="item-name">
        {question.category && <small>{question.category}</small>}
        {question.prompt} {question.required && <span className="tag">Required</span>}
        {question.help_text && <small>{question.help_text}</small>}
      </div>

      {(question.type === "rating" || question.type === "flame") && (
        <div className="rating rating-large">
          {Array.from({ length: question.scale_max - question.scale_min + 1 }, (_, i) => question.scale_min + i).map((n) => (
            <button
              key={n}
              type="button"
              className={Number(value ?? 0) >= n ? "on" : ""}
              onClick={() => onChange(n)}
              aria-label={`${n} out of ${question.scale_max}`}
            >
              {question.type === "flame" ? (
                <Icon name="flame" size={24} strokeWidth={Number(value ?? 0) >= n ? 2.4 : 1.75} />
              ) : (
                <Icon name={Number(value ?? 0) >= n ? "star-fill" : "star"} size={24} />
              )}
            </button>
          ))}
        </div>
      )}

      {question.type === "slider" && (
        <div className="slider-row">
          <input
            type="range"
            min={question.scale_min}
            max={question.scale_max}
            step={1}
            value={typeof value === "number" ? value : Math.round((question.scale_min + question.scale_max) / 2)}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={question.prompt}
          />
          <b className="slider-value mono">{typeof value === "number" ? value : "–"}</b>
        </div>
      )}

      {question.type === "text" && (
        <textarea
          rows={3}
          maxLength={4000}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.help_text || "Type your answer"}
        />
      )}

      {question.type === "yes_no" && (
        <div className="choice-grid">
          {["Yes", "No"].map((option) => (
            <button key={option} type="button" className={`choice-btn${value === option ? " active" : ""}`} onClick={() => onChange(option)}>
              {option}
            </button>
          ))}
        </div>
      )}

      {question.type === "single_choice" && (
        <div className="choice-grid">
          {options.map((option) => (
            <button key={option} type="button" className={`choice-btn${value === option ? " active" : ""}`} onClick={() => onChange(option)}>
              {option}
            </button>
          ))}
        </div>
      )}

      {question.type === "multi_choice" && (
        <div className="choice-grid">
          {options.map((option) => {
            const active = Array.isArray(value) && value.includes(option);
            return (
              <button key={option} type="button" className={`choice-btn${active ? " active" : ""}`} onClick={() => onToggle(option)}>
                {option}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Survey() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { org } = useOrg();
  const { refreshProfile } = useAuth();

  const [session, setSession] = useState<SurveySession | null>(null);
  const [cycleDay, setCycleDay] = useState<MenuCycleDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<Record<string, RatingRow>>({});
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [feedback, setFeedback] = useState("");
  const [idea, setIdea] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);
  const [shownPoints, setShownPoints] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, survey_templates(*, survey_questions(*))")
        .eq("id", sessionId)
        .single();
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setSession(data as unknown as SurveySession);
      const loaded = data as unknown as SurveySession;
      if (loaded.menu_cycle_id && loaded.menu_day) {
        const { data: day } = await supabase
          .from("menu_cycle_days")
          .select("*")
          .eq("cycle_id", loaded.menu_cycle_id)
          .eq("day_number", loaded.menu_day)
          .maybeSingle();
        setCycleDay((day ?? null) as MenuCycleDay | null);
      }

      const { data: existing } = await supabase.from("responses").select("id").eq("session_id", sessionId).maybeSingle();
      if (existing) {
        navigate(`/${org.slug}`, { replace: true });
        return;
      }
      setLoading(false);
    })();
  }, [sessionId, navigate, org.slug]);

  const daySlots = useMemo(() => {
    if (cycleDay) {
      const lunch = Array.isArray(cycleDay.lunch) ? cycleDay.lunch.map(String).filter(Boolean) : [];
      const dinner = Array.isArray(cycleDay.dinner) ? cycleDay.dinner.map(String).filter(Boolean) : [];
      return [
        { slot: "lunchEntree" as Slot, label: "Lunch", name: lunch[0] },
        { slot: "lunchAlt" as Slot, label: "Lunch - Alt", name: lunch[1] },
        { slot: "dinnerEntree" as Slot, label: "Dinner", name: dinner[0] },
        { slot: "dinnerAlt" as Slot, label: "Dinner - Alt", name: dinner[1] },
      ].filter((s) => s.name);
    }
    return session?.menu_day ? slotsForDay(session.menu_day) : [];
  }, [session, cycleDay]);
  const questions = useMemo(
    () => [...(session?.survey_templates?.survey_questions ?? [])].sort((a, b) => a.position - b.position),
    [session]
  );
  const hasDynamicTemplate = questions.length > 0;

  function pick(key: string, dish_name: string, slot: Slot, rating: number) {
    setRatings((r) => ({ ...r, [key]: { dish_name, slot, rating } }));
  }

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((a) => ({ ...a, [questionId]: value }));
  }

  function toggleMulti(questionId: string, option: string) {
    setAnswers((a) => {
      const cur = Array.isArray(a[questionId]) ? (a[questionId] as string[]) : [];
      return { ...a, [questionId]: cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option] };
    });
  }

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
    const answerRows = Object.entries(answers)
      .filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0))
      .map(([question_id, value]) => ({ question_id, value: toJson(value) }));
    const missing = questions.find((q) => q.required && !answerRows.some((a) => a.question_id === q.id));
    if (missing) {
      setErr(`Answer this required question: ${missing.prompt}`);
      return;
    }
    if (rows.length === 0 && answerRows.length === 0 && !feedback.trim() && !idea.trim()) {
      setErr("Answer at least one question or leave a note first.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("submit_response", {
      p_session_id: sessionId!,
      p_ratings: rows,
      p_feedback: feedback,
      p_idea: idea,
      p_answers: answerRows,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await refreshProfile();
    setAwarded(data ?? session?.points_reward ?? 0);
  }

  if (loading) return <div className="card muted">Loading survey...</div>;

  if (awarded !== null) {
    return (
      <>
        <Confetti fire={1} />
        <div className="card celebrate">
          <span className="burst"><Icon name="check" size={40} /></span>
          <h2>Nice - you are in</h2>
          <div className="big">+{shownPoints}</div>
          <p className="muted">points added to your account</p>
          <div className="stack" style={{ maxWidth: 300, margin: "18px auto 0" }}>
            <button className="btn btn-primary btn-block" onClick={() => navigate(`/${org.slug}/store`)}>
              Spend in the store <Icon name="arrow" size={18} />
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => navigate(`/${org.slug}`)}>Back to home</button>
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
          {session?.description || "Tap the forks - one for pass, five for make this every rotation."}
          {session?.menu_day ? ` - Day ${session.menu_day}, ${weekdayFor(session.menu_day - 1)}` : ""}
          {" - "}<b>{session?.points_reward} pts</b>
        </p>
      </div>

      {questions.length > 0 && (
        <div className="card">
          <h2>{session?.survey_templates?.title || "Survey questions"}</h2>
          <p className="hint">{session?.survey_templates?.description || "Answer the staff-built survey questions below."}</p>
          {questions.map((q) => (
            <DynamicQuestion
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(value) => setAnswer(q.id, value)}
              onToggle={(option) => toggleMulti(q.id, option)}
            />
          ))}
        </div>
      )}

      {!hasDynamicTemplate && daySlots.length > 0 && (
        <div className="card">
          <h2>Rate today's menu</h2>
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

      {!hasDynamicTemplate && (
        <>
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
            <textarea
              rows={3}
              maxLength={2000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. The BBQ wings were great, but the grill line was slow."
            />
          </div>

          <div className="card">
            <h2>Pitch a new dish</h2>
            <p className="hint">One thing you wish showed up in the rotation?</p>
            <textarea
              rows={2}
              maxLength={1000}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. Loaded nachos with real cheese sauce"
            />
          </div>
        </>
      )}

      {err && <div className="notice err">{err}</div>}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
        {busy ? "Submitting..." : `Submit & earn ${session?.points_reward} pts`}
      </button>
    </>
  );
}
