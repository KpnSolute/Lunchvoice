"use client"

import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

// Segmented tabs: a well track, the selected tab is the raised thumb. Scrolls sideways on narrow screens.
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "surface-well inline-flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-full p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "tactile-press tactile-focus inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 " +
          "text-[14px] font-medium whitespace-nowrap text-[var(--lv-muted)] hover:text-[var(--lv-text)] disabled:opacity-50 " +
          "data-[state=active]:surface-raised data-[state=active]:font-semibold [&_svg]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
