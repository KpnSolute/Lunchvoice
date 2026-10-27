-- LunchVoice v2 canonical 20: anonymous responses carry no per-response time.
--
-- 000008 coarsened an anonymous submission's timestamp to the day. That still leaves a join path: on a day
-- when only one or a few people answered, the day on a submission matches the day on the participation row
-- (and on a guest participation row), so a respondent could be re-identified from the small cohort.
--
-- For an anonymous Campaign every submission and answer now carries ONE constant date for the whole
-- Campaign (the day it was activated). No stored timestamp on the answer side varies per respondent, so
-- there is nothing left to match against participation.created_at or guest_participation.created_at.
-- Participation counts over time stay available from the participation rows themselves, which hold no answers.
-- Identified Campaigns keep real timestamps.

begin;

create or replace function lv.coarsen_submission_time() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_day timestamptz;
begin
  select date_trunc('day', coalesce(c.activated_at, c.created_at)) into v_day
    from lv.campaigns c
   where c.id = new.campaign_id and c.anonymity = 'anonymous';
  if v_day is not null then
    new.created_at := v_day;
    new.submitted_on := v_day::date;
  end if;
  return new;
end;
$$;

-- Normalise anything written before this migration (none exists on a fresh install).
update lv.submissions s
   set created_at = date_trunc('day', coalesce(c.activated_at, c.created_at)),
       submitted_on = date_trunc('day', coalesce(c.activated_at, c.created_at))::date
  from lv.campaigns c
 where c.id = s.campaign_id and c.anonymity = 'anonymous';

update lv.answers a
   set created_at = s.created_at
  from lv.submissions s
 where s.id = a.submission_id;

grant execute on all functions in schema lv_api to public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema lv from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all functions in schema lv from authenticated';
  end if;
end $$;

commit;
