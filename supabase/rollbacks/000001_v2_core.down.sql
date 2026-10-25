-- Rollback for 000001_v2_core.
-- DESTROYS all v2 data. Canonical baseline only: this is for a throwaway rehearsal database, never a
-- production reversal after data exists. The later rollbacks (000002-000006) drop their own objects first.
drop schema if exists lv_api cascade;
drop schema if exists lv cascade;
