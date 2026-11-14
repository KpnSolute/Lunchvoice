-- 57: expired held usernames are swept, live holds are kept, and a deleted account leaves no link to the person.
select set_config('t.file', '57_handle_history_sweep', false);
begin;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Leaver'); select lv_api.lv_my_context();
select lv_api.lv_handle_set('old_hold');
select t.as_pg();
-- Two history rows: one long expired, one still held.
insert into lv.handle_history (handle, account_id, held_until) values ('expired_one', null, now() - interval '3 days');
insert into lv.handle_history (handle, account_id, held_until) values ('live_hold', null, now() + interval '5 days');
select t.check('the insert of a new row swept the expired one', not exists (select 1 from lv.handle_history where handle = 'expired_one'));
select t.check('a live hold is kept', exists (select 1 from lv.handle_history where handle = 'live_hold'));

-- A deleted account: its name is held with no owner, and nothing else about the person is kept in the history.
delete from lv.accounts where handle = 'old_hold';
select t.check('the deleted account left a held name', exists (select 1 from lv.handle_history where handle = 'old_hold' and held_until > now()));
select t.check('with no link to a person', (select account_id is null from lv.handle_history where handle = 'old_hold'));
select t.check('and the account row is gone', not exists (select 1 from lv.accounts where handle = 'old_hold'));

-- After the hold and the extra day, the next sweep removes it.
update lv.handle_history set held_until = now() - interval '2 days' where handle = 'old_hold';
select t.check('the sweep function reports what it removed', lv.handle_history_sweep() >= 1);
select t.check('after the hold the name is gone from the history', not exists (select 1 from lv.handle_history where handle = 'old_hold'));
select t.as_kpn(2, null, true, 'Someone'); select lv_api.lv_my_context();
select t.check('and the name is free to take', (lv_api.lv_handle_check('old_hold') ->> 'available')::boolean);
select t.as_pg();
rollback;
