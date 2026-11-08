-- Rollback of 000024: drops the API, webhook and Discord surface, its tables, triggers, map rows, policies,
-- capability and reserved routes. No function owned by another migration was replaced, so nothing is restored.
begin;

drop function if exists lv_api.lv_api_keys_list(uuid);
drop function if exists lv_api.lv_api_key_create(uuid, text, text[]);
drop function if exists lv_api.lv_api_key_revoke(uuid);
drop function if exists lv_api.lv_webhook_list(uuid);
drop function if exists lv_api.lv_webhook_create(uuid, text, text[]);
drop function if exists lv_api.lv_webhook_update(uuid, text[], boolean);
drop function if exists lv_api.lv_webhook_delete(uuid);
drop function if exists lv_api.lv_discord_code_preview(text);
drop function if exists lv_api.lv_discord_link_confirm(text, text, boolean);
drop function if exists lv_api.lv_discord_connect_confirm(text);
drop function if exists lv_api.lv_discord_me();
drop function if exists lv_api.lv_discord_unlink();
drop function if exists lv_api.lv_discord_connections(uuid);
drop function if exists lv_api.lv_discord_connection_update(uuid, boolean, boolean);
drop function if exists lv_api.lv_admin_discord_guilds();
drop function if exists lv_api.lv_admin_discord_guild_disable(text, boolean, text);

drop trigger if exists campaigns_integration_status on lv.campaigns;
drop trigger if exists participation_integration_milestone on lv.participation;
drop trigger if exists discord_links_unlink on lv.discord_links;

drop function if exists lv.api_key_call(text, text, jsonb);
drop function if exists lv.api_results_public(jsonb);
drop function if exists lv.api_op_scope(text);
drop function if exists lv.api_key_revoke(uuid);
drop function if exists lv.api_key_create(uuid, text, text[]);
drop function if exists lv.api_keys_list(uuid);
drop function if exists lv.api_key_json(lv.api_keys);
drop function if exists lv.api_scope_catalog();
drop function if exists lv.webhook_mark(uuid, text, int, int, text);
drop function if exists lv.webhook_claim(int);
drop function if exists lv.webhook_sweep();
drop function if exists lv.webhook_milestones();
drop function if exists lv.integration_on_participation();
drop function if exists lv.integration_on_campaign_status();
drop function if exists lv.webhook_enqueue(uuid, text, text, jsonb);
drop function if exists lv.webhook_campaign_data(uuid);
drop function if exists lv.released_participants(uuid);
drop function if exists lv.webhook_delete_in_hub(uuid, uuid);
drop function if exists lv.webhook_update_in_hub(uuid, uuid, text[], boolean);
drop function if exists lv.webhook_create(uuid, text, text[]);
drop function if exists lv.webhook_list(uuid);
drop function if exists lv.webhook_guard(uuid, boolean);
drop function if exists lv.webhook_json(lv.webhook_endpoints);
drop function if exists lv.api_admin_discord_guild_disable(text, boolean, text);
drop function if exists lv.api_admin_discord_guilds();
drop function if exists lv.api_discord_connection_update(uuid, boolean, boolean);
drop function if exists lv.api_discord_connections(uuid);
drop function if exists lv.api_discord_unlink();
drop function if exists lv.api_discord_me();
drop function if exists lv.api_discord_connect_confirm(text);
drop function if exists lv.api_discord_link_confirm(text, text, boolean);
drop function if exists lv.api_discord_code_preview(text);
drop function if exists lv.discord_code_row(text);
drop function if exists lv.discord_mark(uuid, text, text);
drop function if exists lv.discord_claim(int);
drop function if exists lv.discord_interaction(text, jsonb);
drop function if exists lv.discord_new_code(text, jsonb, text);
drop function if exists lv.discord_card(uuid);
drop function if exists lv.discord_roles_applied(text, text, text[], text[]);
drop function if exists lv.discord_role_plan(text, text);
drop function if exists lv.discord_fact(uuid, text, uuid);
drop function if exists lv.discord_link_json(lv.discord_links);
drop function if exists lv.discord_on_unlink();

drop table if exists lv.discord_outbox;
drop table if exists lv.discord_role_grants;
drop table if exists lv.discord_role_rules;
drop table if exists lv.discord_connections;
drop table if exists lv.discord_codes;
drop table if exists lv.discord_links;
drop table if exists lv.discord_guilds;
drop table if exists lv.webhook_deliveries;
drop table if exists lv.webhook_outbox;
drop table if exists lv.webhook_endpoints;
drop function if exists lv.webhook_url_problem(text);
drop table if exists lv.api_keys;

drop function if exists lv.random_hex(int);
drop function if exists lv.api_manager(uuid, uuid);
drop function if exists lv.api_enabled(uuid);
drop function if exists lv.integration_restore(text);
drop function if exists lv.integration_act_as(uuid, text);
drop function if exists lv.integration_rate_hit(text, text, int);
drop table if exists lv.integration_rate_windows;
drop function if exists lv.integration_blocked(uuid, uuid);

delete from lv.role_capabilities where capability = 'api.manage';
delete from lv.capabilities where capability = 'api.manage';
delete from lv.reserved_slugs where reason = 'ui route (000024)';
delete from lv.policy where key in ('discord.user_commands_per_minute', 'discord.guild_commands_per_minute', 'discord.code_minutes',
                                    'discord.consent_version', 'webhook.max_attempts');
delete from lv.plan_limits where key in ('api.enabled', 'api.rate_per_minute', 'api.max_keys', 'webhooks.max_endpoints');

commit;
