// Guard that no v1 customer name leaks into the v2 frontend.
//
// LunchVoice v2 ships no pre-created Hubs: a customer creates its own Hub through
// the public flow, so no source file, test or fixture may special-case one. This
// check fails the build if a retired customer name appears anywhere under `src/`
// (tests included), which is the only place the frontend can carry one.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "src";

// The retired v1 tenant names. Matching is case-insensitive and tolerant of the
// spacing/hyphen variants that sneak in through prose and comments.
const FORBIDDEN_PATTERNS = [
  { pattern: /lion\s*cafe/i, label: "LionCafe" },
  { pattern: /\bmjcc\b/i, label: "MJCC" },
  { pattern: /\bmiami\b/i, label: "Miami" },
  { pattern: /job[\s_-]*corps/i, label: "Job Corps" },
];

const TEXT_FILE = /\.(m?[jt]sx?|css|html|json|svg|md|txt)$/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (TEXT_FILE.test(name)) out.push(path);
  }
  return out;
}

export function findCustomerNames(source, patterns = FORBIDDEN_PATTERNS) {
  const hits = [];
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    for (const { pattern, label } of patterns) {
      if (pattern.test(line)) hits.push({ line: index + 1, label });
    }
  });
  return hits;
}

export function checkTree(dir = ROOT) {
  let files;
  try {
    files = walk(dir);
  } catch {
    return { ok: false, violations: [], message: `No source directory at ${dir}.` };
  }
  const violations = [];
  for (const file of files) {
    for (const hit of findCustomerNames(readFileSync(file, "utf8"))) {
      violations.push({ file: relative(process.cwd(), file), ...hit });
    }
  }
  if (violations.length > 0) {
    return {
      ok: false,
      violations,
      message:
        "Retired customer name(s) found in src/. LunchVoice v2 must not special-case a customer; " +
        "use a synthetic name such as `example-hub` or `acme-test`.",
    };
  }
  return { ok: true, violations, message: `No retired customer names in ${relative(process.cwd(), dir)}/.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkTree(process.argv[2] ?? ROOT);
  for (const v of result.violations) console.error(`  ${v.file}:${v.line} ${v.label}`);
  (result.ok ? console.log : console.error)(result.message);
  process.exit(result.ok ? 0 : 1);
}
