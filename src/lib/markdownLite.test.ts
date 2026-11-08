import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownLite, parseSpans, safeHref } from "./markdownLite";

test("markdown-lite: headings, paragraphs and lists", () => {
  const b = parseMarkdownLite("# Routes\nSunday long run.\nMeet at 8.\n\n- North loop\n- River path\n### Notes");
  assert.deepEqual(b.map((x) => x.t), ["h", "p", "ul", "h"]);
  assert.equal(b[0].t === "h" && b[0].level, 2);
  assert.equal(b[1].t === "p" && b[1].spans[0].t === "text" && b[1].spans[0].text, "Sunday long run. Meet at 8.");
  assert.equal(b[2].t === "ul" && b[2].items.length, 2);
});

test("markdown-lite: only http(s) and mailto links survive", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<b>x</b>"), null);
  assert.equal(safeHref("/admin"), null);
  assert.equal(safeHref("https://example.org/map"), "https://example.org/map");
  assert.equal(safeHref("mailto:club@example.org"), "mailto:club@example.org");
  const spans = parseSpans("[Map](https://example.org/map) and [bad](javascript:alert(1))");
  assert.equal(spans[0].t, "link");
  assert.ok(spans.every((s) => s.t !== "link" || s.href.startsWith("https://")));
});

test("markdown-lite: HTML stays text", () => {
  const b = parseMarkdownLite("<script>alert(1)</script> <img src=x onerror=alert(1)>");
  assert.equal(b.length, 1);
  assert.equal(b[0].t === "p" && b[0].spans.length, 1);
  assert.equal(b[0].t === "p" && b[0].spans[0].t, "text");
});

test("markdown-lite: bare URLs and bold", () => {
  const s = parseSpans("See https://example.org/x for **details**");
  assert.deepEqual(s.map((x) => x.t), ["text", "link", "text", "strong"]);
});
