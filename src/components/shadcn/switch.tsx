import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

// Well track; raised knob that stretch-slides on the spring. The checked track is the accent.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch tactile-focus surface-well relative inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full " +
          "transition-[background] duration-[var(--lv-dur-toggle)] data-[state=checked]:bg-[var(--lv-accent)] " +
          "disabled:cursor-not-allowed disabled:opacity-55",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={
          "surface-raised pointer-events-none absolute top-1 left-1 block h-6 w-6 rounded-full " +
          "transition-[transform,width] duration-[var(--lv-dur-toggle)] ease-[var(--lv-ease-spring)] " +
          "group-active/switch:w-[30px] data-[state=checked]:translate-x-5 group-active/switch:data-[state=checked]:translate-x-[14px]"
        }
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
