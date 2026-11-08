// LC-30: the bundle guard refuses dev-only code and every secret marker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findForbiddenMarkers } from "./check-bundle.mjs";

test("secret markers are forbidden in a production bundle", () => {
  for (const marker of ["service_role", "sb_secret_abc", '{"kty":"EC","d":"abc"}', "sk_live_123", "sk_test_123", "whsec_123"]) {
    assert.ok(findForbiddenMarkers(`const x = ${marker};`).length > 0, marker);
  }
});

test("ordinary application code passes", () => {
  assert.deepEqual(findForbiddenMarkers('rpc("lv_my_context"); const d = "M0 0h24v24H0z";'), []);
});
