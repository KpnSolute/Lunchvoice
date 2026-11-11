// Kept for its callers (Hub billing, checkout buttons): the reason a purchase is not possible yet.
// The state itself lives in billingState.ts and is loaded once by useBilling.tsx.
import { useBilling } from "./useBilling";

export { billingReason } from "./billingState";

export function useBillingReason(): string {
  const b = useBilling();
  return b.ctas.reason || b.closedReason;
}
