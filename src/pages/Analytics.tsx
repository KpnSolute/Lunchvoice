import { useState } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import type { AnalyticsResult, LvError, Question } from "../lib/lvApi";
import { useLv } from "../lib/useLv";
import { useHubCtx } from "./Hub";
import { Btn, Card, Empty, ErrorNote, Loading, Metric, Micro, Notice, PageHead, Pill } from "../components/ui";
import { Icon } from "../components/Icon";

// Suppressed and withheld data are their own states. They are never rendered as zero.
function Withheld({ label = "Withheld" }: { label?: string }) {
  return (
    <span className="ui-pill" title="Hidden to protect respondents: the cohort is too small to publish">
      <Icon name="lock" size={11} /> {label}
    </span>
  );
}

function explain(e: LvError): string {
  if (e.code === "lv_policy_undecided") return `Results are withheld until the Campaign finishes: ${e.message}`;
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
    <div className="ui-stack ui-gap-16">
      <PageHead
        eyebrow="Analytics"
        title="Results"
        sub="Aggregates only. A cohort below the privacy floor is withheld, and a withheld value is never reported as zero."
      />

      {list.error && <ErrorNote error={list.error} />}

      <Card>
        <div className="ui-spread">
          <div className="ui-stack ui-gap-4" style={{ flex: 1, minWidth: 240 }}>
            <label className="ui-label" htmlFor="a-campaign">Campaign</label>
            {list.loading ? (
              <Loading rows={1} label="Loading Campaigns" />
            ) : campaigns.length === 0 ? (
              <p className="ui-muted" style={{ margin: 0, fontSize: 14 }}>
                No Campaign has started yet, so there is nothing to aggregate.
              </p>
            ) : (
              <select id="a-campaign" className="ui-select" value={id} onChange={(e) => setSelected(e.target.value)}>
                {campaigns.map((c) => (
                  <option key={c.campaign_id} value={c.campaign_id}>{c.title}</option>
                ))}
              </select>
            )}
          </div>
          <div className="ui-stack ui-gap-4">
            <Micro>Export</Micro>
            <Btn variant="outline" disabled title="Authorized export is not available yet">Export CSV</Btn>
            <span className="ui-help">Authorized export is not built yet.</span>
          </div>
        </div>
      </Card>

      {id ? (
        <CampaignResults key={id} campaignId={id} />
      ) : (
        !list.loading && (
          <Empty icon="dashboard" title="No results to show">
            Create a Campaign and open it to start collecting answers. Drafts never report results.
          </Empty>
        )
      )}
    </div>
  );
}

function CampaignResults({ campaignId }: { campaignId: string }) {
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(campaignId), [api, campaignId]);
  const count = useLv(() => api.analytics(campaignId, "participant_count"), [api, campaignId]);
  const c = count.data as Extract<AnalyticsResult, { metric: "participant_count" }> | null;
  const questions = detail.data?.questions ?? [];

  return (
    <>
      <div className="ui-panel" aria-live="polite">
        <div className="ui-panel-top">
          <Micro accent>Participation</Micro>
          <Pill tone="accent">{detail.data?.campaign.anonymity ?? "anonymous"}</Pill>
        </div>
        {count.loading ? (
          <p>Counting…</p>
        ) : count.error ? (
          <p style={{ margin: 0 }}>{explain(count.error)}</p>
        ) : c?.suppressed ? (
          <div className="ui-stack ui-gap-8">
            <span className="ui-metric">Withheld</span>
            <Micro>the cohort is below the privacy floor</Micro>
            <p style={{ margin: 0, maxWidth: "52ch", fontSize: 14 }}>
              The responses exist and stay private. Publishing the number would identify someone who answered.
            </p>
          </div>
        ) : (
          <Metric value={c?.n ?? "—"} label="unique participants" hint="Guests are not counted as members, but their answers still count here." />
        )}
      </div>

      {questions.filter((q) => q.kind !== "text").map((q) => (
        <Distribution key={q.question_id} campaignId={campaignId} q={q} />
      ))}

      {questions.some((q) => q.kind === "text") && (
        <Notice tone="info">
          Open-answer questions exist on this Campaign. Free text is never published in aggregate, so it has no chart here.
        </Notice>
      )}
    </>
  );
}

function Distribution({ campaignId, q }: { campaignId: string; q: Question }) {
  const { api } = useIdentity();
  const r = useLv(() => api.analytics(campaignId, "answer_distribution", q.question_id), [api, campaignId, q.question_id]);
  const d = r.data as Extract<AnalyticsResult, { metric: "answer_distribution" }> | null;
  const cells = d?.cells ?? [];
  const visible = cells.filter((x) => !x.suppressed);
  const withheld = cells.filter((x) => x.suppressed);
  const top = Math.max(1, ...visible.map((x) => x.n ?? 0));

  return (
    <Card>
      <div className="ui-spread" style={{ marginBottom: 14 }}>
        <h2 className="ui-display ui-display-md" style={{ margin: 0 }}>{q.prompt}</h2>
        <Micro>{q.kind.replace("_", " ")}</Micro>
      </div>

      {r.loading ? (
        <Loading rows={3} label="Loading distribution" />
      ) : r.error ? (
        <p className="ui-muted" style={{ margin: 0 }}>{explain(r.error)}</p>
      ) : cells.length === 0 ? (
        <p className="ui-muted" style={{ margin: 0 }}>No answers recorded for this question.</p>
      ) : (
        <div className="ui-stack ui-gap-8">
          <div className="chart-bars">
            {visible.map((x) => (
              <div key={x.key} className="chart-bar-row">
                <span className="chart-bar-label">{x.key}</span>
                <span className="chart-bar-track"><b style={{ width: `${Math.max(3, ((x.n ?? 0) / top) * 100)}%` }} /></span>
                <em className="chart-bar-value">{x.n}</em>
              </div>
            ))}
          </div>
          {withheld.length > 0 && (
            <div className="ui-stack ui-gap-8" style={{ marginTop: 4, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
              <div className="ui-row ui-gap-8">
                <Withheld />
                <Micro>{withheld.length} {withheld.length === 1 ? "answer" : "answers"} below the privacy floor</Micro>
              </div>
              <div className="ui-row ui-gap-8" style={{ opacity: 0.7 }}>
                {withheld.map((w) => (
                  <span key={w.key} className="ui-pill" title={`${w.key}: withheld`}>{w.key}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
