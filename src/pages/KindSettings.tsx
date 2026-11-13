import { useState } from "react";
import { Input } from "@/components/shadcn/input";
import { Switch } from "@/components/shadcn/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Field, Notice, ToggleRow } from "@/components/shadcn/blocks";
import { FILE_MAX_MB, isIsoDate, type AnyKind } from "../lib/questionKinds";

/**
 * The settings editor for each v2 question type (000047). It edits one plain object (`cfg`) that the workbench merges
 * into the question's settings; the same rules the server enforces (questionKinds.kindConfigProblem) show as soon as a
 * value is wrong, and nothing saves until the settings are valid.
 */

type Cfg = Record<string, unknown>;
interface Props { kind: AnyKind; n: number; cfg: Cfg; set: (next: Cfg) => void; locked: boolean }

const numOrUndef = (t: string) => (t.trim() === "" || !Number.isFinite(Number(t)) ? undefined : Number(t));
const clean = (c: Cfg): Cfg => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== ""));

export function KindSettings({ kind, n, cfg, set, locked }: Props) {
  const patch = (p: Cfg) => set(clean({ ...cfg, ...p }));
  const id = (k: string) => `ks-${n}-${k}`;
  const num = (k: string, label: string, help?: string, step: string | number = "any") => (
    <Field label={label} htmlFor={id(k)} help={help}>
      <Input id={id(k)} type="number" inputMode="decimal" step={step} disabled={locked} value={typeof cfg[k] === "number" ? String(cfg[k]) : ""} onChange={(e) => patch({ [k]: numOrUndef(e.target.value) })} />
    </Field>
  );
  const txt = (k: string, label: string, max: number, placeholder?: string) => (
    <Field label={label} htmlFor={id(k)}>
      <Input id={id(k)} maxLength={max} disabled={locked} placeholder={placeholder} value={typeof cfg[k] === "string" ? (cfg[k] as string) : ""} onChange={(e) => patch({ [k]: e.target.value })} />
    </Field>
  );
  const points = (
    <Field label="Scale points" htmlFor={id("points")}>
      <Select value={String(cfg.points === 7 ? 7 : 5)} onValueChange={(v) => patch({ points: Number(v), labels: undefined })} disabled={locked}>
        <SelectTrigger id={id("points")}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="5">5 points</SelectItem><SelectItem value="7">7 points</SelectItem></SelectContent>
      </Select>
    </Field>
  );

  switch (kind) {
    case "number":
      return (
        <div className="lv-kc-settings">
          {num("min", "Lowest allowed")}
          {num("max", "Highest allowed")}
          {txt("unit", "Unit shown next to the number (optional)", 20, "for example: years")}
          <ToggleRow title="Whole numbers only" description="Refuse decimals." control={<Switch checked={cfg.integer === true} disabled={locked} aria-label="Whole numbers only" onCheckedChange={(on) => patch({ integer: on || undefined })} />} />
        </div>
      );
    case "date":
      return (
        <div className="lv-kc-settings">
          <DateField id={id("min")} label="Earliest date (optional)" value={cfg.min} locked={locked} onChange={(v) => patch({ min: v })} />
          <DateField id={id("max")} label="Latest date (optional)" value={cfg.max} locked={locked} onChange={(v) => patch({ max: v })} />
        </div>
      );
    case "nps":
      return (
        <div className="lv-kc-settings">
          {txt("low_label", "Label for 0 (optional)", 60, "Not at all likely")}
          {txt("high_label", "Label for 10 (optional)", 60, "Extremely likely")}
          <Notice>Results show your NPS score automatically: the share of 9 and 10 answers minus the share of 0 to 6. It appears once enough people have answered.</Notice>
        </div>
      );
    case "agree_scale":
      return <div className="lv-kc-settings">{points}<Labels cfg={cfg} patch={patch} locked={locked} n={n} /></div>;
    case "agree_grid":
      return (
        <div className="lv-kc-settings">
          <Lines label="Statements" help="One per line, 2 to 10." id={id("rows")} value={cfg.rows} locked={locked} onChange={(rows) => patch({ rows })} />
          {points}
          <Labels cfg={cfg} patch={patch} locked={locked} n={n} />
        </div>
      );
    case "before_after":
      return (
        <div className="lv-kc-settings">
          {points}
          {txt("before_label", "First scale is called", 40, "Before")}
          {txt("after_label", "Second scale is called", 40, "Now")}
        </div>
      );
    case "slider":
      return (
        <div className="lv-kc-settings">
          {num("min", "Start")}{num("max", "End")}{num("step", "Step", "The range must divide evenly, with at most 1000 steps.")}
          {txt("min_label", "Label at the start (optional)", 40)}
          {txt("max_label", "Label at the end (optional)", 40)}
        </div>
      );
    case "contact":
      return (
        <div className="lv-kc-settings">
          <Checks label="Ask for" id={id("fields")} options={[["name", "Name"], ["email", "Email"], ["phone", "Phone"]]} value={cfg.fields} locked={locked} onChange={(fields) => patch({ fields })} />
          <Notice tone="info">Only on identified surveys: the creator sees who answered.</Notice>
        </div>
      );
    case "file_upload":
      return (
        <div className="lv-kc-settings">
          <Field label="Largest file (MB)" htmlFor={id("max_mb")} help={`1 to ${FILE_MAX_MB}.`}>
            <Input id={id("max_mb")} type="number" min={1} max={FILE_MAX_MB} step={1} disabled={locked} value={typeof cfg.max_mb === "number" ? String(cfg.max_mb) : ""} onChange={(e) => patch({ max_mb: numOrUndef(e.target.value) })} />
          </Field>
          <Checks label="Allowed files" id={id("types")} options={[["image", "Images"], ["pdf", "PDF"], ["doc", "Documents (Word, text)"]]} value={cfg.types} locked={locked} onChange={(types) => patch({ types })} />
          <Notice tone="info">Only on identified surveys, for signed-in people. Files are private: only people who manage this survey can open them.</Notice>
        </div>
      );
    case "consent":
      return (
        <div className="lv-kc-settings">
          <Field label="What people agree to" htmlFor={id("statement")} counter={{ value: String(cfg.statement ?? "").length, max: 1000 }}>
            <textarea id={id("statement")} className="lv-textarea lv-kc-statement" rows={3} maxLength={1000} disabled={locked} value={typeof cfg.statement === "string" ? cfg.statement : ""} onChange={(e) => patch({ statement: e.target.value })} />
          </Field>
          <Notice tone="info">Only on identified surveys. We record that the person agreed, with their name and the time.</Notice>
        </div>
      );
    case "signature":
      return <div className="lv-kc-settings"><Notice tone="info">People sign by typing their full name. Only on identified surveys.</Notice></div>;
    case "price_ladder":
      return (
        <div className="lv-kc-settings">
          <PriceList id={id("prices")} value={cfg.prices} locked={locked} onChange={(prices) => patch({ prices })} />
          {txt("currency", "Currency code", 3, "USD")}
        </div>
      );
    case "image_choice":
      return (
        <div className="lv-kc-settings">
          <Lines label="Picture addresses (optional)" help="One https:// address per option, in the same order. Leave empty to use words only." id={id("images")} value={cfg.images} locked={locked} onChange={(images) => patch({ images: images.length ? images : undefined })} />
        </div>
      );
    default:
      return null;
  }
}

