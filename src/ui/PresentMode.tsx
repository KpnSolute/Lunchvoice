import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import { Button } from "@/components/shadcn/button";
import { Icon } from "../components/Icon";
import { QrCode } from "@/components/shadcn/blocks/qr";
import type { AnalyticsResult, LvError, Question, ResponseRow } from "../lib/lvApi";
import { POLL_MS, barsFor, cloudSize, justAnswered, shortLink, wordCloud } from "../lib/present";
import { ANON_MIN_ANSWERS } from "../config/privacy";

type Dist = Extract<AnalyticsResult, { metric: "answer_distribution" }>;
type Count = Extract<AnalyticsResult, { metric: "participant_count" }>;

/** What a slide says when the server holds numbers back. Never zero. */
export function withheldMessage(e: Pick<LvError, "code">): string {
  if (e.code === "lv_policy_undecided") return "Shown when the survey closes";
  return "Waiting for more answers";
}

/**
 * Present mode: one question per slide on a projector. Full screen, arrow keys and buttons to move, Escape to leave.
 * It reads the same released results as the Results page (nothing extra is revealed): anonymous surveys show the
 * withheld message and never a name, and polling pauses while the tab is hidden.
 */
export function PresentMode({ campaignId, title, anonymity, joinCode, questions, onClose }: {
  campaignId: string; title: string; anonymity: "anonymous" | "identified"; joinCode: string | null; questions: Question[]; onClose: () => void;
}) {
  const { api } = useIdentity();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState<Count | null>(null);
  const [dists, setDists] = useState<Record<string, { d: Dist | null; e: LvError | null }>>({});
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const identified = anonymity === "identified";
  const q = questions[index];
  const qid = q?.question_id;
  const last = useRef<{ n: number | null; at: number }>({ n: null, at: 0 });

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, questions.length - 1)), [questions.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Keys: arrows, space and page keys move; Escape leaves. Focus lives on the dialog and returns when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    root.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; opener?.focus?.(); };
  }, []);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key) && !(e.target instanceof HTMLButtonElement && e.key === " ")) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); setIndex(0); }
    else if (e.key === "End") { e.preventDefault(); setIndex(questions.length - 1); }
  }

  // Poll every few seconds while the tab is visible; fetch again as soon as it comes back.
  useEffect(() => {
    let live = true;
    async function poll() {
      if (document.hidden) return;
      const c = await api.analytics(campaignId, "participant_count");
      if (!live) return;
      if (c.ok) setCount(c as unknown as Count);
      if (qid) {
        const r = await api.analytics(campaignId, "answer_distribution", qid);
        if (!live) return;
        setDists((m) => ({ ...m, [qid]: r.ok ? { d: r as unknown as Dist, e: null } : { d: null, e: r.error } }));
      }
      // Who answered (identified surveys only). Opening the list is audited, so only fetch it when the count moved.
      if (identified && c.ok) {
        const cc = c as unknown as Count;
        const n = (cc.n ?? 0) + (cc.guest_n ?? 0);
        if (last.current.n !== n && Date.now() - last.current.at > 3000) {
          last.current = { n, at: Date.now() };
          const rr = await api.campaignResponses(campaignId, 100, null);
          if (live && rr.ok) setResponses(rr.responses);
        }
      }
    }
    void poll();
    const t = window.setInterval(() => void poll(), POLL_MS);
    const vis = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { live = false; window.clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [api, campaignId, qid, identified]);

  const total = count && !count.suppressed && count.n !== null ? count.n + (count.guest_suppressed ? 0 : count.guest_n ?? 0) : null;
  const slide = qid ? dists[qid] : undefined;
  const link = joinCode ? shortLink(window.location.host, joinCode) : null;

  return (
    <div ref={root} className="lv-present" role="dialog" aria-modal="true" aria-label={`Presenting ${title}`} tabIndex={-1} onKeyDown={onKey} data-testid="present-dialog">
      <header className="lv-present-top">
        <p className="lv-present-title">{title}</p>
        <p className="lv-present-count" aria-live="polite" data-testid="present-count">
          {total === null ? <span>Waiting for more answers</span> : <><strong>{total}</strong> {total === 1 ? "answer" : "answers"}</>}
        </p>
        <Button variant="secondary" size="sm" onClick={onClose} data-testid="present-exit"><Icon name="close" size={16} />Exit</Button>
      </header>

      <main className="lv-present-stage">
        {!q ? (
          <p className="lv-present-q">This survey has no questions yet.</p>
        ) : (
          <>
            <p className="lv-present-step">Question {index + 1} of {questions.length}</p>
            <h2 className="lv-present-q" data-testid="present-question">{q.prompt}</h2>
            <SlideBody q={q} slide={slide} identified={identified} responses={responses} />
          </>
        )}
      </main>

      <footer className="lv-present-bottom">
        {link ? (
          <div className="lv-present-join" data-testid="present-join">
            <QrCode value={`${window.location.origin}/c/${joinCode}`} label="QR code to join this survey" size={88} />
            <div>
              <p className="lv-present-join-label">Join at</p>
              <p className="lv-present-link">{link}</p>
              <p className="lv-present-code">Code <strong>{joinCode}</strong></p>
            </div>
          </div>
        ) : <span />}
        {identified && responses.length > 0 && (
          <p className="lv-present-just" data-testid="present-just">Just answered: {justAnswered(responses.map((r) => r.name), 3) || "someone"}</p>
        )}
        <nav className="lv-present-nav" aria-label="Slides">
          <Button variant="secondary" onClick={prev} disabled={index === 0} aria-label="Previous question"><Icon name="back" size={18} /></Button>
          <Button variant="secondary" onClick={next} disabled={index >= questions.length - 1} aria-label="Next question"><Icon name="arrow" size={18} /></Button>
        </nav>
      </footer>
    </div>
  );
}

function SlideBody({ q, slide, identified, responses }: { q: Question; slide: { d: Dist | null; e: LvError | null } | undefined; identified: boolean; responses: ResponseRow[] }) {
  const texts = useMemo(() => {
    if (q.kind !== "text") return [];
    if (identified) return responses.map((r) => r.answers.find((a) => a.question_id === q.question_id)?.value).filter((v): v is string => typeof v === "string" && v.trim() !== "");
    return slide?.d && !slide.d.texts_withheld && slide.d.texts ? slide.d.texts : [];
  }, [q, identified, responses, slide]);

  if (!slide) return <p className="lv-present-wait" role="status">Loading…</p>;
  if (slide.e) return <p className="lv-present-wait" role="status" data-testid="present-withheld">{withheldMessage(slide.e)}</p>;
  const d = slide.d!;

  if (q.kind === "text") {
    if (!identified && (d.texts_withheld || !d.texts)) return <p className="lv-present-wait" role="status" data-testid="present-withheld">{d.texts_withheld ? "Shown when the survey closes" : "Waiting for more answers"}</p>;
    if (texts.length === 0) return <p className="lv-present-wait" role="status">Waiting for more answers</p>;
    const words = wordCloud(texts);
    const top = words[0]?.n ?? 1;
    return (
      <div className="lv-present-text">
        <ul className="lv-present-cloud" aria-label="Most used words" data-testid="present-cloud">
          {words.map((w) => <li key={w.word} style={{ fontSize: `${cloudSize(w.n, top)}rem` }}>{w.word}</li>)}
        </ul>
        <ul className="lv-present-answers" aria-label="Answers" data-testid="present-answers">
          {texts.slice(0, 50).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>
    );
  }

  const { bars, total, average } = barsFor(q, d.cells, !!d.withheld);
  if (d.withheld && d.cells.length === 0) return <p className="lv-present-wait" role="status" data-testid="present-withheld">Waiting for more answers<span className="lv-present-hint"> · results appear at {ANON_MIN_ANSWERS} answers</span></p>;
  const top = Math.max(1, ...bars.map((b) => b.n ?? 0));
  return (
    <div className="lv-present-bars" data-testid="present-bars">
      {average !== null && <p className="lv-present-avg" data-testid="present-average">Average <strong>{average}</strong> of 5</p>}
      <ul>
        {bars.map((b) => (
          <li key={b.key} data-testid="present-bar">
            <span className="lv-present-bar-label">{b.label}</span>
            <span className="lv-present-track" aria-hidden="true">
              {b.n !== null && <span className="lv-present-fill" style={{ width: `${(b.n / top) * 100}%` }} />}
            </span>
            <span className="lv-present-bar-n">{b.n === null ? "Withheld" : <><strong>{b.n}</strong>{b.pct !== null && <span> · {b.pct}%</span>}</>}</span>
          </li>
        ))}
      </ul>
      {total === null && <p className="lv-present-hint">Some answers are withheld to protect anonymity. They are not zero.</p>}
    </div>
  );
}
