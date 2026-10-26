import { createClient } from "@supabase/supabase-js";
import { createLvApi, type LvApi, type LvTransport } from "./lvApi";
import { createMockTransport } from "./mockTransport";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Real transport: all data operations are lv_api functions, authenticated with
// the KpnIdentity token. No table access.
function realTransport(getToken: () => string | null): LvTransport {
  const client = createClient(url as string, key as string, {
    db: { schema: "lv_api" },
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => getToken(),
  });
  return {
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
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

export function createApi(getToken: () => string | null, displayName?: string): LvApi {
  if (import.meta.env.DEV && usingMock) return createLvApi(createMockTransport(displayName));
  return createLvApi(url && key ? realTransport(getToken) : failClosed);
}
