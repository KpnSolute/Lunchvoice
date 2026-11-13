-- 000052: a signed-in respondent may change the name their answers carry (founder request 2026-11-13: a live identified
-- survey with names "required" locked a signed-in person to their account name, so they could not answer as
-- "Maurice from Corporate" or a preferred name).
--
-- Decisions (handoff 2026-11-13, piece 1):
--   * New overload lv_api.lv_submit_response(p_campaign, p_answers, p_display_name). The two-argument function keeps
--     working and delegates with a null name (older clients, the Discord path in 000024).
--   * The label is stored on lv.submissions.guest_name, the column 000028 already protects. It now holds "the name typed
--     with this answer" for a guest or a signed-in person; lv.submissions.is_guest says which, so Results can tag
--     "Account" or "Guest". No new column.
--   * Never stored on an anonymous Campaign: the function ignores the name entirely there (no error), and the 000028
--     trigger still refuses a name on an anonymous answer if any other path tried.
--   * Cleaned the same way for everyone: control characters are refused, runs of spaces collapse, 1 to 40 characters.
--     A blank name means "use my account name" and stores nothing.
--   * The name is a label only. Identity stays the (issuer, subject) pair; one answer per account is still decided by
--     lv.participation, never by the name; authorization never reads it.
-- Rollback: supabase/rollbacks/000052_v2_respondent_display_name.down.sql.
begin;

comment on column lv.submissions.guest_name is
  'The name typed with this answer on an identified Campaign (a guest''s name, or a signed-in person''s chosen label). Never set on an anonymous answer. A label only: never used for identity, authorization or de-duplication. is_guest says whose it is.';

-- Shared cleaning: null when blank, raises lv_invalid_input for control characters or more than 40 characters.
create function lv.clean_display_name(p_name text) returns text
language plpgsql immutable security definer set search_path = ''
as $$
declare
  v text;
begin
  if p_name is null then return null; end if;
  if p_name ~ '[[:cntrl:]]' then
    raise exception 'lv_invalid_input: A name cannot contain control characters.' using errcode = '22023';
  end if;
  v := nullif(btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g')), '');
  if v is not null and length(v) > 40 then
    raise exception 'lv_invalid_input: Keep the name to 40 characters.' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- The member submit with an optional display name (the 000014 body plus the name).
create function lv.submit_response(p_campaign uuid, p_answers jsonb, p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_bad text;
  v_sub uuid;
  v_part uuid;
  v_receipt uuid;
  v_name text;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;

  select * into c from lv.campaigns where id = p_campaign;
  if c is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;

  if c.status <> 'active' or c.blocked_at is not null
     or (c.opens_at is not null and c.opens_at > now())
     or (c.closes_at is not null and c.closes_at <= now()) then
    raise exception 'lv_closed: this Campaign is not accepting responses' using errcode = '42501';
  end if;

  if not lv.can_participate(p_campaign, v_account) then
    raise exception 'lv_forbidden: you are not eligible to answer this Campaign' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_submit:' || p_campaign::text || ':' || v_account::text, 0));

  select p.id, p.receipt_id into v_part, v_receipt
    from lv.participation p
   where p.campaign_id = p_campaign and p.account_id = v_account;
  if v_part is not null then
    return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', true);
  end if;

  v_bad := lv.validate_answers(p_campaign, p_answers);
  if v_bad is not null then
    raise exception 'lv_invalid_input: %', v_bad using errcode = '22023';
  end if;

  -- Anonymous Campaign: the name is ignored entirely (not even checked), so nothing can link a name to an answer.
  if c.anonymity = 'identified' then v_name := lv.clean_display_name(p_display_name); end if;

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id, guest_name)
  values (p_campaign, c.hub_id, c.revision, case when c.anonymity = 'anonymous' then null else v_account end, v_name)
  returning id into v_sub;

  insert into lv.answers (submission_id, question_id, value)
  select v_sub, (e->>'question_id')::uuid, e->'value'
    from jsonb_array_elements(p_answers) e
   where e->'value' is not null and e->'value' <> 'null'::jsonb;

  insert into lv.participation (campaign_id, hub_id, account_id, submission_id, campaign_revision, reward_state)
  values (p_campaign, c.hub_id, v_account,
          case when c.anonymity = 'anonymous' then null else v_sub end,
          c.revision, 'not_applicable')
  returning id, receipt_id into v_part, v_receipt;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'duplicate', false);
