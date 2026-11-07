import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Cards: the card surface (24px radius). `ink` is the featured dark card, `well` an inset area, `dashed` an invitation.
const cardVariants = cva("flex min-w-0 flex-col gap-4 rounded-[var(--lv-radius-card)] p-6 text-[15px] leading-[1.5]", {
  variants: {
    variant: {
      card: "surface-card",
      ink: "surface-ink",
      well: "surface-well",
      accent: "surface-cta",
      dashed: "border-[1.5px] border-dashed border-[var(--lv-line)] bg-transparent",
    },
    size: { md: "", sm: "gap-3 p-4" },
  },
  defaultVariants: { variant: "card", size: "md" },
})

function Card({ className, variant, size, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" data-variant={variant ?? "card"} className={cn(cardVariants({ variant, size }), className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("grid auto-rows-min items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-[18px] leading-[1.3] font-semibold tracking-[-0.01em]", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-[14px] leading-[1.5] opacity-75", className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, cardVariants }
