import { test } from "node:test";
import assert from "node:assert/strict";
import { HERO_LINES, HERO_LINE_KEY, heroLineFor } from "./heroLine";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

test("a device keeps the line it was first given", () => {
  const s = memory();
  const first = heroLineFor(s, () => 0.9);
  assert.equal(first.id, "story");
  assert.equal(s.m.get(HERO_LINE_KEY), "story");
  for (let i = 0; i < 5; i++) assert.equal(heroLineFor(s, () => 0).id, "story");
});

test("both lines are reachable, half each", () => {
  assert.equal(heroLineFor(memory(), () => 0).id, "count");
  assert.equal(heroLineFor(memory(), () => 0.49).id, "count");
  assert.equal(heroLineFor(memory(), () => 0.5).id, "story");
  assert.equal(heroLineFor(memory(), () => 0.999999).id, "story");
});

test("an unknown saved value is replaced, and broken or missing storage still gives a line", () => {
  const s = memory(); s.setItem(HERO_LINE_KEY, "retired-line");
  assert.equal(heroLineFor(s, () => 0).id, "count");
  assert.equal(s.m.get(HERO_LINE_KEY), "count");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.ok(HERO_LINES.includes(heroLineFor(broken, () => 0.7)));
  assert.equal(heroLineFor(null, () => 0).id, "count");
});
