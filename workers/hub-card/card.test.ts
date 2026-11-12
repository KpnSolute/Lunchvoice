import test from "node:test";
import assert from "node:assert/strict";
import { cardPage, cardText, factsFromHubGet, isPreviewBot, slugFromPath } from "./card";

const PUBLIC = {
  ok: true,
  hub: { hub_id: "h1", slug: "kitchen", name: "The Kitchen", visibility: "public", membership_mode: "open", member_count: 42, about: "Where LunchVoice is built in the open.", accent: "teal" },
  accents: [{ key: "teal", label: "Teal", hex: "#0F766E" }],
};

test("slugs: only /h/<valid slug>", () => {
  assert.equal(slugFromPath("/h/kitchen"), "kitchen");
  assert.equal(slugFromPath("/h/KpnWorld/"), "kpnworld");
  for (const p of ["/h/", "/h/a", "/h/../etc", "/h/x%2fy", "/h/%E0%A4%A", "/kitchen", "/h/kit/chen", "/h/-bad"]) assert.equal(slugFromPath(p), null, p);
});

test("preview bots get the card, people do not", () => {
  for (const ua of ["Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "Slackbot-LinkExpanding 1.0", "facebookexternalhit/1.1", "Twitterbot/1.0", "WhatsApp/2.23"]) assert.ok(isPreviewBot(ua), ua);
  for (const ua of [null, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"]) assert.equal(isPreviewBot(ua), false);
});

test("a public Hub's facts come from lv_hub_get, colour from its palette key", () => {
  const f = factsFromHubGet(PUBLIC)!;
  assert.deepEqual(f, { name: "The Kitchen", slug: "kitchen", member_count: 42, membership_mode: "open", about: "Where LunchVoice is built in the open.", accent_hex: "#0F766E" });
  const t = cardText("kitchen", f);
  assert.equal(t.title, "The Kitchen on LunchVoice");
  assert.equal(t.description, "42 members · Open to join. Where LunchVoice is built in the open.");
  assert.equal(t.color, "#0F766E");
});

test("private, missing or malformed Hubs get the same neutral card (no name, no count)", () => {
  for (const body of [{ ok: false, error: { code: "lv_not_found" } }, { ...PUBLIC, hub: { ...PUBLIC.hub, visibility: "private" } }, null, { ok: true }, { ok: true, hub: { name: 1 } }]) {
    const f = factsFromHubGet(body);
    assert.equal(f, null);
    const html = cardPage("kitchen", f);
    assert.ok(!html.includes("The Kitchen") && !html.includes("42"), "nothing about the Hub leaks");
    assert.match(html, /<meta property="og:title" content="A Hub on LunchVoice" \/>/);
  }
});

test("the page escapes Hub text, forwards people and points at the Hub", () => {
  const evil = factsFromHubGet({ ...PUBLIC, hub: { ...PUBLIC.hub, name: `"><script>alert(1)</script>`, about: "a & b <i>" } })!;
  const html = cardPage("kitchen", evil);
  assert.ok(!html.includes("<script>"), "no markup from the Hub");
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/lunchvoice.com\/kitchen" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/lunchvoice.com\/kitchen" \/>/);
  assert.match(html, /<meta name="theme-color" content="#0F766E" \/>/);
  assert.match(cardPage("kitchen", factsFromHubGet({ ...PUBLIC, hub: { ...PUBLIC.hub, about: "from $13/month $1" } })), /from \$13\/month \$1/);
});

test("long text is clipped to what chat apps show", () => {
  const f = factsFromHubGet({ ...PUBLIC, hub: { ...PUBLIC.hub, name: "N".repeat(90), about: "word ".repeat(80) } })!;
  const t = cardText("kitchen", f);
  assert.ok(t.title.length <= 70 && t.title.endsWith("…"));
  assert.ok(t.description.length <= 200 && t.description.endsWith("…"));
});
