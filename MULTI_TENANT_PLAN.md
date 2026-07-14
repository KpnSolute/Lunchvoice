# Lunch Voice: single-tenant to multi-tenant "platform for hire"

## Context

Lunch Voice (this repo, currently mid-rebrand from "The Lunch Line" / "Dining Voice") has so far served
exactly one client: Miami Job Corps Center (MJCC), hardcoded throughout the app and DB. The product is
now repositioning as a service platform: Lunch Voice provides menu-management + student-feedback tooling
to *sub-contractor* cafeteria operators, each getting a scoped area of the site. The first (and today
only) contractor is **LionCafe — which is not a new client, it IS the existing MJCC data** ("LionCafe"
is the vendor/brand name for MJCC's food-service operation). So this isn't "add a second tenant next to
MJCC" — it's "wrap the existing single-tenant app and data in general multi-tenant machinery, with
LionCafe as tenant #1," so a real second contractor can be onboarded later via a migration + one `orgs`
row, no code changes.

Domain `lunchvoice.com` is already live (Render). Root `/` becomes a public marketing page (services
pitch, "request our services" lead form, org-login lookup). Each contractor's canonical address is
`https://<orgSlug>.lunchvoice.com/...`; wildcard DNS and a wildcard Render domain map that hostname onto
the existing `/:orgSlug/...` route tree. The path form remains a compatibility URL. Staff auth for
LionCafe keeps its exact current mechanism (bridges live to MJCCv1's `user_profiles.role='sudo'`) — only
cosmetic/routing changes, per the
user's explicit confirmation. A future second contractor would need their own equivalent bridge, which
this plan leaves a clear (not over-built) extension point for, without constructing it now.

Verified by reading the actual source (not summaries) — `src/main.tsx`, `src/auth/AuthProvider.tsx`,
`src/lib/supabase.ts`, all 4 edge functions, `ContentCentral.tsx`, `Store.tsx`, `Orders.tsx`,
`OrdersAdmin.tsx`, `Roster.tsx`, `Join.tsx`, `StoreAdmin.tsx`, `Layout.tsx`, `Login.tsx`, `src/types/db.ts`,
`render.yaml`, `.env.example` — and by querying the two live Supabase projects directly (table lists, all
RLS policies, all 4 RPC function bodies, the `handle_new_user()` signup trigger, and MJCCv1's actual shape,
which turned out to be MJCC's own full operations backend — inventory/invoices/HACCP/vendor management —
not a neutral identity service, and itself has no multi-tenant concept today either despite an unused
`centers` table).

### Key findings that shape this plan

- Every route file queries Supabase with **zero explicit scoping** today (`supabase.from("orders").select("*")`,
  no `.eq("student_id", ...)` anywhere) — RLS is 100% of the access control. This means once RLS requires
  `org_id`, most existing read call sites need **no code changes at all**; only inserts need `org_id` added
  explicitly.
- `Relationships: []` on every table in `src/types/db.ts` is real — no FK constraints exist in Postgres
  today. Worth fixing while every table is already being altered for `org_id`.
- Three views (`student_roster`, `dish_rating_stats`, `dish_stats`) may not have `security_invoker` set —
  if not, RLS on the underlying tables does NOT apply to them through the view, a real cross-tenant leak
  once org #2 exists (invisible today with one org). Must verify/set explicitly.
- `on_auth_user_created` trigger → `handle_new_user()` already auto-inserts a bare `profiles` row on
  student signup, reading `raw_user_meta_data->>'display_name'`. Extending it to also read `org_id` from
  the same JSON blob is a one-line change to an existing mechanism, not a new one.
- `render.yaml` bakes `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at build time, but since every org
  shares the one Supabase project (see decision below), this needs no changes — one build serves all
  `/:orgSlug` paths.
- `send-email` (Supabase Auth webhook) has no app-level request context — no org slug reaches it. OTP
  emails stay generically "Lunch Voice" branded, not per-org, for now (flagged, not silently assumed).

---

## Pushback / scope check (YAGNI-leaning — this project's stated engineering philosophy)

1. **Skip a separate `org_staff_auth_config` table.** A single `orgs.auth_provider text not null default
   'mjcc_v1_sudo'` column does the same job today. MJCCv1's URL/keys are already env-var secrets, not DB
   data, and there is exactly one org. Promote to a table only when a second bridge needs multiple rows of
   per-org config. This deviates from a literal table-per-config framing — flagging explicitly in case a
   table is still wanted for schema-clarity (it's a 5-minute add either way).
2. **Denormalize `org_id` onto every child table** rather than deriving it transitively via JOIN. Flat
   `org_id = caller_org_id()` RLS checks are simpler and faster than EXISTS-subqueries into a parent table,
   and every child table has an obvious cheap source of truth for `org_id` at insert time.
3. **No admin UI for onboarding a second contractor.** The user confirmed a second org needs "no code
   changes," which generic schema/RLS already satisfies — a second org is one manual `insert into orgs`,
   not a screen to build.
4. **Marketing home page stays to one route, one form, one table** — no CMS, no admin review screen (the
   Supabase dashboard table view is the review UI for `contract_requests`).
5. **`OrgProvider` as a context separate from (but composed with) `AuthProvider` is justified, not
   overengineering** — org must resolve *before* login (marketing/login pages need `org.name` pre-session),
   which a merged provider would complicate. Kept to ~30-40 lines: one query, one context, no caching layer.

---

## 1. Database migration plan (`qprfonxvthmaoxfixigk`)

No `supabase/migrations/` directory exists yet (confirmed). Start one now: hand-author a baseline migration
matching the current live schema (already fully retrieved via inspection — all tables, RLS policies, and
RPC bodies captured), then layer tenant changes on top. This avoids noisy `pg_dump` output and gives every
future change a real history.

**Migration 0001 — baseline.** Capture current schema/RLS/RPCs as-is (no behavior change) so
`supabase/migrations/` has one commit matching production before tenant work starts. Mark-as-applied
against the live project rather than re-running it (it already exists live).

**Migration 0002 — `orgs` table.**
```sql
create table orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  auth_provider text not null default 'mjcc_v1_sudo',
  created_at timestamptz not null default now()
);
insert into orgs (slug, name) values ('LionCafe', 'Miami Job Corps Cafeteria');
create unique index orgs_slug_lower_idx on orgs (lower(slug));
create policy orgs_select_public on orgs for select using (true); -- needed pre-login to resolve slug
```
Store the canonical slug as given ("LionCafe") but resolve lookups case-insensitively
(`lower(slug) = lower($1)`) so `/lioncafe` and `/LionCafe` both work.

**Migration 0003 — `org_id` columns, backfill, FKs.** Safe non-destructive order for live data (4 profiles,
5 store_items, 1 menu_cycle/28 days, 4 dish_ratings):
1. `alter table <t> add column org_id uuid references orgs(id)` (nullable) on all 14 tables: `profiles`,
   `sessions`, `session_members`, `survey_templates`, `survey_questions`, `survey_answers`, `responses`,
   `response_ratings`, `dish_ratings`, `voice_notes`, `menu_cycles`, `menu_cycle_days`, `store_items`,
   `orders`.
2. `update <t> set org_id = (select id from orgs where slug = 'LionCafe')` on all 14 — backfills every
   existing row to the one org.
3. Verify `select count(*) from <t> where org_id is null` = 0 for every table, THEN
   `alter table <t> alter column org_id set not null` + `create index <t>_org_id_idx on <t>(org_id)`.
4. While every table is already being altered, add the missing parent-child FKs that `Relationships: []`
   was flagging: `survey_questions.template_id → survey_templates(id)`,
   `menu_cycle_days.cycle_id → menu_cycles(id)`, `sessions.template_id → survey_templates(id)`,
   `sessions.menu_cycle_id → menu_cycles(id)`, `session_members.session_id → sessions(id)`,
   `responses.session_id → sessions(id)`, `response_ratings.response_id → responses(id)`,
   `survey_answers.response_id → responses(id)`, `survey_answers.question_id → survey_questions(id)`,
   `orders.store_item_id → store_items(id)`. Confirm no orphaned rows first (trivial with 4 rows or fewer
   in the smaller tables).

**Migration 0004 — views.** Check `select relname, reloptions from pg_class where relname in
('student_roster','dish_rating_stats','dish_stats')`. If `security_invoker` isn't already on:
```sql
alter view student_roster set (security_invoker = on);
alter view dish_rating_stats set (security_invoker = on);
alter view dish_stats set (security_invoker = on);
```
then `create or replace` each view to include `org_id`, relying on RLS-scoped base tables. **Not
optional** — verify before considering the tenant boundary safe.

**Migration 0005 — `contract_requests`** (marketing lead form, no `org_id` — pre-tenant root data):
```sql
create table contract_requests (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  contact_name text not null,
  contact_email text not null,
  message text,
  created_at timestamptz not null default now()
);
alter table contract_requests enable row level security;
create policy contract_requests_insert on contract_requests
  for insert to anon, authenticated with check (true);
```
No select/update/delete policy — reviewed via the Supabase dashboard table view, not an app screen.

**Migration 0006 — RLS rewrite.** Add one reusable helper (mirrors the existing `is_admin()` pattern):
```sql
create or replace function caller_org_id() returns uuid
language sql security definer stable set search_path = public
as $$ select org_id from profiles where id = auth.uid() $$;
```
Then rewrite every existing policy (full list already retrieved from the live DB) to AND in
`org_id = caller_org_id()`, e.g.:
```sql
-- before: orders_select: (student_id = auth.uid()) OR is_admin()
create policy orders_select on orders for select using (
  org_id = caller_org_id() and (student_id = auth.uid() or is_admin())
);
-- before: sessions_select: (is_active OR is_admin())
create policy sessions_select on sessions for select using (
  org_id = caller_org_id() and (is_active or is_admin())
);
```
Repeat 1:1 across every table's policies. Insert policies additionally need
`with check (org_id = caller_org_id())` so a client can't write into another org even by sending a
different `org_id` value.

**Migration 0007 — RPC rewrites** (all 4 stay `SECURITY DEFINER`, same signatures — `org_id` is always
derived server-side via `caller_org_id()`, never a client argument):
- `is_admin()` — no change; correct once `profiles.org_id` exists (RLS ANDs it in separately).
- `join_session(p_code)` — add `and org_id = caller_org_id()` to the `sessions` lookup; set `org_id` on
  the `session_members` insert.
- `redeem_item(p_item_id)` — add `and org_id = caller_org_id()` to the `store_items` lookup; set `org_id`
  on the `orders` insert.
- `submit_response(...)` — add `org_id = caller_org_id()` to the session-open/membership checks; set
  `org_id` on the `responses`/`response_ratings`/`survey_answers` inserts.

### Migration risk / rollback
- **Order matters**: nullable-add → backfill → verify zero-null → not-null → RLS rewrite → RPC rewrite.
  Never flip to `not null` before the backfill is verified; never rewrite RLS before `org_id` is backfilled
  everywhere (a policy checking `org_id = caller_org_id()` against a null-org_id row silently hides it
  rather than erroring — verify counts, don't trust "no errors").
- **Verify row counts** before/after every ALTER/UPDATE — none should change row counts. Known live counts
  (4 profiles, 5 store_items, 1 menu_cycle/28 days, 4 dish_ratings) make this a cheap, exact check.
- **Test RLS after rewrite**: as an authenticated non-admin student, confirm reads only return LionCafe's
  own rows — trivially true today with one org, but confirms policy syntax is actually correct (a mistake
  that accidentally evaluates to `true` is invisible with one org and only bites once org #2 exists).
- **Apply directly to production, in strict order, with a verification query after every step** (user's
  explicit choice — no Supabase branch). Sequence: add nullable `org_id` columns → backfill → verify zero
  nulls → set not-null + indexes → add missing FKs → views → RLS rewrite → RPC rewrite. Run the row-count
  and null-count checks from above after each migration file, not just at the end, so a mistake surfaces
  immediately at the step that caused it rather than after several compounded changes. Because there are
  only 4 profiles, 5 store_items, 1 menu_cycle (28 days), and 4 dish_ratings live, every check is a fast,
  literal `select count(*)` — there's no reason to skip one to save time.

---

## 2. Routing restructure

**`src/main.tsx` — new top-level shape:**
```tsx
<Routes>
  <Route path="/" element={<Home /* marketing */ />} />
  <Route path="/:orgSlug/*" element={<OrgProvider><OrgApp /></OrgProvider>} />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```
`OrgApp` is today's `<App />` (the `Gate` + `Layout` + all existing student/admin routes), nested one level
under `:orgSlug` with relative paths (`login`, `join`, `rate`, `admin/content`, ...) — react-router resolves
these without literal `/LionCafe/` prefixes anywhere. `/LionCafe` alone (index) resolves to student Home if
logged in or Login if not, same as today's `/` — `Gate`'s existing `!session → redirect to login` logic
covers this once `login` is a sibling route under the same `:orgSlug` prefix; no separate "org landing page"
needed.

**New `src/org/OrgProvider.tsx`** (~30-40 lines):
```tsx
type OrgCtx = { org: { id: string; slug: string; name: string } | null; loading: boolean; notFound: boolean };
const Ctx = createContext<OrgCtx | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams();
  const [state, setState] = useState<OrgCtx>({ org: null, loading: true, notFound: false });
  useEffect(() => {
    supabase.from("orgs").select("id, slug, name").ilike("slug", orgSlug!).maybeSingle()
      .then(({ data }) => setState({ org: data, loading: false, notFound: !data }));
  }, [orgSlug]);
  if (state.loading) return <div className="wrap center muted">Loading...</div>;
  if (state.notFound) return <NotFoundOrg slug={orgSlug} />;
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export function useOrg() { const c = useContext(Ctx); if (!c) throw new Error("useOrg outside OrgProvider"); return c!; }
```
Requires an RLS policy on `orgs` allowing anonymous select (see migration 0002 — needed pre-login, to
resolve the slug before a session exists).

**Threading `org_id` through ~15 route files — do NOT rewrite every query by hand.** RLS already filters
every read today with zero explicit client-side scoping; once RLS requires `org_id = caller_org_id()`,
that stays true automatically since it's derived from the logged-in user's own `profiles.org_id`, not
anything the client sends.
- **Reads**: zero changes in ~10 of ~15 route files — `Store`, `Orders`, `OrdersAdmin`, `Roster`,
  `MenuPage`, `Surveys`, `Voice`, `Survey`, `Sessions`, `Dashboard`.
- **Inserts** need `org_id` added explicitly (RLS `with check` still requires the client to send a
  matching value):
  - `ContentCentral.tsx` — `createTemplate`, `createDiningVoiceTemplate` (2 inserts), `addQuestion`,
    `importStaticMenu` (2), `importPastedMenu` (2), `importWorkbookMenu` (2), `launchSession` — ~10 insert
    call sites in this one file, each gets `org_id: org.id` added to an existing object literal.
  - `StoreAdmin.tsx` — exactly one insert (`create`, ~line 28: name/description/token_cost/stock) needs
    `org_id: org.id`. Its other mutation (`toggle`, ~line 46, `.update({is_active:...}).eq("id", item.id)`)
    needs no change — RLS scopes it for free.
- `org_id` reaches these call sites via `useAuth()` — extend it to expose `org_id` directly (resolved
  through `OrgProvider` + the caller's own profile) so each site adds one field, no prop drilling.

**`OrgProvider` and `AuthProvider` stay separate but compose** (`OrgProvider` wraps `AuthProvider`) rather
than merging into one provider — org must resolve pre-login, which a merged design (gated on
session/profile existing) would complicate. `AuthProvider` gains one small addition: when `loadProfile`
runs, cross-check `profile.org_id` against `useOrg().org.id` — on mismatch (stale bookmark / shared-device
edge case loading a session under the wrong org's URL), treat as logged out for this org context. A small
conditional in the existing callback, not a new subsystem.

**New-student `org_id` assignment — resolved via live trigger inspection.** `on_auth_user_created` (AFTER
INSERT on `auth.users`) calls `handle_new_user()`, which inserts the bare `profiles` row reading
`new.raw_user_meta_data->>'display_name'` — this is why `Login.tsx` only ever `.update()`s `profiles`,
never `.insert()`s. Extend the trigger the same way:
```sql
insert into public.profiles (id, email, display_name, org_id)
values (
  new.id, new.email,
  coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
  (new.raw_user_meta_data->>'org_id')::uuid
);
```
`login-start` (which sends the actual OTP via `signInWithOtp`) passes `options: { data: { org_id: org.id } }`
so it flows through the same mechanism. This makes `profiles.org_id` non-null from the very first row —
no RLS carve-out needed for "setting org_id the first time"; `profiles_update_own` stays the simple
`id = auth.uid()` check it is today (`org_id` just isn't client-writable, same as `role`/`points`/`streak`).

---

## 3. Auth edge function changes

All three edge functions gain one new required body param: `org` (slug string). Each resolves it first:
```ts
const { data: org } = await v2admin.from("orgs").select("id, auth_provider").ilike("slug", orgSlug).maybeSingle();
if (!org) return json(req, { error: "Unknown organization." }, 404);
```
Then branch on `org.auth_provider` — today only `"mjcc_v1_sudo"` exists, so this is one `if`, not a
registry/strategy pattern: `if (org.auth_provider === "mjcc_v1_sudo") { /* existing MJCCv1 bridge, unchanged */ }
else { return json(req, { error: "Staff login not yet configured for this organization." }, 501); }` — this
is the extension point for a future contractor's own bridge, without building that bridge's shape now.

- **`login-start`**: add `org` to the request body, thread `org.id` into the student lookup
  (`.eq("org_id", org.id).ilike("email", email)`) so an email is only "returning" within its own org.
  Staff-username lookup path is unchanged (there's one MJCCv1 bridge, belongs to this one org).
  `STAFF_DOMAIN` stays hardcoded exactly as today; only cosmetic copy may change.
- **`staff-login`**: add `org` param, resolve the org row, add `org_id: org.id` to the existing
  `profiles` upsert (`role: "admin", is_staff: true, mjcc_username: ...`) — this is the one line that
  actually scopes a provisioned staff account to LionCafe. The MJCCv1 bridge call itself (URL/keys, sudo
  check) is byte-for-byte unchanged.
- **`staff-status`**: no org param needed (re-validates an existing session via bearer token); no
  functional change beyond confirming its existing profile `.select()` still works alongside the new
  not-null `org_id` column (it will — that select doesn't reference `org_id`).

Client side (`src/lib/supabase.ts`): `beginLogin`, `staffLogin` gain an `org: string` (slug) parameter,
threaded from `useOrg().org.slug` at their two call sites in `Login.tsx`. `verifyStaffAccess` needs no
signature change.

---

## 4. New home page + contract-request feature

`<Route path="/" element={<Home />} />` — sibling of `/:orgSlug/*`, not nested under it (the one route
with no org context).

New files:
- `src/routes/marketing/Home.tsx` — hero copy ("Lunch Voice: menu management + student feedback for
  cafeteria operators"), a "Request our services" form, and an org-login lookup control.
- Contract-request form (inline in `Home.tsx` unless it grows large enough to justify a split during
  implementation — don't pre-split speculatively): controlled inputs (org name, contact name, email,
  message) → `supabase.from("contract_requests").insert({...})` using the existing shared anon client.
- Org-login lookup: simplest version — a text input + "Go" button navigating to `/${slug.trim()}/login`
  unconditionally, letting `OrgProvider`'s not-found state show a friendly "no such organization" screen.
  Pre-validating the slug before navigating adds a round trip for no real benefit — the not-found screen
  is required anyway for mistyped URLs.
- `src/routes/marketing/NotFoundOrg.tsx` — small, shown by `OrgProvider` when a slug doesn't resolve.

`contract_requests` table: see migration 0005 — insert-only RLS, reviewed via the Supabase dashboard, no
app admin screen (ladder rung 1: doesn't need to exist yet).

---

## 5. Rebrand pass (fold into the work above, not a separate pass)

Do this as each file is touched for the org work:
- `index.html` — "Dining Voice" → "Lunch Voice" in title/meta.
- `Layout.tsx` — brand mark/name → "Lunch Voice"; the "Miami Job Corps" sub-line becomes
  `useOrg().org.name` now that it's dynamic. Bottom-nav paths (`/`, `/rate`, `/admin`, ...) must become
  relative (no leading slash) once nested under `/:orgSlug` — required for routing to work, not just
  cosmetic, so in scope regardless of the rebrand.
- `Login.tsx` — heading becomes "Lunch Voice" or shows `org.name` (arguably better UX: contractor name up
  front, "Lunch Voice" as a small "powered by" tag). Touched anyway for org param plumbing.
- `supabase/functions/send-email/index.ts` — copy → "Lunch Voice" (stays generic/global per the flagged
  limitation above — no org context reaches this webhook without extra plumbing not in scope here).
- `README.md`, `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `CLAUDE.md` — mechanical find/replace, batch as one
  small commit separate from the functional changes for easy review/revert.

---

## Summary of new/changed files

**New:**
- `supabase/migrations/0001_baseline.sql` … `0007_rpc_org_aware.sql`
- `src/org/OrgProvider.tsx`
- `src/routes/marketing/Home.tsx` (+ contract-request form, inline or split)
- `src/routes/marketing/NotFoundOrg.tsx`

**Changed:**
- `src/main.tsx` (route tree restructure)
- `src/auth/AuthProvider.tsx` (org/profile mismatch guard; expose `org_id`)
- `src/lib/supabase.ts` (`beginLogin`/`staffLogin` gain `org` param)
- `src/routes/Login.tsx` (org param threading, rebrand copy)
- `src/components/Layout.tsx` (relative nav paths, dynamic org name, rebrand)
- `src/routes/admin/ContentCentral.tsx` (`org_id` on ~10 insert call sites)
- `src/routes/admin/StoreAdmin.tsx` (`org_id` on 1 insert call site)
- `supabase/functions/login-start/index.ts`, `staff-login/index.ts` (org param + `org_id` stamping)
- `supabase/functions/send-email/index.ts` (rebrand copy only)
- `src/types/db.ts` (regenerate via `generate_typescript_types` after migrations)
- `index.html`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `CLAUDE.md` (rebrand pass)

**Unchanged** (confirmed by reading — RLS scopes these for free):
`src/routes/student/{Store,Orders,MenuPage,Surveys,Voice,Survey,Join}.tsx`,
`src/routes/admin/{OrdersAdmin,Roster,Sessions,Dashboard}.tsx`

---

## Verification plan

Per the user's explicit choice, migrations apply directly to production (`qprfonxvthmaoxfixigk`) — no
Supabase branch. Verification happens at each step in place, not as a separate pre-merge pass:

1. **After each migration file (0002-0007)**: run the row-count / null-count checks from the "Migration
   risk / rollback" section before moving to the next file. Do not batch multiple migrations before
   checking — a mistake must surface at the step that caused it.
2. **After 0006 (RLS rewrite)**: as an authenticated non-admin student, confirm reads only return
   LionCafe's own rows (trivially true today with one org, but confirms the policy syntax is actually
   correct and not silently permissive).
3. **`npx tsc --noEmit` + `npm run build`** locally against regenerated types (`generate_typescript_types`)
   once all migrations are applied, before touching route/component code.
4. **Manual smoke test against production** once the app-side changes are deployed: student email OTP
   signup+login under `/LionCafe/login`, join a session via code, submit a survey response (points/streak
   update correctly), redeem a store item (points decrement, order created), staff login via MJCCv1 sudo
   credential, Content Central create a template/menu cycle/session (each insert lands with the correct
   `org_id`), marketing page contract-request form submits successfully, an unknown org slug
   (`/NotARealOrg`) shows the not-found screen instead of crashing.
5. Spot-check the live site's login flow once at `https://lunchvoice.com/LionCafe/login` after deploy.
