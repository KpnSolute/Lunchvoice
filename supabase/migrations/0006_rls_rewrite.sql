-- 0006_rls_rewrite.sql
-- Adds caller_org_id() helper and rewrites every RLS policy to scope by org_id.

-- ============================================================
-- Helper function
-- ============================================================

create or replace function public.caller_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- Drop all existing policies
-- ============================================================

-- Profiles
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_insert_trigger on public.profiles;

-- Sessions
drop policy if exists sessions_select on public.sessions;
drop policy if exists sessions_insert_admin on public.sessions;
drop policy if exists sessions_update_admin on public.sessions;
drop policy if exists sessions_delete_admin on public.sessions;

-- Session members
drop policy if exists session_members_select_own on public.session_members;
drop policy if exists session_members_insert on public.session_members;

-- Survey templates
drop policy if exists survey_templates_select on public.survey_templates;
drop policy if exists survey_templates_insert_admin on public.survey_templates;
drop policy if exists survey_templates_update_admin on public.survey_templates;
drop policy if exists survey_templates_delete_admin on public.survey_templates;

-- Survey questions
drop policy if exists survey_questions_select on public.survey_questions;
drop policy if exists survey_questions_insert_admin on public.survey_questions;
drop policy if exists survey_questions_update_admin on public.survey_questions;
drop policy if exists survey_questions_delete_admin on public.survey_questions;

-- Responses
drop policy if exists responses_select on public.responses;
drop policy if exists responses_insert on public.responses;

-- Response ratings
drop policy if exists response_ratings_select on public.response_ratings;
drop policy if exists response_ratings_insert on public.response_ratings;

-- Survey answers
drop policy if exists survey_answers_select on public.survey_answers;
drop policy if exists survey_answers_insert on public.survey_answers;

-- Dish ratings
drop policy if exists dish_ratings_select on public.dish_ratings;
drop policy if exists dish_ratings_insert on public.dish_ratings;
drop policy if exists dish_ratings_update on public.dish_ratings;

-- Voice notes
drop policy if exists voice_notes_select on public.voice_notes;
drop policy if exists voice_notes_insert on public.voice_notes;

-- Menu cycles
drop policy if exists menu_cycles_select on public.menu_cycles;
drop policy if exists menu_cycles_insert_admin on public.menu_cycles;
drop policy if exists menu_cycles_update_admin on public.menu_cycles;
drop policy if exists menu_cycles_delete_admin on public.menu_cycles;

-- Menu cycle days
drop policy if exists menu_cycle_days_select on public.menu_cycle_days;
drop policy if exists menu_cycle_days_insert_admin on public.menu_cycle_days;
drop policy if exists menu_cycle_days_update_admin on public.menu_cycle_days;
drop policy if exists menu_cycle_days_delete_admin on public.menu_cycle_days;

-- Store items
drop policy if exists store_items_select on public.store_items;
drop policy if exists store_items_insert_admin on public.store_items;
drop policy if exists store_items_update_admin on public.store_items;
drop policy if exists store_items_delete_admin on public.store_items;

-- Orders
drop policy if exists orders_select on public.orders;
drop policy if exists orders_insert on public.orders;
drop policy if exists orders_update_admin on public.orders;

-- ============================================================
-- Rewrite all policies with org_id scoping
-- ============================================================

-- Profiles
create policy profiles_select_own on public.profiles
  for select using (
    org_id = caller_org_id() and id = auth.uid()
  );

create policy profiles_select_admin on public.profiles
  for select using (
    org_id = caller_org_id() and is_admin()
  );

create policy profiles_update_own on public.profiles
  for update using (
    org_id = caller_org_id() and id = auth.uid()
  );

create policy profiles_insert_trigger on public.profiles
  for insert with check (true);

-- Sessions
create policy sessions_select on public.sessions
  for select using (
    org_id = caller_org_id() and (is_active = true or is_admin())
  );

create policy sessions_insert_admin on public.sessions
  for insert with check (
    org_id = caller_org_id() and is_admin()
  );

create policy sessions_update_admin on public.sessions
  for update using (
    org_id = caller_org_id() and is_admin()
  );

create policy sessions_delete_admin on public.sessions
  for delete using (
    org_id = caller_org_id() and is_admin()
  );

-- Session members
create policy session_members_select_own on public.session_members
  for select using (
    org_id = caller_org_id() and (student_id = auth.uid() or is_admin())
  );

