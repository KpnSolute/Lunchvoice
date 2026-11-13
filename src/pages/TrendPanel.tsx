import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { SKIP, useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Eyebrow } from "@/components/shadcn/blocks";

/** On a survey's results: the Trend it belongs to, "Ask again", or a way to add it to one. */
export function TrendPanel({ campaignId }: { campaignId: string }) {
  const { api } = useIdentity();
  const { hub: slug } = useParams();
  const nav = useNavigate();
  const info = useLv(() => api.campaignTrend(campaignId), [api, campaignId]);
  const d = info.data;
  // Inside a Hub the outlet context carries it; a Quick Survey (personal space) has none.
  const hubId = useOutletContext<{ hub?: { hub_id: string } } | undefined>()?.hub?.hub_id ?? null;
  const lists = useLv(() => (d && !d.trend && d.can_manage && d.limit.max > 0 ? api.trendList(hubId) : SKIP), [api, d?.trend?.trend_id, d?.can_manage, d?.limit.max]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const base = slug ? `/${slug}` : "";
  if (!d) return null;

  async function askAgain() {
    setBusy(true);
    const r = await api.trendAskAgain(campaignId);
    setBusy(false);
    if (!r.ok) return toast.error(describeError(r.error));
    toast.success("A draft copy is ready in the Trend.");
    nav(slug ? `${base}/campaigns/${r.campaign_id}/studio` : `/surveys/${r.campaign_id}`);
  }
  async function add() {
    if (!pick) return;
    setBusy(true);
    const r = await api.trendAdd(pick, campaignId);
    setBusy(false);
    if (!r.ok) return toast.error(describeError(r.error));
    toast.success("Added to the Trend.");
    info.reload();
  }

  if (d.trend) {
    return (
      <Card data-testid="trend-panel">
        <Eyebrow>Trend</Eyebrow>
        <div className="ui-spread">
          <p className="lv-m0">Part of <Link to={`${base}/trends/${d.trend.trend_id}`}><strong>{d.trend.title}</strong></Link>, {d.trend.run_count} {d.trend.run_count === 1 ? "run" : "runs"}.</p>
          {d.can_ask_again && <Button variant="secondary" onClick={askAgain} disabled={busy} data-testid="ask-again">Ask again</Button>}
        </div>
        {d.can_manage && !d.can_ask_again && !d.limit.can_add && <p className="ui-help lv-m0">This space holds more Trends than its plan allows. They stay readable; asking again waits until the count fits.</p>}
      </Card>
    );
  }
  if (!d.can_manage) return null;
  if (d.limit.max === 0) {
    return (
      <Card variant="well" data-testid="trend-panel">
        <Eyebrow>Trend</Eyebrow>
        <p className="lv-m0">Ask the same questions again and watch the answers change. Trends come with Creator Plus or a Hub plan. <Link to="/pricing">See plans</Link></p>
      </Card>
    );
  }
  const trends = lists.data?.trends ?? [];
  return (
    <Card data-testid="trend-panel">
      <Eyebrow>Trend</Eyebrow>
      {trends.length === 0 ? (
        <p className="lv-m0">Not in a Trend yet. <Link to={`${base}/trends`}>Start one</Link> to ask these questions again over time.</p>
      ) : (
        <div className="ui-spread">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger aria-label="Add to a Trend"><SelectValue placeholder="Add to a Trend" /></SelectTrigger>
            <SelectContent>{trends.map((t) => <SelectItem key={t.trend_id} value={t.trend_id}>{t.title}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="secondary" onClick={add} disabled={!pick || busy}>Add</Button>
        </div>
      )}
    </Card>
  );
}
