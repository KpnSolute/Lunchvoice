import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { OrgProvider } from "./org/OrgProvider";
import { Layout } from "./components/Layout";
import { Login } from "./routes/Login";
import { StaffSsoCallback } from "./routes/StaffSsoCallback";
import { Home } from "./routes/student/Home";
import { Rate } from "./routes/student/Rate";
import { MenuPage } from "./routes/student/MenuPage";
import { Surveys } from "./routes/student/Surveys";
import { Voice } from "./routes/student/Voice";
import { Survey } from "./routes/student/Survey";
import { Store } from "./routes/student/Store";
import { Orders } from "./routes/student/Orders";
import { Join } from "./routes/student/Join";
import { Dashboard } from "./routes/admin/Dashboard";
import { ContentCentral } from "./routes/admin/ContentCentral";
import { StoreAdmin } from "./routes/admin/StoreAdmin";
import { OrdersAdmin } from "./routes/admin/OrdersAdmin";
import { Roster } from "./routes/admin/Roster";
import { Home as MarketingHome } from "./routes/marketing/Home";
import "./index.css";

function Gate({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { session, profile, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="wrap center muted" style={{ paddingTop: 60 }}>Loading…</div>;
  if (!session) return <Navigate to={`login${location.search}`} replace />;
  if (!profile) return <div className="wrap center muted" style={{ paddingTop: 60 }}>Setting up your account…</div>;
  if (adminOnly && !isAdmin) return <Navigate to="" replace />;
  return <>{children}</>;
}

function OrgApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="sso" element={<StaffSsoCallback />} />
        <Route path="join" element={<Gate><Join /></Gate>} />

        <Route element={<Gate><Layout /></Gate>}>
          <Route index element={<Home />} />
          <Route path="rate" element={<Rate />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="surveys" element={<Surveys />} />
          <Route path="voice" element={<Voice />} />
          <Route path="survey/:sessionId" element={<Survey />} />
          <Route path="store" element={<Store />} />
          <Route path="orders" element={<Orders />} />
        </Route>

        <Route path="admin" element={<Gate adminOnly><Layout /></Gate>}>
          <Route index element={<Dashboard />} />
          <Route path="content" element={<ContentCentral />} />
          {/* legacy sessions page folded into Content Central's Launch tab */}
          <Route path="sessions" element={<Navigate to="../content" replace />} />
          <Route path="roster" element={<Roster />} />
          <Route path="store" element={<StoreAdmin />} />
          <Route path="orders" element={<OrdersAdmin />} />
        </Route>

        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function LionCafeRedirect() {
  const location = useLocation();
  return <Navigate to={`/LionCafe${location.pathname}${location.search}`} replace />;
}

const PRIMARY_HOSTS = new Set(["lunchvoice.com", "www.lunchvoice.com"]);

function tenantSlugFromHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (PRIMARY_HOSTS.has(normalized) || !normalized.endsWith(".lunchvoice.com")) return null;
  const subdomain = normalized.slice(0, -".lunchvoice.com".length);
  return subdomain && !subdomain.includes(".") ? subdomain : null;
}

function RootEntry() {
  const location = useLocation();
  const tenantSlug = tenantSlugFromHostname(window.location.hostname);
  if (tenantSlug) {
    const suffix = location.pathname === "/" ? "" : location.pathname;
    return <Navigate to={`/${tenantSlug}${suffix}${location.search}`} replace />;
  }
  return <MarketingHome />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootEntry />} />
        <Route path="/rate" element={<LionCafeRedirect />} />
        <Route path="/menu" element={<LionCafeRedirect />} />
        <Route path="/surveys" element={<LionCafeRedirect />} />
        <Route path="/voice" element={<LionCafeRedirect />} />
        <Route path="/store" element={<LionCafeRedirect />} />
        <Route path="/orders" element={<LionCafeRedirect />} />
        <Route path="/join" element={<LionCafeRedirect />} />
        <Route path="/survey/:sessionId" element={<LionCafeRedirect />} />
        <Route path="/admin/*" element={<LionCafeRedirect />} />
        <Route path="/:orgSlug/*" element={<OrgProvider><OrgApp /></OrgProvider>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
