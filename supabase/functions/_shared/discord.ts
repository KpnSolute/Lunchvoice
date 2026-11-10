// The official LunchVoice Discord bot: request verification, interaction parsing, replies and Campaign cards for the
// `discord` Edge Function (docs/v2/API_AND_DISCORD_PLAN.md section 2, privacy decision D-01).
//
// Pure and dependency-free (WebCrypto Ed25519), so it runs in Deno and in Node tests. The database decides every
// outcome (lv.discord_interaction); this file only proves the request came from Discord and turns results into
// Discord messages. D-01 is enforced in the database too: an anonymous Campaign card never carries answer buttons, and
// an answer click for an anonymous Campaign is refused server-side.

export const DISCORD_API = "https://discord.com/api/v10";

/** The bot's public profile (service-only /discord/profile). The images are fetched from our own site, never a caller's URL. */
export const BOT_PROFILE = {
  description:
    "LunchVoice: anonymous surveys and polls for any community. Link your account with /lunchvoice link, post a survey with /lunchvoice post, and give members roles from LunchVoice facts with /lunchvoice setup. Anonymous means anonymous: totals only, never who answered. lunchvoice.com",
  termsUrl: "/terms",
  privacyUrl: "/privacy",
  iconPath: "/brand/discord-icon.png",
  bannerPath: "/brand/discord-banner.png",
} as const;

/** A PNG's bytes as a Discord data URI (the form its image fields take). */
export function pngDataUri(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}
export const EPHEMERAL = 1 << 6;
export const ADMINISTRATOR = 1n << 3n;
export const MANAGE_GUILD = 1n << 5n;
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

/* ------------------------------------------------------------------ signature */

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Verify Discord's Ed25519 signature over `timestamp + rawBody` (headers X-Signature-Ed25519, X-Signature-Timestamp).
 * Fails closed: an unset key, malformed input or a stale timestamp is a rejection.
 */
