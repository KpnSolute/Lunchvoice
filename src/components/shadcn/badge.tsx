import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Pills use the label role (Space Mono, uppercase). Phase tones follow the Campaign lifecycle.
const badgeVariants = cva(
  "tactile-label inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 whitespace-nowrap " +
    "text-[10.5px] [&>svg]:pointer-events-none [&>svg]:size-3",
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
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
