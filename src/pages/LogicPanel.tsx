import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { LogicCondition, LogicJump, LogicRule, Question } from "../lib/lvApi";
import { allowsJumps, answerKeys, describeLogicRule, isRatingKind, keyLabel, numbering, ratingRange } from "../lib/logic";
import { Icon } from "../components/Icon";
import type { SaveTracker } from "./QuestionWorkbench";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Eyebrow, Notice } from "@/components/shadcn/blocks";

/**
 * Linked Questions (000042): "Show only if" rules on one question (ALL/ANY of conditions on EARLIER questions) and
 * "End survey" on a choice or yes/no answer. The server enforces the plan (survey.branching) and every rule; this panel
 * explains them and saves into the question's settings next to the 000041 section.
 */
type Draft = { match: "all" | "any"; conditions: Partial<LogicCondition>[] };
const complete = (c: Partial<LogicCondition>) =>
  !!c.question_id && !!c.op && (c.op === "any_of" || c.op === "none_of" ? (c.values?.length ?? 0) > 0
    : c.op === "at_least" ? typeof c.min === "number" : c.op === "at_most" ? typeof c.max === "number" : typeof c.min === "number" && typeof c.max === "number" && c.min <= c.max);

export function LogicPanel({ q, qs, locked, allowed, save, reload }: {
  q: Question; qs: Question[]; locked: boolean; allowed: boolean; save: SaveTracker; reload: () => void;
}) {
  const { api } = useIdentity();
  const num = numbering(qs);
  const sources = qs.filter((x) => x.position < q.position && (answerKeys(x) !== null || isRatingKind(x.kind)));
  const rule = q.config.show_if ?? null;
  const [draft, setDraft] = useState<Draft | null>(rule ? { match: rule.match, conditions: rule.conditions } : null);
  const timer = useRef<number | null>(null);
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => { setDraft(q.config.show_if ? { match: q.config.show_if.match, conditions: q.config.show_if.conditions } : null); }, [q.question_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  async function persist(patch: { show_if?: LogicRule | null; jumps?: LogicJump[] }) {
    const { show_if: _s, jumps: _j, ...rest } = q.config;
    const next = { ...rest, ...("show_if" in patch ? (patch.show_if ? { show_if: patch.show_if } : {}) : (q.config.show_if ? { show_if: q.config.show_if } : {})),
                   ...("jumps" in patch ? (patch.jumps?.length ? { jumps: patch.jumps } : {}) : (q.config.jumps?.length ? { jumps: q.config.jumps } : {})) };
    const r = await save.run(api.questionUpdate(q.question_id, { config: next }));
    if (!r.ok) toast.error(describeError(r.error));
    else reload();
  }
  function change(next: Draft | null, delay = 500) {
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const cur = latest.current;
      if (!cur) void persist({ show_if: null });
      else if (cur.conditions.length > 0 && cur.conditions.every(complete)) void persist({ show_if: { match: cur.match, conditions: cur.conditions as LogicCondition[] } });
    }, delay);
  }
  const setCond = (i: number, c: Partial<LogicCondition>, delay = 500) => draft && change({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? c : x)) }, delay);

  const jumpsOk = allowsJumps(q.kind);
  const keys = answerKeys(q) ?? [];
  const ends = new Set((q.config.jumps ?? []).filter((j) => j.to === "end").map((j) => j.when));
  const toggleEnd = (k: string, on: boolean) => {
    const rest = (q.config.jumps ?? []).filter((j) => j.when !== k);
    void persist({ jumps: on ? [...rest, { when: k, to: "end" }] : rest });
  };

  if (!allowed) {
    if (locked || sources.length === 0 && !jumpsOk) return null;
    return (
      <Card data-testid="logic-panel">
        <div className="ui-spread">
          <Eyebrow>Logic</Eyebrow>
          <Badge variant="outline"><Icon name="lock" size={12} />Creator Plus or Starter Hub</Badge>
        </div>
        <p className="ui-muted lv-m0" data-testid="logic-locked">
          “Show only if” rules and ending the survey on an answer let one survey ask different people different questions. They come with Creator Plus or a Starter Hub. <Link to="/pricing" className="lv-inline-link">See plans</Link>
        </p>
      </Card>
    );
  }
  if (locked && !rule && ends.size === 0) return null;

  return (
    <Card data-testid="logic-panel">
      <div className="ui-spread">
        <Eyebrow accent>Logic</Eyebrow>
        {rule && <Badge variant="accent">Conditional</Badge>}
      </div>

      <fieldset className="lv-fieldset" data-testid="logic-showif">
        <legend className="lv-legend">Show only if…</legend>
        {!draft ? (
          <>
            <p className="ui-muted lv-m0" data-testid="logic-hint">
              {sources.length
                ? "Everyone who reaches this question sees it. Add a rule to show it only when an earlier answer matches."
                : qs.some((x) => x.position < q.position)
                  ? "Rules can only depend on an earlier choice, yes/no or rating question. Add one above this question, or move this question below one."
                  : "This is the first question, so there is nothing earlier to depend on. Open a later question to add a rule, for example: show it only if this question’s answer is “Staff hub”."}
            </p>
            {!locked && sources.length > 0 && (
              <div className="ui-row">
                <Button variant="secondary" data-testid="logic-add" onClick={() => change({ match: "all", conditions: [{}] }, 0)}><Icon name="plus" size={16} />Show only if…</Button>
              </div>
            )}
          </>
        ) : (
          <>
            {draft.conditions.length > 1 && (
              <Select value={draft.match} disabled={locked} onValueChange={(v) => change({ ...draft, match: v as "all" | "any" }, 0)}>
                <SelectTrigger aria-label="How the conditions combine" data-testid="logic-match"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All of these are true</SelectItem>
                  <SelectItem value="any">Any of these is true</SelectItem>
                </SelectContent>
              </Select>
            )}
            {draft.conditions.map((c, i) => {
              const src = sources.find((x) => x.question_id === c.question_id);
              const choice = src ? answerKeys(src) : null;
              const ops = src ? (isRatingKind(src.kind) ? [["at_least", "is at least"], ["at_most", "is at most"], ["between", "is between"]] : src.kind === "yes_no" ? [["any_of", "is"]] : [["any_of", "is any of"], ["none_of", "is none of"]]) : [];
              const [lo, hi] = src ? ratingRange(src) : [1, 5];
              return (
                <div key={i} className="lv-logic-cond" data-testid="logic-cond">
                  <Select value={c.question_id ?? ""} disabled={locked} onValueChange={(v) => { const s2 = sources.find((x) => x.question_id === v)!; setCond(i, { question_id: v, op: isRatingKind(s2.kind) ? "at_least" : "any_of" }, 0); }}>
                    <SelectTrigger aria-label={`Condition ${i + 1}: question`}><SelectValue placeholder="Pick an earlier question" /></SelectTrigger>
                    <SelectContent>{sources.map((x) => <SelectItem key={x.question_id} value={x.question_id}>Q{num.get(x.question_id)} · {x.prompt}</SelectItem>)}</SelectContent>
                  </Select>
                  {src && (
                    <Select value={c.op ?? ""} disabled={locked} onValueChange={(v) => setCond(i, { question_id: c.question_id, op: v as LogicCondition["op"] }, 0)}>
                      <SelectTrigger aria-label={`Condition ${i + 1}: comparison`}><SelectValue /></SelectTrigger>
                      <SelectContent>{ops.map(([v, l]) => <SelectItem key={v} value={v!}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {src && choice && (
                    <div className="lv-rule-options" role="group" aria-label={`Answers to Q${num.get(src.question_id)}`}>
                      {choice.map((o) => (
                        <Label key={o} className="lv-inline-label">
                          <Checkbox checked={c.values?.includes(o) ?? false} disabled={locked}
                            onCheckedChange={(on) => setCond(i, { ...c, values: on ? [...(c.values ?? []), o] : (c.values ?? []).filter((x) => x !== o) }, 300)} />
                          {keyLabel(src, o)}
                        </Label>
                      ))}
                    </div>
                  )}
                  {src && isRatingKind(src.kind) && (
                    <div className="ui-row">
                      {c.op !== "at_most" && <Input type="number" inputMode="numeric" min={lo} max={hi} value={c.min ?? ""} disabled={locked} aria-label={c.op === "between" ? "From rating" : "Rating"} onChange={(e) => setCond(i, { ...c, min: e.target.value === "" ? undefined : Number(e.target.value) })} />}
                      {c.op === "between" && <span className="ui-muted">to</span>}
                      {c.op !== "at_least" && <Input type="number" inputMode="numeric" min={lo} max={hi} value={c.max ?? ""} disabled={locked} aria-label={c.op === "between" ? "To rating" : "Rating"} onChange={(e) => setCond(i, { ...c, max: e.target.value === "" ? undefined : Number(e.target.value) })} />}
                    </div>
                  )}
                  {!locked && <Button variant="quiet" aria-label={`Remove condition ${i + 1}`} onClick={() => change(draft.conditions.length === 1 ? null : { ...draft, conditions: draft.conditions.filter((_, j) => j !== i) }, 0)}>Remove</Button>}
                  {!complete(c) && <p className="lv-field-error lv-m0" role="status">Finish this condition to save it.</p>}
                </div>
              );
            })}
            {!locked && draft.conditions.length < 10 && sources.length > 0 && (
              <div className="ui-row"><Button variant="quiet" data-testid="logic-add-cond" onClick={() => change({ ...draft, conditions: [...draft.conditions, {}] }, 0)}><Icon name="plus" size={16} />Add a condition</Button></div>
            )}
            {draft.conditions.every(complete) && draft.conditions.length > 0 && <p className="ui-help lv-m0" data-testid="logic-summary">{describeLogicRule({ match: draft.match, conditions: draft.conditions as LogicCondition[] }, qs)}. Everyone else skips it.</p>}
          </>
        )}
      </fieldset>

      {jumpsOk && (
        <fieldset className="lv-fieldset" data-testid="logic-end">
          <legend className="lv-legend">End the survey</legend>
          <p className="ui-help lv-m0">People who pick one of these answers finish the survey here.</p>
          <div className="lv-rule-options" role="group" aria-label="Answers that end the survey">
            {keys.map((k) => (
              <Label key={k} className="lv-inline-label">
                <Checkbox checked={ends.has(k)} disabled={locked} onCheckedChange={(on) => toggleEnd(k, Boolean(on))} />
                {keyLabel(q, k)}
              </Label>
            ))}
          </div>
        </fieldset>
      )}
      {draft && <Notice tone="info">On an anonymous survey, results for a question that only some people see stay withheld until at least 5 people have answered it.</Notice>}
    </Card>
  );
}
