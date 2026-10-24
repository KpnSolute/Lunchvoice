-- Synthetic legacy population, created BEFORE the v2 migration (as production will be). All identities are fake.
-- Org A is the seeded LionCafe organization (its id must survive); org B is an unrelated tenant.

insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000b2', 'synthetic-two', 'Synthetic Org Two')
  on conflict do nothing;

-- auth users -> handle_new_user creates profiles in the org named by metadata (default LionCafe).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8002-000000000001', 'admin.one@example.invalid', '{"display_name":"Admin One"}'),  -- legacy staff admin
  ('00000000-0000-4000-8002-000000000002', 'owner.pick@example.invalid', '{"display_name":"Chosen Owner"}'),
  ('00000000-0000-4000-8002-000000000003', 'student.three@example.invalid', '{"display_name":"Student Three"}'),
  ('00000000-0000-4000-8002-000000000004', 'shared@example.invalid', '{"display_name":"Student Four"}'),
  ('00000000-0000-4000-8002-000000000005', 'shared@example.invalid', '{"display_name":"Student Five"}'),   -- same email as 4: must NOT merge
  ('00000000-0000-4000-8002-000000000006', 'student.six@example.invalid', '{"display_name":""}'),            -- blank name
  ('00000000-0000-4000-8002-000000000011', 'other.org@example.invalid', '{"display_name":"Other Org User","org_id":"00000000-0000-4000-8001-0000000000b2"}');

update public.profiles set role = 'admin', is_staff = true where id = '00000000-0000-4000-8002-000000000001';
update public.profiles set points = 120 where id = '00000000-0000-4000-8002-000000000003';
update public.profiles set points = 40  where id = '00000000-0000-4000-8002-000000000004';

insert into public.store_items (id, name, token_cost, is_active, org_id)
  select '00000000-0000-4000-8003-000000000001', 'Reward', 100, true, o.id from public.orgs o where o.slug = 'LionCafe';
insert into public.sessions (id, title, join_code, points_reward, is_active, org_id)
  select '00000000-0000-4000-8004-000000000001', 'Winter test', 'ABC123', 50, true, o.id from public.orgs o where o.slug = 'LionCafe';
insert into public.responses (id, session_id, student_id, points_awarded, org_id)
  select '00000000-0000-4000-8005-000000000001', '00000000-0000-4000-8004-000000000001', '00000000-0000-4000-8002-000000000003', 50, o.id from public.orgs o where o.slug = 'LionCafe';
insert into public.orders (id, student_id, store_item_id, item_name, token_cost, org_id)
  select '00000000-0000-4000-8006-000000000001', '00000000-0000-4000-8002-000000000003', '00000000-0000-4000-8003-000000000001', 'Reward', 100, o.id from public.orgs o where o.slug = 'LionCafe';
