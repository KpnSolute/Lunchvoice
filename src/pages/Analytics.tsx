import { useState } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import type { AnalyticsResult, LvError, Question } from "../lib/lvApi";
import { useLv } from "../lib/useLv";
import { useHubCtx } from "./Hub";

// Suppressed and withheld data are their own states. They are never rendered as zero.
function Withheld({ children }: { children: string }) {
  return <span className="pill" title="Hidden to protect respondents' privacy">{children}</span>;
}

function explain(e: LvError): string {
  if (e.code === "lv_policy_undecided") return `Results are withheld: ${e.message}`;
  if (e.code === "lv_lifecycle_invalid") return "No results yet. This Campaign has not started.";
  return e.message;
}

export function Analytics() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const [selected, setSelected] = useState<string>("");
  const campaigns = list.data?.campaigns.filter((c) => c.status !== "draft") ?? [];
  const id = selected || campaigns[0]?.campaign_id || "";

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card stack">
        <h2>Results</h2>
        {list.loading ? <p className="muted">Loading…</p> : campaigns.length === 0 ? <p className="muted">No Campaigns have started yet.</p> : (
          <label className="stack">Campaign
            <select value={id} onChange={(e) => setSelected(e.target.value)}>{campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.title}</option>)}</select>
          </label>
        )}
      </section>
      {id && <CampaignResults key={id} campaignId={id} />}
    </div>
  );
}

function CampaignResults({ campaignId }: { campaignId: string }) {
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(campaignId), [api, campaignId]);
  const count = useLv(() => api.analytics(campaignId, "participant_count"), [api, campaignId]);
  const c = count.data as Extract<AnalyticsResult, { metric: "participant_count" }> | null;
  return (
    <>
      <section className="card stack" aria-live="polite">
        <h2>Participation</h2>
        {count.loading ? <p className="muted">Loading…</p> : count.error ? <p className="muted">{explain(count.error)}</p> : c?.suppressed ? <Withheld>Withheld</Withheld> : <p className="stat">{c?.n}</p>}
      </section>
      {detail.data?.questions.filter((q) => q.kind !== "text").map((q) => <Distribution key={q.question_id} campaignId={campaignId} q={q} />)}
    </>
  );
}

function Distribution({ campaignId, q }: { campaignId: string; q: Question }) {
  const { api } = useIdentity();
  const r = useLv(() => api.analytics(campaignId, "answer_distribution", q.question_id), [api, campaignId, q.question_id]);
  const d = r.data as Extract<AnalyticsResult, { metric: "answer_distribution" }> | null;
  const max = Math.max(1, ...(d?.cells.map((x) => x.n ?? 0) ?? [0]));
  return (
    <section className="card stack">
      <h2>{q.prompt}</h2>
      {r.loading ? <p className="muted">Loading…</p> : r.error ? <p className="muted">{explain(r.error)}</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption className="muted" style={{ textAlign: "left" }}>Answer distribution</caption>
          <thead><tr><th scope="col" align="left">Answer</th><th scope="col" align="left">Responses</th></tr></thead>
          <tbody>
            {d?.cells.map((x) => (
              <tr key={x.key}>
                <th scope="row" align="left">{x.key}</th>
                <td>{x.suppressed ? <Withheld>Withheld</Withheld> : (
                  <span className="row"><span aria-hidden style={{ display: "inline-block", height: 10, width: `${((x.n ?? 0) / max) * 160}px`, background: "var(--accent)" }} />{x.n}</span>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
