// Native agent skills: one canonical copy, two discovery locations.
//
//   .agents/skills/<name>/   canonical (the open Agent Skills location that OpenAI Codex scans)
//   .claude/skills/<name>/   byte-for-byte mirror (the project location Claude Code scans)
//
// Symlinks would avoid the copy, but Git on Windows checks symlinks out as plain files unless developer mode and
// core.symlinks are on, so the mirror is a real copy kept identical by this script.
//
//   node scripts/skills.mjs check   validate structure, metadata, references and that both copies are identical
//   node scripts/skills.mjs sync    copy .agents/skills -> .claude/skills for the managed skills, then check
//
// Plain Node (no dependencies, no shell), so it runs the same in Windows PowerShell, macOS and Linux.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const CANONICAL = ".agents/skills";
export const MIRRORS = [".claude/skills"];
/** Skills the repository must ship. Others may exist, but these are required and kept in sync. */
export const REQUIRED = ["frontend-design", "design-system", "design-element-authoring"];
const ALLOWED_KEYS = new Set(["name", "description", "license", "metadata"]);
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every file under `dir`, as forward-slash paths relative to it. */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * SKILL.md frontmatter, parsed strictly enough for both platforms: it must open on line 1, keys are one per line, and
 * plain values may not contain ": " or " #" (YAML would misread them; quote such values).
 */
