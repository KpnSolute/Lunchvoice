-- 000054: Creator Plus allows 5 Trends (Creator Pro stays at 10).
--
-- FOUNDER DECISION (2026-11-13, in chat): "5 plus, 10 pro". 000044 shipped Creator Plus 3 / Pro 10 as PROVISIONAL, and the
-- project profile proposed 2 / 5; the founder settled on Plus 5 and Pro 10. Only Creator Plus changes, and the note
-- no longer says provisional. Trends are not purchasable yet, so no customer is affected.
-- Rollback: supabase/rollbacks/000054_v2_creator_trends_allowance.down.sql.
begin;

update lv.plan_limits
   set value = '5', note = 'Founder 2026-11-13: 5 Trends on Creator Plus.'
 where family = 'creator_plus' and key = 'trends.max';

update lv.plan_limits
   set note = 'Founder 2026-11-13: 10 Trends on Creator Pro.'
 where family = 'creator_pro' and key = 'trends.max';

commit;
