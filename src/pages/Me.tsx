import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import type { MyContext } from "../lib/lvApi";
import { slugProblem } from "../lib/reservedSlugs";

export function Me() {
  const { api } = useIdentity();
  const [ctx, setCtx] = useState<MyContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const refresh = useCallback(async () => {
    const r = await api.myContext();
    if (r.ok) setCtx(r);
    else setError(r.error.message);
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const problem = slug ? slugProblem(slug) : null;

  async function create() {
    setError(null);
    const r = await api.hubCreate(slug.toLowerCase(), name);
    if (r.ok) { setSlug(""); setName(""); await refresh(); } else setError(r.error.message);
  }
  async function redeem() {
    setError(null);
    const r = await api.inviteRedeem(code.trim());
    if (r.ok) { setCode(""); await refresh(); } else setError(r.error.message);
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1>{ctx?.display_name ? `Hi, ${ctx.display_name}` : "Your account"}</h1>
      {error && <div className="notice" role="alert">{error}</div>}
      <section className="card stack">
        <h2>Your Hubs</h2>
        {!ctx ? <p className="muted">Loading…</p> : ctx.hubs.length === 0 ? <p className="muted">You are not in any Hub yet.</p> : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {ctx.hubs.map((h) => (
              <li key={h.hub_id}><Link to={`/${h.slug}`}>{h.name}</Link> <span className="mono muted">/{h.slug}{h.is_owner ? " · owner" : ""}</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="card stack">
        <h2>Create a Hub</h2>
        <label className="stack">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="stack">Address (lunchvoice.com/…)<input value={slug} onChange={(e) => setSlug(e.target.value)} aria-invalid={Boolean(problem)} /></label>
        {problem && <div className="notice" role="alert">{problem === "reserved" ? "That address is reserved." : "Use 3–40 lowercase letters, numbers and single hyphens."}</div>}
        <button className="btn btn-primary" disabled={!slug || !name || Boolean(problem)} onClick={create}>Create Hub</button>
      </section>
      <section className="card stack">
        <h2>Have an invite code?</h2>
        <label className="stack">Code<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="btn btn-solid" disabled={!code.trim()} onClick={redeem}>Join Hub</button>
      </section>
    </div>
  );
}
