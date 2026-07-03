# Lunch Voice Agent Memory

This repo is a React/Vite/Supabase app for MJCC dining feedback, menu planning,
student rewards, and staff content operations.

## Multi-Tenant Architecture

- Each contractor lives under `/:orgSlug/...` (path-based routing, not subdomain).
- `OrgProvider` resolves the slug to an `orgs` row before login — needed for
  marketing/login pages that display `org.name` pre-session.
- `AuthProvider` is nested inside `OrgProvider` and exposes `org_id` from the
  logged-in user's profile. An org-mismatch guard signs out users whose
  `profiles.org_id` doesn't match the URL slug (stale bookmark edge case).
- All 14 tables have `org_id` (NOT NULL after backfill). RLS policies use
  `caller_org_id()` to scope reads/writes. Inserts must include `org_id` explicitly.
- `login-start` and `staff-login` edge functions accept an `org` slug param,
  resolve the org row, and stamp `org_id` on profile upserts.
- LionCafe (slug `LionCafe`) is tenant #1 — the existing MJCC data. A second
  contractor needs one `orgs` row + their own auth bridge; no code changes.

## Product Shape

- Students sign in with email OTP, then the Supabase session persists on the device.
- Staff sign in through the `staff-login` edge function with MJCCv1 sudo username/email
  plus password. Staff land in `/:orgSlug/admin`, with Content Central at `/:orgSlug/admin/content`.
- Staff need a Microsoft Forms / Google Forms style builder for dining surveys.
- Dynamic surveys are intentionally schema-backed so future AI agents can generate,
  edit, or summarize forms by writing to `survey_templates` and `survey_questions`.
- The original standalone prototype is at `C:\Users\ogdev\Downloads\Dining Voice (standalone).html`
  and contains the prebuilt Dining Voice survey model: overall rating, taste,
  freshness, temperature, portion, variety, requests, comments, and dish ideas.

## Core Supabase Contracts

- `orgs` stores tenant definitions (slug, name, auth_provider).
- `sessions` is the launch object with `join_code`, QR link, points reward, optional
  `template_id`, optional `menu_cycle_id`, and optional `menu_day`. Always has `org_id`.
- `survey_templates` stores editable form definitions. `status='published'` makes
  a template student-readable.
- `survey_questions` stores ordered form fields. Supported `type` values:
  `rating`, `text`, `single_choice`, `multi_choice`, `yes_no`.
- `responses` stores one completion per student per session and awards points.
- `survey_answers` stores dynamic answers linked to `responses` and questions.
- `menu_cycles` and `menu_cycle_days` store staff-uploaded 28-day menus.
- `contract_requests` stores marketing lead form submissions (insert-only RLS).
- Keep RLS enabled on every public table. Use explicit grants for new Data API tables.
- Views (`student_roster`, `dish_rating_stats`, `dish_stats`) have `security_invoker = on`.

## Implementation Rules

- Keep the existing rewards/order flow working while adding dynamic surveys.
- Do not expose service role keys in frontend code.
- Prefer additive migrations. Do not destroy production data.
- Use the form editor data model for AI integration rather than hard-coding survey
  questions into React.
- Before launch, apply migrations to the linked Supabase project, deploy edge functions,
  and test student signup, staff login, QR join, survey submission, store redemption,
  and order status updates end to end.
