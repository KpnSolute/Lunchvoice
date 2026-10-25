-- Rollback for 000004_v2_participation.
drop trigger if exists participation_check_link on lv.participation;
drop trigger if exists submissions_check_anonymity on lv.submissions;
drop function if exists lv.my_receipts();
drop function if exists lv.submit_response(uuid, jsonb);
drop function if exists lv.validate_answers(uuid, jsonb);
drop function if exists lv.check_participation_link();
drop function if exists lv.check_submission_anonymity();
drop table if exists lv.answers;
drop table if exists lv.participation;   -- holds the FK to submissions, so it goes first
drop table if exists lv.submissions;
