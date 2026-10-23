# Backend stack decision (proposal, D-14)

Status: **engineering recommendation for founder decision; nothing here is approved or built.** Written 2026-10-23 in
response to the founder's question about storage (Postgres), Redis, Python for the API and possibly Rust, with the plan to
build the full backend first, delegate it to agents against the provided template UI, and have a separate Claude (with
Claude Design) build the frontend afterwards. Related: [architecture](ARCHITECTURE.md), [API contracts](../backend/API_AND_AUTHORIZATION_CONTRACTS.md),
[roadmap](../backend/EXECUTION_ROADMAP.md) (M1 = MJCC beta Dec 11, M2 = main release Dec 23).

## 1. What drives the choice

- **Scale is small; correctness and security are the risks.** Today: 137 profiles, 72 responses, one tenant. Beta: up to 50 Hub
  owners. The MJCC Winter Survey is on the order of a few hundred respondents. Throughput will not decide the stack.
- **The hard problems are invariants:** tenant isolation, role/permission checks, atomic quota and gate enforcement,
  the anonymity boundary, idempotent billing and reservation clocks. These must hold no matter which language the API uses.
- **Delivery speed and agent-friendliness:** seven weeks to M1, one governing agent plus delegated agents, a founder who
  reviews. Fewer moving parts, strong typing, generated contracts and fast automated tests matter more than raw speed.
- **Existing assets:** Supabase Postgres with RLS, Supabase Auth, six Edge Functions (Deno/TypeScript), a React/TypeScript SPA,
  CI (PR checks) and a project MCP server for the database.

## 2. Recommendation in one table

| Layer | Recommendation | Timing |
| --- | --- | --- |
| Storage | **PostgreSQL** (keep Supabase-hosted for now). Schema stays in SQL migrations (Supabase CLI) as the single source of truth. Invariants live in the database: constraints, RLS, transactional functions, row-lock convention | M1 |
| API | **Python 3.12+ with FastAPI** as the single front door for all new v2 operations (OpenAPI generated from typed models) | Scaffold now; v2 domain modules M1; remaining M2 |
| Data access | Explicit SQL via `psycopg` 3 (async) with a thin repository layer; **no heavy ORM, no second migration tool** (no Alembic) | M1 |
| Authorization | API verifies the Supabase-issued JWT, runs queries as a restricted database role with the user's claims set per request (`SET LOCAL`), so **RLS remains a backstop** under explicit capability checks in code | M1 |
| Jobs | **Postgres-backed job table + a Python worker** (`FOR UPDATE SKIP LOCKED`); scheduled activation/expiry/reminders/release use it | M1 (activation) / M2 (billing, reservations) |
| Redis | **Not in M1.** Add when a measured need appears: shared rate limiting, hot-path caching, websocket fan-out, ephemeral tokens | Revisit after M1 |
| Rust | **Not now.** Only for a profiled hot spot, as an isolated service or Python extension behind the same contract | Post-M2 at earliest |
| Frontend contract | Generated **OpenAPI** spec -> typed TypeScript client and a mock server, so the frontend team (Othniel's Claude with Claude Design) can build against the contract in parallel instead of waiting for the finished backend | From first contract slice |

## 3. Reasoning per choice

**Postgres.** Already holds production data, with RLS and a working MCP workflow. It also gives us the tools the hardest
requirements need: serializable or row-locked transactions for atomic activation, unique constraints for slugs and caps,
generated columns and views for suppressed aggregates. Moving off Supabase hosting later stays possible (plain Postgres plus
`auth.users` compatibility is the only coupling); not needed for M1/M2.

**Python and FastAPI.** Good fit for a contract-first backend delegated to agents: typed request/response models give validation
and an OpenAPI document for free (the "full API reference" becomes generated for v2), pytest is fast, and Python is strong for the
analytics, export and billing-SDK work in M2. Honest trade-offs: a second runtime to host and secure (Edge Functions are Deno), the
SPA and Python share no types (mitigated by generating a TypeScript client from OpenAPI), and Python needs discipline
(ruff, mypy or pyright, pytest in CI) to stay safe. A TypeScript API (Hono, Fastify) would share types with the SPA and Edge
Functions and is a legitimate alternative; I recommend Python because you prefer it and M2's analytics/billing work benefits.

**Why not "everything in Supabase RPC and Edge Functions".** That is the fastest path to M1 and remains the right answer for the
**legacy flows** (they stay untouched as the Winter Survey fallback). For v2 it puts a lot of business logic in SQL and Deno
functions that are harder to unit test and to hand to parallel agents. The recommended split keeps only **database invariants** in
SQL and moves **orchestration** (who may do what, composition of steps, third-party calls) into the API.

**Redis.** Today's only Redis-shaped need is rate limiting, currently an in-memory map per Edge Function instance (it resets on restart
and is not shared). A Postgres counter or the platform's limits are enough for M1. Redis adds a paid service, another failure mode
and secrets; the first workloads that justify it are shared rate limiting under real traffic, caching expensive analytics, and live
updates. (Hosted Redis-compatible stores exist on Render and elsewhere; price to be verified at purchase time.)

