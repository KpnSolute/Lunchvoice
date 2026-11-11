import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { MadeBy } from "../components/MakerMark";
import { Icon } from "../components/Icon";
import { BottomTabs } from "../ui/BottomTabs";
import { SUPPORT_EMAIL, SUPPORT_MAILTO, supportMailto } from "../config/contact";
import { safeReturnTo } from "../lib/kpnIdentity";
import { SESSION_ENDED_FLAG } from "../lib/authFailure";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Card } from "@/components/shadcn/card";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetDescription } from "@/components/shadcn/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Field, Notice } from "@/components/shadcn/blocks";
import { AccountSuspendedNotice, StaffMenuItem } from "../components/StaffStatus"; // staff panel

// The marketing chrome (full nav, footer, maker's mark) belongs to the public pages.
// In-product routes keep the compact header so Hub chrome stays the focus.
const MARKETING_ROUTES = new Set([
  "/", "/how-it-works", "/use-cases", "/pricing", "/beta", "/about", "/waitlist",
  "/status", "/terms", "/guidelines", "/privacy", "/support", "/discover",
]);

// Account routes get the account shell: header pills on desktop, bottom tabs on phones.
const isAccountRoute = (p: string) => ["/me", "/join", "/settings", "/create"].includes(p) || p === "/surveys" || p.startsWith("/surveys/");
const ACCOUNT_TABS = [
  { to: "/me", label: "Home", icon: "home" as const, end: true },
  { to: "/surveys", label: "Surveys", icon: "survey" as const },
  { to: "/join", label: "Join", icon: "join" as const, end: true },
  { to: "/settings", label: "Settings", icon: "settings" as const, end: true },
];
const MARKETING_LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/use-cases", label: "Use cases" },
  { to: "/pricing", label: "Pricing" },
  { to: "/waitlist", label: "Waitlist" },
  { to: "/discover", label: "Discover" },
];

function Brand() {
  return (
    <Link to="/" className="lv-brand" aria-label="LunchVoice home">
      <img src="/brand/lunchvoice-mark.svg" alt="" height={28} width={28} />
      <span>LunchVoice</span>
    </Link>
  );
}

