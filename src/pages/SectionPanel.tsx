import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { Question, SectionConfig } from "../lib/lvApi";
import { describeRule } from "../lib/sections";
import { Icon } from "../components/Icon";
import type { SaveTracker } from "./QuestionWorkbench";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Eyebrow, Field, Notice } from "@/components/shadcn/blocks";

/**
 * Sections and "show only if" (000041). A section starts at a question and runs to the next section start. Its rule
 * looks back at one earlier choice or yes/no question. The server enforces the plan (survey.branching) and the rules;
 * this panel explains them and saves into the question's settings.
 */
export function SectionPanel({ q, n, qs, locked, allowed, save, reload }: {
  q: Question;
  n: number;
  qs: Question[];
  locked: boolean;
  allowed: boolean;
  save: SaveTracker;
  reload: () => void;
}) {
  const { api } = useIdentity();
  const s = q.config.section ?? null;
  const [draft, setDraft] = useState<SectionConfig | null>(s);
  const timer = useRef<number | null>(null);
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => { setDraft(q.config.section ?? null); }, [q.question_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rules can only look back, at questions people pick an answer for.
  const sources = qs.filter((x) => x.position < q.position && ["single_choice", "multi_choice", "yes_no"].includes(x.kind));

  async function persist(next: SectionConfig | null) {
    const { section: _old, ...rest } = q.config;
    const r = await save.run(api.questionUpdate(q.question_id, { config: next ? { ...rest, section: next } : rest }));
    if (!r.ok) toast.error(describeError(r.error));
    else reload();
  }
  function change(next: SectionConfig | null, delay = 600) {
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null;
      const cur = latest.current;
      // Saved once complete: a title, and a rule with at least one ticked answer (the server refuses less).
      if (!cur || (cur.title.trim() && (!cur.show_if || cur.show_if.any_of.length > 0))) void persist(cur);
    }, delay);
  }
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  if (!draft) {
    if (locked || n === 1) return null;
    return (
      <Card data-testid="section-panel">
        <div className="ui-spread">
          <Eyebrow>Section</Eyebrow>
          {!allowed && <Badge variant="outline"><Icon name="lock" size={12} />Creator Plus or Starter Hub</Badge>}
        </div>
        {allowed ? (
          <>
            <p className="ui-muted lv-m0">Start a new section at this question. Give it a title, and show it only to people whose earlier answer matches, for example only to managers.</p>
            <div className="ui-row">
              <Button variant="secondary" onClick={() => change({ title: "New section" }, 0)} data-testid="section-start"><Icon name="plus" size={16} />Start a section here</Button>
            </div>
          </>
        ) : (
          <p className="ui-muted lv-m0" data-testid="section-locked">
            Sections and “show only if” rules let one survey ask staff and managers different questions. They come with Creator Plus or a Starter Hub. <Link to="/pricing" className="lv-inline-link">See plans</Link>
          </p>
        )}
      </Card>
    );
  }

  const rule = draft.show_if ?? null;
  const source = rule ? qs.find((x) => x.question_id === rule.question_id) : undefined;
  const options = source ? (source.kind === "yes_no" ? ["true", "false"] : (source.config.options ?? [])) : [];
  const label = (o: string) => (source?.kind === "yes_no" ? (o === "true" ? "Yes" : "No") : o);

  return (
    <Card data-testid="section-panel">
      <div className="ui-spread">
        <Eyebrow accent>Section starts here</Eyebrow>
        {rule && <Badge variant="accent">Conditional</Badge>}
      </div>
      <Field label="Section title" htmlFor={`sec-title-${n}`} counter={{ value: draft.title.length, max: 120 }} error={!draft.title.trim() ? "A section needs a title." : undefined}>
        <Input id={`sec-title-${n}`} value={draft.title} maxLength={120} disabled={locked} onChange={(e) => change({ ...draft, title: e.target.value })} />
      </Field>
      <Field label="Shown under the title (optional)" htmlFor={`sec-desc-${n}`} counter={{ value: (draft.description ?? "").length, max: 500 }}>
        <Textarea id={`sec-desc-${n}`} value={draft.description ?? ""} maxLength={500} rows={2} disabled={locked} onChange={(e) => change({ ...draft, description: e.target.value || null })} />
      </Field>

      <fieldset className="lv-fieldset" data-testid="section-rule">
        <legend className="lv-legend">Who sees this section</legend>
        <Select
          value={rule ? rule.question_id : "everyone"}
          disabled={locked || (!allowed && !rule)}
          onValueChange={(v) => change({ ...draft, show_if: v === "everyone" ? null : { question_id: v, any_of: [] } }, 0)}
        >
          <SelectTrigger aria-label="Who sees this section"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">Everyone</SelectItem>
            {sources.map((x) => <SelectItem key={x.question_id} value={x.question_id}>Only if “{x.prompt}” is…</SelectItem>)}
          </SelectContent>
        </Select>
        {sources.length === 0 && !rule && <p className="ui-help lv-m0">Add a choice or yes/no question before this one to show it only to some people.</p>}
        {rule && source && (
          <div className="lv-rule-options" role="group" aria-label={`Answers to “${source.prompt}” that show this section`}>
            {options.map((o) => (
              <Label key={o} className="lv-inline-label">
                <Checkbox
                  checked={rule.any_of.includes(o)}
                  disabled={locked}
                  onCheckedChange={(on) => change({ ...draft, show_if: { ...rule, any_of: on ? [...rule.any_of, o] : rule.any_of.filter((x) => x !== o) } }, 300)}
                />
                {label(o)}
              </Label>
            ))}
          </div>
        )}
        {rule && rule.any_of.length > 0 && <p className="ui-help lv-m0" data-testid="section-rule-summary">{describeRule(rule, qs)}. Everyone else skips it.</p>}
        {rule && rule.any_of.length === 0 && <p className="lv-field-error lv-m0" role="status">Tick at least one answer.</p>}
      </fieldset>
      {rule && <Notice tone="info">On an anonymous survey, results for this section stay withheld until at least 5 people have answered them.</Notice>}

      {!locked && (
        <div className="ui-row">
          <Button variant="quiet" onClick={() => change(null, 0)} data-testid="section-remove">Remove section break</Button>
        </div>
      )}
    </Card>
  );
}
