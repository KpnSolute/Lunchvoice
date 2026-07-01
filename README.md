# The Lunch Line — MJCC Survey + Rewards

A TypeScript (Vite + React) web app for Miami Job Corps Center students to rate the
28-day cycle menu, earn points, and redeem them for rewards. Admins create survey
sessions with shareable join codes + QR codes, track stats, run a reward store, and
fulfill orders.

Backend is **Supabase** (Postgres + Auth). Students sign in with an **email magic link** —
their email is their only identity. All point/redemption logic runs in the database
(SECURITY DEFINER functions + RLS) so it can't be forged from the browser.

## Features
- **Students**: magic-link login, join sessions by code/QR, rate dishes (fork ratings),
  leave feedback + pitch new dishes, earn points + streaks, spend points in the store,
  track order status live.
- **Admins**: create sessions (auto join code + QR), stats dashboard (dish averages,
  ideas, order counts), manage store items, fulfill orders (pending → ready → collected).
- Game-like feel: animated forks, points count-up + confetti, streak flame, live order updates.

## Local development
```bash
cp .env.example .env      # values are already the MJCCv2 project's public keys
npm install
npm run dev               # http://localhost:5173
```
The anon/publishable key is safe to expose — Row Level Security is the real guard.

## Authentication
- **Students** sign up with their **name + personal email** and verify a **6-digit code**
  emailed to them (Supabase email OTP). Each gets a stable user ID; survey responses are
  anonymous in stats but internally linked to that ID so they're verifiable and orders track.
- **Staff** (MJCCv1 `sudo` users — currently Othniel & Jeremiah) use the **Staff** tab and
  sign in with their **MJCCv1 cafeteria credentials**. The `staff-login` edge function
  verifies them against the MJCCv1 project with a service role, confirms `role = 'sudo'`
  live, then grants a MJCCv2 admin session. Revoke sudo in MJCCv1 → their site admin dies.
  Only `sudo` users get admin powers here.

### Required manual setup (one-time, Supabase dashboard)
1. **Edge function secret** — the `staff-login` function needs MJCCv1's service_role key:
   ```bash
   supabase secrets set MJCCV1_SERVICE_ROLE_KEY=<mjccv1 service_role key> \
     --project-ref qprfonxvthmaoxfixigk
   ```
   (`MJCCV1_URL` and `MJCCV1_ANON_KEY` are already set.)
2. **Email OTP as a code, not a link** — in MJCCv2 → Authentication → Email Templates →
   **Magic Link**, make sure the body contains `{{ .Token }}` so students receive the
   6-digit code. (`verifyOtp` works either way, but the email must show the code.)

## Database
Schema lives in the Supabase project `qprfonxvthmaoxfixigk`. Key objects:
- Tables: `profiles`, `sessions`, `session_members`, `responses`, `response_ratings`,
  `store_items`, `orders`.
- Functions (all point-moving logic): `join_session`, `submit_response`, `redeem_item`.
- View: `dish_stats` (admin dashboard averages).
- `orders` is on the realtime publication so students see status changes live.

Regenerate types after schema changes and paste into `src/types/db.ts`.

## Deploying on Render (free static site)
1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. `render.yaml` defines a static site.
3. Set the two env vars when prompted (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. After deploy, add the Render URL to Supabase → **Authentication → URL Configuration →
   Redirect URLs** so magic links redirect back correctly.

A static site on Render does **not** sleep, but a Supabase `pg_cron` job also pings the URL
every 10 minutes as belt-and-suspenders (see `supabase/keepalive.sql`).

## The menu
The 28-day cycle + everyday staples are static frontend data in
[`src/lib/menu.ts`](src/lib/menu.ts). Edit the `CYCLE` and `STAPLES` arrays to update.
Sessions reference a cycle day number (1–28).

The original single-file prototype is kept for reference in [`legacy/index.html`](legacy/index.html).
