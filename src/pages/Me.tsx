import { useState } from "react";
import { Link } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { slugProblem } from "../lib/reservedSlugs";
import { useLv } from "../lib/useLv";

export function Me() {
  const { api } = useIdentity();
  const ctx = useLv(() => api.myContext(), [api]);
  const [error, setError] = useState<string | null>(null);
  const [needsBeta, setNeedsBeta] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ name: string; already: boolean } | null>(null);

  const problem = slug ? slugProblem(slug) : null;
  const c = ctx.data;

  async function create() {
    setError(null);
    const r = await api.hubCreate(slug.toLowerCase(), name);
    if (r.ok) { setSlug(""); setName(""); setNeedsBeta(false); ctx.reload(); }
    else if (r.error.code === "lv_beta_required") setNeedsBeta(true);
    else setError(r.error.message);
  }
  async function applyBeta() {
    setError(null);
    const r = await api.betaApply();
    if (r.ok) ctx.reload(); else setError(r.error.message);
  }
  async function previewInvite() {
    setError(null);
    const r = await api.invitePreview(code.trim());
    if (r.ok) setPreview({ name: r.hub.name, already: r.already_member }); else { setPreview(null); setError(r.error.message); }
  }
  async function redeem() {
    const r = await api.inviteRedeem(code.trim());
    if (r.ok) { setCode(""); setPreview(null); ctx.reload(); } else setError(r.error.message);
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1>{c?.display_name ? `Hi, ${c.display_name}` : "Your account"}</h1>
      {(error || ctx.error) && <div className="notice" role="alert">{error ?? ctx.error?.message}</div>}
      <section className="card stack">
        <h2>Your Hubs</h2>
        {ctx.loading ? <p className="muted">Loading…</p> : !c || c.hubs.length === 0 ? <p className="muted">You are not in any Hub yet.</p> : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {c.hubs.map((h) => (
              <li key={h.hub_id}><Link to={`/${h.slug}`}>{h.name}</Link> <span className="mono muted">/{h.slug}{h.is_owner ? " · owner" : ""}</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="card stack">
        <h2>Create a Hub</h2>
        {(needsBeta || c?.beta_status === "pending") && (
          <div className="notice" role="status">
            {c?.beta_status === "pending" ? "Your beta application is pending review." : "Creating a Hub needs an approved beta application."}
            {c?.beta_status !== "pending" && <button className="btn btn-ghost" onClick={applyBeta}>Apply for the beta</button>}
          </div>
        )}
        <label className="stack">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="stack">Address (lunchvoice.com/…)<input value={slug} onChange={(e) => setSlug(e.target.value)} aria-invalid={Boolean(problem)} /></label>
        {problem && <div className="notice" role="alert">{problem === "reserved" ? "That address is reserved." : "Use 3–40 lowercase letters, numbers and single hyphens."}</div>}
        <button className="btn btn-primary" disabled={!slug || !name || Boolean(problem)} onClick={create}>Create Hub</button>
      </section>
      <section className="card stack">
        <h2>Have an invite code?</h2>
        <label className="stack">Code<input value={code} onChange={(e) => { setCode(e.target.value); setPreview(null); }} /></label>
        {preview ? (
          <div className="stack">
            <p>{preview.already ? `You are already in ${preview.name}.` : `Join ${preview.name}?`}</p>
            <button className="btn btn-solid" disabled={preview.already} onClick={redeem}>Join Hub</button>
          </div>
        ) : <button className="btn btn-ghost" disabled={!code.trim()} onClick={previewInvite}>Check code</button>}
      </section>
    </div>
  );
}
