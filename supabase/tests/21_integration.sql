-- 21: CROSS-TRACK INTEGRATION (000021). A fulfilled shop order queues exactly one E08 email; nothing else does.
select set_config('t.file', '21_integration', false);
begin;
select t.as_pg();

insert into lv.accounts (id, display_name) values ('21000000-0000-0000-0000-000000000001', 'Shopper'),
                                                 ('21000000-0000-0000-0000-000000000002', 'No Email');
insert into lv.account_identities (account_id, identity_issuer, identity_subject, email, email_verified_at)
values ('21000000-0000-0000-0000-000000000001', 'https://issuer.example.invalid', '21000000-aaaa-0000-0000-000000000001',
        'shopper@example.invalid', now()),
       ('21000000-0000-0000-0000-000000000002', 'https://issuer.example.invalid', '21000000-aaaa-0000-0000-000000000002',
        'unverified@example.invalid', null);
insert into lv.hubs (id, slug, display_name, owner_account_id)
values ('21000000-0000-0000-0000-0000000000b1', 'harbor-book-circle', 'Harbor Book Circle', '21000000-0000-0000-0000-000000000001');
insert into lv.shop_items (id, hub_id, name, price_points)
values ('21000000-0000-0000-0000-0000000000c1', '21000000-0000-0000-0000-0000000000b1', 'Club tote', 40);
insert into lv.shop_orders (id, hub_id, item_id, account_id, item_name, points, status)
values ('21000000-0000-0000-0000-0000000000d1', '21000000-0000-0000-0000-0000000000b1', '21000000-0000-0000-0000-0000000000c1',
        '21000000-0000-0000-0000-000000000001', 'Club tote', 40, 'placed'),
       ('21000000-0000-0000-0000-0000000000d2', '21000000-0000-0000-0000-0000000000b1', '21000000-0000-0000-0000-0000000000c1',
        '21000000-0000-0000-0000-000000000002', 'Club tote', 40, 'fulfilled');

select lv.community_order_notify('21000000-0000-0000-0000-0000000000d1', 'placed');
select t.check('integration: a placed order sends no email',
  t.q($$select count(*)::text from lv.email_outbox where template = 'shop_order'$$) = '0');

update lv.shop_orders set status = 'fulfilled' where id = '21000000-0000-0000-0000-0000000000d1';
select lv.community_order_notify('21000000-0000-0000-0000-0000000000d1', 'fulfilled');
select t.check('integration: a fulfilled order queues one shop_order email to the verified address',
  t.q($$select count(*)::text from lv.email_outbox where template = 'shop_order'
          and to_address = 'shopper@example.invalid' and status = 'queued'$$) = '1');
select t.check('integration: the payload holds the Hub, item and slug only (no points or balance)',
  t.q($$select (payload ?& array['hub_name','item','slug'] and not (payload ? 'points') and not (payload ? 'balance'))::text
          from lv.email_outbox where template = 'shop_order'$$) = 'true');

select lv.community_order_notify('21000000-0000-0000-0000-0000000000d1', 'fulfilled');
select t.check('integration: a repeated fulfilled event sends no second email',
  t.q($$select count(*)::text from lv.email_outbox where template = 'shop_order'$$) = '1');

select lv.community_order_notify('21000000-0000-0000-0000-0000000000d2', 'fulfilled');
select t.check('integration: no verified address means no email, and no error',
  t.q($$select count(*)::text from lv.email_outbox where template = 'shop_order'$$) = '1');

update lv.shop_orders set status = 'cancelled' where id = '21000000-0000-0000-0000-0000000000d1';
select lv.community_order_notify('21000000-0000-0000-0000-0000000000d1', 'cancelled');
select t.check('integration: a cancelled order sends nothing more',
  t.q($$select count(*)::text from lv.email_outbox where template = 'shop_order'$$) = '1');

select t.check('integration: the hook is not callable by API roles',
  not has_function_privilege('anon', 'lv.community_order_notify(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'lv.community_order_notify(uuid, text)', 'execute'));

rollback;
