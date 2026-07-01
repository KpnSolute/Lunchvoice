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

## Making yourself an admin
New users default to `role = 'student'`. To promote yourself after first login, run in the
Supabase SQL editor:
```sql
update public.profiles set role = 'admin' where email = 'you@school.edu';
```

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
