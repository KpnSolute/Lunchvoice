-- 20260717033000_drop_redundant_responses_unique.sql
-- Right after 20260716140000_survey_tracking_integrity.sql was applied, a
-- second unique constraint turned up on responses(session_id, student_id):
-- Postgres's default-named responses_session_id_student_id_key, alongside
-- our explicitly-named responses_session_student_unique. The default-named
-- one was never recorded in any migration file in this repo — it must have
-- been added out-of-band (dashboard or ad-hoc SQL) at some point. Both
-- enforced the identical constraint, so this drops the untracked duplicate
-- and keeps the documented one.

alter table public.responses
  drop constraint if exists responses_session_id_student_id_key;
