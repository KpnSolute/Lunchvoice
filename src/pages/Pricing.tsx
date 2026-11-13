import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { useState } from "react";
import { CAPABILITY_COLUMNS, PLANS, PRICING_NOTES, capabilityRows, type Plan } from "../config/pricing";
import { useBilling } from "../lib/useBilling";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Eyebrow, Notice } from "@/components/shadcn/blocks";
import { PricingAction } from "../components/Checkout"; // track B: commerce
import { CAMPAIGN_TEMPLATES, GROUP_BLURB, GROUP_LABEL, groupOf, type CampaignTemplateGroup } from "../config/campaignTemplates";
import { SURVEY_TEMPLATES } from "../config/surveyTemplates";

// /pricing: the founder's capability table from src/config/pricing.ts. Display only; the backend's entitlement map
// decides what a plan allows. Checkout buttons are enabled only when lv_billing_config says a product is on sale;
// otherwise they stay disabled with a visible reason.

function CellValue({ v }: { v: string | boolean }) {
  if (v === true) return <span className="lv-cap-yes" aria-label="Included"><Icon name="check" size={18} /></span>;
  if (v === false) return <span className="lv-cap-no" aria-label="Not included">—</span>;
  return <>{v}</>;
}

type Paid = "starter_hub" | "team_hub" | "campaign_starter" | "campaign_plus";

function PlanCard({ p }: { p: Plan }) {
  const { config, state } = useBilling();
  const featured = p.id === "starter";
  return (
    <Card variant={featured ? "ink" : "card"} data-testid={`plan-${p.id}`}>
      <div className="ui-spread"><strong>{p.name}</strong>{featured && !state.open && <Badge variant="accent">Founding</Badge>}</div>
      <div className="lv-price-figure"><strong>{p.priceLabel}</strong><span>{p.cadence}</span></div>
      <p className="lv-m0 lv-dim">{p.blurb}</p>
      <ul className="lv-price-list">{p.features.map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}</ul>
      {p.id === "free" ? (
        <LinkButton to="/surveys/new" variant="secondary" block>Start a free survey</LinkButton>
      ) : (
        <PricingAction product={p.product as Paid} config={config} variant={featured ? "primary" : "secondary"} />
      )}
    </Card>
  );
}

/** One plan at a time on phones: five columns cannot fit 360px, so a picker replaces sideways scrolling. */
function CompareMobile({ rows }: { rows: ReturnType<typeof capabilityRows> }) {
  const [at, setAt] = useState(() => CAPABILITY_COLUMNS.findIndex((c) => c.featured));
  const col = CAPABILITY_COLUMNS[at];
  return (
    <div className="lv-capm" data-testid="compare-mobile">
      <div className="lv-capm-pick" role="group" aria-label="Plan to show">
        {CAPABILITY_COLUMNS.map((c, i) => (
          <button key={c.id} type="button" aria-pressed={i === at} onClick={() => setAt(i)}>{c.name}</button>
        ))}
      </div>
      <div className="lv-capm-plan" aria-live="polite">
        <b>{col.name}</b><span>{col.price}</span><small>{col.cadence}</small>
      </div>
      <dl className="lv-capm-list">
        {rows.map((r) => (
          <div key={r.label}><dt>{r.label}</dt><dd><CellValue v={r.cells[at]} /></dd></div>
        ))}
      </dl>
    </div>
  );
}

