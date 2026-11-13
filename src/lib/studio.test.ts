import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateConfig, duplicatePrompt, moveTargets, moveToSectionTarget } from "./studio.ts";
import type { Question } from "./lvApi.ts";

const q = (i: number, section?: string): Question => ({ question_id: `q${i}`, position: i, kind: "yes_no", prompt: `Q${i}`, config: section ? { section: { title: section } } : {} });
const qs = [q(1), q(2), q(3, "Second"), q(4), q(5, "Third"), q(6)];

test("moving down into a later section lands at the end of that section", () => {
  assert.equal(moveToSectionTarget(qs, 0, 1), 3);
  assert.equal(moveToSectionTarget(qs, 0, 2), 5);
});
test("moving up into an earlier section lands after its last question", () => {
  assert.equal(moveToSectionTarget(qs, 3, 0), 2);
  assert.equal(moveToSectionTarget(qs, 5, 1), 4);
});
test("no move when already last in the section, or for a section-start question", () => {
  assert.equal(moveToSectionTarget(qs, 1, 0), null);
  assert.equal(moveToSectionTarget(qs, 2, 0), null);
  assert.deepEqual(moveTargets(qs, 2), []);
});
test("targets list the other sections by title", () => {
  assert.deepEqual(moveTargets(qs, 0).map((t) => [t.title, t.to]), [["Start", 1], ["Second", 3], ["Third", 5]]);
});
test("a duplicate keeps the question but not its position in sections or rules", () => {
  const cfg = duplicateConfig({ config: { options: ["a", "b"], optional: true, section: { title: "S" }, show_if: { match: "all", conditions: [] }, jumps: [{ when: "a", to: "end" }] } });
  assert.deepEqual(cfg, { options: ["a", "b"], optional: true });
  assert.equal(duplicatePrompt("Hi"), "Hi (copy)");
  assert.ok(duplicatePrompt("x".repeat(200)).length <= 200);
});
