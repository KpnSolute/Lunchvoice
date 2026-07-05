import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { NotFoundOrg } from "../routes/marketing/NotFoundOrg";
import { tenantBrand } from "./tenantBrand";

type Org = { id: string; slug: string; name: string };

// After loading resolves, org is guaranteed non-null — not-found renders NotFoundOrg, not children.
type OrgCtxLoaded = { org: Org; loading: false; notFound: false };
type OrgCtxLoading = { org: null; loading: true; notFound: false };
type OrgCtxNotFound = { org: null; loading: false; notFound: true };
type OrgCtx = OrgCtxLoaded | OrgCtxLoading | OrgCtxNotFound;

const Ctx = createContext<OrgCtxLoaded | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams();
  const [state, setState] = useState<OrgCtx>({ org: null, loading: true, notFound: false });

  useEffect(() => {
    setState({ org: null, loading: true, notFound: false });
    supabase
      .from("orgs")
      .select("id, slug, name")
      .ilike("slug", orgSlug!)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setState({ org: data, loading: false, notFound: false });
        else setState({ org: null, loading: false, notFound: true });
      });
  }, [orgSlug]);

  // Tenant favicon + tab title while inside an org's space.
  useEffect(() => {
    const org = state.org;
    if (!org) return;
    document.title = `${org.name} · Lunch Voice`;
    const brand = tenantBrand(org.slug);
    if (!brand) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevHref = link?.href;
    if (link) {
      link.type = "image/svg+xml";
      link.href = brand.favicon;
    }
    return () => {
      document.title = "Lunch Voice";
      if (link && prevHref) {
        link.type = "";
        link.href = prevHref;
      }
    };
  }, [state.org]);

  if (state.loading) return <div className="wrap center muted" style={{ paddingTop: 60 }}>Loading...</div>;
  if (state.notFound) return <NotFoundOrg slug={orgSlug} />;
  // state.org is guaranteed to be Org here
  return <Ctx.Provider value={state as OrgCtxLoaded}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg must be used within OrgProvider");
  return c;
}
