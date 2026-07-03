-- 0003_org_id_columns.sql
-- Adds org_id to all 14 tables, backfills LionCafe, sets NOT NULL, adds indexes.
-- Step 1: Add nullable columns
-- Step 2: Backfill existing rows to LionCafe
-- Step 3: Set NOT NULL + indexes (after verifying zero nulls)

-- ============================================================
-- STEP 1: Add nullable org_id columns
-- ============================================================

alter table public.profiles add column if not exists org_id uuid references public.orgs(id);
alter table public.sessions add column if not exists org_id uuid references public.orgs(id);
alter table public.session_members add column if not exists org_id uuid references public.orgs(id);
alter table public.survey_templates add column if not exists org_id uuid references public.orgs(id);
alter table public.survey_questions add column if not exists org_id uuid references public.orgs(id);
alter table public.survey_answers add column if not exists org_id uuid references public.orgs(id);
alter table public.responses add column if not exists org_id uuid references public.orgs(id);
alter table public.response_ratings add column if not exists org_id uuid references public.orgs(id);
alter table public.dish_ratings add column if not exists org_id uuid references public.orgs(id);
alter table public.voice_notes add column if not exists org_id uuid references public.orgs(id);
alter table public.menu_cycles add column if not exists org_id uuid references public.orgs(id);
alter table public.menu_cycle_days add column if not exists org_id uuid references public.orgs(id);
alter table public.store_items add column if not exists org_id uuid references public.orgs(id);
alter table public.orders add column if not exists org_id uuid references public.orgs(id);

-- ============================================================
-- STEP 2: Backfill all existing rows to LionCafe
-- ============================================================

do $$
declare
  lion_id uuid;
  tbl text;
  tables text[] := array[
    'profiles', 'sessions', 'session_members', 'survey_templates',
    'survey_questions', 'survey_answers', 'responses', 'response_ratings',
    'dish_ratings', 'voice_notes', 'menu_cycles', 'menu_cycle_days',
    'store_items', 'orders'
  ];
begin
  select id into lion_id from public.orgs where slug = 'LionCafe';
  if lion_id is null then
    raise exception 'LionCafe org not found — run 0002 first';
  end if;

  foreach tbl in array tables loop
    execute format('update public.%I set org_id = $1 where org_id is null', tbl)
      using lion_id;
  end loop;
end $$;

-- ============================================================
-- STEP 3: Verify zero nulls, then set NOT NULL + indexes
-- ============================================================

-- This block will FAIL if any nulls remain — that's intentional.
do $$
declare
  tbl text;
  cnt bigint;
  tables text[] := array[
    'profiles', 'sessions', 'session_members', 'survey_templates',
    'survey_questions', 'survey_answers', 'responses', 'response_ratings',
    'dish_ratings', 'voice_notes', 'menu_cycles', 'menu_cycle_days',
    'store_items', 'orders'
  ];
begin
  foreach tbl in array tables loop
    execute format('select count(*) from public.%I where org_id is null', tbl) into cnt;
    if cnt > 0 then
      raise exception 'Table % has % null org_id rows — backfill incomplete', tbl, cnt;
    end if;
  end loop;
end $$;

-- Now safe to set NOT NULL
alter table public.profiles alter column org_id set not null;
alter table public.sessions alter column org_id set not null;
alter table public.session_members alter column org_id set not null;
alter table public.survey_templates alter column org_id set not null;
alter table public.survey_questions alter column org_id set not null;
alter table public.survey_answers alter column org_id set not null;
alter table public.responses alter column org_id set not null;
alter table public.response_ratings alter column org_id set not null;
alter table public.dish_ratings alter column org_id set not null;
alter table public.voice_notes alter column org_id set not null;
alter table public.menu_cycles alter column org_id set not null;
alter table public.menu_cycle_days alter column org_id set not null;
alter table public.store_items alter column org_id set not null;
alter table public.orders alter column org_id set not null;

