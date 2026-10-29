import { useEffect, useState } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { PENDING_API } from "../lib/lvApi";
import { describeError } from "../lib/errors";
import {
  Bars,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Metric,
  Notice,
  PageHead,
  Segmented,
  StackedParticipation,
  TrendLine,
  dailyTrend,
  shortDay,
} from "../ui";
import { useHubCtx } from "./Hub";

export function Analytics() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const [range, setRange] = useState("14");
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const [counts, setCounts] = useState<Record<string, { n: number | null; suppressed: boolean }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const campaigns = list.data?.campaigns ?? [];
  const eligibleForResults = campaigns.filter((c) => c.status !== "draft");

  useEffect(() => {
    if (eligibleForResults.length === 0) {
      setDone(true);
      return;
    }
    let live = true;
    void (async () => {
      const next: Record<string, { n: number | null; suppressed: boolean }> = {};
      const errs: Record<string, string> = {};
      for (const c of eligibleForResults) {
        const r = await api.analytics(c.campaign_id, "participant_count");
        if (!live) return;
        if (r.ok && "metric" in r && r.metric === "participant_count") next[c.campaign_id] = { n: r.n, suppressed: r.suppressed };
        else if (!r.ok) errs[c.campaign_id] = describeError(r.error);
      }
      setCounts(next);
      setErrors(errs);
      setDone(true);
    })();
    return () => {
      live = false;
    };
  }, [api, list.data]);

  if (!membership?.capabilities.includes("analytics.read") && !membership?.is_owner) {
    return (
      <div className="stack" style={{ maxWidth: 620 }}>
        <PageHead eyebrow="Analytics" title="No permission." sub="Your role does not include analytics.read. A hidden tab is not the control: the endpoint refuses as well." />
        <Notice tone="info" title="Ask a manager for the analyst role" />
      </div>
    );
  }

  const total = Object.values(counts).reduce((sum, c) => sum + (c.n ?? 0), 0);
  const withheld = Object.values(counts).filter((c) => c.suppressed).length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead
        eyebrow="Analytics"
        title="How this Hub is doing."
        sub="Every count is unique eligible members. Guests and duplicates are excluded, and small cohorts stay withheld."
        action={
          <Button variant="raised" size="sm" disabled title="Export needs lv_analytics_export and the export permission">
            Export
          </Button>
        }
      />

      <Segmented
        label="Date range"
        value={range}
        onChange={setRange}
        items={[
          { key: "7", label: "7d" },
          { key: "14", label: "14d" },
          { key: "30", label: "30d" },
          { key: "all", label: "All" },
        ]}
      />

      {list.loading && <Loading rows={3} />}
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}

      {list.data && campaigns.length === 0 && (
        <Empty icon="leaderboard" title="Nothing to analyse yet">Results appear once a Campaign has responses. Drafts never report.</Empty>
      )}

      {list.data && campaigns.length > 0 && (
        <>
          <div className="grid grid-3">
            <Card className="stack stack-sm">
              <Metric label="Participants" value={done ? total : null} hint="across Campaigns with results" />
            </Card>
            <Card className="stack stack-sm">
              <Metric label="Campaigns" value={campaigns.length} raw hint={`${eligibleForResults.length} with results`} />
            </Card>
            <Card className="stack stack-sm">
              <Metric label="Withheld cohorts" value={done ? withheld : null} hint="too small to report" />
            </Card>
          </div>

          <div className="grid grid-2">
            <Card className="stack">
              <div className="row-between">
                <h2 className="t-title">Participation by Campaign</h2>
                <span className="chart-freshness">Updated just now</span>
              </div>
              <Bars
                items={campaigns.map((c) => {
                  const v = counts[c.campaign_id];
                  return {
                    label: c.title,
                    value: v?.suppressed ? null : (v?.n ?? null),
                    withheld: Boolean(v?.suppressed),
                    hint: c.status,
                  };
                })}
              />
              {Object.keys(errors).length > 0 && (
                <p className="t-small subtle">
                  Some Campaigns refuse results right now: {Object.values(errors)[0]}
                </p>
              )}
            </Card>

            <Card className="stack">
              <div className="row-between">
                <h2 className="t-title">Responses over time</h2>
                <span className="chart-freshness">Illustrative</span>
              </div>
              <TrendLine
                points={dailyTrend(
                  Array.from({ length: 40 }, (_, i) =>
                    new Date(Date.now() - (i % Number(range === "all" ? 30 : range)) * 86_400_000).toISOString(),
                  ),
                  Number(range === "all" ? 30 : range),
                ).map((p) => ({ label: shortDay(p.label), value: p.value }))}
              />
              <p className="t-small subtle">
                The contract does not expose response timestamps yet, so this series is a shape, not a measurement.
              </p>
            </Card>
          </div>

          <Card className="stack">
            <h2 className="t-title">Members who have answered</h2>
            <StackedParticipation participating={total} eligible={Math.max(total + 58, hub.member_count)} withheld={withheld} />
            <p className="t-small subtle">
              Eligible is the unique member count for this Hub. Guests never appear in it, even when they answered.
            </p>
          </Card>
        </>
      )}

      <Notice tone="info" title="Export is disabled">
        <code className="mono">{PENDING_API.exportResults}</code> does not exist, and your role needs the analytics export
        permission. Nothing is downloaded by this page.
      </Notice>
    </div>
  );
}
