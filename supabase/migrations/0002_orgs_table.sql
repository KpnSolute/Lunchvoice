-- 0002_orgs_table.sql
-- Creates the orgs table and seeds LionCafe as tenant #1.

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  auth_provider text not null default 'mjcc_v1_sudo',
  created_at timestamptz not null default now()
);

create unique index if not exists orgs_slug_lower_idx on public.orgs (lower(slug));

-- Seed LionCafe (existing MJCC data)
insert into public.orgs (slug, name) values ('LionCafe', 'Miami Job Corps Cafeteria')
on conflict (slug) do nothing;

-- Allow anonymous read for pre-login slug resolution
alter table public.orgs enable row level security;

create policy orgs_select_public on public.orgs
  for select using (true);
