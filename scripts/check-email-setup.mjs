#!/usr/bin/env node
// Readiness check for the SES-backed send-email hook. Prints pass/fail per
// requirement, never secret values. Safe to run anytime.
//
//   npm run check:email

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REQUIRED_SECRETS = [
  "SEND_EMAIL_HOOK_SECRET",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "MAIL_FROM",
  "MAIL_FROM_NAME",
];

const REMOVED_SECRETS = ["MAILERSEND_API_KEY"];

let ok = true;
const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => {
  ok = false;
  console.log(`  FAIL  ${msg}`);
};
const warn = (msg) => console.log(`  WARN  ${msg}`);

console.log("send-email verify_jwt (supabase/config.toml):");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const block = config.match(/\[functions\.send-email\]([\s\S]*?)(\n\[|$)/);

if (block && /verify_jwt\s*=\s*false/.test(block[1])) {
  pass("verify_jwt = false");
} else {
  fail("verify_jwt is not set to false for [functions.send-email]");
}

const projectRef = config.match(/project_id\s*=\s*"([^"]+)"/)?.[1] ?? "qprfonxvthmaoxfixigk";

console.log("\nSupabase secrets (names only):");
let secretNames = null;

try {
  const out = execFileSync(
    "supabase",
    ["secrets", "list", "--project-ref", projectRef, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(out);
  secretNames = parsed.map((secret) => secret.name).filter(Boolean);
} catch (e) {
  warn(`could not run live secret check (${e.message.split("\n")[0]})`);
}

if (secretNames) {
  for (const name of REQUIRED_SECRETS) {
    secretNames.includes(name) ? pass(`${name} present`) : fail(`${name} missing`);
  }

  for (const name of REMOVED_SECRETS) {
    secretNames.includes(name) ? fail(`${name} still set (should be removed)`) : pass(`${name} absent`);
  }
} else {
  console.log("  Run `supabase login` / `supabase link` and re-run this script to check live secrets.");
}

console.log(ok ? "\nAll checks passed." : "\nSome checks failed.");
process.exit(ok ? 0 : 1);
