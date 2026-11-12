import test from "node:test";
import assert from "node:assert/strict";
import { claudeSkills, codexSkills } from "./verify-skills-live.mjs";

test("reads the skills from Claude Code's init event", () => {
  const out = ['{"type":"system","subtype":"hook"}', '{"type":"system","subtype":"init","skills":["design-system",{"name":"frontend-design"}]}', '{"type":"result"}'].join("\n");
  assert.deepEqual(claudeSkills(out), ["design-system", "frontend-design"]);
  assert.equal(claudeSkills("not json\n"), null);
});

test("reads the skills from Codex's model-visible prompt", () => {
  const prompt = JSON.stringify({ text: "<skills_instructions>\n### Skill roots\n- `r1` = `/repo/.agents/skills`\n- design-system: Follow the system. (file: r1/design-system/SKILL.md)\n- frontend-design: Design. (file: r1/frontend-design/SKILL.md)\n</skills_instructions>" });
  assert.deepEqual(codexSkills(prompt), [{ name: "design-system", file: "r1/design-system/SKILL.md" }, { name: "frontend-design", file: "r1/frontend-design/SKILL.md" }]);
  assert.equal(codexSkills("{}"), null);
});
