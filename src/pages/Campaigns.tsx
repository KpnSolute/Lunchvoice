import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import type { Answer, CampaignDetailData, CampaignMode, Anonymity, Question, QuestionKind } from "../lib/lvApi";
import { useLv } from "../lib/useLv";
import { can, useHubCtx } from "./Hub";

const MODES: CampaignMode[] = ["survey", "poll", "rating", "feedback"];
const KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: "rating", label: "Rating (1–5)" },
  { kind: "yes_no", label: "Yes / No" },
  { kind: "single_choice", label: "Single choice" },
  { kind: "multi_choice", label: "Multiple choice" },
  { kind: "text", label: "Free text" },
];

export function Campaigns() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const nav = useNavigate();
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<CampaignMode>("survey");
  const [anonymity, setAnonymity] = useState<Anonymity>("anonymous");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const r = await api.campaignCreate(hub.hub_id, title, mode, anonymity);
    if (r.ok) nav(`/${hub.slug}/campaigns/${r.campaign_id}`); else setError(r.error.message);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <div className="notice" role="alert">{error}</div>}
      <section className="card stack">
        <h2>Campaigns</h2>
        {list.loading ? <p className="muted">Loading…</p> : list.error ? <p className="muted">{list.error.message}</p> : list.data?.campaigns.length === 0 ? (
          <p className="muted">No Campaigns yet.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {list.data?.campaigns.map((c) => (
              <li key={c.campaign_id} className="row" style={{ justifyContent: "space-between" }}>
                <Link to={`/${hub.slug}/campaigns/${c.campaign_id}`}>{c.title}</Link>
                <span className="mono muted">{c.mode} · {c.status}{c.has_responded ? " · answered" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {can(membership, "campaign.manage") && (
        <section className="card stack">
          <h2>New Campaign</h2>
          <label className="stack">Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="row2">
            <label className="stack">Mode
              <select value={mode} onChange={(e) => setMode(e.target.value as CampaignMode)}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="stack">Responses
              <select value={anonymity} onChange={(e) => setAnonymity(e.target.value as Anonymity)}>
                <option value="anonymous">Anonymous</option>
                <option value="identified">Identified</option>
              </select>
            </label>
          </div>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={create}>Create draft</button>
        </section>
      )}
    </div>
  );
}

export function CampaignDetail() {
  const { id = "" } = useParams();
  const { api } = useIdentity();
  const { hub } = useHubCtx();
  const q = useLv(() => api.campaignGet(id), [api, id]);
  if (q.loading) return <p className="muted" role="status">Loading…</p>;
  if (q.error || !q.data) return <div className="card"><p>{q.error?.message ?? "Campaign not available."}</p><Link to={`/${hub.slug}/campaigns`}>Back to Campaigns</Link></div>;
  const d = q.data;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div><div className="eyebrow">{d.campaign.mode} · {d.campaign.status}</div><h2>{d.campaign.title}</h2></div>
      {d.can_manage && <Studio data={d} reload={q.reload} />}
      {d.can_respond && <Player data={d} reload={q.reload} />}
      {d.has_responded && <div className="notice" role="status">Thanks, your response is in. Receipt <span className="mono">{d.receipt_id}</span></div>}
      {!d.can_respond && !d.has_responded && !d.can_manage && <p className="muted">This Campaign is not accepting responses.</p>}
    </div>
  );
}

function Studio({ data, reload }: { data: CampaignDetailData; reload: () => void }) {
  const { api } = useIdentity();
  const c = data.campaign;
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<QuestionKind>("rating");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draft = c.status === "draft";

  async function run(r: Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null);
    const res = await r;
    if (res.ok) reload(); else setError(res.error?.message ?? "Something went wrong");
  }
  const needsOptions = kind === "single_choice" || kind === "multi_choice";
  const add = () =>
    run(api.questionAdd(c.campaign_id, data.questions.length + 1, kind, prompt, needsOptions ? { options: options.split("\n").map((s) => s.trim()).filter(Boolean) } : {}).then((r) => { if (r.ok) { setPrompt(""); setOptions(""); } return r; }));

  return (
    <section className="card stack">
      <h2>Campaign Studio</h2>
      {error && <div className="notice" role="alert">{error}</div>}
      <p className="muted">{c.anonymity === "anonymous" ? "Anonymous: the Hub never sees who answered." : "Identified: responses are linked to members."}</p>
      <ol className="stack">{data.questions.map((x) => <li key={x.question_id}>{x.prompt} <span className="mono muted">{x.kind}</span></li>)}</ol>
      {draft && (
        <>
          <label className="stack">Question<input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          <label className="stack">Type
            <select value={kind} onChange={(e) => setKind(e.target.value as QuestionKind)}>{KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>
          </label>
          {needsOptions && <label className="stack">Options (one per line)<textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={3} /></label>}
          <div className="row">
            <button className="btn btn-ghost" disabled={!prompt.trim() || (needsOptions && options.trim().split("\n").length < 2)} onClick={add}>Add question</button>
            <button className="btn btn-primary" disabled={data.gate ? !data.gate.ok : false} onClick={() => run(api.campaignActivate(c.campaign_id))}>Publish</button>
          </div>
          {data.gate && !data.gate.ok && <p className="muted">Can't publish yet: {data.gate.reasons.join(", ").replace(/_/g, " ")}.</p>}
        </>
      )}
      {c.status === "active" && <button className="btn btn-solid" onClick={() => run(api.campaignClose(c.campaign_id))}>Close Campaign</button>}
      {data.join_code && <p>Share code <strong className="mono">{data.join_code}</strong></p>}
    </section>
  );
}

function Player({ data, reload }: { data: CampaignDetailData; reload: () => void }) {
  const { api } = useIdentity();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const qs = data.questions;
  const cur = qs[step];
  const set = (v: unknown) => setValues((s) => ({ ...s, [cur.question_id]: v }));
  const answered = values[cur.question_id] !== undefined && values[cur.question_id] !== "";
  const last = step === qs.length - 1;

  async function submit() {
    setError(null);
    const answers: Answer[] = qs.map((x) => ({ question_id: x.question_id, value: values[x.question_id] }));
    const r = await api.submit(data.campaign.campaign_id, answers);
    if (r.ok) reload(); else setError(r.error.message);
  }
  if (!cur) return null;
  return (
    <section className="card stack" aria-labelledby="q-prompt">
      <p className="mono muted" role="status">Question {step + 1} of {qs.length}</p>
      <progress value={step + 1} max={qs.length} aria-label="Progress" style={{ width: "100%" }} />
      <p className="muted">{data.campaign.anonymity === "anonymous" ? "Your answers are anonymous: the Hub cannot see who you are." : "Your answers are linked to your member profile."}</p>
      <fieldset className="stack" style={{ border: 0, padding: 0 }}>
        <legend id="q-prompt" style={{ fontWeight: 700, fontSize: 18 }}>{cur.prompt}</legend>
        <Control q={cur} value={values[cur.question_id]} onChange={set} />
      </fieldset>
      {error && <div className="notice" role="alert">{error}</div>}
      <div className="row">
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {last ? <button className="btn btn-primary" disabled={!answered} onClick={submit}>Submit</button> : <button className="btn btn-primary" disabled={!answered} onClick={() => setStep(step + 1)}>Next</button>}
      </div>
    </section>
  );
}

function Control({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
  const name = q.question_id;
  if (q.kind === "rating") {
    return <div className="row" role="radiogroup">{[1, 2, 3, 4, 5].map((n) => (
      <label key={n} className="row"><input type="radio" name={name} checked={value === n} onChange={() => onChange(n)} />{n}</label>
    ))}</div>;
  }
  if (q.kind === "yes_no") {
    return <div className="row">{["yes", "no"].map((v) => <label key={v} className="row"><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{v === "yes" ? "Yes" : "No"}</label>)}</div>;
  }
  if (q.kind === "single_choice") {
    return <div className="stack">{(q.config.options ?? []).map((o) => <label key={o} className="row"><input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />{o}</label>)}</div>;
  }
  if (q.kind === "multi_choice") {
    const sel = Array.isArray(value) ? (value as string[]) : [];
    return <div className="stack">{(q.config.options ?? []).map((o) => (
      <label key={o} className="row"><input type="checkbox" checked={sel.includes(o)} onChange={(e) => onChange(e.target.checked ? [...sel, o] : sel.filter((x) => x !== o))} />{o}</label>
    ))}</div>;
  }
  return <textarea aria-label={q.prompt} rows={4} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
}
