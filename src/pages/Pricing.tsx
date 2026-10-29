import {
  Button,
  ButtonLink,
  Card,
  Icon,
  Lifecycle,
  Notice,
  PageHead,
  Pill,
  Table,
  type Column,
} from "../ui";
import { PLANS } from "../config/pricing";

const ENTITLEMENTS: { label: string; starter: string; team: string }[] = [
  { label: "Custom roles", starter: "3", team: "6" },
  { label: "Custom Hub pages", starter: "3", team: "Expanded community pages" },
  { label: "Active Campaigns", starter: "15", team: "15" },
  { label: "Active surveys", starter: "2", team: "5" },
  { label: "Survey replacement", starter: "After more than 50% of unique eligible members", team: "At 20% participation or more" },
  { label: "Campaign modes", starter: "Core modes", team: "Enhanced modes" },
  { label: "Targeting and analytics", starter: "Standard", team: "Advanced role targeting and analytics" },
  { label: "Discover eligibility", starter: "—", team: "Applies at 700 genuine active members" },
  { label: "Owner role slot", starter: "Never counts against the limit", team: "Never counts against the limit" },
];

const COLUMNS: Column<(typeof ENTITLEMENTS)[number]>[] = [
  { key: "label", header: "Entitlement", render: (r) => <span className="t-ui">{r.label}</span> },
  { key: "starter", header: "Starter", render: (r) => <span className="t-small muted">{r.starter}</span> },
  { key: "team", header: "Team", render: (r) => <span className="t-small muted">{r.team}</span> },
];

