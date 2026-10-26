# D-01 supersession: Google → KpnIdentity → LunchVoice is the only identity path

Recorded 2026-10-25 by the governing agent under explicit founder direction.
Status: **final**. This record supersedes parts of
[D01_IDENTITY_DECISION_PACKET.md](D01_IDENTITY_DECISION_PACKET.md) and
[PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md). Where this record and an older
document disagree, **this record wins**.

## 1. What changed

The founder withdrew **D-01 Option D** on 2026-10-25. Option D was "launch on
Supabase's built-in Google provider and add the central issuer after launch". It
is **no longer approved, unconditionally**, not even as a contingency.

The approved identity path is exactly:

```
Google  →  KpnIdentity  →  LunchVoice
```

LunchVoice **must not** own a product-specific Google authentication
implementation. It does not configure Google as a Supabase auth provider. It
does not accept a Supabase-issued Google session as proof of identity.

LunchVoice trusts **only** a verified KpnIdentity token, and identifies the
person **only** by the `(issuer, subject)` pair.

## 2. Why Option D was withdrawn

Option D kept `auth.uid()` and the existing RLS model working, which is why it
was attractive. But it puts the primary Google authentication inside the
LunchVoice Supabase project, which makes LunchVoice the owner of product-specific
identity logic — precisely what the KpnIdentity authority split forbids. Two
parallel identity models would then have to be reconciled later, with live user
data on both sides.

Architecture correctness was judged to matter more than the schedule.

## 3. Decisions now in force

| # | Decision | Supersedes |
| --- | --- | --- |
| S-1 | Option D withdrawn; Google → KpnIdentity → LunchVoice is the only path | D-01 §0 "Option D approved", §8 item 2 |
| S-2 | Identity is `(issuer, subject)`, `UNIQUE(issuer, subject)`; email is never an identity key | D-01 §4 "account-linking" where it allows email-based linking |
| S-3 | Old student accounts, responses, answers, ratings, points, reward history and legacy memberships are **not migrated** | PRODUCT_SPEC V2-02 "Migrate existing MJCC authentication and data safely"; DATA_AND_MIGRATION_PLAN §2 principle 4 |
| S-4 | LunchVoice v2 starts fresh; the old production database is v1 / retirement-pending | PRODUCT_SPEC V2-02 "Preserve identity-to-data continuity" |
| S-5 | `public.profiles` is not the v2 identity model; `role`, `is_staff`, `org_id`, `mjcc_username` are legacy authorization concepts and absent from the canonical schema | implicit in earlier plans |
| S-6 | Hubs have independent v2 identities; canonical `hubs.id` does not depend on `public.orgs(id)` | prototype migration `20261024000100` (see migration classification) |
| S-7 | The legacy bridge is removed; no old survey history is exposed in v2 | prototype migration `20261024000700` |
| S-8 | The KpnIdentity issuer/JWKS may stay configurable and simulated in tests until the real issuer is deployed | D-01 §6 spike requirement as a *precondition* to building |

## 4. Schedule risk (stated plainly, not softened)

D-01 required the Option A spike to pass by **Nov 6**, with Option D as the
insurance. **That insurance is now gone.** Consequences:

- There is no fallback. If the KpnIdentity issuer is not deployed and verified
  before the December launch, **LunchVoice v2 cannot sign anyone in at all**.
  Option D would otherwise have shipped something on Dec 11.
- The identity work is now on the critical path with a hard dependency on a
  service that does not yet exist (the KpnIdentity project is healthy but
  empty: OAuth server off, no SMTP, no OAuth client, Site URL still
  `http://localhost:3000`).
- The honest reading: **the Dec 11 date is at risk** and the risk is
  concentrated in identity, not in the product schema. The product schema can
  be built and proven locally with a simulated issuer; the login cannot be
  proven until the issuer exists.

This is recorded so that a later schedule slippage is understood as an accepted
consequence of S-1 rather than a surprise. **The identity boundary is not to be
weakened to protect the date.**

## 5. What must now be true before launch

1. A KpnIdentity project with the OAuth server enabled and a LunchVoice OAuth
   client (client id/secret, redirect URIs).
2. A discoverable issuer URL and JWKS.
3. LunchVoice's `identity.trusted_issuers` policy set to that issuer (it fails
   closed when unset — nobody is signed in).
4. One successful real end-to-end sign-in recorded, replacing the simulated one.

Items 1–3 are dashboard/configuration work requiring owner authority. None of
them requires a LunchVoice migration.

## 6. Documents updated in the same change

- `docs/backend/D01_IDENTITY_DECISION_PACKET.md` — Option D marked withdrawn.
- `docs/v2/PRODUCT_SPEC.md` — V2-02 identity and continuity wording replaced.
- `docs/backend/DATA_AND_MIGRATION_PLAN.md` — fresh-start principle added. (Deleted later the same
  day by the canonical reset; it only described a v1 migration. Git history keeps it.)
- `docs/backend/EXECUTION_ROADMAP.md` — dependency and fallback status noted.
- `CHANGELOG.md` — entry under Unreleased.

No file is left asserting the old direction.
