// POST /functions/v1/discord             Discord interactions endpoint (the official LunchVoice bot)
// POST /functions/v1/discord/dispatch    queued Discord work (role removals, auto-posts); service role only
//
// verify_jwt = false: Discord signs its requests with Ed25519 instead of a JWT. The function verifies
// X-Signature-Ed25519 over timestamp + raw body with DISCORD_PUBLIC_KEY (WebCrypto) before parsing anything and fails
// closed (401, or 503 when the key is unset). Every decision is made by lv.discord_interaction (service role):
// link codes, server connections, role facts (only for linked people who consented), D-01 (anonymous Campaigns are
// answered only in the LunchVoice player), rate limits and staff disables. Role changes use DISCORD_BOT_TOKEN.
// Never logs tokens, codes, user ids or message bodies.
import postgres from "postgres";
import { dispatchAuthorized } from "../_shared/email/dispatch.ts";
import { applyRolePlan, buildCard, DISCORD_API, ephemeral, parseInteraction, replyFor, verifyDiscordRequest, type Card, type RolePlan } from "../_shared/discord.ts";

const MAX_BODY_BYTES = 64 * 1024;
let sql: ReturnType<typeof postgres> | null = null;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function db(url: string) {
  sql ??= postgres(url, { max: 2, prepare: false, idle_timeout: 20 });
  return async <T>(run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
    (await sql!.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return await run(tx);
    })) as T;
}

type Run = ReturnType<typeof db>;

async function applyAndRecord(run: Run, guild: string, user: string, plan: RolePlan, token: string | undefined) {
  if (!token) return { added: 0, removed: 0 };
  const done = await applyRolePlan(fetch, token, guild, user, plan);
  await run((tx) => tx`select lv.discord_roles_applied(${guild}, ${user}, ${done.added}::text[], ${done.removed}::text[])`);
  return { added: done.added.length, removed: done.removed.length };
}

async function dispatch(run: Run, token: string | undefined, appUrl: string) {
  if (!token) return { ok: true, claimed: 0, skipped: "no bot token" };
  const rows = await run((tx) => tx`select lv.discord_claim(20) as r`);
  const jobs = ((rows[0]?.r as { jobs?: Record<string, any>[] })?.jobs ?? []);
  let done = 0;
  for (const j of jobs) {
    let result: "done" | "retry" | "failed" = "done";
    try {
      if (j.kind === "role_sync" && j.plan) {
        await applyAndRecord(run, j.guild_id, j.user_id, { add: j.plan.add ?? [], remove: j.plan.remove ?? [] }, token);
      } else if (j.kind === "post" && j.card && j.channel_id) {
        const res = await fetch(`${DISCORD_API}/channels/${j.channel_id}/messages`, {
          method: "POST",
          headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
          body: JSON.stringify(buildCard(j.card as Card, appUrl)),
        });
        result = res.ok ? "done" : res.status === 429 || res.status >= 500 ? "retry" : "failed";
      }
    } catch {
      result = "retry";
    }
    await run((tx) => tx`select lv.discord_mark(${j.id}::uuid, ${result}, ${result === "done" ? null : "discord request failed"})`);
    if (result === "done") done++;
  }
  return { ok: true, claimed: jobs.length, done };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: { code: "lv_method", message: "Use POST." } });
  const env = (n: string) => Deno.env.get(n);
  const dbUrl = env("SUPABASE_DB_URL");
  const token = env("DISCORD_BOT_TOKEN");
  const appUrl = env("LUNCHVOICE_APP_URL") ?? "https://lunchvoice.com";

  if (new URL(req.url).pathname.endsWith("/dispatch")) {
    if (!dispatchAuthorized(req.headers.get("authorization"), env)) return reply(401, { ok: false, error: { code: "lv_unauthenticated", message: "Service role only." } });
    if (!dbUrl) return reply(503, { ok: false, error: { code: "lv_not_configured", message: "The database is not configured." } });
    try {
      return reply(200, await dispatch(db(dbUrl), token, appUrl));
    } catch {
      console.error("discord: dispatch failed");
      return reply(500, { ok: false, error: { code: "lv_server_error", message: "Dispatch failed; queued work is kept." } });
    }
  }

  const publicKey = env("DISCORD_PUBLIC_KEY");
  if (!publicKey || !dbUrl) return reply(503, { ok: false, error: { code: "lv_not_configured", message: "The Discord bot is not configured." } });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: { code: "lv_invalid_input", message: "Too large." } });
  const ok = await verifyDiscordRequest(publicKey, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), raw);
  if (!ok) return reply(401, { ok: false, error: { code: "lv_invalid_signature", message: "Bad request signature." } });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: { code: "lv_invalid_input", message: "Not JSON." } });
  }
  const parsed = parseInteraction(body);
  if (parsed.kind === "ping") return reply(200, { type: 1 });
  if (parsed.kind !== "command" || !parsed.command || !parsed.ctx) return reply(200, ephemeral("That command is not available."));

  try {
    const run = db(dbUrl);
    // Interactions carry no server name. For connect codes the confirming manager must see which server asks, so fetch
    // it with the bot token (best effort; the page says "this Discord server" otherwise).
    let guildName: string | null = null;
    if (token && parsed.ctx.guild_id && (parsed.command === "connect" || parsed.command === "link")) {
      const g = await fetch(`${DISCORD_API}/guilds/${parsed.ctx.guild_id}`, { headers: { authorization: `Bot ${token}` } }).catch(() => null);
      if (g?.ok) guildName = String(((await g.json().catch(() => ({}))) as { name?: unknown }).name ?? "").slice(0, 100) || null;
    }
    const ctx = { ...parsed.ctx, guild_name: guildName };
    const rows = await run((tx) => tx`select lv.discord_interaction(${parsed.command!}, ${tx.json(ctx as postgres.JSONValue)}) as r`);
    const result = (rows[0]?.r ?? { ok: false, error: { code: "lv_server_error", message: "No result." } }) as Record<string, any>;
    let summary: { added: number; removed: number } | undefined;
    const guild = parsed.ctx.guild_id;
    if (result.ok && guild) {
      if (parsed.command === "verify") summary = await applyAndRecord(run, guild, parsed.ctx.user_id, { add: result.add ?? [], remove: result.remove ?? [] }, token);
      if (parsed.command === "unlink" && result.plan) await applyAndRecord(run, guild, parsed.ctx.user_id, { add: [], remove: result.plan.remove ?? [] }, token);
    }
    return reply(200, replyFor(parsed.command, result as { ok: boolean }, appUrl, summary));
  } catch {
    console.error("discord: interaction failed");
    return reply(200, ephemeral("LunchVoice could not handle that just now. Try again in a minute."));
  }
});