export function Pricing() {
  const { state, ctas } = useBilling();
  const { api } = useIdentity();
  const limits = useLv(() => api.planLimits(), [api]);
  const open = state.open;
  const rows = capabilityRows(limits.data?.families);
  const plan = (id: Plan["id"]) => PLANS.find((p) => p.id === id)!;
  return (
    <div className="lv-mk">
      <div className="lv-mk-head">
        <Eyebrow accent>Pricing</Eyebrow>
        <h1>Free to ask. Pay when you need a home.</h1>
        <p>Answering is always free. Quick Surveys are free for anyone who signs in. Campaign plans cover one time-bounded Campaign; Hub plans are for communities that keep going.</p>
      </div>

      <div data-testid="billing-notice" data-state={open ? "open" : "closed"}>
        {open
          ? <Notice tone="info" title={ctas.noticeTitle}>Payments run through Stripe. Tax is calculated by Stripe at checkout and shown separately. A Hub plan bought here becomes a Hub credit you use on <Link className="lv-inline-link" to="/create">Create a Hub</Link>.</Notice>
          : <Notice tone="info" title={ctas.noticeTitle}>Nothing can be bought yet and nothing is charged. The first 50 people admitted from the <Link className="lv-inline-link" to="/waitlist">waitlist</Link> receive a Founding Hub credit.</Notice>}
      </div>

      {/* The free plan, then the highlighted Starter Hub, then Team: the three that fit one row. */}
      <div className="lv-price-cards" data-testid="hub-plans">
        {(["free", "starter", "team"] as const).map((id) => <PlanCard key={id} p={plan(id)} />)}
      </div>

      <section aria-labelledby="camp-h" className="lv-stack-16">
        <div>
          <h2 id="camp-h" className="lv-mk-card-title">Campaign plans</h2>
          <p className="lv-mk-card-body">For one Campaign with a start and an end date, without a monthly plan.</p>
        </div>
        <div className="lv-price-cards lv-price-cards-2" data-testid="campaign-plans">
          {(["campaign_starter", "campaign_plus"] as const).map((id) => <PlanCard key={id} p={plan(id)} />)}
        </div>
      </section>

      <section aria-labelledby="tpl-h" className="lv-stack-16" data-testid="plan-templates">
        <h2 id="tpl-h" className="lv-mk-card-title">Templates for every plan</h2>
        <p className="lv-mk-card-body">Each plan comes with ready-made templates built around what that plan is for. Pick one, edit anything, publish when you are ready.</p>
        <div className="lv-mk-grid">
          <Card>
            <strong>Free Quick Survey</strong>
            <p className="lv-mk-card-body">{SURVEY_TEMPLATES.filter((t) => t.plan === "free").length} free templates for feedback, votes, questionnaires, RSVPs and more, and {SURVEY_TEMPLATES.length} in all with the paid question types.</p>
            <ul className="lv-price-list">
              {SURVEY_TEMPLATES.slice(0, 5).map((t) => <li key={t.id}><Icon name="check" size={15} />{t.name}</li>)}
            </ul>
            <LinkButton to="/use-cases" variant="secondary" block>See the use cases</LinkButton>
          </Card>
          {(["starter", "team", "window"] as CampaignTemplateGroup[]).map((g) => {
            const list = CAMPAIGN_TEMPLATES.filter((t) => groupOf(t) === g);
            return (
              <Card key={g}>
                <strong>{GROUP_LABEL[g]}</strong>
                <p className="lv-mk-card-body">{GROUP_BLURB[g]}</p>
                <ul className="lv-price-list">
                  {list.slice(0, 5).map((t) => <li key={t.id}><Icon name="check" size={15} />{t.name}</li>)}
                  {list.length > 5 && <li className="ui-muted">and {list.length - 5} more</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="cap-h" className="lv-stack-16">
        <h2 id="cap-h" className="lv-mk-card-title">Compare everything</h2>
        <CompareMobile rows={rows} />
        <div className="lv-captable-wrap">
          <Table className="lv-captable">
            <caption className="sr-only">Capabilities by plan</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Capability</TableHead>
                {CAPABILITY_COLUMNS.map((c) => (
                  <TableHead key={c.id} scope="col" data-featured={c.featured || undefined}>
                    <span className="lv-cap-head"><b>{c.name}</b><span>{c.price}</span><small>{c.cadence}</small></span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableHead scope="row">{r.label}</TableHead>
                  {r.cells.map((v, i) => <TableCell key={i} data-featured={CAPABILITY_COLUMNS[i].featured || undefined}><CellValue v={v} /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="lv-mk-grid">
        {(() => {
          const r = PLANS.find((p) => p.id === "reservation")!;
          return (
            <Card>
              <strong>{r.name}</strong>
              <div className="lv-price-figure"><strong>{r.priceLabel}</strong><span>{r.cadence}</span></div>
              <div className="lv-lifecycle"><span>ACTIVE</span><i aria-hidden="true">→</i><span>GRACE · 25 days</span><i aria-hidden="true">→</i><span>RELEASED</span></div>
              <ul className="lv-price-list">{r.features.map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}</ul>
              <LinkButton to="/reserve" variant="secondary">Reserve an address</LinkButton>
            </Card>
          );
        })()}
        <Card variant="well">
          <strong>Good to know</strong>
          <ul className="lv-price-list">{PRICING_NOTES.map((n) => <li key={n}><Icon name="check" size={15} />{n}</li>)}</ul>
          {!open && <p className="ui-help lv-m0" data-testid="billing-reason">{ctas.reason}</p>}
        </Card>
      </div>
    </div>
  );
}
