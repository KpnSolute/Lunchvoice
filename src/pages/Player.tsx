import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import type { Answer } from "../lib/lvApi";
import { Loading, campaignPhase, LinkButton } from "../components/ui";
import { Button } from "@/components/shadcn/button";
import { ReportSurvey } from "./ReportSurvey";
import { Icon } from "../components/Icon";
import { describeError } from "../lib/errors";
import { QuestionInput, summarize } from "../ui/QuestionControls";
import { StateScreen } from "../ui/StateScreen";

/**
 * The respondent player (L9): welcome, one question per screen, review, thanks.
 * Mobile first, max 560px, no Hub navigation, no signature. Powered by LunchVoice sits at the foot.
 */

const randomKey = () => Array.from({ length: 32 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");

function PoweredBy() {
  return (
    <p className="lv-powered">
      Powered by <img src="/brand/lunchvoice-mark.svg" alt="" height={16} width={16} /> <strong>LunchVoice</strong>
    </p>
  );
}

type View = "welcome" | "question" | "review";

export function Player({ campaignId, guest, embedded = false }: { campaignId: string; guest?: { joinCode: string; guestKey: string }; embedded?: boolean }) {
  const { api } = useIdentity();
  const detail = useLv(() => (guest ? api.guestCampaignGet(guest.joinCode) : api.campaignGet(campaignId)), [api, campaignId, guest?.joinCode]);
  const [view, setView] = useState<View>("welcome");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const [receipt, setReceipt] = useState<{ id: string; duplicate: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const draftKey = `lv-draft-${guest?.joinCode ?? campaignId}`;

  const d = detail.data;
  const questions = d?.questions ?? [];
  const q = questions[step];

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!questions.length) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setAnswers(JSON.parse(raw));
    } catch { /* storage unavailable: drafts simply do not resume */ }
  }, [draftKey, questions.length]);

  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* ignore */ }
  }, [answers, draftKey]);

  async function submit() {
    setBusy(true);
    setError(null);
    const payload: Answer[] = questions.map((qq) => ({ question_id: qq.question_id, value: answers[qq.question_id] ?? null }));
    const r = guest ? await api.guestSubmit(guest.joinCode, guest.guestKey, payload) : await api.submit(campaignId, payload);
    setBusy(false);
    if (r.ok) {
      setReceipt({ id: r.receipt_id, duplicate: r.duplicate });
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    } else setError(describeError(r.error));
  }

  const frame = (children: React.ReactNode, tone: "light" | "ink" = "light") => (
    <div className={`lv-player lv-player-${tone}${embedded ? " lv-player-embedded" : ""}`}>
      <div className="lv-player-body">{children}</div>
      <PoweredBy />
    </div>
  );

  const reportCode = guest?.joinCode ?? d?.join_code ?? null;
  const report = reportCode ? <ReportSurvey joinCode={reportCode} /> : null;

  if (detail.loading) return frame(<Loading rows={3} label="Loading Campaign" />);
  if (detail.error) {
    const code = detail.error.code;
    if (code === "lv_not_available" || code === "lv_forbidden")
      return frame(<><StateScreen kind="ineligible" title="This survey is unavailable." detail="It can’t be answered right now." />{guest && <ReportSurvey joinCode={guest.joinCode} />}</>);
    return frame(
      <>
        <StateScreen
          kind={code === "lv_not_found" ? "notfound" : "error"}
          detail={describeError(detail.error)}
          action={code === "lv_not_found" ? <LinkButton to="/join" variant="secondary">Try another code</LinkButton> : <Button variant="secondary" onClick={() => detail.reload()}>Try again</Button>}
        />
        {guest && code !== "lv_not_found" && <ReportSurvey joinCode={guest.joinCode} />}
      </>,
    );
  }
  if (!d) return null;

  const phase = campaignPhase(d.campaign);

  if (receipt || d.has_responded) {
    return frame(
      <div className="lv-thanks">
        <span className="lv-thanks-check" aria-hidden="true"><Icon name="check" size={40} /></span>
        <h1 className="lv-thanks-title">{receipt?.duplicate || (!receipt && d.has_responded) ? <>Already in.<br /><em>Thanks.</em></> : <>Thanks.<br /><em>You're heard.</em></>}</h1>
        <p className="lv-thanks-copy">
          {receipt?.duplicate || (!receipt && d.has_responded)
            ? "You had already answered, so we kept your original response and didn't store a second one."
            : d.campaign.anonymity === "anonymous"
              ? "Your answers went in anonymously. The creator sees totals, never names."
              : "Your answers were recorded. The creator can see who answered."}
        </p>
        {(receipt?.id || d.receipt_id) && <p className="lv-thanks-receipt">Receipt {receipt?.id ?? d.receipt_id}</p>}
        <LinkButton to="/" variant="secondary" className="lv-thanks-done">Done</LinkButton>
        {report}
      </div>,
      "ink",
    );
  }

  if (phase !== "open" || !d.can_respond) {
    const kind = phase === "scheduled" ? "scheduled" : phase === "open" ? "ineligible" : "closed";
    return frame(
      <StateScreen
        kind={kind}
        detail={
          phase === "scheduled" ? "It hasn't opened yet. Check back when it does."
          : phase === "ended" ? "It has ended."
          : phase === "closed" ? "It has been closed."
          : "It isn't available to you right now."
        }
        action={report}
      />,
    );
  }

  const total = questions.length;
  const minutes = Math.max(1, Math.round(total * 0.3));
  const anonymous = d.campaign.anonymity === "anonymous";
  const answered = (i: number) => {
    const v = answers[questions[i]!.question_id];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  };
  // Compliance LC-03: every question is required unless its config says optional; the promises must be true.
  const optional = (i: number) => Boolean((questions[i]?.config as { optional?: boolean } | undefined)?.optional);
  const anyOptional = questions.some((_, i) => optional(i));
  const missing = questions.map((_, i) => i).filter((i) => !optional(i) && !answered(i));
  const privacyPromise = guest
    ? { title: "No account needed", body: anonymous ? "Guests answer without signing in. Your answers aren’t linked to you, and guests never count as members." : "Guests answer without signing in. The creator can see the answers you give, and guests never count as members." }
    : anonymous
      ? { title: "Anonymous", body: "Your answers are never linked to your name; you sign in only so we can count you once." }
      : { title: "Not anonymous", body: "The creator can see who answered and what they said." };

  if (view === "welcome") {
    return frame(
      <>
        <div className="lv-player-hero">
          <span className="lv-eyebrow-mono" style={{ color: "var(--lv-accent)" }}>{guest ? "Open to guests" : "You're invited"}</span>
          <h1 className="lv-player-title">{d.campaign.title}</h1>
          <div className="lv-player-hero-foot">
            <span className="lv-row-sub" style={{ color: "inherit", opacity: 0.8 }}>{total} {total === 1 ? "question" : "questions"} · ~{minutes} min</span>
            <Button variant="primary" onClick={() => { setStep(0); setView("question"); }} disabled={total === 0}>
              Start <Icon name="arrow" size={16} />
            </Button>
          </div>
        </div>
        <ul className="lv-promises">
          <li><span><Icon name="lock" size={18} /></span><div><strong>{privacyPromise.title}</strong><p>{privacyPromise.body}</p></div></li>
          <li><span><Icon name="check" size={18} /></span><div><strong>{anyOptional ? "Some questions are optional" : "Every question needs an answer"}</strong><p>{anyOptional ? "Optional questions are marked. Answer the rest to submit." : "You can go back and change answers before you submit."}</p></div></li>
          <li><span><Icon name="clock" size={18} /></span><div><strong>About {minutes} {minutes === 1 ? "minute" : "minutes"}</strong><p>Mostly taps.</p></div></li>
        </ul>
        {report}
      </>,
    );
  }

  if (view === "review") {
    return frame(
      <>
        <h1 className="lv-q-title">Review your answers</h1>
        <ul className="lv-review">
          {questions.map((qq, i) => (
            <li key={qq.question_id}>
              <div>
                <span className="lv-row-sub">Question {i + 1}</span>
                <strong>{qq.prompt}</strong>
                <span className={answered(i) ? "" : "lv-skipped"}>{!answered(i) && !optional(i) ? "Needs an answer" : summarize(qq, answers[qq.question_id])}</span>
              </div>
              <Button variant="quiet" size="sm" onClick={() => { setStep(i); setView("question"); }}>Edit</Button>
            </li>
          ))}
        </ul>
        {offline && <p className="lv-banner" role="status">You're offline. Your answers are saved on this device; send them when you're back online.</p>}
        {missing.length > 0 && <p className="lv-banner" role="status">Answer {missing.length === 1 ? "question" : "questions"} {missing.map((i) => i + 1).join(", ")} to submit.</p>}
        {error && <p className="lv-banner lv-banner-err" role="alert">{error}</p>}
        <div className="lv-player-nav">
          <button type="button" className="lv-circle-btn" aria-label="Back to questions" onClick={() => { setStep(total - 1); setView("question"); }}><Icon name="back" size={20} /></button>
          <button type="button" className="lv-next" onClick={submit} disabled={busy || offline || missing.length > 0}>{busy ? "Sending…" : error ? "Try again" : "Submit"}</button>
        </div>
      </>,
    );
  }

  const last = step === total - 1;
  const go = () => (last ? setView("review") : setStep((s) => s + 1));
  return frame(
    <>
      <div className="lv-player-top">
        <span className="lv-row-sub" aria-label={`Question ${step + 1} of ${total}`}>{String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        {optional(step) ? <button type="button" className="lv-skip" onClick={go}>Skip</button> : <span className="lv-row-sub">Required</span>}
      </div>
      <div className="lv-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-label="Progress">
        {questions.map((_, i) => <i key={i} data-state={i < step ? "done" : i === step ? "current" : "todo"} />)}
      </div>
      <h1 className="lv-q-title" key={q?.question_id}>{q?.prompt}</h1>
      <div className="lv-q-controls">
        {q && <QuestionInput q={q} value={answers[q.question_id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.question_id]: v }))} />}
      </div>
      <div className="lv-player-nav">
        <button type="button" className="lv-circle-btn" aria-label="Back" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><Icon name="back" size={20} /></button>
        <button type="button" className="lv-next" onClick={go} disabled={!optional(step) && !answered(step)}>{last ? "Review" : "Next"}</button>
      </div>
    </>,
  );
}

export function GuestCampaign() {
  const { joinCode = "" } = useParams();
  const storageKey = `lv-guest-key-${joinCode}`;
  const [guestKey, setGuestKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) { setGuestKey(existing); return; }
      const key = randomKey();
      localStorage.setItem(storageKey, key);
      setGuestKey(key);
    } catch {
      // Storage blocked: fall back to an in-memory key for this page view only.
      setGuestKey(randomKey());
    }
  }, [storageKey]);

  if (!guestKey) return <div className="lv-player lv-player-light"><div className="lv-player-body"><Loading rows={2} /></div></div>;
  return <Player campaignId={joinCode} guest={{ joinCode, guestKey }} />;
}
