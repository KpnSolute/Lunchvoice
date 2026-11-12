// Composite blocks built from the shadcn layer. Pages compose these; they never write Tailwind themselves
// (Tailwind only scans src/components/shadcn). Every block follows the tactile system and the --lv-* tokens.
import * as React from "react"
import { NavLink } from "react-router-dom"
import { cn } from "cn"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { CheckIcon, CopyIcon, LockIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../alert"
import { Badge } from "../badge"
import { Button } from "../button"
import { Card } from "../card"
import { Input } from "../input"
import { Label } from "../label"
import { Progress } from "../progress"
import { Skeleton } from "../skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../alert-dialog"

/* ------------------------------------------------------------------ type roles */

/** Eyebrow / label role. */
export function Eyebrow({ children, accent = false, className }: { children: React.ReactNode; accent?: boolean; className?: string }) {
  return (
    <span className={cn("tactile-label inline-flex items-center gap-2", accent ? "text-[var(--lv-accent-text)]" : "text-[var(--lv-subtle)]", className)}>
      {accent && <span aria-hidden="true" className="size-2 rounded-full bg-[var(--lv-accent)]" />}
      {children}
    </span>
  )
}

/** App page title block: eyebrow, display-md title, body sub-line, actions. */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header data-slot="page-header" className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 max-w-[62ch] flex-col gap-2">
        {eyebrow && <Eyebrow accent>{eyebrow}</Eyebrow>}
        <h1 className="m-0 font-[family-name:var(--lv-font-display)] text-[clamp(28px,4vw,40px)] leading-[1] font-extrabold tracking-[-0.035em] text-balance">
          {title}
        </h1>
        {sub && <p className="m-0 text-[16px] leading-[1.55] text-pretty text-[var(--lv-muted)]">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Section heading inside a page or card (title role). */
export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <h2 className="m-0 text-[18px] leading-[1.3] font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ fields */

/** Label + control + help/error/counter. Pass the control's id as `htmlFor`. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  counter,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor?: string
  help?: React.ReactNode
  error?: React.ReactNode
  counter?: { value: number; max: number }
  children: React.ReactNode
  className?: string
}) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {counter && (
          <span className={cn("font-[family-name:var(--lv-font-mono)] text-[12px]", counter.value > counter.max ? "text-[var(--lv-danger)]" : "text-[var(--lv-subtle)]")}>
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children}
      {(error || help) && (
        <p id={helpId} className={cn("m-0 text-[13px] leading-[1.45]", error ? "text-[var(--lv-danger-ink)]" : "text-[var(--lv-muted)]")}>
          {error || help}
        </p>
      )}
    </div>
  )
}

/** A label + switch/checkbox row with a description. */
export function ToggleRow({
  title,
  description,
  control,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  control: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {description && <span className="text-[13px] leading-[1.45] text-[var(--lv-muted)]">{description}</span>}
      </div>
      {control}
    </div>
  )
}

/** Segmented control (radiogroup): well track, pressed-amber selection, roving tabindex with arrow keys. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  disabled,
}: {
  value: T
  onValueChange: (v: T) => void
  options: { value: T; label: React.ReactNode; disabled?: boolean }[]
  label: string
  className?: string
  disabled?: boolean
}) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented"
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      className={cn("surface-well inline-flex max-w-full flex-nowrap gap-1.5 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={
            "tactile-press tactile-focus shrink-0 min-h-[40px] cursor-pointer rounded-full bg-transparent px-4 text-[14px] font-medium text-[var(--lv-muted)] " +
            "hover:text-[var(--lv-text)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:surface-raised data-[state=checked]:text-[var(--lv-text)] data-[state=checked]:font-semibold"
          }
        >
          {o.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

/* ------------------------------------------------------------------ feedback */

export type NoticeTone = "info" | "ok" | "warn" | "error"

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: NoticeTone
  title?: React.ReactNode
  children?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <Alert variant={tone} className={className}>
      {icon}
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
    </Alert>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div data-slot="empty" className={cn("flex flex-col items-center gap-3 px-4 py-10 text-center", className)}>
      {icon && <span className="surface-well grid size-14 place-items-center rounded-full text-[var(--lv-muted)] [&_svg]:size-6">{icon}</span>}
      <h3 className="m-0 text-[18px] leading-[1.3] font-semibold">{title}</h3>
      {children && <p className="m-0 max-w-[46ch] text-[14.5px] leading-[1.5] text-pretty text-[var(--lv-muted)]">{children}</p>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function LoadingRows({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11" style={{ width: i === rows - 1 && rows > 1 ? "55%" : "100%" }} />
      ))}
    </div>
  )
}

