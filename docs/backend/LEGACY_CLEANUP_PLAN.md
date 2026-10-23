# Legacy cleanup plan (database and Edge Functions)

Status: **proposal; items marked Done were applied to production on 2026-10-23, the rest need the founder's approval.** The
founder asked to clean up the database and remove old Edge Functions while building the v2 shell. This plan separates what is
dead (safe now) from what is still the live path for existing users (remove only after its replacement works). Production facts
come from read-only catalog queries through the project MCP server on 2026-10-23.

**Why not delete everything legacy today.** The live app (137 profiles, of which 3 staff) signs in through `login-start`
(student email codes), `send-email` (delivers those codes), `staff-sso` / `staff-status` (MJCC staff). v2 sign-in does not exist
yet. Removing these now would lock out every current user and remove the Winter Survey fallback. Edge Function deletion is also not
available through the database MCP server; it is done from the Supabase dashboard or CLI with a token.

## Done (applied and recorded)

| Item | What | Evidence |
| --- | --- | --- |
| `public.process_ledger_entry()` | Dropped: updated a nonexistent `items` table (MJCCv1 inventory leftover); zero dependents | Migration `20261023234120_drop_orphan_ledger_function` (PR #9) |
| Direct client writes | Revoked on RPC-owned tables and anonymous write grants; org-only insert policies dropped | Migration `20261023234117_restrict_client_write_paths` (PR #9) |
| Profile self-service writes | Column-limited, trigger-protected | Migration `20261023225534_restrict_profile_self_service_columns` (PR #7, merged) |

## Edge Functions

Usage below is from reading the app source; **runtime call volume was not obtained** (the log tables were not queryable through
the tool), so confirm in the dashboard (Edge Functions, Invocations) before removing anything.

| Function | Called by the app today? | Needed for | Safe to remove | Condition |
| --- | --- | --- | --- | --- |
| `staff-login` | **No** (no call in `src/`) | Legacy password rollback for staff if MJCC SSO fails | Yes, once you accept losing that rollback | Founder approval; also retire MJCCv1 password login |
| `login-start` | Yes (`beginLogin`) | Student email-code sign-in; staff username check | After Google sign-in is live and existing students are migrated | v2 sign-in verified; fallback decision (D-01 Option D) |
| `send-email` | Indirectly (Supabase Auth hook) | Delivers email codes through Azure | After `login-start` is retired **and** the Auth Send Email hook is disabled first | Disable the hook before deleting, or Auth email breaks |
| `staff-sso` | Yes (staff callback) | MJCC staff sign-in | After the staff-bridge decision (open question) and a replacement staff path | Founder decision; named staff mapped to Hub roles |
| `staff-status` | Yes (profile load for staff) | Revokes staff when MJCC access is withdrawn | With `staff-sso` | Same |
| `menu-sync` | Not from the browser; external events and manual calls | MJCC menu CloudEvents (3 receipts recorded in production) and manual sync | After MJCC/KpnCompute stops sending events and the connector decision (D-13) | Disable the upstream subscription first (not ours), else it receives errors |

Removal procedure per function: (1) confirm zero recent invocations, (2) remove or disable callers (app code, Auth hook, upstream
webhooks) in a PR, (3) delete the function with the Supabase CLI or dashboard, (4) delete its source in a follow-up PR. The source
stays in git history, so a function can be redeployed.

## Database candidates (need decisions)

| Item | Why it exists | Remove when |
| --- | --- | --- |
| `kpnsolute_event_receipts`, `apply_kpnsolute_menu_event()` | `menu-sync` CloudEvents idempotency | With `menu-sync` (3 rows) |
| `profiles.mjcc_username`, `profiles.is_staff`, `orgs.auth_provider` (`mjcc_v1_sudo`) | MJCC staff bridge | When the staff bridge is retired and memberships replace roles |
| Policy `profiles_insert_trigger` (`WITH CHECK (true)`) | Old trigger-insert policy; API roles no longer hold INSERT | Next migration (harmless, misleading) |
| `anon` EXECUTE on `join_session`, `redeem_item`, `submit_response` | Default grants; the functions fail closed without a profile | Next migration (hardening) |
| `student_roster` view, dish views | Used by the app | Keep |
| `menu_cycles`, `menu_cycle_days`, `dish_ratings`, `voice_notes`, `store_items`, `orders` | Live LionCafe dining features | Keep (they become LionCafe Hub features) |
| `contract_requests` | Marketing form (0 rows) | When the waitlist replaces it |

## Repository cleanup (separate PRs)

- Reconcile migration history with production (data plan, section 8a), including the missing `qualify_kpnsolute_cycle_id` migration
  and production-only column defaults (for example `student_id default auth.uid()` on `dish_ratings` and `voice_notes`).
- Remove dead code with each retirement (for example `staff-login` source, `StaffSsoCallback` once SSO is retired).

## Approval requested

1. **Now:** delete `staff-login`? (Not called by the app; removes the staff password rollback.)
2. **At the identity cutover (M1):** retire `login-start`, `send-email` (after disabling the Auth hook).
3. **After the staff-bridge and connector decisions:** retire `staff-sso`, `staff-status`, `menu-sync` and the related tables/columns.
4. Next small migration: drop `profiles_insert_trigger`, revoke `anon` EXECUTE on the three RPCs.
