import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthFailure, rpcFailure, SESSION_ENDED_MESSAGE } from "./authFailure.ts";

test("an expired or invalid token is an auth failure", () => {
  assert.equal(isAuthFailure({ message: "JWT expired", code: "PGRST303" }, 401), true);
  assert.equal(isAuthFailure({ message: "JWT expired" }), true);
  assert.equal(isAuthFailure({ message: "Expected 3 parts in JWT; got 2", code: "PGRST301" }), true);
  assert.equal(isAuthFailure({ message: "No API key found in request" }, 401), true);
  assert.equal(isAuthFailure({ message: "invalid JWT: signature verification failed" }), true);
});

test("ordinary failures are not auth failures", () => {
  assert.equal(isAuthFailure(null), false);
  assert.equal(isAuthFailure({ message: "permission denied for function lv_hub_create" }, 403), false, "403 is permission, not an ended session");
  assert.equal(isAuthFailure({ message: "duplicate key value violates unique constraint" }, 409), false);
  assert.equal(isAuthFailure({ message: "Failed to fetch" }), false);
  assert.equal(isAuthFailure({ message: "JWT secret rotated for the project" }), false, "the word JWT alone is not enough");
});

test("an ended session becomes lv_unauthenticated and notifies once, only if a token was sent", () => {
  let n = 0;
  const r = rpcFailure({ message: "JWT expired", code: "PGRST303" }, 401, true, () => { n++; });
  assert.deepEqual(r, { ok: false, error: { code: "lv_unauthenticated", message: SESSION_ENDED_MESSAGE } });
  assert.equal(n, 1);
  rpcFailure({ message: "JWT expired" }, 401, false, () => { n++; });
  assert.equal(n, 1, "no token was sent, so there is no session to end");
});

test("a genuine fault is still thrown", () => {
  assert.throws(() => rpcFailure({ message: "connection reset" }, 500, true), /connection reset/);
});
