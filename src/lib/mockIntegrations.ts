// DEV-ONLY (track D): the mock for the API key, webhook and Discord lv_api functions (000024). Imported only by
// mockTransport.ts, so it never reaches a production bundle. It follows supabase/migrations/000024_v2_api_discord.sql
// closely enough to click through; the backend stays authoritative.
//
// Discord codes in the mock: any 20-character hex code is a link code, one starting with "C" is a connect code for
// your first owned Hub, and "EXPIRED…" behaves like a used or expired code.

type Fam = "free" | "starter" | "team";
type Member = { account_id: string; is_owner: boolean; status: string };
type Hub = { hub_id: string; slug: string | null; name: string; kind: string; members: Member[] };

type Key = { key_id: string; hub: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
type Endpoint = { endpoint_id: string; hub: string; url: string; events: string[]; enabled: boolean; created_at: string };
type Link = { discord_username: string; linked_at: string; consent_version: string; role_facts_consent: boolean };
type Conn = { connection_id: string; hub: string; guild_name: string; channel_id: string; auto_post: boolean; confirmed_at: string };

export type IntegrationsState = { keys: Key[]; endpoints: Endpoint[]; link: Link | null; connections: Conn[]; used_codes: string[] };

export interface IntegrationsCtx {
  s: { n: number; hubs: Hub[]; integrations?: IntegrationsState };
  family: (hub: string) => Fam;
}

const ME = "mock-account";
const CONSENT = "2026-11-08";
const SCOPES = ["campaigns:read", "campaigns:write", "invites:write", "results:read", "webhooks:manage"];
const EVENTS = ["campaign.published", "campaign.closed", "campaign.responses_milestone"];

export const INTEGRATION_FNS = new Set([
  "lv_api_keys_list", "lv_api_key_create", "lv_api_key_revoke", "lv_webhook_list", "lv_webhook_create", "lv_webhook_update",
  "lv_webhook_delete", "lv_discord_me", "lv_discord_unlink", "lv_discord_code_preview", "lv_discord_link_confirm",
  "lv_discord_connect_confirm", "lv_discord_connections", "lv_discord_connection_update",
]);

const err = (code: string, message: string, extra: object = {}) => ({ ok: false, error: { code, message, ...extra } });
const now = () => new Date().toISOString();
const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

function st(ctx: IntegrationsCtx): IntegrationsState {
  ctx.s.integrations ??= { keys: [], endpoints: [], link: null, connections: [], used_codes: [] };
  return ctx.s.integrations;
}

export function integrationsHandle(ctx: IntegrationsCtx, fn: string, a: Record<string, unknown>): unknown {
  const s = st(ctx);
  const hub = (id: unknown) => ctx.s.hubs.find((h) => h.hub_id === id && h.kind === "community");
  const manager = (h: Hub | undefined) => Boolean(h?.members.some((m) => m.account_id === ME && m.is_owner && m.status === "accepted"));
  const keyOut = (k: Key) => ({ key_id: k.key_id, name: k.name, prefix: k.prefix, scopes: k.scopes, created_at: k.created_at,
    last_used_at: k.last_used_at, revoked_at: k.revoked_at, created_by_name: "You", active: !k.revoked_at });
  const epOut = (e: Endpoint) => ({ endpoint_id: e.endpoint_id, url: e.url, events: e.events, enabled: e.enabled, disabled_reason: e.enabled ? null : "Turned off by a manager.",
    created_at: e.created_at, consecutive_failures: 0, recent_deliveries: [] });
  const team = (h: string) => ctx.family(h) === "team";
  const guard = (h: Hub | undefined) => (!h ? err("lv_not_found", "No such Hub.") : !manager(h) ? err("lv_forbidden", "Managing the API requires api.manage.") : null);

  switch (fn) {
    case "lv_api_keys_list": {
      const h = hub(a.p_hub); const g = guard(h); if (g) return g;
      return { ok: true, enabled: team(h!.hub_id), rate_per_minute: team(h!.hub_id) ? 60 : null, max_keys: team(h!.hub_id) ? 10 : null,
        scopes: SCOPES.map((scope) => ({ scope, label: scope })), keys: s.keys.filter((k) => k.hub === h!.hub_id).map(keyOut) };
    }
    case "lv_api_key_create": {
      const h = hub(a.p_hub); const g = guard(h); if (g) return g;
      if (!team(h!.hub_id)) return err("lv_entitlement_required", "The LunchVoice API is part of the Team plan.", { product: "team_hub" });
      const name = String(a.p_name ?? "").trim();
      const scopes = [...new Set((a.p_scopes as string[] | null) ?? [])].sort();
      if (!name || name.length > 60) return err("lv_invalid_input", "Give the key a name of up to 60 characters.");
      if (!scopes.length || scopes.some((x) => !SCOPES.includes(x))) return err("lv_invalid_input", "Choose one or more known scopes.");
      if (s.keys.filter((k) => k.hub === h!.hub_id && !k.revoked_at).length >= 10) return err("lv_limit_reached", "This Hub has reached its active API key limit.", { limit: 10, used: 10 });
      const prefix = `lvk_${hex(12)}`;
      const k: Key = { key_id: `key-${++ctx.s.n}`, hub: h!.hub_id, name, prefix, scopes, created_at: now(), last_used_at: null, revoked_at: null };
      s.keys.push(k);
      return { ok: true, key: keyOut(k), secret: `${prefix}_${hex(48)}`, shown_once: true };
    }
    case "lv_api_key_revoke": {
      const k = s.keys.find((x) => x.key_id === a.p_key);
      if (!k || !manager(hub(k.hub))) return err("lv_not_found", "No such key.");
      k.revoked_at ??= now();
      return { ok: true, key: keyOut(k) };
    }
    case "lv_webhook_list": {
      const h = hub(a.p_hub); const g = guard(h); if (g) return g;
      return { ok: true, enabled: team(h!.hub_id), events: EVENTS, max_endpoints: team(h!.hub_id) ? 5 : null,
        endpoints: s.endpoints.filter((e) => e.hub === h!.hub_id).map(epOut) };
    }
    case "lv_webhook_create": {
      const h = hub(a.p_hub); const g = guard(h); if (g) return g;
      if (!team(h!.hub_id)) return err("lv_entitlement_required", "Webhooks are part of the Team plan.", { product: "team_hub" });
      const url = String(a.p_url ?? "").trim();
      if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url) || /localhost|\.internal|\.local\b/.test(url)) return err("lv_invalid_input", "Use an https URL with a public host name.");
      const events = ((a.p_events as string[] | null) ?? EVENTS).filter((x) => EVENTS.includes(x));
      if (!events.length) return err("lv_invalid_input", "Choose one or more known events.");
      if (s.endpoints.filter((e) => e.hub === h!.hub_id).length >= 5) return err("lv_limit_reached", "This Hub has reached its webhook endpoint limit.", { limit: 5, used: 5 });
      const e: Endpoint = { endpoint_id: `wh-${++ctx.s.n}`, hub: h!.hub_id, url, events, enabled: true, created_at: now() };
      s.endpoints.push(e);
      return { ok: true, endpoint: epOut(e), secret: `lvwh_${hex(48)}`, shown_once: true };
    }
    case "lv_webhook_update": {
      const e = s.endpoints.find((x) => x.endpoint_id === a.p_endpoint);
      if (!e || !manager(hub(e.hub))) return err("lv_not_found", "No such webhook endpoint.");
      if (Array.isArray(a.p_events)) e.events = (a.p_events as string[]).filter((x) => EVENTS.includes(x));
      if (typeof a.p_enabled === "boolean") e.enabled = a.p_enabled;
      return { ok: true, endpoint: epOut(e) };
    }
    case "lv_webhook_delete": {
      const e = s.endpoints.find((x) => x.endpoint_id === a.p_endpoint);
      if (!e || !manager(hub(e.hub))) return err("lv_not_found", "No such webhook endpoint.");
      s.endpoints = s.endpoints.filter((x) => x !== e);
      return { ok: true };
    }
    case "lv_discord_me":
      return { ok: true, link: s.link };
    case "lv_discord_unlink": {
      const was = Boolean(s.link);
      s.link = null;
      return { ok: true, unlinked: was };
    }
    case "lv_discord_code_preview": {
      const code = String(a.p_code ?? "").toUpperCase();
      if (!/^[0-9A-F]{20}$/.test(code) || s.used_codes.includes(code)) return err("lv_invalid_code", "This link has expired or was already used. Run the command in Discord again.");
      const owned = ctx.s.hubs.find((h) => h.kind === "community" && manager(h));
      if (code.startsWith("C")) {
        if (!owned) return err("lv_not_found", "Only a manager of that Hub can confirm this connection.");
        return { ok: true, kind: "connect", discord_username: "runner_dana", expires_at: new Date(Date.now() + 600_000).toISOString(), guild_name: "Northside Discord",
          hub: { hub_id: owned.hub_id, name: owned.name, slug: owned.slug }, consent_version: CONSENT, already_linked: Boolean(s.link) };
      }
      return { ok: true, kind: "link", discord_username: "runner_dana", expires_at: new Date(Date.now() + 600_000).toISOString(), guild_name: "Northside Discord",
        hub: null, consent_version: CONSENT, already_linked: Boolean(s.link) };
    }
    case "lv_discord_link_confirm": {
      const code = String(a.p_code ?? "").toUpperCase();
      if (!/^[0-9A-F]{20}$/.test(code) || code.startsWith("C") || s.used_codes.includes(code)) return err("lv_invalid_code", "This link has expired or was already used. Run /lunchvoice link again.");
      if (a.p_consent_version !== CONSENT) return err("lv_invalid_input", "Please read and accept the current notice.");
      if (s.link) return err("lv_conflict", "Your LunchVoice account is already linked to a Discord account. Unlink it first.");
      s.used_codes.push(code);
      s.link = { discord_username: "runner_dana", linked_at: now(), consent_version: CONSENT, role_facts_consent: Boolean(a.p_role_facts) };
      return { ok: true, link: s.link };
    }
    case "lv_discord_connect_confirm": {
      const code = String(a.p_code ?? "").toUpperCase();
      if (!/^C[0-9A-F]{19}$/.test(code) || s.used_codes.includes(code)) return err("lv_invalid_code", "This link has expired or was already used. Run /lunchvoice connect again.");
      const owned = ctx.s.hubs.find((h) => h.kind === "community" && manager(h));
      if (!owned) return err("lv_not_found", "Only a manager of that Hub can confirm this connection.");
      s.used_codes.push(code);
      const c: Conn = { connection_id: `dc-${++ctx.s.n}`, hub: owned.hub_id, guild_name: "Northside Discord", channel_id: "910000000000000001", auto_post: false, confirmed_at: now() };
      s.connections.push(c);
      return { ok: true, connection_id: c.connection_id, hub_id: owned.hub_id };
    }
    case "lv_discord_connections": {
      const h = hub(a.p_hub); if (!h) return err("lv_not_found", "No such Hub.");
      if (!manager(h)) return err("lv_forbidden", "Managing Discord requires hub.settings.manage.");
      return { ok: true, connections: s.connections.filter((c) => c.hub === h.hub_id).map((c) => ({ ...c, disabled: false, role_rules: 0 })) };
    }
    case "lv_discord_connection_update": {
      const c = s.connections.find((x) => x.connection_id === a.p_connection);
      if (!c || !manager(hub(c.hub))) return err("lv_not_found", "No such connection.");
      if (a.p_remove) { s.connections = s.connections.filter((x) => x !== c); return { ok: true, removed: true }; }
      if (typeof a.p_auto_post === "boolean") c.auto_post = a.p_auto_post;
      return { ok: true, removed: false };
    }
  }
  return undefined;
}
