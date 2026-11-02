/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_KPNIDENTITY_ISSUER?: string;
  readonly VITE_KPNIDENTITY_CLIENT_ID?: string;
  readonly VITE_KPNIDENTITY_AUTHORIZE_URL?: string;
  readonly VITE_KPNIDENTITY_TOKEN_URL?: string;
  readonly VITE_LV_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
