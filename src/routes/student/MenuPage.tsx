import { CYCLE, STAPLES, weekdayFor } from "../../lib/menu";

export function MenuPage() {
  return (
    <>
      <div className="page-head">
        <h2>28-day cycle menu</h2>
        <p className="hint">What's coming up on the line, day by day.</p>
      </div>

      <div className="card">
        <h2>Everyday staples</h2>
        <p className="hint" style={{ margin: 0 }}>{STAPLES.map((s) => s.name).join(" · ")}</p>
      </div>

      <div className="menu-grid">
        {CYCLE.map(([lunch, lunchAlt, dinner, dinnerAlt], i) => (
          <div key={i} className="card menu-day">
            <div className="cat-label">Day {i + 1} · {weekdayFor(i)}</div>
            <div className="menu-meal"><span className="meal-tag">Lunch</span> {lunch} <span className="muted">or</span> {lunchAlt}</div>
            <div className="menu-meal"><span className="meal-tag">Dinner</span> {dinner} <span className="muted">or</span> {dinnerAlt}</div>
          </div>
        ))}
      </div>
    </>
  );
}
