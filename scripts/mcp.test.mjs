import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scripts = resolve(import.meta.dirname, "mcp");

function run(command, args, env = {}) {
  return spawnSync("bash", [join(scripts, command), ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
}

function withEnvFile(contents, mode, fn) {
  const dir = mkdtempSync(join(tmpdir(), "lv-mcp-"));
  const file = join(dir, ".mcp.env");
  try {
    writeFileSync(file, contents);
    chmodSync(file, mode);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("with-env refuses a missing secrets file", () => {
  const result = run("with-env.sh", ["printenv", "FOO"], { LV_MCP_ENV_FILE: "/nonexistent/.mcp.env" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing .*\.mcp\.env/);
  assert.equal(result.stdout, "");
});

test("with-env refuses a group/world-readable secrets file", () => {
  withEnvFile("FOO=bar\n", 0o644, (file) => {
    const result = run("with-env.sh", ["printenv", "FOO"], { LV_MCP_ENV_FILE: file });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /owner-only/);
    assert.equal(result.stdout, "");
  });
});

test("with-env loads an owner-only file into the child command only", () => {
  withEnvFile("FOO=from-file\n", 0o600, (file) => {
    const result = run("with-env.sh", ["printenv", "FOO"], { LV_MCP_ENV_FILE: file });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "from-file");
  });
});

test("supabase wrapper ignores a token inherited from the global environment", () => {
  withEnvFile("SUPABASE_PROJECT_REF=projectref123\n", 0o600, (file) => {
    const result = run("supabase.sh", [], {
      LV_MCP_ENV_FILE: file,
      SUPABASE_ACCESS_TOKEN: "global-token-must-not-be-used",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SUPABASE_ACCESS_TOKEN is empty in \.mcp\.env/);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /global-token-must-not-be-used/);
  });
});

test("supabase wrapper starts read-only and pinned, never printing the token", () => {
  withEnvFile("SUPABASE_ACCESS_TOKEN=secret-token-value\nSUPABASE_PROJECT_REF=projectref123\n", 0o600, (file) => {
    // Replace npx with a stub that records its arguments so no network or real server is needed.
    const dir = mkdtempSync(join(tmpdir(), "lv-npx-"));
    try {
      writeFileSync(join(dir, "npx"), '#!/usr/bin/env bash\nprintf "ARGS:%s\\n" "$*"\nprintf "TOKEN_SET:%s\\n" "${SUPABASE_ACCESS_TOKEN:+yes}"\n');
      chmodSync(join(dir, "npx"), 0o755);
      const result = run("supabase.sh", [], { LV_MCP_ENV_FILE: file, PATH: `${dir}:${process.env.PATH}` });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /ARGS:-y @supabase\/mcp-server-supabase@0\.13\.0 --project-ref=projectref123 --read-only/);
      assert.match(result.stdout, /TOKEN_SET:yes/);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-token-value/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("supabase wrapper allows writes only when explicitly requested", () => {
  withEnvFile("SUPABASE_ACCESS_TOKEN=t\nSUPABASE_PROJECT_REF=r\nSUPABASE_MCP_READ_ONLY=false\n", 0o600, (file) => {
    const dir = mkdtempSync(join(tmpdir(), "lv-npx-"));
    try {
      writeFileSync(join(dir, "npx"), '#!/usr/bin/env bash\nprintf "ARGS:%s\\n" "$*"\n');
      chmodSync(join(dir, "npx"), 0o755);
      const result = run("supabase.sh", [], { LV_MCP_ENV_FILE: file, PATH: `${dir}:${process.env.PATH}` });
      assert.equal(result.status, 0);
      assert.doesNotMatch(result.stdout, /--read-only/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
