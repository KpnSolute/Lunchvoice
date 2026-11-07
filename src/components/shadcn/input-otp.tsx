import * as React from "react"
import { cn } from "cn"
import { OTPInput, OTPInputContext } from "input-otp"
import { MinusIcon } from "lucide-react"

// Join-code cells: six raised cells, code type (Space Mono 700, tracked). The active cell gets the ink ring.
function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn("flex items-center gap-2 has-disabled:opacity-55", containerClassName)}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-otp-group" className={cn("grid w-full grid-cols-[repeat(6,minmax(0,1fr))] gap-2", className)} {...props} />
}

function InputOTPSlot({ index, className, ...props }: React.ComponentProps<"div"> & { index: number }) {
  const ctx = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = ctx?.slots[index] ?? {}
  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "surface-raised relative flex aspect-[3/4] max-h-[72px] min-w-0 items-center justify-center rounded-[12px] font-[family-name:var(--lv-font-mono)] " +
          "text-[clamp(18px,3vw,26px)] font-bold uppercase transition-[outline-color] duration-150 outline-2 outline-transparent " +
          "data-[active=true]:outline-[var(--lv-focus)] data-[active=true]:outline-offset-2",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-0.5 animate-pulse bg-[var(--lv-text)]" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator(props: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" className="flex items-center [&_svg]:size-4" role="separator" {...props}>
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
