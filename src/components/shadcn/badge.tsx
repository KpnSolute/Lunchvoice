import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Badges (design system 3): small rounded tags in the UI font, sentence case as written. Phase tones follow the
// Campaign lifecycle.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--lv-radius-tag)] px-2 whitespace-nowrap " +
    "font-[family-name:var(--lv-font-ui)] text-[12px] leading-none font-semibold [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--lv-well)] text-[var(--lv-muted)]",
        accent: "surface-pressed",
        ok: "bg-[color-mix(in_srgb,var(--lv-success)_16%,transparent)] text-[var(--lv-success-ink)]",
        danger: "surface-danger",
        ink: "surface-ink",
        outline: "border border-[var(--lv-line)] text-[var(--lv-muted)]",
        /* Campaign phases */
        draft: "bg-[var(--lv-well)] text-[var(--lv-muted)]",
        scheduled: "border border-dashed border-[var(--lv-control-off)] text-[var(--lv-text)]",
        open: "surface-pressed",
        paused: "bg-[var(--lv-well)] text-[var(--lv-text)]",
        ended: "surface-ink",
        closed: "surface-ink",
        archived: "border border-[var(--lv-line)] text-[var(--lv-subtle)]",
        /* shadcn names */
        default: "surface-ink",
        secondary: "bg-[var(--lv-well)] text-[var(--lv-muted)]",
        destructive: "surface-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  // Many callers pass raw values ("public", "invite_only"); show them as words with a capital first letter.
  const text = typeof children === "string" ? children.replace(/_/g, " ").replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : children
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props}>{text}</Comp>
}

export { Badge, badgeVariants }
