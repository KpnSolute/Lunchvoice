import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { staffSso, MJCC_STAFF_SSO_URL } from "../lib/supabase";
import { useOrg } from "../org/OrgProvider";

export function StaffSsoCallback() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = fragment.get("code") ?? "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (!code) {
      setError("The MJCC sign-in link is missing or expired.");
      return;
    }

    staffSso(code, org.slug)
      .then(() => navigate(`/${org.slug}/admin`, { replace: true }))
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "MJCC sign-in failed.");
      });
  }, [navigate, org.slug]);

  if (error) {
    return (
      <div className="wrap center" style={{ paddingTop: 60 }}>
        <div className="card stack" style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2>MJCC sign-in could not finish</h2>
          <div className="notice err">{error}</div>
          <button className="btn btn-primary" onClick={() => window.location.assign(MJCC_STAFF_SSO_URL)}>
            Return to MJCC sign-in
          </button>
        </div>
      </div>
    );
  }

  return <div className="wrap center muted" style={{ paddingTop: 60 }}>Confirming your LionCafe access…</div>;
}
