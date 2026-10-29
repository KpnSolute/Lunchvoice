# KpnIdentity schema (local baseline)

Implements `docs/v2/KPNIDENTITY_SCHEMA_V1.md`: `kpni.profiles`, `kpni.oauth_clients`, `kpni.oauth_redirect_uris`,
`kpni.security_events`, plus the helpers that make the schema invariants enforceable in the database.

Status: tested locally, **not deployed**. The KpnIdentity Supabase project is still empty. Nothing here applies to the
LunchVoice project.

```bash
bash scripts/db-test-kpni.sh     # needs Docker; throwaway Postgres only
```

The tests prove the schema invariants, the post-deploy smoke script and the rollback. They do not prove Google's
round trip, email OTP delivery or Supabase's own OAuth server.

## Design decisions

- **Subject.** `kpni.profiles.subject` equals `auth.users.id` by constraint. Supabase puts `auth.users.id` in the
  token's `sub`, so the value LunchVoice keys on can never disagree with this table. It is immutable.
- **Email verification.** `email_verified` is derived only from GoTrue's `email_confirmed_at`. `user_metadata` is
  user-editable and is never trusted for it. The profile is recomputed whenever `email` or `email_confirmed_at`
  changes. Consumers decide per flow whether a verified email is required; for a Hub's allowed email domain it must be.
- **Events.** Only `account_created`, `email_changed` and `client_created` are written, because those are the
  only ones the database can observe. Sign-in events live in `auth.audit_log_entries` and can be added when something
  writes them.
- **OAuth clients.** `kpni.oauth_clients` / `kpni.oauth_redirect_uris` are the authoritative registry and policy for
  clients. If Supabase's built-in OAuth server is enabled, its client configuration must be created to match this
  registry; it must not be edited independently. Open decision: confirm before enabling the OAuth server.
- **Privileges.** Default privileges in `kpni` revoke everything from `public`, `anon` and `authenticated`; only
  `service_role` is granted access.

## Operations

- **Blast radius.** The triggers on `auth.users` run inside GoTrue's insert. An error in them blocks every sign-up
  and sign-in on the KpnIdentity project. After applying the migration, run `kpnidentity/smoke.sql` and require every
  row to be `t`. To back out, run `rollbacks/000001_kpni_core.down.sql`.
- **Before deploying**, confirm on the target project: it is empty, has no triggers on `auth.users`, and anonymous
  sign-in is off.
- **Retention.** `security_events.ip` and `user_agent` are personal data: purge them after 90 days. The purge job
  is not part of this migration and is tracked as follow-up.
