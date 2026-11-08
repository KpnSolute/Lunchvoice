// Track B: checkout pieces shared by /pricing (main bundle) and the lazy Commerce pages. Kept apart from
// src/pages/Commerce.tsx so /pricing does not pull the Hub workspace chunk. Checkout is enabled only when
// lv_billing_config says the product is on sale; the backend decides every amount.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { BillingConfig, LvError, PurchasableProduct } from "../lib/lvApi";
import { CHECKOUT_DISABLED_REASON, PLANS } from "../config/pricing";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { DisabledAction, Field, Notice } from "@/components/shadcn/blocks";

export const planOf = (product: PurchasableProduct) => PLANS.find((p) => p.product === product);

/* ------------------------------------------------------------------ billing config + checkout button */

/** lv_billing_config for a signed-in person; null while loading or signed out (checkout then stays off). */
export function useBillingConfig(): { config: BillingConfig | null; error: LvError | null } {
  const { api, session } = useIdentity();
  const state = useLv(() => (session ? api.billingConfig() : Promise.resolve({ ok: false as const, error: { code: "lv_unauthenticated" as const, message: "" } })), [api, session]);
  return { config: state.data, error: session ? state.error : null };
}

export function CheckoutButton({
  product,
  config,
  label,
  hub,
  weeks,
  slug,
  returnPath,
  variant = "primary",
  block,
}: {
  product: PurchasableProduct;
  config: BillingConfig | null;
  label: string;
  hub?: string | null;
  weeks?: number | null;
  slug?: string | null;
  returnPath: string;
  variant?: "primary" | "secondary" | "ink";
  block?: boolean;
}) {
  const { api, session } = useIdentity();
  const [busy, setBusy] = useState(false);
  if (!session) {
    return (
      <Button asChild variant={variant} block={block} data-testid={`checkout-${product}`}>
        <Link to="/signin" state={{ from: returnPath }}>Sign in to buy</Link>
      </Button>
    );
  }
  if (!config?.products[product]) {
    return <div data-testid={`checkout-${product}`} data-state="disabled"><DisabledAction block={block} variant={variant} reason={CHECKOUT_DISABLED_REASON}>{label}</DisabledAction></div>;
  }
  async function go() {
    setBusy(true);
    const r = await api.checkout({ product, hub, weeks, slug, returnPath });
    if (r.ok) {
      window.location.assign(r.url);
      return;
    }
    setBusy(false);
    toast.error(describeError(r.error));
  }
  return (
    <Button variant={variant} block={block} onClick={go} disabled={busy} data-testid={`checkout-${product}`} data-state="enabled">
      {busy ? "Opening checkout…" : label}
    </Button>
  );
}

/** Shown after Stripe sends the person back (`?checkout=success|cancelled`). The webhook grants, not the redirect. */
export function CheckoutReturnNotice() {
  const [params] = useSearchParams();
  const v = params.get("checkout");
  if (v === "success") {
    return <Notice tone="ok" title="Payment received">Thanks. Your purchase appears here as soon as Stripe confirms it, usually within a minute. Receipts and tax come from Stripe by email.</Notice>;
  }
  if (v === "cancelled") return <Notice tone="info" title="Checkout cancelled">Nothing was charged.</Notice>;
  return null;
}

export function WeeksField({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label="Weeks" htmlFor={id} help="At least 2 weeks. The price is calculated on our server; tax is added by Stripe.">
      <Input id={id} type="number" inputMode="numeric" min={2} max={104} value={value}
        onChange={(e) => onChange(Math.max(2, Math.min(104, Number(e.target.value) || 2)))} className="max-w-[8rem]" />
    </Field>
  );
}

/* ------------------------------------------------------------------ /pricing actions */

/** The buy action under a plan card on /pricing (no Hub yet: a Hub plan becomes a Hub credit for /create). */
export function PricingAction({ product, config, variant }: { product: PurchasableProduct; config: BillingConfig | null; variant: "primary" | "secondary" }) {
  const [weeks, setWeeks] = useState(2);
  const plan = planOf(product);
  const campaign = product === "campaign_starter" || product === "campaign_plus";
  return (
    <div className="lv-stack-16">
      {campaign && config?.products[product] && <WeeksField id={`weeks-${product}`} value={weeks} onChange={setWeeks} />}
      <CheckoutButton product={product} config={config} label={`Buy ${plan?.name ?? "plan"}`} weeks={campaign ? weeks : null}
        returnPath="/create" variant={variant} block />
    </div>
  );
}

