import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="wrap">
      <div className="topbar">
        <div onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          <p className="eyebrow">Miami Job Corps · Cafeteria</p>
          <h1>The Lunch Line</h1>
        </div>
        <div className="topnav">
          {isAdmin ? (
            <>
              <NavLink to="/admin" end>Dashboard</NavLink>
              <NavLink to="/admin/sessions">Sessions</NavLink>
              <NavLink to="/admin/roster">Roster</NavLink>
              <NavLink to="/admin/store">Store</NavLink>
              <NavLink to="/admin/orders">Orders</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" end>Home</NavLink>
              <NavLink to="/store">Store</NavLink>
              <NavLink to="/orders">My Orders</NavLink>
            </>
          )}
          {profile && !isAdmin && (
            <span className="points-badge" title="Your points">
              🍴 {profile.points}
              {profile.streak > 0 && <span className="streak">🔥{profile.streak}</span>}
            </span>
          )}
          <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