export async function verifyDiscordRequest(
  publicKeyHex: string | undefined,
  signatureHex: string | null | undefined,
  timestamp: string | null | undefined,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!publicKeyHex || !signatureHex || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  const key = hexToBytes(publicKeyHex);
  const sig = hexToBytes(signatureHex);
  if (!key || key.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, k, sig as BufferSource, new TextEncoder().encode(timestamp + rawBody));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ interactions */

export type Command = "link" | "unlink" | "verify" | "connect" | "post" | "setup" | "answer";

export interface ParsedInteraction {
  kind: "ping" | "command" | "unknown";
  command?: Command;
  ctx?: {
    guild_id: string | null;
    channel_id: string | null;
    user_id: string;
    username: string | null;
    is_admin: boolean;
    options: Record<string, unknown>;
  };
}

/** True when the member's permission bitfield (a decimal string) has Administrator or Manage Server. */
export function isServerAdmin(permissions: unknown): boolean {
  if (typeof permissions !== "string" || !/^\d{1,30}$/.test(permissions)) return false;
  const p = BigInt(permissions);
  return (p & ADMINISTRATOR) !== 0n || (p & MANAGE_GUILD) !== 0n;
}

const SUBCOMMANDS = new Set<Command>(["link", "unlink", "verify", "connect", "post", "setup"]);
const ANSWER_ID = /^lv:answer:([0-9a-f-]{36}):([0-9])$/;

export function answerCustomId(campaignId: string, option: number): string {
  return `lv:answer:${campaignId}:${option}`;
}

export function parseInteraction(body: unknown): ParsedInteraction {
  const i = body as Record<string, any> | null;
  if (!i || typeof i !== "object") return { kind: "unknown" };
  if (i.type === 1) return { kind: "ping" };
  const user = i.member?.user ?? i.user;
  if (!user || typeof user.id !== "string") return { kind: "unknown" };
  const base = {
    guild_id: typeof i.guild_id === "string" ? i.guild_id : null,
    channel_id: typeof i.channel_id === "string" ? i.channel_id : null,
    user_id: user.id,
    username: typeof user.username === "string" ? user.username.slice(0, 64) : null,
    is_admin: isServerAdmin(i.member?.permissions),
  };
  if (i.type === 2 && i.data?.name === "lunchvoice") {
    const sub = Array.isArray(i.data.options) ? i.data.options[0] : null;
    if (!sub || !SUBCOMMANDS.has(sub.name)) return { kind: "unknown" };
    const options: Record<string, unknown> = {};
    for (const o of Array.isArray(sub.options) ? sub.options : []) {
      if (o && typeof o.name === "string") options[o.name === "rule" ? "fact" : o.name] = o.value;
    }
    return { kind: "command", command: sub.name as Command, ctx: { ...base, options } };
  }
  if (i.type === 3 && typeof i.data?.custom_id === "string") {
    const m = ANSWER_ID.exec(i.data.custom_id);
    if (!m) return { kind: "unknown" };
    return { kind: "command", command: "answer", ctx: { ...base, options: { campaign_id: m[1], option: Number(m[2]) } } };
  }
  return { kind: "unknown" };
}

/* ------------------------------------------------------------------ replies */

export interface Card {
  campaign_id: string;
  title: string;
  description?: string | null;
  anonymity: "anonymous" | "identified";
  join_code: string | null;
  closes_at?: string | null;
  prompt?: string | null;
  answer_in_discord: boolean;
  options: string[] | null;
}

/** A Campaign card. D-01: answer buttons only when the database says answer_in_discord (identified polls). */
export function buildCard(card: Card, appUrl: string): Record<string, unknown> {
  const playerUrl = `${appUrl.replace(/\/+$/, "")}/c/${encodeURIComponent(card.join_code ?? "")}`;
  const inDiscord = card.answer_in_discord && card.anonymity === "identified" && Array.isArray(card.options) && card.options.length > 0;
  const note = inDiscord
    ? "Identified poll: your answer is recorded with your linked LunchVoice account."
    : card.anonymity === "anonymous"
      ? "Anonymous: answer in LunchVoice. Discord never sees your answer."
      : "Answer in LunchVoice.";
  const components: unknown[] = [];
  if (inDiscord) {
    components.push({
      type: 1,
      components: card.options!.slice(0, 5).map((label, idx) => ({
        type: 2, style: 1, custom_id: answerCustomId(card.campaign_id, idx), label: String(label).slice(0, 80),
      })),
    });
  }
  components.push({ type: 1, components: [{ type: 2, style: 5, url: playerUrl, label: inDiscord ? "Open in LunchVoice" : "Answer in LunchVoice" }] });
  return {
    embeds: [{
      title: card.title.slice(0, 256),
      description: [card.prompt ?? card.description ?? "", note].filter(Boolean).join("\n\n").slice(0, 4000),
      footer: { text: "LunchVoice" },
    }],
    components,
    allowed_mentions: { parse: [] },
  };
}

export function ephemeral(content: string): Record<string, unknown> {
  return { type: 4, data: { content: content.slice(0, 2000), flags: EPHEMERAL, allowed_mentions: { parse: [] } } };
}

interface DbResult { ok: boolean; error?: { code: string; message: string }; [k: string]: unknown }

/** Interaction response for a command result. Role changes are applied by the caller before replying. */
export function replyFor(command: Command, r: DbResult, appUrl: string, roleSummary?: { added: number; removed: number }): Record<string, unknown> {
  const base = appUrl.replace(/\/+$/, "");
  if (!r.ok) return ephemeral(r.error?.message ?? "Something went wrong.");
  switch (command) {
    case "link":
      return ephemeral(`Open this link within 10 minutes, sign in to LunchVoice and confirm: ${base}/connect/discord?c=${r.code}\nThe link works once. Do not share it.`);
    case "connect":
      return ephemeral(`A manager of that Hub opens this link within 10 minutes, signs in and confirms: ${base}/connect/discord?c=${r.code}`);
    case "unlink":
      return ephemeral(r.unlinked ? "Your Discord account is no longer linked to LunchVoice. Roles LunchVoice gave you are being removed." : "Your Discord account was not linked.");
    case "verify":
      if (!r.consented) return ephemeral("Linked. You have not allowed servers to use LunchVoice facts for roles; you can change that by linking again.");
      return ephemeral(`Checked. Roles added: ${roleSummary?.added ?? 0}, removed: ${roleSummary?.removed ?? 0}.`);
    case "setup":
      return ephemeral(r.removed ? "Role rule removed." : "Role rule saved. Members get it when they link or run /lunchvoice verify.");
    case "post":
      return { type: 4, data: buildCard(r.card as Card, appUrl) };
    case "answer":
      return ephemeral(r.duplicate ? "You already answered this poll." : "Thanks, your answer is recorded.");
  }
}

/* ------------------------------------------------------------------ roles via Discord REST */

export interface RolePlan { add: string[]; remove: string[] }

const SNOWFLAKE = /^[0-9]{5,25}$/;

/** Apply a role plan; returns the roles actually added and removed (2xx or 404 for removals). */
export async function applyRolePlan(fetcher: typeof fetch, botToken: string, guildId: string, userId: string, plan: RolePlan) {
  const added: string[] = [];
  const removed: string[] = [];
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) return { added, removed };
  const call = (method: string, role: string) =>
    fetcher(`${DISCORD_API}/guilds/${guildId}/members/${userId}/roles/${role}`, {
      method, headers: { authorization: `Bot ${botToken}`, "x-audit-log-reason": "LunchVoice role rule" },
    }).then((r) => r.status).catch(() => 0);
  for (const role of plan.add.filter((x) => SNOWFLAKE.test(x))) if (((await call("PUT", role)) / 100 | 0) === 2) added.push(role);
  for (const role of plan.remove.filter((x) => SNOWFLAKE.test(x))) {
    const s = await call("DELETE", role);
    if ((s / 100 | 0) === 2 || s === 404) removed.push(role);
  }
  return { added, removed };
}

/* ------------------------------------------------------------------ command registration */

export const COMMAND_DEFINITIONS = [
  {
    name: "lunchvoice",
    description: "LunchVoice: link your account, post Campaigns and manage role rules",
    dm_permission: false,
    options: [
      { type: 1, name: "link", description: "Link your Discord account to your LunchVoice account" },
      { type: 1, name: "unlink", description: "Remove the link between Discord and LunchVoice" },
      { type: 1, name: "verify", description: "Check your LunchVoice role rules in this server" },
      { type: 1, name: "connect", description: "Server admins: connect this server to a LunchVoice Hub",
        options: [{ type: 3, name: "hub", description: "The Hub address, for example northside-running", required: true, max_length: 40 }] },
      { type: 1, name: "post", description: "Post a published Campaign from a connected Hub",
        options: [{ type: 3, name: "campaign", description: "The Campaign's 6-character join code", required: true, max_length: 12 }] },
      { type: 1, name: "setup", description: "Server admins: give a role based on a LunchVoice fact",
        options: [
          { type: 3, name: "rule", description: "Which fact", required: true, choices: [
            { name: "Waitlist Founding member", value: "waitlist_founding" },
            { name: "Member of a Hub you manage", value: "hub_member" },
            { name: "Has a Team Hub", value: "team_hub" },
          ] },
          { type: 8, name: "role", description: "The role to give", required: true },
          { type: 3, name: "hub", description: "For the member rule: the Hub address", required: false, max_length: 40 },
          { type: 5, name: "remove", description: "Remove this rule instead", required: false },
        ] },
    ],
  },
] as const;
