-- 000057: held usernames are not kept forever (founder, 2026-11-14: "why are you keeping deleted accounts").
--
-- A deleted account keeps nothing about the person. For handle.hold_days only the username text and an expiry stay, with no owner,
-- so nobody can take the name to impersonate. After the hold (plus one day) the row is deleted. The sweep runs whenever a row is
-- added and from a daily cron job (scheduled in production like the other jobs, not in this file).
-- Rollback: supabase/rollbacks/000057_v2_handle_history_sweep.down.sql.
begin;

create function lv.handle_history_sweep() returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from lv.handle_history where held_until < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create function lv.handle_history_sweep_trigger() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform lv.handle_history_sweep();
  return null;
end;
$$;
create trigger handle_history_sweep_after_insert
  after insert on lv.handle_history
  for each statement execute function lv.handle_history_sweep_trigger();

revoke all on function lv.handle_history_sweep(), lv.handle_history_sweep_trigger() from public;

commit;
