import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import type { HubSummary } from "../lib/lvApi";
import { RESERVED_SLUGS } from "../lib/reservedSlugs";
import { NotFound } from "./Public";

// Hub lookup uses lv_my_context until the backend ships "hub by slug".
function useHub(slug: string | undefined) {
  const { api } = useIdentity();
  const [state, setState] = useState<{ hub: HubSummary | null; loading: boolean }>({ hub: null, loading: true });
  useEffect(() => {
    let live = true;
    void api.myContext().then((r) => {
      if (live) setState({ hub: r.ok ? r.hubs.find((h) => h.slug === slug) ?? null : null, loading: false });
    });
    return () => { live = false; };
  }, [api, slug]);
  return state;
}

export function HubLayout() {
  const { hub: slug } = useParams();
  const { hub, loading } = useHub(slug);
  if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) return <NotFound />;
  if (loading) return <p className="muted">Loading…</p>;
  if (!hub) return <div className="stack"><h2>Hub not available</h2><p className="muted">Either it doesn't exist or you aren't a member. Public Hub pages arrive with the hub-by-slug read operation.</p><Link to="/me">Your Hubs</Link></div>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div><div className="eyebrow">Hub</div><h1>{hub.name}</h1></div>
      <nav className="row">
        <NavLink end to={`/${hub.slug}`}>Overview</NavLink>
        <NavLink to={`/${hub.slug}/campaigns`}>Campaigns</NavLink>
        <NavLink to={`/${hub.slug}/analytics`}>Analytics</NavLink>
      </nav>
      <Outlet context={hub} />
    </div>
  );
}

function Pending({ children }: { children: string }) {
  return <div className="card"><p className="muted">{children}</p></div>;
}

export const HubHome = () => <Pending>Hub workspace. Members, roles and invites arrive with the member and invite read operations.</Pending>;
export const Campaigns = () => <Pending>Campaign list is waiting on the "campaigns per hub" read operation.</Pending>;
export const CampaignDetail = () => {
  const { id } = useParams();
  return <Pending>{`Campaign ${id}: Survey Studio is waiting on the respondent-safe campaign read operation.`}</Pending>;
};
export const Analytics = () => <Pending>Results appear here. Suppressed cells will be shown as withheld, never as zero.</Pending>;
