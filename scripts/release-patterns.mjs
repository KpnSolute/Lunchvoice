// Paths whose changes require the heavy test suite (npm security audit and any
// project-specific integration checks). Shared by `release-policy.mjs` (main
// push pipeline and PR checks) and its tests so the selector cannot drift from
// the real source layout again.
//
// The identity/tenant code lives in `src/auth/` and `src/org/` (AuthProvider,
// OrgProvider). An earlier pattern named `src/contexts/Auth`, a directory that
// does not exist, so auth-only edits skipped the heavy gate.
export const HEAVY_PATH_PATTERN = new RegExp(
  [
    "package(-lock)?\\.json",
    "render\\.yaml",
    "supabase/(migrations/|rollbacks/|tests/|config\\.toml$)",
    "scripts/db-test-canonical\\.sh$",
    "src/(auth|org)/",
    "src/lib/supabase",
    "\\.github/workflows/",
    "\\.githooks/",
    "scripts/(release-policy|release-patterns|check-agent-brain|check-bundle)\\.",
  ]
    .map((part) => `^${part}`)
    .join("|"),
);

export function filesNeedHeavyTests(files) {
  return files.some((file) => HEAVY_PATH_PATTERN.test(file));
}
