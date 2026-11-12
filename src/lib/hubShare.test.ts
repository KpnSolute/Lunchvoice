import test from "node:test";
import assert from "node:assert/strict";
import { establishedLine, hubShareUrl, inviteMessage, memberLine } from "./hubShare";

test("share links use the preview path", () => {
  assert.equal(hubShareUrl("kitchen"), "https://hub.lunchvoice.com/kitchen");
});

test("the invite message follows how people get in", () => {
  assert.equal(inviteMessage({ name: "Harbor Books", slug: "harbor", membership_mode: "open" }), "Join Harbor Books on LunchVoice: https://hub.lunchvoice.com/harbor");
  assert.match(inviteMessage({ name: "A", slug: "abc", membership_mode: "approval" }), /^Ask to join A/);
  assert.match(inviteMessage({ name: "A", slug: "abc", membership_mode: "invite_only" }), /^Take a look at A/);
});

test("member counts and the established date are never invented", () => {
  assert.equal(memberLine(1), "1 member");
  assert.equal(memberLine(1860), "1,860 members");
  assert.equal(establishedLine(null), null);
  assert.equal(establishedLine("not a date"), null);
  assert.equal(establishedLine("2026-11-03T10:00:00Z"), "Est. Nov 2026");
});