function AccountMenu() {
  const { session, signOut } = useIdentity();
  const nav = useNavigate();
  if (!session) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Account menu for ${session.name}`}>
          <span className="lv-avatar-dot" aria-hidden="true">{session.name.slice(0, 1).toUpperCase()}</span>
          <span className="lv-hide-sm">{session.name}</span>
          <Icon name="chevron" size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signed in as {session.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => nav("/me")}>My home</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => nav("/surveys")}>Quick Surveys</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => nav("/settings")}>Account settings</DropdownMenuItem>
        <StaffMenuItem />{/* staff panel: platform admins only */}
        <DropdownMenuItem asChild className="lv-menu-link"><a href={supportMailto("LunchVoice support")} data-testid="menu-contact-support">Contact support</a></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { signOut(); nav("/"); }}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarketingMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary" size="icon-sm" className="lv-show-sm" aria-label="Open menu">
          <Icon name="menu" size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetTitle>Menu</SheetTitle>
        <SheetDescription className="sr-only">Site sections</SheetDescription>
        <nav className="lv-sheet-nav" aria-label="Main">
          {MARKETING_LINKS.map((l) => (
            <Button key={l.to} asChild variant="secondary" block size="lg" onClick={() => setOpen(false)}>
              <Link to={l.to}>{l.label}</Link>
            </Button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function Shell() {
  const { session } = useIdentity();
  const { pathname } = useLocation();
  const marketing = MARKETING_ROUTES.has(pathname) || pathname.startsWith("/use-cases/");
  const account = Boolean(session) && isAccountRoute(pathname);
  const bare = pathname.startsWith("/c/") || pathname.startsWith("/s/");
  const ink = pathname === "/";

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // The respondent player is a bare surface: no app header, no footer, no signature.
  if (bare) return <main id="main" className="lv-playermain"><Outlet /></main>;

  return (
    <>
      <a href="#main" className="lv-skiplink">Skip to content</a>
      <header className={`lv-header${ink ? " lv-header-ink" : ""}`}>
        <Brand />

        {account && (
          <nav className="lv-appnav" aria-label="Account">
            {ACCOUNT_TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}>{t.label}</NavLink>
            ))}
          </nav>
        )}

        {marketing && (
          <nav className="lv-nav" aria-label="Main">
            {MARKETING_LINKS.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
          </nav>
        )}

        <div className="lv-header-actions">
          {session ? (
            <AccountMenu />
          ) : (
            <>
              <Button asChild variant={ink ? "quiet" : "secondary"} size="sm" className="lv-hide-sm lv-header-signin">
                <Link to="/signin">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link to="/waitlist">Join the waitlist</Link>
              </Button>
            </>
          )}
          {marketing && <MarketingMenu />}
        </div>
      </header>

      <main id="main" className={marketing ? "lv-main" : "wrap"} tabIndex={-1}>
        {session && <AccountSuspendedNotice />}{/* staff panel: account suspension */}
        <Outlet />
      </main>

      {account && <BottomTabs label="Account" items={ACCOUNT_TABS} />}

      {marketing && <Footer />}
    </>
  );
}

function Footer() {
  return (
    <footer className="lv-footer">
      <div className="lv-footer-inner">
        <span className="lv-footer-brand">
          <img src="/brand/lunchvoice-mark.svg" alt="" height={26} width={26} />
          <strong>LunchVoice</strong>
        </span>
        <nav className="lv-footer-nav" aria-label="Footer">
          <Link to="/how-it-works">Product</Link>
          <Link to="/use-cases">Use cases</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/waitlist">Waitlist</Link>
          <Link to="/discover">Discover</Link>
          <Link to="/about">About</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/guidelines">Guidelines</Link>
          <Link to="/support">Support</Link>
          <Link to="/status">Status</Link>
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
        </nav>
        <div className="lv-footer-end">
          <MadeBy />
          <span className="lv-footer-copy">© 2026 LunchVoice</span>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ /signin */

export function SignIn() {
  const { session, issuerConfigured, canSimulate, signInSimulated, signIn } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Dana Reyes");
  const location = useLocation();
  const nav = useNavigate();
  // Shown when the person lands here because their session ran out (see IdentityProvider). Read in render, cleared in an
  // effect, so React StrictMode's double render still shows it.
  const [ended] = useState(() => { try { return sessionStorage.getItem(SESSION_ENDED_FLAG) === "1"; } catch { return false; } });
  useEffect(() => { try { sessionStorage.removeItem(SESSION_ENDED_FLAG); } catch { /* nothing to clear */ } }, []);
  // LC-14: history state is caller-controlled; only safe same-site paths are followed.
  const from = safeReturnTo((location.state as { from?: string } | null)?.from);
  if (session) return <Navigate to={from} replace />;
  return (
    <div className="lv-narrow">
      <Card className="lv-signin">
        <img src="/brand/lunchvoice-mark.svg" alt="" height={44} width={44} />
        <h1 className="lv-signin-title">Sign in to LunchVoice</h1>
        {ended && (
          <Notice tone="info" title="You were signed out">
            Sessions last up to an hour, so yours ended. Sign in again to carry on where you were. Anything you had saved is still there.
          </Notice>
        )}
        <p className="ui-muted lv-signin-sub">One KpnSolute account for every Hub. We keep your verified sign-in, never your email as your identity.</p>
        {issuerConfigured ? (
          <Button
            variant="ink"
            size="lg"
            block
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              signIn(from).catch((e: unknown) => {
                setBusy(false);
                setError(e instanceof Error ? e.message : "Sign-in could not start.");
              });
            }}
          >
            {busy ? "Opening KpnSolute sign-in…" : "Continue with KpnSolute"}
          </Button>
        ) : (
          <Notice tone="warn" title="Sign-in isn't available in this build">
            KpnIdentity, the KpnSolute account service, is not configured here. Answering a survey with a code still works without an account.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Button asChild variant="quiet" size="sm">
          <Link to="/join">Have a join code? Answer without signing in</Link>
        </Button>
        {import.meta.env.DEV && canSimulate && (
          <div className="lv-dev-box">
            <Field label="Simulated display name (dev only)" htmlFor="sim-name">
              <Input id="sim-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button variant="secondary" block onClick={() => { signInSimulated(name); nav(from); }}>Sign in (simulated)</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export function RequireSignIn({ children }: { children: ReactNode }) {
  const { session } = useIdentity();
  const location = useLocation();
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname + location.search }} replace />;
  return <>{children}</>;
}

/** /auth/callback: finishes the KpnIdentity redirect, then returns the person where they were going. */
export function AuthCallback() {
  const { completeSignIn } = useIdentity();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn(window.location.search)
      .then((to) => nav(safeReturnTo(to), { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Sign-in failed."));
  }, [completeSignIn, nav]);
  return (
    <div className="lv-narrow">
      <Card className="lv-signin">
        <h1 className="lv-signin-title">{error ? "Sign-in did not finish" : "Signing you in…"}</h1>
        {error ? (
          <>
            <Notice tone="error">{error}</Notice>
            <Button asChild variant="ink"><Link to="/signin">Try again</Link></Button>
          </>
        ) : (
          <p className="ui-muted">Checking your KpnIdentity sign-in.</p>
        )}
      </Card>
    </div>
  );
}
