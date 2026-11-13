import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import type { Question } from "../lib/lvApi";
import { agreeLabels, CONTACT_FIELDS, FACE_LABELS, FILE_TYPES, type ContactField } from "../lib/questionKinds";

/**
 * Answer controls for the v2 question types (000047). Phone first: every target is at least 44px, nothing needs
 * hover, and each control is a real input, a radiogroup with a roving tabindex, or a list of buttons with a state
 * that is spelled out in text, never colour alone. Reuses the existing control surfaces (.lv-option, .lv-circle).
 */

export interface UploadResult { ok: boolean; path?: string; message?: string }
export interface KindInputProps {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  /** File upload only: stores the file privately and returns its path. Absent = uploads are not available here. */
  upload?: (file: File) => Promise<UploadResult>;
}

const cfg = (q: Question) => q.config as Record<string, unknown>;
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function arrow(e: KeyboardEvent, i: number, n: number): number | null {
  if (e.key === "ArrowRight" || e.key === "ArrowDown") return (i + 1) % n;
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") return (i - 1 + n) % n;
  if (e.key === "Home") return 0;
  if (e.key === "End") return n - 1;
  return null;
}

/** A radiogroup of n buttons; `render(i, on)` draws one. Arrow keys move and select. */
function Radios({ n, label, value, onPick, className, render, first = 0 }: {
  n: number; label: string; value: number | null; onPick: (i: number) => void; className: string;
  render: (i: number, on: boolean) => React.ReactNode; first?: number;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className={className} role="radiogroup" aria-label={label}>
      {Array.from({ length: n }, (_, i) => {
        const on = value === i + first;
        return (
          <button
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value === null && i === 0) ? 0 : -1}
            className="lv-kc-pick"
            data-on={on}
            onClick={() => onPick(i + first)}
            onKeyDown={(e) => { const to = arrow(e, i, n); if (to === null) return; e.preventDefault(); onPick(to + first); refs.current[to]?.focus(); }}
          >
            {render(i, on)}
          </button>
        );
      })}
    </div>
  );
}

