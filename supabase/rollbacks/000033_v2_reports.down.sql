-- Rollback for 000033_v2_reports: the staff queue and the account row return to their 000023 form; reports about people and
-- Hubs are dropped with the table.
begin;
drop function if exists lv_api.lv_admin_user_report_decide(uuid, text, text);
drop function if exists lv_api.lv_my_reports();
drop function if exists lv_api.lv_report_hub(text, text, text);
drop function if exists lv_api.lv_report_account(uuid, uuid, uuid, text, text);
create or replace function lv.api_admin_reports(p_status text, p_type text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_status text := coalesce(nullif(p_status, ''), 'open');
  v_type text := coalesce(nullif(p_type, ''), 'all');
begin
  if v_denied is not null then return v_denied; end if;
  if v_status not in ('open', 'actioned', 'dismissed', 'all') or v_type not in ('survey', 'comment', 'all') then
    return lv.err('lv_invalid_input', 'Unknown status or type.');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(x.item order by x.at desc) from (
      select r.created_at as at, jsonb_build_object('type', 'survey', 'id', r.id, 'status', r.status,
               'reasons', jsonb_build_array(r.reason), 'report_count', 1, 'created_at', r.created_at,
               'hub_id', h.id, 'hub_name', case when h.kind = 'community' then h.display_name end, 'hub_slug', h.slug,
               'quick_survey', h.kind = 'personal', 'hub_suspended', lv.hub_suspended(h.id),
               'campaign_id', c.id, 'campaign_title', c.title, 'join_code', c.join_code, 'blocked', c.blocked_at is not null) as item
        from lv.abuse_reports r left join lv.campaigns c on c.id = r.campaign_id left join lv.hubs h on h.id = c.hub_id
       where v_type in ('survey', 'all') and (v_status = 'all' or r.status = v_status)
      union all
      select max(cr.created_at), jsonb_build_object('type', 'comment', 'id', cm.id,
               'status', coalesce(rv.status, 'open'),
               'reasons', (select jsonb_agg(y.reason order by y.created_at desc) from (select z.reason, z.created_at from lv.comment_reports z
                             where z.comment_id = cm.id order by z.created_at desc limit 5) y),
               'report_count', count(*), 'created_at', max(cr.created_at),
               'hub_id', h.id, 'hub_name', h.display_name, 'hub_slug', h.slug, 'quick_survey', false, 'hub_suspended', lv.hub_suspended(h.id),
               'comment_id', cm.id, 'post_id', cm.post_id, 'excerpt', left(cm.body, 280), 'hidden', cm.hidden_at is not null,
               'author_suspended', lv.account_suspended(cm.author_account_id), 'author_account_id', cm.author_account_id)
        from lv.comment_reports cr join lv.comments cm on cm.id = cr.comment_id join lv.hubs h on h.id = cm.hub_id
        left join lv.comment_report_reviews rv on rv.comment_id = cm.id
       where v_type in ('comment', 'all') and (v_status = 'all' or coalesce(rv.status, 'open') = v_status)
       group by cm.id, rv.status, h.id
       order by 1 desc limit 300) x), '[]'::jsonb));
end;
$$;

create or replace function lv.admin_account_row(p_account uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('account_id', a.id, 'display_name', a.display_name, 'created_at', a.created_at,
           'hubs_owned', (select count(*) from lv.hubs h where h.owner_account_id = a.id and h.kind = 'community'),
           'memberships', (select count(*) from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
                            where m.account_id = a.id and m.status = 'accepted' and h.kind = 'community'),
           'is_staff', lv.is_platform_admin(a.id),
           'suspension', (select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at) from lv.account_suspensions s where s.account_id = a.id))
    from lv.accounts a where a.id = p_account
$$;

drop function if exists lv.api_admin_user_report_decide(uuid, text, text);
drop function if exists lv.api_my_reports();
drop function if exists lv.api_report_hub(text, text, text);
drop function if exists lv.api_report_account(uuid, uuid, uuid, text, text);
drop function if exists lv.report_reason_ok(text);
drop table if exists lv.user_reports;
commit;
