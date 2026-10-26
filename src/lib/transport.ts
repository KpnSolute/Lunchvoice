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

export const usingMock = import.meta.env.VITE_LV_MOCK === "1" || !url || !key;

export function createApi(getToken: () => string | null, displayName?: string): LvApi {
  return createLvApi(usingMock ? createMockTransport(displayName) : realTransport(getToken));
}
