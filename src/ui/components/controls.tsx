import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { HUB_COLORS } from "../tokens";

/* ------------------------------------------------------------------ actions */

type ButtonVariant = "primary" | "raised" | "ink" | "quiet" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  raised: "btn-raised",
  ink: "btn-ink",
  quiet: "btn-quiet",
  danger: "btn-danger",
};
const sizeClass: Record<ButtonSize, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "raised", size = "md", loading = false, icon, iconRight, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={`btn ${variantClass[variant]} ${sizeClass[size]} ${loading ? "btn-loading" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && !loading && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  variant = "raised",
  size = "md",
  ...rest
}: ButtonProps & { icon: IconName; label: string }) {
  return (
    <Button {...rest} variant={variant} size={size} className={`btn-icon ${size === "sm" ? "btn-icon-sm" : ""}`} aria-label={label} title={label}>
      <Icon name={icon} size={size === "sm" ? 18 : 22} />
    </Button>
  );
}

export function ButtonLink({ to, state, children, variant = "raised", size = "md", icon, iconRight }: {
  to: string;
  state?: unknown;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
}) {
  return (
    <Link to={to} state={state} className={`btn ${variantClass[variant]} ${sizeClass[size]}`}>
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={18} />}
    </Link>
  );
}

/** B / I / U style group from Tactile 7b: toggle buttons that press amber. */
export function IconToggleGroup({
  items,
  value,
  onChange,
  label,
}: {
  items: { key: string; icon: IconName; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label} style={{ padding: 4 }}>
      {items.map((it) => {
        const on = value.includes(it.key);
        return (
          <button
            key={it.key}
            type="button"
            className="seg press btn-icon btn-icon-sm"
            aria-pressed={on}
            aria-label={it.label}
            title={it.label}
            onClick={() => onChange(on ? value.filter((v) => v !== it.key) : [...value, it.key])}
            style={
              on
                ? { background: "var(--lv-pressed-bg)", boxShadow: "var(--lv-pressed-shadow)", color: "var(--lv-on-accent)" }
                : undefined
            }
          >
            <Icon name={it.icon} size={18} />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ field shell */

export function Field({
  label,
  htmlFor,
  help,
  error,
  counter,
  children,
  hint,
}: {
  label?: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string | null;
  counter?: { value: number; max?: number };
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="field">
      {(label || counter) && (
        <div className="field-label">
          {label && (
            <label className="t-label" htmlFor={htmlFor}>
              {label}
            </label>
          )}
          {counter && (
            <span className="t-small mono subtle">
              {counter.value}
              {counter.max ? `/${counter.max}` : ""}
            </span>
          )}
          {hint}
        </div>
      )}
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        help && <p className="field-help">{help}</p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className = "", invalid, ...rest }, ref) {
    return <input ref={ref} className={`input ${className}`} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className = "", invalid, ...rest }, ref) {
    return <textarea ref={ref} className={`textarea ${className}`} aria-invalid={invalid || undefined} {...rest} />;
  },
);

/* ------------------------------------------------------------------ select */

export interface Option {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  label,
  id,
  placeholder = "Choose one",
  disabled,
}: {
  options: Option[];
  value: string | null;
  onChange: (v: string) => void;
  label: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const [typed, setTyped] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  }, []);

  const commit = (index: number) => {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const t = window.setTimeout(() => setTyped(""), 700);
    return () => window.clearTimeout(t);
  }, [open, typed]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let next = active;
      for (let i = 0; i < options.length; i++) {
        next = (next + dir + options.length) % options.length;
        if (!options[next].disabled) break;
      }
      setActive(next);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const q = (typed + e.key).toLowerCase();
      setTyped(q);
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(q));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div className="field-wrap" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ color: selected ? undefined : "var(--lv-subtle)" }}>{selected?.label ?? placeholder}</span>
        <Icon name="chevron-down" size={18} />
      </button>
      {open && (
        <ul className="listbox" id={listId} role="listbox" aria-label={label} ref={listRef} tabIndex={-1}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              data-active={i === active}
              className="option"
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(i)}
            >
              <span>{o.label}</span>
              {o.value === value ? <Icon name="check" size={16} /> : o.hint ? <span className="t-small subtle">{o.hint}</span> : null}
            </li>
          ))}
          {options.length === 0 && <li className="option subtle">No matches</li>}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ combobox */

export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = "Search",
  id,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  id?: string;
}) {
  const listId = `${id ?? "combobox"}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const filtered = useMemo(
    () => (query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query],
  );

  return (
    <div className="field-wrap" style={{ position: "relative" }}>
      <div className="input-affix">
        <Icon name="search" size={18} />
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              onChange(filtered[active].value);
              setQuery(filtered[active].label);
              setOpen(false);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {value && <span className="t-small subtle nowrap">selected</span>}
      </div>
      {open && filtered.length > 0 && (
        <ul className="listbox" id={listId} role="listbox" aria-label={label}>
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              data-active={i === active}
              className="option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onChange(o.value);
                setQuery(o.label);
                setOpen(false);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ choices */

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <label className="check">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden="true">
        <Icon name="check" size={14} strokeWidth={2.6} />
      </span>
      <span>{children}</span>
    </label>
  );
}

export function RadioGroup({
  options,
  value,
  onChange,
  label,
  name,
}: {
  options: Option[];
  value: string | null;
  onChange: (v: string) => void;
  label: string;
  name?: string;
}) {
  const groupName = name ?? useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  // WAI-ARIA radiogroup: one tab stop, arrows move and select.
  const move = (from: number, dir: number) => {
    const next = (from + dir + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div role="radiogroup" aria-label={label} className="stack stack-sm">
      {options.map((o, i) => (
        <label key={o.value} className="check">
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="radio"
            name={groupName}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            tabIndex={i === index ? 0 : -1}
            onChange={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                move(i, -1);
              }
            }}
          />
          <span className="check-box check-dot" aria-hidden="true">
            <Icon name="check" size={13} strokeWidth={2.8} />
          </span>
          <span>
            {o.label}
            {o.hint && <span className="t-small subtle" style={{ display: "block" }}>{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="row-between" style={{ alignItems: "flex-start" }}>
      <div className="stack stack-sm" style={{ maxWidth: "56ch" }}>
        <label htmlFor={id} className="t-ui" style={{ fontWeight: 600 }}>
          {label}
        </label>
        {description && <span className="t-small subtle">{description}</span>}
      </div>
      <label className="switch">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </label>
    </div>
  );
}

export interface SegmentedItem {
  key: string;
  label: ReactNode;
  to?: string;
  count?: number;
}

/** Segmented control with a raised sliding thumb; scrolls sideways when narrow. */
export function Segmented({
  items,
  value,
  onChange,
  label,
  pressed = false,
}: {
  items: SegmentedItem[];
  value: string;
  onChange?: (key: string) => void;
  label: string;
  /** Selected item wears the pressed amber treatment (tabs, bottom nav). */
  pressed?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const index = items.findIndex((i) => i.key === value);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const el = wrap.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
      if (!el) {
        setThumb(null);
        return;
      }
      setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, items.length]);

  return (
    <div className="segmented" role="tablist" aria-label={label} ref={wrapRef}>
      {thumb && (
        <span
          className={`seg-thumb ${pressed ? "seg-thumb-pressed" : ""}`}
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
          aria-hidden="true"
        />
      )}
      {items.map((it, i) => {
        const common = {
          className: "seg",
          "aria-selected": i === index,
          "aria-current": (i === index ? "page" : undefined) as "page" | undefined,
          style: pressed && i === index ? { background: "var(--lv-pressed-bg)", boxShadow: "var(--lv-pressed-shadow)", color: "var(--lv-on-accent)" } : undefined,
        };
        return it.to ? (
          <Link key={it.key} to={it.to} {...common} role="tab">
            {it.label}
            {typeof it.count === "number" && <span className="mono" style={{ fontSize: 11 }}>{it.count}</span>}
          </Link>
        ) : (
          <button key={it.key} type="button" {...common} role="tab" onClick={() => onChange?.(it.key)}>
            {it.label}
            {typeof it.count === "number" && <span className="mono" style={{ fontSize: 11 }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  format = (v: number) => String(v),
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="stack stack-sm">
      <div className="row-between">
        <label htmlFor={id} className="t-label">
          {label}
        </label>
        <output htmlFor={id} className="mono t-ui" style={{ fontWeight: 700 }}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function CodeInput({
  value,
  onChange,
  length = 6,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  label: string;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.padEnd(length, " ").slice(0, length).split("");

  const setAt = (i: number, ch: string) => {
    const next = chars.map((c, idx) => (idx === i ? ch : c)).join("").replace(/\s/g, "");
    onChange(next.slice(0, length).toUpperCase());
  };

  return (
    <div className="code-cells" role="group" aria-label={label}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="code-cell"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          maxLength={1}
          aria-label={`${label}, character ${i + 1} of ${length}`}
          value={chars[i].trim()}
          data-filled={Boolean(chars[i].trim())}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
            if (!raw) {
              setAt(i, " ");
              return;
            }
            if (raw.length > 1) {
              // paste: fill forward from this cell
              const joined = (chars.slice(0, i).join("") + raw).replace(/\s/g, "").toUpperCase();
              onChange(joined.slice(0, length));
              refs.current[Math.min(length - 1, i + raw.length)]?.focus();
              return;
            }
            setAt(i, raw.toUpperCase());
            if (i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !chars[i].trim() && i > 0) {
              e.preventDefault();
              refs.current[i - 1]?.focus();
              setAt(i - 1, " ");
            } else if (e.key === "ArrowLeft" && i > 0) {
              e.preventDefault();
              refs.current[i - 1]?.focus();
            } else if (e.key === "ArrowRight" && i < length - 1) {
              e.preventDefault();
              refs.current[i + 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const raw = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
            if (!raw) return;
            onChange(raw.slice(0, length));
            refs.current[Math.min(length - 1, raw.length - 1)]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  label = "Hub colour",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {HUB_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.value.toLowerCase()}
          aria-label={c.name}
          title={c.name}
          className="swatch"
          style={{ background: c.value }}
          onClick={() => onChange(c.value)}
        >
          {value.toLowerCase() === c.value.toLowerCase() && <Icon name="check" size={22} strokeWidth={2.8} title={`${c.name} selected`} />}
        </button>
      ))}
    </div>
  );
}
