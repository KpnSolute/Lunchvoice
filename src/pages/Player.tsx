import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { Answer } from "../lib/lvApi";
import {
  AnswerControl,
  Button,
  Card,
  ErrorNote,
  HubMark,
  Icon,
  Loading,
  Logo,
  Notice,
  Pill,
  type AnswerValue,
} from "../ui";

// The respondent player: mobile-first, one question per screen, no Hub nav, no
// bottom tabs and no signature. Guests answer without an account and are told so.

type Phase = "loading" | "welcome" | "question" | "review" | "done" | "error" | "offline";

export function Player() {
  const { joinCode = "" } = useParams();
  const { api } = useIdentity();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.guestCampaignGet>> | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPhase("offline");
        return;
      }
      const r = await api.guestCampaignGet(joinCode);
      if (!live) return;
      if (!r.ok) {
        setError(describeError(r.error));
        setPhase("error");
        return;
      }
      setData(r);
      setPhase("welcome");
    })();
    return () => {
      live = false;
    };
  }, [api, joinCode]);

  const questions = data && data.ok ? data.questions : [];
  const campaign = data && data.ok ? data.campaign : null;
  const current = questions[index];
  const answeredCount = Object.values(answers).filter((v) => v !== null && v !== undefined && v !== "").length;
  const total = Math.max(1, questions.length);

  const setAnswer = (v: AnswerValue) => {
    if (!current) return;
    setAnswers((a) => ({ ...a, [current.question_id]: v }));
  };

  const submit = async () => {
    setBusy(true);
    const payload: Answer[] = questions
      .map((q) => ({ question_id: q.question_id, value: answers[q.question_id] }))
      .filter((a) => a.value !== null && a.value !== undefined && a.value !== "");
    const guestKey = localStorage.getItem("lv.guest") ?? crypto.randomUUID();
    localStorage.setItem("lv.guest", guestKey);
    try {
      localStorage.setItem(`lv.draft.${joinCode}`, JSON.stringify(payload));
    } catch {
      /* storage unavailable: the submit still goes ahead */
    }
    const r = await api.guestSubmit(joinCode, guestKey, payload);
    setBusy(false);
    if (r.ok && typeof r === "object" && "receipt_id" in r) {
      setReceipt(String(r.receipt_id));
      setPhase("done");
      setCelebrate(true);
      try {
        localStorage.removeItem(`lv.draft.${joinCode}`);
      } catch {
        /* nothing to clean up */
      }
    } else if (!r.ok) {
      setError(describeError(r.error));
      setPhase("error");
    }
  };

  if (phase === "loading") {
    return (
      <Shell>
        <Loading rows={4} label="Opening the Campaign" />
      </Shell>
    );
  }

  if (phase === "offline") {
    return (
      <Shell>
        <Card className="stack">
          <Pill tone="warn">Offline</Pill>
          <p className="t-title">You are offline.</p>
          <p className="t-small muted">
            Your answers are saved on this device. Reconnect and press retry: nothing is sent until the connection is back.
          </p>
          <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Card>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <Card className="stack">
          <Pill tone="danger">Not available</Pill>
          <p className="t-title">This Campaign cannot be answered.</p>
          <p className="t-small muted">{error}</p>
          <div className="stack stack-sm">
            <p className="t-label muted">Common reasons</p>
            <ul className="stack stack-sm t-small muted">
              <li>It has closed, or it has not opened yet.</li>
              <li>You have already answered from this device.</li>
              <li>It is limited to a group you are not in.</li>
            </ul>
          </div>
          <div className="row">
            <Button variant="raised" onClick={() => window.location.reload()} icon="refresh">
              Try again
            </Button>
            <Link to="/" className="btn btn-quiet">
              LunchVoice home
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === "welcome" && campaign) {
    return (
      <Shell>
        <div className="stack" style={{ gap: 20 }}>
          <div className="row">
            <HubMark name={campaign.title} size={44} />
            <div className="stack stack-sm">
              <p className="t-label muted">You are answering</p>
              <h1 className="t-title" style={{ fontSize: 22 }}>
                {campaign.title}
              </h1>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Pill>{campaign.mode}</Pill>
            <Pill tone={campaign.anonymity === "anonymous" ? "accent" : "quiet"}>{campaign.anonymity}</Pill>
            <Pill tone="quiet">
              <Icon name="clock" size={11} /> About {Math.max(1, Math.round(questions.length * 0.4))} min
            </Pill>
          </div>
          <p className="t-body muted">
            {campaign.anonymity === "anonymous"
              ? "Your answers are anonymous. Nothing on this device or in the results can be traced back to you."
              : "Your answers are attached to your membership. Only people with analytics permission see counts."}
          </p>
          <Notice tone="info" title="You are answering as a guest">
            Guests answer without an account and never count as members or toward a Hub's thresholds. That is deliberate.
          </Notice>
          <Button variant="primary" size="lg" onClick={() => setPhase("question")} disabled={questions.length === 0}>
            Start
          </Button>
          {questions.length === 0 && <p className="t-small subtle">This Campaign has no questions yet.</p>}
        </div>
      </Shell>
    );
  }

  if (phase === "question" && current) {
    return (
      <Shell progress={{ done: index, total }}>
        <div className="stack" style={{ gap: 20, flex: 1 }}>
          <p className="t-label muted">
            Question {index + 1} of {questions.length}
          </p>
          <AnswerControl
            kind={current.kind}
            prompt={current.prompt}
            config={current.config as { options?: string[] }}
            value={answers[current.question_id] ?? null}
            onChange={setAnswer}
          />
          <div className="spacer" />
          <div className="row-between" style={{ marginTop: 24 }}>
            <Button
              variant="quiet"
              onClick={() => (index === 0 ? setPhase("welcome") : setIndex((i) => i - 1))}
              icon="chevron-left"
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => (index === questions.length - 1 ? setPhase("review") : setIndex((i) => i + 1))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && index === questions.length - 1) setPhase("review");
              }}
              iconRight="arrow-right"
            >
              {index === questions.length - 1 ? "Review" : "Next"}
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === "review") {
    return (
      <Shell progress={{ done: questions.length, total }}>
        <div className="stack" style={{ gap: 16 }}>
          <h1 className="t-title" style={{ fontSize: 22 }}>
            Ready to send?
          </h1>
          <p className="t-small muted">
            {answeredCount} of {questions.length} answered. You can go back and change anything; nothing is sent until you press
            send.
          </p>
          <div className="stack stack-sm">
            {questions.map((q, i) => (
              <button
                key={q.question_id}
                type="button"
                className="s-raised row-between"
                style={{ padding: 12, borderRadius: 14, border: 0, textAlign: "left", cursor: "pointer" }}
                onClick={() => {
                  setIndex(i);
                  setPhase("question");
                }}
              >
                <span className="t-small">{q.prompt}</span>
                <span className="t-small subtle mono">
                  {answers[q.question_id] ? String(answers[q.question_id]) : "skipped"}
                </span>
              </button>
            ))}
          </div>
          {error && <ErrorNote error={error} />}
          <Button variant="primary" size="lg" loading={busy} onClick={submit} icon="send">
            Send answers
          </Button>
          <p className="t-small subtle">A receipt is created so you can prove you answered. It never contains your answers.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="stack" style={{ gap: 16, alignItems: "flex-start" }}>
        <span className={`s-raised ${celebrate ? "jelly" : ""}`} style={{ width: 72, height: 72, display: "grid", placeItems: "center", borderRadius: 24 }}>
          <Icon name="check" size={34} strokeWidth={2.4} title="Thank you" />
        </span>
        <h1 className="t-display-md" style={{ fontSize: 26 }}>
          Thank you.
        </h1>
        <p className="t-body muted">Your answers were received. The organiser sees counts, not who said what.</p>
        {receipt && (
          <p className="t-small subtle mono" style={{ wordBreak: "break-all" }}>
            Receipt {receipt}
          </p>
        )}
        <Link to="/" className="btn btn-raised">
          Done
        </Link>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  progress,
}: {
  children: React.ReactNode;
  progress?: { done: number; total: number };
}) {
  return (
    <div className="player">
      <div className="player-inner">
        {progress && (
          <div className="player-progress" aria-label={`Question ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}>
            {Array.from({ length: progress.total }).map((_, i) => (
              <span key={i} data-done={i <= progress.done} />
            ))}
          </div>
        )}
        {children}
        <div className="row-between" style={{ marginTop: "auto", paddingTop: 28 }}>
          <span className="t-small subtle">Powered by LunchVoice</span>
          <Logo size={20} />
        </div>
      </div>
    </div>
  );
}
