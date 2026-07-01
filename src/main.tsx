import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Layout } from "./components/Layout";
import { Login } from "./routes/Login";
import { Home } from "./routes/student/Home";
import { Survey } from "./routes/student/Survey";
import { Store } from "./routes/student/Store";
import { Orders } from "./routes/student/Orders";
import { Join } from "./routes/student/Join";
import { Dashboard } from "./routes/admin/Dashboard";
import { Sessions } from "./routes/admin/Sessions";
import { StoreAdmin } from "./routes/admin/StoreAdmin";
import { OrdersAdmin } from "./routes/admin/OrdersAdmin";
import { Roster } from "./routes/admin/Roster";
import "./index.css";

function Gate({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { session, profile, loading, isAdmin } = useAuth();
  if (loading) return <div className="wrap center muted" style={{ paddingTop: 60 }}>Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  // profile may still be loading right after sign-in
  if (!profile) return <div className="wrap center muted" style={{ paddingTop: 60 }}>Setting up your account…</div>;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/join" element={<Gate><Join /></Gate>} />

      <Route element={<Gate><Layout /></Gate>}>
        <Route index element={<Home />} />
        <Route path="survey/:sessionId" element={<Survey />} />
        <Route path="store" element={<Store />} />
        <Route path="orders" element={<Orders />} />
      </Route>

      <Route path="/admin" element={<Gate adminOnly><Layout /></Gate>}>
        <Route index element={<Dashboard />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="roster" element={<Roster />} />
        <Route path="store" element={<StoreAdmin />} />
        <Route path="orders" element={<OrdersAdmin />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
