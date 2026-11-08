-- Rollback for 000026_v2_reserve_platform_pages. Only removes rows this migration added, and only if still unclaimed.
begin;
delete from lv.reserved_slugs r
 where r.slug in ('guidelines', 'terms', 'privacy', 'about', 'status', 'how-it-works', 'use-cases', 'whitelist')
   and r.reason = 'platform route'
   and not exists (select 1 from lv.hubs h where h.slug = r.slug);
commit;
