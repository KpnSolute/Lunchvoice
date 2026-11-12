import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSkills, parseFrontmatter, referencedPaths, REQUIRED, syncSkills } from "./skills.mjs";

/** A disposable copy of the real skills plus the files they reference. */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "lv-skills-"));
  for (const p of [".agents/skills", ".claude/skills", "docs/frontend/design-system", "src/ui/tokens.css", "src/ui/app.css", "src/ui/hub.css", "src/ui/ui.css",
    "src/styles/landing.css", "src/components", "src/pages/Gallery.tsx", "src/ui/shadcn.css", "e2e/sitecta.test.mjs", "src/lib", "scripts/brand"]) {
    cpSync(p, join(root, p), { recursive: true });
  }
  return root;
}
const skillFile = (root, base, name) => join(root, base, name, "SKILL.md");

test("the repository's skills are valid and identical for Claude Code and Codex", () => {
  assert.deepEqual(checkSkills("."), []);
  for (const n of REQUIRED) {
    const a = readFileSync(`.agents/skills/${n}/SKILL.md`);
    assert.ok(a.equals(readFileSync(`.claude/skills/${n}/SKILL.md`)), n);
    const { fields } = parseFrontmatter(a.toString());
    assert.equal(fields.name, n);
    assert.ok(fields.description.length >= 80 && fields.description.length <= 1024);
  }
});

test("frontmatter: on line 1, closed, keys parsed, risky plain values rejected, CRLF accepted", () => {
  assert.match(parseFrontmatter("# title\n---\nname: x\n---\n").error, /first line/);
  assert.match(parseFrontmatter("---\nname: x\n").error, /not closed/);
  assert.match(parseFrontmatter("---\nname: x\ndescription: Use it: now\n---\nbody").error, /needs quotes/);
  assert.equal(parseFrontmatter('---\nname: x\ndescription: "Use it: now"\n---\nbody').fields.description, "Use it: now");
  assert.equal(parseFrontmatter("---\r\nname: x\r\ndescription: d\r\n---\r\nbody").fields.name, "x");
});

test("a mirror that drifts, is missing or has an extra skill is reported, and sync repairs it", () => {
  const root = sandbox();
  try {
    writeFileSync(skillFile(root, ".claude/skills", "design-system"), readFileSync(skillFile(root, ".claude/skills", "design-system"), "utf8") + "\nlocal edit\n");
    rmSync(join(root, ".claude/skills/frontend-design/NOTICE.md"));
    mkdirSync(join(root, ".claude/skills/only-claude"), { recursive: true });
    writeFileSync(join(root, ".claude/skills/only-claude/SKILL.md"), "---\nname: only-claude\ndescription: x\n---\n");
    const problems = checkSkills(root).join("\n");
    assert.match(problems, /\.claude\/skills\/design-system\/SKILL\.md: differs/);
    assert.match(problems, /\.claude\/skills\/frontend-design: files differ/);
    assert.match(problems, /only-claude: exists only for one agent/);
    rmSync(join(root, ".claude/skills/only-claude"), { recursive: true });
    syncSkills(root);
    assert.deepEqual(checkSkills(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bad metadata, placeholders, broken references and a missing required skill are caught", () => {
  const root = sandbox();
  try {
    const f = skillFile(root, ".agents/skills", "design-system");
    const good = readFileSync(f, "utf8");
    writeFileSync(f, good.replace("name: design-system", "name: Design System").replaceAll("src/ui/tokens.css", "src/ui/tokens-v2.css"));
    rmSync(join(root, ".agents/skills/design-element-authoring"), { recursive: true });
    writeFileSync(skillFile(root, ".agents/skills", "frontend-design"), "---\nname: frontend-design\ndescription: TODO\n---\nTBD\n");
    const p = checkSkills(root).join("\n");
    assert.match(p, /name "Design System" must equal the folder name/);
    assert.match(p, /references src\/ui\/tokens-v2\.css, which does not exist/);
    assert.match(p, /design-element-authoring: required skill is missing/);
    assert.match(p, /frontend-design: description is too short/);
    assert.match(p, /frontend-design: the instructions are empty or a placeholder/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the adapted frontend-design skill keeps its Apache-2.0 licence and notice", () => {
  const root = sandbox();
  try {
    rmSync(join(root, ".agents/skills/frontend-design/LICENSE.txt"));
    assert.match(checkSkills(root).join("\n"), /LICENSE\.txt is required/);
  } finally { rmSync(root, { recursive: true, force: true }); }
  assert.match(readFileSync(".agents/skills/frontend-design/LICENSE.txt", "utf8"), /Apache License\s+Version 2\.0/);
});

test("references are found in backticks and links", () => {
  assert.deepEqual(referencedPaths("Read `src/ui/tokens.css` and [the map](docs/frontend/design-system/README.md)."), ["src/ui/tokens.css", "docs/frontend/design-system/README.md"]);
});
