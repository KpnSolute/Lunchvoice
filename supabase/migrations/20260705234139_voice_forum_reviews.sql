-- Voice is an anonymous student-facing meal review wall.
-- Students can read visible posts from their org, but profile identity is not
-- selected by the app and remains protected by the table shape/RLS.
alter table public.voice_notes
  add column if not exists menu_day int,
  add column if not exists dish_name text,
  add column if not exists meal_period text,
  add column if not exists status text not null default 'visible',
  add column if not exists reports int not null default 0,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id);

create index if not exists voice_notes_org_status_created_idx
  on public.voice_notes(org_id, status, created_at desc);

create index if not exists voice_notes_org_menu_day_idx
  on public.voice_notes(org_id, menu_day);

alter table public.voice_notes
  drop constraint if exists voice_notes_status_check;

alter table public.voice_notes
  add constraint voice_notes_status_check
  check (status in ('visible', 'reported', 'hidden'));

drop policy if exists voice_notes_select on public.voice_notes;
drop policy if exists voice_notes_insert on public.voice_notes;
drop policy if exists voice_notes_update_admin on public.voice_notes;

create policy voice_notes_select on public.voice_notes
  for select to authenticated using (
    org_id = caller_org_id()
    and (status = 'visible' or is_admin())
  );

create policy voice_notes_insert on public.voice_notes
  for insert to authenticated with check (
    org_id = caller_org_id()
    and student_id = auth.uid()
    and status = 'visible'
  );

create policy voice_notes_update_admin on public.voice_notes
  for update to authenticated using (
    org_id = caller_org_id() and is_admin()
  ) with check (
    org_id = caller_org_id() and is_admin()
  );
