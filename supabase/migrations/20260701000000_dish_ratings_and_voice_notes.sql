-- Standing per-dish star ratings (the "Rate" tab). One row per student per dish, updatable.
create table public.dish_ratings (
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dish_key text not null,
  dish_name text not null,
  category text not null,
  rating int not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (student_id, dish_key)
);
alter table public.dish_ratings enable row level security;
create policy "own dish ratings" on public.dish_ratings
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);
create policy "admin reads dish ratings" on public.dish_ratings
  for select using (public.is_admin());

-- Aggregate view: everyone can see averages without seeing individual rows.
-- ponytail: owner-rights view bypasses RLS on purpose; exposes only aggregates.
create view public.dish_rating_stats as
  select dish_key, dish_name, category,
         round(avg(rating)::numeric, 1) as avg_rating,
         count(*)::int as votes
  from public.dish_ratings
  group by 1, 2, 3;
grant select on public.dish_rating_stats to authenticated;

-- Free-form student voice (the "Voice" tab): feedback + dish ideas outside survey sessions.
create table public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'feedback' check (kind in ('feedback','idea')),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
alter table public.voice_notes enable row level security;
create policy "insert own voice notes" on public.voice_notes
  for insert with check (auth.uid() = student_id);
create policy "read own voice notes" on public.voice_notes
  for select using (auth.uid() = student_id or public.is_admin());
