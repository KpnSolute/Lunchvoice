-- Rollback of 000058: identities can no longer be linked. Accounts already linked stay linked.
begin;
drop function if exists lv.link_identities(text, text, text, text);
drop function if exists lv.account_is_empty(uuid);
commit;
