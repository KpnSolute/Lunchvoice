// Live discovery check: asks the installed Claude Code and Codex CLIs which skills they see in this repository.
// Not part of test:pr (it needs the CLIs, and the Claude check is one short paid model call). Run by hand:
//
//   npm run skills:verify            both agents
//   node scripts/verify-skills-live.mjs claude | codex
//
// Claude Code: `claude -p ... --output-format stream-json --verbose --max-turns 1`; the session's init event lists the
//   skills it loaded (one tiny model call, read-only tools).
// Codex: `codex debug prompt-input`; renders the model-visible prompt, including <skills_instructions>, with no model
//   call and no login. Set CODEX_BIN / CLAUDE_BIN to use a CLI that is not on PATH.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { REQUIRED } from "./skills.mjs";

const win = process.platform === "win32";
function run(bin, args) {
  // On Windows the npm shims are .cmd files, which need a shell to start.
  const r = spawnSync(bin, args, { encoding: "utf8", shell: win, input: "", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr ?? "") + (r.error ? String(r.error) : "") };
}

/** Skill names Claude Code loaded, from the stream-json init event. */
export function claudeSkills(streamJson) {
  for (const line of streamJson.split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "system" && e.subtype === "init") return (e.skills ?? []).map((s) => (typeof s === "string" ? s : s.name)).filter(Boolean);
  }
  return null;
}

/** Skill names (and their root) Codex lists in the model-visible prompt. */
export function codexSkills(promptJson) {
  const text = promptJson.replace(/\\n/g, "\n");
  const block = /<skills_instructions>([\s\S]*?)<\/skills_instructions>/.exec(text)?.[1];
  if (!block) return null;
  return [...block.matchAll(/^- ([a-z0-9-]+): .*?\(file: ([^)]+)\)/gm)].map((m) => ({ name: m[1], file: m[2] }));
}

function verify(agent) {
  if (agent === "claude") {
    const bin = process.env.CLAUDE_BIN ?? "claude";
    const r = run(bin, ["-p", "Reply with the single word ready.", "--output-format", "stream-json", "--verbose", "--max-turns", "1", "--allowedTools", "Read"]);
    const skills = claudeSkills(r.out);
    if (!skills) return { agent, verified: false, reason: r.ok ? "no init event in the output" : `claude did not run: ${r.err.trim().slice(0, 200)}` };
    const missing = REQUIRED.filter((n) => !skills.includes(n));
    return { agent, verified: missing.length === 0, found: REQUIRED.filter((n) => skills.includes(n)), missing };
  }
  const bin = process.env.CODEX_BIN ?? "codex";
  const r = run(bin, ["debug", "prompt-input", "Design a Hub dashboard card"]);
  const skills = codexSkills(r.out);
  if (!skills) return { agent, verified: false, reason: r.ok ? "no skills block in the prompt" : `codex did not run: ${r.err.trim().slice(0, 200)}` };
  const names = skills.map((s) => s.name);
  const missing = REQUIRED.filter((n) => !names.includes(n));
  return { agent, verified: missing.length === 0, found: REQUIRED.filter((n) => names.includes(n)), missing };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const agents = process.argv[2] ? [process.argv[2]] : ["claude", "codex"];
  const results = agents.map(verify);
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.verified) ? 0 : 1);
}
