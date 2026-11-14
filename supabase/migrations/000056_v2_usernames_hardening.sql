-- 000056: hardening of 000055 after an automated security review (2026-11-14).
--
--   1. Link candidates: the matched account's email must also be verified, not only the caller's.
--   2. A verified flag never survives an email change: when an identity's email changes, email_verified_at is cleared, so
--      "verified" always refers to the email currently stored (the next verified sign-in sets it again).
--   3. Held usernames survive account deletion: deleting an account holds its username for handle.hold_days for everyone, and
--      history rows are kept (account_id becomes null) instead of being cascade-deleted; a null owner blocks everyone.
-- Rollback: supabase/rollbacks/000056_v2_usernames_hardening.down.sql.
begin;

create or replace function lv.api_link_candidates() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  return jsonb_build_object('ok', true, 'candidates', coalesce((
    select jsonb_agg(jsonb_build_object('display_name', a.display_name, 'handle', a.handle, 'created_at', a.created_at)
                     order by a.created_at)
      from (select distinct o.account_id
              from lv.account_identities mine
              join lv.account_identities o on lower(o.email) = lower(mine.email) and o.account_id <> v_account
             where mine.account_id = v_account and mine.email is not null and mine.email_verified_at is not null
               and o.email_verified_at is not null) c
      join lv.accounts a on a.id = c.account_id), '[]'::jsonb));
end;
$$;

create function lv.identity_email_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- A new address is unverified until a verified sign-in says otherwise.
  new.email_verified_at := null;
  return new;
end;
$$;
create trigger account_identities_email_changed
  before update of email on lv.account_identities
  for each row when (new.email is distinct from old.email)
  execute function lv.identity_email_changed();

alter table lv.handle_history alter column account_id drop not null;
alter table lv.handle_history drop constraint handle_history_account_id_fkey;
alter table lv.handle_history
  add constraint handle_history_account_id_fkey foreign key (account_id) references lv.accounts (id) on delete set null;

create or replace function lv.handle_problem(p_handle text, p_account uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_handle is null or length(p_handle) < 3 or length(p_handle) > 20 then return 'length'; end if;
  if p_handle !~ '^[a-z][a-z0-9_]{2,19}$' or position('__' in p_handle) > 0 then return 'format'; end if;
  if exists (select 1 from lv.reserved_handles r where r.handle = p_handle) then return 'reserved'; end if;
  if exists (select 1 from lv.accounts a where a.handle = p_handle and a.id <> p_account) then return 'taken'; end if;
  -- A row with no owner (its account was deleted) is held for everyone until it expires.
  if exists (select 1 from lv.handle_history h
              where h.handle = p_handle and h.held_until > now() and (h.account_id is null or h.account_id <> p_account)) then return 'held'; end if;
  return null;
end;
$$;

create function lv.hold_handle_on_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.handle is not null then
    insert into lv.handle_history (handle, account_id, held_until)
    values (old.handle, old.id, now() + make_interval(days => coalesce((lv.policy_json('handle.hold_days'))::int, 14)));
  end if;
  return old;
end;
$$;
create trigger accounts_hold_handle before delete on lv.accounts
  for each row execute function lv.hold_handle_on_delete();

revoke all on function lv.identity_email_changed(), lv.hold_handle_on_delete() from public;

commit;
