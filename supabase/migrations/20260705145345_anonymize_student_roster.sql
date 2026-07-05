-- Keep student roster useful for staff operations without exposing student
-- profile names or emails through the Data API.
drop view if exists public.student_roster;

create or replace view public.student_roster
  with (security_invoker = on) as
select
  p.id,
  p.org_id,
  p.points,
  p.streak,
  p.created_at,
  (select count(*) from public.responses r where r.student_id = p.id) as responses,
  (select count(*) from public.orders o where o.student_id = p.id) as orders
from public.profiles p
where p.is_staff = false;
