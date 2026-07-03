import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Icon, type IconName } from "./Icon";

const studentTabs: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/rate", label: "Rate", icon: "star" },
  { to: "/menu", label: "Menu", icon: "menu" },
  { to: "/surveys", label: "Survey", icon: "survey" },
  { to: "/voice", label: "Voice", icon: "voice" },
];

const adminTabs: { to: string; label: string; icon: IconName }[] = [
  { to: "/admin", label: "Dashboard", icon: "dashboard" },
  { to: "/admin/content", label: "Content", icon: "survey" },
  { to: "/admin/sessions", label: "Sessions", icon: "survey" },
  { to: "/admin/store", label: "Store", icon: "store" },
  { to: "/admin/orders", label: "Orders", icon: "orders" },
];

export function Layout() {
  const { isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const tabs = isAdmin ? adminTabs : studentTabs;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" onClick={() => navigate(isAdmin ? "/admin" : "/")}>
          <div className="brand-mark">DV</div>
          <div>
            <div className="brand-name">Dining Voice</div>
            <div className="brand-sub">Miami Job Corps</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          {isAdmin ? (
            <span className="anon-pill staff-pill">Staff</span>
          ) : (
            <span className="anon-pill" title="Staff only ever see your ratings in aggregate">
              <span className="anon-dot" /> Anonymous
            </span>
          )}
          <button className="icon-btn" onClick={signOut} title="Log out" aria-label="Log out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === "/" || t.to === "/admin"}>
              <Icon name={t.icon} size={22} />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
