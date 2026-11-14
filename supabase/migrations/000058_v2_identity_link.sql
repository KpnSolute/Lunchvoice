-- 000058: link a new sign-in to an existing account (spec A9; founder, 2026-11-14: "look for an email associated with this
-- account and ask if you want to link, then confirm your account password").
--
-- lv.link_identities(new_issuer, new_subject, old_issuer, old_subject) moves the NEW identity onto the account that owns the OLD
-- identity, and removes the now-empty account the new sign-in had created. It is callable only by the service role: the `session`
-- Edge Function calls it after it has verified BOTH proofs (the new LunchVoice session and a fresh sign-in to the old account).
-- Safety rules, enforced here as well:
--   * the new account must be EMPTY: nothing may reference it except its identity row, its audit trail and username bookkeeping.
--     This is checked against every foreign key that points at lv.accounts, so a future table cannot be forgotten;
--   * if the old account has no username and the new one chose one, the old account takes it; otherwise the old username stays
--     and the new one is released (and held, as for any deleted account);
--   * the two accounts are locked in a fixed order (no deadlock) and the link is audited; linking twice is a no-op.
-- Rollback: supabase/rollbacks/000058_v2_identity_link.down.sql.
begin;

create function lv.account_is_empty(p_account uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  v_count bigint;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'lv.accounts'::regclass and array_length(c.conkey, 1) = 1
       and c.conrelid::regclass::text not in ('lv.account_identities', 'lv.handle_history', 'lv.handle_check_log')
  loop
    -- The audit trail of the account's own creation does not make it non-empty.
    if r.tbl = 'lv.audit_events' then
      execute format('select count(*) from %s where %I = $1 and action <> ''account.created'' and action <> ''account.handle_set''', r.tbl, r.col)
        into v_count using p_account;
    else
      execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_count using p_account;
    end if;
    if v_count > 0 then return false; end if;
  end loop;
  return true;
end;
$$;

create function lv.link_identities(p_new_issuer text, p_new_subject text, p_old_issuer text, p_old_subject text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_new uuid;
  v_old uuid;
  v_new_handle text;
  v_old_handle text;
begin
  select account_id into v_new from lv.account_identities where identity_issuer = p_new_issuer and identity_subject = p_new_subject;
  select account_id into v_old from lv.account_identities where identity_issuer = p_old_issuer and identity_subject = p_old_subject;
  if v_new is null or v_old is null then return lv.err('lv_not_found', 'One of the sign-ins is not known here.'); end if;
  if v_new = v_old then return jsonb_build_object('ok', true, 'account_id', v_old, 'already_linked', true); end if;

  -- Fixed lock order, then re-read under the lock.
  perform pg_advisory_xact_lock(hashtextextended('lv_link:' || least(v_new::text, v_old::text), 0));
  perform pg_advisory_xact_lock(hashtextextended('lv_link:' || greatest(v_new::text, v_old::text), 0));
  select account_id into v_new from lv.account_identities where identity_issuer = p_new_issuer and identity_subject = p_new_subject;
  if v_new is null then return lv.err('lv_not_found', 'One of the sign-ins is not known here.'); end if;
  if v_new = v_old then return jsonb_build_object('ok', true, 'account_id', v_old, 'already_linked', true); end if;

  if not lv.account_is_empty(v_new) then
    return lv.err('lv_conflict', 'This new sign-in already has its own data, so it cannot be merged into another account.');
  end if;

  select handle into v_new_handle from lv.accounts where id = v_new;
  select handle into v_old_handle from lv.accounts where id = v_old;
  if v_old_handle is null and v_new_handle is not null then
    update lv.accounts set handle = null where id = v_new;          -- free the unique name first
    update lv.accounts set handle = v_new_handle, handle_changed_at = null where id = v_old;
  end if;

  update lv.account_identities set account_id = v_old where identity_issuer = p_new_issuer and identity_subject = p_new_subject;
  delete from lv.accounts where id = v_new;                          -- empty by the check above

  perform lv.audit(v_old, null, 'account.identity_linked', v_old::text,
                   jsonb_build_object('new_issuer', p_new_issuer, 'old_issuer', p_old_issuer));
  return jsonb_build_object('ok', true, 'account_id', v_old);
end;
$$;

revoke all on function lv.account_is_empty(uuid), lv.link_identities(text, text, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function lv.link_identities(text, text, text, text) to service_role';
  end if;
end $$;

commit;
