# Data API (tables and views)

PostgREST endpoints at `/rest/v1/<table>` with the usual filters (`?select=...&org_id=eq.<uuid>&order=...`), or
`supabase.from("<table>")`. All tables have row-level security enabled; the three views use `security_invoker = on`,
so the underlying tables' rules apply to whoever queries the view. Verified against production on 2026-10-23.

**Read scoping** is described in plain terms below. **Supported writes** lists the write operations the app uses and
that this API supports; anything else reachable through the Data API is not part of the supported API (enforcement
review: roadmap R-04). Points, responses, ratings, answers, memberships and orders are written **only** through the RPCs in [RPC.md](RPC.md); direct writes
to those tables are not granted (production, 2026-10-23).

Legend: *member* = signed-in user whose profile is in the same org; *admin* = member with `role = 'admin'`.

## Organizations and people

### `orgs`
| Column | Type |
| --- | --- |
| `id` | uuid |
| `slug` | text (unique, case-insensitive) |
| `name` | text |
| `auth_provider` | text (`mjcc_v1_sudo` for LionCafe) |
| `created_at` | timestamptz |

Read: **public** (needed to resolve a slug before sign-in). Supported writes: none.

### `profiles`
Columns: `id` (= auth user id), `email`, `display_name`, `role` (`student`/`admin`), `points`, `streak`,
`last_survey_date`, `created_at`, `is_staff`, `mjcc_username`, `org_id`.

Read: a member reads their own profile; admins read all profiles in their org.
Supported writes: a signed-in user may update **only** `email` and `display_name` on their own row (enforced by
column privileges and a trigger since 2026-10-23). Profiles are created by the sign-up trigger; points and streak change
only through RPCs; role and staff flags only through Edge Functions.

### `student_roster` (view)
Columns: `id`, `org_id`, `points`, `streak`, `created_at`, `responses` (count), `orders` (count). No names or emails.
Read: follows the profile rules (security invoker): admins see everyone in their org; a member sees only their own row.
Used by `src/routes/admin/Roster.tsx`.

## Surveys

### `survey_templates`
Columns: `id`, `title`, `description`, `audience`, `status` (`draft`/`published`/...), `points_reward`, `created_by`,
`created_at`, `updated_at`, `org_id`.
Read: members see published templates in their org; admins see all. Supported writes (admin): insert, update `status`
and content. Used by Content Central.

### `survey_questions`
Columns: `id`, `template_id`, `position`, `type`, `prompt`, `help_text`, `required`, `options` (jsonb), `scale_min`,
`scale_max`, `category`, `created_at`, `org_id`.
Read: members in the org. Supported writes (admin): insert, update, delete.

### `sessions`
Columns: `id`, `title`, `description`, `join_code`, `menu_day`, `points_reward`, `is_active`, `opens_at`, `closes_at`,
`created_by`, `created_at`, `template_id`, `menu_cycle_id`, `org_id`, `show_on_dashboard`.
Read: admins see all sessions in their org; members see sessions that are listed on the dashboard and currently open,
plus sessions they have joined. Supported writes (admin): insert (launch), update `is_active`, `closes_at`,
`show_on_dashboard`. Join codes are unique per org.

### `session_members`
Columns: `session_id`, `student_id`, `joined_at`, `org_id`. Read: own rows; admins all in org.
Supported writes: none directly; use `join_session` / `join_available_session`.

### `responses`, `response_ratings`, `survey_answers`
- `responses`: `id`, `session_id`, `student_id`, `menu_day`, `feedback`, `idea`, `points_awarded`, `submitted_at`, `org_id`.
  One per student per session.
- `response_ratings`: `id`, `response_id`, `dish_name`, `slot`, `rating`, `org_id`.
- `survey_answers`: `id`, `response_id`, `question_id`, `value` (jsonb, the active field), `text_value`, `numeric_value`,
  `option_values` (reserved, unpopulated by the client), `created_at`, `org_id`.

Read: `responses`: own rows, admins all in org. `response_ratings` and `survey_answers`: members in the org.
Supported writes: none directly; use `submit_response`.
Privacy: responses carry the student ID; aggregate views below are the intended way to show results.

## Dining (LionCafe)

### `menu_cycles` and `menu_cycle_days`
- `menu_cycles`: `id`, `title`, `version_label`, `starts_on`, `is_active`, `created_by`, `created_at`, `updated_at`, `org_id`.
- `menu_cycle_days`: `id`, `cycle_id`, `day_number`, `weekday`, `breakfast`/`lunch`/`dinner` (jsonb arrays of dish names),
  `notes`, `updated_at`, `org_id`. Unique on (`cycle_id`, `day_number`).

Read: members in the org. Supported writes: admin edits and the `menu-sync` function (service role).

### `dish_ratings`
Columns: `student_id`, `dish_key`, `dish_name`, `category`, `rating`, `updated_at`, `org_id`. One rating per student per dish
(`student_id`, `dish_key`). Read: members in the org. Supported write: a member upserts **their own** rating
(`src/routes/student/Rate.tsx`).

### `dish_rating_stats`, `dish_stats` (views)
- `dish_rating_stats`: `org_id`, `dish_key`, `dish_name`, `category`, `avg_rating`, `votes`.
- `dish_stats`: `org_id`, `dish_name`, `slot`, `avg_rating`, `votes` (from survey ratings).
Read: members in the org (security invoker).

### `voice_notes`
Columns: `id`, `student_id`, `kind`, `body`, `created_at`, `org_id`, `menu_day`, `dish_name`, `meal_period`, `status`,
`reports`, `hidden_at`, `hidden_by`.
Read: members see `visible` notes in their org; admins see all. Supported writes: a member inserts their own note with
`status = 'visible'`; admins update (moderate) and may post notes from Content Central.

## Rewards

### `store_items`
Columns: `id`, `name`, `description`, `token_cost`, `image_url`, `stock`, `is_active`, `created_at`, `org_id`.
Read: members in the org. Supported writes (admin): insert, update, delete (delete fails with `23503` when orders reference
the item; hide it instead).

### `orders`
Columns: `id`, `student_id`, `store_item_id`, `item_name`, `token_cost`, `status`, `created_at`, `updated_at`, `org_id`.
Read: own orders; admins all in org. Supported writes: created only by `redeem_item`; admins update `status`
(`src/routes/admin/OrdersAdmin.tsx`).

## Public intake

### `contract_requests`
Columns: `id`, `org_name`, `contact_name`, `contact_email`, `message`, `created_at`.
Supported write: public insert from the marketing page's service-request form. Not readable through the API.

## Internal

### `kpnsolute_event_receipts`
Service role only (no API access). Idempotency ledger for menu CloudEvents.
