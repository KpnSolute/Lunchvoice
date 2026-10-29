/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_KPNIDENTITY_ISSUER?: string;
  readonly VITE_LV_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
