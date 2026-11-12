// Loads the billing state once for the page chrome and everything inside it (header, homepage, /pricing, checkout
// buttons). See billingState.ts for the rules. Signed out it reads the public lv_plan_limits; signed in it also
// reads lv_billing_config for what is actually on sale.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "./useLv";
import type { BillingConfig, LvResult, PlanLimits } from "./lvApi";
import { billingReason, billingState, siteCtas, type BillingState, type SiteCtas } from "./billingState";

export interface Billing {
  state: BillingState;
  ctas: SiteCtas;
  /** lv_billing_config for a signed-in person; null signed out or while loading. */
  config: BillingConfig | null;
  /** The reason to show on a disabled purchase, even when billing is open but a product is not on sale. */
  closedReason: string;
  signedIn: boolean;
}

const Ctx = createContext<Billing | null>(null);
const SKIP = { ok: false as const, error: { code: "lv_unauthenticated" as const, message: "" } };

function useLoadBilling(enabled: boolean, key: string): Billing {
  const { api, session } = useIdentity();
  const signedIn = Boolean(session);
  const limits = useLv<PlanLimits>(() => (enabled ? api.planLimits() : Promise.resolve(SKIP as LvResult<PlanLimits>)), [api, enabled, key]);
  const cfg = useLv<BillingConfig>(() => (enabled && signedIn ? api.billingConfig() : Promise.resolve(SKIP as LvResult<BillingConfig>)), [api, enabled, signedIn, key]);
  const pub = limits.data?.billing;
  const config = signedIn ? cfg.data : null;
  return useMemo(() => {
    const state = billingState(pub, config?.checkout_available);
    return { state, ctas: siteCtas(state), config, closedReason: billingReason(pub), signedIn };
  }, [pub, config, signedIn]);
}

/** Wraps the app shell. Re-reads on navigation so a change made in the staff panel shows on the next page. */
export function BillingProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const value = useLoadBilling(true, pathname);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBilling(): Billing {
  const shared = useContext(Ctx);
  const own = useLoadBilling(shared === null, "");
  return shared ?? own;
}
