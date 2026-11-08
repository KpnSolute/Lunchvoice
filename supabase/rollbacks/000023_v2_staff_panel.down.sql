-- Rollback for 000023_v2_staff_panel. Drops the staff panel functions, the suspension guards and tables, and
-- restores the wrappers and functions it replaced (lv_hub_get 000015, lv_my_context 000008, lv_guest_campaign_get
-- 000018, lv.api_discover_list 000020, lv.api_admin_overview 000019). Staff granted through the panel stay granted.
begin;

drop function if exists lv_api.lv_admin_staff_list();
drop function if exists lv_api.lv_admin_staff_add(text);
drop function if exists lv_api.lv_admin_staff_revoke(uuid);
drop function if exists lv_api.lv_admin_hub_suspend(uuid, text);
drop function if exists lv_api.lv_admin_hub_unsuspend(uuid);
drop function if exists lv_api.lv_admin_account_suspend(uuid, text);
drop function if exists lv_api.lv_admin_account_unsuspend(uuid);
drop function if exists lv_api.lv_admin_reports(text, text);
drop function if exists lv_api.lv_admin_comment_hide(uuid, boolean);
drop function if exists lv_api.lv_admin_comment_reports_dismiss(uuid);
drop function if exists lv_api.lv_admin_hub_search(text);
drop function if exists lv_api.lv_admin_account_search(text);
drop function if exists lv_api.lv_admin_account_email_reveal(uuid);
drop function if exists lv_api.lv_admin_audit(text, text, uuid, int, bigint);

drop function if exists lv.api_admin_staff_list();
drop function if exists lv.api_admin_staff_add(text);
drop function if exists lv.api_admin_staff_revoke(uuid);
drop function if exists lv.api_admin_hub_suspend(uuid, text, boolean);
drop function if exists lv.api_admin_account_suspend(uuid, text, boolean);
drop function if exists lv.api_admin_reports(text, text);
drop function if exists lv.api_admin_comment_hide(uuid, boolean);
drop function if exists lv.api_admin_comment_reports_dismiss(uuid);
drop function if exists lv.api_admin_hub_search(text);
drop function if exists lv.admin_hub_row(uuid);
drop function if exists lv.api_admin_account_search(text);
drop function if exists lv.admin_account_row(uuid);
drop function if exists lv.api_admin_account_email_reveal(uuid);
drop function if exists lv.api_admin_audit(text, text, uuid, int, bigint);
drop function if exists lv.staff_action(text);

drop trigger if exists hubs_suspension_guard on lv.hubs;
drop trigger if exists campaigns_suspension_guard on lv.campaigns;
drop trigger if exists campaign_questions_suspension_guard on lv.campaign_questions;
drop trigger if exists campaign_invites_suspension_guard on lv.campaign_invites;
drop trigger if exists hub_invites_suspension_guard on lv.hub_invites;
drop trigger if exists hub_pages_suspension_guard on lv.hub_pages;
drop trigger if exists roles_suspension_guard on lv.roles;
drop trigger if exists hub_memberships_suspension_guard on lv.hub_memberships;
drop trigger if exists hub_community_suspension_guard on lv.hub_community;
drop trigger if exists news_posts_suspension_guard on lv.news_posts;
drop trigger if exists comments_suspension_guard on lv.comments;
drop trigger if exists shop_items_suspension_guard on lv.shop_items;
drop trigger if exists shop_orders_suspension_guard on lv.shop_orders;
drop trigger if exists checkout_intents_suspension_guard on lv.checkout_intents;
drop trigger if exists discover_applications_suspension_guard on lv.discover_applications;
drop trigger if exists participation_suspension_guard on lv.participation;
drop trigger if exists guest_participation_suspension_guard on lv.guest_participation;
drop function if exists lv.suspension_guard();

create or replace function lv_api.lv_hub_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_get(p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_my_context(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create or replace function lv_api.lv_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  v_out := lv.api_guest_campaign_get(p_join_code);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

create or replace function lv.api_discover_list(p_query text, p_category text, p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_q is not null and length(v_q) > 80 then return lv.err('lv_invalid_input', 'Search is at most 80 characters.'); end if;
  if p_category is not null and p_category <> '' and not exists (
       select 1 from jsonb_array_elements(lv.discover_categories()) c where c->>'key' = p_category) then
    return lv.err('lv_invalid_input', 'Unknown category.');
  end if;
  return jsonb_build_object('ok', true, 'categories', lv.discover_categories(),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('slug', x.slug, 'name', x.display_name, 'about', x.about, 'accent', x.accent,
                                          'category', x.discover_category, 'membership_mode', x.membership_mode,
                                          'members_rounded', (x.genuine / 100) * 100)
                       order by x.genuine desc, lower(x.display_name))
        from (select h.slug, h.display_name, left(h.about, 280) as about, h.accent, hc.discover_category, h.membership_mode,
                     lv.genuine_active_members(h.id) as genuine
                from lv.hubs h
                join lv.discover_applications d on d.hub_id = h.id and d.status = 'approved'
                left join lv.hub_community hc on hc.hub_id = h.id
               where h.kind = 'community' and h.visibility = 'public' and lv.hub_family(h.id) = 'team'
                 and (p_category is null or p_category = '' or hc.discover_category = p_category)
                 and (v_q is null or h.display_name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or h.slug ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or coalesce(h.about, '') ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
               order by lv.genuine_active_members(h.id) desc, lower(h.display_name)
               limit v_limit offset v_offset) x), '[]'::jsonb));
end;
$$;

create or replace function lv.api_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
begin
  if v_denied is not null then return v_denied; end if;
  return jsonb_build_object('ok', true,
    'waitlist', jsonb_build_object(
      'seats_total', lv.waitlist_seats(),
      'seats_taken', least((select c.admitted_issued from lv.waitlist_counters c where c.id), lv.waitlist_seats()),
      'admitted', (select count(*) from lv.waitlist_entries w where w.status = 'admitted'),
      'waitlisted', (select count(*) from lv.waitlist_entries w where w.status = 'waitlisted'),
      'with_contact', (select count(*) from lv.waitlist_entries w where w.contact_email is not null)),
    'reports_open', (select count(*) from lv.abuse_reports r where r.status = 'open'),
    'campaigns_blocked', (select count(*) from lv.campaigns c where c.blocked_at is not null),
    'discover_pending', (select count(*) from lv.discover_applications d where d.status = 'submitted'),
    'billing', jsonb_build_object(
      'provider_ready', coalesce((lv.policy_json('billing.provider_ready'))::boolean, false),
      'events_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days'),
      'rejected_7d', (select count(*) from lv.billing_events b where b.received_at > now() - interval '7 days' and b.outcome = 'rejected')),
    'email', (select jsonb_build_object(
      'queued', count(*) filter (where o.status in ('queued', 'sending')),
      'sent', count(*) filter (where o.status = 'sent'),
      'failed', count(*) filter (where o.status = 'failed')) from lv.email_outbox o));
end;
$$;

drop function if exists lv.hub_suspension_json(uuid);
drop function if exists lv.assert_not_suspended(uuid, uuid);
drop function if exists lv.hub_suspended(uuid);
drop function if exists lv.account_suspended(uuid);
drop table if exists lv.comment_report_reviews;
drop table if exists lv.account_suspensions;
drop table if exists lv.hub_suspensions;

revoke all on all functions in schema lv from public;

commit;
