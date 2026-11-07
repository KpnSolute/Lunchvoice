"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as SheetPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { Button } from "@/components/shadcn/button"
import { scrimClass } from "./tactile"

// Sheets. On phones the bottom sheet is the default: popover surface, grip, safe-area padding, no blur.
function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}
function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}
function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}
function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}
function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return <SheetPrimitive.Overlay data-slot="sheet-overlay" className={cn(scrimClass, className)} {...props} />
}

const SIDE = {
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[var(--lv-radius-hero)] pb-[max(16px,env(safe-area-inset-bottom))] " +
    "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  top: "inset-x-0 top-0 rounded-b-[var(--lv-radius-hero)] data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
  right: "inset-y-0 right-0 h-full w-[min(420px,90vw)] rounded-l-[var(--lv-radius-hero)] data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-[min(420px,90vw)] rounded-r-[var(--lv-radius-hero)] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
} as const

function SheetContent({
  className,
  children,
  side = "bottom",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: keyof typeof SIDE; showCloseButton?: boolean }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "surface-pop fixed z-50 flex flex-col gap-3 overflow-y-auto p-5 text-[15px] outline-none " +
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-[var(--lv-dur-popover)] data-[state=closed]:duration-200",
          SIDE[side],
          className
        )}
        {...props}
      >
        {side === "bottom" && <span aria-hidden="true" className="mx-auto -mt-1 mb-1 h-1.5 w-11 shrink-0 rounded-full bg-[var(--lv-line)]" />}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="quiet" size="icon-sm" className="absolute top-3 right-3" aria-label="Close">
              <XIcon />
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 pr-8", className)} {...props} />
}
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2", className)} {...props} />
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("m-0 text-[18px] leading-[1.3] font-semibold", className)} {...props} />
}
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("m-0 text-[14px] text-[var(--lv-muted)]", className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
