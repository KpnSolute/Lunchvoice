// Registers the /lunchvoice slash command with Discord (bulk overwrite, idempotent).
//
//   node --import tsx scripts/discord-register-commands.mjs --dry-run      # print the payload, no network
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node --import tsx scripts/discord-register-commands.mjs
//   (optional DISCORD_GUILD_ID=... registers for one test server only, which updates instantly)
//
// The command definitions live in supabase/functions/_shared/discord.ts so the bot and the registration never drift.
// Reads secrets from the environment only; never prints them. Exit codes: 0 ok, 1 Discord refused, 2 bad setup.
import { pathToFileURL } from "node:url";

const DISCORD_API = "https://discord.com/api/v10";

export function registrationRequest(env, definitions) {
  const app = env.DISCORD_APPLICATION_ID ?? "";
  const token = env.DISCORD_BOT_TOKEN ?? "";
  const guild = env.DISCORD_GUILD_ID ?? "";
  if (!/^[0-9]{5,25}$/.test(app)) return { ok: false, error: "DISCORD_APPLICATION_ID is missing or not a Discord id" };
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is missing" };
  if (guild && !/^[0-9]{5,25}$/.test(guild)) return { ok: false, error: "DISCORD_GUILD_ID is not a Discord id" };
  const url = guild ? `${DISCORD_API}/applications/${app}/guilds/${guild}/commands` : `${DISCORD_API}/applications/${app}/commands`;
  return { ok: true, url, init: { method: "PUT", headers: { authorization: `Bot ${token}`, "content-type": "application/json" }, body: JSON.stringify(definitions) } };
}

async function main() {
  const { COMMAND_DEFINITIONS } = await import("../supabase/functions/_shared/discord.ts");
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ ok: true, dry_run: true, commands: COMMAND_DEFINITIONS }, null, 2));
    return 0;
  }
  const req = registrationRequest(process.env, COMMAND_DEFINITIONS);
  if (!req.ok) { console.error(JSON.stringify({ ok: false, error: req.error })); return 2; }
  const res = await fetch(req.url, req.init);
  const out = { ok: res.ok, status: res.status, scope: process.env.DISCORD_GUILD_ID ? "guild" : "global" };
  console.log(JSON.stringify(out));
  return res.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code), () => { console.error(JSON.stringify({ ok: false, error: "unexpected failure" })); process.exit(2); });
}
