import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renderEmail, TEMPLATE_IDS } from "./email/templates.ts";
import { dispatchAuthorized, dispatchOnce, RESEND_ENDPOINT, type DispatchDb, type OutboxMessage } from "./email/dispatch.ts";

const RECEIPT = "0f1e2d3c-4b5a-4968-8776-655443322110";
const SAMPLES: Record<string, Record<string, unknown>> = {
  waitlist_joined: { status: "admitted", position: 3 },
  hub_created: { hub_name: "Harbor Book Circle", slug: "harbor-book-circle" },
  hub_invite: { hub_name: "Harbor Book Circle", slug: "harbor-book-circle", code: "A1B2C3D4E5F60718", inviter_name: "Dana", expires_at: "2026-12-01T00:00:00Z" },
  reservation_confirmed: { slug: "harbor-book-circle", expires_at: "2027-11-08T00:00:00Z" },
  reservation_expiring: { slug: "harbor-book-circle", expires_at: "2027-11-08T00:00:00Z" },
  reservation_grace: { slug: "harbor-book-circle", expires_at: "2027-11-08T00:00:00Z", grace_ends_at: "2027-12-03T00:00:00Z", grace_days: 25 },
  participation_receipt: { campaign_title: "Spring check-in", hub_name: "Harbor Book Circle", receipt_id: RECEIPT },
  shop_order: { hub_name: "Harbor Book Circle", item: "Tote bag", slug: "harbor-book-circle", pickup: "Front desk, Fridays" },
};

test("email: every template (E01-E08) renders a subject, a text part and an HTML part", () => {
  for (const id of TEMPLATE_IDS) {
    const r = renderEmail(id, SAMPLES[id]!);
    assert.ok(r, id);
    assert.ok(r.subject.length > 0 && r.text.length > 0 && r.html.startsWith("<!doctype html>"), id);
    assert.match(r.html, /<html lang="en">/, id);
  }
});

