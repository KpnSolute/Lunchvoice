# KpnIdentity schema (local baseline)

Implements `docs/v2/KPNIDENTITY_SCHEMA_V1.md`: `kpni.profiles`, `kpni.oauth_clients`, `kpni.oauth_redirect_uris`,
`kpni.security_events`, plus the helpers that make the six schema invariants enforceable in the database.

This is a design and local-baseline artifact. It is **not deployed**: the KpnIdentity Supabase project is still empty,
and applying this is a separate, explicitly approved step. Nothing here applies to the LunchVoice project.

Run the tests (needs Docker, uses a throwaway Postgres only):

```bash
bash scripts/db-test-kpni.sh
```

Tests prove the schema invariants. They do not prove Google's round trip or Supabase's own OAuth server.