/** Five faces drawn in SVG: the mouth curves from a frown to a smile. */
function Face({ level, on }: { level: number; on: boolean }) {
  const mouth = ["M10 30 Q18 22 26 30", "M11 29 Q18 25 25 29", "M11 28 L25 28", "M11 26 Q18 31 25 26", "M10 25 Q18 35 26 25"][level - 1];
  return (
    <svg viewBox="0 0 36 36" width="40" height="40" aria-hidden="true" className="lv-kc-face" data-on={on}>
      <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="13" cy="14" r="1.8" fill="currentColor" />
      <circle cx="23" cy="14" r="1.8" fill="currentColor" />
      <path d={mouth} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function FaceScale({ q, value, onChange }: KindInputProps) {
  const v = typeof value === "number" ? value : null;
  return (
    <div className="lv-kc-wrap">
      <Radios n={5} label={q.prompt} value={v} first={1} onPick={onChange} className="lv-kc-faces"
        render={(i, on) => <><Face level={i + 1} on={on} /><span className="lv-kc-sr">{FACE_LABELS[i]}</span></>} />
      <p className="lv-rating-word" aria-live="polite">{v ? <span key={v}>{FACE_LABELS[v - 1]}</span> : <span className="lv-rating-word-hint">Tap a face</span>}</p>
    </div>
  );
}

function Nps({ q, value, onChange }: KindInputProps) {
  const c = cfg(q);
  const v = typeof value === "number" ? value : null;
  return (
    <div className="lv-kc-wrap">
      <Radios n={11} label={q.prompt} value={v} onPick={onChange} className="lv-kc-nps" render={(i) => <span>{i}</span>} />
      <div className="lv-kc-ends" aria-hidden="true"><span>0 · {typeof c.low_label === "string" && c.low_label ? c.low_label : "Not at all likely"}</span><span>{typeof c.high_label === "string" && c.high_label ? c.high_label : "Extremely likely"} · 10</span></div>
    </div>
  );
}

function AgreeList({ q, value, onChange }: KindInputProps) {
  const labels = agreeLabels(cfg(q));
  const v = typeof value === "number" ? value : null;
  return (
    <Radios n={labels.length} label={q.prompt} value={v} first={1} onPick={onChange} className="lv-options"
      render={(i, on) => <><span className="lv-option-glyph lv-option-round" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>{labels[i]}</>} />
  );
}

function Dropdown({ q, value, onChange }: KindInputProps) {
  const id = useId();
  const opts = list(cfg(q).options);
  return (
    <div className="lv-kc-wrap">
      <label htmlFor={id} className="lv-kc-sr">{q.prompt}</label>
      <select id={id} className="lv-kc-field lv-kc-select" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Choose one</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function NumberInput({ q, value, onChange }: KindInputProps) {
  const c = cfg(q);
  const id = useId();
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  const unit = typeof c.unit === "string" ? c.unit : "";
  const hint = [typeof c.min === "number" ? `at least ${c.min}` : "", typeof c.max === "number" ? `at most ${c.max}` : "", c.integer ? "whole numbers" : ""].filter(Boolean).join(", ");
  return (
    <div className="lv-kc-wrap">
      <label htmlFor={id} className="lv-kc-sr">{q.prompt}</label>
      <div className="lv-kc-unit">
        <input id={id} className="lv-kc-field" type="number" inputMode={c.integer ? "numeric" : "decimal"} value={text}
          min={typeof c.min === "number" ? c.min : undefined} max={typeof c.max === "number" ? c.max : undefined} step={c.integer ? 1 : "any"}
          aria-describedby={hint ? `${id}-h` : undefined} placeholder="Type a number"
          onChange={(e) => { setText(e.target.value); const n = e.target.value === "" ? NaN : Number(e.target.value); onChange(Number.isFinite(n) ? n : undefined); }} />
        {unit && <span className="lv-kc-unit-tag">{unit}</span>}
      </div>
      {hint && <p id={`${id}-h`} className="lv-hint">{hint[0].toUpperCase() + hint.slice(1)}.</p>}
    </div>
  );
}

function DateInput({ q, value, onChange }: KindInputProps) {
  const c = cfg(q);
  const id = useId();
  return (
    <div className="lv-kc-wrap">
      <label htmlFor={id} className="lv-kc-sr">{q.prompt}</label>
      <input id={id} className="lv-kc-field" type="date" value={typeof value === "string" ? value : ""}
        min={typeof c.min === "string" ? c.min : undefined} max={typeof c.max === "string" ? c.max : undefined}
        onChange={(e) => onChange(e.target.value || undefined)} />
    </div>
  );
}

function Slider({ q, value, onChange }: KindInputProps) {
  const c = cfg(q);
  const min = num(c.min, 0), max = num(c.max, 10), step = num(c.step, 1);
  const id = useId();
  const touched = typeof value === "number";
  const shown = touched ? (value as number) : min + Math.round((max - min) / step / 2) * step;
  const commit = () => { if (!touched) onChange(shown); };
  return (
    <div className="lv-kc-wrap">
      <div className="lv-kc-slider-top" aria-live="polite"><strong className="lv-kc-big" data-testid="slider-value">{touched ? shown : "–"}</strong>{!touched && <span className="lv-hint">Move the slider</span>}</div>
      <input id={id} className="lv-kc-range" type="range" min={min} max={max} step={step} value={shown} aria-label={q.prompt} data-touched={touched}
        onChange={(e) => onChange(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={() => undefined} />
      <div className="lv-kc-ends"><span>{String(c.min_label || min)}</span><span>{String(c.max_label || max)}</span></div>
    </div>
  );
}

/** Tap options in the order you prefer; tap a ranked one to take it out. The answer is complete when all are ranked. */
function Ranking({ q, value, onChange }: KindInputProps) {
  const opts = list(cfg(q).options);
  const [order, setOrder] = useState<string[]>(Array.isArray(value) ? (value as string[]) : []);
  const push = (next: string[]) => { setOrder(next); onChange(next.length === opts.length ? next : undefined); };
  return (
    <div className="lv-options" role="group" aria-label={q.prompt}>
      <p className="lv-hint" role="status">{order.length === opts.length ? "All ranked. Tap one to take it out and rank it again." : `Tap your ${order.length ? "next" : "first"} choice. ${opts.length - order.length} left.`}</p>
      {opts.map((o) => {
        const rank = order.indexOf(o) + 1;
        return (
          <button key={o} type="button" className="lv-option" role="checkbox" aria-checked={rank > 0} aria-label={rank ? `${o}, ranked ${rank}` : `${o}, not ranked`}
            onClick={() => push(rank ? order.filter((x) => x !== o) : [...order, o])}>
            <span className="lv-option-glyph lv-kc-rank" aria-hidden="true">{rank || ""}</span>{o}
          </button>
        );
      })}
      {order.length > 0 && <button type="button" className="lv-skip" onClick={() => push([])}>Start again</button>}
    </div>
  );
}

function ImageChoice({ q, value, onChange }: KindInputProps) {
  const opts = list(cfg(q).options);
  const imgs = list(cfg(q).images);
  const idx = opts.indexOf(value as string);
  return (
    <Radios n={opts.length} label={q.prompt} value={idx >= 0 ? idx : null} onPick={(i) => onChange(opts[i])} className="lv-kc-images"
      render={(i, on) => (
        <>
          {imgs[i] ? <img src={imgs[i]} alt="" loading="lazy" className="lv-kc-img" /> : <span className="lv-kc-img lv-kc-img-empty" aria-hidden="true" />}
          <span className="lv-kc-img-label">{on && <Icon name="check" size={14} />} {opts[i]}</span>
        </>
      )} />
  );
}

function Contact({ q, value, onChange }: KindInputProps) {
  const fields = (list(cfg(q).fields) as ContactField[]).filter((f) => CONTACT_FIELDS.includes(f));
  const v = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  const id = useId();
  const meta: Record<ContactField, { label: string; type: string; auto: string; mode?: "email" | "tel" }> = {
    name: { label: "Name", type: "text", auto: "name" },
    email: { label: "Email", type: "email", auto: "email", mode: "email" },
    phone: { label: "Phone", type: "tel", auto: "tel", mode: "tel" },
  };
  const set = (f: string, t: string) => {
    const next = { ...v, [f]: t };
    if (!t) delete next[f];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="lv-kc-wrap" role="group" aria-label={q.prompt}>
      <p className="lv-hint">We record these with your answers, so the creator can see who you are.</p>
      {fields.map((f) => (
        <div key={f} className="lv-kc-labelled">
          <label htmlFor={`${id}-${f}`}>{meta[f].label}</label>
          <input id={`${id}-${f}`} className="lv-kc-field" type={meta[f].type} inputMode={meta[f].mode} autoComplete={meta[f].auto} maxLength={f === "name" ? 100 : 254}
            value={v[f] ?? ""} onChange={(e) => set(f, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function Grid({ q, value, onChange }: KindInputProps) {
  const rows = list(cfg(q).rows);
  const labels = agreeLabels(cfg(q));
  const [part, setPart] = useState<Record<string, number>>((value && typeof value === "object" ? value : {}) as Record<string, number>);
  const v = part;
  const id = useId();
  const setRow = (r: string, n: number) => {
    const next = { ...v, [r]: n };
    setPart(next);
    onChange(rows.every((x) => typeof next[x] === "number") ? next : undefined);
  };
  return (
    <div className="lv-kc-grid" role="group" aria-label={q.prompt}>
      {rows.map((r, ri) => (
        <fieldset key={ri} className="lv-kc-gridrow">
          <legend id={`${id}-${ri}`}>{r}</legend>
          <Radios n={labels.length} label={`${r}: ${q.prompt}`} value={typeof v[r] === "number" ? v[r] : null} first={1} onPick={(n) => setRow(r, n)} className="lv-kc-scale"
            render={(i, on) => <><span aria-hidden="true">{i + 1}</span><span className="lv-kc-sr">{labels[i]}</span>{on && <span className="lv-kc-sr"> selected</span>}</>} />
        </fieldset>
      ))}
      <div className="lv-kc-ends" aria-hidden="true"><span>1 · {labels[0]}</span><span>{labels[labels.length - 1]} · {labels.length}</span></div>
    </div>
  );
}

function BeforeAfter({ q, value, onChange }: KindInputProps) {
  const c = cfg(q);
  const labels = agreeLabels(c);
  const [cur, setCur] = useState<{ before?: number; after?: number }>((value && typeof value === "object" ? value : {}) as { before?: number; after?: number });
  const set = (k: "before" | "after", n: number) => {
    const next = { ...cur, [k]: n };
    setCur(next);
    onChange(typeof next.before === "number" && typeof next.after === "number" ? next : undefined);
  };
  const parts: { k: "before" | "after"; label: string }[] = [
    { k: "before", label: typeof c.before_label === "string" && c.before_label ? c.before_label : "Before" },
    { k: "after", label: typeof c.after_label === "string" && c.after_label ? c.after_label : "Now" },
  ];
  return (
    <div className="lv-kc-grid" role="group" aria-label={q.prompt}>
      {parts.map((p) => (
        <fieldset key={p.k} className="lv-kc-gridrow">
          <legend>{p.label}</legend>
          <Radios n={labels.length} label={`${p.label}: ${q.prompt}`} value={typeof cur[p.k] === "number" ? (cur[p.k] as number) : null} first={1} onPick={(n) => set(p.k, n)} className="lv-kc-scale"
            render={(i) => <><span aria-hidden="true">{i + 1}</span><span className="lv-kc-sr">{labels[i]}</span></>} />
        </fieldset>
      ))}
      <div className="lv-kc-ends" aria-hidden="true"><span>1 · {labels[0]}</span><span>{labels[labels.length - 1]} · {labels.length}</span></div>
    </div>
  );
}

function PriceLadder({ q, value, onChange }: KindInputProps) {
  const c = cfg(q);
  const prices = (Array.isArray(c.prices) ? c.prices : []) as number[];
  const cur = typeof c.currency === "string" ? c.currency : "USD";
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const options: (number | "none")[] = [...prices, "none"];
  const idx = options.indexOf(value as never);
  return (
    <Radios n={options.length} label={q.prompt} value={idx >= 0 ? idx : null} onPick={(i) => onChange(options[i])} className="lv-options"
      render={(i, on) => <><span className="lv-option-glyph lv-option-round" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>{options[i] === "none" ? "None of these" : fmt(options[i] as number)}</>} />
  );
}

function Consent({ q, value, onChange }: KindInputProps) {
  const statement = typeof cfg(q).statement === "string" ? (cfg(q).statement as string) : "";
  const on = value === true;
  return (
    <div className="lv-kc-wrap">
      <button type="button" role="checkbox" aria-checked={on} className="lv-option" onClick={() => onChange(on ? undefined : true)}>
        <span className="lv-option-glyph" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
        <span>{statement}</span>
      </button>
      <p className="lv-hint">We record that you agreed, with your name.</p>
    </div>
  );
}

function Signature({ q, value, onChange }: KindInputProps) {
  const id = useId();
  const text = typeof value === "string" ? value : "";
  return (
    <div className="lv-kc-wrap">
      <label htmlFor={id} className="lv-kc-sr">{q.prompt}</label>
      <input id={id} className="lv-kc-field lv-kc-sign" type="text" autoComplete="name" maxLength={100} placeholder="Type your full name" value={text}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)} />
      <p className="lv-hint">Typing your name signs this. It is recorded with the time.</p>
    </div>
  );
}

function FileUpload({ q, value, onChange, upload }: KindInputProps) {
  const c = cfg(q);
  const id = useId();
  const maxMb = num(c.max_mb, 5);
  const kinds = list(c.types).length ? list(c.types) : ["image", "pdf"];
  const accept = kinds.flatMap((t) => FILE_TYPES[t] ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = value && typeof value === "object" ? (value as { name?: string; size?: number }) : null;
  async function pick(f: File | undefined) {
    if (!f) return;
    setProblem(null);
    if (f.size > maxMb * 1024 * 1024) return setProblem(`That file is over ${maxMb} MB.`);
    if (!accept.includes(f.type)) return setProblem("That kind of file is not allowed here.");
    if (!upload) return setProblem("Uploads are not available here.");
    setBusy(true);
    const r = await upload(f);
    setBusy(false);
    if (!r.ok || !r.path) return setProblem(r.message || "The upload did not work. Try again.");
    onChange({ path: r.path, name: f.name.slice(0, 200), size: f.size, type: f.type });
  }
  const labels = kinds.map((k) => (k === "image" ? "images" : k === "pdf" ? "PDF" : "documents")).join(", ");
  return (
    <div className="lv-kc-wrap">
      <label htmlFor={id} className="lv-option lv-kc-file">
        <Icon name="plus" size={18} />
        <span>{busy ? "Uploading…" : file ? `${file.name} · tap to replace` : "Choose a file"}</span>
      </label>
      <input id={id} className="lv-kc-sr" type="file" accept={accept.join(",")} disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
      <p className="lv-hint">Up to {maxMb} MB. Allowed: {labels}. Only the creator can open it.</p>
      {problem && <p className="lv-field-error" role="alert">{problem}</p>}
    </div>
  );
}

/** The control for one v2 question type. */
export function KindInput(p: KindInputProps) {
  switch (p.q.kind) {
    case "face_scale": return <FaceScale {...p} />;
    case "dropdown": return <Dropdown {...p} />;
    case "number": return <NumberInput {...p} />;
    case "date": return <DateInput {...p} />;
    case "nps": return <Nps {...p} />;
    case "agree_scale": return <AgreeList {...p} />;
    case "ranking": return <Ranking {...p} />;
    case "image_choice": return <ImageChoice {...p} />;
    case "slider": return <Slider {...p} />;
    case "contact": return <Contact {...p} />;
    case "agree_grid": return <Grid {...p} />;
    case "before_after": return <BeforeAfter {...p} />;
    case "price_ladder": return <PriceLadder {...p} />;
    case "consent": return <Consent {...p} />;
    case "signature": return <Signature {...p} />;
    case "file_upload": return <FileUpload {...p} />;
    default: return null;
  }
}
