import * as React from "react"
import { cn } from "cn"
import { fieldClass } from "./tactile"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClass, "min-h-24 resize-y py-3 leading-[1.5]", className)}
      {...props}
    />
  )
}

export { Textarea }
