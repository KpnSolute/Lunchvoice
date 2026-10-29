import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button, ButtonLink, IconButton } from "./controls";
import { Icon, Logo, type IconName } from "./Icon";
import { HubMark } from "./display";
import { Menu, Sheet } from "./overlays";
import { MakerMark } from "./brand";

/* ------------------------------------------------------------------ marketing */

const MK_LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/use-cases", label: "Use cases" },
  { to: "/pricing", label: "Pricing" },
  { to: "/discover", label: "Discover" },
];

export function MarketingNav({ signedIn, onSignOut }: { signedIn: boolean; onSignOut?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="mk-nav">
      <div className="wrap">
        <nav className="mk-nav-inner" aria-label="Main">
          <Logo size={26} lockup />
          <div className="mk-nav-links">
            {MK_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className="mk-nav-link">
                {l.label}
              </NavLink>
            ))}
          </div>
          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
            {signedIn ? (
              <>
                <ButtonLink to="/me" variant="quiet" size="sm">
                  My Hubs
                </ButtonLink>
                <ButtonLink to="/create" variant="primary" size="sm">
                  Create a Hub
                </ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink to="/signin" variant="quiet" size="sm">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/create" variant="primary" size="sm">
                  Create your Hub
                </ButtonLink>
              </>
            )}
            <span className="mk-menu-btn" style={{ display: "none" }}>
              <IconButton
                icon="more"
                label="Open menu"
                variant="quiet"
                size="sm"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
              />
            </span>
          </div>
        </nav>
      </div>
      <style>{`@media (max-width: 860px){ .mk-menu-btn{display:inline-flex !important;} }`}</style>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="stack">
          {MK_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="menu-link t-title"
              onClick={() => setMenuOpen(false)}
              style={{ textDecoration: "none", padding: "10px 0" }}
              aria-current={pathname === l.to ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
          <hr className="divider" />
          {signedIn ? (
            <>
              <ButtonLink to="/me" variant="raised" icon="home">
                My Hubs
              </ButtonLink>
              <ButtonLink to="/create" variant="primary" icon="plus">
                Create a Hub
              </ButtonLink>
              <Button variant="quiet" onClick={onSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <ButtonLink to="/signin" variant="raised">
                Sign in
              </ButtonLink>
              <ButtonLink to="/create" variant="primary">
                Create your Hub
              </ButtonLink>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

export function Footer({ signedIn }: { signedIn: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer style={{ paddingBlock: "48px 32px", borderTop: "1px solid var(--lv-line)", marginTop: 48 }}>
      <div className="wrap">
        <div className="footer-cols">
          <div className="stack">
            <Logo size={30} lockup />
            <p className="t-small subtle" style={{ maxWidth: "34ch" }}>
              Community feedback that stays private. Run surveys, polls, ratings and ideas in your own Hub.
            </p>
            <MakerMark />
          </div>
          <FooterCol
            title="Product"
            links={[
              { to: "/how-it-works", label: "How it works" },
              { to: "/use-cases", label: "Use cases" },
              { to: "/pricing", label: "Pricing" },
              { to: "/discover", label: "Discover" },
            ]}
          />
          <FooterCol
            title="Account"
            links={
              signedIn
                ? [
                    { to: "/me", label: "My Hubs" },
                    { to: "/create", label: "Create a Hub" },
                    { to: "/settings", label: "Settings" },
                  ]
                : [
                    { to: "/signin", label: "Sign in" },
                    { to: "/join", label: "Join with a code" },
                    { to: "/create", label: "Create a Hub" },
                  ]
            }
          />
          <FooterCol
            title="Company"
            links={[
              { to: "/about", label: "About" },
              { to: "/status", label: "Status" },
              { to: "/support", label: "Support" },
              { to: "/terms", label: "Terms" },
              { to: "/privacy", label: "Privacy" },
            ]}
          />
        </div>
        <div className="row-between" style={{ marginTop: 32 }}>
          <span className="t-small subtle">© {year} LunchVoice · A KpnSolute product</span>
          <span className="t-small subtle">Fonts served from our own origin · Bricolage Grotesque, Geist, Space Mono (OFL)</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <nav aria-label={title} className="stack stack-sm">
      <span className="t-label subtle">{title}</span>
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="t-small" style={{ textDecoration: "none", color: "var(--lv-muted)" }}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ app header */

export interface HubSwitchItem {
  slug: string;
  name: string;
}

export function AppHeader({
  hub,
  hubs,
  accountName,
  onSignOut,
  back,
}: {
  hub?: { slug: string; name: string };
  hubs?: HubSwitchItem[];
  accountName?: string | null;
  onSignOut?: () => void;
  back?: { to: string; label: string };
}) {
  const [hubMenu, setHubMenu] = useState(false);
  const [acctMenu, setAcctMenu] = useState(false);

  return (
    <header className="app-header">
      <div className="wrap">
        <div className="app-header-inner">
          <Logo size={26} />
          {back ? (
            <Link to={back.to} className="t-small subtle row" style={{ textDecoration: "none", gap: 4 }}>
              <Icon name="chevron-left" size={16} />
              {back.label}
            </Link>
          ) : null}
          {hub && (
            <>
              <span aria-hidden="true" style={{ color: "var(--lv-line)" }}>
                /
              </span>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm app-hub"
                  aria-haspopup="menu"
                  aria-expanded={hubMenu}
                  onClick={() => setHubMenu((o) => !o)}
                >
                  <HubMark name={hub.name} slug={hub.slug} size={26} />
                  <span className="app-hub-name">{hub.name}</span>
                  <Icon name="chevron-down" size={16} />
                </button>
                <Menu
                  open={hubMenu}
                  onClose={() => setHubMenu(false)}
                  label="Switch Hub"
                  align="left"
                  items={[
                    ...(hubs ?? []).map((h) => ({ key: h.slug, label: h.name, to: `/${h.slug}`, icon: "home" })),
                    { key: "new", label: "Create a Hub", to: "/create", icon: "plus" },
                  ]}
                />
              </div>
            </>
          )}
          <div className="spacer" />
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn btn-quiet btn-icon btn-icon-sm"
              aria-haspopup="menu"
              aria-expanded={acctMenu}
              aria-label="Account menu"
              onClick={() => setAcctMenu((o) => !o)}
            >
              <Icon name="me" size={20} />
            </button>
            <Menu
              open={acctMenu}
              onClose={() => setAcctMenu(false)}
              label="Account"
              items={[
                { key: "me", label: accountName ? `${accountName} · My Hubs` : "My Hubs", to: "/me", icon: "home" },
                { key: "settings", label: "Settings", to: "/settings", icon: "settings" },
                ...(onSignOut ? [{ key: "out", label: "Sign out", onSelect: onSignOut, icon: "arrow-right" }] : []),
              ]}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hub navigation */

export interface TabItem {
  to: string;
  label: string;
  icon?: IconName;
  end?: boolean;
}

export function HubTabs({ items }: { items: TabItem[] }) {
  return (
    <div className="hub-tabs">
      {/* These are navigation links, not an ARIA tab panel: aria-current marks the
          active section, and the role stays a plain nav. */}
      <nav className="segmented" aria-label="Hub sections">
        {items.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="seg">
            {t.icon && <Icon name={t.icon} size={16} />}
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Phone navigation: at most 5 tabs, selected is pressed amber with aria-current. */
export function BottomTabs({ items, more }: { items: TabItem[]; more?: ReactNode }) {
  return (
    <nav className="bottom-tabs has-bottom-tabs" aria-label="Hub">
      <div className="bottom-tabs-inner">
        {items.slice(0, 4).map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="bottom-tab">
            {t.icon && <Icon name={t.icon} size={20} />}
            <span>{t.label}</span>
          </NavLink>
        ))}
        <MoreTab>{more}</MoreTab>
      </div>
    </nav>
  );
}

function MoreTab({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="bottom-tab" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="more" size={20} />
        <span>More</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="More">
        {/* Any navigation inside the sheet dismisses it. */}
        <div onClick={() => setOpen(false)}>{children}</div>
      </Sheet>
    </>
  );
}

export function Breadcrumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={it.label} className="row" style={{ gap: 6 }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
