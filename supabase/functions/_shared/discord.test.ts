import { strict as assert } from "node:assert";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { applyRolePlan, buildCard, COMMAND_DEFINITIONS, isServerAdmin, parseInteraction, replyFor, verifyDiscordRequest, type Card } from "./discord.ts";

// A throwaway Ed25519 key pair generated for this test run; never a real Discord key.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB_HEX = Buffer.from(publicKey.export({ format: "der", type: "spki" })).subarray(-32).toString("hex");
const NOW = 1_800_000_000;
const BODY = JSON.stringify({ type: 1 });
const sigFor = (ts: string, body: string, key = privateKey) => sign(null, Buffer.from(ts + body), key).toString("hex");

test("a correctly signed Discord request verifies", async () => {
  assert.equal(await verifyDiscordRequest(PUB_HEX, sigFor(String(NOW), BODY), String(NOW), BODY, NOW), true);
});

test("tampered bodies, other keys, stale timestamps and malformed input fail", async () => {
  const ts = String(NOW);
  assert.equal(await verifyDiscordRequest(PUB_HEX, sigFor(ts, BODY), ts, BODY + " ", NOW), false);
  const other = generateKeyPairSync("ed25519").privateKey;
  assert.equal(await verifyDiscordRequest(PUB_HEX, sigFor(ts, BODY, other), ts, BODY, NOW), false);
  const old = String(NOW - 301);
  assert.equal(await verifyDiscordRequest(PUB_HEX, sigFor(old, BODY), old, BODY, NOW), false);
  assert.equal(await verifyDiscordRequest(PUB_HEX, "zz", ts, BODY, NOW), false);
  assert.equal(await verifyDiscordRequest(PUB_HEX, sigFor(ts, BODY), "abc", BODY, NOW), false);
  assert.equal(await verifyDiscordRequest(PUB_HEX, null, ts, BODY, NOW), false);
});

test("fails closed without DISCORD_PUBLIC_KEY", async () => {
  assert.equal(await verifyDiscordRequest(undefined, sigFor(String(NOW), BODY), String(NOW), BODY, NOW), false);
  assert.equal(await verifyDiscordRequest("", sigFor(String(NOW), BODY), String(NOW), BODY, NOW), false);
});

test("server admin detection from the permission bitfield", () => {
  assert.equal(isServerAdmin("8"), true);
  assert.equal(isServerAdmin("32"), true);
  assert.equal(isServerAdmin("2048"), false);
  assert.equal(isServerAdmin(undefined), false);
  assert.equal(isServerAdmin("not a number"), false);
});

const member = { user: { id: "300000000000000001", username: "runner" }, permissions: "8" };

test("parsing: ping, slash commands with options, and answer buttons", () => {
  assert.deepEqual(parseInteraction({ type: 1 }), { kind: "ping" });
  const p = parseInteraction({ type: 2, guild_id: "900000000000000001", channel_id: "910000000000000001", member,
    data: { name: "lunchvoice", options: [{ type: 1, name: "setup", options: [{ name: "rule", value: "team_hub" }, { name: "role", value: "500000000000000003" }] }] } });
  assert.equal(p.command, "setup");
  assert.deepEqual(p.ctx?.options, { fact: "team_hub", role: "500000000000000003" });
  assert.equal(p.ctx?.is_admin, true);
  const b = parseInteraction({ type: 3, guild_id: "900000000000000001", member: { ...member, permissions: "0" },
    data: { custom_id: "lv:answer:3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e:2" } });
  assert.equal(b.command, "answer");
  assert.deepEqual(b.ctx?.options, { campaign_id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", option: 2 });
  assert.equal(b.ctx?.is_admin, false);
  assert.equal(parseInteraction({ type: 3, member, data: { custom_id: "other" } }).kind, "unknown");
  assert.equal(parseInteraction({ type: 2, member, data: { name: "lunchvoice", options: [{ name: "drop_tables" }] } }).kind, "unknown");
});

const anon: Card = { campaign_id: "c1", title: "Winter social night", anonymity: "anonymous", join_code: "ABC123", answer_in_discord: false, options: null };
const poll: Card = { campaign_id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", title: "Pick the route", anonymity: "identified", join_code: "XYZ789",
  prompt: "Which route?", answer_in_discord: true, options: ["River", "Hills", "Park"] };

test("D-01: an anonymous Campaign card only links to the LunchVoice player", () => {
  const msg = buildCard(anon, "https://lunchvoice.com/");
  const buttons = (msg.components as { components: { style: number; url?: string; custom_id?: string }[] }[]).flatMap((r) => r.components);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].style, 5);
  assert.equal(buttons[0].url, "https://lunchvoice.com/c/ABC123");
  assert.equal(buttons.some((x) => x.custom_id), false);
  // Even if a card wrongly claimed answer_in_discord for an anonymous Campaign, no answer buttons are built.
  const forced = buildCard({ ...anon, answer_in_discord: true, options: ["Yes", "No"] }, "https://lunchvoice.com");
  assert.equal(JSON.stringify(forced).includes("lv:answer"), false);
});

test("an identified poll card carries one answer button per option plus the player link", () => {
  const msg = buildCard(poll, "https://lunchvoice.com");
  const rows = msg.components as { components: { custom_id?: string; label: string }[] }[];
  assert.deepEqual(rows[0].components.map((c) => c.custom_id), [0, 1, 2].map((i) => `lv:answer:${poll.campaign_id}:${i}`));
  assert.equal(rows[1].components[0].label, "Open in LunchVoice");
  assert.deepEqual(msg.allowed_mentions, { parse: [] });
});

test("replies are ephemeral and the link reply points at /connect/discord", () => {
  const r = replyFor("link", { ok: true, code: "ABCDEF" }, "https://lunchvoice.com") as { data: { content: string; flags: number } };
  assert.match(r.data.content, /https:\/\/lunchvoice\.com\/connect\/discord\?c=ABCDEF/);
  assert.equal(r.data.flags, 64);
  const e = replyFor("post", { ok: false, error: { code: "lv_forbidden", message: "Link first." } }, "https://lunchvoice.com") as { data: { content: string } };
  assert.equal(e.data.content, "Link first.");
});

test("role plans are applied through Discord REST with the bot token", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url} ${(init.headers as Record<string, string>).authorization}`);
    return new Response(null, { status: String(url).endsWith("500000000000000009") ? 404 : 204 });
  }) as unknown as typeof fetch;
  const r = await applyRolePlan(fakeFetch, "test-token", "900000000000000001", "300000000000000001",
    { add: ["500000000000000001", "bad"], remove: ["500000000000000009"] });
  assert.deepEqual(r, { added: ["500000000000000001"], removed: ["500000000000000009"] });
  assert.deepEqual(calls, [
    "PUT https://discord.com/api/v10/guilds/900000000000000001/members/300000000000000001/roles/500000000000000001 Bot test-token",
    "DELETE https://discord.com/api/v10/guilds/900000000000000001/members/300000000000000001/roles/500000000000000009 Bot test-token",
  ]);
});

test("the command definitions cover the six subcommands", () => {
  assert.deepEqual(COMMAND_DEFINITIONS[0].options.map((o) => o.name), ["link", "unlink", "verify", "connect", "post", "setup"]);
});
