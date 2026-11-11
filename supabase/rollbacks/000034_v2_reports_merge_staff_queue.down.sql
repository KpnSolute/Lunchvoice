-- Rollback for 000034: nothing to undo on its own. Rolling back 000033 restores the queue to the version before it, and the
-- grouped queue (000030) is that track's to roll back. This file exists so every migration has a rollback.
begin;
select 1;
commit;
