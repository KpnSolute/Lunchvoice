"use client"

import * as React from "react"
import { cn } from "cn"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { choiceOn } from "./tactile"

// Radix gives the group roving tabindex with arrow keys (WAI-ARIA radiogroup).
function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid w-full gap-3", className)} {...props} />
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "peer tactile-press tactile-focus surface-well relative grid size-6 shrink-0 cursor-pointer place-content-center rounded-full " +
          "after:absolute after:-inset-2 disabled:cursor-not-allowed disabled:opacity-55",
        choiceOn,
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className="grid place-content-center">
        <span className="size-2.5 rounded-full bg-[var(--lv-on-accent)]" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

/** A whole raised card as one radio option. Selected = pressed amber. Use inside RadioGroup. */
function RadioCard({
  className,
  title,
  description,
  badge,
  ...props
}: Omit<React.ComponentProps<typeof RadioGroupPrimitive.Item>, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        "tactile-press tactile-focus surface-raised flex min-h-[44px] w-full cursor-pointer flex-col items-start gap-1 " +
          "rounded-[var(--lv-radius-field)] px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-55 " +
          "data-[state=checked]:surface-pressed",
        className
      )}
      {...props}
    >
      <span className="flex w-full items-center justify-between gap-2 text-[15px] font-semibold">
        <span className="flex items-center gap-2">
          {/* Not colour alone: the selected card also shows a check. */}
          <RadioGroupPrimitive.Indicator className="grid size-5 place-content-center rounded-full bg-[var(--lv-on-accent)] text-[var(--lv-accent-light)] text-[12px] leading-none font-bold" aria-hidden="true">✓</RadioGroupPrimitive.Indicator>
          {title}
        </span>
        {badge}
      </span>
      {description && <span className="text-[13px] leading-[1.45] opacity-80">{description}</span>}
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem, RadioCard }
