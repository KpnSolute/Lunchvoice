# D-01 decision packet: central identity approach

Planning deliverable, 2026-10-23. Status: **engineering recommendation for founder approval; nothing is approved,
built, configured or proven.** The founder asked that D-01 be presented as an engineering decision packet (options,
costs, migration implications) rather than something the founder must specify. Requirements come from
[PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md) V2-02/V2-03; architecture context from
[ARCHITECTURE.md](../archeture/ARCHITECTURE.md); schedule from the [roadmap](EXECUTION_ROADMAP.md) (R-06, decision due **Oct 30**).
Vendor facts below were read from Supabase and Google documentation on 2026-10-23 and are **not proof of this
project's configuration**; every row marked "unverified" must be confirmed in staging.

## 1. What must be true (confirmed requirements)

- Central KpnSolute Identity at `auth.kpnsolute.com`; Google OAuth/OIDC first, Apple later (V2-03).
- One free account can join many Hubs (V2-02); a stable verified identity key, not email alone, links accounts.
- Existing MJCC accounts, responses, points and staff access must keep working (no destructive migration).
- No email verification flow (the founder wants to avoid sending verification email).
- The Winter Survey launch is **Dec 11**; identity must be demonstrably working in staging well before the **Dec 9** review.

## 2. Options

| | A. Upstream OIDC into Supabase Auth (recommended spike) | B. Direct central-JWT trust | C. Central issuer built on Supabase OAuth server | D. Supabase built-in Google provider first (fallback) |
| --- | --- | --- | --- | --- |
| Idea | `auth.kpnsolute.com` is an OIDC issuer; MJCCv2's Supabase Auth treats it as a custom OIDC provider; the app keeps Supabase sessions | Application trusts central-issued JWTs directly (third-party auth) | Run a Supabase project as the central issuer (authorization code + PKCE, OIDC discovery) | Skip the central issuer at launch; configure Google directly in Supabase Auth; add the central issuer later |
| Keeps local UUIDs / `auth.uid()` policies | **Yes**, if linking works (to prove) | **Not by default**: non-UUID subjects conflict with `auth.uid()`; needs mapping | Applies to the central service, not LunchVoice's own auth | **Yes** |
| Meets V2-03 wording (central `auth.kpnsolute.com`) | Yes | Yes | Yes | **No at launch** (needs founder approval to defer) |
| Documented capability | Custom OAuth/OIDC providers: client ID/secret + issuer URL, discovery at `/.well-known/openid-configuration`, ID token verified against JWKS, PKCE on by default, optional `acceptable_client_ids`, `email_optional`, `skip_nonce_check` | Custom third-party OIDC: HTTPS discovery, asymmetric keys with key ID; role claim required; **no CLI config option** | Authorization-code + PKCE, OIDC discovery | Supabase's Google provider |
| Plan limits (documented) | Free plan: up to 3 custom providers; Pro and above: unlimited. MAU: Pro includes 100,000; overage $0.00325 per MAU | Third-party MAU pricing not confirmed in the pages read | Not priced in the pages read | Same MAU rules as Google social sign-in |
| New service to build/host | **Yes**: the central issuer (owner, repo and hosting not named) | Yes | Yes (plus a project to host it) | **No** |
| Migration effort (estimate) | Medium-high; depends on identity owner | High (identity mapping across all policies) | High and separate | **Low-medium** |
| Main risks | Issuer not ready by Nov 6; account-linking edge cases; hosted feature availability on this project unverified | Breaks `auth.uid()`-based RLS assumptions; hosted-only configuration | Wrong tool for LunchVoice's own identity; operational ownership unclear | Does not deliver V2-03 at launch; later switch needs another linking migration |

## 3. Recommendation

1. **Decide Option A as the target and run the staging spike (R-06, Oct 28-Nov 6).** It preserves existing UUIDs and the
   current RLS model, which is the least risky path to "one account, many Hubs".
