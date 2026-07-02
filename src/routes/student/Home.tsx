import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

export function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // If a QR/link code was stashed before login, resume the join now.
  useEffect(() => {
    if (sessionStorage.getItem("pendingJoinCode")) navigate("/join", { replace: true });
  }, [navigate]);

  return (
    <>
      <div className="card">
        <div className="spread">
          <div>
            <h2>Hi{profile?.display_name ? `, ${profile.display_name}` : ""} 👋</h2>
            <p className="hint" style={{ margin: 0 }}>Rate dishes, take surveys, earn 🍴 points.</p>
          </div>
          <div className="center">
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 34, color: "var(--sage)" }}>{profile?.points ?? 0}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>
              POINTS{profile && profile.streak > 0 ? ` · 🔥${profile.streak}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="quick-grid">
        <button className="quick-card" onClick={() => navigate("/rate")}>
          <span className="quick-emoji">⭐</span>
          <span className="quick-name">Rate the dishes</span>
          <span className="quick-sub">Stars for anything you've tried</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/surveys")}>
          <span className="quick-emoji">📋</span>
          <span className="quick-name">Surveys</span>
          <span className="quick-sub">Join with a code, earn points</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/store")}>
          <span className="quick-emoji">🛍️</span>
          <span className="quick-name">Store</span>
          <span className="quick-sub">Spend your 🍴 points</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/orders")}>
          <span className="quick-emoji">🧾</span>
          <span className="quick-name">My orders</span>
          <span className="quick-sub">Track your pickups</span>
        </button>
      </div>
    </>
  );
}
