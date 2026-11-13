import { test } from "node:test";
import assert from "node:assert/strict";
import { isChunkLoadError, isNewer, MAX_POLL_MS, nextDelay, parseVersion, POLL_MS } from "./updateCheck.ts";

test("backoff doubles per failure and is capped", () => {
  assert.equal(nextDelay(0), POLL_MS);
  assert.equal(nextDelay(1), POLL_MS * 2);
  assert.equal(nextDelay(10), MAX_POLL_MS);
});

test("parseVersion only trusts a version file", () => {
  assert.equal(parseVersion({ id: "abc", builtAt: "x" }), "abc");
  assert.equal(parseVersion("<html>"), null);
  assert.equal(parseVersion({ id: "" }), null);
  assert.equal(parseVersion({ id: 5 }), null);
  assert.equal(parseVersion(null), null);
});

test("isNewer compares builds and ignores local/dev and unreadable results", () => {
  assert.equal(isNewer("a", "b"), true);
  assert.equal(isNewer("a", "a"), false);
  assert.equal(isNewer("a", null), false);
  assert.equal(isNewer("local", "b"), false);
});

test("chunk load failures are recognised across browsers", () => {
  assert.equal(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Hub-1.js")), true);
  assert.equal(isChunkLoadError(new TypeError("error loading dynamically imported module")), true);
  assert.equal(isChunkLoadError(new TypeError("Importing a module script failed.")), true);
  assert.equal(isChunkLoadError(new Error("Network down")), false);
  assert.equal(isChunkLoadError(undefined), false);
});
