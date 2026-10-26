# Production reset runbook — LunchVoice v2 fresh install

**Status: NOT APPROVED, NOT EXECUTED.** Written 2026-10-25. This document is the
procedure the owner must explicitly approve before anyone touches the production
database. Nothing here has been run.

Project: **MJCCv2 / "Lunchvoice"**, ref `qprfonxvthmaoxfixigk`, org
`qggdncgjvnmedihxqpww`, region us-west-2, Postgres 17.6.1.155.
It is treated as **LunchVoice v1 / retirement-pending** (decision S-4).

---

## 0. Preconditions (all must be true before step 1)

- [ ] `feat/v2-canonical-baseline` is merged and CI is green.
- [ ] `scripts/db-test-canonical.sh` passes locally: blank install + full rollback.
- [ ] The KpnIdentity issuer exists and is verified, and `identity.trusted_issuers`
      is set. **Without this the reset produces a system nobody can sign in to.**
- [ ] Owner approval recorded in writing, naming this runbook and the date.
- [ ] A maintenance window is agreed. v1 stops serving at step 5.
- [ ] Someone has confirmed **no v1 user needs an export**. This reset destroys
      all v1 student data by design.

## 1. What is destroyed

Confirmed by live inspection on 2026-10-25:

| Object | Rows | Fate |
| --- | --- | --- |
| `auth.users` | 137 | **destroyed** |
| `public.profiles` | 137 | **destroyed** |
| `public.responses` | 72 | **destroyed** |
| `public.survey_answers` | 639 | **destroyed** |
| `public.dish_ratings` | 803 | **destroyed** |
| `public.orders` | 14 | **destroyed** |
| `public.sessions` / `session_members` | 4 / 76 | **destroyed** |
| `public.voice_notes`, `store_items`, `contract_requests` | 4 / 7 / 0 | **destroyed** |
| `public.survey_templates`, `survey_questions` | 2 / 26 | **destroyed** |
| `public.menu_cycles`, `menu_cycle_days` | 1 / 28 | **destroyed** |
| `public.orgs` | 1 | **destroyed** |
| 17 tables + views in `public` | — | **dropped** |

Points total 2,900 across 58 profiles; 3,600 points were awarded by responses, so
there is an unexplained 700-point difference (likely 14 orders/redeems). It is
lost with the rest.

## 2. What must be preserved

| Item | Why | How |
| --- | --- | --- |
| Supabase project itself | plan, region, API keys, org | **Do not delete the project** |
| `auth` schema structure | Supabase-owned | leave alone; only delete *users* |
| `storage`, `extensions` schemas | Supabase-owned | leave alone (no buckets exist today) |
| `anon` / `service_role` keys | deployed clients | leave alone |
| Render static site config + env vars | deployment | leave alone |
| DNS / wildcard tenant binding | tenant routing | leave alone |
| Edge Function secrets | see §4 | re-set after redeploy |

## 3. Can the project be rebuilt, or must we reset in place?

**Reset in place.** Deleting the Supabase project would take the plan, region,
project URL, API keys and org membership with it and require re-provisioning
everything. Dropping the `public` schema and the v1 auth users is smaller,
faster and reversible up to the drop.

## 4. Live Edge Functions — the blocking dependency

Six functions are deployed and **every one of them reads `profiles` and/or
`orgs`**:

| Function | Depends on |
| --- | --- |
| `staff-login` | `profiles`, `orgs`, `permission_scopes`, `role_permissions`, `user_profiles` |
| `staff-status` | same |
| `login-start` | same |
| `staff-sso` | same |
| `send-email` | `profiles`, `orgs`, `permission_scopes`, `role_permissions` |
| `menu-sync` | `profiles`, `orgs`, `menu_cycles`, `menu_cycle_days`, `response_ratings`, … |

**Finding:** `permission_scopes`, `role_permissions`, `user_profiles` and
`menu_feedback_summary` **do not exist in any schema** on production. The staff
functions treat a query error as "no permission" (`if (scopeError) return false`),
so v1 staff authorisation is already failing closed today. This is a pre-existing
v1 defect, not caused by the reset, but it means **v1 is already partly degraded**
and should be assumed non-functional the moment `profiles` is dropped.

Therefore the reset **must** either (a) also retire those six functions, or
(b) keep `profiles`/`orgs` as empty compatibility shells. Recommend **(a)**:
v2 does not use them, and keeping empty legacy tables invites accidental use.

## 5. Procedure (for approval; not executed)

> Every step has a verification query. Stop on the first unexpected result.

