-- Rollback for 000052: removes the display-name overload and restores the 000014 submit body and the 000028 Responses list.
-- Names already stored on signed-in answers stay in lv.submissions.guest_name (they are only labels) but are no longer shown.
begin;
drop function if exists lv_api.lv_submit_response(uuid, jsonb, text);
drop function if exists lv.api_submit_response(uuid, jsonb, text);
create or replace function lv.submit_response(p_campaign uuid, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_bad text;
  v_sub uuid;
  v_part uuid;
  v_receipt uuid;
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

  insert into lv.submissions (campaign_id, hub_id, campaign_revision, account_id)
  values (p_campaign, c.hub_id, c.revision, case when c.anonymity = 'anonymous' then null else v_account end)
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
drop function if exists lv.submit_response(uuid, jsonb, text);
drop function if exists lv.clean_display_name(text);
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
               'name', case when s.is_guest then s.guest_name else a.display_name end,
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
comment on column lv.submissions.guest_name is null;
commit;
