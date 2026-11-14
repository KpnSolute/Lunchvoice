-- Rollback of 000056: back to the 000055 behaviour.
begin;
drop trigger if exists accounts_hold_handle on lv.accounts;
drop function if exists lv.hold_handle_on_delete();
drop trigger if exists account_identities_email_changed on lv.account_identities;
drop function if exists lv.identity_email_changed();
delete from lv.handle_history where account_id is null;
alter table lv.handle_history drop constraint if exists handle_history_account_id_fkey;
alter table lv.handle_history alter column account_id set not null;
alter table lv.handle_history
  add constraint handle_history_account_id_fkey foreign key (account_id) references lv.accounts (id) on delete cascade;
create or replace function lv.handle_problem(p_handle text, p_account uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_handle is null or length(p_handle) < 3 or length(p_handle) > 20 then return 'length'; end if;
  if p_handle !~ '^[a-z][a-z0-9_]{2,19}$' or position('__' in p_handle) > 0 then return 'format'; end if;
  if exists (select 1 from lv.reserved_handles r where r.handle = p_handle) then return 'reserved'; end if;
  if exists (select 1 from lv.accounts a where a.handle = p_handle and a.id <> p_account) then return 'taken'; end if;
  if exists (select 1 from lv.handle_history h
              where h.handle = p_handle and h.held_until > now() and h.account_id <> p_account) then return 'held'; end if;
  return null;
end;
$$;
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
             where mine.account_id = v_account and mine.email is not null and mine.email_verified_at is not null) c
      join lv.accounts a on a.id = c.account_id), '[]'::jsonb));
end;
$$;
commit;
