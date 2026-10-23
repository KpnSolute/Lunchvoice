-- Restrict client write paths to the ones the app uses.
--
-- Orders, responses, response ratings, survey answers and session memberships are created only by
-- SECURITY DEFINER RPCs owned by postgres (redeem_item, submit_response, join_session,
-- join_available_session). Their insert policies only checked the organization, so a signed-in user
-- could write such rows directly (for example an order without spending points). This removes direct
-- client writes to those tables; the RPCs are unaffected because they run as the table owner.

-- 1) RPC-only tables: no direct inserts, updates or deletes by API roles.
revoke insert, update, delete on public.orders, public.responses, public.response_ratings,
  public.survey_answers, public.session_members from anon, authenticated;
drop policy if exists orders_insert on public.orders;
drop policy if exists responses_insert on public.responses;
drop policy if exists response_ratings_insert on public.response_ratings;
drop policy if exists survey_answers_insert on public.survey_answers;
drop policy if exists session_members_insert on public.session_members;

-- Admins still change an order's status (src/routes/admin/OrdersAdmin.tsx); row access stays
-- governed by the existing orders_update_admin policy.
grant update (status, updated_at) on public.orders to authenticated;

-- 2) Dish ratings: a member may only create or change their own rating (src/routes/student/Rate.tsx
--    upserts without sending student_id, which defaults to auth.uid()).
drop policy if exists dish_ratings_insert on public.dish_ratings;
create policy dish_ratings_insert on public.dish_ratings
  for insert to authenticated
  with check (org_id = public.caller_org_id() and student_id = auth.uid());
drop policy if exists dish_ratings_update on public.dish_ratings;
create policy dish_ratings_update on public.dish_ratings
  for update to authenticated
  using (org_id = public.caller_org_id() and student_id = auth.uid())
  with check (org_id = public.caller_org_id() and student_id = auth.uid());

-- 3) Signed-out callers never write organization data; the public service-request form
--    (contract_requests insert) stays open. Nothing the app does needs the remaining grants.
revoke insert, update, delete on public.dish_ratings, public.menu_cycle_days, public.menu_cycles,
  public.orgs, public.sessions, public.store_items, public.survey_questions, public.survey_templates,
  public.voice_notes, public.profiles from anon;
revoke insert, update, delete on public.orgs from authenticated;
revoke update, delete on public.contract_requests from anon, authenticated;
revoke delete on public.profiles from authenticated;
