import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import type { LvError } from "../lib/lvApi";
import { describeError } from "../lib/errors";

/* ------------------------------------------------------------------ buttons */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ink" | "outline" | "quiet" | "danger";
  size?: "sm" | "lg";
  block?: boolean;
  icon?: IconName;
};

export function Btn({ variant = "outline", size, block, icon, className = "", children, ...rest }: BtnProps) {
  const cls = [
    "ui-btn",
    `ui-btn-${variant}`,
    size ? `ui-btn-${size}` : "",
    block ? "ui-btn-block" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
      {icon && <Icon name={icon} size={16} />}
    </button>
  );
}

/* ------------------------------------------------------------------ surfaces */

export function Card({ children, className = "", quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return <div className={`ui-card ${quiet ? "ui-card-quiet" : ""} ${className}`.trim()}>{children}</div>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ui-panel ${className}`.trim()}>{children}</div>;
}

export function Micro({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <span className={`ui-micro ${accent ? "ui-micro-accent" : ""}`.trim()}>{children}</span>;
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "ok" | "danger" | "ink";
}) {
  return <span className={`ui-pill ${tone === "muted" ? "" : `ui-pill-${tone}`}`.trim()}>{children}</span>;
}

/* ------------------------------------------------------------------ page head */

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="ui-head">
      {eyebrow && <Micro accent>{eyebrow}</Micro>}
      <h1 className="ui-display ui-display-lg">{title}</h1>
      {sub && <p>{sub}</p>}
      {actions && <div className="ui-row" style={{ marginTop: 6 }}>{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ feedback */

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "ok" | "warn" | "err";
  children: ReactNode;
}) {
  const role = tone === "err" ? "alert" : "status";
  return <div className={`ui-notice ui-notice-${tone}`} role={role}>{children}</div>;
}

export function ErrorNote({ error }: { error: LvError | null | undefined }) {
  if (!error) return null;
  return <Notice tone="err">{describeError(error)}</Notice>;
}

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
    <div className="ui-empty">
      <span className="ui-empty-icon"><Icon name={icon} size={22} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ui-skel ui-skel-row" style={{ width: i === rows - 1 ? "55%" : "100%" }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ data */

export function Metric({ value, label, hint }: { value: ReactNode; label: string; hint?: string }) {
  return (
    <div className="ui-stack ui-gap-4">
      <span className="ui-metric">{value}</span>
      <span className="ui-micro">{label}</span>
      {hint && <span className="ui-muted" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="ui-stack ui-gap-4">
      <div className="ui-meter" role="img" aria-label={label ?? `${value} of ${max}`}>
        <b style={{ width: `${pct}%` }} />
      </div>
      <span className="ui-micro">{value} of {max}{label ? ` · ${label}` : ""}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ tabs */

export function Tabs({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="ui-tabs" aria-label="Sections">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className="ui-tab">
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ copy */

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="ui-stack ui-gap-4">
      {label && <span className="ui-label">{label}</span>}
      <div className="ui-copy">
        <code>{value}</code>
        <Btn size="sm" variant="outline" onClick={copy} type="button">{copied ? "Copied" : "Copy"}</Btn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ui-dialog" onClose={onClose} onCancel={onClose}>
      <div className="ui-dialog-body">
        <h2>{title}</h2>
        {children}
      </div>
      <div className="ui-dialog-actions">{actions}</div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ phase */

export type Phase = "draft" | "scheduled" | "open" | "ended" | "paused" | "closed" | "archived";

export function campaignPhase(c: { status: string; opens_at: string | null; closes_at: string | null }, now = Date.now()): Phase {
  if (c.status === "draft") return "draft";
  if (c.status === "closed") return "closed";
  if (c.opens_at && new Date(c.opens_at).getTime() > now) return "scheduled";
  if (c.closes_at && new Date(c.closes_at).getTime() <= now) return "ended";
  return "open";
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  return <span className={`ui-pill ui-phase-${phase}`}>{phase}</span>;
}
