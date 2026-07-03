-- 0001_baseline.sql
-- Captures the current live schema as-is (no behavior change).
-- This migration already exists in production — mark as applied, do not re-run.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  points integer not null default 0,
  streak integer not null default 0,
  last_survey_date date,
  role text not null default 'student',
  is_staff boolean not null default false,
  mjcc_username text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  join_code text not null unique,
  points_reward integer not null default 50,
  is_active boolean not null default true,
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid,
  template_id uuid,
  menu_cycle_id uuid,
  menu_day integer,
  created_at timestamptz not null default now()
);

create table if not exists public.session_members (
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table if not exists public.survey_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  audience text not null default 'all',
  status text not null default 'draft',
  points_reward integer not null default 50,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.survey_templates(id) on delete cascade,
  position integer not null default 0,
  type text not null,
  prompt text not null,
  help_text text,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  scale_min integer not null default 1,
  scale_max integer not null default 5,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  feedback text,
  idea text,
  points_awarded integer not null default 0,
  menu_day integer,
  submitted_at timestamptz not null default now()
);

create table if not exists public.response_ratings (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses(id) on delete cascade,
  dish_name text not null,
  rating integer not null,
  slot text not null
);

create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  value jsonb,
  text_value text,
  numeric_value double precision,
  option_values text[],
  created_at timestamptz not null default now()
);

create table if not exists public.dish_ratings (
  student_id uuid not null references auth.users(id) on delete cascade,
  dish_key text not null,
  dish_name text not null,
  category text not null,
  rating integer not null,
  updated_at timestamptz not null default now(),
  primary key (student_id, dish_key)
);

