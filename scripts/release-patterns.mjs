// Paths whose changes require the heavy test suite (npm security audit and any
// project-specific integration checks). Shared by `release-policy.mjs` (main
// push pipeline and PR checks) and its tests so the selector cannot drift from
// the real source layout again.
//
// v2 identity and data-access code lives in `src/identity/` (IdentityProvider) and
// `src/lib/` (`lvApi`, `transport`, `mockTransport`). The v1 `src/auth/` and `src/org/`
// directories no longer exist. Keep this list pointed at real paths.
export const HEAVY_PATH_PATTERN = new RegExp(
  [
    "package(-lock)?\\.json",
    "render\\.yaml",
    "supabase/(migrations/|functions/|config\\.toml$)",
    "src/identity/",
    "src/lib/(lvApi|transport|mockTransport)",
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
