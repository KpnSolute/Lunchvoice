import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("surface-well animate-pulse rounded-[12px] motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