2. **Pre-approve Option D as the contingency** so the Dec 11 launch is not hostage to the identity service: if the spike fails
   or the issuer is not ready by **Nov 6**, launch on Supabase's Google provider and move to the central issuer in the
   post-launch wave. Option D deviates from V2-03's wording and therefore **needs the founder's explicit approval**.
3. Do not choose B or C for LunchVoice's own login.
4. Name the identity-service owner by **Oct 28**; without one, Option A cannot start and D becomes the plan.

## 4. Account-linking and migration implications

Supabase's documented automatic linking joins an OAuth identity to an existing user when both share the **same email**, and
it avoids linking to accounts with unverified email to prevent pre-account takeover. Manual linking (`linkIdentity`) exists
(documented as beta) and must be enabled in configuration. SAML-originated users are not eligible. The page read does **not**
document linking behaviour for custom providers specifically: that is the first thing the spike must test.

| Existing population | Today | Risk | Proposed handling (to prove in staging) |
| --- | --- | --- | --- |
| Students (email OTP, verified email) | `auth.users` row + `profiles` | Google email may differ from school/personal email | Automatic link only when emails match and are verified; otherwise a guided manual link while signed in with the old method |
| MJCC staff (bridge via MJCCv1) | `auth.users` row created from MJCCv1 identity, `profiles.mjcc_username`, admin role | A Google account whose verified email equals a staff email could attach to an admin account | **Exclude staff accounts from automatic linking**; link manually after verifying the staff member through the existing bridge; keep the legacy path during transition; never restore revoked v2 rights |
| New users | none | none | New account from the verified issuer/subject |
| Conflicts (two accounts, one person) | n/a | duplicate or merged data | Reviewed recovery path; no silent merge |

Stable key: store `(issuer, subject)` in an identity table and never use email as the key (see the data plan). The staff
provisioning code currently links by `mjcc_username` first and falls back to email; the spike must show whether that
remains acceptable.

## 5. Identity contract the owner must supply (for Option A)

Issuer URL; discovery and JWKS endpoints; client type and allowed callback URLs per environment (local, staging, production);
stable personal-ID and email-verification claims; token lifetime, refresh and revocation; logout behaviour; key rotation;
account-linking and recovery policy; hosting and repository owner. No client secrets in the packet.

## 6. Spike scenarios (must pass in staging before Option A is accepted)

New Google user; existing OTP user (matching and non-matching email); existing MJCC staff user (no auto-link); changed
email with the same subject; conflicting account; revoked access; expired token; second-Hub access; provider outage;
wrong issuer; wrong audience; replayed callback; tampered return URL; and a check that existing response, points and order
rows remain attached to the same user ID after linking.

## 7. Costs

| Item | Estimate (public pages, re-verify) |
| --- | --- |
| Spike on staging (S-1, S-3, S-4, S-6 in the [staging manifest](../archeture/STAGING_MANIFEST.md)) | About $10-$25 per month incremental; Google client $0 |
| Custom provider on Supabase | Included on Pro (unlimited providers); free plan limit 3 |
| MAU | Pro includes 100,000; overage $0.00325 per MAU |
| Central issuer hosting | **Unknown** until the owner and hosting are chosen |
| Engineering effort | R-06: 5-8 agent-days (see roadmap), plus identity-owner time (unscoped) |

## 8. Decisions requested from the founder

1. Approve Option A as the target and the spike scope above.
2. Approve (or reject) Option D as the contingency if the issuer is not ready by Nov 6.
3. Name the identity-service owner and hosting responsibility by Oct 28.
4. Confirm that MJCC staff accounts are excluded from automatic linking.

## 9. What remains unverified

Whether this project's Supabase plan and region expose custom OIDC providers; how automatic linking behaves for a custom
provider; whether `auth.kpnsolute.com` exists in any form; Google OAuth client ownership and brand verification status;
the Supabase locked client library's support for the chosen flow. Documentation availability does not prove any of these.
