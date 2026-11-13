import { Fragment, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { Button } from "@/components/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/shadcn/alert-dialog";
import type { Question, QuestionKind } from "../lib/lvApi";
import { describeRule } from "../lib/sections";
import { describeLogicRule } from "../lib/logic";
import { moveTargets } from "../lib/studio";
import { kindInfo } from "../lib/questionKinds";

/** A small glyph per question type, so the rail reads at a glance. Decorative: the type is also written out. */
export function KindGlyph({ kind, size = 18 }: { kind: QuestionKind | string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  switch (kind) {
    case "rating": return <svg {...common}><path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z" /></svg>;
    case "single_choice": return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;
    case "multi_choice": return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></svg>;
    case "yes_no": return <svg {...common}><path d="m4 12 4 4 6-8" /><path d="M16 8l4 8M20 8l-4 8" /></svg>;
    default: return <svg {...common}><path d="M5 7h14M5 12h14M5 17h9" /></svg>;
  }
}

const KIND_WORD: Record<string, string> = { rating: "Rating", single_choice: "Single choice", multi_choice: "Multiple choice", yes_no: "Yes / No", text: "Text" };
const SHAPES = ["triangle", "circle", "diamond", "square", "hexagon", "star"] as const;

/**
 * An answer tile: a shape AND a colour, never colour alone (so it reads for colour-blind people and in high contrast).
 * Colours come from the existing tokens only. The children are the answer text or its input.
 */
export function AnswerTile({ index, children, selected }: { index: number; children: React.ReactNode; selected?: boolean }) {
  const shape = SHAPES[index % SHAPES.length]!;
  return (
    <div className="lv-ans" data-tone={index % 4} data-shape={shape} data-selected={selected || undefined}>
      <span className="lv-ans-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          {shape === "triangle" && <path d="M12 4 21 20H3z" />}
          {shape === "circle" && <circle cx="12" cy="12" r="8.5" />}
          {shape === "diamond" && <path d="m12 2.5 9.5 9.5-9.5 9.5L2.5 12z" />}
          {shape === "square" && <rect x="4" y="4" width="16" height="16" rx="2" />}
          {shape === "hexagon" && <path d="m12 2.5 8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" />}
          {shape === "star" && <path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2l-5.6 3.1 1.2-6.3L3 9.6l6.3-.8z" />}
        </svg>
      </span>
      <div className="lv-ans-body">{children}</div>
    </div>
  );
}

export interface RailProps {
  qs: Question[];
  sel: string;
  locked: boolean;
  atLimit: boolean;
  limit: number | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (q: Question) => void;
  onDelete: (q: Question) => void;
}

/**
 * The studio's left rail: a thumbnail per question in order, with number, type, section dividers and a "…" menu
 * (Duplicate, Move up/down, Move to section, Delete). Drag to reorder, or focus a thumbnail and press Alt with the
 * arrow keys. On a phone it becomes a strip along the bottom of the canvas.
 */
export function StudioRail({ qs, sel, locked, atLimit, limit, onSelect, onAdd, onMove, onDuplicate, onDelete }: RailProps) {
  const drag = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Question | null>(null);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (locked || !e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); onMove(i, i - 1); }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); onMove(i, i + 1); }
  };
  return (
    <nav className="lv-rail" aria-label="Questions" data-testid="studio-rail">
      <h3 className="lv-qw-h lv-rail-h">Questions · {qs.length}{limit !== null ? ` of ${limit}` : ""}</h3>
      <ol className="lv-rail-list" data-testid="question-outline">
        {qs.map((q, i) => (
          <Fragment key={q.question_id}>
            {q.config.section && (
              <li className="lv-rail-section" data-testid="outline-section">
                <span>{q.config.section.title || "Untitled section"}</span>
                {q.config.section.show_if && <small>{describeRule(q.config.section.show_if, qs)}</small>}
              </li>
            )}
            <li
              className="lv-rail-li"
              data-over={over === i || undefined}
              draggable={!locked}
              onDragStart={(e: DragEvent) => { drag.current = i; e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e: DragEvent) => { if (drag.current !== null) { e.preventDefault(); setOver(i); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e: DragEvent) => { e.preventDefault(); const from = drag.current; drag.current = null; setOver(null); if (from !== null) onMove(from, i); }}
            >
              <button type="button" className="lv-thumb" aria-current={sel === q.question_id ? "true" : undefined} onClick={() => onSelect(q.question_id)} onKeyDown={(e) => onKey(e, i)} data-testid="rail-thumb" aria-label={`Question ${i + 1}: ${q.prompt}. ${KIND_WORD[q.kind] ?? kindInfo(q.kind)?.label ?? q.kind}${q.config.optional ? ", optional" : ""}`}>
                <span className="lv-thumb-n">{i + 1}</span>
                <span className="lv-thumb-text">
                  <span className="lv-thumb-prompt">{q.prompt}</span>
                  <span className="lv-thumb-kind"><KindGlyph kind={q.kind} size={14} />{KIND_WORD[q.kind] ?? kindInfo(q.kind)?.label ?? q.kind}{q.config.show_if ? " · linked" : ""}</span>
                  {q.config.show_if && <span className="lv-thumb-rule" data-testid="outline-rule">{describeLogicRule(q.config.show_if, qs)}</span>}
                </span>
              </button>
              {!locked && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="quiet" size="icon-sm" aria-label={`More for question ${i + 1}`} data-testid="rail-menu"><Icon name="more" size={16} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={atLimit} onSelect={() => onDuplicate(q)}>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === 0} onSelect={() => onMove(i, i - 1)}>Move up</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === qs.length - 1} onSelect={() => onMove(i, i + 1)}>Move down</DropdownMenuItem>
                    {moveTargets(qs, i).length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Move to section</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {moveTargets(qs, i).map((t) => <DropdownMenuItem key={t.index} onSelect={() => onMove(i, t.to)}>{t.title}</DropdownMenuItem>)}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setConfirm(q)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
      {!locked && (
        <button type="button" className="lv-add lv-rail-add" onClick={onAdd} disabled={atLimit} data-testid="add-question">
          <Icon name="plus" size={16} /> {atLimit ? `Limit of ${limit} reached` : "Add question"}
        </button>
      )}
      {!locked && qs.length > 1 && <p className="ui-help lv-m0 lv-rail-help">Drag to reorder, or Alt with the arrow keys.</p>}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>“{confirm?.prompt}” will be removed. It’s a draft, so nobody has answered it yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) onDelete(confirm); setConfirm(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
