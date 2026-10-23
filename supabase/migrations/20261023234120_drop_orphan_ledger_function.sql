-- Remove an orphaned function left over from the upstream MJCCv1 inventory system.
--
-- public.process_ledger_entry() updates a table named "items" that does not exist in this database,
-- is not used by any trigger (verified: zero dependents), and is not referenced by the application or
-- by any migration in this repository. v2 does not use the MJCCv1 inventory system.
drop function if exists public.process_ledger_entry();
