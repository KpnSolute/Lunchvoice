import * as React from "react"
import { cn } from "cn"
import { LockIcon } from "lucide-react"
import { Button } from "../button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table"
import { ANON_MIN_ANSWERS } from "@/config/privacy"

export interface ResultCell {
  key: string
  label?: string
  n: number | null
  suppressed: boolean
}

/** Anonymous results publish only groups of at least this many answers. */
export const WITHHELD_EXPLAINER = `Withheld to protect anonymity. Anonymous results only show groups of at least ${ANON_MIN_ANSWERS} answers.`

/** The withheld state: striped, labelled, never a number and never zero (L-07). */
export function WithheldTag({ className }: { className?: string }) {
  return (
    <span
      title={WITHHELD_EXPLAINER}
      className={cn(
        "tactile-label inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] text-[var(--lv-text)] " +
          "bg-[repeating-linear-gradient(45deg,var(--lv-well)_0_5px,var(--lv-surface2)_5px_10px)] shadow-[inset_0_0_0_1px_var(--lv-line)]",
        className
      )}
    >
      <LockIcon className="size-3" /> Withheld
    </span>
  )
}

/**
 * Horizontal distribution bars. Released cells show their count; the merged withheld bucket renders as a striped bar
 * labelled "Withheld" with no number. A table view of the same data is one click away.
 */
export function ResultBars({ cells, caption }: { cells: ResultCell[]; caption: string }) {
  const [table, setTable] = React.useState(false)
  const shown = cells.filter((c) => !c.suppressed && c.n !== null)
  const withheld = cells.filter((c) => c.suppressed || c.n === null)
  const top = Math.max(1, ...shown.map((c) => c.n ?? 0))
  const total = shown.reduce((s, c) => s + (c.n ?? 0), 0)

  return (
    <div data-slot="result-bars" className="flex flex-col gap-3">
      {table ? (
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Answer</TableHead>
              <TableHead className="text-right">Responses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cells.map((c) => (
              <TableRow key={c.key}>
                <TableCell>{c.suppressed ? "Other answers" : (c.label ?? c.key)}</TableCell>
                <TableCell className="text-right font-[family-name:var(--lv-font-mono)]">{c.suppressed || c.n === null ? <WithheldTag /> : c.n}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label={caption}>
          {shown.map((c, i) => {
            const pct = total ? Math.round(((c.n ?? 0) / total) * 100) : 0
            return (
              <li key={c.key} className="grid grid-cols-[minmax(84px,1.1fr)_2fr_auto] items-center gap-3 text-[14.5px]">
                <span className="truncate font-medium">{c.label ?? c.key}</span>
                <span className="surface-well block h-3 overflow-hidden rounded-full">
                  <b className="lv-bar-grow block h-full rounded-full bg-[var(--lv-accent)] transition-[width] duration-[var(--lv-dur-toggle)]" style={{ width: `${Math.max(3, ((c.n ?? 0) / top) * 100)}%`, "--i": i } as React.CSSProperties} />
                </span>
                <span className="min-w-[64px] text-right font-[family-name:var(--lv-font-mono)] text-[13px] font-bold [font-variant-numeric:tabular-nums]">
                  {/* No share when part of the total is withheld: a percentage of the released part would mislead. */}
                  {c.n} {withheld.length === 0 && <span className="font-normal text-[var(--lv-muted)]">{pct}%</span>}
                </span>
              </li>
            )
          })}
          {withheld.length > 0 && (
            <li className="grid grid-cols-[minmax(84px,1.1fr)_2fr_auto] items-center gap-3 text-[14.5px]">
              <span className="truncate text-[var(--lv-muted)]">Other answers</span>
              <span className="block h-3 rounded-full bg-[repeating-linear-gradient(45deg,var(--lv-well)_0_6px,var(--lv-line)_6px_12px)]" aria-hidden="true" />
              <WithheldTag />
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-[var(--lv-muted)]">{withheld.length > 0 ? WITHHELD_EXPLAINER : " "}</span>
        <Button variant="quiet" size="sm" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? "Show chart" : "Show as table"}
        </Button>
      </div>
    </div>
  )
}

/** Free-text answers (L-10): an unordered list with no names or times, or the withheld state. */
export function TextAnswers({ texts }: { texts: string[] | null | undefined }) {
  if (!texts) {
    return (
      <div className="flex flex-col items-start gap-2">
        <WithheldTag />
        <p className="m-0 text-[14px] text-[var(--lv-muted)]">Text answers appear once at least {ANON_MIN_ANSWERS} people have answered, so nobody can be picked out.</p>
      </div>
    )
  }
  if (texts.length === 0) return <p className="m-0 text-[14px] text-[var(--lv-muted)]">No text answers.</p>
  return (
    <ul className="m-0 flex max-h-72 list-none flex-col gap-2 overflow-y-auto p-0" aria-label="Text answers, in random order">
      {texts.map((t, i) => (
        <li key={i} className="surface-well rounded-[12px] px-3.5 py-2.5 text-[14.5px] leading-[1.5]">{t}</li>
      ))}
    </ul>
  )
}
