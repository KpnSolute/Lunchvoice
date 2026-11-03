import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import type { CampaignMode, Question, QuestionKind, Anonymity } from "../lib/lvApi";
import { Btn, Card, CopyField, Empty, ErrorNote, Loading, Metric, Micro, Notice, PageHead, PhaseBadge, Pill, campaignPhase } from "../components/ui";
import { Icon } from "../components/Icon";
import { describeError, describeGate } from "../lib/errors";
import { can, useHubCtx } from "./Hub";
import { Player } from "./Player";

/* ------------------------------------------------------------------ list */

export function Campaigns() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const manage = can(membership, "campaign.manage");

  return (
    <div className="ui-stack ui-gap-16">
      <div className="ui-spread">
        <div>
          <Micro>{manage ? "Manage" : "Participate"}</Micro>
          <h2 className="ui-display ui-display-md" style={{ margin: "6px 0 0" }}>Campaigns</h2>
        </div>
        {manage && <Link className="ui-btn ui-btn-primary" to={`/${hub.slug}/campaigns/new`}><Icon name="plus" size={16} />New Campaign</Link>}
      </div>

      {list.loading && <Loading rows={3} />}
      {list.error && <ErrorNote error={list.error} />}
      {!list.loading && (list.data?.campaigns.length ?? 0) === 0 && (
        <Empty
          icon="survey"
          title="No Campaigns yet"
          action={manage ? <Link className="ui-btn ui-btn-primary" to={`/${hub.slug}/campaigns/new`}>Create the first one</Link> : undefined}
        >
          {manage ? "A Campaign is one set of questions with a lifecycle: draft, scheduled, open, closed." : "When a manager publishes a Campaign it appears here, ready to answer."}
        </Empty>
      )}

      {(list.data?.campaigns.length ?? 0) > 0 && (
        <div className="ui-grid-2">
          {list.data!.campaigns.map((c) => {
            const phase = campaignPhase(c);
            return (
              <Link key={c.campaign_id} to={`/${hub.slug}/campaigns/${c.campaign_id}`} className="ui-card" style={{ color: "inherit" }}>
                <div className="ui-spread" style={{ marginBottom: 10 }}>
                  <PhaseBadge phase={phase} />
                  <span className="ui-mono ui-muted" style={{ fontSize: 11 }}>{c.mode}</span>
                </div>
                <h3 className="ui-display ui-display-md" style={{ margin: "0 0 6px" }}>{c.title}</h3>
                <div className="ui-row ui-gap-8">
                  <Pill tone={c.anonymity === "anonymous" ? "ok" : "muted"}>{c.anonymity}</Pill>
                  <span className="ui-muted" style={{ fontSize: 13 }}>{c.question_count} {c.question_count === 1 ? "question" : "questions"}</span>
                  {c.has_responded && <Pill tone="ink">Answered</Pill>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ new */

const MODES: { key: CampaignMode; label: string; body: string; soon?: boolean }[] = [
  { key: "survey", label: "Survey", body: "Several questions, one screen at a time." },
  { key: "poll", label: "Poll", body: "One choice question, fast to answer." },
  { key: "rating", label: "Rating", body: "A score from 1 to 5." },
  { key: "feedback", label: "Feedback", body: "An open answer, unpublished in results." },
  { key: "poll", label: "Election", body: "Ranked options with a ballot.", soon: true },
  { key: "poll", label: "Seasonal", body: "Time-bounded seasonal Campaign.", soon: true },
];

export function NewCampaign() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<CampaignMode>("survey");
  const [anonymity, setAnonymity] = useState<Anonymity>("anonymous");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await api.campaignCreate(hub.hub_id, title.trim(), mode, anonymity);
    setBusy(false);
    if (r.ok) nav(`/${hub.slug}/campaigns/${r.campaign_id}/studio`);
    else setError(describeError(r.error));
  }

  return (
    <div className="ui-stack ui-gap-16">
      <PageHead eyebrow="New Campaign" title="Start a Campaign" sub="It starts as a draft: nothing is visible to members until you activate it." />
      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}

      <Card>
        <div className="ui-field">
          <label className="ui-label" htmlFor="c-title">Title</label>
          <input id="c-title" className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Which night works for the meetup?" maxLength={120} />
        </div>

        <span className="ui-label">Mode</span>
        <div className="ui-grid-3" style={{ margin: "8px 0 16px" }}>
          {MODES.map((m) => (
            <button
              key={m.label}
              type="button"
              className={`ui-choice ${mode === m.key && !m.soon ? "active" : ""}`}
              aria-pressed={!m.soon && mode === m.key}
              disabled={m.soon}
              onClick={() => setMode(m.key)}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, opacity: m.soon ? 0.55 : 1 }}
            >
              <strong>{m.label}{m.soon ? " · coming soon" : ""}</strong>
              <span className="ui-muted" style={{ fontSize: 13 }}>{m.body}</span>
            </button>
          ))}
        </div>

        <span className="ui-label">Participation</span>
        <div className="ui-grid-2" style={{ margin: "8px 0 16px" }}>
          {(["anonymous", "identified"] as Anonymity[]).map((a) => (
            <button key={a} type="button" className="ui-choice" aria-pressed={anonymity === a} onClick={() => setAnonymity(a)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <strong>{a}</strong>
              <span className="ui-muted" style={{ fontSize: 13 }}>{a === "anonymous" ? "Answers cannot be traced to a person." : "Managers can see who answered."}</span>
            </button>
          ))}
        </div>

        <Btn variant="primary" disabled={!title.trim() || busy} onClick={create} icon="arrow">{busy ? "Creating…" : "Create draft"}</Btn>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ player */

/* ------------------------------------------------------------------ detail */

export function CampaignDetail() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const { id = "" } = useParams();
  const detail = useLv(() => api.campaignGet(id), [api, id]);

  if (detail.loading) return <Loading rows={3} label="Loading Campaign" />;
  if (detail.error) return <Card><ErrorNote error={detail.error} /></Card>;
  const d = detail.data;
  if (!d) return null;

  return (
    <div className="ui-stack ui-gap-16">
      <div className="ui-spread">
        <div>
          <div className="ui-row ui-gap-8" style={{ marginBottom: 6 }}>
            <PhaseBadge phase={campaignPhase(d.campaign)} />
            <Pill tone={d.campaign.anonymity === "anonymous" ? "ok" : "muted"}>{d.campaign.anonymity}</Pill>
            <Micro>{d.campaign.mode}</Micro>
          </div>
          <h1 className="ui-display ui-display-lg" style={{ margin: 0 }}>{d.campaign.title}</h1>
        </div>
        {d.can_manage && (
          <div className="ui-row">
            <Link className="ui-btn ui-btn-outline" to={`/${hub.slug}/campaigns/${id}/studio`}>Studio</Link>
            <Link className="ui-btn ui-btn-outline" to={`/${hub.slug}/campaigns/${id}/results`}>Results</Link>
          </div>
        )}
      </div>
      <Player campaignId={id} embedded />
    </div>
  );
}

/* ------------------------------------------------------------------ studio */

const KINDS: { key: QuestionKind; label: string }[] = [
  { key: "rating", label: "Rating 1–5" },
  { key: "single_choice", label: "Single choice" },
  { key: "multi_choice", label: "Multiple choice" },
  { key: "yes_no", label: "Yes / No" },
  { key: "text", label: "Open answer" },
];

export function Studio() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const { id = "" } = useParams();
  const detail = useLv(() => api.campaignGet(id), [api, id]);
  const [kind, setKind] = useState<QuestionKind>("rating");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const d = detail.data;
  const phase = d ? campaignPhase(d.campaign) : null;
  const lockable = phase === "open" || phase === "ended";

  async function addQuestion() {
    if (!d) return;
    setBusy(true);
    setError(null);
    const config = kind === "single_choice" || kind === "multi_choice"
      ? { options: options.split("\n").map((o) => o.trim()).filter(Boolean) }
      : {};
    const r = await api.questionAdd(id, d.questions.length, kind, prompt.trim(), config);
    setBusy(false);
    if (r.ok) { setPrompt(""); setOptions(""); detail.reload(); }
    else setError(describeError(r.error));
  }

  async function activate() {
    setBusy(true);
    setGate(null);
    const r = await api.campaignActivate(id);
    setBusy(false);
    if (r.ok) detail.reload();
    else if (r.error.code === "lv_gate_blocked") setGate(describeGate(r.error.reasons));
    else setError(describeError(r.error));
  }
  async function close() {
    const r = await api.campaignClose(id);
    if (r.ok) detail.reload(); else setError(describeError(r.error));
  }

  if (detail.loading) return <Loading rows={3} />;
  if (detail.error) return <Card><ErrorNote error={detail.error} /></Card>;
  if (!d) return null;

  return (
    <div className="ui-stack ui-gap-16">
      <div className="ui-spread">
        <div>
          <Micro>Studio</Micro>
          <h1 className="ui-display ui-display-lg" style={{ margin: "6px 0 0" }}>{d.campaign.title}</h1>
          <div className="ui-row ui-gap-8" style={{ marginTop: 8 }}>
            <PhaseBadge phase={phase!} />
            <Micro>{d.questions.length} questions</Micro>
          </div>
        </div>
        <div className="ui-row">
          {phase === "draft" && <Btn variant="primary" onClick={activate} disabled={busy}>Publish</Btn>}
          {(phase === "open" || phase === "scheduled") && <Btn variant="outline" onClick={close}>Close</Btn>}
          <Link className="ui-btn ui-btn-outline" to={`/${hub.slug}/campaigns/${id}/results`}>Results</Link>
        </div>
      </div>

      {error && <ErrorNote error={{ code: "lv_server_error", message: error }} />}
      {gate && (
        <Notice tone="warn">
          <strong>Can't publish yet</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{gate.map((g) => <li key={g}>{g}</li>)}</ul>
        </Notice>
      )}

      {d.join_code && (
        <Card quiet>
          <Micro>Guest link</Micro>
          <div style={{ marginTop: 8 }}>
            <CopyField value={`https://lunchvoice.com/c/${d.join_code}`} />
          </div>
        </Card>
      )}

      <Card>
        <Micro>Questions</Micro>
        {d.questions.length === 0 ? (
          <div style={{ marginTop: 10 }}><Empty icon="survey" title="No questions yet">Add at least one before you publish.</Empty></div>
        ) : (
          <ol style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            {d.questions.map((q) => (
              <li key={q.question_id}>
                <span>{q.prompt}</span>{" "}
                <Micro>{KINDS.find((k) => k.key === q.kind)?.label ?? q.kind}</Micro>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <Micro accent>{lockable ? "Locked — published Campaigns can't be edited" : "Add a question"}</Micro>
        <div className="ui-grid-2" style={{ marginTop: 12, alignItems: "start" }}>
          <div>
            <div className="ui-field">
              <label className="ui-label" htmlFor="q-kind">Kind</label>
              <select id="q-kind" className="ui-select" value={kind} onChange={(e) => setKind(e.target.value as QuestionKind)} disabled={lockable}>
                {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            <div className="ui-field">
              <label className="ui-label" htmlFor="q-prompt">Prompt</label>
              <input id="q-prompt" className="ui-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="How was the venue?" disabled={lockable} />
            </div>
          </div>
          <div>
            {(kind === "single_choice" || kind === "multi_choice") && (
              <div className="ui-field">
                <label className="ui-label" htmlFor="q-options">Options, one per line</label>
                <textarea id="q-options" className="ui-textarea" value={options} onChange={(e) => setOptions(e.target.value)} disabled={lockable} placeholder={"Morning\nAfternoon\nEvening"} />
              </div>
            )}
            <Btn variant="ink" disabled={lockable || !prompt.trim() || busy} onClick={addQuestion} icon="plus">
              {busy ? "Adding…" : "Add question"}
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ results */

export function Results() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const { id = "" } = useParams();
  const detail = useLv(() => api.campaignGet(id), [api, id]);
  const participants = useLv(() => api.analytics(id, "participant_count"), [api, id]);
  const d = detail.data;

  const distributions = useMemo(() => (d?.questions ?? []).filter((q) => q.kind !== "text"), [d]);

  return (
    <div className="ui-stack ui-gap-16">
      <div className="ui-spread">
        <div>
          <Micro>Results</Micro>
          <h1 className="ui-display ui-display-lg" style={{ margin: "6px 0 0" }}>{d?.campaign.title ?? "Results"}</h1>
        </div>
        <div className="ui-row">
          <Btn variant="outline" disabled title="No export API yet">Export</Btn>
          <Link className="ui-btn ui-btn-outline" to={`/${hub.slug}/campaigns/${id}`}>Open Campaign</Link>
        </div>
      </div>

      {participants.loading && <Loading rows={2} />}
      {participants.error && <ErrorNote error={participants.error} />}
      {participants.data && participants.data.metric === "participant_count" && (
        <Card>
          {participants.data.suppressed ? (
            <div className="ui-stack ui-gap-4">
              <span className="ui-metric">Withheld</span>
              <Micro>participants</Micro>
              <p className="ui-help" style={{ margin: "6px 0 0" }}>Too few responses to publish without exposing who answered.</p>
            </div>
          ) : (
            <Metric value={participants.data.n ?? 0} label="participants" hint="Guests are never counted as members." />
          )}
        </Card>
      )}

      {distributions.map((q) => <QuestionResults key={q.question_id} campaignId={id} question={q} />)}

      <Notice tone="info">Free-text answers are never published. A suppressed cell is shown as withheld, never as zero.</Notice>
    </div>
  );
}

function QuestionResults({ campaignId, question }: { campaignId: string; question: Question }) {
  const { api } = useIdentity();
  const q = useLv(() => api.analytics(campaignId, "answer_distribution", question.question_id), [api, campaignId, question.question_id]);

  return (
    <Card>
      <Micro>{question.kind.replace("_", " ")}</Micro>
      <h3 className="ui-display ui-display-md" style={{ margin: "6px 0 12px" }}>{question.prompt}</h3>
      {q.loading && <Loading rows={2} />}
      {q.error && <p className="ui-muted">{describeError(q.error)}</p>}
      {q.data && q.data.metric === "answer_distribution" && (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th>Answer</th><th style={{ textAlign: "right" }}>Responses</th></tr></thead>
            <tbody>
              {q.data.cells.map((cell) => (
                <tr key={cell.key}>
                  <td>{cell.key}</td>
                  <td style={{ textAlign: "right" }} className="ui-mono">
                    {cell.suppressed || cell.n === null ? (
                      <span className="ui-muted" title={cell.reason === "below_min_cohort" ? "Too few responses in this cohort" : cell.reason === "complementary" ? "Would let the withheld cohort be calculated" : undefined}>
                        Withheld
                      </span>
                    ) : cell.n}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