export function Pricing() {
  const starter = PLANS.find((p) => p.id === "starter")!;
  const team = PLANS.find((p) => p.id === "team")!;
  const seasonal = PLANS.find((p) => p.id === "campaign_starter")!;
  const plus = PLANS.find((p) => p.id === "campaign_plus")!;
  const reservation = PLANS.find((p) => p.id === "reservation")!;
  const free = PLANS.find((p) => p.id === "free")!;

  return (
    <div className="wrap page">
      <PageHead
        eyebrow="Pricing"
        title="Participation is free. Running a Hub is not."
        sub="Every member answers for free, forever. Hub plans are per community. Prices below are the canonical published figures."
      />

      <Notice tone="info" title="Checkout is not open in this build" >
        Plan terms are shown so you can decide. No button here takes a payment, and no card details are collected.
      </Notice>

      <section className="section-sm">
        <div className="grid grid-3">
          {[free, starter, team].map((p) => (
            <Card key={p.id} className="stack" style={{ padding: 28 }}>
              <div className="row-between">
                <p className="t-title">{p.name}</p>
                {p.id === "starter" && <Pill tone="accent">Most common</Pill>}
              </div>
              <p className="t-display-md" style={{ fontSize: 44, letterSpacing: "-0.04em" }}>
                {p.priceLabel}
                <span className="t-small subtle" style={{ marginLeft: 8, fontWeight: 400, letterSpacing: 0 }}>
                  {p.cadence}
                </span>
              </p>
              <ul className="stack stack-sm grow">
                {p.features.map((f) => (
                  <li key={f} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                    <Icon name="check" size={15} strokeWidth={2.4} />
                    <span className="t-small">{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant={p.id === "starter" ? "primary" : "raised"} disabled aria-describedby="checkout-why">
                {p.id === "free" ? "Start answering" : `Choose ${p.name}`}
              </Button>
            </Card>
          ))}
        </div>
        <p id="checkout-why" className="t-small subtle" style={{ marginTop: 10 }}>
          Disabled: checkout is not connected yet. Nothing is charged, and no plan is activated by this page.
        </p>
      </section>

      <section className="section-sm">
        <div className="section-head">
          <p className="t-label muted">Starter vs Team</p>
          <h2 className="t-display-md">The backend evaluates these, not the UI.</h2>
          <p className="t-small muted">One entitlement map decides what a plan allows. A disabled button is never the enforcement.</p>
        </div>
        <Table
          columns={COLUMNS}
          rows={ENTITLEMENTS}
          rowKey={(r) => r.label}
          caption="Starter and Team entitlements"
        />
      </section>

      <section className="section-sm">
        <div className="section-head">
          <p className="t-label muted">Time-bounded plans</p>
          <h2 className="t-display-md">A Campaign without a subscription.</h2>
        </div>
        <div className="grid grid-2">
          <Card className="stack">
            <div className="row-between">
              <p className="t-title">{seasonal.name}</p>
              <Pill>Starter family</Pill>
            </div>
            <p className="t-display-md" style={{ fontSize: 36 }}>
              {seasonal.priceLabel}
            </p>
            <p className="t-small muted">{seasonal.cadence}</p>
            <p className="t-small muted">{seasonal.features.join(" · ")}</p>
            <Button disabled aria-describedby="seasonal-why">
              Choose {seasonal.name}
            </Button>
            <p id="seasonal-why" className="t-small subtle">
              Disabled: the paid window starts when the backend schedules it. No start date is set here.
            </p>
          </Card>
          <Card className="stack">
            <div className="row-between">
              <p className="t-title">{plus.name}</p>
              <Pill tone="warn">Price pending</Pill>
            </div>
            <p className="t-display-md" style={{ fontSize: 36, color: "var(--lv-muted)" }}>
              Price coming soon
            </p>
            <p className="t-small muted">
              {plus.name} is a Team-family plan with a time-bounded window. Its price has not been supplied, so it is never
              displayed and can never be purchased.
            </p>
            <Button disabled aria-describedby="plus-why">
              Unavailable until priced
            </Button>
            <p id="plus-why" className="t-small subtle">
              Checkout stays disabled and fails closed. We do not invent a number for this plan.
            </p>
          </Card>
        </div>
      </section>

      <section className="section-sm">
        <div className="section-head">
          <p className="t-label muted">Reserve your Hub URL</p>
          <h2 className="t-display-md">Hold an address while you plan.</h2>
        </div>
        <Card className="stack">
          <div className="row-between">
            <p className="t-display-md" style={{ fontSize: 32 }}>
              {reservation.priceLabel}
              <span className="t-small subtle" style={{ marginLeft: 8, fontWeight: 400 }}>
                {reservation.cadence}
              </span>
            </p>
            <Pill tone="accent">Grants no features</Pill>
          </div>
          <p className="t-small muted">{reservation.features.join(" · ")}</p>
          <div className="stack stack-sm">
            <p className="t-label muted">Lifecycle</p>
            <Lifecycle steps={["ACTIVE", "GRACE", "RELEASED"]} current="ACTIVE" />
            <p className="t-small subtle">
              25 days of grace after expiry. A released address can be claimed by someone else, and never exposes the previous
              owner's data.
            </p>
          </div>
          <div className="row">
            <Button disabled aria-describedby="reserve-why">
              Reserve this address
            </Button>
            <ButtonLink to="/create" variant="quiet">
              Choose an address first
            </ButtonLink>
          </div>
          <p id="reserve-why" className="t-small subtle">
            Disabled: reservation checkout is not connected. The lifecycle above is the real product rule, not a simulation.
          </p>
        </Card>
      </section>

      <section className="section-sm" style={{ paddingBottom: 48 }}>
        <Card className="stack">
          <p className="t-title">What happens when a plan expires?</p>
          <ul className="stack stack-sm">
            {[
              "Premium actions fail closed: you cannot create past the limit on an expired plan.",
              "Nothing is deleted. Responses and private data are never removed to resolve an unpaid state.",
              "Threshold counts still only include unique eligible members.",
              "You can export your data at any time while signed in.",
            ].map((t) => (
              <li key={t} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <Icon name="check" size={15} strokeWidth={2.4} />
                <span className="t-small">{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
