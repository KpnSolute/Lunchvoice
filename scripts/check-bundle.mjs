// Smoke check that a production build actually contains the application.
//
// Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time,
// src/lib/supabase.ts throws at module load and the bundler drops everything
// after it, so `vite build` still "succeeds" with a near-empty bundle. CI
// supplies placeholder (non-secret) values; this check proves they took effect.
//
// Markers are stable identifiers: the Supabase client factory, the auth client,
// and RPC/function names the app calls. If one is renamed on purpose, update the
// list here in the same change.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_MARKERS = ["lv_my_context", "lv_hub_create", "lv_submit_response", "lv_analytics_query"];

// Dev-only code that must never reach a production bundle.
const FORBIDDEN_MARKERS = ["Sign in (simulated)", "mock-account", "Mock does not implement"];

export function findForbiddenMarkers(source, markers = FORBIDDEN_MARKERS) {
  return markers.filter((marker) => source.includes(marker));
}

export function findMissingMarkers(source, markers = REQUIRED_MARKERS) {
  return markers.filter((marker) => !source.includes(marker));
}

export function checkBundleDir(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".js"));
  } catch {
    return { ok: false, message: `No build output at ${dir}. Run \`npm run build\` first.` };
  }
  if (files.length === 0) return { ok: false, message: `No .js files in ${dir}.` };
  const source = files.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  const missing = findMissingMarkers(source);
  if (missing.length > 0) {
    return {
      ok: false,
      message:
        `Bundle is missing expected markers: ${missing.join(", ")}. ` +
        "Was the build run without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY?",
    };
  }
  const forbidden = findForbiddenMarkers(source);
  if (forbidden.length > 0) {
    return { ok: false, message: `Bundle ships dev-only code: ${forbidden.join(", ")}.` };
  }
  return { ok: true, message: `Bundle contains all ${REQUIRED_MARKERS.length} expected markers (${source.length} bytes).` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkBundleDir(process.argv[2] ?? "dist/assets");
  (result.ok ? console.log : console.error)(result.message);
  process.exit(result.ok ? 0 : 1);
}
