import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";

// Handles /join?code=XXXX — joins the session then bounces into the survey.
export function Join() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { org } = useOrg();
  const [err, setErr] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code") || sessionStorage.getItem("pendingJoinCode");
    sessionStorage.removeItem("pendingJoinCode");
    if (!code) {
      navigate(`/${org.slug}`, { replace: true });
      return;
    }
    supabase.rpc("join_session", { p_code: code }).then(({ data, error }) => {
      if (error) setErr(error.message);
      else navigate(`/${org.slug}/survey/${data}`, { replace: true });
    });
  }, [params, navigate, org.slug]);

  return (
    <div className="wrap" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="card center">
        {err ? (
          <>
            <div className="notice err">{err}</div>
            <button className="btn btn-ghost" onClick={() => navigate(`/${org.slug}`)}>Back to home</button>
          </>
        ) : (
          <p className="muted">Joining session…</p>
        )}
      </div>
    </div>
  );
}
