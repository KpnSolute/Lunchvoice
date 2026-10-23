# RPC (Postgres functions)

Call with `POST /rest/v1/rpc/<name>` and a JSON object of named arguments, or `supabase.rpc("<name>", {...})`.
Signatures, return types and execute privileges below were read from production on 2026-10-23; behaviour follows
the deployed function definitions.

All client RPCs run as `SECURITY DEFINER` (as the database owner) and derive the organization from the caller's
profile with `caller_org_id()`; **the client never supplies `org_id`**. A signed-out caller has no profile, so these
functions find nothing and fail closed.

## Client-callable

### `join_session(p_code text) -> text`

Join a survey session by its join code (QR or typed). Used by `src/routes/student/Join.tsx` and `Surveys.tsx`.

| | |
| --- | --- |
| Caller | signed-in student or staff |
| Argument | `p_code`: join code; trimmed and upper-cased by the function |
| Success | the session's UUID as text; the caller is added to `session_members` if not already a member |
| Not found | returns the string `"Session not found or closed."` (no exception) |
| Matches | session in the caller's org, `is_active = true`, not past `closes_at`. **Note:** this path does not check `opens_at`; `join_available_session` does |

```json
POST /rest/v1/rpc/join_session
{ "p_code": "AB12CD" }
-> "6d0f...-uuid"
```

### `join_available_session(p_session_id uuid) -> text`

Join a session listed on the student's "Available surveys" page. Used by `Surveys.tsx`.

| | |
| --- | --- |
| Caller | signed-in user (raises `Authentication required.` otherwise); not executable by `anon` |
| Success | the session UUID as text; membership inserted (idempotent) |
| Not found | `"Session not found or closed."` |
| Matches | same org, `show_on_dashboard = true`, `is_active = true`, `opens_at` null or past, `closes_at` null or future |

### `submit_response(p_session_id uuid, p_ratings jsonb, p_feedback text default null, p_idea text default null, p_answers jsonb default null) -> integer`

Submit one survey response and award points. Used by `src/routes/student/Survey.tsx`.

| Argument | Shape |
| --- | --- |
| `p_session_id` | session UUID |
| `p_ratings` | array of `{ "dish_name": string, "rating": integer, "slot": string }` (required; may be `[]`) |
| `p_feedback`, `p_idea` | optional free text |
| `p_answers` | optional array of `{ "question_id": uuid, "value": any JSON, "text_value"?: string, "numeric_value"?: number, "option_values"?: string[] }` |

| Result | |
| --- | --- |
| Success | the caller's new points balance (integer). Side effects: one `responses` row (with `points_awarded = session.points_reward`), its `response_ratings` and `survey_answers`; profile `points += points_reward`, `streak += 1`, `last_survey_date = current_date` |
| Errors (exceptions, HTTP 400) | `Session not found or closed.` (wrong org, inactive or past `closes_at`), `You must join this session first.`, `You have already responded to this session.` (also enforced by a unique constraint) |

Notes: the app writes answers in `value`; `text_value`, `numeric_value` and `option_values` are accepted but the
current client leaves them empty. Responses store the student's ID; they are **not anonymous** to the database or to admins
with access to raw rows (see the v2 anonymity design).

### `redeem_item(p_item_id uuid) -> text`

Spend points on a reward. Used by `src/routes/student/Store.tsx`.

| Result | Meaning |
| --- | --- |
| `"ok"` | points deducted and an `orders` row created (`status` defaults to the table default) |
| `"Item not found."` | not in the caller's org or not active |
| `"Not enough points."` | balance below `token_cost` |

This is the **supported** way to create an order. Stock (`store_items.stock`) is not decremented by this function.

## Helper functions (used by policies)

| Function | Returns | Execute | Purpose |
| --- | --- | --- | --- |
| `caller_org_id()` | `uuid` | `anon`, `authenticated` | The caller's profile `org_id` (null when signed out) |
| `is_admin()` | `boolean` | `authenticated` | True when the caller's profile role is `admin` |

They are part of the authorization model, not a data API; do not build client features on them.

## Server-only and trigger functions (not callable by clients)

| Function | Kind | Notes |
| --- | --- | --- |
| `apply_kpnsolute_menu_event(...)` | `TABLE(duplicate, cycle_id, days_applied)` | Service role only; used by `menu-sync` for CloudEvents (idempotent per webhook/event) |
| `handle_new_user()` | trigger on `auth.users` | Creates the profile at sign-up; org from sign-up metadata, defaulting to LionCafe |
| `profiles_protect_privileged_columns()` | trigger on `profiles` | Rejects privileged-column changes by non-owner, non-service roles (2026-10-23) |
| `process_ledger_entry()` | trigger | Present in production, **not in the repository** (see migration drift) |
| `touch_updated_at()` | trigger | Present in production, **not in the repository** |