function DateField({ id, label, value, onChange, locked }: { id: string; label: string; value: unknown; onChange: (v: string | undefined) => void; locked: boolean }) {
  return (
    <Field label={label} htmlFor={id} error={typeof value === "string" && !isIsoDate(value) ? "Dates are written YYYY-MM-DD." : undefined}>
      <Input id={id} type="date" disabled={locked} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)} />
    </Field>
  );
}

function Labels({ cfg, patch, locked, n }: { cfg: Cfg; patch: (p: Cfg) => void; locked: boolean; n: number }) {
  const p = cfg.points === 7 ? 7 : 5;
  const custom = Array.isArray(cfg.labels);
  const labels = (custom ? (cfg.labels as string[]) : []).slice(0, p);
  return (
    <>
      <ToggleRow
        title="Custom labels"
        description={custom ? `Name all ${p} points.` : "Using Strongly disagree to Strongly agree."}
        control={<Switch checked={custom} disabled={locked} aria-label="Custom labels" onCheckedChange={(on) => patch({ labels: on ? Array.from({ length: p }, (_, i) => labels[i] ?? "") : undefined })} />}
      />
      {custom && Array.from({ length: p }, (_, i) => (
        <Input key={i} aria-label={`Label for point ${i + 1}`} maxLength={40} disabled={locked} value={labels[i] ?? ""} placeholder={`Point ${i + 1}`}
          onChange={(e) => patch({ labels: Array.from({ length: p }, (_, j) => (j === i ? e.target.value : labels[j] ?? "")) })} data-testid={`kind-label-${n}-${i}`} />
      ))}
    </>
  );
}

