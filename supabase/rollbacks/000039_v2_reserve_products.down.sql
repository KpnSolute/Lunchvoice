-- Rollback for 000039_v2_reserve_products. Only removes the row this migration added, and only if still unclaimed.
begin;
delete from lv.reserved_slugs r
 where r.slug = 'products'
   and r.reason = 'platform route'
   and not exists (select 1 from lv.hubs h where h.slug = r.slug);
commit;
