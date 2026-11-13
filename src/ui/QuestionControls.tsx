import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import type { Question } from "../lib/lvApi";
import { CORE_KINDS, FACE_LABELS, agreeLabels } from "../lib/questionKinds";
import { KindInput, type UploadResult } from "./KindControls";

/**
 * The five answer modes as accessible controls. Selection is the pressed amber surface plus a glyph change,
 * never depth alone. Radiogroups use a roving tabindex: arrows move and select, Home and End jump.
 */

function useJelly(value: unknown) {
  const [key, setKey] = useState<unknown>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setKey(value);
    const t = window.setTimeout(() => setKey(null), 600);
    return () => window.clearTimeout(t);
  }, [value]);
  return key;
}

function arrowIndex(e: KeyboardEvent, i: number, n: number): number | null {
  if (e.key === "ArrowRight" || e.key === "ArrowDown") return (i + 1) % n;
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") return (i - 1 + n) % n;
  if (e.key === "Home") return 0;
  if (e.key === "End") return n - 1;
  return null;
}

export const MAX_TEXT = 280;

/** A playful word for each rating. Shown only to the person answering; never a result. */
export const RATING_WORDS = ["", "Not great", "Meh", "Okay", "Good", "Loved it!"];

/** One question's answer control: the five core kinds here, the v2 kinds (000047) in KindControls.tsx. */
export function QuestionInput({ q, value, onChange, upload }: { q: Question; value: unknown; onChange: (v: unknown) => void; upload?: (file: File) => Promise<UploadResult> }) {
  if (!(CORE_KINDS as readonly string[]).includes(q.kind)) return <KindInput q={q} value={value} onChange={onChange} upload={upload} />;
  return <CoreInput q={q} value={value} onChange={onChange} />;
}

function CoreInput({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const jelly = useJelly(value);
  const options = (q.config?.options as string[] | undefined) ?? [];
  const maxPick = typeof q.config?.max === "number" ? (q.config.max as number) : undefined;

  const roving = (i: number, n: number, choose: (to: number) => void) => (e: KeyboardEvent) => {
    const to = arrowIndex(e, i, n);
    if (to === null) return;
    e.preventDefault();
    choose(to);
    refs.current[to]?.focus();
  };

  if (q.kind === "rating") {
    const v = typeof value === "number" ? value : 0;
    return (
      <div className="lv-rating-wrap">
      <div className="lv-rating" role="radiogroup" aria-label={q.prompt}>
        {[1, 2, 3, 4, 5].map((n, i) => (
          <button
            key={n}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={v === n}
            aria-label={`${n} of 5`}
            data-on={n <= v}
            data-jelly={jelly === n}
            style={{ "--i": i } as React.CSSProperties}
            tabIndex={v === n || (v === 0 && i === 0) ? 0 : -1}
            className="lv-circle"
            onClick={() => onChange(n)}
            onKeyDown={roving(i, 5, (to) => onChange(to + 1))}
          >
            <Icon name={n <= v ? "star-fill" : "star"} size={24} />
          </button>
        ))}
      </div>
      <p className="lv-rating-word" aria-live="polite" data-testid="rating-word">{v ? <span key={v}>{RATING_WORDS[v]}</span> : <span className="lv-rating-word-hint">Tap a star</span>}</p>
      </div>
    );
  }

  if (q.kind === "yes_no") {
    return (
      <div className="lv-yesno" role="radiogroup" aria-label={q.prompt}>
        {[
          { label: "Yes", val: true },
          { label: "No", val: false },
        ].map((o, i) => (
          <button
            key={o.label}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={value === o.val}
            data-jelly={jelly === o.val}
            tabIndex={value === o.val || (value === undefined && i === 0) ? 0 : -1}
            className="lv-tile-choice"
            onClick={() => onChange(o.val)}
            onKeyDown={roving(i, 2, (to) => onChange(to === 0))}
          >
            <Icon name={o.val ? "check" : "close"} size={22} />
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (q.kind === "text") {
    const text = typeof value === "string" ? value : "";
    return (
      <div className="lv-text">
        <textarea
          className="lv-textarea"
          aria-label={q.prompt}
          value={text}
          maxLength={MAX_TEXT}
          rows={5}
          placeholder="Type your answer"
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="lv-counter" data-warn={text.length > MAX_TEXT - 30}>{text.length}/{MAX_TEXT}</span>
      </div>
    );
  }

  if (q.kind === "multi_choice") {
    const picked = Array.isArray(value) ? (value as string[]) : [];
    const atMax = maxPick !== undefined && picked.length >= maxPick;
    return (
      <div className="lv-options" role="group" aria-label={q.prompt}>
        {maxPick !== undefined && <p className="lv-hint" role="status">Pick up to {maxPick}{atMax ? ". That's the limit, so un-pick one to change." : "."}</p>}
        {options.map((opt) => {
          const on = picked.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={!on && atMax}
              data-jelly={jelly === value && on}
              className="lv-option"
              onClick={() => onChange(on ? picked.filter((v) => v !== opt) : [...picked, opt])}
            >
              <span className="lv-option-glyph" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="lv-options" role="radiogroup" aria-label={q.prompt}>
      {options.map((opt, i) => {
        const on = value === opt;
        return (
          <button
            key={opt}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            data-jelly={jelly === opt}
            tabIndex={on || (value === undefined && i === 0) ? 0 : -1}
            className="lv-option"
            onClick={() => onChange(opt)}
            onKeyDown={roving(i, options.length, (to) => onChange(options[to]))}
          >
            <span className="lv-option-glyph lv-option-round" aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** A short readable summary of an answer for the review screen. */
export function summarize(q: Question, value: unknown): string {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return "Skipped";
  if (q.kind === "rating") return `${value} of 5`;
  if (q.kind === "yes_no") return value ? "Yes" : "No";
  if (q.kind === "face_scale") return FACE_LABELS[Number(value) - 1] ?? String(value);
  if (q.kind === "nps") return `${value} of 10`;
  if (q.kind === "agree_scale") return agreeLabels(q.config)[Number(value) - 1] ?? String(value);
  if (q.kind === "ranking" && Array.isArray(value)) return value.map((v, i) => `${i + 1}. ${v}`).join(", ");
  if (q.kind === "agree_grid" && typeof value === "object") return `${Object.keys(value as object).length} statements rated`;
  if (q.kind === "before_after" && typeof value === "object") return `Before ${(value as { before: number }).before}, now ${(value as { after: number }).after}`;
  if (q.kind === "contact" && typeof value === "object") return Object.values(value as Record<string, string>).join(", ");
  if (q.kind === "file_upload" && typeof value === "object") return (value as { name: string }).name;
  if (q.kind === "consent") return "Agreed";
  if (q.kind === "signature") return `Signed: ${value}`;
  if (q.kind === "price_ladder") return value === "none" ? "None of these" : String(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
