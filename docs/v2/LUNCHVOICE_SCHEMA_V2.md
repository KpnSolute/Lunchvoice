# LunchVoice v2 canonical schema

2026-10-25. The fresh-start schema. A **blank database** plus these migrations is
a complete, valid LunchVoice v2 installation.

Companions: [IDENTITY_CONTRACT.md](IDENTITY_CONTRACT.md),
[KPNIDENTITY_SCHEMA_V1.md](KPNIDENTITY_SCHEMA_V1.md),
[migration classification](../backend/V2_MIGRATION_CLASSIFICATION.md).

## 1. Principles

1. **Fresh install, not a migration.** No legacy table is required to exist. The
   canonical set must apply to an empty database.
2. **Identity is `(issuer, subject)`.** Email is an attribute.
3. **Product authorization is LunchVoice's alone.**
   `accounts → hub_memberships → membership_roles → role_capabilities`.
4. **Hubs are independent.** `hubs` has its own UUID and slug. No dependency on
   `public.orgs`.
5. **Anonymity is structural, not cosmetic.** No join path from a person to an
   anonymous answer.
6. **`public.profiles` is not the identity model.** `role`, `is_staff`, `org_id`,
   `mjcc_username` are absent from the canonical schema.
7. **Private by default.** Everything lives in a non-exposed schema; the API
   surface is an explicit set of functions.

## 2. Schema layout

| Schema | Exposure | Contents |
| --- | --- | --- |
| `lv` | **not exposed** to the Data API | all tables |
| `lv_api` | exposed | `lv_*` functions only; the entire public surface |
| `lv_private` | not exposed | helper functions the API uses internally |

Tables are never granted to `anon`/`authenticated`. Every read and write goes
through a function that applies the authorization and privacy rules. RLS stays
enabled on every table as defence in depth.

## 3. Baseline migrations

Numbered `000001`-style so a fresh install reads top to bottom. (The prototype's
`2026102…` timestamps are not reused: they encode prototype ordering, not a
design.)

| File | Domain |
| --- | --- |
| `000001_v2_core.sql` | schemas, extension setup, `policy`, `accounts`, `account_identities`, `hubs`, `hub_memberships`, `audit_events` |
| `000002_v2_authorization.sql` | `roles`, `role_capabilities`, `membership_roles`, Owner protection, capability checks |
| `000003_v2_campaigns.sql` | `campaigns`, `campaign_questions`, entitlements, activation gate |
| `000004_v2_participation.sql` | `participation_receipts`, `submissions`, `answers`, duplicate prevention |
| `000005_v2_privacy_analytics.sql` | result views/functions, cohort suppression, anonymity boundary |
| `000006_v2_platform.sql` | beta applications, reserved slugs, invitations, platform admins |

Each file is self-contained and rolls back cleanly (`supabase/rollbacks/`).

## 4. Core tables

### 4.1 Identity

```
accounts (id uuid pk, display_name text, created_at)
account_identities (id uuid pk,
                    account_id → accounts,
                    identity_issuer text not null,
                    identity_subject text not null,
                    email text, email_verified_at timestamptz,
                    created_at,
                    UNIQUE(identity_issuer, identity_subject))
```

- `identity_subject` is TEXT (not uuid) so a non-UUID subject from a future
  issuer cannot break insertion; the *validator* requires a UUID today.
- No `auth_user_id` column. LunchVoice sessions are its own concern; the
  prototype's `urn:lunchvoice:legacy-auth-user` synthesis is gone.

### 4.2 Hubs and membership

```
hubs (id uuid pk, slug text unique, display_name text,
      visibility public|private,
      membership_mode open|approval|invite_only,
      owner_account_id → accounts,
      created_at)
hub_memberships (id uuid pk, hub_id → hubs, account_id → accounts,
                 status pending|accepted|removed|suspended,
                 accepted_at, created_at,
                 UNIQUE(hub_id, account_id))
```

- `hubs.slug`: lowercase, `[a-z0-9-]{3,40}`, reserved-slug guarded.
- Exactly one Owner, expressed as `hubs.owner_account_id` **and** asserted equal
  to the membership carrying the Owner role.

### 4.3 Authorization

