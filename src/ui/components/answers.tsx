// The five answer modes (rating, single choice, multi choice, yes/no, open text),
// and the future modes behind `futureModes` (NPS, slider question, ranking).
// These are the only controls a respondent ever touches.

import { useState, type ReactNode } from "react";
import { Button, IconToggleGroup, Textarea } from "./controls";
import { Icon } from "./Icon";
import { useJelly } from "../motion";

export type AnswerValue = number | string | string[] | boolean | null;

export function QuestionShell({
  prompt,
  help,
  children,
  counter,
}: {
  prompt: string;
  help?: string;
  children: ReactNode;
  counter?: ReactNode;
}) {
  return (
    <div className="stack">
      <div className="stack stack-sm">
        <h2 className="t-title" style={{ fontSize: 22, lineHeight: 1.25 }}>
          {prompt}
        </h2>
        {help && <p className="t-small muted">{help}</p>}
        {counter}
      </div>
      {children}
    </div>
  );
}

export function Rating({
  value,
  onChange,
  prompt,
  help,
  scale = 5,
  labels,
}: {
  value: number | null;
  onChange: (v: number) => void;
  prompt: string;
  help?: string;
  scale?: number;
  labels?: { low: string; high: string };
}) {
  const jelly = useJelly(value);
  return (
    <QuestionShell prompt={prompt} help={help}>
      <div className={`rating-row ${jelly.className}`} role="radiogroup" aria-label={prompt} onAnimationEnd={jelly.onAnimationEnd}>
        {Array.from({ length: scale }).map((_, i) => {
          const n = i + 1;
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} of ${scale}`}
              className="rating-dot"
              tabIndex={on || (value === null && i === 0) ? 0 : -1}
              onClick={() => onChange(n)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                  e.preventDefault();
                  onChange(Math.min(scale, n + 1));
                } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                  e.preventDefault();
                  onChange(Math.max(1, n - 1));
                }
              }}
            >
              {on ? <Icon name="star" size={24} strokeWidth={2} title={`${n} of ${scale}`} /> : n}
            </button>
          );
        })}
      </div>
      {labels && (
        <div className="row-between t-small subtle" style={{ marginTop: 4 }}>
          <span>{labels.low}</span>
          <span>{labels.high}</span>
        </div>
      )}
    </QuestionShell>
  );
}

function choiceKey(i: number) {
  return String.fromCharCode(65 + i);
}

export function SingleChoice({
  value,
  onChange,
  prompt,
  help,
  options,
}: {
  value: string | null;
  onChange: (v: string) => void;
  prompt: string;
  help?: string;
  options: string[];
}) {
  const jelly = useJelly(value);
  return (
    <QuestionShell prompt={prompt} help={help}>
      <div className={`stack stack-sm ${jelly.className}`} role="radiogroup" aria-label={prompt} onAnimationEnd={jelly.onAnimationEnd}>
        {options.map((opt, i) => {
          const on = value === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={on}
              className="choice-card"
              tabIndex={on || (value === null && i === 0) ? 0 : -1}
              onClick={() => onChange(opt)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                  e.preventDefault();
                  onChange(options[Math.min(options.length - 1, i + 1)]);
                } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  onChange(options[Math.max(0, i - 1)]);
                }
              }}
            >
              <span className="choice-key" aria-hidden="true">
                {on ? <Icon name="check" size={14} strokeWidth={2.6} /> : choiceKey(i)}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );
}

export function MultiChoice({
  value,
  onChange,
  prompt,
  help,
  options,
  max,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  prompt: string;
  help?: string;
  options: string[];
  max?: number;
}) {
  const full = max !== undefined && value.length >= max;
  return (
    <QuestionShell
      prompt={prompt}
      help={help}
      counter={
        max !== undefined ? (
          <p className="t-small" style={{ color: full ? "var(--lv-muted)" : "var(--lv-subtle)" }} role="status">
            {value.length} of {max} selected
            {full ? " — deselect one to choose another" : ""}
          </p>
        ) : undefined
      }
    >
      <div className="stack stack-sm" role="group" aria-label={prompt}>
        {options.map((opt, i) => {
          const on = value.includes(opt);
          const disabled = !on && full;
          return (
            <button
              key={opt}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={disabled || undefined}
              className="choice-card"
              style={disabled ? { opacity: 0.5 } : undefined}
              onClick={() => {
                if (disabled) return;
                onChange(on ? value.filter((v) => v !== opt) : [...value, opt]);
              }}
            >
              <span className="choice-key" aria-hidden="true">
                {on ? <Icon name="check" size={14} strokeWidth={2.6} /> : choiceKey(i)}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );
}

export function YesNo({
  value,
  onChange,
  prompt,
  help,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  prompt: string;
  help?: string;
}) {
  const jelly = useJelly(value);
  return (
    <QuestionShell prompt={prompt} help={help}>
      <div className={`row ${jelly.className}`} role="radiogroup" aria-label={prompt} onAnimationEnd={jelly.onAnimationEnd} style={{ gap: 12 }}>
        {[
          { key: "yes", label: "Yes", val: true },
          { key: "no", label: "No", val: false },
        ].map((o, i) => {
          const on = value === o.val;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              className="choice-card grow"
              style={{ minWidth: 140, justifyContent: "center" }}
              tabIndex={on || (value === null && i === 0) ? 0 : -1}
              onClick={() => onChange(o.val)}
            >
              <span>{o.label}</span>
              {on && <Icon name="check" size={16} strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );
}

export function OpenText({
  value,
  onChange,
  prompt,
  help,
  max = 280,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  prompt: string;
  help?: string;
  max?: number;
  suggestions?: string[];
}) {
  return (
    <QuestionShell prompt={prompt} help={help} counter={<p className="t-small subtle mono">{value.length}/{max}</p>}>
      <Textarea
        value={value}
        maxLength={max}
        aria-label={prompt}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder="Type your answer"
        style={{ minHeight: 140 }}
      />
      {suggestions && suggestions.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          <span className="t-label muted">Or pick a start</span>
          {suggestions.map((s) => (
            <Button key={s} size="sm" variant="quiet" onClick={() => onChange(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </QuestionShell>
  );
}

/* ------------------------------------------------------------ future modes */
/* Built but not routed to: the spec keeps NPS, slider questions and ranking
   behind a contract that does not exist yet. */

export function NpsQuestion({
  value,
  onChange,
  prompt,
}: {
  value: number | null;
  onChange: (v: number) => void;
  prompt: string;
}) {
  return (
    <QuestionShell prompt={prompt} help="How likely are you to recommend this Hub?">
      <div className="row" role="radiogroup" aria-label={prompt} style={{ gap: 4, flexWrap: "wrap" }}>
        {Array.from({ length: 11 }).map((_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={String(n)}
            className="rating-dot"
            style={{ width: 44, height: 44, fontSize: 14 }}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="row-between t-small subtle">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </QuestionShell>
  );
}

export function SliderQuestion({
  value,
  onChange,
  prompt,
  min = 0,
  max = 10,
  labels,
}: {
  value: number;
  onChange: (v: number) => void;
  prompt: string;
  min?: number;
  max?: number;
  labels?: { low: string; high: string };
}) {
  return (
    <QuestionShell prompt={prompt}>
      <div className="stack stack-sm">
        <div className="row-between">
          <span className="t-small subtle">{labels?.low ?? min}</span>
          <output className="mono t-title">{value}</output>
          <span className="t-small subtle">{labels?.high ?? max}</span>
        </div>
        <input
          className="slider"
          type="range"
          min={min}
          max={max}
          value={value}
          aria-label={prompt}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </QuestionShell>
  );
}

export function Ranking({
  items,
  order,
  onChange,
  prompt,
}: {
  items: string[];
  order: string[];
  onChange: (v: string[]) => void;
  prompt: string;
}) {
  const move = (from: number, dir: number) => {
    const next = [...order];
    const to = from + dir;
    if (to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };
  return (
    <QuestionShell prompt={prompt} help="Use the arrows to reorder. The first item is your top pick.">
      <ol className="stack stack-sm">
        {order.map((item, i) => (
          <li key={item} className="s-raised row" style={{ padding: 12, borderRadius: "var(--lv-radius-field)", gap: 12 }}>
            <span className="choice-key" aria-hidden="true">
              {i + 1}
            </span>
            <span className="grow">{items.find((x) => x === item) ?? item}</span>
            <IconToggleGroup
              label={`Move ${item}`}
              items={[
                { key: "up", icon: "chevron-left", label: `Move ${item} up` },
                { key: "down", icon: "chevron-right", label: `Move ${item} down` },
              ]}
              value={[]}
              onChange={(v) => {
                const key = v[v.length - 1];
                if (key === "up") move(i, -1);
                if (key === "down") move(i, 1);
              }}
            />
          </li>
        ))}
      </ol>
    </QuestionShell>
  );
}

/** Renders one stored question through the right control. */
export function AnswerControl({
  kind,
  prompt,
  config,
  value,
  onChange,
}: {
  kind: string;
  prompt: string;
  config: { options?: string[] } & Record<string, unknown>;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
}) {
  const options = config.options ?? ["Option one", "Option two", "Option three"];
  switch (kind) {
    case "rating":
      return <Rating prompt={prompt} value={(value as number) ?? null} onChange={onChange} />;
    case "single_choice":
      return <SingleChoice prompt={prompt} options={options} value={(value as string) ?? null} onChange={onChange} />;
    case "multi_choice":
      return (
        <MultiChoice
          prompt={prompt}
          options={options}
          value={Array.isArray(value) ? value : []}
          max={typeof config.max === "number" ? config.max : undefined}
          onChange={onChange}
        />
      );
    case "yes_no":
      return <YesNo prompt={prompt} value={value === true ? true : value === false ? false : null} onChange={onChange} />;
    case "text":
    default:
      return (
        <OpenText
          prompt={prompt}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          max={typeof config.max === "number" ? config.max : 280}
          suggestions={Array.isArray(config.suggestions) ? (config.suggestions as string[]) : undefined}
        />
      );
  }
}

export function EmptyAnswerNote() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <button type="button" className="notice notice-info" onClick={() => setDismissed(true)} style={{ textAlign: "left", cursor: "pointer" }}>
      <Icon name="info" size={16} />
      <span className="t-small">Answers are never required. Skip anything you don't want to answer.</span>
    </button>
  );
}
