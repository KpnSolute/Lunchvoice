import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// Handles /join?code=XXXX — joins the session then bounces into the survey.
export function Join() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [err, setErr] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code") || sessionStorage.getItem("pendingJoinCode");
    sessionStorage.removeItem("pendingJoinCode");
    if (!code) {
      navigate("/", { replace: true });
      return;
    }
    supabase.rpc("join_session", { p_code: code }).then(({ data, error }) => {
      if (error) setErr(error.message);
      else navigate(`/survey/${data}`, { replace: true });
    });
  }, [params, navigate]);

  return (
    <div className="wrap" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="card center">
        {err ? (
          <>
            <div className="notice err">{err}</div>
            <button className="btn-ghost" onClick={() => navigate("/")}>Back to home</button>
          </>
        ) : (
          <p className="muted">Joining session…</p>
        )}
      </div>
    </div>
  );
}
