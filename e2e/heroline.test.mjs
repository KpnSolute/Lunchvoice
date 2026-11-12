// The home page headline is one of two approved lines, fixed per device (src/lib/heroLine.ts). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const LINES = { count: "Make every voice count.", story: "Every voice has a story. Hear it." };

for (const [id, text] of Object.entries(LINES)) {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    test(`a device given "${id}" sees it on every visit (${width}px)`, async () => {
      const { page, go, ctx, errors } = await openPage(app, { signedIn: false, width, height });
      await ctx.addInitScript((v) => localStorage.setItem("lv.heroLine", v), id);
      for (let visit = 0; visit < 3; visit++) {
        await go("/");
        const h1 = page.locator("h1.lv-l-h1");
        assert.equal((await h1.innerText()).replace(/\s+/g, " ").trim(), text);
        assert.equal(await h1.getAttribute("data-hero-line"), id);
      }
      assert.ok(await noHorizontalScroll(page), "no sideways scroll");
      if (width === 390) await page.screenshot({ path: `/tmp/hero-${id}-${width}.png` });
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }
}

test("a new device is given one of the two lines and keeps it", async () => {
  const { page, go, ctx, errors } = await openPage(app, { signedIn: false });
  await go("/");
  const first = await page.evaluate(() => localStorage.getItem("lv.heroLine"));
  assert.ok(first in LINES, `saved line ${first}`);
  for (let visit = 0; visit < 3; visit++) {
    await go("/");
    assert.equal(await page.locator("h1.lv-l-h1").getAttribute("data-hero-line"), first);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
