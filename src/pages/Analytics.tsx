import { useState } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import { Icon } from "../components/Icon";
import { Card } from "@/components/shadcn/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { EmptyState, Field, LoadingRows, Notice, PageHeader } from "@/components/shadcn/blocks";
import { useHubCtx } from "./Hub";
import { ResultsView } from "./Results";
import { exportBlockedReason } from "./Campaigns";

// Hub analytics: pick a published Campaign, read its aggregates. Withheld is its own state and never zero.
export function Analytics() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const [selected, setSelected] = useState<string>("");
  const campaigns = list.data?.campaigns.filter((c) => c.status !== "draft") ?? [];
  const id = selected || campaigns[0]?.campaign_id || "";

  return (
    <div className="lv-stack-16">
      <PageHeader eyebrow="Analytics" title="Results" sub="Aggregates only. A group too small to stay anonymous is withheld, and withheld is never shown as zero." />
      {list.error && <Notice tone="error">{describeError(list.error)}</Notice>}
      <Card>
        {list.loading && !list.data ? (
          <LoadingRows rows={1} label="Loading Campaigns" />
        ) : campaigns.length === 0 ? (
          <p className="ui-muted lv-m0">No Campaign has been published yet, so there is nothing to add up.</p>
        ) : (
          <Field label="Campaign" htmlFor="a-campaign">
            <Select value={id} onValueChange={setSelected}>
              <SelectTrigger id="a-campaign"><SelectValue /></SelectTrigger>
              <SelectContent>{campaigns.map((c) => <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
      </Card>
      {id ? (
        <ResultsView key={id} campaignId={id} exportBlocked={exportBlockedReason(hub, membership)} />
      ) : (
        list.data && (
          <Card variant="well">
            <EmptyState icon={<Icon name="dashboard" size={22} />} title="No results to show">Publish a Campaign to start collecting answers. Drafts never report results.</EmptyState>
          </Card>
        )
      )}
    </div>
  );
}
