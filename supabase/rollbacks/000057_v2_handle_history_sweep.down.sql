-- Rollback of 000057: expired held usernames are no longer swept.
begin;
drop trigger if exists handle_history_sweep_after_insert on lv.handle_history;
drop function if exists lv.handle_history_sweep_trigger();
drop function if exists lv.handle_history_sweep();
commit;
