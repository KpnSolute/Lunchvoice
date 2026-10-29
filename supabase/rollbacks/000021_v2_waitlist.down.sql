-- Rollback for 000021_v2_waitlist.
drop function if exists lv_api.lv_waitlist_join(text, text);
drop function if exists lv_api.lv_waitlist_status();
drop function if exists lv.remove_waitlist_entry(text);
drop function if exists lv.purge_expired_waitlist();
drop function if exists lv.api_waitlist_join(text, text);
drop function if exists lv.api_waitlist_status();
drop function if exists lv.waitlist_policy_missing();
drop function if exists lv.waitlist_origin(text);
drop table if exists lv.waitlist_attempts;
drop table if exists lv.waitlist;
drop table if exists lv.secrets;
delete from lv.policy where key like 'waitlist.%';
