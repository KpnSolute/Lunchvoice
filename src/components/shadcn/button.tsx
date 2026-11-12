import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Buttons (design system 3). `primary` is the amber action and the only primary: one per view. `secondary` is a
// bordered surface, `ink` solid ink, `quiet` text-only, `danger` the tinted destructive action. Rounded rectangles;
// hover changes colour, never position; the springy press (tactile-press) is what keeps them lively.
const buttonVariants = cva(
  "tactile-press tactile-focus inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--lv-radius-control)] border-0 " +
    "font-semibold whitespace-nowrap no-underline select-none disabled:cursor-not-allowed disabled:opacity-100 " +
    "disabled:bg-[var(--lv-well)] disabled:text-[var(--lv-subtle)] disabled:shadow-none " +
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 " +
    "[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "surface-cta hover:not-disabled:bg-[var(--lv-accent-light)]",
        secondary: "surface-raised hover:not-disabled:bg-[var(--lv-surface2)]",
        ink: "surface-ink hover:not-disabled:opacity-90",
        quiet: "bg-transparent text-[var(--lv-muted)] hover:text-[var(--lv-text)] hover:bg-[var(--lv-surface2)]",
        danger: "surface-danger hover:not-disabled:bg-[color-mix(in_srgb,var(--lv-danger)_22%,transparent)]",
        /* shadcn's own names, kept so generated components keep working */
        default: "surface-ink",
        outline: "surface-raised hover:not-disabled:bg-[var(--lv-surface2)]",
        ghost: "bg-transparent text-[var(--lv-muted)] hover:text-[var(--lv-text)] hover:bg-[var(--lv-surface2)]",
        destructive: "surface-danger",
        link: "bg-transparent px-0 text-[var(--lv-text)] underline underline-offset-4",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-[14.5px]",
        lg: "h-[52px] px-6 text-[15.5px]",
        icon: "size-11 p-0",
        "icon-sm": "size-9 p-0",
        "icon-lg": "size-[58px] p-0 [&_svg:not([class*='size-'])]:size-5",
        default: "h-11 px-5 text-[14.5px]",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "secondary", size: "md", block: false },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

// forwardRef: React 18 does not pass `ref` as a prop, and Radix triggers (asChild) need the DOM node.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild = false, type, ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant ?? "secondary"}
      data-size={size ?? "md"}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, block, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
export type { ButtonProps }
