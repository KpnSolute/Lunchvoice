-- 39: the product pages' route name (000039) is reserved, so no Hub can sit behind /products.
select set_config('t.file', '39_reserve_products', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('creator', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.check('reserved: products is a reserved platform route', exists (select 1 from lv.reserved_slugs where slug = 'products' and reason = 'platform route'));
select t.grant_credit(t.id('creator'));
select t.as_kpn(1);
select t.check('reserved: products cannot be claimed as a Hub address', t.code(lv_api.lv_hub_create('products', 'Products')) = 'lv_invalid_input');
select t.check('reserved: a similar free name still can', t.code(lv_api.lv_hub_create('products-club', 'Products Club')) = 'ok');
rollback;
