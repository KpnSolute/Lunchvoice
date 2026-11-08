// Track D: typed client for the API key, webhook and Discord lv_api functions (000024). Shapes follow
// docs/backend/API_CONTRACT.md, section "LunchVoice API, webhooks and Discord (000024, track D)". Spread into createLvApi.
import type { LvResult } from "./lvApi";

type Call = <T>(fn: string, args?: Record<string, unknown>) => Promise<LvResult<T>>;

export type ApiScope = "campaigns:read" | "campaigns:write" | "invites:write" | "results:read" | "webhooks:manage";
export const API_SCOPE_ORDER: ApiScope[] = ["campaigns:read", "campaigns:write", "invites:write", "results:read", "webhooks:manage"];

export interface ApiKey {
  key_id: string;
  name: string;
  /** `lvk_` + 12 hex: safe to show; the secret is shown once at creation only. */
  prefix: string;
  scopes: ApiScope[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by_name: string | null;
  active: boolean;
}

export interface ApiKeyList {
  /** false while the Hub has no active Team-family plan: keys are kept but answer lv_entitlement_required. */
  enabled: boolean;
  rate_per_minute: number | null;
  max_keys: number | null;
  scopes: { scope: ApiScope; label: string }[];
  keys: ApiKey[];
}

export type WebhookEvent = "campaign.published" | "campaign.closed" | "campaign.responses_milestone";
export const WEBHOOK_EVENTS: WebhookEvent[] = ["campaign.published", "campaign.closed", "campaign.responses_milestone"];

export interface WebhookDeliveryLog { event: WebhookEvent; attempt: number; status_code: number | null; outcome: "delivered" | "retry" | "failed"; duration_ms: number | null; at: string }
export interface WebhookEndpoint {
  endpoint_id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  disabled_reason: string | null;
  created_at: string;
  consecutive_failures: number;
  recent_deliveries: WebhookDeliveryLog[];
}
export interface WebhookList { enabled: boolean; events: WebhookEvent[]; max_endpoints: number | null; endpoints: WebhookEndpoint[] }

export interface DiscordLink { discord_username: string | null; linked_at: string; consent_version: string; role_facts_consent: boolean }
export interface DiscordCodePreview {
  kind: "link" | "connect";
  discord_username: string | null;
  expires_at: string;
  guild_name: string | null;
  hub: { hub_id: string; name: string; slug: string } | null;
  consent_version: string;
  already_linked: boolean;
}
export interface DiscordConnection { connection_id: string; guild_name: string | null; channel_id: string | null; auto_post: boolean; confirmed_at: string; disabled: boolean; role_rules: number }

export function integrationsApi(call: Call) {
  return {
    apiKeysList: (hub: string) => call<ApiKeyList>("lv_api_keys_list", { p_hub: hub }),
    apiKeyCreate: (hub: string, name: string, scopes: ApiScope[]) =>
      call<{ key: ApiKey; secret: string; shown_once: true }>("lv_api_key_create", { p_hub: hub, p_name: name, p_scopes: scopes }),
    apiKeyRevoke: (key: string) => call<{ key: ApiKey }>("lv_api_key_revoke", { p_key: key }),
    webhookList: (hub: string) => call<WebhookList>("lv_webhook_list", { p_hub: hub }),
    webhookCreate: (hub: string, url: string, events: WebhookEvent[]) =>
      call<{ endpoint: WebhookEndpoint; secret: string; shown_once: true }>("lv_webhook_create", { p_hub: hub, p_url: url, p_events: events }),
    webhookUpdate: (endpoint: string, patch: { events?: WebhookEvent[]; enabled?: boolean }) =>
      call<{ endpoint: WebhookEndpoint }>("lv_webhook_update", { p_endpoint: endpoint, p_events: patch.events ?? null, p_enabled: patch.enabled ?? null }),
    webhookDelete: (endpoint: string) => call<object>("lv_webhook_delete", { p_endpoint: endpoint }),
    discordMe: () => call<{ link: DiscordLink | null }>("lv_discord_me"),
    discordUnlink: () => call<{ unlinked: boolean }>("lv_discord_unlink"),
    discordCodePreview: (code: string) => call<DiscordCodePreview>("lv_discord_code_preview", { p_code: code }),
    discordLinkConfirm: (code: string, consentVersion: string, roleFacts: boolean) =>
      call<{ link: DiscordLink }>("lv_discord_link_confirm", { p_code: code, p_consent_version: consentVersion, p_role_facts: roleFacts }),
    discordConnectConfirm: (code: string) => call<{ connection_id: string; hub_id: string }>("lv_discord_connect_confirm", { p_code: code }),
    discordConnections: (hub: string) => call<{ connections: DiscordConnection[] }>("lv_discord_connections", { p_hub: hub }),
    discordConnectionUpdate: (connection: string, patch: { auto_post?: boolean; remove?: boolean }) =>
      call<{ removed: boolean }>("lv_discord_connection_update", { p_connection: connection, p_auto_post: patch.auto_post ?? null, p_remove: patch.remove ?? false }),
  };
}

/** Human labels for scopes, used by the API tab and /developers. */
export const SCOPE_LABELS: Record<ApiScope, string> = {
  "campaigns:read": "Read Campaigns and their questions",
  "campaigns:write": "Create drafts, add questions, schedule, publish and close",
  "invites:write": "Create Hub and Campaign invites",
  "results:read": "Read released aggregate results",
  "webhooks:manage": "Manage webhook endpoints",
};

/** Masked display of a key from its prefix (the secret part is never stored in the browser). */
export function maskedKey(prefix: string): string {
  return `${prefix}_${"•".repeat(8)}`;
}

/** Client-side mirror of lv.webhook_url_problem, for instant feedback only; the backend decides. */
export function webhookUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "Enter a full URL starting with https://";
  }
  if (u.protocol !== "https:") return "Webhook URLs must use https://";
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^[0-9.]+$/.test(host) || host.startsWith("[") || /(^|\.)(localhost|local|internal|localdomain|lan|home|arpa|test|invalid|example)$/.test(host)) {
    return "Use a public host name, not an IP address or an internal name.";
  }
  return null;
}
