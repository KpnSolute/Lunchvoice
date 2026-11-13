import { LvMark } from "../components/LvMark";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import type { Answer, GuestNamesMode } from "../lib/lvApi";
import { Loading, campaignPhase, LinkButton } from "../components/ui";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { ReportSurvey } from "./ReportSurvey";
import { Icon } from "../components/Icon";
import { describeError } from "../lib/errors";
import { useBusy } from "../lib/busy";
import { QuestionInput, summarize } from "../ui/QuestionControls";
import { answerValueProblem, CORE_KINDS, IDENTIFIED_ONLY } from "../lib/questionKinds"; // v2 question types (000047)
import { StateScreen } from "../ui/StateScreen";
import { hasSections, longestPath, sectionsOf, visibleQuestions } from "../lib/sections";
import { START_SURVEY } from "../lib/billingState";
import { BrandBanner, BrandMedia, usePlayerTheme } from "../ui/PlayerTheme"; // survey branding (000043)

/**
 * The respondent player (L9): welcome, one question per screen, review, thanks.
 * Mobile first, max 560px, no Hub navigation, no signature. Powered by LunchVoice sits at the foot.
 */

// LC-11: the guest key comes from the CSPRNG (256 bits, hex), never Math.random.
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

function PoweredBy() {
  return (
    <p className="lv-powered">
      Powered by <LvMark size={16} /> <strong>LunchVoice</strong>
    </p>
  );
}

type View = "welcome" | "question" | "review";

