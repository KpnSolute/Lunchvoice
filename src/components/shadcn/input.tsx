import * as React from "react"
import { cn } from "cn"
import { fieldClass } from "./tactile"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClass, "h-12", className)} {...props} />
}

export { Input }
