# Lunch Voice - MJCC Survey + Rewards

A TypeScript (Vite + React) web app for Miami Job Corps Center students to rate
the 28-day cycle menu, earn points, and redeem them for rewards. Staff use
Content Central to manage menus, build surveys, launch sessions, review results,
and fulfill rewards.

Backend is Supabase (Postgres + Auth). Students sign in with an email code;
their email is their only identity. Staff sign in with their MJCCv1 sudo
username and password. Point, survey, and redemption logic runs in the database
with RLS and controlled RPC functions so it cannot be forged from the browser.

## Features

- Students: email-code login, join sessions by code/QR, rate dishes, answer
  dynamic surveys, leave feedback, earn points/streaks, spend points in the
  store, and track order status live.
- Staff: Content Central for 28-day menu cycles, survey templates/questions,
  active sessions, QR/join codes, real-time results, store items, and orders.
- Engagement UI: animated ratings, points count-up, confetti, streaks, and
  student-friendly survey surfaces.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

The anon/publishable key is safe to expose. Row Level Security and edge
functions are the actual guardrails.

## Authentication

- Students enter their personal email every time. The `login-start` edge
  function checks whether the email already has a MJCCv2 student profile, sends
  the Supabase OTP code, and tells the UI whether to show the one-time name
  field. Supabase Auth still owns verification through `verifyOtp`.
- Staff select **Continue with MJCC** and authenticate at `mjcc.kpncompute.com`.
  KpnCompute issues a short-lived one-time code after verifying the live
  LionCafe role grant. `staff-sso` exchanges it server-to-server, then
  provisions or updates the MJCCv2 admin profile and starts a MJCCv2 session.
- `staff-status` revalidates persisted staff sessions against the same live
  MJCCv1 LionCafe role grant, so removing that permission removes site access.

### Required Supabase Setup

`login-start`, the legacy `staff-login` rollback path, and `staff-status` need
MJCCv1 credentials. `staff-sso` and KpnCompute derive a purpose-specific HMAC
bridge key from that existing server-only credential. A separately rotatable
bridge secret can optionally be configured on both services:

```bash
supabase secrets set MJCCV1_SERVICE_ROLE_KEY=<mjccv1 service_role key> \
  --project-ref qprfonxvthmaoxfixigk
supabase secrets set LUNCHVOICE_SSO_SECRET=<32+ byte random secret> \
  --project-ref qprfonxvthmaoxfixigk
```

`MJCCV1_URL` and `MJCCV1_ANON_KEY` must also be set. Configure allowed frontend
origins for the auth edge functions:

```bash
supabase secrets set \
  APP_ORIGINS='http://localhost:5173,http://127.0.0.1:5173,https://interact-3npi.onrender.com,https://lunch-line-survey.onrender.com,https://lunchvoice.com,https://www.lunchvoice.com' \
  --project-ref qprfonxvthmaoxfixigk
```

The `send-email` function delivers OTP codes through Supabase's Send Email
hook, using Azure Communication Services Email as the mail provider. Deploy it
with JWT verification disabled because Supabase Auth signs the webhook payload
instead of sending a user JWT.

```bash
supabase secrets set \
  SEND_EMAIL_HOOK_SECRET='v1,whsec_...' \
  ACS_ENDPOINT='https://...communication.azure.com' \
  ACS_ACCESS_KEY='...' \
  MAIL_FROM='DoNotReply@...azurecomm.net' \
  MAIL_FROM_NAME='Lunch Voice' \
  --project-ref qprfonxvthmaoxfixigk

supabase secrets unset AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY \
  --project-ref qprfonxvthmaoxfixigk
supabase secrets unset MAILERSEND_API_KEY --project-ref qprfonxvthmaoxfixigk
supabase functions deploy send-email --no-verify-jwt --project-ref qprfonxvthmaoxfixigk
```

Check the setup at any time. This prints secret names/status only, never secret
values:

```bash
npm run check:email
```

#### Azure Communication Services Email

The Azure Communication Services resource must be connected to an Email
Communication Services domain, and `MAIL_FROM` must be a sender address from
that verified Azure domain or custom domain. `ACS_ENDPOINT` and
`ACS_ACCESS_KEY` come from the Communication Services resource's Keys page.

If Azure rejects a message, `send-email` logs `azure_email_send_failed`. If the
request cannot reach Azure or signing fails, it logs `azure_email_send_error`.

#### Once Azure credentials exist

1. Set the Azure email secrets.
   ```bash
   supabase secrets set \
     ACS_ENDPOINT='https://...communication.azure.com' \
     ACS_ACCESS_KEY='...' \
     MAIL_FROM='DoNotReply@...azurecomm.net' \
     --project-ref qprfonxvthmaoxfixigk
   ```
2. Run `npm run check:email` and confirm every check passes.
3. Redeploy with `npm run deploy:functions`.
4. Trigger a test sign-in and confirm a real LionCafe student OTP is delivered.

## Database

Schema lives in Supabase project `qprfonxvthmaoxfixigk`.

Key tables:

- `profiles`
- `sessions`, `session_members`
- `survey_templates`, `survey_questions`, `survey_answers`
- `responses`, `response_ratings`
- `menu_cycles`, `menu_cycle_days`
- `dish_ratings`, `voice_notes`
- `store_items`, `orders`

Key RPC functions:

- `join_session`
- `submit_response`
- `redeem_item`
- `is_admin`

Views:

- `dish_stats`
- `dish_rating_stats`
- `student_roster`

`orders` is on the realtime publication so students see status changes live.
Authenticated students can update only `profiles.display_name` and
`profiles.email`; role, points, staff flags, and MJCC usernames are controlled
by database functions or service-role edge functions.

Regenerate types after schema changes and paste them into `src/types/db.ts`.

## Deploying On Render

1. Push this repo to GitHub.
2. In Render, create a Blueprint from this repo. `render.yaml` defines the
   static site.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Point the custom domain `lunchvoice.com` (and `www.lunchvoice.com`) at the
   Render static site, and add both to Supabase Auth URL configuration and
   `APP_ORIGINS` (see above).

## The Menu

The 28-day cycle is managed from Content Central and stored in `menu_cycles`
plus `menu_cycle_days`. Students read the active cycle from Supabase.
`src/lib/menu.ts` is fallback/legacy reference data.

The original single-file prototype is kept for reference in `legacy/index.html`.
