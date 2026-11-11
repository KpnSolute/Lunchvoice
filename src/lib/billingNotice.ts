import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "./useLv";
import { CHECKOUT_DISABLED_REASON } from "../config/pricing";
import type { PlanLimits } from "./lvApi";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/** What to tell someone who can't buy yet: the real launch date once staff have set one, else the generic line (000035). */
export function billingReason(b: PlanLimits["billing"] | undefined): string {
  if (b?.launch_at && !b.open) {
    return `Billing opens ${day(b.launch_at)}. Nothing can be bought until then. Founding seats keep Starter features free until ${b.founding_ends_at ? day(b.founding_ends_at) : "30 days after billing opens"}.`;
  }
  return CHECKOUT_DISABLED_REASON;
}

export function useBillingReason(): string {
  const { api } = useIdentity();
  const q = useLv(() => api.planLimits(), [api]);
  return billingReason(q.data?.billing);
}
