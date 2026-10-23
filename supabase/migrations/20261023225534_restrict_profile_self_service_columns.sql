-- Restrict self-service profile writes to the columns the app actually edits.
--
-- The app's only client-side profile write is email/display_name after sign-in
-- (src/routes/Login.tsx). Profiles are created by public.handle_new_user()
-- (SECURITY DEFINER, owned by postgres), and points/streak/role changes happen in
-- SECURITY DEFINER RPCs or Edge Functions using the service role, none of which are
-- affected by these grants.
--
-- 1) Codify column-level UPDATE privileges (production already had these; the
--    repository's migrations did not) and stop direct INSERT by API roles.
revoke update, insert on public.profiles from anon, authenticated;
grant update (email, display_name) on public.profiles to authenticated;

-- 2) Defense in depth: reject changes to privileged profile columns by any role
--    other than the database owner roles and the service role, even if a future
--    grant re-widens column privileges.
create or replace function public.profiles_protect_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.is_staff is distinct from old.is_staff
     or new.points is distinct from old.points
     or new.streak is distinct from old.streak
     or new.last_survey_date is distinct from old.last_survey_date
     or new.org_id is distinct from old.org_id
     or new.mjcc_username is distinct from old.mjcc_username then
    raise exception 'profile column is not user-editable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_protect_privileged_columns() from public, anon, authenticated;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_protect_privileged_columns();