test("email: no tracking pixels, images, scripts or remote assets; links go to lunchvoice.com only", () => {
  for (const id of TEMPLATE_IDS) {
    const r = renderEmail(id, SAMPLES[id]!)!;
    assert.equal(/<img|<script|<link|url\(|<iframe/i.test(r.html), false, id);
    for (const href of r.html.matchAll(/href="([^"]+)"/g)) assert.ok(href[1]!.startsWith("https://lunchvoice.com/"), `${id}: ${href[1]}`);
  }
});

test("email: user-supplied names are escaped and cannot inject a header line", () => {
  const r = renderEmail("hub_created", { hub_name: "<b>Evil</b>\r\nBcc: x@y.z", slug: "evil-hub" })!;
  assert.equal(r.html.includes("<b>Evil</b>"), false);
  assert.ok(r.html.includes("&lt;b&gt;Evil&lt;/b&gt;"));
  assert.equal(/[\r\n]/.test(r.subject), false);
});

test("email: the participation receipt never contains an answer, even if one were in the payload", () => {
  const r = renderEmail("participation_receipt", { ...SAMPLES.participation_receipt, answers: [{ value: "my secret answer" }], value: "secret" })!;
  assert.equal(r.text.includes("secret"), false);
  assert.equal(r.html.includes("secret"), false);
  assert.match(r.text, /doesn't include what you answered/);
});

test("email: no template invents a price other than the canonical $25 reservation renewal", () => {
  for (const id of TEMPLATE_IDS) {
    const r = renderEmail(id, SAMPLES[id]!)!;
    for (const m of r.text.matchAll(/\$(\d+)/g)) assert.equal(m[1], "25", id);
  }
});

test("email: a payload missing what the template needs renders nothing (the message fails, it is not sent half-empty)", () => {
  assert.equal(renderEmail("hub_created", {}), null);
  assert.equal(renderEmail("hub_invite", { hub_name: "X" }), null);
  assert.equal(renderEmail("participation_receipt", { campaign_title: "X", receipt_id: "nope" }), null);
  assert.equal(renderEmail("marketing_blast", {}), null);
});

/* ---------------------------------------------------------------- dispatcher */

function fakeDb(messages: OutboxMessage[]) {
  const marks: [string, string, string | null | undefined][] = [];
  let claimed = false, swept = 0;
  const db: DispatchDb = {
    reservationSweep: async () => { swept++; },
    claim: async () => { claimed = true; return messages; },
    mark: async (id, result, error) => { marks.push([id, result, error]); },
    retention: async () => ({ deleted: 0, queued: messages.length }),
  };
  return { db, marks, get claimed() { return claimed; }, get swept() { return swept; } };
}
const msg = (id: string, template = "hub_created", payload = SAMPLES.hub_created!): OutboxMessage => ({ id, template, to: "owner@example.invalid", payload, attempts: 1 });

test("dispatch: without RESEND_API_KEY nothing is claimed and mail stays queued", async () => {
  const f = fakeDb([msg("m1")]);
  let fetched = 0;
  const r = await dispatchOnce({ env: () => undefined, fetch: (async () => { fetched++; return new Response("{}"); }) as typeof fetch, db: f.db });
  assert.deepEqual(r, { ok: true, provider: "none", claimed: 0, sent: 0, retried: 0, failed: 0, queued: 1 });
  assert.equal(f.claimed, false);
  assert.equal(fetched, 0);
  assert.equal(f.swept, 1);
});

test("dispatch: with a key, each message goes to Resend with an idempotency key and is marked by outcome", async () => {
  const f = fakeDb([msg("m1"), msg("m2"), msg("m3"), msg("m4", "hub_created", {})]);
  const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const statuses: Record<string, number> = { m1: 200, m2: 503, m3: 422 };
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = init.headers as Record<string, string>;
    seen.push({ url, headers, body });
    const id = headers["idempotency-key"]!.replace("lv-outbox-", "");
    return new Response(JSON.stringify({ id: `re_${id}` }), { status: statuses[id] ?? 200 });
  }) as unknown as typeof fetch;
  const env: Record<string, string> = { RESEND_API_KEY: "re_test_not_real", EMAIL_FROM: "LunchVoice <hello@mail.example.invalid>" };
  const r = await dispatchOnce({ env: (n) => env[n], fetch: fetcher, db: f.db });
  assert.deepEqual({ sent: r.sent, retried: r.retried, failed: r.failed, provider: r.provider }, { sent: 1, retried: 1, failed: 2, provider: "resend" });
  assert.deepEqual(f.marks.map(([id, result]) => `${id}:${result}`), ["m1:sent", "m2:retry", "m3:failed", "m4:failed"]);
  assert.equal(seen.length, 3, "an unrenderable message is never sent");
  assert.equal(seen[0]!.url, RESEND_ENDPOINT);
  assert.equal(seen[0]!.headers.authorization, "Bearer re_test_not_real");
  assert.equal(seen[0]!.body.from, "LunchVoice <hello@mail.example.invalid>");
  assert.deepEqual(seen[0]!.body.to, ["owner@example.invalid"]);
  assert.equal(seen[0]!.body.reply_to, "admin@lunchvoice.com", "replies reach the founder's inbox unless EMAIL_REPLY_TO says otherwise");
  assert.ok(typeof seen[0]!.body.text === "string" && typeof seen[0]!.body.html === "string");
});

test("dispatch: a network error is retried, never lost", async () => {
  const f = fakeDb([msg("m1")]);
  const r = await dispatchOnce({ env: (n) => (n === "RESEND_API_KEY" ? "re_x" : undefined), fetch: (async () => { throw new Error("down"); }) as typeof fetch, db: f.db });
  assert.equal(r.retried, 1);
  assert.deepEqual(f.marks[0], ["m1", "retry", "network"]);
});

test("dispatch: only the service role key (or the dispatch secret) may run it", () => {
  const env: Record<string, string> = { SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder" };
  const get = (n: string) => env[n];
  assert.equal(dispatchAuthorized("Bearer service-role-placeholder", get), true);
  assert.equal(dispatchAuthorized("Bearer anon-key", get), false);
  assert.equal(dispatchAuthorized(null, get), false);
  assert.equal(dispatchAuthorized("Bearer ", () => undefined), false, "an unset key never matches an empty bearer");
});

test("FB-05: an invite email says who sent it and how to report abuse", () => {
  const r = renderEmail("hub_invite", SAMPLES.hub_invite!)!;
  assert.match(r.text, /Dana of Harbor Book Circle sent this through LunchVoice/);
  assert.match(r.text, /report abuse, write to admin@lunchvoice\.com/);
  assert.match(r.html, /admin@lunchvoice\.com/);
});
