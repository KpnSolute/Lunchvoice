-- 000046: a public Hub shows its latest open guest Campaign to visitors (audit F5, founder checklist 2026-11-13).
--
-- lv_hub_public_poll(p_slug), callable signed out. For a PUBLIC community Hub that is not suspended it returns the
-- most recently opened Campaign that anyone with the link may already answer as a guest: status active, inside its
-- window, not blocked by staff, audience members_and_guests, not invite only. It returns only what the guest player
-- already shows to anyone holding the link (title, description, mode, anonymity, question count, closing time) plus
-- the link token, so the visitor can answer. Never results, counts, members or a members-only Campaign.
-- A private, missing or suspended Hub, or one with no such Campaign, answers {ok: true, poll: null}: the same answer,
-- so the call reveals nothing lv_hub_get does not.
-- Rollback: supabase/rollbacks/000046_v2_hub_public_poll.down.sql.
begin;

create function lv.api_hub_public_poll(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid;
  c record;
begin
  select h.id into v_hub from lv.hubs h
   where h.slug = lower(btrim(p_slug)) and h.kind = 'community' and h.visibility = 'public'
     and not exists (select 1 from lv.hub_suspensions s where s.hub_id = h.id);
  if v_hub is null then return jsonb_build_object('ok', true, 'poll', null); end if;
  select x.id, x.title, x.description, x.mode, x.anonymity, x.closes_at, x.link_token
    into c
    from lv.campaigns x
   where x.hub_id = v_hub and x.status = 'active' and x.blocked_at is null
     and x.audience = 'members_and_guests' and x.access <> 'invite'
     and lv.campaign_phase(x.status, x.opens_at, x.closes_at) = 'open'
     and (x.guest_limit is null or (select count(*) from lv.guest_participation g where g.campaign_id = x.id) < x.guest_limit)
   order by coalesce(x.opens_at, x.created_at) desc, x.id
   limit 1;
  if c.id is null then return jsonb_build_object('ok', true, 'poll', null); end if;
  return jsonb_build_object('ok', true, 'poll', jsonb_build_object(
    'title', c.title, 'description', c.description, 'mode', c.mode, 'anonymity', c.anonymity, 'closes_at', c.closes_at,
    'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
    'link_token', c.link_token));
end;
$$;

create function lv_api.lv_hub_public_poll(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_public_poll(p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Grants: explicit, never PUBLIC (LC-05). Signed out and signed in.
revoke all on function lv.api_hub_public_poll(text) from public;
revoke all on function lv_api.lv_hub_public_poll(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.api_hub_public_poll(text) from anon';
    execute 'grant execute on function lv_api.lv_hub_public_poll(text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.api_hub_public_poll(text) from authenticated';
    execute 'grant execute on function lv_api.lv_hub_public_poll(text) to authenticated';
  end if;
end $$;

commit;