```
roles (id, hub_id → hubs, key text, name text, is_owner boolean, is_system boolean,
       UNIQUE(hub_id, key))
role_capabilities (role_id → roles, capability text, PRIMARY KEY(role_id, capability))
membership_roles (membership_id → hub_memberships, role_id → roles,
                  PRIMARY KEY(membership_id, role_id))
```

- `membership_roles` is scoped through the membership, which is scoped to a Hub,
  so **a role cannot leak across Hubs** — enforced by a trigger, not by hope.
- Owner role is protected: cannot be deleted, cannot be granted to a second
  membership while one exists.
- Capabilities are strings like `admin.members.admit`, `campaign.manage`.

### 4.4 Campaigns and participation

```
campaigns (id, hub_id, title, mode survey|poll|rating|feedback,
           anonymity anonymous|identified,
           audience members|invited,
           status draft|active|closed,
           opens_at, closes_at, revision int, created_at)
campaign_questions (id, campaign_id, position, kind, prompt, config jsonb)

participation_receipts (id, campaign_id, subject_ref bytea/hash, created_at)
submissions (id, campaign_id, receipt_id → participation_receipts, created_at)
answers (id, submission_id → submissions, question_id, value jsonb)
```

**The anonymity boundary, concretely.** Adopted from prototype migration
`20261024000400`, which had the right idea and enforced it with triggers rather
than convention:

- **Participation** (`campaign_participation`) records *who* took part and carries
  `account_id` — it must, to prevent duplicates and to grant rewards.
- **Answers** (`campaign_answers`) carry `account_id` only for identified
  Campaigns. For an anonymous Campaign it is **stored as NULL**.
- **The link between them** (`participation.response_id`) is **stored as NULL**
  for an anonymous Campaign.
- Two triggers enforce both (`check_answers`, `check_participation_link`), so a
  future code path cannot re-create the join even by accident.

The result: for an anonymous Campaign there is **no stored join path** from a
person to their answers, in either direction. This is stronger than hashing an
account id, because it does not depend on the hash staying unbreakable — the
link is simply absent.

Duplicate prevention is `UNIQUE(campaign_id, account_id)` on participation,
which is safe because it never touches the answers.

**Residual risk, stated honestly:** participation and answers are still written
in one transaction, so an operator with live database access *could* observe
correlation in WAL or timing. The database has no join, which defeats API-level
and admin-level disclosure; it does not defeat a privileged observer at write
time. Closing that fully needs delayed/batched answer writes and is a candidate
for a later migration, not for the baseline.

### 4.5 Analytics

Results are computed by functions, never by exposing rows:

- Aggregates only; no per-submission rows reach a Hub admin.
- Any cohort below the configured minimum returns **NULL, never 0** — a zero is
  itself a disclosure.
- Text answers are only returned above the threshold, and never with ordering
  that reveals submission sequence.

### 4.6 Platform

```
beta_applications (id, account_id, status, decided_by, decided_at, note, created_at)
reserved_slugs (slug text pk, reason text)
platform_admins (account_id pk → accounts, granted_by, granted_at, revoked_at)
audit_events (id, occurred_at, actor_account_id, hub_id, action, target, detail jsonb)
```

## 5. Session model

LunchVoice issues its own session after verifying a KpnIdentity token. The
`lv_api` functions identify the caller from that session's verified claims and
resolve `(issuer, subject)` → `account_id`. A browser-supplied account id is
never trusted.

## 6. Not carried over

| Legacy concept | Treatment |
| --- | --- |
| `public.profiles` as identity | removed from canonical model |
| `profiles.role`, `is_staff`, `org_id`, `mjcc_username` | not in canonical schema |
| `public.orgs` as Hub parent | Hubs independent |
| legacy bridge / archived survey history | removed |
| `auth_user_id`-keyed identities | replaced by `(issuer, subject)` |
| points / streaks / rewards ledger | **product decision pending** — see open questions |

## 7. Open questions

1. **Points and rewards.** The old system awarded points for participation. The
   canonical schema above does not model them. If rewards survive as a v2
   feature they need their own migration, and they interact with anonymity
   (a points ledger is an identity-attached participation record). **Not built
   until decided.**
2. **Entitlements/plans.** Prototype migration 3 carries entitlement logic; only
   the activation-gate half is in the baseline. Plan semantics remain open.
3. **Guest participation.** The contract permits guest answers; v1 baseline
   supports members only. Guest tokens are open (D-03).
