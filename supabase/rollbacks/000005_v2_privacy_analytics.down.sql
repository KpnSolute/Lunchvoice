-- Rollback for 000005_v2_privacy_analytics.
-- The lv_api wrapper from 000006 depends on these; when rolling back in reverse order it is already gone.
drop function if exists lv_api.lv_analytics_query(uuid, text, uuid);
drop function if exists lv.analytics_query(uuid, text, uuid);
drop function if exists lv.analytics_core(uuid, uuid, text, uuid);
drop function if exists lv.suppress_cells(jsonb, int, boolean);
drop function if exists lv.analytics_policy_state();
drop table if exists lv.analytics_query_log;
drop table if exists lv.analytics_releases;
