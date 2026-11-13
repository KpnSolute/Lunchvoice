-- Rollback of 000054: back to the provisional Creator Plus 3 / Creator Pro 10 from 000044.
begin;
update lv.plan_limits set value = '3', note = 'PROVISIONAL founder proposal 2026-11-13: 3 Trends on Creator Plus.'
 where family = 'creator_plus' and key = 'trends.max';
update lv.plan_limits set note = 'PROVISIONAL founder proposal 2026-11-13: 10 Trends on Creator Pro.'
 where family = 'creator_pro' and key = 'trends.max';
commit;