**Step 0 — freeze.** Put the site in maintenance; confirm no traffic.
`select count(*) from pg_stat_activity where datname = 'postgres' and state = 'active';`
should show only your session.

**Step 1 — record the pre-state** (diff this against §1):
```sql
select 'auth.users' t, count(*) n from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'responses', count(*) from public.responses
union all select 'survey_answers', count(*) from public.survey_answers
union all select 'dish_ratings', count(*) from public.dish_ratings
union all select 'orders', count(*) from public.orders;
```

**Step 2 — retire the v1 Edge Functions** (they will break at step 4):
```bash
for f in staff-login staff-status login-start staff-sso send-email menu-sync; do
  supabase functions delete "$f" --project-ref qprfonxvthmaoxfixigk
done
```

**Step 3 — remove v1 auth users.**
```sql
-- Supabase-managed tables stay; only the people go.
delete from auth.users;   -- cascades to auth.identities / sessions / refresh tokens per Supabase FKs
```

**Step 4 — drop the v1 schema.**
```sql
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
```

**Step 5 — install the canonical baseline.**
Apply `000001_v2_core.sql` … `000006_v2_platform.sql` **in order**, via
`supabase db push` or the SQL editor. Not the legacy migrations in the same
directory — those are v1.

**Step 6 — set the identity policy (REQUIRED; empty = nobody can sign in).**
```sql
update lv.policy set value = '["https://<kpnidentity-issuer>"]'::jsonb
 where key = 'identity.trusted_issuers';
```

**Step 7 — create the first v2 administrator.**
1. The owner signs in once through Google → KpnIdentity → LunchVoice. That
   creates their `lv.accounts` row and identity; it does **not** make them an admin.
2. An operator promotes them:
```sql
select lv.grant_platform_admin('<account uuid>', null);
```
`grant_platform_admin` writes an audit event. Signing up never grants review.

**Step 8 — create the MJCC Hub.**
The owner applies for beta (`lv_beta_apply`), a reviewer approves
(`lv_beta_decide`), and the owner calls `lv_hub_create('lioncafe', 'LionCafe')`.
That creates the Hub, the Owner membership, the Owner role with its capabilities,
and consumes the approval in one transaction.

**Step 9 — prove no old student data survived:**
```sql
select (select count(*) from auth.users) as auth_users,          -- expect 0 + new sign-ins
       (select count(*) from lv.accounts) as v2_accounts,         -- expect only real v2 sign-ins
       (select count(*) from lv.account_identities
         where identity_subject !~ '^[0-9a-f-]{36}$') as bad_identities, -- expect 0
       (select count(*) from information_schema.tables
         where table_schema = 'public') as legacy_tables;         -- expect 0
```
Also confirm the legacy tables are gone by name:
`select to_regclass('public.profiles') is null and to_regclass('public.responses') is null;`

## 6. How the first v2 administrator and MJCC Hub are created

See steps 7 and 8. Both are deliberate, audited operations. Neither can happen by
signing up, and neither needs a manual `UPDATE`.

## 7. Rollback limitations

**There is no rollback.** Once step 4 runs:

- The v1 data is unrecoverable. The owner has explicitly accepted this and
  declined a preservation backup.
- Supabase free-tier projects have **no point-in-time recovery**. The backup
  endpoint returned no backups on inspection.
- The schema can be recreated from migrations, but *the rows cannot be restored
  by any procedure in this repository.*
- v1 Edge Functions are deleted in step 2 and would have to be redeployed from
  `main` (their code still exists in git).

If a rollback is later required, the only path is restoring a Supabase backup
taken **before** step 3 — which is another reason to decide once, and late.

## 8. OAuth configuration that must exist first

- [ ] KpnIdentity project: OAuth server enabled.
- [ ] A LunchVoice OAuth client (client id/secret) registered at KpnIdentity.
- [ ] Exact-match redirect URIs: production `https://lunchvoice.com/...` and the
      KpnIdentity callback. No wildcards.
- [ ] KpnIdentity Site URL changed from `http://localhost:3000`.
- [ ] JWKS reachable (the real issuer, not the test issuer).

## 9. What this runbook cannot prove

- That a real Google → KpnIdentity sign-in works. The baseline is tested against
  a simulated issuer only (see `IDENTITY_CONTRACT.md` §7).
- That the Dec 11 date holds. With D-01 Option D withdrawn there is no fallback
  identity path (see `D01_IDENTITY_SUPERSESSION_2026-10-25.md`).
