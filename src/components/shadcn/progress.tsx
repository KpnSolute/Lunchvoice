"use client"

import * as React from "react"
import { cn } from "cn"
import { Progress as ProgressPrimitive } from "radix-ui"

// Well track with an amber fill. `tone="full"` turns the fill ink when a quota is used up.
function Progress({
  className,
  value,
  tone = "accent",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { tone?: "accent" | "full" | "segmented" }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("surface-well relative flex h-2.5 w-full items-center overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 rounded-full transition-transform duration-[var(--lv-dur-toggle)] ease-[var(--lv-ease-out)]",
          tone === "full" ? "bg-[var(--lv-text)]" : "bg-[var(--lv-accent)]"
        )}
        style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value || 0))}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