export function Player({ campaignId, guest, embedded = false }: { campaignId: string; guest?: { joinCode: string; guestKey: string }; embedded?: boolean }) {
  const { api, session } = useIdentity();
  const detail = useLv(() => (guest ? api.guestCampaignGet(guest.joinCode) : api.campaignGet(campaignId)), [api, campaignId, guest?.joinCode]);
  const [view, setView] = useState<View>("welcome");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const [receipt, setReceipt] = useState<{ id: string; duplicate: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Direction of the last move, so the question stage slides the right way (Back slides from the left).
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  useBusy("player", true); // keeps the "new version" notice from appearing while someone is answering
  const draftKey = `lv-draft-${guest?.joinCode ?? campaignId}`;
  // 000028: an identified survey may ask guests for a name (optional or required). Kept on this device between visits.
  const nameKey = `lv-guest-name-${guest?.joinCode ?? campaignId}`;
  const [guestName, setGuestName] = useState<string>(() => { try { return localStorage.getItem(nameKey) ?? ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem(nameKey, guestName); } catch { /* ignore */ } }, [guestName, nameKey]);
  // 000052: a signed-in person may answer under a name of their choice (a preferred name, "Maurice from Corporate").
  // Empty means "use my account name". Kept on this device per survey; only a label, never an identity.
  const accountNameKey = `lv-account-name-${campaignId}`;
  const [accountName, setAccountName] = useState<string>(() => { try { return localStorage.getItem(accountNameKey) ?? ""; } catch { return ""; } });
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => { try { localStorage.setItem(accountNameKey, accountName); } catch { /* ignore */ } }, [accountName, accountNameKey]);
  const cleanAccountName = accountName.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();

  const d = detail.data;
  // Survey branding (000043): the survey's own theme, or none. Never changes questions, answers or anonymity.
  const pt = usePlayerTheme(d?.campaign.campaign_id);
  const allQuestions = d?.questions ?? [];
  // 000041: only the sections this person's earlier answers open. Rules look back, so earlier steps never move.
  const questions = visibleQuestions(allQuestions, answers);
  const sectionStarts = new Map(sectionsOf(allQuestions).filter((s) => s.title).map((s) => [s.questions[0]!.question_id, s]));
  const q = questions[step];
  const section = q ? sectionStarts.get(q.question_id) : undefined;
  const namesMode: GuestNamesMode = guest && d?.campaign.anonymity === "identified" ? (d.campaign.guest_names ?? "off") : "off";
  // File answers go to the private bucket and need a signed-in person (guests have no folder of their own).
  const uploadFile = guest ? undefined : (f: File) => api.uploadAnswerFile(campaignId, f);
  const cleanName = guestName.replace(/\s+/g, " ").trim();
  const nameMissing = namesMode === "required" && !cleanName;

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!allQuestions.length) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setAnswers(JSON.parse(raw));
    } catch { /* storage unavailable: drafts simply do not resume */ }
  }, [draftKey, allQuestions.length]);

  useEffect(() => {
    // Names, contact details, consent and signatures are not kept on the device between visits.
    try { localStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(Object.entries(answers).filter(([id]) => !allQuestions.some((x) => x.question_id === id && IDENTIFIED_ONLY.includes(x.kind)))))); } catch { /* ignore */ }
  }, [answers, draftKey]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const payload: Answer[] = questions.map((qq) => { const v = answers[qq.question_id] ?? null; return { question_id: qq.question_id, value: v !== null && !(CORE_KINDS as readonly string[]).includes(qq.kind) && answerValueProblem(qq.kind, qq.config, v) ? null : v }; });
    const r = guest ? await api.guestSubmit(guest.joinCode, guest.guestKey, payload, namesMode === "off" ? null : cleanName || null) : await api.submit(campaignId, payload, d?.campaign.anonymity === "identified" && session ? cleanAccountName || null : null);
    setBusy(false);
    if (r.ok) {
      setReceipt({ id: r.receipt_id, duplicate: r.duplicate });
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    } else setError(describeError(r.error));
  }

  const frame = (children: React.ReactNode, tone: "light" | "ink" = "light") => (
    <div className={`lv-player lv-player-${tone}${embedded ? " lv-player-embedded" : ""}${pt.frameProps.className}`} style={pt.frameProps.style} {...pt.frameProps.attrs}>
      <div className="lv-player-body">{children}</div>
      {!pt.hideFooter && <PoweredBy />}
    </div>
  );

  // A link-token visit reports by the typed join code the server returns (000018, LC-10).
  const reportCode = d?.join_code ?? guest?.joinCode ?? null;
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
          detail={code === "lv_not_found" ? "Check the code or link and try again. It may also have been removed." : describeError(detail.error)}
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
      <div className="lv-thanks" data-testid="player-thanks">
        {/* survey branding (000043): the logo above the check */}
        <BrandBanner t={pt} />
        <span className="lv-thanks-mark" aria-hidden="true">
          <span className="lv-burst">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ "--a": `${i * 30}deg`, "--d": `${i % 3}` } as React.CSSProperties} />)}</span>
          <span className="lv-thanks-check">
            <svg viewBox="0 0 52 52" width="44" height="44"><path className="lv-check-path" d="M14 27.5 22.5 36 39 18" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </span>
        <h1 className="lv-thanks-title">{receipt?.duplicate || (!receipt && d.has_responded) ? <>Already in.<br /><em>Thanks.</em></> : <>Thanks.<br /><em>You're heard.</em></>}</h1>
        {pt.theme?.thank_you && !(receipt?.duplicate || (!receipt && d.has_responded)) && <p className="lv-pt-message" data-testid="brand-thanks">{pt.theme.thank_you}</p>}
        <p className="lv-thanks-copy">
          {receipt?.duplicate || (!receipt && d.has_responded)
            ? "You had already answered, so we kept your original response and didn't store a second one."
            : d.campaign.anonymity === "anonymous"
              ? "Your answers went in anonymously. The creator sees totals, never names."
              : guest && cleanName && namesMode !== "off"
                ? `Your answers were recorded under the name “${cleanName}”. The creator can see them.`
                : !guest && session && cleanAccountName
                  ? `Your answers were recorded under the name “${cleanAccountName}”. The creator can see them.`
                : "Your answers were recorded. The creator can see who answered."}
        </p>
        {(receipt?.id || d.receipt_id) && <p className="lv-thanks-receipt">Receipt {receipt?.id ?? d.receipt_id}</p>}
        <div className="lv-thanks-next" data-testid="thanks-next">
          <LinkButton to={START_SURVEY.to} variant="primary">Make your own survey, free</LinkButton>
          <LinkButton to="/" variant="secondary" className="lv-thanks-done">Done</LinkButton>
        </div>
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
  // Before the first answer, conditional sections are closed: the welcome screen counts the longest path instead.
  const planned = view === "welcome" ? longestPath(allQuestions) : total;
  const minutes = Math.max(1, Math.round(planned * 0.3));
  const anonymous = d.campaign.anonymity === "anonymous";
  const answered = (i: number) => {
    const q = questions[i]!;
    const v = answers[q.question_id];
    const some = v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    // The v2 kinds are only answered when the whole value is valid (a half-filled grid or contact form is not an answer).
    return some && ((CORE_KINDS as readonly string[]).includes(q.kind) || answerValueProblem(q.kind, q.config, v) === null);
  };
  // Compliance LC-03: every question is required unless its config says optional; the promises must be true.
  const optional = (i: number) => Boolean((questions[i]?.config as { optional?: boolean } | undefined)?.optional);
  const anyOptional = questions.some((_, i) => optional(i));
  const missing = questions.map((_, i) => i).filter((i) => !optional(i) && !answered(i));
  const privacyPromise = guest
    ? { title: "No account needed", body: anonymous ? "Guests answer without signing in. Your answers aren’t linked to you, and guests never count as members." : `Guests answer without signing in. The creator can see the answers you give${namesMode !== "off" ? " and the name you type" : ""}, and guests never count as members.` }
    : anonymous
      ? { title: "Anonymous", body: "Your answers are never linked to your name; you sign in only so we can count you once." }
      : { title: "Not anonymous", body: "The creator can see who answered and what they said." };

  if (view === "welcome") {
    return frame(
      <>
        <div className={`lv-player-hero lv-enter${pt.theme && pt.theme.banner_style !== "logo" ? " lv-pt-hero" : ""}`} style={{ "--i": 0 } as React.CSSProperties} data-testid="player-hero">
          <BrandMedia t={pt} />
          <span className="lv-eyebrow-mono" style={{ color: "var(--lv-accent)" }}>{guest ? "Open to guests" : "You're invited"}</span>
          <h1 className="lv-player-title">{pt.theme?.welcome_headline || d.campaign.title}</h1>
          {pt.theme?.welcome_headline && <p className="lv-pt-subtitle">{d.campaign.title}</p>}
          <div className="lv-player-hero-foot">
            <span className="lv-row-sub" style={{ color: "inherit", opacity: 0.8 }}>{hasSections(allQuestions) && planned !== allQuestions.length ? "Up to " : ""}{planned} {planned === 1 ? "question" : "questions"} · ~{minutes} min</span>
            <Button variant="primary" onClick={() => { setDir("fwd"); setStep(0); setView("question"); }} disabled={total === 0 || nameMissing} data-testid="player-start">
              Start <Icon name="arrow" size={16} />
            </Button>
          </div>
        </div>
        {namesMode !== "off" && (
          <div className="lv-guest-name lv-enter" style={{ "--i": 1 } as React.CSSProperties} data-testid="guest-name">
            <label htmlFor="guest-name-input" className="lv-guest-name-label">
              Your name {namesMode === "optional" && <span className="lv-row-sub">(optional)</span>}
            </label>
            <Input id="guest-name-input" value={guestName} maxLength={40} autoComplete="nickname" placeholder="First name or a nickname" onChange={(e) => setGuestName(e.target.value)} aria-describedby="guest-name-help" />
            <p id="guest-name-help" className="lv-row-sub lv-m0">{namesMode === "required" ? "The creator needs a name to see who answered. " : "The creator sees this next to your answers. "}It isn’t verified.</p>
          </div>
        )}
        {/* Who is answering (founder request 2026-11-13): guests can sign in instead; signed-in people see their name. */}
        {guest && !session && (
          <div className="lv-identity-choice lv-enter" style={{ "--i": 1 } as React.CSSProperties} data-testid="guest-signin">
            <div>
              <strong>Have a LunchVoice account?</strong>
              <p className="lv-row-sub lv-m0">{anonymous ? "Sign in so you’re counted once. Your answers still aren’t linked to you." : "Sign in to answer as yourself instead of typing a name."}</p>
            </div>
            <Button asChild variant="secondary"><Link to="/signin" state={{ from: `/c/${guest.joinCode}` }}>Sign in</Link></Button>
          </div>
        )}
        {!guest && session && !anonymous && (
          <div className="lv-identity-chip-wrap lv-enter" style={{ "--i": 1 } as React.CSSProperties}>
            <p className="lv-identity-chip" data-testid="answering-as">
              <Icon name="check" size={16} /> Answering as <strong>{cleanAccountName || session.name || "you"}</strong>
              {!editingName && (
                <button type="button" className="lv-linklike" data-testid="change-name" onClick={() => { setNameDraft(cleanAccountName || session.name || ""); setEditingName(true); }}>Change</button>
              )}
            </p>
            {editingName && (
              <form className="lv-guest-name" data-testid="change-name-form" onSubmit={(e) => { e.preventDefault(); const next = nameDraft.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim(); setAccountName(next === (session.name ?? "") ? "" : next); setEditingName(false); }}>
                <label htmlFor="account-name-input" className="lv-guest-name-label">Name on your answers</label>
                <Input id="account-name-input" value={nameDraft} maxLength={40} autoComplete="nickname" autoFocus onChange={(e) => setNameDraft(e.target.value)} aria-describedby="account-name-help" />
                <p id="account-name-help" className="lv-row-sub lv-m0">The creator sees this next to your answers, tagged as an account. Your account stays the same.</p>
                <div className="lv-btn-row">
                  <Button type="submit" variant="primary">Use this name</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingName(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        )}
        {!guest && session && anonymous && (
          <p className="lv-identity-chip lv-enter" style={{ "--i": 1 } as React.CSSProperties} data-testid="anonymous-note">
            <Icon name="lock" size={16} /> Your answers are anonymous
          </p>
        )}
        <ul className="lv-promises">
          <li className="lv-enter" style={{ "--i": 1 } as React.CSSProperties}><span><Icon name="lock" size={18} /></span><div><strong>{privacyPromise.title}</strong><p>{privacyPromise.body}</p></div></li>
          <li className="lv-enter" style={{ "--i": 2 } as React.CSSProperties}><span><Icon name="check" size={18} /></span><div><strong>{anyOptional ? "Some questions are optional" : "Every question needs an answer"}</strong><p>{anyOptional ? "Optional questions are marked. Answer the rest to submit." : "You can go back and change answers before you submit."}</p></div></li>
          <li className="lv-enter" style={{ "--i": 3 } as React.CSSProperties}><span><Icon name="clock" size={18} /></span><div><strong>About {minutes} {minutes === 1 ? "minute" : "minutes"}</strong><p>Mostly taps.</p></div></li>
        </ul>
        {report}
      </>,
    );
  }

  if (view === "review") {
    return frame(
      <>
        <div className="lv-q-stage" data-dir={dir} data-testid="player-stage" data-view="review">
        <h1 className="lv-q-title">Review your answers</h1>
        <ul className="lv-review">
          {questions.map((qq, i) => (
            <li key={qq.question_id}>
              <div>
                <span className="lv-row-sub">Question {i + 1}</span>
                <strong>{qq.prompt}</strong>
                <span className={answered(i) ? "" : "lv-skipped"}>{!answered(i) && !optional(i) ? "Needs an answer" : summarize(qq, answers[qq.question_id])}</span>
              </div>
              <Button variant="quiet" size="sm" onClick={() => { setDir("back"); setStep(i); setView("question"); }}>Edit</Button>
            </li>
          ))}
        </ul>
        {offline && <p className="lv-banner" role="status">You're offline. Your answers are saved on this device; send them when you're back online.</p>}
        {missing.length > 0 && <p className="lv-banner" role="status">Answer {missing.length === 1 ? "question" : "questions"} {missing.map((i) => i + 1).join(", ")} to submit.</p>}
        {error && <p className="lv-banner lv-banner-err" role="alert">{error}</p>}
        </div>
        <div className="lv-player-nav">
          <button type="button" className="lv-circle-btn" aria-label="Back to questions" onClick={() => { setDir("back"); setStep(total - 1); setView("question"); }}><Icon name="back" size={20} /></button>
          <button type="button" className="lv-next" onClick={submit} disabled={busy || offline || missing.length > 0}>{busy ? "Sending…" : error ? "Try again" : "Submit"}</button>
        </div>
      </>,
    );
  }

  const last = step === total - 1;
  const canGo = optional(step) || answered(step);
  const go = () => { setDir("fwd"); if (last) setView("review"); else setStep((s) => s + 1); };
  const back = () => { setDir("back"); setStep((s) => s - 1); };
  const pct = Math.round(((step + (canGo ? 1 : 0.5)) / total) * 100);
  return frame(
    <div
      className="lv-q-wrap"
      onKeyDown={(e) => {
        // Enter moves on (never from inside the text box, where Enter is a new line).
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement && e.target.classList.contains("lv-circle-btn")) && canGo) {
          e.preventDefault();
          go();
        }
      }}
    >
      <div className="lv-player-top">
        <span className="lv-row-sub" aria-label={`Question ${step + 1} of ${total}`}>{String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        {optional(step) ? <button type="button" className="lv-skip" onClick={go}>Skip</button> : <span className="lv-row-sub">Required</span>}
      </div>
      <div className="lv-glide" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-valuetext={`Question ${step + 1} of ${total}`} aria-label="Progress" data-testid="player-progress">
        <b style={{ width: `${pct}%` }} />
      </div>
      <div className="lv-q-stage" key={`${step}-${q?.question_id}`} data-dir={dir} data-testid="player-stage" data-step={step}>
        {section && (
          <div className="lv-q-section" data-testid="player-section">
            <span className="lv-eyebrow-mono">{section.title}</span>
            {section.description && <p className="lv-q-section-desc">{section.description}</p>}
          </div>
        )}
        <h1 className="lv-q-title">{q?.prompt}</h1>
        <div className="lv-q-controls">
          {q && <QuestionInput q={q} value={answers[q.question_id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.question_id]: v }))} upload={uploadFile} />}
        </div>
      </div>
      <div className="lv-player-nav">
        <button type="button" className="lv-circle-btn" aria-label="Back" disabled={step === 0} onClick={back}><Icon name="back" size={20} /></button>
        <button type="button" className="lv-next" onClick={go} disabled={!canGo}>{last ? "Review" : "Next"}</button>
      </div>
    </div>,
  );
}

export function GuestCampaign() {
  const { joinCode = "" } = useParams();
  const { session } = useIdentity();
  // Signed in: answer with the account (members and link-open surveys), not as a guest.
  if (session) return <SignedInByCode joinCode={joinCode} />;
  return <GuestByCode joinCode={joinCode} />;
}

function SignedInByCode({ joinCode }: { joinCode: string }) {
  const { api } = useIdentity();
  const found = useLv(() => api.campaignByCode(joinCode), [api, joinCode]);
  if (found.loading) return <div className="lv-player lv-player-light"><div className="lv-player-body"><Loading rows={2} /></div></div>;
  const id = found.data?.campaign_id;
  // Not eligible with this account (or the lookup is not deployed yet): the guest player explains it or lets them answer.
  if (!id) return <GuestByCode joinCode={joinCode} />;
  return <Player campaignId={id} />;
}

function GuestByCode({ joinCode }: { joinCode: string }) {
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
