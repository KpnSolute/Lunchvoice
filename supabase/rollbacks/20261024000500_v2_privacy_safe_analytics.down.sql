-- Rollback for 20261024000500_v2_privacy_safe_analytics.sql. NOT a migration: never applied automatically.
-- Run deliberately, in one transaction, BEFORE rolling back migrations 4, 3, 2 and 1.
--
-- Effect: removes the analytics operation, the release records (which freeze participant counts), the query audit log
-- (export it first if the audit trail matters) and the three analytics policy keys. Answers, receipts and everything from
-- migrations 1-4 are untouched. No legacy table is touched.

begin;

drop function if exists public.lv_analytics_query(uuid, text, uuid);
drop table if exists lv_private.analytics_releases;
drop table if exists lv_private.analytics_query_log;
delete from lv_private.policy where key in ('analytics.min_cohort', 'analytics.min_participants', 'analytics.disclosure_controls');
drop function if exists lv_private.analytics_core(uuid, uuid, text, uuid);
drop function if exists lv_private.suppress_cells(jsonb, int, boolean, boolean);
drop function if exists lv_private.analytics_policy_state();

commit;
