-- 0008: handle_new_user must populate profiles.org_id (NOT NULL since 0003),
-- otherwise every new auth.users insert aborts. org_id comes from signup
-- metadata (login-start / staff-login pass it), falling back to LionCafe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, org_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email, '@', 1)),
    coalesce(
      (new.raw_user_meta_data->>'org_id')::uuid,
      (select id from public.orgs where slug ilike 'LionCafe')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
