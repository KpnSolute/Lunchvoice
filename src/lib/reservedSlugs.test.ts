import { test } from "node:test";
import assert from "node:assert/strict";
import { slugProblem } from "./reservedSlugs.ts";

test("accepts ordinary slugs", () => {
  assert.equal(slugProblem("mjcc"), null);
  assert.equal(slugProblem("Lion-Cafe-2"), null);
});

test("rejects every live route as a slug", () => {
  for (const s of ["me", "ME", "api", "analytics", "campaigns", "signin"]) assert.equal(slugProblem(s), "reserved");
});

test("rejects malformed slugs", () => {
  for (const s of ["a", "-ab", "ab-", "a--b", "a b", "a_b", "x".repeat(41)]) assert.equal(slugProblem(s), "format");
});
