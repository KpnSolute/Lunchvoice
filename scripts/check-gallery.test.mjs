import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGallery, exportedComponents } from "./check-gallery.mjs";

test("every reusable component is shown at /__gallery", () => {
  assert.deepEqual(checkGallery("."), []);
});

test("a new component that is not registered fails the check, and registering it passes", () => {
  const root = mkdtempSync(join(tmpdir(), "lv-gallery-"));
  try {
    cpSync("src", join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/components/ProgressRing.tsx"), "export function ProgressRing() { return null }\nexport const RING_SIZE = 4;\n");
    assert.match(checkGallery(root).join("\n"), /ProgressRing is not shown at \/__gallery/);
    const g = join(root, "src/pages/Gallery.tsx");
    writeFileSync(g, readFileSync(g, "utf8").replace("<Section title=\"Brand\">", "<Section title=\"Brand\"><ProgressRing />"));
    assert.deepEqual(checkGallery(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("component names are PascalCase exports only", () => {
  assert.deepEqual(exportedComponents("export function HubCard() {}\nexport const WITHHELD = 1;\nexport function hubShareUrl() {}\nexport const CountUp = () => null;"), ["HubCard", "CountUp"]);
});