create policy session_members_insert on public.session_members
  for insert with check (
    org_id = caller_org_id()
  );

-- Survey templates
create policy survey_templates_select on public.survey_templates
  for select using (
    org_id = caller_org_id() and (status = 'published' or is_admin())
  );

create policy survey_templates_insert_admin on public.survey_templates
  for insert with check (
    org_id = caller_org_id() and is_admin()
  );

create policy survey_templates_update_admin on public.survey_templates
  for update using (
    org_id = caller_org_id() and is_admin()
  );

create policy survey_templates_delete_admin on public.survey_templates
  for delete using (
    org_id = caller_org_id() and is_admin()
  );

-- Survey questions
create policy survey_questions_select on public.survey_questions
  for select using (
    org_id = caller_org_id()
  );

create policy survey_questions_insert_admin on public.survey_questions
  for insert with check (
    org_id = caller_org_id() and is_admin()
  );

create policy survey_questions_update_admin on public.survey_questions
  for update using (
    org_id = caller_org_id() and is_admin()
  );

create policy survey_questions_delete_admin on public.survey_questions
  for delete using (
    org_id = caller_org_id() and is_admin()
  );

-- Responses
create policy responses_select on public.responses
  for select using (
    org_id = caller_org_id() and (student_id = auth.uid() or is_admin())
  );

create policy responses_insert on public.responses
  for insert with check (
    org_id = caller_org_id()
  );

-- Response ratings
create policy response_ratings_select on public.response_ratings
  for select using (
    org_id = caller_org_id()
  );

create policy response_ratings_insert on public.response_ratings
  for insert with check (
    org_id = caller_org_id()
  );

-- Survey answers
create policy survey_answers_select on public.survey_answers
  for select using (
    org_id = caller_org_id()
  );

create policy survey_answers_insert on public.survey_answers
  for insert with check (
    org_id = caller_org_id()
  );

-- Dish ratings
create policy dish_ratings_select on public.dish_ratings
  for select using (
    org_id = caller_org_id()
  );

create policy dish_ratings_insert on public.dish_ratings
  for insert with check (
    org_id = caller_org_id()
  );

create policy dish_ratings_update on public.dish_ratings
  for update using (
    org_id = caller_org_id() and student_id = auth.uid()
  );

-- Voice notes
create policy voice_notes_select on public.voice_notes
  for select using (
    org_id = caller_org_id() and is_admin()
  );

create policy voice_notes_insert on public.voice_notes
  for insert with check (
    org_id = caller_org_id()
  );

-- Menu cycles
create policy menu_cycles_select on public.menu_cycles
  for select using (
    org_id = caller_org_id()
  );

create policy menu_cycles_insert_admin on public.menu_cycles
  for insert with check (
    org_id = caller_org_id() and is_admin()
  );

create policy menu_cycles_update_admin on public.menu_cycles
  for update using (
    org_id = caller_org_id() and is_admin()
  );

create policy menu_cycles_delete_admin on public.menu_cycles
  for delete using (
    org_id = caller_org_id() and is_admin()
  );

-- Menu cycle days
create policy menu_cycle_days_select on public.menu_cycle_days
  for select using (
    org_id = caller_org_id()
  );

create policy menu_cycle_days_insert_admin on public.menu_cycle_days
  for insert with check (
    org_id = caller_org_id() and is_admin()
  );

create policy menu_cycle_days_update_admin on public.menu_cycle_days
  for update using (
    org_id = caller_org_id() and is_admin()
  );

create policy menu_cycle_days_delete_admin on public.menu_cycle_days
  for delete using (
    org_id = caller_org_id() and is_admin()
  );

-- Store items
create policy store_items_select on public.store_items
  for select using (
    org_id = caller_org_id()
  );

create policy store_items_insert_admin on public.store_items
  for insert with check (
    org_id = caller_org_id() and is_admin()
  );

create policy store_items_update_admin on public.store_items
  for update using (
    org_id = caller_org_id() and is_admin()
  );

create policy store_items_delete_admin on public.store_items
  for delete using (
    org_id = caller_org_id() and is_admin()
  );

-- Orders
create policy orders_select on public.orders
  for select using (
    org_id = caller_org_id() and (student_id = auth.uid() or is_admin())
  );

create policy orders_insert on public.orders
  for insert with check (
    org_id = caller_org_id()
  );

create policy orders_update_admin on public.orders
  for update using (
    org_id = caller_org_id() and is_admin()
  );
