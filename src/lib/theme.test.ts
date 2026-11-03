import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyThemePref, readThemePref, resolveTheme, saveThemePref, THEME_KEY, THEME_PREFS } from "../ui/theme";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

function stubBrowser(systemDark: boolean) {
  const attrs = new Map<string, string>();
  const storage = new MemoryStorage();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = { localStorage: storage, matchMedia: () => ({ matches: systemDark, addEventListener() {} }) };
  g.document = {
    documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) },
    querySelector: () => ({ setAttribute: (k: string, v: string) => attrs.set("meta:" + k, v) }),
  };
  return { attrs, storage };
}

test("system follows the device; explicit choices win", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("hc", true), "hc");
});

test("the preference is saved on this device, system clears it, and bad values are ignored", () => {
  const { attrs, storage } = stubBrowser(false);
  assert.equal(readThemePref(), "system");
  saveThemePref("dark");
  assert.equal(storage.getItem(THEME_KEY), "dark");
  assert.equal(attrs.get("data-theme"), "dark");
  assert.equal(attrs.get("meta:content"), "#17140F");
  assert.equal(readThemePref(), "dark");
  saveThemePref("system");
  assert.equal(storage.getItem(THEME_KEY), null);
  assert.equal(attrs.get("data-theme"), "light");
  storage.setItem(THEME_KEY, "neon");
  assert.equal(readThemePref(), "system");
  assert.equal(applyThemePref("hc"), "hc");
});

test("every theme offered has tokens, and the page loads no third-party fonts", () => {
  const tokens = readFileSync("src/ui/tokens.css", "utf8");
  for (const p of THEME_PREFS.filter((x) => x.id !== "system")) assert.match(tokens, new RegExp(`\\[data-theme='${p.id}'\\]`));
  const html = readFileSync("index.html", "utf8");
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  const fonts = readFileSync("src/ui/fonts.css", "utf8");
  assert.doesNotMatch(fonts, /cyrillic|greek|vietnamese/);
  for (const family of ["Bricolage Grotesque", "Geist", "Space Mono"]) assert.ok(fonts.includes(`font-family: '${family}'`), family);
});
