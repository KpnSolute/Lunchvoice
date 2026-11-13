import { createClient } from "@supabase/supabase-js";
import { createLvApi, type LvApi, type LvTransport } from "./lvApi";
import { createMockTransport } from "./mockTransport";
import { rpcFailure, SESSION_ENDED_MESSAGE } from "./authFailure";
import { keyOnlyInApikey } from "./apiKey";

const url = import.meta.env.VITE_SUPABASE_URL;
// The publishable key (sb_publishable_...) replaces the legacy anon key, which Supabase retires; either works until then.
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;


// Real transport: all data operations are lv_api functions, authenticated with
// the KpnIdentity token. No table access.
function realTransport(getToken: () => string | null, onAuthFailure?: () => void): LvTransport {
  const client = createClient(url as string, key as string, {
    db: { schema: "lv_api" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: keyOnlyInApikey(key as string) },
    accessToken: async () => getToken(),
  });
  return {
    async rpc(fn, args) {
      const { data, error, status } = await client.rpc(fn, args);
      // An ended session is an ordinary {ok:false} result, not a server fault (see lib/authFailure.ts).
      if (error) return rpcFailure(error, status, Boolean(getToken()), onAuthFailure);
      return data;
    },
    // Survey branding images (000043): Supabase Storage with the same session token, so the storage.objects policies
    // decide (lv_storage.branding_writable / branding_readable). Downloads become blob: URLs (CSP img-src allows blob:).
    storage: {
      async upload(bucket, path, file, contentType) {
        const { error } = await client.storage.from(bucket).upload(path, file, { contentType, upsert: false, cacheControl: "3600" });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      async download(bucket, path) {
        const { data, error } = await client.storage.from(bucket).download(path);
        return error ? null : data;
      },
    },
    /* ---- track B: commerce ---- */
    // Edge Functions (checkout, Customer Portal). Expected failures come back as {ok:false,error} with a 4xx/5xx.
    async invoke(fn, body) {
      const token = getToken();
      const res = await fetch(`${String(url).replace(/\/+$/, "")}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: key as string, ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.status === 401 && token) {
        onAuthFailure?.();
        return { ok: false, error: { code: "lv_unauthenticated", message: SESSION_ENDED_MESSAGE } };
      }
      return res.json().catch(() => ({ ok: false, error: { code: "lv_server_error", message: "Unexpected response" } }));
    },
  };
}

// Production builds never use the mock: without a configured backend they fail closed.
const failClosed: LvTransport = {
  async rpc() {
    return { ok: false, error: { code: "lv_server_error", message: "LunchVoice is not configured." } };
  },
};

// The mock exists only in `vite` dev builds. `import.meta.env.DEV` is replaced with a
// literal so the mock and the simulated sign-in are dropped from production bundles.
export const usingMock: boolean =
  import.meta.env.DEV && (import.meta.env.VITE_LV_MOCK === "1" || !url || !key);

export function createApi(getToken: () => string | null, displayName?: string, onAuthFailure?: () => void): LvApi {
  if (import.meta.env.DEV && usingMock) {
    const mock = createMockTransport(displayName, () => Boolean(getToken()));
    // Dev only: a session whose token is the literal "expired" behaves like a server-refused token, so the
    // session-ended flow can be exercised without waiting an hour (e2e/session.test.mjs).
    return createLvApi({
      ...mock,
      async rpc(fn, args) {
        if (getToken() === "expired") {
          onAuthFailure?.();
          return { ok: false, error: { code: "lv_unauthenticated", message: SESSION_ENDED_MESSAGE } };
        }
        return mock.rpc(fn, args);
      },
    });
  }
  return createLvApi(url && key ? realTransport(getToken, onAuthFailure) : failClosed);
}
