import test from "node:test";
import assert from "node:assert/strict";
import { keyOnlyInApikey } from "./apiKey";

function capture() {
  const seen: Headers[] = [];
  const base = (async (_i: unknown, init?: RequestInit) => { seen.push(new Headers(init?.headers)); return new Response("{}"); }) as typeof fetch;
  return { seen, base };
}

test("the API key never travels as a Bearer token", async () => {
  const { seen, base } = capture();
  const f = keyOnlyInApikey("sb_publishable_x", base);
  await f("https://x/rest/v1/rpc/a", { headers: { apikey: "sb_publishable_x", Authorization: "Bearer sb_publishable_x" } });
  assert.equal(seen[0]!.get("apikey"), "sb_publishable_x");
  assert.equal(seen[0]!.get("authorization"), null);
});

test("a signed-in person's token is kept", async () => {
  const { seen, base } = capture();
  const f = keyOnlyInApikey("sb_publishable_x", base);
  await f("https://x/rest/v1/rpc/a", { headers: { apikey: "sb_publishable_x", Authorization: "Bearer eyJ.person.token" } });
  assert.equal(seen[0]!.get("authorization"), "Bearer eyJ.person.token");
});
