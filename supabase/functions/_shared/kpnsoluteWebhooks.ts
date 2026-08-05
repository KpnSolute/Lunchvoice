const encoder = new TextEncoder();

function signingSecretBytes(secret: string): Uint8Array {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function verifyKpnSoluteWebhook(secret: string, headers: Headers, rawBody: string, toleranceSeconds = 300) {
  const id = headers.get("webhook-id") ?? "";
  const timestampText = headers.get("webhook-timestamp") ?? "";
  const signatures = (headers.get("webhook-signature") ?? "").split(" ");
  if (!id || id.includes(".") || !/^\d+$/.test(timestampText)) return { ok: false, reason: "invalid webhook metadata" };
  const timestamp = Number(timestampText);
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return { ok: false, reason: "timestamp outside replay window" };
  const key = await crypto.subtle.importKey("raw", signingSecretBytes(secret).buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${rawBody}`)));
  for (const candidate of signatures) {
    const match = /^v1,([A-Za-z0-9+/=]+)$/.exec(candidate);
    if (!match) continue;
    const actual = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    if (actual.length !== expected.length) continue;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    if (difference === 0) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}
