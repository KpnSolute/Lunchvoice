import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Notices: info / ok / warn / error. Errors announce assertively; everything else is a polite status.
const alertVariants = cva(
  "relative grid w-full gap-1 rounded-[var(--lv-radius-field)] px-4 py-3.5 text-left text-[14.5px] leading-[1.5] " +
    "has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:size-[18px]",
  {
    variants: {
      variant: {
        info: "surface-well",
        ok: "bg-[color-mix(in_srgb,var(--lv-success)_14%,transparent)] text-[var(--lv-success-ink)] border-[var(--lv-control-border)]",
        warn: "bg-[color-mix(in_srgb,var(--lv-accent)_18%,transparent)] text-[var(--lv-text)] shadow-[inset_3px_0_0_var(--lv-accent)]",
        error: "surface-danger shadow-[inset_3px_0_0_var(--lv-danger)]",
        default: "surface-well",
        destructive: "surface-danger",
      },
    },
    defaultVariants: { variant: "info" },
  }
)

function Alert({ className, variant, role, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const isError = variant === "error" || variant === "destructive"
  return (
    <div
      data-slot="alert"
      role={role ?? (isError ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-semibold group-has-[>svg]/alert:col-start-2", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-[14px] opacity-90 [&_p]:m-0", className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription }
