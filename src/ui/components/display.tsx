import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Button, IconButton } from "./controls";
import { useCountUp, useJelly } from "../motion";
import { HUB_COLORS } from "../tokens";
import { describeError } from "../../lib/errors";
import type { LvError } from "../../lib/lvApi";

/* ------------------------------------------------------------------ containers */

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
} & { [key: string]: unknown }) {
  return (
    <Tag className={`s-card card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Panel({ children, className = "", eyebrow }: { children: ReactNode; className?: string; eyebrow?: string }) {
  return (
    <div className={`s-ink panel ${className}`}>
      {eyebrow && <p className="t-label" style={{ opacity: 0.75, marginBottom: 12 }}>{eyebrow}</p>}
      {children}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "var(--lv-space-5)" }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        {eyebrow && <p className="t-label muted">{eyebrow}</p>}
        <h2 className="t-display-md">{title}</h2>
        {sub && <p className="t-body muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  sub,
  action,
  back,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="page-head">
      {back && (
        <ButtonLinkInline to={back.to} label={back.label} />
      )}
      <div className="row-between" style={{ alignItems: "flex-end" }}>
        <div className="stack stack-sm" style={{ maxWidth: "62ch" }}>
          {eyebrow && <p className="t-label muted">{eyebrow}</p>}
          <h1 className="t-display-md">{title}</h1>
          {sub && <p className="t-body muted">{sub}</p>}
        </div>
        {action && <div className="row">{action}</div>}
      </div>
    </header>
  );
}

function ButtonLinkInline({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="t-small subtle" style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
      <Icon name="chevron-left" size={14} />
      {label}
    </Link>
  );
}

/* ------------------------------------------------------------------ marks */

export function Pill({
  children,
  tone = "quiet",
  icon,
}: {
  children: ReactNode;
  tone?: "quiet" | "accent" | "ok" | "warn" | "danger";
  icon?: IconName;
}) {
  return (
    <span className={`pill ${tone === "quiet" ? "" : `pill-${tone}`}`}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/** Deterministic Hub mark: initials on a stable accent, no image assets needed.
 *  Each fill has one legible text colour (>= 4.5:1), so initials never wash out. */
export function HubMark({ name, slug, size = 40 }: { name: string; slug?: string; size?: number }) {
  const key = slug ?? name;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  const { value: bg, on } = HUB_COLORS[h % HUB_COLORS.length];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: Math.round(size * 0.28),
        background: bg,
        color: on,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--lv-font-display)",
        fontWeight: 800,
        fontSize: Math.round(size * 0.4),
        letterSpacing: "-0.02em",
        boxShadow: "var(--lv-raised-shadow)",
      }}
    >
      {initials || "•"}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--lv-well)",
        boxShadow: "var(--lv-well-shadow)",
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
      }}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ metrics */

export function Metric({
  label,
  value,
  hint,
  raw,
  tone,
}: {
  label: string;
  value: number | string | null;
  hint?: ReactNode;
  raw?: boolean;
  tone?: "default" | "muted";
}) {
  const numeric = typeof value === "number";
  const counted = useCountUp(numeric ? (value as number) : 0);
  const shown = value === null ? "Withheld" : numeric && !raw ? counted : value;
  return (
    <div className="stack stack-sm">
      <p className="t-label muted">{label}</p>
      <p
        className="t-display-md"
        style={{ fontSize: 34, color: tone === "muted" ? "var(--lv-muted)" : undefined, fontVariantNumeric: "tabular-nums" }}
      >
        {shown}
      </p>
      {value === null && <span className="t-small subtle">Too few responses to report</span>}
      {hint && <span className="t-small subtle">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function Empty({
  icon = "sparkle",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="s-well" style={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 16 }}>
        <Icon name={icon} size={22} />
      </span>
      <p className="t-title">{title}</p>
      {children && <p className="t-small muted" style={{ maxWidth: "52ch" }}>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 14 }: { rows?: number; height?: number }) {
  return (
    <div className="stack stack-sm" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function Loading({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="stack stack-sm">
      <span className="sr-only">{label}</span>
      <Skeleton rows={rows} />
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "ok" | "warn" | "error";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon: IconName = tone === "ok" ? "check" : tone === "error" ? "alert" : tone === "warn" ? "alert" : "info";
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : undefined}>
      <Icon name={icon} size={18} />
      <div className="stack stack-sm grow">
        {title && <strong className="t-ui">{title}</strong>}
        {children && <div className="t-small">{children}</div>}
        {action}
      </div>
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: LvError | string | null; onRetry?: () => void }) {
  if (!error) return null;
  const text = typeof error === "string" ? error : describeError(error);
  return (
    <Notice tone="error" title={text} action={onRetry ? <Button size="sm" variant="quiet" icon="refresh" onClick={onRetry}>Try again</Button> : undefined}>
      {typeof error !== "string" && error.code === "lv_server_error" && <span className="mono">{error.message}</span>}
    </Notice>
  );
}

/** Fail-closed notice: the endpoint is named, nothing pretends to save. */
export function PendingNote({ fn, what }: { fn: string; what: string }) {
  return (
    <Notice tone="warn" title={`${what} isn't available yet`}>
      Waiting on <code className="mono">{fn}</code>. This screen is built; the endpoint is not, so nothing here saves.
    </Notice>
  );
}

/* ------------------------------------------------------------------ toasts */

interface ToastItem {
  id: number;
  text: string;
  tone: "info" | "ok" | "error";
}
const ToastCtx = createContext<{ push: (text: string, tone?: ToastItem["tone"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: ToastItem["tone"] = "info") => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, text, tone }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="toast" role="status">
            <Icon name={t.tone === "ok" ? "check" : t.tone === "error" ? "alert" : "info"} size={16} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v.push;
}

/* ------------------------------------------------------------------ progress */

export function Progress({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function QuotaMeter({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  return (
    <div className="stack stack-sm">
      <div className="row-between">
        <span className="t-label muted">{label}</span>
        <span className="t-small mono" style={{ fontWeight: 700 }}>
          {used}
          {limit === null ? " / not set" : ` / ${limit}`}
        </span>
      </div>
      <Progress value={used} max={limit ?? Math.max(used, 1)} label={label} />
      {limit !== null && used >= limit && <span className="t-small" style={{ color: "var(--lv-muted)" }}>At this plan's limit. Expired or over-limit plans never delete data.</span>}
    </div>
  );
}

export function GateMeter({
  participating,
  eligible,
  threshold,
}: {
  participating: number;
  eligible: number;
  threshold: number;
}) {
  const pct = eligible ? Math.round((participating / eligible) * 100) : 0;
  const met = pct >= threshold;
  const jelly = useJelly(met);
  return (
    <div className="stack stack-sm">
      <div className="row-between">
        <span className="t-label muted">Participation</span>
        <span className="t-small mono" style={{ fontWeight: 700 }}>
          {pct}% of {threshold}% needed
        </span>
      </div>
      <div className={`meter ${jelly.className}`} data-tone={met ? "ok" : "default"} onAnimationEnd={jelly.onAnimationEnd}>
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="t-small subtle">
        {participating} of {eligible} unique eligible members
        {met ? " — threshold met" : ` — ${Math.max(0, Math.ceil((threshold / 100) * eligible) - participating)} more needed`}
      </span>
    </div>
  );
}

export function Lifecycle({
  steps,
  current,
}: {
  steps: string[];
  current: string;
}) {
  const index = Math.max(0, steps.indexOf(current));
  return (
    <ol className="row" style={{ gap: 6, listStyle: "none" }} aria-label={`Lifecycle: ${steps.join(" → ")}`}>
      {steps.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className={active ? "pill pill-accent" : done ? "pill" : "pill pill-quiet"}
              aria-current={active ? "step" : undefined}
            >
              {done && <Icon name="check" size={11} strokeWidth={2.6} />}
              {s}
            </span>
            {i < steps.length - 1 && <Icon name="chevron-right" size={12} className="subtle" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ table */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="table-wrap s-card" style={{ borderRadius: "var(--lv-radius-card)" }}>
      <table className="table table-stack">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: c.align ?? "left" }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} style={{ textAlign: c.align ?? "left" }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ copy */

export function CopyField({ value, label, onCopied }: { value: string; label: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span className="t-label">{label}</span>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <div className="input-affix grow">
          <code className="mono" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value}
          </code>
        </div>
        <IconButton
          icon={copied ? "check" : "copy"}
          label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
              onCopied?.();
            } catch {
              setCopied(false);
            }
          }}
        />
      </div>
    </div>
  );
}

export function CodeDisplay({ code }: { code: string }) {
  return (
    <div className="code-cells" aria-label={`Join code ${code.split("").join(" ")}`} role="text">
      {code.split("").map((c, i) => (
        <span key={i} className="code-cell s-raised" style={{ display: "grid", placeItems: "center", fontSize: 24 }} aria-hidden="true">
          {c}
        </span>
      ))}
    </div>
  );
}