export function parseFrontmatter(text) {
  const src = text.replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return { error: "frontmatter must start on the first line with ---" };
  const end = src.indexOf("\n---\n", 4);
  if (end < 0) return { error: "frontmatter is not closed with ---" };
  const fields = {};
  for (const line of src.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const m = /^([a-z][a-z0-9_-]*):\s?(.*)$/.exec(line);
    if (!m) return { error: `unparseable frontmatter line: ${line.slice(0, 60)}` };
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    else if (/: |\s#/.test(value)) return { error: `value of "${m[1]}" needs quotes (contains ": " or " #")` };
    fields[m[1]] = value;
  }
  return { fields, body: src.slice(end + 5) };
}

/** Repository paths a skill body points at (`src/...`, `docs/...` in backticks or links). */
export function referencedPaths(body) {
  const out = new Set();
  for (const m of body.matchAll(/`((?:src|docs|e2e|scripts|supabase|workers|public)\/[^`\s*<>]+?)`/g)) out.add(m[1].replace(/[),.:;]+$/, ""));
  for (const m of body.matchAll(/\]\(((?:src|docs|e2e|scripts)\/[^)\s#]+)\)/g)) out.add(m[1]);
  return [...out];
}

/** Problems with one skill folder (empty when it is valid). */
export function validateSkill(root, base, name) {
  const dir = join(root, base, name);
  const problems = [];
  const file = join(dir, "SKILL.md");
  if (!existsSync(file)) return [`${base}/${name}: SKILL.md is missing`];
  const parsed = parseFrontmatter(readFileSync(file, "utf8"));
  if (parsed.error) return [`${base}/${name}/SKILL.md: ${parsed.error}`];
  const { fields, body } = parsed;
  for (const k of Object.keys(fields)) if (!ALLOWED_KEYS.has(k)) problems.push(`${base}/${name}: unsupported frontmatter key "${k}" (allowed: ${[...ALLOWED_KEYS].join(", ")})`);
  if (!fields.name) problems.push(`${base}/${name}: "name" is required (Codex requires it)`);
  else {
    if (fields.name !== name) problems.push(`${base}/${name}: name "${fields.name}" must equal the folder name`);
    if (!NAME_RE.test(fields.name) || fields.name.length > 64) problems.push(`${base}/${name}: name must be lowercase words joined by hyphens, at most 64 characters`);
  }
  const d = fields.description ?? "";
  if (!d) problems.push(`${base}/${name}: "description" is required (it is how both agents decide to use the skill)`);
  else {
    if (d.length > 1024) problems.push(`${base}/${name}: description is ${d.length} characters; the limit is 1024`);
    if (d.length < 80) problems.push(`${base}/${name}: description is too short to say what the skill does and when to use it`);
    if (/[<>]/.test(d)) problems.push(`${base}/${name}: description may not contain < or >`);
    if (!/\b(use|when)\b/i.test(d)) problems.push(`${base}/${name}: description must say when to use the skill`);
  }
  const lines = body.split("\n").length;
  if (body.trim().length < 200) problems.push(`${base}/${name}: the instructions are empty or a placeholder`);
  if (lines > 500) problems.push(`${base}/${name}: SKILL.md body is ${lines} lines; keep it under 500 and move detail to docs`);
  for (const p of referencedPaths(body)) {
    const clean = p.replace(/\/$/, "");
    if (!existsSync(join(root, clean))) problems.push(`${base}/${name}: references ${p}, which does not exist`);
  }
  for (const m of body.matchAll(/\b([A-Z][A-Z_]+\.(?:md|txt))\b/g)) {
    if (/^(AGENTS|CLAUDE|DESIGN|PRODUCT|README|CHANGELOG|COMPONENT_STANDARDS|DESIGN_EXTENSIONS|AGENT_WORKFLOW)\.md$/.test(m[1])) continue;
    if (!existsSync(join(dir, m[1]))) problems.push(`${base}/${name}: mentions ${m[1]}, which is not in the skill folder`);
  }
  return problems;
}

/** Every problem across the canonical copy and the mirrors. */
export function checkSkills(root = ".") {
  const problems = [];
  const canonical = join(root, CANONICAL);
  const names = existsSync(canonical) ? readdirSync(canonical).filter((n) => statSync(join(canonical, n)).isDirectory()).sort() : [];
  for (const r of REQUIRED) if (!names.includes(r)) problems.push(`${CANONICAL}/${r}: required skill is missing`);
  for (const n of names) problems.push(...validateSkill(root, CANONICAL, n));
  for (const mirror of MIRRORS) {
    const mdir = join(root, mirror);
    const mnames = existsSync(mdir) ? readdirSync(mdir).filter((n) => statSync(join(mdir, n)).isDirectory()).sort() : [];
    for (const n of names) {
      if (!mnames.includes(n)) { problems.push(`${mirror}/${n}: missing (run: node scripts/skills.mjs sync)`); continue; }
      const a = listFiles(join(canonical, n));
      const b = listFiles(join(mdir, n));
      if (a.join("\n") !== b.join("\n")) problems.push(`${mirror}/${n}: files differ from ${CANONICAL}/${n} (run: node scripts/skills.mjs sync)`);
      for (const f of a.filter((x) => b.includes(x))) {
        if (!readFileSync(join(canonical, n, f)).equals(readFileSync(join(mdir, n, f)))) problems.push(`${mirror}/${n}/${f}: differs from ${CANONICAL}/${n}/${f} (run: node scripts/skills.mjs sync)`);
      }
    }
    for (const n of mnames) if (!names.includes(n)) problems.push(`${mirror}/${n}: exists only for one agent; add it to ${CANONICAL} or remove it`);
  }
  if (existsSync(join(root, CANONICAL, "frontend-design"))) {
    for (const f of ["LICENSE.txt", "NOTICE.md"]) if (!existsSync(join(root, CANONICAL, "frontend-design", f))) problems.push(`${CANONICAL}/frontend-design: ${f} is required (Apache-2.0 attribution for the adapted upstream skill)`);
  }
  return problems;
}

/** Copy the canonical skills into every mirror (only skills present in the canonical folder are touched). */
export function syncSkills(root = ".") {
  const canonical = join(root, CANONICAL);
  const written = [];
  for (const n of readdirSync(canonical).filter((x) => statSync(join(canonical, x)).isDirectory())) {
    for (const mirror of MIRRORS) {
      const target = join(root, mirror, n);
      rmSync(target, { recursive: true, force: true });
      for (const f of listFiles(join(canonical, n))) {
        const to = join(target, f);
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, readFileSync(join(canonical, n, f)));
        written.push(`${mirror}/${n}/${f}`);
      }
    }
  }
  return written;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const mode = process.argv[2] ?? "check";
  if (mode === "sync") console.log(JSON.stringify({ ok: true, synced: syncSkills().length }));
  else if (mode !== "check") { console.error("usage: node scripts/skills.mjs [check|sync]"); process.exit(2); }
  const problems = checkSkills();
  if (problems.length) {
    console.error(JSON.stringify({ ok: false, problems }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, skills: REQUIRED.length, locations: [CANONICAL, ...MIRRORS] }));
}
