-- 0007_rpc_org_aware.sql
-- Rewrites all RPC functions to be org-aware.
-- org_id is always derived server-side via caller_org_id(), never a client argument.
-- Must DROP first because CREATE OR REPLACE can't change return types.

-- ============================================================
-- Drop existing functions
-- ============================================================

drop function if exists public.join_session(text);
drop function if exists public.redeem_item(uuid);
drop function if exists public.submit_response(uuid, jsonb, text, text, jsonb);

-- ============================================================
-- join_session(p_code)
-- ============================================================

create function public.join_session(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions%rowtype;
  v_member record;
  v_org_id uuid;
begin
  v_org_id := caller_org_id();

  select * into v_session
  from sessions
  where join_code = upper(trim(p_code))
    and org_id = v_org_id
    and is_active = true
    and (closes_at is null or closes_at > now());

  if v_session.id is null then
    return 'Session not found or closed.';
  end if;

  select * into v_member
  from session_members
  where session_id = v_session.id and student_id = auth.uid();

  if v_member.student_id is null then
    insert into session_members (session_id, student_id, org_id)
    values (v_session.id, auth.uid(), v_org_id);
  end if;

  return v_session.id::text;
end;
$$;

-- ============================================================
-- redeem_item(p_item_id)
-- ============================================================

create function public.redeem_item(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item store_items%rowtype;
  v_points integer;
  v_org_id uuid;
begin
  v_org_id := caller_org_id();

  select * into v_item
  from store_items
  where id = p_item_id
    and org_id = v_org_id
    and is_active = true;

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

  insert into orders (student_id, store_item_id, item_name, token_cost, org_id)
  values (auth.uid(), v_item.id, v_item.name, v_item.token_cost, v_org_id);

  return 'ok';
end;
$$;

-- ============================================================
-- submit_response(...)
-- ============================================================

create function public.submit_response(
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
  v_org_id uuid;
begin
  v_org_id := caller_org_id();

  select * into v_session
  from sessions
  where id = p_session_id
    and org_id = v_org_id
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

  insert into responses (session_id, student_id, feedback, idea, points_awarded, menu_day, org_id)
  values (p_session_id, auth.uid(), p_feedback, p_idea, v_session.points_reward, v_session.menu_day, v_org_id)
  returning * into v_response;

  for v_r in select * from jsonb_array_elements(p_ratings)
  loop
    insert into response_ratings (response_id, dish_name, rating, slot, org_id)
    values (
      v_response.id,
      v_r->>'dish_name',
      (v_r->>'rating')::integer,
      v_r->>'slot',
      v_org_id
    );
  end loop;

  if p_answers is not null then
    for v_a in select * from jsonb_array_elements(p_answers)
    loop
      insert into survey_answers (response_id, question_id, value, text_value, numeric_value, option_values, org_id)
      values (
        v_response.id,
        (v_a->>'question_id')::uuid,
        v_a->'value',
        v_a->>'text_value',
        (v_a->>'numeric_value')::double precision,
        case when v_a->'option_values' is not null
          then array(select jsonb_array_elements_text(v_a->'option_values'))
          else null end,
        v_org_id
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
