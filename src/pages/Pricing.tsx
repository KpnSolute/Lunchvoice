import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Micro, Notice, Pill } from "../components/ui";
import { PLANS } from "../config/pricing";

// Display-only page. The backend entitlement map decides what a plan allows; every
// checkout button stays disabled because no billing service is deployed yet.
const CHECKOUT_CLOSED = "Checkout is not open yet — nothing on this page can charge you.";

const RTB = [
  { label: "Custom roles", starter: "3", team: "6" },
  { label: "Active Survey-mode Campaigns", starter: "2", team: "5" },
  { label: "Survey replacement threshold", starter: "More than 50% of eligible members", team: "20% of eligible members or more" },
  { label: "Discover eligibility", starter: "—", team: "Apply at 700 active members" },
  { label: "Active Campaigns overall", starter: "15", team: "Not published" },
];

export function Pricing() {
  return (
    <div className="lv-page">
      <header className="ui-head">
        <Micro accent>Pricing</Micro>
        <h1 className="ui-display ui-display-xl">Free to answer. Pay to create.</h1>
        <p>
          Participation is free forever. Creating a Hub is a monthly plan or a time-bounded Campaign
          window, and every paid surface fails closed rather than guessing.
        </p>
      </header>

      <Notice tone="warn">{CHECKOUT_CLOSED}</Notice>

      {/* ---------- the six canonical plans ---------- */}
      <div className="lv-plan-grid" style={{ marginTop: 18 }}>
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`lv-price-card${plan.id === "team" ? " lv-price-card-feature" : ""}`}
            aria-labelledby={`plan-${plan.id}`}
          >
            <div className="ui-spread">
              <Micro accent={plan.id === "team"}>{plan.name}</Micro>
              {plan.id === "team" && <Pill tone="accent">Most included</Pill>}
            </div>
            <p className="lv-price-figure">
              <span>{plan.priceLabel ?? "—"}</span>
              <small>{plan.cadence}</small>
            </p>
            <ul className="lv-plan-list">
              {plan.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={15} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="ui-btn ui-btn-block ui-btn-outline"
              disabled
              aria-disabled="true"
              title={plan.priceLabel === null ? "No authoritative price has been supplied" : CHECKOUT_CLOSED}
            >
              {plan.id === "free"
                ? "Included with any account"
                : plan.priceLabel === null
                  ? "Pricing coming soon"
                  : "Checkout opens soon"}
            </button>
          </article>
        ))}
      </div>

      {/* ---------- entitlement map ---------- */}
      <section style={{ marginTop: 46 }} aria-labelledby="entitlements-title">
        <header className="lv-section-head">
          <p className="lv-eyebrow">What a plan actually changes</p>
          <h2 id="entitlements-title" className="ui-display ui-display-lg">
            Limits are counted in unique eligible members.
          </h2>
        </header>
        <div className="ui-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <caption className="ui-help" style={{ textAlign: "left", padding: "14px 16px 0" }}>
                Starter and Team only. Guests, duplicates and bots never count toward a threshold.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Entitlement</th>
                  <th scope="col">Starter · $13</th>
                  <th scope="col">Team · $29</th>
                </tr>
              </thead>
              <tbody>
                {RTB.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 14, padding: "12px 16px" }}>
                      {row.label}
                    </th>
                    <td style={{ padding: "12px 16px" }}>{row.starter}</td>
                    <td style={{ padding: "12px 16px" }}>{row.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="ui-help" style={{ marginTop: 10 }}>
          A Starter Hub can replace a Survey once more than half of its eligible members have answered. A Team
          Hub unlocks that at 20%. Replacement never deletes the original responses.
        </p>
      </section>

      {/* ---------- Campaign windows ---------- */}
      <section style={{ marginTop: 46 }} aria-labelledby="windows-title">
        <header className="lv-section-head">
          <p className="lv-eyebrow">One Campaign, no subscription</p>
          <h2 id="windows-title" className="ui-display ui-display-lg">
            Time-bounded windows for a single Campaign.
          </h2>
        </header>
        <div className="ui-grid-2">
          <article className="ui-card">
            <Micro accent>Campaign Starter</Micro>
            <p className="lv-price-figure" style={{ margin: "10px 0 4px" }}>
              <span>$19</span>
              <small>first 2 weeks, then $13 per extra week</small>
            </p>
            <p className="ui-muted" style={{ margin: "0 0 14px", fontSize: 14.5 }}>
              The Starter feature family for the length of your window. The Hub itself is not a subscription
              during that period.
            </p>
            <button className="ui-btn ui-btn-outline" disabled aria-disabled="true">Checkout opens soon</button>
          </article>
          <article className="ui-card ui-card-quiet">
            <Micro accent>Campaign Plus</Micro>
            <p className="lv-price-figure" style={{ margin: "10px 0 4px" }}>
              <span>—</span>
              <small>price not published</small>
            </p>
            <p className="ui-muted" style={{ margin: "0 0 14px", fontSize: 14.5 }}>
              The Team feature family for a time-bounded window. No price has been supplied, so this card never
              invents one and its checkout stays closed.
            </p>
            <button className="ui-btn ui-btn-outline" disabled aria-disabled="true">Pricing coming soon</button>
          </article>
        </div>
      </section>

      {/* ---------- Hub Name Reservation ---------- */}
      <section style={{ marginTop: 46 }} aria-labelledby="reservation-title">
        <div className="ui-panel">
          <div className="ui-panel-top">
            <Micro accent>Hub Name Reservation</Micro>
            <Pill tone="accent">$25 / 12 months</Pill>
          </div>
          <h2 id="reservation-title" className="ui-display ui-display-md" style={{ margin: "0 0 8px" }}>
            Reserve your Hub URL before you build it.
          </h2>
          <p style={{ margin: "0 0 18px", maxWidth: "60ch" }}>
            Hold an address while you plan. Renewal is $25 per 12 months, and a reservation grants no features.
          </p>
          <div className="lv-lifecycle" aria-label="Reservation lifecycle">
            <span>ACTIVE</span>
            <i aria-hidden="true">→</i>
            <span>GRACE · 25 days</span>
            <i aria-hidden="true">→</i>
            <span>RELEASED</span>
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 13.5, maxWidth: "62ch" }}>
            After expiry the address enters a 25-day grace period. Once released it can be claimed by another
            creator, and it never exposes a previous owner&rsquo;s data.
          </p>
          <div className="ui-row" style={{ marginTop: 18 }}>
            <button className="ui-btn ui-btn-primary" disabled aria-disabled="true">Reservation checkout opens soon</button>
            <Link className="ui-btn ui-btn-outline" to="/create">Create a Hub instead</Link>
          </div>
        </div>
      </section>

      <div className="ui-row" style={{ marginTop: 34 }}>
        <Link className="ui-btn ui-btn-primary ui-btn-lg" to="/signin">
          Get started <Icon name="arrow" size={17} />
        </Link>
        <Link className="ui-btn ui-btn-outline ui-btn-lg" to="/how-it-works">See how it works</Link>
      </div>
    </div>
  );
}