-- Add indexes for RLS performance
create index if not exists profiles_org_id_idx on public.profiles(org_id);
create index if not exists sessions_org_id_idx on public.sessions(org_id);
create index if not exists session_members_org_id_idx on public.session_members(org_id);
create index if not exists survey_templates_org_id_idx on public.survey_templates(org_id);
create index if not exists survey_questions_org_id_idx on public.survey_questions(org_id);
create index if not exists survey_answers_org_id_idx on public.survey_answers(org_id);
create index if not exists responses_org_id_idx on public.responses(org_id);
create index if not exists response_ratings_org_id_idx on public.response_ratings(org_id);
create index if not exists dish_ratings_org_id_idx on public.dish_ratings(org_id);
create index if not exists voice_notes_org_id_idx on public.voice_notes(org_id);
create index if not exists menu_cycles_org_id_idx on public.menu_cycles(org_id);
create index if not exists menu_cycle_days_org_id_idx on public.menu_cycle_days(org_id);
create index if not exists store_items_org_id_idx on public.store_items(org_id);
create index if not exists orders_org_id_idx on public.orders(org_id);

-- ============================================================
-- STEP 4: Add missing parent-child FKs
-- ============================================================

-- Verify no orphaned rows before adding FKs (trivial with small live counts)
do $$
declare
  cnt bigint;
begin
  select count(*) into cnt from public.survey_questions q
    where not exists (select 1 from public.survey_templates t where t.id = q.template_id);
  if cnt > 0 then raise exception 'Orphaned survey_questions: %', cnt; end if;

  select count(*) into cnt from public.menu_cycle_days d
    where not exists (select 1 from public.menu_cycles c where c.id = d.cycle_id);
  if cnt > 0 then raise exception 'Orphaned menu_cycle_days: %', cnt; end if;

  select count(*) into cnt from public.responses r
    where not exists (select 1 from public.sessions s where s.id = r.session_id);
  if cnt > 0 then raise exception 'Orphaned responses: %', cnt; end if;

  select count(*) into cnt from public.response_ratings rr
    where not exists (select 1 from public.responses r where r.id = rr.response_id);
  if cnt > 0 then raise exception 'Orphaned response_ratings: %', cnt; end if;

  select count(*) into cnt from public.survey_answers sa
    where not exists (select 1 from public.responses r where r.id = sa.response_id);
  if cnt > 0 then raise exception 'Orphaned survey_answers (response): %', cnt; end if;

  select count(*) into cnt from public.survey_answers sa
    where not exists (select 1 from public.survey_questions q where q.id = sa.question_id);
  if cnt > 0 then raise exception 'Orphaned survey_answers (question): %', cnt; end if;

  select count(*) into cnt from public.session_members sm
    where not exists (select 1 from public.sessions s where s.id = sm.session_id);
  if cnt > 0 then raise exception 'Orphaned session_members: %', cnt; end if;

  select count(*) into cnt from public.orders o
    where o.store_item_id is not null
      and not exists (select 1 from public.store_items si where si.id = o.store_item_id);
  if cnt > 0 then raise exception 'Orphaned orders: %', cnt; end if;
end $$;

-- Add FKs (survey_questions.template_id already has FK from 0001; skip if exists)
-- These are safe to run — IF NOT EXISTS would be ideal but not standard for constraints.
-- Use DO blocks to skip if already present.

do $$ begin
  alter table public.menu_cycle_days
    add constraint menu_cycle_days_cycle_id_fk
    foreign key (cycle_id) references public.menu_cycles(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.responses
    add constraint responses_session_id_fk
    foreign key (session_id) references public.sessions(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.response_ratings
    add constraint response_ratings_response_id_fk
    foreign key (response_id) references public.responses(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.survey_answers
    add constraint survey_answers_response_id_fk
    foreign key (response_id) references public.responses(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.survey_answers
    add constraint survey_answers_question_id_fk
    foreign key (question_id) references public.survey_questions(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders
    add constraint orders_store_item_id_fk
    foreign key (store_item_id) references public.store_items(id);
exception when duplicate_object then null; end $$;
