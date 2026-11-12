-- Data fix for audit P3 (2026-11-12): rewrite display names that are email addresses.
--
-- NOT A MIGRATION. Never run automatically, never part of db-test-canonical's chain. Production needs the owner's
-- explicit approval of this exact file, applied per docs/backend/PRODUCTION_RESET_RUNBOOK.md, after
-- 000040_v2_display_name_never_email is applied (it provides lv.safe_display_name and the NOT VALID check).
--
-- Step 1 (read only) previews every change. Step 2 rewrites in one transaction, refuses to commit if the number of
-- rows changed differs from what the preview said, and validates the check so no "@" name can exist again.
-- Nothing is deleted. Membership, roles, responses and audit history are untouched; only the visible name changes.

-- ---------------------------------------------------------------- step 1: preview (read only)
select a.id as account_id,
       regexp_replace(a.display_name, '^(.).*@(.).*(\.[^.]+)$', '\1***@\2***\3') as before_masked,
       lv.safe_display_name(a.display_name, i.email) as after
  from lv.accounts a
  left join lateral (select x.email from lv.account_identities x where x.account_id = a.id
                      order by x.created_at limit 1) i on true
 where position('@' in a.display_name) > 0
 order by a.created_at;

select count(*) as cached_identity_names_to_clear
  from lv.account_identities where position('@' in coalesce(display_name, '')) > 0;

-- ---------------------------------------------------------------- step 2: apply (set :expected to the preview count)
-- psql -v expected=2 -f scripts/data-fixes/2026-11-12_p3_display_names.sql
begin;

with fixed as (
  update lv.accounts a
     set display_name = lv.safe_display_name(a.display_name,
           (select x.email from lv.account_identities x where x.account_id = a.id order by x.created_at limit 1))
   where position('@' in a.display_name) > 0
  returning a.id
)
select count(*) as accounts_changed from fixed \gset

update lv.account_identities set display_name = null, updated_at = now()
 where position('@' in coalesce(display_name, '')) > 0;

select :accounts_changed = :expected as count_matches \gset
\if :count_matches
  alter table lv.accounts validate constraint accounts_display_name_no_email;
  select lv.audit(null, null, 'account.display_name_fixed', 'p3-2026-11-12', jsonb_build_object('accounts', :accounts_changed));
  commit;
\else
  \echo 'Row count differs from the preview; rolling back.'
  rollback;
\endif
