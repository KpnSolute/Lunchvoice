import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export function Home() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function goToOrg() {
    const s = slug.trim();
    if (s) navigate(`/${s}/login`);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("contract_requests").insert({
      org_name: orgName.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      message: message.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
    } else {
      setSubmitted(true);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 600, paddingTop: 48 }}>
      <div className="card center" style={{ marginBottom: 24 }}>
        <p className="eyebrow tag" style={{ display: "inline-block" }}>Lunch Voice</p>
        <h1 style={{ fontSize: 34, marginTop: 12, marginBottom: 4 }}>
          Menu management + student feedback for cafeteria operators
        </h1>
        <p className="hint" style={{ margin: "8px 0 20px" }}>
          Lunch Voice gives cafeteria contractors a complete feedback loop: upload menus, launch
          student surveys, track ratings, and redeem rewards — all from one dashboard.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Already a Lunch Voice org?</h2>
        <p className="hint">Enter your organization slug to sign in.</p>
        <div className="row" style={{ gap: 8 }}>
          <input
            type="text"
            placeholder="e.g. LionCafe"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToOrg()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={goToOrg} disabled={!slug.trim()}>Go</button>
        </div>
      </div>

      <div className="card">
        <h2>Request our services</h2>
        <p className="hint">Interested in Lunch Voice for your cafeteria? Drop us a line.</p>
        {submitted ? (
          <div className="notice ok">Thanks! We'll be in touch soon.</div>
        ) : (
          <form onSubmit={submitRequest} className="stack">
            <div className="field-block">
              <label className="field">Organization name</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="e.g. Miami Job Corps" />
            </div>
            <div className="field-block">
              <label className="field">Your name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder="Full name" />
            </div>
            <div className="field-block">
              <label className="field">Email</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required placeholder="you@org.com" />
            </div>
            <div className="field-block">
              <label className="field">Message (optional)</label>
              <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your cafeteria and what you need" />
            </div>
            {err && <div className="notice err">{err}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Sending..." : "Send request"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
