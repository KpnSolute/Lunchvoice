-- 0009: drop pre-tenant (0001 baseline) RLS policies that 0006_rls_rewrite
-- superseded but never removed. Without this, permissive legacy policies
-- leak rows across orgs once a second org exists.
drop policy if exists "admin reads dish ratings" on public.dish_ratings;
drop policy if exists "own dish ratings" on public.dish_ratings;
drop policy if exists "menu days admin all" on public.menu_cycle_days;
drop policy if exists "menu days read" on public.menu_cycle_days;
drop policy if exists "menu cycles admin all" on public.menu_cycles;
drop policy if exists "menu cycles read" on public.menu_cycles;
drop policy if exists "orders_admin_update" on public.orders;
drop policy if exists "rr_select" on public.response_ratings;
drop policy if exists "sm_select" on public.session_members;
drop policy if exists "sessions_admin_all" on public.sessions;
drop policy if exists "store_admin_all" on public.store_items;
drop policy if exists "store_select" on public.store_items;
drop policy if exists "survey answers select" on public.survey_answers;
drop policy if exists "survey questions admin all" on public.survey_questions;
drop policy if exists "survey questions read" on public.survey_questions;
drop policy if exists "survey templates admin all" on public.survey_templates;
drop policy if exists "survey templates read" on public.survey_templates;
drop policy if exists "insert own voice notes" on public.voice_notes;
drop policy if exists "read own voice notes" on public.voice_notes;
