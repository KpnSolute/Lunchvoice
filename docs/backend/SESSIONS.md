# Staying signed in for 30 days: design report (not implemented)

Status: proposal. Nothing here is built; `000049_v2_device_sessions.sql` was deliberately not written.

**Decision 2026-11-13 (founder): the proxy is a Cloudflare Worker.** The owner decisions at the end of this file are
answered in `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md` section 3: the Worker runs on its own Custom Domain
`auth.lunchvoice.com` (a Worker on `lunchvoice.com/auth/*` would not run in front of Render while the apex is a
proxied A record), and the cookie is host-only on that host (`__Host-` prefix), which is same-site with `lunchvoice.com`
and every tenant host, so no tenant host ever receives it. The build is planned for the week of 2026-11-16.

## Today

`src/lib/transport.ts` runs Supabase with `persistSession: false`. The KpnIdentity ID token is exchanged by the
`session` Edge Function for a short-lived LunchVoice session (`expiresIn`, up to an hour) kept in `localStorage`
(`lv.session`). When it ends the person is signed out and the KpnIdentity flow runs again.

## Target design

A rotating refresh credential, issued by the `session` function and delivered only as a cookie:

- Opaque 256-bit random value, stored as a SHA-256 hash with `family_id`, device label, `created_at`, `last_used_at`,
  `expires_at` (sliding 30 days), `revoked_at`, and `replaced_by`.
- Rotated on every use. Presenting an already-used value is reuse: revoke the whole family (token theft signal).
- Cookie: `__Host-lv_rt; HttpOnly; Secure; SameSite=Lax; Path=/auth/refresh; Max-Age=2592000`. (`__Host-` forbids a
  `Domain` and requires `Path=/`, so use `__Secure-` with the narrow path if the narrow path is wanted.)
- Refresh endpoint requires a custom header (`x-lv-csrf: 1`), checks `Origin` against the LunchVoice allow-list, and only
  then enables CORS credentials for those origins. Sign-out revokes the credential and clears the cookie; "Sign out
  everywhere" revokes every family for the profile.
- Table: RLS on, no API-role grants, `service_role`-only functions (as `lv.session_exchange_consume` in 000018).
- Account page: "Signed-in devices" (label, last active, revoke), "Sign out everywhere", and a "Keep me signed in on this
  device" choice, default on, off for shared computers.

## Blocker: the cookie must be first-party

The function lives on `qprfonxvthmaoxfixigk.supabase.co`, a different site from `lunchvoice.com`. A cookie set there is
third-party, so Safari (ITP) and browsers that block third-party cookies drop it; HttpOnly does not change that.

| Route | First-party? | Finding |
| --- | --- | --- |
| Render static-site rewrite `/auth/*` to the function URL | Yes if it proxies | Render documents that a rewrite destination may be a full public URL. It does not document that POST bodies, `Cookie` and `Set-Cookie` headers pass through, and rewrites do not apply to a path where a file exists. Not verifiable from docs; would need a throwaway Render service to test, which is outside this task. |
| Supabase custom domain (e.g. `api.lunchvoice.com`) | Same-site, but a CNAME to supabase | Paid add-on, not covered by the spend cap. A CNAME-cloaked subdomain is treated by Safari as third-party for cookie lifetime: server-set cookies are capped to 7 days, defeating the 30-day goal on iOS and macOS Safari. |
| Small Render web service or a Cloudflare Worker (`workers/` exists) on `lunchvoice.com/auth/*` that calls the function server-side and sets the cookie | Yes | Reliable; the cookie is set by lunchvoice.com itself. Costs one more service (Worker on a route for the zone, or a Render web service behind a rewrite, which still depends on rewrite pass-through). A Worker route needs the zone on Cloudflare. |
| JS-readable token in `localStorage` with a shorter life (7 days, rotating) | n/a | Works everywhere, no infrastructure, but readable by any XSS. The brief said not to do this silently. |

## Recommendation and owner decisions

Use the Cloudflare Worker route (or a tiny Render web service) for `/auth/*`, then build the design above. Decisions
needed from the owner: (1) which proxy, and whether lunchvoice.com DNS can route `/auth/*` to it; (2) whether tenants'
`<slug>.lunchvoice.com` hosts need the same path (cookie host scope; a per-host cookie means signing in once per host, or
set the cookie on the apex with `Domain=lunchvoice.com`, which then cannot use the `__Host-` prefix); (3) approval for the
migration and Edge Function deploy; (4) no KpnIdentity or KpnAuth setting needs to change for this design.

Heavy testing applies when built (auth/RLS): `npm run test:pr`, `npm run test:functions`, pgTAP
`supabase/tests/49_device_sessions.sql`, `npm audit --audit-level=high`, full e2e.
