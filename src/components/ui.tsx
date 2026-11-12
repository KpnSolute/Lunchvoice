// Thin app-level wrappers over the shadcn layer (src/components/shadcn). Pages import from here or from the
// shadcn components directly; there is one component system and it is the shadcn one.
import type { ComponentProps, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import type { LvError } from "../lib/lvApi";
import { describeError } from "../lib/errors";
import { feedbackTypeLabel } from "../config/feedbackTypes";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Card as ShadCard } from "@/components/shadcn/card";
import {
  CopyField as CopyFieldBlock,
  EmptyState,
  Eyebrow,
  LoadingRows,
  Metric as MetricBlock,
  NavTabs,
  Notice as NoticeBlock,
  PageHeader,
  PhaseBadge as PhaseBadgeBlock,
  QuotaMeter,
  type Phase,
} from "@/components/shadcn/blocks";

export type { Phase };
export { Button };

type Variant = "primary" | "secondary" | "ink" | "quiet" | "danger";
type LegacyVariant = Variant | "outline";
const mapVariant = (v: LegacyVariant): Variant => (v === "outline" ? "secondary" : v);

/* ------------------------------------------------------------------ buttons */

type BtnProps = Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
  variant?: LegacyVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
};

export function Btn({ variant = "secondary", size = "md", icon, children, ...rest }: BtnProps) {
  return (
    <Button variant={mapVariant(variant)} size={size} {...rest}>
      {children}
      {icon && <Icon name={icon} size={16} />}
    </Button>
  );
}

/** A router link that looks like a button. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  icon,
  block,
  children,
  className,
  ...rest
}: LinkProps & { variant?: LegacyVariant; size?: "sm" | "md" | "lg"; icon?: IconName; block?: boolean }) {
  return (
    <Button asChild variant={mapVariant(variant)} size={size} block={block} className={className}>
      <Link {...rest}>
        {children}
        {icon && <Icon name={icon} size={16} />}
      </Link>
    </Button>
  );
}

/* ------------------------------------------------------------------ surfaces */

export function Card({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return <ShadCard variant={quiet ? "well" : "card"} className={className}>{children}</ShadCard>;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <ShadCard variant="ink" className={className}>{children}</ShadCard>;
}

export function Micro({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <Eyebrow accent={accent}>{children}</Eyebrow>;
}

export type PillTone = "muted" | "accent" | "ok" | "danger" | "ink";
export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: PillTone }) {
  return <Badge variant={tone === "muted" ? "neutral" : tone}>{children}</Badge>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: string; actions?: ReactNode }) {
  return <PageHeader eyebrow={eyebrow} title={title} sub={sub} actions={actions} />;
}

/* ------------------------------------------------------------------ feedback */

export function Notice({ tone = "info", title, children }: { tone?: "info" | "ok" | "warn" | "err"; title?: ReactNode; children?: ReactNode }) {
  return <NoticeBlock tone={tone === "err" ? "error" : tone} title={title}>{children}</NoticeBlock>;
}

export function ErrorNote({ error }: { error: Pick<LvError, "code" | "message"> | null | undefined }) {
  if (!error) return null;
  return <NoticeBlock tone="error">{describeError(error)}</NoticeBlock>;
}

export function Empty({ icon = "sparkle", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return <EmptyState icon={<Icon name={icon} size={24} />} title={title} action={action}>{children}</EmptyState>;
}

export function Loading({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return <LoadingRows rows={rows} label={label} />;
}

/* ------------------------------------------------------------------ data */

export function Metric({ value, label, hint }: { value: ReactNode | null; label: string; hint?: string }) {
  return <MetricBlock value={value} label={label} hint={hint} />;
}

export function Meter({ value, max, label }: { value: number; max: number | null; label: string }) {
  return <QuotaMeter used={value} limit={max} label={label} />;
}

export function Tabs({ items, label }: { items: { to: string; label: string; end?: boolean }[]; label?: string }) {
  return <NavTabs items={items} label={label} />;
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  return <CopyFieldBlock value={value} label={label} />;
}

/* ------------------------------------------------------------------ phase */

/** A Campaign mode as people read it ("Survey", not "survey"); the labels live in src/config/feedbackTypes.ts. */
export function modeLabel(mode: string): string {
  return feedbackTypeLabel(mode);
}

export function campaignPhase(c: { status: string; opens_at: string | null; closes_at: string | null }, now = Date.now()): Phase {
  if (c.status === "draft") return "draft";
  if (c.status === "paused") return "paused";
  if (c.status === "archived") return "archived";
  if (c.status === "closed") return "closed";
  if (c.opens_at && new Date(c.opens_at).getTime() > now) return "scheduled";
  if (c.closes_at && new Date(c.closes_at).getTime() <= now) return "ended";
  return "open";
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  return <PhaseBadgeBlock phase={phase} />;
}
