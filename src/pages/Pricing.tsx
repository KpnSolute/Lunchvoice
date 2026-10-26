import { Link } from "react-router-dom";
import { PLANS } from "../config/pricing";

export function Pricing() {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><div className="eyebrow">Pricing</div><h1>Free to answer. Pay to create.</h1></div>
      <div className="stack" style={{ gap: 12 }}>
        {PLANS.map((p) => (
          <section key={p.id} className="card stack" aria-labelledby={`plan-${p.id}`}>
            <h2 id={`plan-${p.id}`}>{p.name}</h2>
            <p><span className="stat">{p.priceLabel ?? "—"}</span> <span className="muted">{p.cadence}</span></p>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn btn-ghost" disabled aria-disabled="true">{p.priceLabel === null ? "Pricing coming soon" : p.id === "free" ? "Included" : "Checkout opens soon"}</button>
          </section>
        ))}
      </div>
      <Link to="/signin">Sign in to get started</Link>
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return <div className="card stack"><h2>{title}</h2><p className="muted">This area is not available yet.</p></div>;
}
