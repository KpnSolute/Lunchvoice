-- 000034: keep BOTH staff queues. Another track's 000030 (survey and comment reports grouped per survey, with categories and the
-- median time to a decision) and 000033 (reports about people and Hubs) each replaced lv.api_admin_reports. This one gives the
-- queue both: the grouped survey and comment items AND the person and Hub items. It applies the merged function only when the
-- grouped queue's columns exist (lv.abuse_reports.category from 000030); otherwise 000033's own queue is already right.
begin;
do $do$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'lv' and table_name = 'abuse_reports' and column_name = 'category') then
    execute $fn$create or replace function lv.api_admin_reports(p_status text, p_type text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_status text := coalesce(nullif(p_status, ''), 'open');
  v_type text := coalesce(nullif(p_type, ''), 'all');
begin
  if v_denied is not null then return v_denied; end if;
  if v_status not in ('open', 'actioned', 'dismissed', 'all') or v_type not in ('survey', 'comment', 'person', 'hub', 'all') then
    return lv.err('lv_invalid_input', 'Unknown status or type.');
  end if;
  return jsonb_build_object('ok', true,
    'median_decision_hours', (select round((percentile_cont(0.5) within group (order by extract(epoch from (r.decided_at - r.created_at)) / 3600.0))::numeric, 1)
                                from lv.abuse_reports r where r.decided_at is not null and r.decided_at > now() - interval '7 days'),
    'items', coalesce((
    select jsonb_agg(x.item order by x.urgent desc, x.reporters desc, x.at desc) from (
      select max(r.created_at) as at,
             bool_or(r.category in ('scam', 'private_info')) as urgent,
             count(distinct coalesce(r.reporter_account_id::text, r.caller_hash, r.id::text)) as reporters,
             jsonb_build_object('type', 'survey', 'id', c.id, 'status', r.status,
               'reasons', (select jsonb_agg(y.reason order by y.created_at desc) from (select z.reason, z.created_at from lv.abuse_reports z
                             where z.campaign_id = c.id and z.status = r.status order by z.created_at desc limit 3) y),
               'report_count', count(*),
               'distinct_count', count(distinct coalesce(r.reporter_account_id::text, r.caller_hash, r.id::text)),
               'categories', (select jsonb_object_agg(k.category, k.n) from (select z.category, count(*) as n from lv.abuse_reports z
                               where z.campaign_id = c.id and z.status = r.status group by z.category) k),
               'created_at', max(r.created_at), 'first_at', min(r.created_at), 'decided_at', max(r.decided_at),
               'hub_id', h.id, 'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug,
               'quick_survey', h.kind = 'personal', 'hub_suspended', lv.hub_suspended(h.id),
               'campaign_id', c.id, 'campaign_title', c.title, 'join_code', c.join_code, 'blocked', c.blocked_at is not null) as item
        from lv.abuse_reports r join lv.campaigns c on c.id = r.campaign_id join lv.hubs h on h.id = c.hub_id
       where v_type in ('survey', 'all') and (v_status = 'all' or r.status = v_status)
       group by c.id, r.status, h.id
      union all
      select r.created_at, false, 1::bigint,
             jsonb_build_object('type', case r.target_kind when 'account' then 'person' else 'hub' end, 'id', r.id,
               'status', r.status, 'reasons', jsonb_build_array(r.reason), 'report_count', 1, 'distinct_count', 1, 'categories', jsonb_build_object('other', 1),
               'created_at', r.created_at, 'first_at', r.created_at, 'decided_at', r.decided_at,
               'hub_id', h.id, 'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug,
               'quick_survey', false, 'hub_suspended', lv.hub_suspended(h.id),
               'details', r.details, 'staff_note', r.staff_note,
               'target_account_id', r.target_account_id, 'target_name', ta.display_name,
               'target_suspended', case when r.target_account_id is not null then lv.account_suspended(r.target_account_id) end,
               'target_open_reports', case when r.target_account_id is not null
                  then (select count(*) from lv.user_reports o where o.target_account_id = r.target_account_id and o.status = 'open') end)
        from lv.user_reports r left join lv.hubs h on h.id = r.hub_id left join lv.accounts ta on ta.id = r.target_account_id
       where (v_type = 'all' or (v_type = 'person' and r.target_kind = 'account') or (v_type = 'hub' and r.target_kind = 'hub'))
         and (v_status = 'all' or r.status = v_status)
      union all
      select max(cr.created_at), false, count(*),
             jsonb_build_object('type', 'comment', 'id', cm.id,
               'status', coalesce(rv.status, 'open'),
               'reasons', (select jsonb_agg(y.reason order by y.created_at desc) from (select z.reason, z.created_at from lv.comment_reports z
                             where z.comment_id = cm.id order by z.created_at desc limit 5) y),
               'report_count', count(*), 'distinct_count', count(*), 'categories', jsonb_build_object('other', count(*)),
               'created_at', max(cr.created_at), 'first_at', min(cr.created_at), 'decided_at', max(rv.decided_at),
               'hub_id', h.id, 'hub_name', h.display_name, 'hub_slug', h.slug, 'quick_survey', false, 'hub_suspended', lv.hub_suspended(h.id),
               'comment_id', cm.id, 'post_id', cm.post_id, 'excerpt', left(cm.body, 280), 'hidden', cm.hidden_at is not null,
               'author_suspended', lv.account_suspended(cm.author_account_id), 'author_account_id', cm.author_account_id)
        from lv.comment_reports cr join lv.comments cm on cm.id = cr.comment_id join lv.hubs h on h.id = cm.hub_id
        left join lv.comment_report_reviews rv on rv.comment_id = cm.id
       where v_type in ('comment', 'all') and (v_status = 'all' or coalesce(rv.status, 'open') = v_status)
       group by cm.id, rv.status, h.id
       order by 1 desc limit 300) x), '[]'::jsonb));
end;
$$;$fn$;
  end if;
end
$do$;
commit;
