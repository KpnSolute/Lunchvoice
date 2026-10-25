-- Rollback for 000003_v2_campaigns.
drop trigger if exists campaign_questions_frozen on lv.campaign_questions;
drop trigger if exists campaigns_set_join_code on lv.campaigns;
drop function if exists lv.owner_bootstrap_roles(uuid, uuid);
drop function if exists lv.activate_campaign(uuid);
drop function if exists lv.gate_evaluate(uuid);
drop function if exists lv.assign_join_code();
drop function if exists lv.generate_join_code();
drop function if exists lv.new_join_code();
drop function if exists lv.freeze_questions_after_draft();
drop table if exists lv.campaign_questions;
drop table if exists lv.campaigns;