/** One entry per line. Empty lines stay while typing and are dropped when saved. */
function Lines({ label, help, id, value, onChange, locked }: { label: string; help?: string; id: string; value: unknown; onChange: (v: string[]) => void; locked: boolean }) {
  const [text, setText] = useState(Array.isArray(value) ? (value as string[]).join("\n") : "");
  return (
    <Field label={label} htmlFor={id} help={help}>
      <textarea id={id} className="lv-textarea lv-kc-statement" rows={4} disabled={locked} value={text}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)); }} />
    </Field>
  );
}

function PriceList({ id, value, onChange, locked }: { id: string; value: unknown; onChange: (v: number[]) => void; locked: boolean }) {
  const [text, setText] = useState(Array.isArray(value) ? (value as number[]).join(", ") : "");
  return (
    <Field label="Prices, lowest first" htmlFor={id} help="Separate with commas, 2 to 10 prices.">
      <Input id={id} inputMode="decimal" disabled={locked} value={text} onChange={(e) => { setText(e.target.value); onChange(e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x))); }} />
    </Field>
  );
}

function Checks({ label, id, options, value, onChange, locked }: { label: string; id: string; options: [string, string][]; value: unknown; onChange: (v: string[]) => void; locked: boolean }) {
  const on = Array.isArray(value) ? (value as string[]) : [];
  return (
    <fieldset className="lv-fieldset" id={id}>
      <legend className="lv-legend">{label}</legend>
      <div className="lv-kc-checks">
        {options.map(([k, l]) => (
          <label key={k} className="lv-kc-check">
            <input type="checkbox" checked={on.includes(k)} disabled={locked} onChange={(e) => onChange(e.target.checked ? [...on, k] : on.filter((x) => x !== k))} />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Quiz scoring on a choice question (Pro). `options` are the filled option texts. */
export function QuizSettings({ kind, options, cfg, set, locked, allowed, n }: { kind: "single_choice" | "multi_choice"; options: string[]; cfg: Cfg; set: (next: Cfg) => void; locked: boolean; allowed: boolean; n: number }) {
  const quiz = (cfg.quiz && typeof cfg.quiz === "object" ? cfg.quiz : null) as { correct?: string[]; points?: number } | null;
  const correct = quiz?.correct ?? [];
  const enable = (on: boolean) => set(clean({ ...cfg, quiz: on ? { correct: [], points: 1 } : null })); // null clears the key on the server; undefined leaves it alone
  const toggle = (o: string) => {
    const next = kind === "single_choice" ? [o] : correct.includes(o) ? correct.filter((x) => x !== o) : [...correct, o];
    set({ ...cfg, quiz: { ...quiz, correct: next } });
  };
  return (
    <div className="lv-kc-settings" data-testid="quiz-settings">
      <ToggleRow
        title="Score this as a quiz question"
        description={allowed ? "Mark the right answer and set the points. Results show the score." : "Quiz scoring is included with Creator Pro or a Team Hub."}
        control={<Switch checked={Boolean(quiz)} disabled={locked || (!allowed && !quiz)} aria-label="Score this as a quiz question" onCheckedChange={enable} />}
      />
      {quiz && (
        <>
          <fieldset className="lv-fieldset">
            <legend className="lv-legend">{kind === "single_choice" ? "Right answer" : "Right answers"}</legend>
            <div className="lv-kc-checks">
              {options.map((o) => (
                <label key={o} className="lv-kc-check">
                  <input type={kind === "single_choice" ? "radio" : "checkbox"} name={`quiz-${n}`} checked={correct.includes(o)} disabled={locked} onChange={() => toggle(o)} />
                  {o}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Points for a right answer" htmlFor={`quiz-pts-${n}`}>
            <Input id={`quiz-pts-${n}`} type="number" min={1} max={100} step={1} disabled={locked} value={String(quiz.points ?? 1)} onChange={(e) => set({ ...cfg, quiz: { ...quiz, points: numOrUndef(e.target.value) ?? 1 } })} />
          </Field>
        </>
      )}
    </div>
  );
}
