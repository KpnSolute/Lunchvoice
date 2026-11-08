import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationRequest } from "./discord-register-commands.mjs";

const defs = [{ name: "lunchvoice", options: [] }];

test("needs an application id and a bot token", () => {
  assert.equal(registrationRequest({}, defs).ok, false);
  assert.equal(registrationRequest({ DISCORD_APPLICATION_ID: "123456789012345678" }, defs).ok, false);
  assert.equal(registrationRequest({ DISCORD_APPLICATION_ID: "abc", DISCORD_BOT_TOKEN: "t" }, defs).ok, false);
});

test("global registration is a bulk PUT to the application commands", () => {
  const r = registrationRequest({ DISCORD_APPLICATION_ID: "123456789012345678", DISCORD_BOT_TOKEN: "test-token" }, defs);
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://discord.com/api/v10/applications/123456789012345678/commands");
  assert.equal(r.init.method, "PUT");
  assert.equal(r.init.headers.authorization, "Bot test-token");
  assert.deepEqual(JSON.parse(r.init.body), defs);
});

test("a test server id registers guild commands", () => {
  const r = registrationRequest({ DISCORD_APPLICATION_ID: "123456789012345678", DISCORD_BOT_TOKEN: "t", DISCORD_GUILD_ID: "900000000000000001" }, defs);
  assert.equal(r.url, "https://discord.com/api/v10/applications/123456789012345678/guilds/900000000000000001/commands");
});
