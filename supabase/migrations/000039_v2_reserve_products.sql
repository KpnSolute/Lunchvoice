-- 000039: reserve "products", the product pages' route (/products and /products/<name>), so no customer Hub can claim
-- an address the platform page would shadow. No customer name is reserved. 000036 to 000038 are held by the elections
-- branch, so this takes the next free number.
begin;
insert into lv.reserved_slugs (slug, reason) values
  ('products', 'platform route')
on conflict do nothing;
commit;
