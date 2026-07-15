-- Add optional student discovery without weakening code-only session access.

alter table public.sessions
  add column if not exists show_on_dashboard boolean not null default false;

create index if not exists sessions_discoverable_org_created_idx
  on public.sessions (org_id, created_at desc)
  where show_on_dashboard = true and is_active = true;

create index if not exists session_members_student_session_idx
  on public.session_members (student_id, session_id);

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select
  to authenticated
  using (
    org_id = (select public.caller_org_id())
    and (
      (select public.is_admin())
      or (
        show_on_dashboard = true
        and is_active = true
        and (opens_at is null or opens_at <= now())
        and (closes_at is null or closes_at > now())
      )
      or exists (
        select 1
        from public.session_members member
        where member.session_id = sessions.id
          and member.student_id = (select auth.uid())
      )
    )
  );

create or replace function public.join_available_session(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_session_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.';
  end if;

  v_org_id := public.caller_org_id();

  select session.id into v_session_id
  from public.sessions session
  where session.id = p_session_id
    and session.org_id = v_org_id
    and session.show_on_dashboard = true
    and session.is_active = true
    and (session.opens_at is null or session.opens_at <= now())
    and (session.closes_at is null or session.closes_at > now());

  if v_session_id is null then
    return 'Session not found or closed.';
  end if;

  insert into public.session_members (session_id, student_id, org_id)
  values (v_session_id, (select auth.uid()), v_org_id)
  on conflict (session_id, student_id) do nothing;

  return v_session_id::text;
end;
$$;

revoke all on function public.join_available_session(uuid) from public, anon;
grant execute on function public.join_available_session(uuid) to authenticated;