/** A disabled action that says why. Use for checkout, export and any fail-closed premium action. */
export function DisabledAction({
  children,
  reason,
  variant = "primary",
  block,
}: {
  children: React.ReactNode
  reason: React.ReactNode
  variant?: React.ComponentProps<typeof Button>["variant"]
  block?: boolean
}) {
  const id = React.useId()
  return (
    <div className={cn("flex flex-col items-start gap-2", block && "w-full items-stretch")}>
      <Button variant={variant} disabled aria-describedby={id} block={block}>
        <LockIcon />
        {children}
      </Button>
      <p id={id} className="m-0 text-[13px] leading-[1.45] text-[var(--lv-muted)]">
        {reason}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ data */

/** One headline number. `value` null renders the withheld state, never zero. */
export function Metric({
  value,
  label,
  hint,
  tone = "plain",
  className,
}: {
  value: React.ReactNode | null
  label: React.ReactNode
  hint?: React.ReactNode
  tone?: "plain" | "ink" | "accent" | "raised"
  className?: string
}) {
  const surface = tone === "ink" ? "surface-ink p-5" : tone === "accent" ? "surface-cta p-5" : tone === "raised" ? "surface-card p-5" : ""
  return (
    <div data-slot="metric" className={cn("flex min-w-0 flex-col gap-1.5 rounded-[var(--lv-radius-card)]", surface, className)}>
      <span className="tactile-label opacity-80">{label}</span>
      <span className="font-[family-name:var(--lv-font-display)] text-[clamp(30px,4vw,44px)] leading-[1] font-extrabold tracking-[-0.04em] [font-variant-numeric:tabular-nums]">
        {value === null ? <span className="text-[0.62em] tracking-[-0.02em]">Withheld</span> : value}
      </span>
      {hint && <span className="text-[13px] leading-[1.45] opacity-80">{hint}</span>}
    </div>
  )
}

/** Plan usage against a limit from the entitlement map. limit null = not set by the backend (never invented). */
export function QuotaMeter({ label, used, limit, hint }: { label: React.ReactNode; used: number; limit: number | null; hint?: React.ReactNode }) {
  const pct = limit && limit > 0 ? Math.round((used / limit) * 100) : 0
  const full = limit !== null && used >= limit
  return (
    <div data-slot="quota" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] font-medium">{label}</span>
        <span className="font-[family-name:var(--lv-font-mono)] text-[13px] font-bold [font-variant-numeric:tabular-nums]">
          {limit === null ? `${used} · limit not set` : `${used} / ${limit}`}
        </span>
      </div>
      {limit !== null ? (
        <Progress value={pct} tone={full ? "full" : "accent"} aria-label={`${label}: ${used} of ${limit}`} />
      ) : (
        <div className="surface-well h-2.5 rounded-full bg-[repeating-linear-gradient(45deg,transparent_0_6px,var(--lv-line)_6px_12px)]" aria-hidden="true" />
      )}
      {(hint || full) && <span className="text-[13px] text-[var(--lv-muted)]">{full ? "Limit reached." : null} {hint}</span>}
    </div>
  )
}

/**
 * A dashboard stat tile. Value, label and note sit on one rhythm in every tile so a row lines up. Values never wrap
 * per character: numbers use the display size, words (a plan name) use a smaller display size and stay on one line.
 * `edge` is the light accent treatment: a raised card with an amber edge instead of a full orange surface.
 */
export function StatTile({
  label,
  value,
  note,
  tone = "raised",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  note?: React.ReactNode
  tone?: "ink" | "accent" | "raised" | "edge"
  className?: string
}) {
  const wordy = typeof value === "string" && !/^[\d\s/.,%–-]+$/.test(value)
  return (
    <Card
      data-slot="stat-tile"
      variant={tone === "ink" ? "ink" : tone === "accent" ? "accent" : "card"}
      className={cn(
        "grid min-h-[136px] min-w-0 grid-rows-[auto_1fr_auto] content-start gap-2 p-5",
        tone === "edge" && "shadow-[inset_4px_0_0_var(--lv-accent),var(--lv-card-shadow)]",
        className
      )}
    >
      <span className="tactile-label truncate opacity-80">{label}</span>
      <span
        data-slot="stat-value"
        className={cn(
          "self-center font-[family-name:var(--lv-font-display)] leading-[1.05] font-extrabold whitespace-nowrap [font-variant-numeric:tabular-nums]",
          wordy ? "text-[clamp(22px,2.4vw,28px)] tracking-[-0.03em]" : "text-[clamp(32px,3.4vw,44px)] tracking-[-0.04em]"
        )}
      >
        {value}
      </span>
      {note && <span className="text-[13.5px] leading-[1.4] opacity-80">{note}</span>}
    </Card>
  )
}

/** Copyable value (links, codes) in a well, with a raised Copy button. */
export function CopyField({ value, label, id }: { value: string; label?: string; id?: string }) {
  const [copied, setCopied] = React.useState(false)
  const autoId = React.useId()
  const inputId = id ?? autoId
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="flex min-w-0 items-center gap-2">
        <Input id={inputId} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-[family-name:var(--lv-font-mono)] text-[13px]" />
        <Button size="md" variant="secondary" onClick={copy} aria-live="polite" data-popped={copied || undefined}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  )
}

