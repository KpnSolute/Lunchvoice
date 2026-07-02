import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const icons = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9" />,
  star: <path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 5.9L12 16.4l-5.3 2.9 1.2-5.9L3.4 9.3l6-.7L12 3z" />,
  menu: <path d="M4 6h16M4 12h10M4 18h13" />,
  survey: <path d="M4 4h16v13H8l-4 4V4zM8 9h8M8 13h5" />,
  voice: <path d="M6 20v-8m6 8V4m6 16v-11" />,
  dashboard: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />,
  roster: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.6M17.5 14.3c2 .8 3.5 2.9 3.5 5.7" />,
  store: <path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2" />,
  orders: <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3zM9 8h6M9 12h6" />,
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icons[name]}
    </svg>
  );
}

export function Layout() {
  const { isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" onClick={() => navigate(isAdmin ? "/admin" : "/")}>
          <div className="brand-mark">MJ</div>
          <div>
            <div className="brand-name">Dining Voice</div>
            <div className="brand-sub">Miami Job Corps</div>
          </div>
        </div>
        <div className="spread" style={{ gap: 8, flexWrap: "nowrap" }}>
          {isAdmin ? (
            <span className="anon-pill staff-pill">Staff</span>
          ) : (
            <span className="anon-pill" title="Staff only ever see your ratings and feedback in aggregate">
              <span className="anon-dot" /> Anonymous
            </span>
          )}
          <button className="icon-btn" onClick={signOut} title="Log out" aria-label="Log out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {isAdmin ? (
            <>
              <NavLink to="/admin" end><Icon name="dashboard" />Dashboard</NavLink>
              <NavLink to="/admin/sessions"><Icon name="survey" />Sessions</NavLink>
              <NavLink to="/admin/roster"><Icon name="roster" />Roster</NavLink>
              <NavLink to="/admin/store"><Icon name="store" />Store</NavLink>
              <NavLink to="/admin/orders"><Icon name="orders" />Orders</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" end><Icon name="home" />Home</NavLink>
              <NavLink to="/rate"><Icon name="star" />Rate</NavLink>
              <NavLink to="/menu"><Icon name="menu" />Menu</NavLink>
              <NavLink to="/surveys"><Icon name="survey" />Survey</NavLink>
              <NavLink to="/voice"><Icon name="voice" />Voice</NavLink>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
