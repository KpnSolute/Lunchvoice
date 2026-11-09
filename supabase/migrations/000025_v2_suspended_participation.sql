-- 000025: a suspended account can no longer answer Campaigns or join Hubs (founder decision 2026-11-08).
-- 000023 let a suspended account keep answering and joining; the founder reversed that. The account can still sign in,
-- read, leave Hubs, delete its Hubs and delete itself. Nothing is deleted. Enforced at the table (like every other
-- suspension rule) so every current and future write path is covered, including the API and the Discord bot.
begin;

create function lv.suspended_account_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lv.account_suspended(new.account_id) then
    raise exception 'lv_suspended: Your account is suspended, so you can''t answer Campaigns or join Hubs. You can still read, leave and delete your data.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger participation_account_suspension_guard before insert on lv.participation
  for each row execute function lv.suspended_account_guard();
create trigger hub_memberships_account_suspension_guard before insert on lv.hub_memberships
  for each row execute function lv.suspended_account_guard();

revoke all on function lv.suspended_account_guard() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function lv.suspended_account_guard() from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function lv.suspended_account_guard() from authenticated'; end if;
end $$;

commit;