create table if not exists public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_cycles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  version_label text,
  starts_on date,
  is_active boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_cycle_days (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.menu_cycles(id) on delete cascade,
  day_number integer not null,
  weekday text,
  breakfast jsonb not null default '[]'::jsonb,
  lunch jsonb not null default '[]'::jsonb,
  dinner jsonb not null default '[]'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  token_cost integer not null default 100,
  stock integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  store_item_id uuid references public.store_items(id),
  item_name text not null,
  token_cost integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- VIEWS
-- ============================================================

create or replace view public.student_roster as
select
  p.id,
  p.display_name,
  p.email,
  p.points,
  p.streak,
  p.created_at,
  (select count(*) from public.responses r where r.student_id = p.id) as responses,
  (select count(*) from public.orders o where o.student_id = p.id) as orders
from public.profiles p
where p.is_staff = false;

create or replace view public.dish_rating_stats as
select
  dr.dish_key,
  dr.dish_name,
  dr.category,
  avg(dr.rating)::numeric(3,2) as avg_rating,
  count(*) as votes
from public.dish_ratings dr
group by dr.dish_key, dr.dish_name, dr.category;

create or replace view public.dish_stats as
select
  rr.dish_name,
  rr.slot,
  avg(rr.rating)::numeric(3,2) as avg_rating,
  count(*) as votes
from public.response_ratings rr
group by rr.dish_name, rr.slot;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.survey_templates enable row level security;
alter table public.survey_questions enable row level security;
alter table public.responses enable row level security;
alter table public.response_ratings enable row level security;
alter table public.survey_answers enable row level security;
alter table public.dish_ratings enable row level security;
alter table public.voice_notes enable row level security;
alter table public.menu_cycles enable row level security;
alter table public.menu_cycle_days enable row level security;
alter table public.store_items enable row level security;
alter table public.orders enable row level security;

-- Profiles
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

create policy profiles_insert_trigger on public.profiles
  for insert with check (true);

-- Sessions
create policy sessions_select on public.sessions
  for select using (is_active = true or is_admin());

create policy sessions_insert_admin on public.sessions
  for insert with check (is_admin());

create policy sessions_update_admin on public.sessions
  for update using (is_admin());

create policy sessions_delete_admin on public.sessions
  for delete using (is_admin());

-- Session members
create policy session_members_select_own on public.session_members
  for select using (student_id = auth.uid() or is_admin());

create policy session_members_insert on public.session_members
  for insert with check (true);

-- Survey templates
create policy survey_templates_select on public.survey_templates
  for select using (status = 'published' or is_admin());

create policy survey_templates_insert_admin on public.survey_templates
  for insert with check (is_admin());

create policy survey_templates_update_admin on public.survey_templates
  for update using (is_admin());

create policy survey_templates_delete_admin on public.survey_templates
  for delete using (is_admin());

-- Survey questions
create policy survey_questions_select on public.survey_questions
  for select using (true);

create policy survey_questions_insert_admin on public.survey_questions
  for insert with check (is_admin());

create policy survey_questions_update_admin on public.survey_questions
  for update using (is_admin());

create policy survey_questions_delete_admin on public.survey_questions
  for delete using (is_admin());

-- Responses
create policy responses_select on public.responses
  for select using (student_id = auth.uid() or is_admin());

create policy responses_insert on public.responses
  for insert with check (true);

-- Response ratings
create policy response_ratings_select on public.response_ratings
  for select using (true);

create policy response_ratings_insert on public.response_ratings
  for insert with check (true);

-- Survey answers
create policy survey_answers_select on public.survey_answers
  for select using (true);

create policy survey_answers_insert on public.survey_answers
  for insert with check (true);

-- Dish ratings
create policy dish_ratings_select on public.dish_ratings
  for select using (true);

create policy dish_ratings_insert on public.dish_ratings
  for insert with check (true);

create policy dish_ratings_update on public.dish_ratings
  for update using (student_id = auth.uid());

-- Voice notes
create policy voice_notes_select on public.voice_notes
  for select using (is_admin());

create policy voice_notes_insert on public.voice_notes
  for insert with check (true);

-- Menu cycles
create policy menu_cycles_select on public.menu_cycles
  for select using (true);

create policy menu_cycles_insert_admin on public.menu_cycles
  for insert with check (is_admin());

create policy menu_cycles_update_admin on public.menu_cycles
  for update using (is_admin());

create policy menu_cycles_delete_admin on public.menu_cycles
  for delete using (is_admin());

-- Menu cycle days
create policy menu_cycle_days_select on public.menu_cycle_days
  for select using (true);

create policy menu_cycle_days_insert_admin on public.menu_cycle_days
  for insert with check (is_admin());

create policy menu_cycle_days_update_admin on public.menu_cycle_days
  for update using (is_admin());

create policy menu_cycle_days_delete_admin on public.menu_cycle_days
  for delete using (is_admin());

-- Store items
create policy store_items_select on public.store_items
  for select using (true);

create policy store_items_insert_admin on public.store_items
  for insert with check (is_admin());

create policy store_items_update_admin on public.store_items
  for update using (is_admin());

create policy store_items_delete_admin on public.store_items
  for delete using (is_admin());

-- Orders
create policy orders_select on public.orders
  for select using (student_id = auth.uid() or is_admin());

create policy orders_insert on public.orders
  for insert with check (true);

create policy orders_update_admin on public.orders
  for update using (is_admin());

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.join_session(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions%rowtype;
  v_member record;
begin
  select * into v_session
  from sessions
  where join_code = upper(trim(p_code))
    and is_active = true
    and (closes_at is null or closes_at > now());

  if v_session.id is null then
    return 'Session not found or closed.';
  end if;

  select * into v_member
  from session_members
  where session_id = v_session.id and student_id = auth.uid();

  if v_member.student_id is null then
    insert into session_members (session_id, student_id)
    values (v_session.id, auth.uid());
  end if;

  return v_session.id::text;
end;
$$;

create or replace function public.redeem_item(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item store_items%rowtype;
  v_points integer;
begin
  select * into v_item
  from store_items
  where id = p_item_id and is_active = true;

  if v_item.id is null then
    return 'Item not found.';
  end if;

  select points into v_points
  from profiles
  where id = auth.uid();

  if v_points < v_item.token_cost then
    return 'Not enough points.';
  end if;

  update profiles
  set points = points - v_item.token_cost
  where id = auth.uid();

  insert into orders (student_id, store_item_id, item_name, token_cost)
  values (auth.uid(), v_item.id, v_item.name, v_item.token_cost);

  return 'ok';
end;
$$;

create or replace function public.submit_response(
  p_session_id uuid,
  p_ratings jsonb,
  p_feedback text default null,
  p_idea text default null,
  p_answers jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions%rowtype;
  v_member record;
  v_existing record;
  v_response responses%rowtype;
  v_points integer;
  v_r jsonb;
  v_a jsonb;
begin
  select * into v_session
  from sessions
  where id = p_session_id
    and is_active = true
    and (closes_at is null or closes_at > now());

  if v_session.id is null then
    raise exception 'Session not found or closed.';
  end if;

  select * into v_member
  from session_members
  where session_id = p_session_id and student_id = auth.uid();

  if v_member.student_id is null then
    raise exception 'You must join this session first.';
  end if;

  select * into v_existing
  from responses
  where session_id = p_session_id and student_id = auth.uid();

  if v_existing.id is not null then
    raise exception 'You have already responded to this session.';
  end if;

  insert into responses (session_id, student_id, feedback, idea, points_awarded, menu_day)
  values (p_session_id, auth.uid(), p_feedback, p_idea, v_session.points_reward, v_session.menu_day)
  returning * into v_response;

  for v_r in select * from jsonb_array_elements(p_ratings)
  loop
    insert into response_ratings (response_id, dish_name, rating, slot)
    values (
      v_response.id,
      v_r->>'dish_name',
      (v_r->>'rating')::integer,
      v_r->>'slot'
    );
  end loop;

  if p_answers is not null then
    for v_a in select * from jsonb_array_elements(p_answers)
    loop
      insert into survey_answers (response_id, question_id, value, text_value, numeric_value, option_values)
      values (
        v_response.id,
        (v_a->>'question_id')::uuid,
        v_a->'value',
        v_a->>'text_value',
        (v_a->>'numeric_value')::double precision,
        case when v_a->'option_values' is not null
          then array(select jsonb_array_elements_text(v_a->'option_values'))
          else null end
      );
    end loop;
  end if;

  update profiles
  set points = points + v_session.points_reward,
      streak = streak + 1,
      last_survey_date = current_date
  where id = auth.uid();

  select points into v_points
  from profiles
  where id = auth.uid();

  return v_points;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
