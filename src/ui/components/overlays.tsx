import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton, TextInput } from "./controls";
import { Icon } from "./Icon";

// Focus trap, Esc, return focus. One dialog implementation for the whole app.

function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const first = focusable()[0];
    (first ?? panel)?.focus();

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      restore.current?.focus?.();
    };
  }, [open, onClose]);

  return panelRef;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const id = useId();
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        ref={ref}
        tabIndex={-1}
        style={{ width: `min(${width}px, 100%)` }}
      >
        <div className="row-between" style={{ marginBottom: 16, alignItems: "flex-start" }}>
          <h2 className="t-title" id={`${id}-title`}>
            {title}
          </h2>
          <IconButton icon="close" label="Close" variant="quiet" size="sm" onClick={onClose} />
        </div>
        <div className="stack">{children}</div>
        {footer && <div className="row row-end" style={{ marginTop: 20 }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Destructive confirm: the action stays disabled until the typed phrase matches. */
export function TypedConfirm({
  open,
  onClose,
  onConfirm,
  title,
  body,
  phrase,
  confirmLabel = "Delete",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  phrase: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const ok = typed.trim() === phrase;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!ok} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="t-small muted">{body}</div>
      <label className="t-label" htmlFor="typed-confirm">
        Type {phrase} to confirm
      </label>
      <TextInput id="typed-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
    </Dialog>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <span className="t-label muted">{title}</span>
          <IconButton icon="close" label="Close" variant="quiet" size="sm" onClick={onClose} />
        </div>
        <div className="stack">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Menu({
  open,
  onClose,
  items,
  label,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  items: ({ key: string; label: string; icon?: string; to?: string; onSelect?: () => void; danger?: boolean })[];
  label: string;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="menu" role="menu" aria-label={label} ref={ref} style={align === "left" ? { left: 0, right: "auto" } : { right: 0 }}>
      {items.map((it) =>
        it.to ? (
          <a key={it.key} role="menuitem" href={it.to} onClick={onClose}>
            {it.icon && <Icon name={it.icon} size={16} />}
            {it.label}
          </a>
        ) : (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
            style={it.danger ? { color: "var(--lv-danger-ink)" } : undefined}
          >
            {it.icon && <Icon name={it.icon} size={16} />}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      aria-describedby={show ? id : undefined}
    >
      {children}
      {show && (
        <span className="tooltip" role="tooltip" id={id} style={{ bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }}>
          {label}
        </span>
      )}
    </span>
  );
}
