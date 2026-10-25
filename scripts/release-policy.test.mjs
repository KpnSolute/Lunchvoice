import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { filesNeedHeavyTests } from "./release-patterns.mjs";
import { checkBundleDir, findMissingMarkers } from "./check-bundle.mjs";

const policyScript = resolve(import.meta.dirname, "release-policy.mjs");

test("heavy tests are required for auth, org, supabase, dependency, workflow and hook paths", () => {
  for (const file of [
    "src/auth/AuthProvider.tsx",
    "src/org/OrgProvider.tsx",
    "src/lib/supabase.ts",
    "supabase/functions/staff-login/index.ts",
    "supabase/migrations/20261101000000_example.sql",
    "supabase/config.toml",
    "package.json",
    "package-lock.json",
    "render.yaml",
    ".github/workflows/pr-checks.yml",
    ".githooks/pre-push",
    "scripts/release-policy.mjs",
  ]) {
    assert.equal(filesNeedHeavyTests([file]), true, `${file} should require heavy tests`);
  }
});

test("heavy tests are not required for UI, docs or changelog-only changes", () => {
  for (const file of [
    "src/routes/student/Home.tsx",
    "src/components/Layout.tsx",
    "src/index.css",
    "docs/backend/EXECUTION_ROADMAP.md",
    "CHANGELOG.md",
    "README.md",
  ]) {
    assert.equal(filesNeedHeavyTests([file]), false, `${file} should not require heavy tests`);
  }
});

test("regression: the stale src/contexts/Auth path no longer matters, the real auth provider does", () => {
  assert.equal(filesNeedHeavyTests(["src/auth/AuthProvider.tsx"]), true);
  assert.equal(filesNeedHeavyTests(["src/contexts/AuthProvider.tsx"]), false);
});

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "lv-policy-"));
  const git = (...args) => execFileSync("git", ["-c", "user.email=ci@example.invalid", "-c", "user.name=ci", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "base\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  git("switch", "-q", "-c", "feature");
  return { dir, git, base };
}

function runPr(dir, base) {
  return spawnSync(process.execPath, [policyScript, "pr", base], { cwd: dir, encoding: "utf8" });
}

test("pr mode fails when CHANGELOG.md is not updated", () => {
  const { dir, git, base } = makeRepo();
  try {
    writeFileSync(join(dir, "README.md"), "changed\n");
    git("commit", "-q", "-am", "change without changelog");
    const result = runPr(dir, base);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /changelog\tfalse/);
    assert.match(result.stderr, /CHANGELOG\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pr mode passes with a changelog and flags heavy tests for auth changes", () => {
  const { dir, git, base } = makeRepo();
  try {
    mkdirSync(join(dir, "src", "auth"), { recursive: true });
    writeFileSync(join(dir, "src", "auth", "AuthProvider.tsx"), "export {};\n");
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n");
    git("add", ".");
    git("commit", "-q", "-m", "auth change with changelog");
    const result = runPr(dir, base);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /changelog\ttrue/);
    assert.match(result.stdout, /heavy\ttrue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pr mode does not require heavy tests for a docs-and-changelog change", () => {
  const { dir, git, base } = makeRepo();
  try {
    writeFileSync(join(dir, "README.md"), "changed\n");
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n");
    git("add", ".");
    git("commit", "-q", "-m", "docs");
    const result = runPr(dir, base);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /heavy\tfalse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle check reports missing markers and passes when all are present", () => {
  assert.deepEqual(findMissingMarkers("createClient GoTrueClient submit_response login-start survey_templates"), []);
  assert.deepEqual(findMissingMarkers("createClient"), ["GoTrueClient", "submit_response", "login-start", "survey_templates"]);

  const dir = mkdtempSync(join(tmpdir(), "lv-bundle-"));
  try {
    writeFileSync(join(dir, "index.js"), "throw Error(`Missing VITE_SUPABASE_URL`)");
    assert.equal(checkBundleDir(dir).ok, false);
    writeFileSync(join(dir, "index.js"), "createClient GoTrueClient submit_response login-start survey_templates");
    assert.equal(checkBundleDir(dir).ok, true);
    assert.equal(checkBundleDir(join(dir, "missing")).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
