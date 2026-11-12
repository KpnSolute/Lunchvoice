import test from "node:test";
import assert from "node:assert/strict";
import { isApiKey, publishableKey, serviceSecrets } from "./keys.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];

test("publishable key: our secret first, then the platform's new keys, then the legacy anon key", () => {
  assert.equal(publishableKey(env({ LV_PUBLISHABLE_KEY: "sb_publishable_a", SUPABASE_ANON_KEY: "legacy" })), "sb_publishable_a");
  assert.equal(publishableKey(env({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_b"}', SUPABASE_ANON_KEY: "legacy" })), "sb_publishable_b");
  assert.equal(publishableKey(env({ SUPABASE_ANON_KEY: "legacy" })), "legacy");
  assert.equal(publishableKey(env({ SUPABASE_PUBLISHABLE_KEYS: "not json" })), undefined);
});

test("service secrets: new secret keys and the legacy service-role key, never empty strings", () => {
  assert.deepEqual(serviceSecrets(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x","cron":"sb_secret_y"}', SUPABASE_SERVICE_ROLE_KEY: "legacy" })), ["sb_secret_x", "sb_secret_y", "legacy"]);
  assert.deepEqual(serviceSecrets(env({})), []);
});

test("no API key is ever taken for a signed-in person", () => {
  const e = env({ SUPABASE_ANON_KEY: "legacy-anon" });
  for (const t of ["sb_publishable_abc", "sb_secret_abc", "legacy-anon"]) assert.equal(isApiKey(t, e), true, t);
  assert.equal(isApiKey("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig", e), false);
});
