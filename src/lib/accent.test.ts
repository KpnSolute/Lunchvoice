import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCENTS, accentHex, normalizePalette, onAccent } from "./accent.ts";

test("the real palette shape (objects) is kept; legacy hex strings still work", () => {
  const real = [{ key: "indigo", label: "Indigo", hex: "#4338CA" }, { key: "teal", label: "Teal", hex: "#0F766E" }];
  assert.deepEqual(normalizePalette(real), real);
  assert.deepEqual(normalizePalette(["#0F766E"]), [{ key: "#0F766E", hex: "#0F766E", label: "#0F766E" }]);
  assert.deepEqual(normalizePalette([{ key: "x" }, 7, null]), []);
});

test("an accent key resolves to its hex; unknown or empty is no colour", () => {
  assert.equal(accentHex("teal"), "#0F766E");
  assert.equal(accentHex("#123456"), "#123456");
  assert.equal(accentHex("nope"), null);
  assert.equal(accentHex(null), null);
});

test("every palette colour is contrast-safe with white text", () => {
  for (const a of ACCENTS) assert.equal(onAccent(a.hex), "#ffffff", a.key);
});