end;
$$;

-- The two-argument function stays as a delegate, so every existing caller keeps its exact behaviour.
create or replace function lv.submit_response(p_campaign uuid, p_answers jsonb) returns jsonb
language sql volatile security definer set search_path = ''
as $$ select lv.submit_response(p_campaign, p_answers, null) $$;

create function lv.api_submit_response(p_campaign uuid, p_answers jsonb, p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.submit_response(p_campaign, p_answers, p_display_name); end; $$;

create function lv_api.lv_submit_response(p_campaign uuid, p_answers jsonb, p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_submit_response(p_campaign, p_answers, p_display_name); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- The creator's Responses list: a chosen label wins over the account name, and kind says "member" or "guest" so the
-- screen can tag Account or Guest. Same body as 000028 except the name expression.
create or replace function lv.api_campaign_responses(p_campaign uuid, p_limit int, p_before timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or c.status = 'draft' or lv.membership_of(v_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading responses requires analytics.read.');
  end if;
  if c.anonymity <> 'identified' then
    return lv.err('lv_not_available', 'Individual responses exist only for identified Campaigns. An anonymous Campaign only ever shows totals.');
  end if;

  select coalesce(jsonb_agg(r.j order by r.at desc), '[]'::jsonb) into v_rows
    from (
      select s.created_at as at, jsonb_build_object(
               'response_id', s.id,
               'kind', case when s.is_guest then 'guest' else 'member' end,
               'verified', not s.is_guest,
               'name', case when s.is_guest then s.guest_name else coalesce(s.guest_name, a.display_name) end,
               'at', s.created_at,
               'answers', coalesce((
                 select jsonb_agg(jsonb_build_object('question_id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'value', an.value) order by q.position)
                   from lv.answers an join lv.campaign_questions q on q.id = an.question_id
                  where an.submission_id = s.id), '[]'::jsonb)) as j
        from lv.submissions s left join lv.accounts a on a.id = s.account_id
       where s.campaign_id = c.id and (p_before is null or s.created_at < p_before)
       order by s.created_at desc limit v_limit) r;

  if p_before is null then
    perform lv.audit(v_account, c.hub_id, 'campaign.responses_viewed', c.id::text);
  end if;
  return jsonb_build_object('ok', true, 'responses', v_rows,
    'total', (select count(*) from lv.submissions s where s.campaign_id = c.id));
end;
$$;

-- Grants: explicit. Only signed-in people submit as a member; nothing here is callable signed out.
revoke all on function lv.clean_display_name(text) from public;
revoke all on function lv.submit_response(uuid, jsonb, text) from public;
revoke all on function lv.api_submit_response(uuid, jsonb, text) from public;
revoke all on function lv_api.lv_submit_response(uuid, jsonb, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.clean_display_name(text) from anon';
    execute 'revoke all on function lv.submit_response(uuid, jsonb, text) from anon';
    execute 'revoke all on function lv.api_submit_response(uuid, jsonb, text) from anon';
    execute 'revoke all on function lv_api.lv_submit_response(uuid, jsonb, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.clean_display_name(text) from authenticated';
    execute 'revoke all on function lv.submit_response(uuid, jsonb, text) from authenticated';
    execute 'revoke all on function lv.api_submit_response(uuid, jsonb, text) from authenticated';
    execute 'grant execute on function lv_api.lv_submit_response(uuid, jsonb, text) to authenticated';
  end if;
end $$;

commit;
