-- 000026: reserve the public platform page names that had no reservation, so no customer Hub can claim a name that a
-- platform page already answers (the page would shadow the Hub). No customer name is reserved.
begin;
insert into lv.reserved_slugs (slug, reason) values
  ('guidelines', 'platform route'),
  ('terms', 'platform route'),
  ('privacy', 'platform route'),
  ('about', 'platform route'),
  ('status', 'platform route'),
  ('how-it-works', 'platform route'),
  ('use-cases', 'platform route'),
  ('whitelist', 'platform route')
on conflict do nothing;
commit;
