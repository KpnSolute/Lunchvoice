-- 0005_contract_requests.sql
-- Marketing lead form — pre-tenant root data, no org_id.

create table if not exists public.contract_requests (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  contact_name text not null,
  contact_email text not null,
  message text,
  created_at timestamptz not null default now()
);

alter table public.contract_requests enable row level security;

-- Insert-only for anonymous and authenticated users
create policy contract_requests_insert on public.contract_requests
  for insert to anon, authenticated with check (true);

-- No select/update/delete policy — reviewed via Supabase dashboard only.
