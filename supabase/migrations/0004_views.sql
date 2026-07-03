-- 0004_views.sql
-- Sets security_invoker on all views and recreates them with org_id.

-- ============================================================
-- Drop views first (CREATE OR REPLACE can't rename columns)
-- ============================================================

drop view if exists public.student_roster;
drop view if exists public.dish_rating_stats;
drop view if exists public.dish_stats;

-- ============================================================
-- Recreate views with org_id + security_invoker
-- ============================================================

create or replace view public.student_roster
  with (security_invoker = on) as
select
  p.id,
  p.org_id,
  p.display_name,
  p.email,
  p.points,
  p.streak,
  p.created_at,
  (select count(*) from public.responses r where r.student_id = p.id) as responses,
  (select count(*) from public.orders o where o.student_id = p.id) as orders
from public.profiles p
where p.is_staff = false;

create or replace view public.dish_rating_stats
  with (security_invoker = on) as
select
  dr.org_id,
  dr.dish_key,
  dr.dish_name,
  dr.category,
  avg(dr.rating)::numeric(3,2) as avg_rating,
  count(*) as votes
from public.dish_ratings dr
group by dr.org_id, dr.dish_key, dr.dish_name, dr.category;

create or replace view public.dish_stats
  with (security_invoker = on) as
select
  rr.org_id,
  rr.dish_name,
  rr.slot,
  avg(rr.rating)::numeric(3,2) as avg_rating,
  count(*) as votes
from public.response_ratings rr
group by rr.org_id, rr.dish_name, rr.slot;
