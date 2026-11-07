import * as React from "react"
import { cn } from "cn"
import { Label as LabelPrimitive } from "radix-ui"

// Field labels use the label role: Space Mono, 11.5px, uppercase, tracked.
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "tactile-label flex items-center gap-2 text-[var(--lv-muted)] select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
        className
      )}
      {...props}
    />
  )
}

export { Label }
