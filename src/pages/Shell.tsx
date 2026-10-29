import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { AppHeader, Footer, MarketingNav } from "../ui";

// Two shells: the public site keeps the floating pill nav and the footer; signed-in
// account screens use the app header. The respondent player has its own shell.

export function PublicShell() {
  const { session, signOut } = useIdentity();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <MarketingNav signedIn={Boolean(session)} onSignOut={signOut} />
      <main id="main">
        <Outlet />
      </main>
      <Footer signedIn={Boolean(session)} />
    </>
  );
}

export function AccountShell({ back }: { back?: { to: string; label: string } }) {
  const { session, signOut } = useIdentity();
  const { pathname } = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader accountName={session?.name ?? null} onSignOut={signOut} back={back ?? (pathname === "/me" ? undefined : { to: "/me", label: "My Hubs" })} />
      <main id="main" className="page">
        <div className="wrap">
          <Outlet />
        </div>
      </main>
    </>
  );
}

export function RequireSignIn({ children }: { children: React.ReactNode }) {
  const { session } = useIdentity();
  const location = useLocation();
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}
