import { assertEquals } from "jsr:@std/assert@1";
import { verifyKpnSoluteWebhook } from "./kpnsoluteWebhooks.ts";

Deno.test("verifies a Standard Webhooks signature and rejects changed content", async () => {
  const secretBytes = new TextEncoder().encode("01234567890123456789012345678901");
  const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
  const webhookId = "evt_test_123";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = '{"specversion":"1.0","id":"source-1"}';
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${webhookId}.${timestamp}.${body}`)));
  const signature = btoa(String.fromCharCode(...digest));
  const headers = new Headers({
    "webhook-id": webhookId,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  });

  assertEquals(await verifyKpnSoluteWebhook(secret, headers, body), { ok: true });
  assertEquals((await verifyKpnSoluteWebhook(secret, headers, `${body} `)).ok, false);
});
