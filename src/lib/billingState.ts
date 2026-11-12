// The one place that decides what the public site says and links to while billing is closed or open.
// The header, the homepage, /pricing and the checkout buttons all read this, so they cannot disagree.
// Pure (no React, no network): unit-tested in billingState.test.ts.
//
// Sources, both from lv_api: the public lv_plan_limits().billing (000035; readable signed out) and, for a signed-in
// person, lv_billing_config().checkout_available. Anything missing or unknown means closed (fail closed).
import { CHECKOUT_DISABLED_REASON } from "../config/pricing";

export interface PublicBilling { open: boolean; launch_at: string | null; founding_ends_at: string | null }

export interface BillingState {
  open: boolean;
  launchAt: string | null;
  foundingEndsAt: string | null;
}

export const BILLING_CLOSED: BillingState = { open: false, launchAt: null, foundingEndsAt: null };

export function billingState(pub: PublicBilling | null | undefined, checkoutAvailable?: boolean | null): BillingState {
  return {
    open: pub?.open === true || checkoutAvailable === true,
    launchAt: pub?.launch_at ?? null,
    foundingEndsAt: pub?.founding_ends_at ?? null,
  };
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/** What to tell someone who can't buy yet: the real launch date once staff have set one, else the generic line. */
export function billingReason(b: { open?: boolean; launch_at?: string | null; founding_ends_at?: string | null } | null | undefined): string {
  if (b?.launch_at && !b.open) {
    return `Billing opens ${day(b.launch_at)}. Nothing can be bought until then. Founding seats keep Starter features free until ${b.founding_ends_at ? day(b.founding_ends_at) : "30 days after billing opens"}.`;
  }
  return CHECKOUT_DISABLED_REASON;
}

export interface Cta { label: string; to: string }

/** What a paid plan's button does: join the waitlist, wait (disabled, with the reason), sign in, or buy. */
export type PlanAction = "waitlist" | "closed" | "signin" | "buy";

export interface SiteCtas {
  /** The primary action on the homepage in every state. */
  primary: Cta;
  /** The Hub action (homepage secondary, header, Starter card): the waitlist before billing, the purchase path after. */
  hub: Cta;
  /** Title and one sentence for the billing notice. */
  noticeTitle: string;
  /** The short billing sentence under the homepage plans. */
  sentence: string;
  /** Why a purchase button is disabled; empty when billing is open. */
  reason: string;
}

export const START_SURVEY: Cta = { label: "Start a free survey", to: "/surveys/new" };
export const JOIN_WAITLIST: Cta = { label: "Join the waitlist", to: "/waitlist" };
/** Where "Create your Hub" leads once plans are on sale: the Hub plans on /pricing (a bought plan becomes a Hub credit for /create). */
export const BUY_HUB: Cta = { label: "Create your Hub", to: "/pricing" };

export function siteCtas(s: BillingState): SiteCtas {
  if (s.open) {
    return {
      primary: START_SURVEY,
      hub: BUY_HUB,
      noticeTitle: "Checkout is open",
      sentence: "Payments run through Stripe, and tax is added at checkout.",
      reason: "",
    };
  }
  const reason = billingReason({ open: false, launch_at: s.launchAt, founding_ends_at: s.foundingEndsAt });
  return {
    primary: START_SURVEY,
    hub: JOIN_WAITLIST,
    noticeTitle: s.launchAt ? `Billing opens ${day(s.launchAt)}` : "Billing opens soon",
    sentence: s.launchAt
      ? `Checkout opens ${day(s.launchAt)}; nothing here charges money before then.`
      : "Checkout opens when billing launches; nothing here charges money.",
    reason,
  };
}

/**
 * The action under a paid plan. While billing is closed nothing says "buy": the Starter Hub (the Founding seat) points
 * at the waitlist and the others are disabled with the reason. Once open, signed-out people sign in first and signed-in
 * people buy what lv_billing_config says is on sale.
 */
export function planAction(s: BillingState, signedIn: boolean, product: string, onSale: boolean): PlanAction {
  if (!s.open) return product === "starter_hub" ? "waitlist" : "closed";
  if (!signedIn) return "signin";
  return onSale ? "buy" : "closed";
}

/** The pinned header button: hidden where it would repeat the page's own action. */
export function headerCta(s: BillingState, pathname: string): Cta | null {
  if (pathname === "/waitlist" || pathname === "/signin") return null;
  return siteCtas(s).hub;
}