export type Phase = "draft" | "scheduled" | "open" | "ended" | "paused" | "closed" | "archived"

export function PhaseBadge({ phase }: { phase: Phase }) {
  return <Badge variant={phase}>{phase}</Badge>
}

/** Hub tabs / account tabs as links: segmented well with the raised thumb, scrolls sideways, no scrollbar. */
export function NavTabs({ items, label = "Sections", className }: { items: { to: string; label: string; end?: boolean }[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("surface-well flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          data-slot="nav-tab"
          className={
            "tactile-press tactile-focus inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[14px] font-medium whitespace-nowrap " +
            "text-[var(--lv-muted)] no-underline hover:text-[var(--lv-text)] aria-[current=page]:surface-raised aria-[current=page]:font-semibold"
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Row list (Hubs, Campaigns, invites) with a raised hover. */
export function RowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("m-0 flex list-none flex-col gap-1 p-0", className)}>{children}</ul>
}

export function RowItem({
  leading,
  title,
  sub,
  trailing,
  asChild,
  className,
}: {
  leading?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  trailing?: React.ReactNode
  asChild?: React.ReactElement<{ className?: string; children?: React.ReactNode }>
  className?: string
}) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold">{title}</span>
        {sub && <span className="truncate text-[13px] text-[var(--lv-muted)]">{sub}</span>}
      </span>
      {trailing}
    </>
  )
  const cls = cn(
    "flex min-h-[56px] items-center gap-3 rounded-[var(--lv-radius-field)] px-3 py-2 text-inherit no-underline",
    asChild && "tactile-focus transition-[background] duration-200 hover:bg-[var(--lv-well)]",
    className
  )
  return <li>{asChild ? React.cloneElement(asChild, { className: cls, children: body, "data-slot": "row-item" } as never) : <div className={cls}>{body}</div>}</li>
}

/* ------------------------------------------------------------------ typed confirmation */

/**
 * Destructive action guarded by typing a phrase (a slug, or DELETE). The action button stays disabled until the
 * phrase matches; the backend checks it again (`lv_confirmation_mismatch`).
 */
export function TypedConfirm({
  trigger,
  title,
  description,
  phrase,
  actionLabel,
  onConfirm,
  busy,
  error,
}: {
  trigger: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  phrase: string
  actionLabel: string
  onConfirm: (typed: string) => Promise<boolean> | boolean
  busy?: boolean
  error?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const id = React.useId()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setTyped("")
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Field label={<>Type <code className="normal-case">{phrase}</code> to confirm</>} htmlFor={id}>
          <Input id={id} value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={typed !== phrase || busy}
            onClick={async (e) => {
              e.preventDefault()
              if (await onConfirm(typed)) setOpen(false)
            }}
          >
            {busy ? "Working…" : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