**Rust.** Nothing measured needs it. It would slow delivery and narrow who can review the code. Revisit only with a profile showing
CPU-bound work (for example very large exports or aggregation) that Postgres and Python cannot handle.

## 4. Target shape

```
Browser (React SPA)
   |  Supabase Auth session (Google via central identity or Supabase Google provider)
   v
FastAPI service (Render, same region as the database)        <- OpenAPI contract, typed models, error envelope
   |  restricted DB role + per-request claims (RLS backstop)
   v
PostgreSQL (Supabase)  <---- Python worker (jobs: activation, expiry, reminders, reservation release, billing events)
   ^
Legacy: browser -> Supabase RPC/Edge Functions (unchanged until cutover; Winter Survey fallback)
```

Hosting notes (verify before purchase): place the API in the region nearest the database (production is us-west-2) to keep
latency low; use Supabase's connection pooler for server connections; secrets stay in the host's secret store and `.mcp.env`
pattern for tooling.

## 5. Plan for building it with agents

Contract first, then parallel work in non-overlapping modules, following the repository's delegation rules (one owner per file,
the governing agent reviews every PR, checks must pass).

0. **Governing agent (me):** OpenAPI skeleton and error model from the flow inventory (`EXPERIENCE_PLAN` F-01..F-49) and the `lv_*`
   contracts; module boundaries; shared test harness and CI additions. This is the only serial step.
1. **Platform scaffold (A1):** `api/` layout, config, database layer with claim propagation, JWT verification, request IDs, logging,
   health checks, Dockerfile, Render blueprint, CI (ruff, type check, pytest, OpenAPI export and diff check).
2. **Parallel modules**, each with its own directory, migrations range, tests and contract section:
   identity and memberships (A2), roles and Owner (A3), campaigns, entitlements and activation (A4), participation, guests and the
   anonymity boundary (A5), analytics and exports (A6), jobs, billing and reservations (A7, M2), connectors (A8, if D-13 says so).
3. **Verification agent (A9):** cross-Hub allow/deny suite, concurrency harness, privacy suite, load smoke test.
4. **Frontend track:** generated TypeScript client and mock server published from the OpenAPI spec as soon as a slice lands; the
   design handoff (Claude Design) maps screens to endpoints via the flow IDs.

Estimated cost of the scaffold and contract step: about 5-8 agent-days (low confidence), which is already inside the roadmap's
foundation items; it pays back by letting modules proceed in parallel. This **does not change** the roadmap's finding that full scope
by Dec 11 is not credible; it changes how the work is organised.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Two authorization layers drift apart | One capability catalog; API checks plus RLS backstop; shared allow/deny tests run against both |
| New service delays M1 | Legacy flows stay as the fallback; scope M1 to MJCC-critical modules; scaffold first, in a week |
| Python/TypeScript contract drift | OpenAPI is the source; generated client; CI fails on an unreviewed spec change |
| Extra hosting cost and ops | One web service plus one worker initially; costs verified at purchase; within the staging/production budget decisions |
| Agents produce inconsistent code | Strict module ownership, lint/type/test gates, review by the governing agent |
| Identity not ready | Approved fallback (Supabase Google provider); API verifies whichever issuer is configured |

## 7. Decisions requested (D-14)

1. Approve **PostgreSQL (Supabase) + FastAPI (Python)** as the v2 stack, with Redis and Rust deferred as above.
2. Approve **contract-first with OpenAPI** and agent delegation by module, starting with the scaffold.
3. Confirm that **legacy flows stay on Supabase RPC/Edge Functions** until cutover.
4. Confirm that the frontend track starts from generated contracts and mocks rather than waiting for the whole backend.
