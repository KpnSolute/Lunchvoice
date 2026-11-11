import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { CAPABILITY_COLUMNS, CAPABILITY_ROWS, CHECKOUT_DISABLED_REASON, PLANS, PRICING_NOTES } from "../config/pricing";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Eyebrow, Notice } from "@/components/shadcn/blocks";
import { PricingAction, useBillingConfig } from "../components/Checkout"; // track B: commerce

// /pricing: the founder's capability table from src/config/pricing.ts. Display only; the backend's entitlement map
// decides what a plan allows. Checkout buttons are enabled only when lv_billing_config says a product is on sale;
// otherwise they stay disabled with a visible reason.

const MAIN_PLANS: string[] = ["free", "starter", "team"];

function CellValue({ v }: { v: string | boolean | null }) {
  if (v === true) return <span className="lv-cap-yes" aria-label="Included"><Icon name="check" size={18} /></span>;
  if (v === false) return <span className="lv-cap-no" aria-label="Not included">—</span>;
  if (v === null) return <span className="lv-cap-unset">Not set yet</span>;
  return <>{v}</>;
}

export function Pricing() {
  const { config } = useBillingConfig();
  const open = Boolean(config?.checkout_available);
  const reservation = PLANS.find((p) => p.id === "reservation")!;
  return (
    <div className="lv-mk">
      <div className="lv-mk-head">
        <Eyebrow accent>Pricing</Eyebrow>
        <h1>Free to ask. Pay when you need a home.</h1>
        <p>Answering is always free. Quick Surveys are free for anyone who signs in. A Hub plan gives a community its own home; a pass covers a single event.</p>
      </div>

      {open
        ? <Notice tone="info" title="Checkout is open">Payments run through Stripe. Tax is calculated by Stripe at checkout and shown separately. A Hub plan bought here becomes a Hub credit you use on <Link className="lv-inline-link" to="/create">Create a Hub</Link>.</Notice>
        : <Notice tone="info" title="Billing opens soon">Nothing can be bought yet and nothing is charged. The first 50 people admitted from the <Link className="lv-inline-link" to="/waitlist">waitlist</Link> receive a Founding Hub credit.</Notice>}

      {/* F-16: three plans first, the Hub address reservation right under them, then the two-week passes. */}
      <div className="lv-price-cards" data-testid="plan-cards">
        {PLANS.filter((p) => MAIN_PLANS.includes(p.id)).map((p) => (
          <Card key={p.id} variant={p.id === "starter" ? "ink" : "card"} data-testid={`plan-${p.id}`}>
            <div className="ui-spread"><strong>{p.name}</strong>{p.id === "starter" && <Badge variant="accent">Founding</Badge>}</div>
            <div className="lv-price-figure"><strong data-unset={p.priceLabel === null || undefined}>{p.priceLabel ?? "Price not set"}</strong><span>{p.cadence}</span></div>
            <p className="lv-m0 lv-dim">{p.blurb}</p>
            <ul className="lv-price-list">{p.features.map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}</ul>
            {p.id === "free" ? (
              <LinkButton to="/surveys/new" variant="secondary" block>Start a Quick Survey</LinkButton>
            ) : (
              <PricingAction product={p.product as "starter_hub" | "team_hub"} config={config} variant={p.id === "starter" ? "primary" : "secondary"} />
            )}
          </Card>
        ))}
      </div>

      <Card data-testid="plan-reservation">
        <div className="ui-spread">
          <div className="lv-stack-8">
            <strong>{reservation.name}</strong>
            <p className="lv-m0 lv-dim">{reservation.blurb} {reservation.priceLabel} {reservation.cadence}. It keeps the address only and includes no paid features.</p>
          </div>
          <LinkButton to="/reserve" variant="secondary">Reserve an address</LinkButton>
        </div>
        <div className="lv-lifecycle"><span>ACTIVE · 12 months</span><i aria-hidden="true">→</i><span>GRACE · 25 days</span><i aria-hidden="true">→</i><span>RELEASED</span></div>
      </Card>

      <section aria-labelledby="pass-h" className="lv-stack-16" data-testid="plan-passes">
        <div className="lv-stack-8">
          <h2 id="pass-h" className="lv-mk-card-title">Only need it for one event?</h2>
          <p className="lv-m0 lv-dim">A pass gives one time-bounded Campaign the features of a Hub plan for the dates you pick. No subscription.</p>
        </div>
        <div className="lv-mk-grid">
          {PLANS.filter((p) => p.id === "campaign_starter" || p.id === "campaign_plus").map((p) => (
            <Card key={p.id} data-testid={`plan-${p.id}`}>
              <strong>{p.name}</strong>
              <div className="lv-price-figure"><strong>{p.priceLabel}</strong><span>{p.cadence}</span></div>
              <p className="lv-m0 lv-dim">{p.blurb}</p>
              <PricingAction product={p.product as "campaign_starter" | "campaign_plus"} config={config} variant="secondary" />
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="cap-h" className="lv-stack-16">
        <h2 id="cap-h" className="lv-mk-card-title">Compare everything</h2>
        <div className="lv-captable-wrap">
          <Table className="lv-captable">
            <caption className="sr-only">Capabilities by plan</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Capability</TableHead>
                {CAPABILITY_COLUMNS.map((c) => (
                  <TableHead key={c.id} scope="col" data-featured={c.featured || undefined}>
                    <span className="lv-cap-head"><b>{c.name}</b><span>{c.price ?? "Price not set"}</span><small>{c.cadence}</small></span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITY_ROWS.map((r) => (
                <TableRow key={r.label}>
                  <TableHead scope="row">{r.label}</TableHead>
                  {r.cells.map((v, i) => <TableCell key={i} data-featured={CAPABILITY_COLUMNS[i].featured || undefined}><CellValue v={v} /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="ui-help lv-m0">“Not set yet” means the founder hasn’t fixed that number; the backend decides it when it is set.</p>
      </section>

      <div className="lv-mk-grid">
        <Card variant="well">
          <strong>Good to know</strong>
          <ul className="lv-price-list">{PRICING_NOTES.map((n) => <li key={n}><Icon name="check" size={15} />{n}</li>)}</ul>
          {!open && <p className="ui-help lv-m0">{CHECKOUT_DISABLED_REASON}</p>}
        </Card>
      </div>
    </div>
  );
}
